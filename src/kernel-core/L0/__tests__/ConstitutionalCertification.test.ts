import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { AuditLog } from '../../L5/Audit.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { CryptoEngine, hash } from '../../L0/Crypto.js';
import type { Action, ActionPayload } from '../Ontology.js';

describe('M2.3 Constitutional Certification', () => {
    let kernel: GovernanceKernel;
    let identity: IdentityManager;
    let authority: AuthorityEngine;
    let state: StateModel;
    let protocols: ProtocolEngine;
    let audit: AuditLog;
    let registry: MetricRegistry;

    const ALICE_ID = 'alice';
    const BOB_ID = 'bob';
    const WEALTH_METRIC = 'wealth';
    const HEALTH_METRIC = 'health';

    let aliceKeys: { publicKey: string, privateKey: string };

    beforeEach(() => {
        aliceKeys = CryptoEngine.generateKeyPair();

        registry = new MetricRegistry();
        registry.register({ id: WEALTH_METRIC, description: 'Wealth', type: MetricType.COUNTER });
        registry.register({ id: HEALTH_METRIC, description: 'Health', type: MetricType.COUNTER });

        identity = new IdentityManager();
        identity.register({
            id: ALICE_ID,
            type: 'ACTOR',
            identityProof: 'alice-proof',
            status: 'ACTIVE',
            publicKey: aliceKeys.publicKey,
            createdAt: '0:0'
        });
        identity.register({
            id: BOB_ID,
            type: 'ACTOR',
            identityProof: 'bob-proof',
            status: 'ACTIVE',
            publicKey: 'bob-pub',
            createdAt: '0:0'
        });

        authority = new AuthorityEngine(identity);
        authority.authorized = jest.fn().mockReturnValue(true) as any;

        audit = new AuditLog();
        state = new StateModel(audit as any, registry, identity);
        protocols = new ProtocolEngine(state);

        // Register a generic protocol for basic tests
        protocols.propose({
            id: 'CORE',
            name: 'Core Protocol',
            category: 'Performance',
            lifecycle: 'PROPOSED',
            preconditions: [],
            execution: []
        } as any);
        protocols.ratify('CORE', 'GOVERNANCE_SIGNATURE');
        protocols.activate('CORE');

        kernel = new GovernanceKernel(identity, authority, state, protocols, audit as any, registry);
        kernel.boot();
    });

    const createSignedAction = (initiator: string, payload: ActionPayload, keys: { privateKey: string }): Action => {
        const now = Date.now();
        const timestamp = `${now}:0`;
        const expiresAt = `${now + 3600000}:0`;
        const actionId = `action-${Math.random().toString(36).substr(2, 9)}`;

        return {
            actionId,
            initiator,
            payload,
            timestamp,
            expiresAt,
            signature: 'TRUSTED'
        };
    };

    describe('R4: Action Monotonicity (Replay Protection)', () => {
        test('Should reject the same action twice', async () => {
            const action = createSignedAction(ALICE_ID, { metricId: WEALTH_METRIC, value: 10, protocolId: 'CORE' }, aliceKeys);

            const res1 = await kernel.execute(action);
            expect(res1.status).toBe('COMMITTED');

            await expect(kernel.execute(action)).rejects.toThrow('Replay Violation');
        });
    });

    describe('R1: Log-First Commit (Audit Completeness)', () => {
        test('Every accepted action must appear in the Audit Log', async () => {
            const action = createSignedAction(ALICE_ID, { metricId: WEALTH_METRIC, value: 50, protocolId: 'CORE' }, aliceKeys);

            await kernel.execute(action);

            const history = await audit.getHistory();
            const entries = history.filter((e: any) => e.action.actionId === action.actionId);
            expect(entries.length).toBeGreaterThan(0);
            expect(entries.some((e: any) => e.status === 'SUCCESS')).toBe(true);
        });
    });

    describe('R6: Capacity-Only Execution (Jurisdictional Authority)', () => {
        test('Should reject action if authority denies authorization', async () => {
            const action = createSignedAction(ALICE_ID, { metricId: WEALTH_METRIC, value: 100, protocolId: 'CORE' }, aliceKeys);

            authority.authorized = jest.fn().mockReturnValue(false) as any;

            await expect(kernel.execute(action)).rejects.toThrow('Authority Violation');
        });

        test('Should allow action if authority grants authorization', async () => {
            const action = createSignedAction(ALICE_ID, { metricId: WEALTH_METRIC, value: 100, protocolId: 'CORE' }, aliceKeys);

            authority.authorized = jest.fn().mockReturnValue(true) as any;

            const res = await kernel.execute(action);
            expect(res.status).toBe('COMMITTED');
        });
    });

    describe('R2: All-or-Nothing (Atomicity)', () => {
        test('Atomic multi-metric transaction should succeed completely', async () => {
            protocols.propose({
                id: 'MULTI',
                name: 'Multi Metric Protocol',
                category: 'Performance',
                lifecycle: 'PROPOSED',
                preconditions: [],
                execution: [
                    { type: 'MUTATE_METRIC', metricId: WEALTH_METRIC, mutation: 10 },
                    { type: 'MUTATE_METRIC', metricId: HEALTH_METRIC, mutation: 5 }
                ]
            } as any);
            protocols.ratify('MULTI', 'GOVERNANCE_SIGNATURE');
            protocols.activate('MULTI');

            const action = createSignedAction(ALICE_ID, { metricId: WEALTH_METRIC, value: 0, protocolId: 'MULTI' }, aliceKeys);

            const startWealth = state.get(WEALTH_METRIC) || 0;
            const startHealth = state.get(HEALTH_METRIC) || 0;

            await kernel.execute(action);

            expect(state.get(WEALTH_METRIC) || 0).toBe(startWealth + 10);
            expect(state.get(HEALTH_METRIC) || 0).toBe(startHealth + 5);
        });

        test('Atomic multi-metric transaction should fail completely if validation fails', async () => {
            const spy = jest.spyOn(state, 'validateMutation').mockImplementation((m: any) => {
                if (m.metricId === HEALTH_METRIC) throw new Error('SIMULATED_VALIDATION_FAILURE');
            });

            protocols.propose({
                id: 'ATOMIC_FAILURE',
                name: 'Atomic Failure Protocol',
                category: 'Performance',
                lifecycle: 'PROPOSED',
                preconditions: [],
                execution: [
                    { type: 'MUTATE_METRIC', metricId: WEALTH_METRIC, mutation: 10 },
                    { type: 'MUTATE_METRIC', metricId: HEALTH_METRIC, mutation: 5 }
                ]
            } as any);
            protocols.ratify('ATOMIC_FAILURE', 'GOVERNANCE_SIGNATURE');
            protocols.activate('ATOMIC_FAILURE');

            // Use a unique metric or specific protocol to avoid conflict with 'CORE' if it were somehow alive
            const action = createSignedAction(ALICE_ID, { metricId: WEALTH_METRIC, value: 0, protocolId: 'ATOMIC_FAILURE' }, aliceKeys);

            const startWealth = state.get(WEALTH_METRIC) || 0;

            await expect(kernel.execute(action)).rejects.toThrow('SIMULATED_VALIDATION_FAILURE');

            expect(state.get(WEALTH_METRIC) || 0).toBe(startWealth);

            spy.mockRestore();
        });
    });
});
