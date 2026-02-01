
import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

export const SecurityProtocol: Protocol = {
    id: 'iron.protocol.security.v1',
    name: "Critical Infrastructure Protection",
    version: "1.0.0",
    category: "Risk",
    lifecycle: "ACTIVE",
    strict: true,
    execution: [
        {
            type: "ALLOW_ACTION"
        }
    ],
    triggerConditions: [],
    authorizedCapacities: [],
    stateTransitions: [],
    completionConditions: [],
    preconditions: [
        {
            type: "ACTION_SIGNATURE",
            value: "REQUIRED" // Handled by Kernel SignatureGuard, but Protocol reinforces
        },
        // In a real DSL this would be: "Initiator MUST HAVE Capacity 'sysadmin'"
        // For MVP, we rely on AuthorityEngine checks upstream, 
        // but can add a metric check if we model 'security.level'
        {
            type: "METRIC_THRESHOLD",
            metricId: "security.defcon",
            operator: "<",
            value: 5 // Only allow changes if DEFCON < 5 (Panic Mode)
        }
    ]
};
