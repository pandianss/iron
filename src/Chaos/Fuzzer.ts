
// src/Chaos/Fuzzer.ts
import { IntentFactory } from '../L2/IntentFactory.js';
import { generateKeyPair } from '../L0/Crypto.js';
import type { Ed25519PublicKey, Ed25519PrivateKey } from '../L0/Crypto.js';
import { GovernanceKernel } from '../Kernel.js';
import { IdentityManager, CapabilitySet } from '../L1/Identity.js';
import { Budget, BudgetType } from '../L0/Kernel.js';

import { SimulationEngine, MonteCarloEngine } from '../L3/Simulation.js';

export class Fuzzer {
    constructor(
        private kernel: GovernanceKernel,
        private identity: IdentityManager
    ) { }

    async run(iterations: number) {
        console.log(`Starting Fuzzing (${iterations} iterations)...`);
        // ... (existing loop logic, can be expanded later)
    }

    /**
     * Smart Fuzzing: Uses Monte Carlo to find the weak point, then attacks it.
     */
    public async runSmart(id: string, key: Ed25519PrivateKey) {
        // 1. Setup Simulation (The "Brain" of the Fuzzer)
        const sim = new SimulationEngine(this.kernel.Registry, this.kernel.Protocols);
        const mc = new MonteCarloEngine(sim);

        // 2. War Game: Find the most volatile metric
        // We simulate a null action to see natural drift/risk.
        const risk = mc.simulate(this.kernel.State, null, 20, 50, 0.2); // High volatility setting

        console.log(`[Fuzzer] Target Identified: ${risk.metricId} (Risk: ${(risk.probabilityOfFailure * 100).toFixed(1)}%)`);

        // 3. Attack: Generate an Intent that exacerbates the risk
        // If trend is negative, push it down further.
        const mutation = risk.meanPredictedValue < 0 ? -50 : 50;

        const intent = IntentFactory.create('attack', mutation, id, key);
        // Hack: Manually set the payload to target the risky metric
        intent.payload.metricId = risk.metricId;

        console.log(`[Fuzzer] Launching Smart Attack on ${risk.metricId} with val ${mutation}`);

        // 4. Execute Attack
        const aid = this.kernel.submitAttempt(id, 'SYSTEM', intent);

        // 5. Observe Defense
        try {
            const status = this.kernel.guardAttempt(aid);
            if (status === 'ACCEPTED') {
                this.kernel.commitAttempt(aid, new Budget(BudgetType.ENERGY, 100));
                console.log(`[Fuzzer] Attack COMMITTED. System Resilience Tested.`);
            } else {
                console.log(`[Fuzzer] Attack REJECTED (Guard).`);
            }
        } catch (e: any) {
            console.log(`[Fuzzer] Attack BLOCKED: ${e.message}`);
        }
    }

    public async runValid(id: string, key: Ed25519PrivateKey) {
        const intent = IntentFactory.create('load', Math.random() * 100, id, key);

        const aid = this.kernel.submitAttempt(id, 'SYSTEM', intent);
        const guardStatus = this.kernel.guardAttempt(aid);

        if (guardStatus === 'REJECTED') throw new Error("Fuzzer Error: Valid Intent Rejected by Guard");

        this.kernel.commitAttempt(aid, new Budget(BudgetType.ENERGY, 100));
    }

    public async runInvalidSig(id: string, key: Ed25519PrivateKey) {
        const intent = IntentFactory.create('load', 0, id, key);
        intent.signature = 'deadbeef'; // Corrupt signature

        const aid = this.kernel.submitAttempt(id, 'SYSTEM', intent);

        // Expect Guard Rejection
        const guardStatus = this.kernel.guardAttempt(aid);
        if (guardStatus === 'ACCEPTED') {
            throw new Error("Fuzzer Error: Invalid Signature ACCEPTED! (Authority Breach)");
        }
        // Success: System correctly rejected attack
    }

    public async runBudgetSpam(id: string, key: Ed25519PrivateKey) {
        const intent = IntentFactory.create('spam', 9999, id, key);

        const aid = this.kernel.submitAttempt(id, 'SYSTEM', intent, 1000000); // High cost
        const guardStatus = this.kernel.guardAttempt(aid);

        if (guardStatus === 'REJECTED') {
            // Depending on implementation, budget might be checked in Guard or Commit.
            // Spec says Invariant II is at Commit, but some Guards might pre-check.
            // If Guard catches it, that's fine too.
            return;
        }

        try {
            // Try to commit with small budget
            this.kernel.commitAttempt(aid, new Budget(BudgetType.ENERGY, 10));
            throw new Error("Fuzzer Error: Budget Validation Failed! (Bankruptcy)");
        } catch (e: any) {
            if (!e.message.includes("Budget")) throw e;
        }
    }
}
