import { GovernanceKernel } from '../../Kernel.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { AuditLog } from '../../L5/Audit.js';
import type { IEventStore, Evidence } from '../../L5/Audit.js';
import { ReplayEngine } from '../Replay.js';
import { ErrorCode } from '../../Errors.js';
import { generateKeyPair, signData, hash } from '../Crypto.js';
import type { Action } from '../Ontology.js';

// --- Partial Mock for Event Store ---
class MemoryEventStore implements IEventStore {
    private events: Evidence[] = [];

    async append(evidence: Evidence): Promise<void> {
        this.events.push(evidence);
    }
    async getHistory(): Promise<Evidence[]> {
        return [...this.events];
    }
    async getLatest(): Promise<Evidence | null> {
        return this.events.length > 0 ? this.events[this.events.length - 1]! : null;
    }
}

describe('M2.5 Persistence & Hardening', () => {
    let store: MemoryEventStore;
    let aliceKey: any;

    beforeAll(async () => {
        aliceKey = generateKeyPair();
    });

    beforeEach(() => {
        store = new MemoryEventStore();
    });

    async function createKernel(existingStore: MemoryEventStore) {
        const audit = new AuditLog(existingStore);
        const registry = new MetricRegistry();
        const identity = new IdentityManager();
        const authority = new AuthorityEngine(identity);
        const state = new StateModel(audit, registry, identity);
        const protocols = new ProtocolEngine(state);

        registry.register({
            id: 'test.counter',
            description: 'Test Counter',
            type: MetricType.COUNTER,
            validator: (v) => typeof v === 'number'
        });

        // Register Alice
        identity.register({
            id: 'alice',
            publicKey: aliceKey.publicKey,
            type: 'ACTOR',
            identityProof: 'genesis', // Genesis entities are pseudo-roots usually
            status: 'ACTIVE',
            createdAt: '0:0',
            isRoot: true // Simpler: Make Alice Root for this test to bypass scope issues
        });

        const kernel = new GovernanceKernel(identity, authority, state, protocols, audit, registry);
        kernel.boot();
        return { kernel, audit, identity };
    }

    test('Persistence: specific error codes are returned', async () => {
        const { kernel } = await createKernel(store);

        // 1. Invalid Signature
        const action1: Action = {
            actionId: 'act-1',
            initiator: 'alice',
            payload: { metricId: 'test.counter', value: 10 },
            timestamp: '1:0',
            expiresAt: '0',
            signature: 'deadbeef'
        };

        try {
            await kernel.execute(action1);
            fail('Should have thrown');
        } catch (e: any) {
            // We expect the kernel to throw string "Kernel Reject: Invalid Signature" or similar
            // But internally guards return codes. 
            // GovernanceKernel.execute throws `Error(\`Kernel Reject: ${guardStatus.reason} \`)`.
            // The reason comes from `guardAttempt`.
            // guardAttempt constructs rejection with ErrorCode but returns { status: 'REJECTED', reason: message }.
            // So for now execute() throws with message.
            expect(e.message).toContain('Invalid Signature');
        }
    });

    test('Persistence: Replay Engine restores seenActions', async () => {
        // --- 1. Run Kernel A ---
        const { kernel: kernelA } = await createKernel(store);

        const action: Action = {
            actionId: 'act-persistence-1',
            initiator: 'alice',
            payload: { metricId: 'test.counter', value: 10 },
            timestamp: '100:0',
            expiresAt: '0',
            signature: ''
        };
        // Sign correctly
        const data = `${action.actionId}:${action.initiator}:${JSON.stringify(action.payload)}:${action.timestamp}:${action.expiresAt}`;
        action.signature = signData(data, aliceKey.privateKey);

        // Execute twice (first success, second replay)
        await kernelA.execute(action);

        try {
            await kernelA.execute(action);
            fail('First replay should fail');
        } catch (e: any) {
            expect(e.message).toContain('Replay Violation');
        }

        // --- 2. Shutdown & Restart (Kernel B) ---
        // Kernel B starts fresh, doesn't know about act-persistence-1
        const { kernel: kernelB, audit: auditB } = await createKernel(store);

        // Before replay, Kernel B should accept the same action (bad!)
        // (In reality we simulate this vulnerability check)
        // But let's run Replay first.

        const replay = new ReplayEngine();
        await replay.replay(auditB, kernelB);

        // --- 3. Verify Memory Restored ---
        // Now Kernel B should reject the action as Replay
        try {
            await kernelB.execute(action); // Should fail immediately at Guard level
            fail('Replay memory was not restored! Action executed again.');
        } catch (e: any) {
            expect(e.message).toContain('Replay Violation');
        }
    });

    test('Hardening: guardAttempt returns correct ErrorCode in rejection', async () => {
        const { kernel, identity } = await createKernel(store);
        const bobKey = generateKeyPair();

        // Register Bob (Standard Actor, not Root)
        identity.register({
            id: 'bob',
            publicKey: bobKey.publicKey,
            type: 'ACTOR',
            identityProof: 'reg',
            status: 'ACTIVE',
            createdAt: '0:0'
        });

        // Scope Violation
        const action: Action = {
            actionId: 'act-scope-1',
            initiator: 'bob',
            payload: { metricId: 'test.counter', value: 50 },
            timestamp: '200:0', // Future
            expiresAt: '0',
            signature: ''
        };
        // valid sig
        const data = `${action.actionId}:${action.initiator}:${JSON.stringify(action.payload)}:${action.timestamp}:${action.expiresAt}`;
        action.signature = signData(data, bobKey.privateKey);

        // Bob has no authority for test.counter
        const aid = await kernel.submitAttempt('bob', 'SYSTEM', action);
        const result = await kernel.guardAttempt(aid);

        expect(result.status).toBe('REJECTED');
        // The reason might be text, but let's check the Audit Log for the code!

        const history = await store.getHistory();
        const rejectionEntry = history.find(e => e.action.actionId === 'act-scope-1' && e.status === 'REJECT');

        expect(rejectionEntry).toBeDefined();
        // Check metadata or code
        expect(rejectionEntry?.metadata?.code).toBe(ErrorCode.OVERSCOPE_ATTEMPT);
    });
});
