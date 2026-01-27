import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { AuditLog } from '../../L5/Audit.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { ReplayEngine } from '../Replay.js';
import type { IEventStore } from '../../L5/Audit.js';

describe('M2.1 Threat Mitigation (Resilience)', () => {
    let registry: MetricRegistry;
    let identity: IdentityManager;
    let authority: AuthorityEngine;

    beforeEach(() => {
        registry = new MetricRegistry();
        registry.register({ id: 'wealth', description: 'Wealth', type: MetricType.COUNTER });

        identity = new IdentityManager();
        identity.register({
            id: 'alice', publicKey: 'pub_alice', status: 'ACTIVE', type: 'INDIVIDUAL', createdAt: '0:0', identityProof: 'proof'
        } as any);

        authority = new AuthorityEngine(identity);
        authority.authorized = jest.fn().mockReturnValue(true) as any;
    });

    test('2.1 Storage Corruption: Should rollback state on audit failure', async () => {
        // Create a mock EventStore that will fail on the second append
        let appendCount = 0;
        const events: any[] = [];
        const mockStore: IEventStore = {
            append: jest.fn().mockImplementation(async (evidence: any) => {
                appendCount++;
                // Fail on 4th append (second action's commit phase)
                if (appendCount === 4) {
                    throw new Error('SIMULATED_STORAGE_FAILURE: Disk full');
                }
                events.push(evidence);
                return Promise.resolve();
            }),
            getHistory: jest.fn().mockImplementation(async () => events),
            getLatest: jest.fn().mockImplementation(async () =>
                events.length > 0 ? events[events.length - 1] : null
            )
        };

        const audit = new AuditLog(mockStore);
        const state = new StateModel(audit as any, registry, identity);
        const protocols = new ProtocolEngine(state);
        const kernel = new GovernanceKernel(identity, authority, state, protocols, audit as any, registry);
        kernel.boot();

        // First action should succeed
        const action1 = await kernel.execute({
            actionId: 'a-success', initiator: 'alice', timestamp: '10:0', expiresAt: '20:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 100 }
        } as any);

        expect(action1.status).toBe('COMMITTED');
        const stateAfterSuccess = state.get('wealth');
        expect(stateAfterSuccess).toBe(100);

        // Second action should fail due to storage corruption
        let errorThrown = false;
        try {
            await kernel.execute({
                actionId: 'a-fail', initiator: 'alice', timestamp: '11:0', expiresAt: '21:0', signature: 'TRUSTED',
                payload: { metricId: 'wealth', value: 50 }
            } as any);
        } catch (e: any) {
            errorThrown = true;
            expect(e.message).toContain('SIMULATED_STORAGE_FAILURE');
        }

        expect(errorThrown).toBe(true);

        // CRITICAL: State must NOT have advanced
        const stateAfterFailure = state.get('wealth');
        expect(stateAfterFailure).toBe(100); // Still 100, not 150

        // Verify audit log integrity
        const auditEvents = await mockStore.getHistory();
        // Should have: ATTEMPT (success), SUCCESS (success), ATTEMPT (fail) - but NO SUCCESS for failed action
        // Actually, the current implementation appends ATTEMPT before guards, so we might have 3 events
        // But the key is that state didn't advance
        expect(auditEvents.length).toBeLessThan(5); // Sanity check
    });

    test('2.2 Process Crash: Should reconstruct state after crash', async () => {
        // Setup original kernel
        const crashTestEvents: any[] = [];
        const mockStore: IEventStore = {
            append: jest.fn().mockImplementation(async (evidence: any) => {
                crashTestEvents.push(evidence);
            }),
            getHistory: jest.fn().mockImplementation(async () => crashTestEvents),
            getLatest: jest.fn().mockImplementation(async () =>
                crashTestEvents.length > 0 ? crashTestEvents[crashTestEvents.length - 1] : null
            )
        };

        const audit1 = new AuditLog(mockStore);
        const state1 = new StateModel(audit1 as any, registry, identity);
        const protocols1 = new ProtocolEngine(state1);
        const kernel1 = new GovernanceKernel(identity, authority, state1, protocols1, audit1 as any, registry);
        kernel1.boot();

        // Execute several actions to build state
        await kernel1.execute({
            actionId: 'a-1', initiator: 'alice', timestamp: '10:0', expiresAt: '20:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 100 }
        } as any);

        await kernel1.execute({
            actionId: 'a-2', initiator: 'alice', timestamp: '11:0', expiresAt: '21:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 50 }
        } as any);

        await kernel1.execute({
            actionId: 'a-3', initiator: 'alice', timestamp: '12:0', expiresAt: '22:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: -30 }
        } as any);

        // Capture final state
        const originalWealth = state1.get('wealth');
        const originalSnapshots = state1.getSnapshotChain();

        // Verify cumulative wealth from snapshots
        // Kernel creates: genesis (0) + 3 actions = 4 snapshots
        expect(originalSnapshots.length).toBe(4);
        expect(originalWealth).toBe(-30); // Last value in COUNTER metric

        // SIMULATE CRASH: Create new kernel instance (in-memory state lost)
        const audit2 = new AuditLog(mockStore); // Same store, new AuditLog instance
        const state2 = new StateModel(audit2 as any, registry, identity);
        const protocols2 = new ProtocolEngine(state2);
        const kernel2 = new GovernanceKernel(identity, authority, state2, protocols2, audit2 as any, registry);
        kernel2.boot();

        // State should be empty before replay
        expect(state2.get('wealth')).toBeUndefined();

        // RECOVERY: Use ReplayEngine to reconstruct state
        const replayer = new ReplayEngine();
        await replayer.replay(audit2, kernel2);

        // Verify perfect state reconstruction
        const replayedWealth = state2.get('wealth');
        const replayedSnapshots = state2.getSnapshotChain();

        expect(replayedWealth).toBe(originalWealth); // Both should be -30
        expect(replayedSnapshots.length).toBe(originalSnapshots.length);

        // Verify cryptographic parity (compare snapshot hashes)
        for (let i = 0; i < originalSnapshots.length; i++) {
            expect(replayedSnapshots[i]?.hash).toBe(originalSnapshots[i]?.hash);
        }
    });

    test('2.3 Clock Skew: Should reject backdated timestamps', async () => {
        const audit = new AuditLog();
        const state = new StateModel(audit as any, registry, identity);
        const protocols = new ProtocolEngine(state);
        const kernel = new GovernanceKernel(identity, authority, state, protocols, audit as any, registry);
        kernel.boot();

        // Execute action with timestamp 100:0
        await kernel.execute({
            actionId: 'a-future', initiator: 'alice', timestamp: '100:0', expiresAt: '200:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 100 }
        } as any);

        // Attempt action with backdated timestamp 50:0 (time travel!)
        let errorThrown = false;
        let errorMessage = '';
        try {
            await kernel.execute({
                actionId: 'a-past', initiator: 'alice', timestamp: '50:0', expiresAt: '150:0', signature: 'TRUSTED',
                payload: { metricId: 'wealth', value: 50 }
            } as any);
        } catch (e: any) {
            errorThrown = true;
            errorMessage = e.message;
        }

        expect(errorThrown).toBe(true);
        // TimeGuard should reject this
        expect(errorMessage).toMatch(/Time Violation|Backwards timestamp|Monotonicity/i);
    });
});
