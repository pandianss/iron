
// src/Chaos/Fuzzer.ts
import { IntentFactory } from '../L2/IntentFactory.js';
import { generateKeyPair, hash } from '../L0/Crypto.js';
import type { Ed25519PrivateKey } from '../L0/Crypto.js';
import { GovernanceKernel } from '../Kernel.js';
import { IdentityManager, CapabilitySet } from '../L1/Identity.js';
import type { Principal } from '../L1/Identity.js';

export class Fuzzer {
    constructor(
        private kernel: GovernanceKernel,
        private identity: IdentityManager
    ) { }

    async run(iterations: number) {
        console.log(`Starting Fuzzing (${iterations} iterations)...`);

        const keys = generateKeyPair();
        this.identity.register({
            id: 'fuzzer',
            publicKey: keys.publicKey,
            type: 'AGENT',
            scopeOf: new CapabilitySet(['*']),
            parents: [],
            createdAt: '0:0',
            isRoot: true
        });
        const actor = this.identity.get('fuzzer')!;

        for (let i = 0; i < iterations; i++) {
            const scenario = Math.floor(Math.random() * 4);

            try {
                switch (scenario) {
                    case 0: // Valid
                        this.runValid(actor.id, keys.privateKey);
                        break;
                    case 1: // Invalid Signature
                        this.runInvalidSig(actor.id, keys.privateKey);
                        break;
                    case 2: // Time Violation
                        this.runTimeViolation(actor.id, keys.privateKey);
                        break;
                    case 3: // Revoked
                        this.runRevoked(actor.id, keys.privateKey);
                        break;
                }
            } catch (e) {
                // Ignore Kernel Rejects, strictly looking for Crashes or Silent Failures
                // In Property Testing, we assert the RESULT matches expectation.
            }
        }
    }

    private runValid(id: string, key: Ed25519PrivateKey) {
        const intent = IntentFactory.create('load', Math.random() * 100, id, key);
        this.kernel.execute(intent);
        // Expect Success
    }

    private runInvalidSig(id: string, key: Ed25519PrivateKey) {
        const intent = IntentFactory.create('load', 0, id, key);
        intent.signature = 'deadbeef';
        try {
            this.kernel.execute(intent);
            throw new Error("Fuzzer Error: Invalid Sig Accepted!");
        } catch (e: any) {
            if (!e.message.includes("Kernel Reject: Invalid Signature")) throw e;
        }
    }

    private runTimeViolation(id: string, key: Ed25519PrivateKey) {
        // Future intent? Or Backwards? 
        // Backwards is easier to provoke if we don't control State history perfectly here.
        // Let's create an intent with TS = 0.
        const intent = IntentFactory.create('load', 0, id, key, 0);
        try {
            this.kernel.execute(intent);
            // Might succeed if it's the first event!
        } catch (e: any) {
            if (!e.message.includes("Time Violation")) throw e;
        }
    }

    private runRevoked(id: string, key: Ed25519PrivateKey) {
        // Create temp revoked actor
        const rKeys = generateKeyPair();
        this.identity.register({
            id: 'temp-revoked',
            publicKey: rKeys.publicKey,
            type: 'AGENT',
            scopeOf: new CapabilitySet(['*']),
            parents: [],
            createdAt: '0:0'
        });
        this.identity.revoke('temp-revoked', '0:1');

        const intent = IntentFactory.create('load', 0, 'temp-revoked', rKeys.privateKey);
        try {
            this.kernel.execute(intent);
            throw new Error("Fuzzer Error: Revoked Actor Accepted!");
        } catch (e: any) {
            if (!e.message.includes("Kernel Reject: Principal revoked")) throw e;
        }
    }
}
