import { describe, it, expect, beforeEach } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { AuditLog } from '../../L5/Audit.js';
import { ActionFactory } from '../../L2/ActionFactory.js';
import { generateKeyPair } from '../../L0/Crypto.js';

describe('Friction Layer (Behavioral Constitution Guards)', () => {
    let audit: AuditLog;
    let registry: MetricRegistry;
    let identity: IdentityManager;
    let authority: AuthorityEngine;
    let state: StateModel;
    let protocols: ProtocolEngine;
    let kernel: GovernanceKernel;

    const rootKeys = Array.from({ length: 5 }, () => generateKeyPair());
    const rootEntities = rootKeys.map((k, i) => ({
        id: `root.${i + 1}`,
        publicKey: k.publicKey,
        type: 'ACTOR',
        status: 'ACTIVE',
        isRoot: true
    }));

    beforeEach(async () => {
        audit = new AuditLog();
        registry = new MetricRegistry();
        identity = new IdentityManager();
        identity.register({ id: 'system', status: 'ACTIVE', publicKey: 'SYS', type: 'ACTOR', isRoot: true } as any);
        rootEntities.forEach(e => identity.register(e as any));

        authority = new AuthorityEngine(identity);
        // Grant all root entities OVERRIDE permission
        rootEntities.forEach(e => {
            authority.grant(`auth-${e.id}`, 'system', e.id, 'GOVERNANCE:OVERRIDE', 'GLOBAL' as any, '0:0', 'GOVERNANCE_SIGNATURE');
        });

        state = new StateModel(audit, registry, identity);
        protocols = new ProtocolEngine(state);
        kernel = new GovernanceKernel(identity, authority, state, protocols, audit, registry);
        kernel.boot();

        registry.register({ id: 'temp', description: 'Temp', type: MetricType.GAUGE });
    });

    describe('ProposalCooldownGuard', () => {
        it('should block ratification before 24h cooldown', () => {
            const p = {
                id: 'p-new',
                name: 'New Protocol',
                version: '1.0',
                category: 'Habit',
                lifecycle: 'PROPOSED',
                execution: [],
                preconditions: []
            } as any;

            const now = Date.now();
            protocols.propose(p, `${now}:0`);

            // Attempt to ratify 1 hour later (should fail)
            const oneHourLater = now + (3600 * 1000);
            expect(() => {
                protocols.ratify('p-new', 'standard-sig', `${oneHourLater}:0`);
            }).toThrow(/Deliberation Latency Required/);
        });

        it('should allow ratification after 24h cooldown', () => {
            const p = {
                id: 'p-new',
                name: 'New Protocol',
                version: '1.0',
                category: 'Habit',
                lifecycle: 'PROPOSED',
                execution: [],
                preconditions: []
            } as any;

            const now = Date.now();
            protocols.propose(p, `${now}:0`);

            // Attempt to ratify 25 hours later (should succeed)
            const twentyFiveHoursLater = now + (25 * 3600 * 1000);
            protocols.ratify('p-new', 'standard-sig', `${twentyFiveHoursLater}:0`);

            expect(protocols.get('p-new')?.lifecycle).toBe('RATIFIED');
        });

        it('should bypass cooldown with TRUSTED/SIM signature', () => {
            const p = {
                id: 'p-new',
                name: 'New Protocol',
                version: '1.0',
                category: 'Habit',
                lifecycle: 'PROPOSED',
                execution: [],
                preconditions: []
            } as any;

            const now = Date.now();
            protocols.propose(p, `${now}:0`);

            // Ratify immediately with TRUSTED (should succeed)
            protocols.ratify('p-new', 'TRUSTED', `${now}:0`);
            expect(protocols.get('p-new')?.lifecycle).toBe('RATIFIED');
        });
    });

    describe('IrreversibilityGuard', () => {
        it('should block irreversible action without 2 approval signatures', async () => {
            const { signData, canonicalize } = await import('../../L0/Crypto.js');

            const payload = { metricId: 'temp', value: 100, irreversible: true };
            const timestamp = '0:0';
            const expiresAt = '0';
            const actionId = 'act-irr';

            const data = `${actionId}:root.1:${canonicalize(payload)}:${timestamp}:${expiresAt}`;
            const signature = signData(data, rootKeys[0]!.privateKey);

            const action = {
                actionId,
                initiator: 'root.1',
                payload,
                timestamp,
                expiresAt,
                signature
            };

            const aid = await kernel.submitAttempt('root.1', 'SYSTEM', action as any);
            const result = await kernel.guardAttempt(aid);

            expect(result.status).toBe('REJECTED');
            expect(result.reason).toContain('Irreversible action requires 2 approvals');
        });

        it('should allow normal action with single signature', async () => {
            const action = ActionFactory.create(
                'temp',
                100,
                'root.1',
                rootKeys[0]!.privateKey
            );

            const aid = await kernel.submitAttempt('root.1', 'SYSTEM', action);
            const result = await kernel.guardAttempt(aid);

            expect(result.status).toBe('ACCEPTED');
        });
    });

    describe('MultiSigGuard', () => {
        it('should block override without 3 signatures', async () => {
            const action = ActionFactory.create(
                'temp',
                200,
                'root.1',
                rootKeys[0]!.privateKey
            );

            // Only 1 signature provided (from the action itself)
            await expect(kernel.override(action, 'Emergency')).rejects.toThrow(/Requires 3 signatures/);
        });

        it('should allow override with 3 valid root signatures', async () => {
            const action = ActionFactory.create(
                'temp',
                200,
                'root.1',
                rootKeys[0]!.privateKey
            );

            // Generate 3 signatures from authorized signers
            const rawData = `${action.actionId}:${action.initiator}:{"metricId":"temp","value":200}:${action.timestamp}:${action.expiresAt}`;

            // Wait, I need to use the exact same logic as Guards.ts for data canonicalization
            // In Guards.ts:
            // const data = `${action.actionId}:${action.initiator}:${canonicalize(action.payload)}:${action.timestamp}:${action.expiresAt}`;

            const { signData, canonicalize } = await import('../../L0/Crypto.js');
            const data = `${action.actionId}:${action.initiator}:${canonicalize(action.payload)}:${action.timestamp}:${action.expiresAt}`;

            const sig1 = signData(data, rootKeys[0]!.privateKey);
            const sig2 = signData(data, rootKeys[1]!.privateKey);
            const sig3 = signData(data, rootKeys[2]!.privateKey);

            const commit = await kernel.override(action, 'Emergency', [sig1, sig2, sig3]);
            expect(commit.status).toBe('COMMITTED');
            expect(state.get('temp')).toBe(200);
        });
    });
});
