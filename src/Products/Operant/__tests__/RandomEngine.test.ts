import { describe, it, expect, beforeEach } from '@jest/globals';
import { RandomEngine } from '../RandomEngine.js';

describe('RandomEngine', () => {
    let rng: RandomEngine;

    beforeEach(() => {
        rng = new RandomEngine(12345); // Fixed seed for reproducibility
    });

    it('should generate deterministic sequence', () => {
        const sequence1 = [rng.next(), rng.next(), rng.next()];

        rng.setSeed(12345); // Reset to same seed
        const sequence2 = [rng.next(), rng.next(), rng.next()];

        expect(sequence1).toEqual(sequence2);
    });

    it('should generate numbers in [0, 1)', () => {
        for (let i = 0; i < 100; i++) {
            const value = rng.next();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('should generate integers in range', () => {
        for (let i = 0; i < 100; i++) {
            const value = rng.nextInt(1, 10);
            expect(value).toBeGreaterThanOrEqual(1);
            expect(value).toBeLessThanOrEqual(10);
            expect(Number.isInteger(value)).toBe(true);
        }
    });

    it('should generate booleans with correct probability', () => {
        rng.setSeed(12345);
        const trials = 1000;
        let trueCount = 0;

        for (let i = 0; i < trials; i++) {
            if (rng.nextBoolean(0.3)) {
                trueCount++;
            }
        }

        const observedProbability = trueCount / trials;
        // Should be approximately 0.3 (within 5% tolerance)
        expect(observedProbability).toBeGreaterThan(0.25);
        expect(observedProbability).toBeLessThan(0.35);
    });

    it('should allow seed retrieval', () => {
        const initialSeed = rng.getSeed();
        rng.next();
        const afterNext = rng.getSeed();

        expect(afterNext).not.toBe(initialSeed);
    });
});
