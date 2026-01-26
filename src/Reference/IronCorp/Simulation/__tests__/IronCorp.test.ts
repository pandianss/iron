
import { describe, it, expect, jest } from '@jest/globals';
import { run } from '../Quarter1.js';

describe('Stratum III: Reference System (IronCorp)', () => {
    it('XV.3 End-to-End Simulation: Fiscal Quarter 1', async () => {
        // Run the simulation
        // (Note: The simulation itself prints logs, we just want to ensure it completes and returns valid state)


        const { state, audit } = await run();

        // Verification Points

        // 1. Budget Enforcement
        // Initial Budget: 100
        // Spend 1: -1
        // Rapid Spend Loop: 105 attempts.
        // Should drain 99 -> 0.
        // Final should be 0.
        const budget = state.get('finance.opex.remaining');
        expect(budget).toBe(0);

        // 2. Audit Trail
        // Should have many events.
        const history = audit.getHistory();
        expect(history.length).toBeGreaterThan(100);

        // 3. Rejections
        // We expect many rejections once budget hit 0.
        const failures = history.filter(h => h.status === 'REJECT' || h.status === 'ABORTED');
        expect(failures.length).toBeGreaterThan(0);

        // 4. Integrity
        expect(audit.verifyChain()).toBe(true);
    }, 30000);
});
