import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

/**
 * Contract/Commitment Protocols
 * 
 * Implements commitment contracts with aversive consequences:
 * - User deposits money/tokens into escrow
 * - If target not met by deadline, funds transferred to disliked charity
 * - User behaves to avoid aversive loss
 */

export function createContractProtocol(
    operantMetric: string,
    targetValue: number,
    escrowAmount: number,
    deadline: number
): Protocol {
    return {
        id: `operant.contract.${operantMetric}`,
        name: `Commitment Contract for ${operantMetric}`,
        version: '1.0.0',
        category: 'Accountability',
        lifecycle: 'PROPOSED',
        strict: true, // Must execute if conditions met
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: operantMetric, operator: '<', value: targetValue },
            { type: 'METRIC_THRESHOLD', metricId: 'time.hour', operator: '==', value: deadline }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'contract.escrow.usd', mutation: -escrowAmount },
            { type: 'MUTATE_METRIC', metricId: 'charity.disliked.donation', mutation: escrowAmount }
        ]
    };
}

/**
 * Contract Success Protocol
 * If target is met, return escrow to user
 */
export function createContractSuccessProtocol(
    operantMetric: string,
    targetValue: number,
    escrowAmount: number,
    deadline: number
): Protocol {
    return {
        id: `operant.contract.success.${operantMetric}`,
        name: `Contract Success for ${operantMetric}`,
        version: '1.0.0',
        category: 'Accountability',
        lifecycle: 'PROPOSED',
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: operantMetric, operator: '>=', value: targetValue },
            { type: 'METRIC_THRESHOLD', metricId: 'time.hour', operator: '==', value: deadline }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'contract.escrow.usd', mutation: -escrowAmount },
            { type: 'MUTATE_METRIC', metricId: 'tokens.user.balance', mutation: escrowAmount }
        ]
    };
}

/**
 * Escalating Contract Protocol
 * Increase escrow amount for repeated failures
 */
export function createEscalatingContractProtocol(
    operantMetric: string,
    targetValue: number,
    baseEscrow: number,
    failureCount: number,
    deadline: number
): Protocol {
    const escalatedAmount = baseEscrow * Math.pow(2, failureCount);

    return {
        id: `operant.contract.escalating.${operantMetric}`,
        name: `Escalating Contract for ${operantMetric}`,
        version: '1.0.0',
        category: 'Accountability',
        lifecycle: 'PROPOSED',
        strict: true,
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: [],
        preconditions: [
            { type: 'METRIC_THRESHOLD', metricId: operantMetric, operator: '<', value: targetValue },
            { type: 'METRIC_THRESHOLD', metricId: 'time.hour', operator: '==', value: deadline }
        ],
        execution: [
            { type: 'MUTATE_METRIC', metricId: 'contract.escrow.usd', mutation: -escalatedAmount },
            { type: 'MUTATE_METRIC', metricId: 'charity.disliked.donation', mutation: escalatedAmount },
            { type: 'MUTATE_METRIC', metricId: 'contract.failure.count', mutation: 1 }
        ]
    };
}
