
import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

export const Medical_Emergency_Protocol: Protocol = {
    id: 'iron.wallet.continuity.emergency.v1',
    name: "Medical Emergency Access",
    version: "1.0.0",
    category: "Incapacity",
    lifecycle: "PROPOSED",
    strict: true,
    // Trigger: Nominee Request + Quorum (2 of 3)
    preconditions: [
        {
            type: "METRIC_THRESHOLD",
            metricId: "access.request.emergency_active",
            operator: "==",
            value: true
        },
        {
            type: "METRIC_THRESHOLD",
            metricId: "security.quorum.guardians_approved",
            operator: ">=",
            value: 2
        },
        {
            type: "METRIC_THRESHOLD",
            metricId: "security.quorum.veto_active",
            operator: "==",
            value: false
        }
    ],
    // Action: Grant Access immediately (Short fuse)
    execution: [
        {
            type: "MUTATE_METRIC",
            metricId: "user.vault.health_directive.access",
            mutation: "GRANTED"
        },
        {
            type: "MUTATE_METRIC",
            metricId: "audit.log.critical_event",
            mutation: "EMERGENCY_ACCESS_GRANTED"
        }
    ],
    triggerConditions: [],
    authorizedCapacities: [],
    stateTransitions: [],
    completionConditions: []
};
