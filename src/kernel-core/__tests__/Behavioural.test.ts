import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { GovernanceKernel } from '../Kernel.js';
import { IdentityManager, AuthorityEngine } from '../L1/Identity.js';
import { StateModel, MetricRegistry, MetricType } from '../L2/State.js';
import { ProtocolEngine } from '../L4/Protocol.js';
import { AuditLog } from '../L5/Audit.js';
import type { Action, KernelState } from '../L0/Ontology.js';
import { ErrorCode, KernelError } from '../Errors.js';
import { InvariantGuard } from '../L0/Guards.js';

describe('Behavioural Invariants & Control', () => {
    let kernel: GovernanceKernel;
    let identity: IdentityManager;
    let authority: AuthorityEngine;
    let state: StateModel;
    let protocols: ProtocolEngine;
    let audit: AuditLog;
    let registry: MetricRegistry;

    const ALICE = 'alice';
    const BOB = 'bob';

    beforeEach(() => {
        identity = new IdentityManager(); // No args
        registry = new MetricRegistry();

        // Mock Audit Store
        const mockStore = {
            getLatest: jest.fn<() => Promise<any>>().mockResolvedValue(null),
            append: jest.fn<() => Promise<any>>().mockResolvedValue({ evidenceId: 'audit_0' }),
            getHistory: jest.fn<() => Promise<any[]>>().mockResolvedValue([])
        };
        audit = new AuditLog(mockStore as any);

        state = new StateModel(audit, registry, identity);
        authority = new AuthorityEngine(identity);
        protocols = new ProtocolEngine(state);

        kernel = new GovernanceKernel(identity, authority, state, protocols, audit, registry);
        kernel.boot();

        // Register test metric
        registry.register({
            id: 'test.metric',
            description: 'Test Metric',
            type: 'GAUGE' as any // Cast to avoid import issue for now
        });

        // Setup Root Identity
        identity.register({
            id: 'root',
            publicKey: 'key_root',
            status: 'ACTIVE',
            createdAt: '0',
            type: 'SYSTEM',
            identityProof: 'GENESIS',
            isRoot: true
        });

        // Setup Identities
        // Entity interface requires: id, publicKey, createdAt, type, identityProof
        identity.register({
            id: ALICE,
            publicKey: 'key_alice',
            status: 'ACTIVE',
            createdAt: '0',
            type: 'ACTOR',
            identityProof: 'onchain_proof'
        });
        identity.register({
            id: BOB,
            publicKey: 'key_bob',
            status: 'ACTIVE',
            createdAt: '0',
            type: 'ACTOR',
            identityProof: 'onchain_proof'
        });

        // Grant Capability
        const timestamp = '0:0';
        authority.grant('auth1', 'root', ALICE, 'METRIC.WRITE:test.metric', '*', timestamp, 'GOVERNANCE_SIGNATURE');
    });

    const createAction = (initiator: string, payload: any): Action => ({
        actionId: `act:${Date.now()}:${Math.random()}`,
        initiator,
        payload: {
            metricId: 'test.metric',
            value: 10,
            ...payload
        },
        timestamp: '0:0', // Valid numeric
        expiresAt: '0',
        signature: 'TRUSTED' // Bypass SIG check for logic tests
    });

    test('1. Legible Boundaries: Invariant Violation Returns Structured Rejection', async () => {
        // Violate Resource Bound (Non-Finite Metric)
        const action = createAction(ALICE, { value: Infinity });
        const aid = await kernel.submitAttempt(ALICE, 'SYSTEM', action);

        const result = await kernel.guardAttempt(aid);

        expect(result.status).toBe('REJECTED');
        expect(typeof result.reason).toBe('object');

        const reason = result.reason as any;
        expect(reason.boundary).toBe('Resource Bounds');
        expect(reason.invariantId).toBe('INV-RES-01');
        expect(reason.permissible).toContain('finite numbers');
    });

    test('2. Pressure Instrumentation: Detects Repeated Violations', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

        const action = createAction(ALICE, { value: Infinity }); // Same violation

        // Trigger 6 times (Threshold is 5)
        for (let i = 0; i < 7; i++) {
            const aid = await kernel.submitAttempt(ALICE, 'SYSTEM', action);
            await kernel.guardAttempt(aid);
        }

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Pressure Alert'));
        consoleSpy.mockRestore();
    });

    test('3. Safe Rehearsal: Simulation Mode Does Not Commit State', async () => {
        const initialValue = 100;
        // Correctly pass evidenceId as 5th arg. 
        // Args: mutations, timestamp, initiator, actionId, evidenceId
        await state.applyTrusted(
            [{ metricId: 'test.metric', value: initialValue }],
            '0:0',
            'setup',
            'setup_action',
            'setup_ev_01'
        );

        // Rehearsal Action
        const action = createAction(ALICE, { value: 500, rehearsal: true });

        const result = await kernel.execute(action);

        expect(result.status).toBe('COMMITTED'); // It "commits" the rehearsal

        // System state should NOT change
        expect(state.get('test.metric')).toBe(initialValue);
    });

    test('4. Collective Constraint: Enforces Named Ownership', async () => {
        const action = createAction(ALICE, {
            value: 10,
            type: 'COLLECTIVE',
            // Missing owner, synthesizer, dissent
        });

        const aid = await kernel.submitAttempt(ALICE, 'SYSTEM', action);
        const result = await kernel.guardAttempt(aid);

        expect(result.status).toBe('REJECTED');
        const reason = result.reason as any;

        expect(reason.boundary).toBe('Collective Responsibility');
        expect(reason.message).toContain('Missing fields');
        expect(reason.permissible).toContain('Must specify owner');
    });

    test('4b. Collective Constraint: Accepts Valid Collective Action', async () => {
        const action = createAction(ALICE, {
            value: 10,
            type: 'COLLECTIVE',
            owner: ALICE,
            synthesizer: BOB,
            dissent: null
        });

        const aid = await kernel.submitAttempt(ALICE, 'SYSTEM', action);
        const result = await kernel.guardAttempt(aid);

        expect(result.status).toBe('ACCEPTED');
    });
});
