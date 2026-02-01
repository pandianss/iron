
import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

export const Financial_Spend_Limits: Protocol = {
    id: 'ire.spl.finance.spend.v1',
    name: "Financial Control: OPEX Limits",
    version: "1.0.0",
    category: "Budget",
    lifecycle: "PROPOSED",
    strict: true,
    execution: [
        { type: "MUTATE_METRIC", metricId: "finance.opex.remaining", mutation: -1 }
    ],
    preconditions: [
        {
            type: "METRIC_THRESHOLD",
            metricId: "finance.opex.remaining",
            operator: ">",
            value: 0
        }
    ],
    triggerConditions: [],
    authorizedCapacities: [],
    stateTransitions: [],
    completionConditions: []
};
