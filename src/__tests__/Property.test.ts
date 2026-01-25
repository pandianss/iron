
import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import { GovernanceKernel } from '../Kernel.js';
import { Budget } from '../L0/Kernel.js';
import { IdentityManager } from '../L1/Identity.js';
import type { Entity } from '../L1/Identity.js';
import { AuthorityEngine } from '../L1/Identity.js';
import { StateModel, MetricRegistry } from '../L2/State.js';
import { ProtocolEngine } from '../L4/Protocol.js';
import { AuditLog } from '../L5/Audit.js';
import * as ed from '@noble/ed25519';

// Generators
const genAction = fc.record({
    metricId: fc.string({ minLength: 1, maxLength: 20 }),
    value: fc.oneof(fc.integer(), fc.double(), fc.string()),
    initiator: fc.constant('fuzzer-user'),
    protocolId: fc.oneof(fc.constant('SYSTEM'), fc.string({ minLength: 3, maxLength: 10 }))
});

describe('Kernel Property Verification (Phase 3)', () => {
    // Setup (Expensive per run, so we might reset or mock simpler)
    // For pure property testing, we spin up a fresh kernel each time or use a shared one with resets?
    // Given stateful nature, let's create a fresh kernel inside the property check to ensure isolation.

    // keys
    const privKey = ed.utils.randomPrivateKey();
    const pubKey = ed.getPublicKey(privKey);
    const keyHex = Buffer.from(pubKey).toString('hex');

    const setupKernel = () => {
        const idMan = new IdentityManager();
        idMan.register({
            id: 'fuzzer-user',
            type: 'ACTOR',
            status: 'ACTIVE',
            publicKey: keyHex,
            createdAt: '0',
            identityProof: 'genesis'
        } as Entity);

        const auth = new AuthorityEngine(idMan);
        // Grant everything to fuzzer for testing execution paths
        // (In reality, we'd want to test unauthorized paths too, but let's start with authorized crash safety)
        // ... (Mock auth for now as we don't have easy Grant API access without creating actions)
        // Let's monkey-patch authorized for the fuzz test to focus on Kernel mechanics, not Auth logic depth
        auth.authorized = () => true;

        const audit = new AuditLog();
        const registry = new MetricRegistry();
        // Register generic metrics
        registry.register({ id: 'test', type: 'GAUGE' as any, description: 'Test' });

        const state = new StateModel(audit, registry, idMan);
        const protos = new ProtocolEngine(state);
        const kernel = new GovernanceKernel(idMan, auth, state, protos, audit, registry);
        kernel.boot();
        return kernel;
    };

    test('PROP_01: Crash Resilience (No Kernel Halt on Random Inputs)', () => {
        fc.assert(
            fc.property(genAction, (payload) => {
                const kernel = setupKernel();
                // Register metric on fly to avoid "Unknown Metric" errors masking deep logic
                kernel.Registry.register({ id: payload.metricId, type: 'GAUGE' as any, description: 'Fuzz' });

                // Create signed action
                // (Simplified signing for speed - standard crypto might be slow for fuzzing 1000s)
                // We'll use a mocked "VALID" signature generator or just rely on the real one if fast enough.
                // Noble is fast.

                const action = {
                    actionId: '00'.repeat(32),
                    initiator: 'fuzzer-user',
                    payload,
                    timestamp: String(Date.now()),
                    expiresAt: String(Date.now() + 10000),
                    signature: ''
                };

                // Sign
                const data = `${action.actionId}:${action.initiator}:${JSON.stringify(action.payload)}:${action.timestamp}:${action.expiresAt}`;
                // To properly test SignatureGuard, we need real signatures.
                // However, if we want to test "Bad Signature" rejection, we can pass junk.
                // Let's ensure GOOD signature for valid crash testing.
                // Wait - standard noble sign is async? No, we made it sync.
                // But privKey is Uint8Array.
                const sig = ed.sign(Buffer.from(data), privKey);
                action.signature = Buffer.from(sig).toString('hex');

                try {
                    kernel.execute(action as any, new Budget('RISK' as any, 1000));
                } catch (e: any) {
                    // It is ACCEPTABLE for Kernel to throw "Kernel Reject" or standard errors.
                    // It is UNACCEPTABLE for it to throw "Kernel Halt" (System Crash) or unhandled exceptions.
                    // Our Kernel.ts wraps commits in logic that throws "Kernel Halt".
                    // So if we see "Kernel Halt", property failed.
                    if (e.message && e.message.startsWith('Kernel Halt')) {
                        return false;
                    }
                }
                return true;
            }),
            { numRuns: 50 } // Start small
        );
    });

    test('PROP_02: Monotonicity (State Version Never Decreases)', () => {
        fc.assert(
            fc.property(fc.array(genAction, { minLength: 1, maxLength: 5 }), (payloads) => {
                const kernel = setupKernel();
                let lastVer = 0;

                for (const payload of payloads) {
                    kernel.Registry.register({ id: payload.metricId, type: 'GAUGE' as any, description: 'Fuzz' });

                    const action = {
                        actionId: '00'.repeat(32), // In reality needs unique IDs for replays?
                        // Actually Kernel attempts map by ID. If we reuse ID, it might be weird.
                        // Let's randomize ID.
                        initiator: 'fuzzer-user',
                        payload,
                        timestamp: String(Date.now()),
                        expiresAt: String(Date.now() + 10000),
                        signature: ''
                    };
                    action.actionId = Buffer.from(ed.utils.randomPrivateKey().slice(0, 32)).toString('hex'); // Random hex

                    const data = `${action.actionId}:${action.initiator}:${JSON.stringify(action.payload)}:${action.timestamp}:${action.expiresAt}`;
                    const sig = ed.sign(Buffer.from(data), privKey);
                    action.signature = Buffer.from(sig).toString('hex');

                    try {
                        kernel.execute(action as any);
                    } catch (e) { } // Ignore rejections

                    const newVer = kernel.State['currentState'].version;
                    if (newVer < lastVer) return false;
                    lastVer = newVer;
                }
                return true;
            })
        );
    });
});
