
import { ProtocolEngine } from '../../kernel-core/L4/Protocol.js';
import { StateModel } from '../../kernel-core/L2/State.js';
import { IdentityManager } from '../../kernel-core/L1/Identity.js';
import { KPI_Aggregation_Protocol, Drift_Detection_Protocol } from './Protocols/KpiTracking.js';

export class IronPerformanceInterface {
    constructor(
        private engine: ProtocolEngine,
        private state: StateModel,
        private identity: IdentityManager
    ) { }

    /**
     * Bootstraps the Performance system.
     */
    async initializePerformance() {
        if (!this.engine.isRegistered(KPI_Aggregation_Protocol.id!)) {
            this.engine.propose(KPI_Aggregation_Protocol);
            this.engine.ratify(KPI_Aggregation_Protocol.id!, 'TRUSTED');
            this.engine.activate(KPI_Aggregation_Protocol.id!);
        }
        if (!this.engine.isRegistered(Drift_Detection_Protocol.id!)) {
            this.engine.propose(Drift_Detection_Protocol);
            this.engine.ratify(Drift_Detection_Protocol.id!, 'TRUSTED');
            this.engine.activate(Drift_Detection_Protocol.id!);
        }
    }

    /**
     * L1: Personal Scorecard.
     * Fetches verifiable metrics for a specific user.
     */
    getScorecard(userId: string) {
        return {
            userId,
            discipline: this.state.get('habit.journal.streak') || 0,
            authority: this.identity.get(userId)?.status || 'NONE',
            rep: this.state.get('user.gamification.xp') || 0
        };
    }

    /**
     * L2/L3: Institutional Console.
     * Aggregated view for Management.
     */
    getConsole() {
        return {
            orgHealth: this.state.get('org.team.health') || 100,
            overallVelocity: this.state.get('org.kpi.total_velocity') || 0,
            driftAlert: this.state.get('org.console.alert_status') || 'NOMINAL',
            activeRoles: this.state.get('org.roles.active_count') || 0
        };
    }

    /**
     * Manual Trigger for KPI calculation (In real system, automated by Engine).
     */
    async refreshKpis(signature: string) {
        // This would call the L4 Protocol logic to rollup metrics
        await this.state.apply({
            actionId: `perf.refresh.${Date.now()}`,
            initiator: 'system',
            payload: {
                metricId: 'org.kpi.total_velocity',
                value: (this.state.get('org.kpi.total_velocity') || 0) + 1,
                protocolId: KPI_Aggregation_Protocol.id
            },
            timestamp: Date.now().toString(),
            expiresAt: '0',
            signature: signature
        });
    }
}
