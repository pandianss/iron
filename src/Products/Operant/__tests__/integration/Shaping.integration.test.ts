import { describe, it, expect, beforeEach } from '@jest/globals';
import { createShapingProtocol } from '../../Protocols/Shaping.js';

describe('Shaping Protocol Integration', () => {
    it('should create valid shaping protocol', () => {
        const protocol = createShapingProtocol('operant.writing.words', 100, 50);

        expect(protocol.id).toBe('operant.shaping.operant.writing.words');
        expect(protocol.name).toBe('Shaping Protocol for operant.writing.words');
        expect(protocol.category).toBe('Habit');
        expect(protocol.lifecycle).toBe('PROPOSED');

        // Verify preconditions
        expect(protocol.preconditions).toHaveLength(2);
        expect(protocol.preconditions[0]).toMatchObject({
            type: 'METRIC_THRESHOLD',
            metricId: 'operant.writing.words',
            operator: '>=',
            value: 100
        });

        // Verify execution (mutations)
        expect(protocol.execution).toHaveLength(2);
        expect(protocol.execution[0]).toMatchObject({
            type: 'MUTATE_METRIC',
            metricId: 'tokens.user.balance',
            mutation: 1
        });
        expect(protocol.execution[1]).toMatchObject({
            type: 'MUTATE_METRIC',
            metricId: 'shaping.threshold.current',
            mutation: 150 // 100 + 50
        });
    });

    it('should create progressive thresholds', () => {
        const iterations = 10;
        const initialThreshold = 100;
        const increment = 50;

        for (let i = 0; i < iterations; i++) {
            const currentThreshold = initialThreshold + (i * increment);
            const protocol = createShapingProtocol('operant.writing.words', currentThreshold, increment);

            // Verify threshold increases
            const thresholdMutation = protocol.execution.find(e => e.metricId === 'shaping.threshold.current');
            expect(thresholdMutation?.mutation).toBe(currentThreshold + increment);
        }
    });
});
