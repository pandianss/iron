import { jest, describe, test, expect } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { AuditLog } from '../../L5/Audit.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import type { Protocol } from '../../L4/Protocol.js';
import { Budget } from '../../L0/Kernel.js';

describe('Transaction Kernel', () => {
    test('should commit atomic multi-metric transitions', async () => {
        // 1. Setup
        const registry = new MetricRegistry();
        registry.register({ id: 'wealth', description: 'Primary', type: MetricType.COUNTER });
        registry.register({ id: 'reputation', description: 'Side Effect', type: MetricType.COUNTER });

        const identity = new IdentityManager();
        const alice = {
            id: 'alice',
            publicKey: 'pubkey',
            status: 'ACTIVE' as const,
            type: 'INDIVIDUAL' as any,
            createdAt: '0:0',
            identityProof: 'proof'
        };
        identity.register(alice);

        const audit = new AuditLog();
        const state = new StateModel(audit as any, registry, identity);
        const protocols = new ProtocolEngine(state);
        const authority = new AuthorityEngine(identity);
        authority.authorized = jest.fn().mockReturnValue(true) as any;

        const kernel = new GovernanceKernel(identity, authority, state, protocols, audit as any, registry);
        kernel.boot();

        // 2. Register Protocol with Side-Effect
        // When 'wealth' is mutated, also mutate 'reputation' by +1
        const protocol: Protocol = {
            id: 'wealth_protocol',
            name: 'Wealth Distribution',
            version: '1.0.0',
            category: 'Intent',
            lifecycle: 'ACTIVE',
            preconditions: [],
            execution: [
                { type: 'MUTATE_METRIC', metricId: 'reputation', mutation: 1 }
            ],
            // ProtocolPrimitive requirements
            triggerConditions: [],
            authorizedCapacities: [],
            stateTransitions: [],
            completionConditions: []
        };
        protocols['protocols'].set(protocol.id!, protocol); // Hack to inject protocol

        // 3. Execute Action
        const action = {
            actionId: 'act-001',
            initiator: 'alice',
            payload: { metricId: 'wealth', value: 100, protocolId: 'wealth_protocol' },
            timestamp: '1000:0',
            expiresAt: '2000:0',
            signature: 'TRUSTED'
        };

        const result = await kernel.execute(action as any, new Budget('ENERGY' as any, 100));

        // 4. Verify State
        expect(state.get('wealth')).toBe(100);
        expect(state.get('reputation')).toBe(1); // 0 + 1

        // 5. Verify Atomicity (Single Snapshot per Action + Genesis)
        const chain = state.getSnapshotChain();
        expect(chain.length).toBe(2); // Genesis + 1 Atomic Action

        const snapshot = chain[1];
        // Use 'as any' to bypass strict key checks if KernelState is typed generically
        const sState = snapshot.state as any;
        expect(sState.metrics['wealth'].value).toBe(100);
        expect(sState.metrics['reputation'].value).toBe(1);
        expect(snapshot.actionId).toBe('act-001');

        console.log("Atomic Snapshot Hash:", snapshot.hash);
    });
});
