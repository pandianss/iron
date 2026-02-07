import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

/**
 * Variable-Ratio (VR) Reinforcement Protocol
 * 
 * Implements Skinner's variable-ratio schedule of reinforcement.
 * Tokens are issued probabilistically after operant emission, creating:
 * - High, steady rate of responding
 * - High resistance to extinction
 * - "Gambler" effect (slot machine behavior)
 */

export function createVariableRatioProtocol(
    operantMetric: string,
    threshold: number,
    probability: number
): Protocol {
    return {
        id: `operant.vr.${operantMetric}`,
        name: `Variable-Ratio Reinforcement for ${operantMetric}`,
        version: '1.0.0',
        category: 'Habit',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: operantMetric, operator: '>=', value: threshold },
            { type: 'METRIC_THRESHOLD', metricId: 'random.seed', operator: '<=', value: probability }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'tokens.user.balance', mutation: 1 }
        ]
    };
}

/**
 * Fixed-Ratio (FR) Reinforcement Protocol
 * 
 * Issues token after every N operant emissions.
 * Less effective than VR for maintaining behavior.
 * 
 * NOTE: Requires MOD_EQ operator implementation in Protocol engine
 */
export function createFixedRatioProtocol(
    operantMetric: string,
    threshold: number,
    ratio: number
): Protocol {
    return {
        id: `operant.fr.${operantMetric}`,
        name: `Fixed-Ratio Reinforcement for ${operantMetric}`,
        version: '1.0.0',
        category: 'Habit',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: operantMetric, operator: '>=', value: threshold },
            // TODO: Implement MOD_EQ operator or use alternative approach
            { type: 'ALWAYS' }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'tokens.user.balance', mutation: 1 }
        ]
    };
}

/**
 * Variable-Interval (VI) Reinforcement Protocol
 * 
 * Issues token after variable time intervals.
 * Creates moderate, steady responding.
 */
export function createVariableIntervalProtocol(
    operantMetric: string,
    threshold: number,
    averageInterval: number
): Protocol {
    return {
        id: `operant.vi.${operantMetric}`,
        name: `Variable-Interval Reinforcement for ${operantMetric}`,
        version: '1.0.0',
        category: 'Habit',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: operantMetric, operator: '>=', value: threshold },
            { type: 'METRIC_THRESHOLD', metricId: 'time.since.last.attempt', operator: '>=', value: averageInterval },
            { type: 'METRIC_THRESHOLD', metricId: 'random.seed', operator: '<=', value: 0.5 }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'tokens.user.balance', mutation: 1 },
            { type: 'MUTATE_METRIC', metricId: 'time.since.last.attempt', mutation: 0 }
        ]
    };
}

/**
 * Abulia Detection Protocol
 * 
 * If user stops responding (no attempts in 24h), lower the reinforcement ratio
 * to prevent "discouragement" and restore responding.
 */
export function createAbuliaProtocol(): Protocol {
    return {
        id: 'operant.abulia.detection',
        name: 'Abulia Detection and Recovery',
        version: '1.0.0',
        category: 'Performance',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: 'operant.attempts.count', operator: '==', value: 0 },
            { type: 'METRIC_THRESHOLD', metricId: 'time.since.last.attempt', operator: '>', value: 86400 }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'vr.probability', mutation: 0.5 }
        ]
    };
}
