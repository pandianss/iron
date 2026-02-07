import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

/**
 * Shaping Protocol: Progressive Threshold Reinforcement
 * 
 * Implements Skinner's "shaping" (successive approximation):
 * - Start with low threshold
 * - Issue token when threshold is met
 * - Automatically raise threshold
 * - Never reinforce previous standard (extinction of lower performance)
 * 
 * This builds complex behaviors from a "lump of clay" by reinforcing
 * slightly exceptional instances and gradually raising the standard.
 * 
 * NOTE: Current implementation has limitation - mutations are absolute values,
 * not relative increments. This requires Protocol engine enhancement to support
 * reading current state and applying relative mutations.
 */

export function createShapingProtocol(
    operantMetric: string,
    initialThreshold: number,
    increment: number
): Protocol {
    return {
        id: `operant.shaping.${operantMetric}`,
        name: `Shaping Protocol for ${operantMetric}`,
        version: '1.0.0',
        category: 'Habit',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: operantMetric, operator: '>=', value: initialThreshold },
            { type: 'METRIC_THRESHOLD', metricId: 'shaping.threshold.current', operator: '<=', value: initialThreshold }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'tokens.user.balance', mutation: 1 },
            // NOTE: This sets absolute value, not relative increment
            // Ideally should be: currentThreshold + increment
            { type: 'MUTATE_METRIC', metricId: 'shaping.threshold.current', mutation: initialThreshold + increment }
        ]
    };
}

/**
 * Shaping Reset Protocol
 * 
 * If user fails to meet threshold for extended period, reset to lower threshold
 * to prevent abulia (inability to act due to ratio being too high).
 */
export function createShapingResetProtocol(
    operantMetric: string,
    resetThreshold: number,
    failurePeriod: number
): Protocol {
    return {
        id: `operant.shaping.reset.${operantMetric}`,
        name: `Shaping Reset for ${operantMetric}`,
        version: '1.0.0',
        category: 'Performance',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: operantMetric, operator: '<', value: resetThreshold },
            { type: 'METRIC_THRESHOLD', metricId: 'time.since.last.attempt', operator: '>', value: failurePeriod }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'shaping.threshold.current', mutation: resetThreshold * 0.5 }
        ]
    };
}
