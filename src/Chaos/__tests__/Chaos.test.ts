
import { describe, it, expect, jest } from '@jest/globals';
import { GovernanceKernel } from '../../kernel-core/Kernel.js';
import { StateModel, MetricRegistry, MetricType } from '../../kernel-core/L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../kernel-core/L1/Identity.js';
import { ProtocolEngine } from '../../kernel-core/L4/Protocol.js';
import { AuditLog } from '../../kernel-core/L5/Audit.js';
import { generateKeyPair } from '../../kernel-core/L0/Crypto.js';
import { Fuzzer } from '../Fuzzer.js';
import { IronWalletInterface } from '../../Solutions/IronWallet/Interface.js';

describe('Phase 5: Chaos Engineering (System Stability)', () => {
    // High iteration count for stress testing
    // In CI this might be lower, but for "Chaos" verification we want volume.
    const ITERATIONS = 100; // 500 is too slow for interactive test, 100 is good sample.

    it('CHAOS-001: Kernel Stability under Continuous Fuzzing', async () => {
        const registry = new MetricRegistry();
        const auditLog = new AuditLog();
        const identity = new IdentityManager();
        const authority = new AuthorityEngine(identity);
        const state = new StateModel(auditLog, registry, identity);
        const protocols = new ProtocolEngine(state);

        const kernel = new GovernanceKernel(identity, authority, state, protocols, auditLog, registry);
        kernel.boot();

        // Setup Identities
        const { publicKey, privateKey } = generateKeyPair();
        const attackerId = 'chaos-monkey';
        identity.register({
            id: attackerId, type: 'ACTOR', status: 'ACTIVE',
            publicKey, createdAt: '0', identityProof: 'gen'
        });

        // Initialize Solution Interfaces to register protocols/metrics
        // (So Fuzzer has targets)
        const wallet = new IronWalletInterface(protocols, state, identity);
        await wallet.initializeWallet();

        const fuzzer = new Fuzzer(kernel, identity);

        console.log(`[Chaos] Launching ${ITERATIONS} random attacks...`);

        // Execute Chaos
        try {
            await fuzzer.run(ITERATIONS, attackerId, privateKey);
        } catch (e) {
            // If Fuzzer throws, it means it found a "Success" (Vulnerability)
            // or the Kernel crashed.
            throw e;
        }

        // Post-Chaos Assertions
        expect(kernel.Lifecycle).toBe('ACTIVE');

        // Audit Log should contain evidence of attacks (mostly REJECTED)
        const history = await auditLog.getHistory();
        console.log(`[Chaos] Audit Log Size: ${history.length}`);

        // At least some attacks should have happened
        expect(history.length).toBeGreaterThan(0);

        // Verify State Integrity (Merkle Chain still intact)
        expect(await state.verifyIntegrity()).toBe(true);
        expect(await auditLog.verifyIntegrity()).toBe(true);
    }, 20000); // 20s timeout
});
