import { jest, describe, test, expect } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { AuditLog } from '../../L5/Audit.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { ReplayEngine } from '../../L0/Replay.js';
import { ProjectionEngine } from '../Projections.js';
import type { Projection } from '../Projections.js';
import type { Evidence } from '../../L5/Audit.js';

// --- Custom Projection ---
class BalanceSheetProjection implements Projection<Record<string, number>> {
    public name = 'BalanceSheet';
    public version = '1.0.0';
    private balances: Record<string, number> = {};

    reset() { this.balances = {}; }

    apply(ev: Evidence) {
        if (ev.status === 'SUCCESS' && ev.action.payload.metricId === 'wealth') {
            const user = ev.action.initiator;
            const amount = Number(ev.action.payload.value);
            this.balances[user] = (this.balances[user] || 0) + amount;
        }
    }

    getState() { return { ...this.balances }; }
}

describe('W4.2: Full Audit Reconstruction', () => {
    test('should rebuild Kernel State and Projections purely from Audit Log', async () => {
        // --- PHASE 1: THE REALITY ---
        const registry = new MetricRegistry();
        registry.register({ id: 'wealth', description: 'Wealth', type: MetricType.COUNTER });

        const identity = new IdentityManager();
        identity.register({ id: 'alice', publicKey: 'pub_alice', status: 'ACTIVE', type: 'INDIVIDUAL', createdAt: '0:0', identityProof: 'proof' } as any);
        identity.register({ id: 'bob', publicKey: 'pub_bob', status: 'ACTIVE', type: 'INDIVIDUAL', createdAt: '0:0', identityProof: 'proof' } as any);

        const authority = new AuthorityEngine(identity);
        authority.authorized = jest.fn().mockReturnValue(true) as any;

        const audit = new AuditLog(); // In-memory store
        const state = new StateModel(audit as any, registry, identity);
        const protocols = new ProtocolEngine(state);

        const kernel = new GovernanceKernel(identity, authority, state, protocols, audit as any, registry);
        kernel.boot();

        // Projections (Live)
        const projEngine = new ProjectionEngine();
        const liveSheet = new BalanceSheetProjection();
        projEngine.register(liveSheet);

        // Execute Actions
        // 1. Alice gets 100
        await kernel.execute({
            actionId: 'a1', initiator: 'alice', timestamp: '10:0', expiresAt: '20:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 100 }
        } as any);
        projEngine.apply((await audit.getTip())!);

        // 2. Bob gets 50
        await kernel.execute({
            actionId: 'a2', initiator: 'bob', timestamp: '11:0', expiresAt: '21:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 50 }
        } as any);
        projEngine.apply((await audit.getTip())!);

        // 3. Alice gets 25 more
        await kernel.execute({
            actionId: 'a3', initiator: 'alice', timestamp: '12:0', expiresAt: '22:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 25 }
        } as any);
        projEngine.apply((await audit.getTip())!);

        // Capture State
        const finalKernelHash = state.getSnapshotChain().pop()?.hash;
        const finalProjectionState = liveSheet.getState();

        console.log("Phase 1 Complete. Final Hash:", finalKernelHash);
        expect(finalProjectionState['alice']).toBe(125);
        expect(finalProjectionState['bob']).toBe(50);


        // --- PHASE 2: THE RECONSTRUCTION ---
        console.log("Starting Reconstruction...");

        // clean slate
        const newRegistry = new MetricRegistry();
        newRegistry.register({ id: 'wealth', description: 'Wealth', type: MetricType.COUNTER });
        const newIdentity = new IdentityManager(); // Empty
        const newAuthority = new AuthorityEngine(newIdentity); // Empty
        const newState = new StateModel(new AuditLog() as any, newRegistry, newIdentity); // Fresh State
        const newKernel = new GovernanceKernel(newIdentity, newAuthority, newState, new ProtocolEngine(newState), new AuditLog() as any, newRegistry);

        // Re-register projections (fresh instance)
        const newProjEngine = new ProjectionEngine();
        const recoveredSheet = new BalanceSheetProjection();
        newProjEngine.register(recoveredSheet);

        // The Magic: Replay from the OLD audit log
        const replayer = new ReplayEngine();

        // We pass the OLD audit log, but the NEW kernel and NEW projection engine
        await replayer.replay(audit, newKernel, newProjEngine);

        // --- PHASE 3: VERIFICATION ---
        const reconstructedHash = newState.getSnapshotChain().pop()?.hash;
        const reconstructedProjectionState = recoveredSheet.getState();

        console.log("Reconstructed Hash:", reconstructedHash);

        // 1. Kernel State Parity
        expect(reconstructedHash).toBe(finalKernelHash);

        // 2. Projection Parity
        expect(reconstructedProjectionState).toEqual(finalProjectionState);
        expect(reconstructedProjectionState['alice']).toBe(125);
        expect(reconstructedProjectionState['bob']).toBe(50);

        console.log("SUCCESS: System fully reconstructed from Audit Log.");
    });
});
