
import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

export const BudgetProtocol: Protocol = {
    id: 'iron.protocol.budget.v1',
    name: "IronCorp Fiscal Discipline",
    version: "1.0.0",
    category: "Budget",
    lifecycle: "ACTIVE", // Pre-ratified for Seed
    strict: true,
    execution: [
        {
            type: "MUTATE_METRIC",
            metricId: "finance.opex.remaining",
            mutation: -1 // Each "Spend Action" costs 1 unit (simplified)
        }
    ],
    triggerConditions: [],
    authorizedCapacities: [],
    stateTransitions: [],
    completionConditions: [],
    preconditions: [
        {
            type: "METRIC_THRESHOLD",
            metricId: "finance.opex.remaining",
            operator: ">",
            value: 0
        },
        {
            type: "TIME_WINDOW", // Placeholder for "During Business Hours" logic (handled by Kernel implicitly via Timestamp > 0)
            value: "ALWAYS"
        }
    ]
};
