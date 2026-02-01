
import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

export const Sovereign_Silence_Protocol: Protocol = {
    id: 'iron.wallet.continuity.silence.v1',
    name: "Sovereign Silence (Deadman Switch)",
    version: "1.0.0",
    category: "Continuity",
    lifecycle: "PROPOSED",
    strict: true,
    // Trigger: If last_seen > 30 days AND status is Active
    preconditions: [
        {
            type: "METRIC_THRESHOLD",
            metricId: "user.activity.days_since_last_seen",
            operator: ">",
            value: 30
        },
        {
            type: "METRIC_THRESHOLD",
            metricId: "user.authority.state",
            operator: "==",
            value: "ACTIVE"
            // Note: Enums in DSL might be value strings or ints. Assuming string for now based on L4.
        }
    ],
    // Action: Transition to WARNING state
    execution: [
        {
            type: "MUTATE_METRIC",
            metricId: "user.authority.state",
            mutation: "WARNING"
        },
        {
            type: "MUTATE_METRIC",
            metricId: "system.notification.queue",
            mutation: "PROOF_OF_LIFE_REQUEST"
        }
    ],
    triggerConditions: [],
    authorizedCapacities: [],
    stateTransitions: [],
    completionConditions: []
};

// Phase 2: From Warning to Provisional (e.g. 7 days later)
export const Sovereign_Silence_Escalation: Protocol = {
    id: 'iron.wallet.continuity.silence.escalation.v1',
    name: "Sovereign Silence Escalation",
    version: "1.0.0",
    category: "Continuity",
    lifecycle: "PROPOSED",
    strict: true,
    preconditions: [
        {
            type: "METRIC_THRESHOLD",
            metricId: "user.authority.state",
            operator: "==",
            value: "WARNING"
        },
        {
            type: "METRIC_THRESHOLD",
            metricId: "user.activity.days_in_warning",
            operator: ">",
            value: 7
        }
    ],
    execution: [
        {
            type: "MUTATE_METRIC",
            metricId: "user.authority.state",
            mutation: "PROVISIONAL"
        },
        {
            type: "MUTATE_METRIC",
            metricId: "access.nominee.visibility",
            mutation: "GRANTED"
        }
    ],
    triggerConditions: [],
    authorizedCapacities: [],
    stateTransitions: [],
    completionConditions: []
};
