import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { AuditLog } from '../../L5/Audit.js';
import { PluginRegistry } from '../PluginRegistry.js';
import { CryptoEngine, hash } from '../Crypto.js';
import type { PluginManifest, PluginCapability } from '../Plugin.js';
import type { Protocol } from '../../L4/ProtocolTypes.js';
import { PluginContext } from '../PluginContext.js';

describe('M2.4 Plugin Context & Capability Enforcement', () => {
    let kernel: GovernanceKernel;
    let identity: IdentityManager;
    let authority: AuthorityEngine;
    let protocols: ProtocolEngine;
    let audit: AuditLog;
    let registry: MetricRegistry;
    let state: StateModel;
    let pluginRegistry: PluginRegistry;

    let authorKeys: { publicKey: string; privateKey: string };
    const ALICE_ID = 'alice';
    const WEALTH_METRIC = 'wealth';

    beforeEach(() => {
        const keyPair = CryptoEngine.generateKeyPair();
        authorKeys = { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };

        registry = new MetricRegistry();
        // Register metric for validation
        registry.register({
            id: WEALTH_METRIC,
            description: 'Wealth',
            type: MetricType.GAUGE
        });

        identity = new IdentityManager();
        audit = new AuditLog({
            append: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
            getLatest: jest.fn<() => Promise<any>>().mockResolvedValue(null),
            getHistory: jest.fn<() => Promise<any[]>>().mockResolvedValue([])
        } as any);
        state = new StateModel(audit, registry, identity);
        authority = new AuthorityEngine(identity);
        pluginRegistry = new PluginRegistry();
        protocols = new ProtocolEngine(state, pluginRegistry);

        kernel = new GovernanceKernel(identity, authority, state, protocols, audit, registry, pluginRegistry);

        // Register default entity
        identity.register({
            id: ALICE_ID,
            type: 'ACTOR',
            identityProof: 'proof',
            status: 'ACTIVE',
            publicKey: 'key',
            createdAt: '0:0'
        } as any);
    });

    function createManifest(id: string, capabilities: PluginCapability[]): PluginManifest {
        const manifestWithoutSig = {
            id,
            name: id,
            version: '1.0.0',
            author: { id: 'author-1', publicKey: `ed25519:${authorKeys.publicKey}` },
            capabilities
        };
        const canonical = JSON.stringify(sortObject(manifestWithoutSig));
        const manifestHash = hash(canonical);
        const signature = CryptoEngine.sign(manifestHash, authorKeys.privateKey);
        return { ...manifestWithoutSig, signature: `ed25519:${signature}` } as PluginManifest;
    }

    function sortObject(obj: any): any {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => sortObject(item));
        const sorted: any = {};
        Object.keys(obj).sort().forEach(key => sorted[key] = sortObject(obj[key]));
        return sorted;
    }

    describe('Protocol Capability Bridge', () => {
        test('Should allow plugin with capability to register protocol targeting authorized metric', () => {
            const manifest = createManifest('p1', [{ type: 'protocol', targets: [WEALTH_METRIC] }]);
            pluginRegistry.register(manifest);
            pluginRegistry.verify('p1');
            pluginRegistry.ratify('p1', 'TRUSTED');
            pluginRegistry.activate('p1');

            const proto: Protocol = {
                id: 'transfer',
                name: 'Transfer',
                version: '1.0.0',
                category: 'Intent',
                lifecycle: 'ACTIVE',
                execution: [{ type: 'MUTATE_METRIC', metricId: WEALTH_METRIC, mutation: 10 }],
                preconditions: [{ type: 'ALWAYS' }],
                triggerConditions: [],
                authorizedCapacities: [],
                stateTransitions: [],
                completionConditions: []
            };

            expect(() => protocols.registerFromPlugin('p1', proto)).not.toThrow();
            protocols.ratify('transfer', 'GOVERNANCE_SIGNATURE');
            protocols.activate('transfer');
            expect(protocols.isRegistered('transfer')).toBe(true);
            expect(protocols.get('transfer')?.lifecycle).toBe('ACTIVE');
            expect(protocols.get('transfer')?.originPluginId).toBe('p1');
        });

        test('Should reject protocol if plugin lacks capability for a target metric', () => {
            const manifest = createManifest('p1', [{ type: 'protocol', targets: ['other_metric'] }]);
            pluginRegistry.register(manifest);
            pluginRegistry.verify('p1');
            pluginRegistry.ratify('p1', 'gov-sig');
            pluginRegistry.activate('p1');

            const proto: Protocol = {
                id: 'bad-proto',
                name: 'Bad',
                version: '1.0.0',
                category: 'Intent',
                lifecycle: 'ACTIVE',
                execution: [{ type: 'MUTATE_METRIC', metricId: WEALTH_METRIC, mutation: 10 }],
                preconditions: [{ type: 'ALWAYS' }],
                triggerConditions: [],
                authorizedCapacities: [],
                stateTransitions: [],
                completionConditions: []
            };

            expect(() => protocols.registerFromPlugin('p1', proto)).toThrow("not authorized to target metric wealth");
        });

        test('Should bypass evaluation if protocol plugin is REVOKED', async () => {
            const manifest = createManifest('p1', [{ type: 'protocol', targets: [WEALTH_METRIC] }]);
            pluginRegistry.register(manifest);
            pluginRegistry.verify('p1');
            pluginRegistry.ratify('p1', 'gov-sig');
            pluginRegistry.activate('p1');

            const proto: Protocol = {
                id: 'p-proto',
                name: 'P',
                version: '1.0.0',
                category: 'Intent',
                lifecycle: 'ACTIVE',
                execution: [{ type: 'MUTATE_METRIC', metricId: WEALTH_METRIC, mutation: 10 }],
                preconditions: [{ type: 'ALWAYS' }],
                triggerConditions: [],
                authorizedCapacities: [],
                stateTransitions: [],
                completionConditions: []
            };
            protocols.registerFromPlugin('p1', proto);
            protocols.ratify('p-proto', 'GOVERNANCE_SIGNATURE');
            protocols.activate('p-proto');

            // Mock state
            state.applyTrusted([{ metricId: WEALTH_METRIC, value: 0 }], '0:0', 'sys', 'act-0', 'ev-0');

            // 1. Verify it works when ACTIVE
            const mutations1 = protocols.evaluate('1:0' as any, { metricId: 'other', value: 0 });
            expect(mutations1.some(m => m.metricId === WEALTH_METRIC)).toBe(true);

            // 2. Revoke plugin
            pluginRegistry.revoke('p1', 'Security breach');

            // 3. Verify it is bypassed
            const mutations2 = protocols.evaluate('2:0' as any, { metricId: 'other', value: 0 });
            expect(mutations2.some(m => m.metricId === WEALTH_METRIC)).toBe(false);
        });
    });

    describe('Guard Capability Bridge', () => {
        test('Should allow plugin with capability to register guard for authorized phase', () => {
            const manifest = createManifest('g1', [{ type: 'guard', phase: 'SIGNATURE' }]);
            pluginRegistry.register(manifest);
            pluginRegistry.verify('g1');
            pluginRegistry.ratify('g1', 'gov-sig');
            pluginRegistry.activate('g1');

            const mockGuard = jest.fn().mockReturnValue({ ok: true });

            // Access private guards for testing or use evaluate
            const guards = (kernel as any).guards;
            expect(() => guards.registerFromPlugin('g1', 'SIGNATURE', 'CustomGuard', mockGuard)).not.toThrow();
        });

        test('Should reject guard if plugin lacks capability for that phase', () => {
            const manifest = createManifest('g1', [{ type: 'guard', phase: 'TIME' }]);
            pluginRegistry.register(manifest);
            pluginRegistry.verify('g1');
            pluginRegistry.ratify('g1', 'gov-sig');
            pluginRegistry.activate('g1');

            const mockGuard = jest.fn().mockReturnValue({ ok: true });
            const guards = (kernel as any).guards;

            expect(() => guards.registerFromPlugin('g1', 'SIGNATURE', 'CustomGuard', mockGuard))
                .toThrow("does not have 'guard' capability for phase SIGNATURE");
        });

        test('Should bypass guard execution if plugin is not ACTIVE', () => {
            const manifest = createManifest('g1', [{ type: 'guard', phase: 'SIGNATURE' }]);
            pluginRegistry.register(manifest);
            pluginRegistry.verify('g1');
            pluginRegistry.ratify('g1', 'TRUSTED');
            pluginRegistry.activate('g1');

            const mockGuard = jest.fn().mockReturnValue({ ok: false, violation: 'Plugin says NO' });
            const guards = (kernel as any).guards;
            guards.registerFromPlugin('g1', 'SIGNATURE', 'CustomGuard', mockGuard);

            const testCtx = { intent: { initiator: ALICE_ID, signature: 'TRUSTED' }, manager: identity };

            // 1. Verify it fails when ACTIVE
            // Note: evaluate runs ALL guards for that phase.
            // Signature phase already has SignatureGuard (system).
            const res1 = guards.evaluate('SIGNATURE', testCtx);
            expect(res1.ok).toBe(false);
            expect(res1.violation).toBe('Plugin says NO');
            expect(mockGuard).toHaveBeenCalled();

            // 2. Deactivate plugin (via revocation for test)
            pluginRegistry.revoke('g1', 'Off');
            mockGuard.mockClear();

            // 3. Verify it is bypassed (registry defaults to OK if plugin inactive)
            const res2 = guards.evaluate('SIGNATURE', testCtx);
            expect(res2.ok).toBe(true);
            expect(mockGuard).not.toHaveBeenCalled();
        });
    });

    describe('Plugin Context API Access', () => {
        test('Guard should have access to restricted state and audit via context', () => {
            const manifest = createManifest('ctx1', [{ type: 'guard', phase: 'SIGNATURE' }]);
            pluginRegistry.register(manifest);
            pluginRegistry.verify('ctx1');
            pluginRegistry.ratify('ctx1', 'gov-sig');
            pluginRegistry.activate('ctx1');

            const ctx = new PluginContext(manifest, state, audit);

            expect(ctx.stateAPI.get(WEALTH_METRIC)).toBeUndefined();
            state.applyTrusted([{ metricId: WEALTH_METRIC, value: 500 }], '0:0', 'sys', 'act-0', 'ev-0');
            expect(ctx.stateAPI.get(WEALTH_METRIC)).toBe(500);
        });
    });
});
