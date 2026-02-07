import { jest, describe, test, expect } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { AuditLog } from '../../L5/Audit.js';
import { ReplayEngine } from '../Replay.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import type { Action, Mutation } from '../../L0/Ontology.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { Budget } from '../../L0/Primitives.js';

describe('Audit & Replay Integration', () => {
    test('should reconstruct state perfectly from AuditLog', async () => {
        // 1. Setup Original Kernel
        const registry = new MetricRegistry();
        registry.register({ id: 'wealth', description: 'test', type: MetricType.COUNTER });

        const identity = new IdentityManager();
        const alice = {
            id: 'alice',
            publicKey: 'pubkey',
            status: 'ACTIVE' as const,
            type: 'ACTOR' as any,
            createdAt: '1000:0',
            identityProof: 'proof'
        };
        identity.register(alice);

        const protocols = new ProtocolEngine(null as any); // Simple mock
        const audit = new AuditLog();
        const state = new StateModel(audit as any, registry, identity);

        // Re-inject state into protocols if needed, but for this test we mock evaluate
        const authority = new AuthorityEngine(identity);

        const kernel = new GovernanceKernel(identity, authority, state, protocols, audit as any, registry);
        kernel.boot();

        // Setup Authority
        (authority as any).authorized = jest.fn().mockReturnValue(true);

        // 2. Execute Actions
        const actions = [
            { id: 'act1', val: 100, ts: '1000:0' },
            { id: 'act2', val: 200, ts: '1001:0' },
            { id: 'act3', val: 150, ts: '1002:0' }
        ];

        for (const a of actions) {
            const action = {
                actionId: a.id,
                initiator: 'alice',
                payload: { metricId: 'wealth', value: a.val },
                timestamp: a.ts,
                expiresAt: '2000:0',
                signature: 'TRUSTED'
            };
            await kernel.execute(action as any, new Budget('ENERGY' as any, 100));
        }

        const originalWealth = kernel.state.get('wealth');
        const originalSnapshots = kernel.state.getSnapshotChain();
        const originalTipHash = originalSnapshots[originalSnapshots.length - 1]?.hash;

        console.log("Original Snapshots:", originalSnapshots.map(s => s.hash));

        expect(originalWealth).toBe(150);

        // 3. Setup Secondary Kernel & Replay
        const registry2 = new MetricRegistry();
        registry2.register({ id: 'wealth', description: 'test', type: MetricType.COUNTER });

        const identity2 = new IdentityManager();
        identity2.register(alice);

        const audit2 = new AuditLog();
        const state2 = new StateModel(audit2 as any, registry2, identity2);
        const kernel2 = new GovernanceKernel(identity2, new AuthorityEngine(identity2), state2, new ProtocolEngine(state2), audit2 as any, registry2);
        kernel2.boot();

        const replayer = new ReplayEngine();
        await replayer.replay(audit as any, kernel2);

        // 4. Verification
        const replayedWealth = kernel2.state.get('wealth');
        const replayedSnapshots = kernel2.state.getSnapshotChain();
        const replayedTipHash = replayedSnapshots[replayedSnapshots.length - 1]?.hash;

        expect(replayedWealth).toBe(originalWealth);
        expect(replayedTipHash).toBe(originalTipHash);
        expect(replayedSnapshots.length).toBe(originalSnapshots.length);

        console.log(`[Test] Integration Success: Replayed ${replayedSnapshots.length} snapshots.`);
    });
});
