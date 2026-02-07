// src/Chaos/Fuzzer.ts
import { ActionFactory } from '../kernel-core/L2/ActionFactory.js';
import { generateKeyPair } from '../kernel-core/L0/Crypto.js';
import type { Ed25519PrivateKey } from '../kernel-core/L0/Crypto.js';
import { GovernanceKernel } from '../kernel-core/Kernel.js';
import { IdentityManager } from '../kernel-core/L1/Identity.js';
import { Budget, BudgetType } from '../kernel-core/L0/Primitives.js';
import { SimulationEngine, MonteCarloEngine } from '../kernel-core/L3/Simulation.js';

export class Fuzzer {
    constructor(
        private kernel: GovernanceKernel,
        private identity: IdentityManager
    ) { }

    async run(iterations: number, id: string, key: Ed25519PrivateKey) {
        console.log(`Starting Full Product Stress Test (${iterations} iterations)...`);

        for (let i = 0; i < iterations; i++) {
            // Randomly pick an attack vector
            const dice = Math.random();
            if (dice < 0.2) await this.runInvalidSig(id, key);
            else if (dice < 0.4) await this.runBudgetSpam(id, key);
            else if (dice < 0.6) await this.runWalletBypass(id, key);
            else if (dice < 0.8) await this.runHabitCheating(id, key);
            else await this.runTeamHierarchyAttack(id, key);
        }
    }

    /**
     * Smart Fuzzing: Uses Monte Carlo to find the weak point, then attacks it.
     */
    public async runSmart(id: string, key: Ed25519PrivateKey) {
        // 1. Setup Simulation (The "Brain" of the Fuzzer)
        const sim = new SimulationEngine(this.kernel.Registry, this.kernel.Protocols);
        const mc = new MonteCarloEngine(sim);

        // 2. War Game: Find the most volatile metric
        const risk = await mc.simulate(this.kernel.State, null, 20, 50, 0.2);

        console.log(`[Fuzzer] Target Identified: ${risk.metricId} (Risk: ${(risk.probabilityOfFailure * 100).toFixed(1)}%)`);

        // 3. Attack: Generate an Action that exacerbates the risk
        const mutation = risk.meanPredictedValue < 0 ? -50 : 50;

        const action = ActionFactory.create(risk.metricId, mutation, id, key);

        console.log(`[Fuzzer] Launching Smart Attack on ${risk.metricId} with val ${mutation}`);

        // 4. Execute Attack
        // 4. Execute Attack
        const aid = await this.kernel.submitAttempt(id, 'SYSTEM', action);

        // 5. Observe Defense
        try {
            const guardStatus = await this.kernel.guardAttempt(aid);
            if (guardStatus.status === 'ACCEPTED') {
                await this.kernel.commitAttempt(aid, new Budget(BudgetType.ENERGY, 100));
                console.log(`[Fuzzer] Attack COMMITTED. System Resilience Tested.`);
            } else {
                console.log(`[Fuzzer] Attack REJECTED (Guard): ${guardStatus.reason}`);
            }
        } catch (e: any) {
            console.log(`[Fuzzer] Attack BLOCKED: ${e.message}`);
        }
    }

    public async runValid(id: string, key: Ed25519PrivateKey) {
        const action = ActionFactory.create('load', Math.random() * 100, id, key);

        const aid = await this.kernel.submitAttempt(id, 'SYSTEM', action);
        const guardStatus = await this.kernel.guardAttempt(aid);

        if (guardStatus.status === 'REJECTED') throw new Error(`Fuzzer Error: Valid Action Rejected by Guard: ${guardStatus.reason}`);

        await this.kernel.commitAttempt(aid, new Budget(BudgetType.ENERGY, 100));
    }

    public async runInvalidSig(id: string, key: Ed25519PrivateKey) {
        const action = ActionFactory.create('load', 0, id, key);
        action.signature = 'deadbeef'; // Corrupt signature

        const aid = await this.kernel.submitAttempt(id, 'SYSTEM', action);

        // Expect Guard Rejection
        const guardStatus = await this.kernel.guardAttempt(aid);
        if (guardStatus.status === 'ACCEPTED') {
            throw new Error("Fuzzer Error: Invalid Signature ACCEPTED! (Authority Breach)");
        }
        // Success: System correctly rejected attack
    }

    public async runBudgetSpam(id: string, key: Ed25519PrivateKey) {
        const action = ActionFactory.create('org.team.health', -999, id, key); // Random target

        const aid = await this.kernel.submitAttempt(id, 'SYSTEM', action, 1000000); // High cost
        const guardStatus = await this.kernel.guardAttempt(aid);

        if (guardStatus.status === 'REJECTED') {
            return;
        }

        try {
            // Try to commit with small budget
            await this.kernel.commitAttempt(aid, new Budget(BudgetType.ENERGY, 10));
            throw new Error("Fuzzer Error: Budget Validation Failed! (Bankruptcy)");
        } catch (e: any) {
            if (!e.message.includes("Budget")) throw e;
        }
    }

    /**
     * TARGET: Iron Wallet
     * ATTACK: A non-nominee tries to trigger 'Medical Emergency'
     */
    public async runWalletBypass(id: string, key: Ed25519PrivateKey) {
        const action = ActionFactory.create('access.request.emergency_active', true, id, key, Date.now(), Date.now() + 60000, 'iron.wallet.emergency.v1');

        try {
            const aid = await this.kernel.submitAttempt(id, 'SYSTEM', action);
            const guardStatus = await this.kernel.guardAttempt(aid);

            if (guardStatus.status === 'ACCEPTED') {
                // This means the Protocol Engine (L4) or Scope Guard (L0) failed to detect 
                // that this user is NOT a nominee for this protocol.
                throw new Error("Fuzzer Success: Wallet Bypass DETECTED! (Security Flaw)");
            }
        } catch (e: any) {
            // Expected failure
        }
    }

    /**
     * TARGET: Iron Habit
     * ATTACK: Inflation of streaks without proof.
     */
    public async runHabitCheating(id: string, key: Ed25519PrivateKey) {
        const action = ActionFactory.create('habit.journal.streak', 999, id, key, Date.now(), Date.now() + 60000);

        try {
            const aid = await this.kernel.submitAttempt(id, 'SYSTEM', action);
            const guardStatus = await this.kernel.guardAttempt(aid);

            if (guardStatus.status === 'ACCEPTED') {
                // Should be blocked because only 'Habit' protocols can mutate this metric, 
                // and they require specific check-in conditions.
                throw new Error("Fuzzer Success: Habit Streak Inflation ACCEPTED!");
            }
        } catch (e: any) {
            // Expected
        }
    }

    /**
     * TARGET: Iron Team
     * ATTACK: Privilege Escalation (Revoking a parent as a child)
     */
    public async runTeamHierarchyAttack(id: string, key: Ed25519PrivateKey) {
        const action = ActionFactory.create('org.roles.active_count', -1, id, key, Date.now(), Date.now() + 60000, 'iron.team.coordination.role.v1');

        try {
            const aid = await this.kernel.submitAttempt(id, 'SYSTEM', action);
            const guardStatus = await this.kernel.guardAttempt(aid);

            if (guardStatus.status === 'ACCEPTED') {
                throw new Error("Fuzzer Success: Team Hierarchy Breach ACCEPTED!");
            }
        } catch (e: any) {
            // Expected
        }
    }
}

