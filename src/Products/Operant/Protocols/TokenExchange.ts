import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

/**
 * Token Exchange Protocols
 * 
 * Implements the token economy: users exchange tokens (generalized reinforcers)
 * for primary reinforcers (screen time, app access, etc.)
 */

export function createExchangeProtocol(
    reinforcerMetric: string,
    tokenCost: number,
    reinforcerValue: number
): Protocol {
    return {
        id: `operant.exchange.${reinforcerMetric}`,
        name: `Token Exchange for ${reinforcerMetric}`,
        version: '1.0.0',
        category: 'Budget',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: 'tokens.user.balance', operator: '>=', value: tokenCost }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'tokens.user.balance', mutation: -tokenCost },
            { type: 'MUTATE_METRIC', metricId: reinforcerMetric, mutation: reinforcerValue }
        ]
    };
}

/**
 * Screen Time Exchange
 * Exchange tokens for minutes of screen time
 */
export function createScreenTimeExchange(tokensPerMinute: number = 1): Protocol {
    return createExchangeProtocol('reinforcer.screentime.minutes', tokensPerMinute, 1);
}

/**
 * App Access Exchange
 * Exchange tokens for boolean app access
 */
export function createAppAccessExchange(appMetric: string, tokenCost: number): Protocol {
    return createExchangeProtocol(appMetric, tokenCost, 1); // 1 = true (boolean)
}
