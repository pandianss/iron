
import type { Protocol } from '../../../kernel-core/L4/ProtocolTypes.js';

export const Daily_Journal_Protocol: Protocol = {
    id: 'iron.habit.journal.v1',
    name: "Daily Journal Commitment",
    version: "1.0.0",
    category: "Habit",
    lifecycle: "PROPOSED",
    strict: true,

    // Logic: Valid Check-In
    preconditions: [
        // 1. Must be a "Check-In" Action (Payload check implicitly or via metric context)
        // For verify, we check if the user "claimed" the day.
        // real logic would check TIME_WINDOW relative to last_entry
        // But DSL is simple. We assume Engine validates the "Action" against these.

        // Anti-Spam: Don't allow double check-in (Implementation dependent, 
        // usually handled by 'did I alread do it today' check in L2 or L6)
        // For L4, we just define the EFFECT.

        {
            type: "ALWAYS", // Simpler for now: The interface constrains the time window
            value: true
        }
    ],

    execution: [
        // 1. Increment Streak
        {
            type: "MUTATE_METRIC",
            metricId: "habit.journal.streak",
            mutation: 1
        },
        // 2. Set Last Entry Timestamp (handled by State update, but maybe we track explicit 'last_day_index')
        // 3. Reward (XP)
        {
            type: "MUTATE_METRIC",
            metricId: "user.gamification.xp",
            mutation: 10
        }
    ],
    triggerConditions: [],
    authorizedCapacities: [],
    stateTransitions: [],
    completionConditions: []
};

export const Rest_Day_Protocol: Protocol = {
    id: 'iron.habit.rest.v1',
    name: "Authorized Rest Day",
    version: "1.0.0",
    category: "Budget", // Consumes Budget
    lifecycle: "PROPOSED",
    strict: true,

    preconditions: [
        {
            type: "METRIC_THRESHOLD",
            metricId: "user.gamification.rest_tokens",
            operator: ">=",
            value: 1
        }
    ],

    execution: [
        {
            type: "MUTATE_METRIC",
            metricId: "user.gamification.rest_tokens",
            mutation: -1
        },
        {
            type: "MUTATE_METRIC",
            metricId: "habit.journal.streak",
            mutation: 0 // Maintains streak (Action: SKIP)
            // Ideally, we'd "Extend" the deadline, but for simple counter, +0 implies specific logic or just NO-OP on streak reset
        }
    ],
    triggerConditions: [],
    authorizedCapacities: [],
    stateTransitions: [],
    completionConditions: []
};
