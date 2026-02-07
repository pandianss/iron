import { describe, it, expect } from '@jest/globals';
import { createVariableRatioProtocol, createFixedRatioProtocol, createVariableIntervalProtocol, createAbuliaProtocol } from '../../Protocols/VariableRatio.js';
import { RandomEngine } from '../../RandomEngine.js';

describe('Variable-Ratio Protocol Integration', () => {
    it('should create valid VR protocol', () => {
        const protocol = createVariableRatioProtocol('operant.run.distance', 1, 0.2);

        expect(protocol.id).toBe('operant.vr.operant.run.distance');
        expect(protocol.category).toBe('Habit');

        // Verify preconditions
        expect(protocol.preconditions).toHaveLength(2);
        expect(protocol.preconditions[0]).toMatchObject({
            type: 'METRIC_THRESHOLD',
            metricId: 'operant.run.distance',
            operator: '>=',
            value: 1
        });
        expect(protocol.preconditions[1]).toMatchObject({
            type: 'METRIC_THRESHOLD',
            metricId: 'random.seed',
            operator: '<=',
            value: 0.2
        });

        // Verify execution
        expect(protocol.execution).toHaveLength(1);
        expect(protocol.execution[0]).toMatchObject({
            type: 'MUTATE_METRIC',
            metricId: 'tokens.user.balance',
            mutation: 1
        });
    });

    it('should issue tokens probabilistically over 100 trials', () => {
        const rng = new RandomEngine(12345);
        const probability = 0.2;
        let tokensIssued = 0;

        for (let i = 0; i < 100; i++) {
            const randomValue = rng.next();

            // Simulate protocol precondition check
            if (randomValue <= probability) {
                tokensIssued++;
            }
        }

        // Should be approximately 20% (within wider tolerance)
        expect(tokensIssued).toBeGreaterThan(12);
        expect(tokensIssued).toBeLessThan(28);
    });

    it('should be deterministic with same seed', () => {
        const rng1 = new RandomEngine(12345);
        const rng2 = new RandomEngine(12345);

        const sequence1 = Array.from({ length: 10 }, () => rng1.next());
        const sequence2 = Array.from({ length: 10 }, () => rng2.next());

        expect(sequence1).toEqual(sequence2);
    });

    it('should create valid Fixed-Ratio protocol', () => {
        const protocol = createFixedRatioProtocol('operant.writing.words', 500, 5);

        expect(protocol.id).toBe('operant.fr.operant.writing.words');
        expect(protocol.preconditions.length).toBeGreaterThan(0);
    });

    it('should create valid Variable-Interval protocol', () => {
        const protocol = createVariableIntervalProtocol('operant.exercise.reps', 10, 3600);

        expect(protocol.id).toBe('operant.vi.operant.exercise.reps');
        expect(protocol.execution).toHaveLength(2); // Token + timer reset
    });

    it('should create valid Abulia Detection protocol', () => {
        const protocol = createAbuliaProtocol();

        expect(protocol.id).toBe('operant.abulia.detection');
        expect(protocol.category).toBe('Performance');

        // Should increase probability when user stops responding
        const probabilityMutation = protocol.execution.find(e => e.metricId === 'vr.probability');
        expect(probabilityMutation?.mutation).toBe(0.5);
    });
});
