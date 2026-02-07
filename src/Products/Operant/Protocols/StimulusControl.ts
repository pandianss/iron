import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

/**
 * Stimulus Control Protocols
 * 
 * Manage discriminative stimuli (environmental cues) that control behavior:
 * - Block distracting apps during work hours
 * - Provide prompts to trigger behavior chains
 * - Remove temptations ("Get Thee Behind Me")
 */

export function createBlockingProtocol(
    timeStart: number,
    timeEnd: number,
    appMetric: string
): Protocol {
    return {
        id: `operant.stimulus.block.${appMetric}`,
        name: `Block ${appMetric} during work hours`,
        version: '1.0.0',
        category: 'Habit',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: 'time.hour', operator: '>=', value: timeStart },
            { type: 'METRIC_THRESHOLD', metricId: 'time.hour', operator: '<=', value: timeEnd }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: appMetric, mutation: 0 } // 0 = false (blocked)
        ]
    };
}

/**
 * Unblocking Protocol
 * Restore access outside work hours
 */
export function createUnblockingProtocol(
    timeStart: number,
    timeEnd: number,
    appMetric: string
): Protocol {
    return {
        id: `operant.stimulus.unblock.${appMetric}`,
        name: `Unblock ${appMetric} outside work hours`,
        version: '1.0.0',
        category: 'Habit',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: 'time.hour', operator: '<', value: timeStart }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: appMetric, mutation: 1 } // 1 = true (unblocked)
        ]
    };
}
