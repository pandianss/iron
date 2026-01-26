
import type { Protocol } from '../../../../L4/ProtocolTypes.js';

/**
 * Iron Performance: KPI Aggregation Protocol
 * Governs the roll-up of child metrics into parent KPIs.
 */
export const KPI_Aggregation_Protocol: Protocol = {
    id: 'iron.performance.mis.aggregate.v1',
    name: "KPI Hierarchy Aggregation",
    version: "1.0.0",
    category: "Performance",
    lifecycle: "PROPOSED",
    strict: true,

    preconditions: [
        {
            type: "ALWAYS",
            value: true
        }
    ],

    execution: [
        // 1. Rollup logic (Simulated in DSL as a mutation)
        // In a real engine, this might be a 'CALCULATE' type, 
        // but we use MUTATE_METRIC to update the parent.
        {
            type: "MUTATE_METRIC",
            metricId: "org.kpi.total_velocity",
            mutation: 1 // Increment total velocity for every child heartbeat
        }
    ]
};

/**
 * Iron Performance: Drift Detection Protocol
 * Flags discrepancies between Projected and Actual state.
 */
export const Drift_Detection_Protocol: Protocol = {
    id: 'iron.performance.mis.drift.v1',
    name: "Performance Drift Monitor",
    version: "1.0.0",
    category: "Performance",
    lifecycle: "PROPOSED",
    strict: true,

    preconditions: [
        {
            type: "METRIC_THRESHOLD",
            metricId: "org.kpi.variance",
            operator: ">",
            value: 15 // Trigger warning if variance > 15%
        }
    ],

    execution: [
        {
            type: "MUTATE_METRIC",
            metricId: "org.console.alert_status",
            mutation: "CRITICAL_DRIFT"
        }
    ]
};
