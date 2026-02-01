import { GovernanceInterface, ActionBuilder } from '../L6/Interface.js';
import type { KeyPair } from '../kernel-core/L0/Crypto.js';
import { IronWalletInterface } from '../Solutions/IronWallet/Interface.js';
import { IronHabitInterface } from '../Solutions/IronHabit/Interface.js';
import { IronTeamInterface } from '../Solutions/IronTeam/Interface.js';
import { IronPerformanceInterface } from '../Solutions/IronPerformance/Interface.js';
import { IronIntelligenceInterface } from '../Solutions/IronIntelligence/Interface.js';

export interface UserSession {
    userId: string;
    keyPair: KeyPair;
    loggedInAt: number;
}

export interface AppDashboard {
    userId: string;
    metrics: Record<string, any>;
    solutions: {
        wallet: any;
        habit: any;
        team: any;
        performance: any;
        intelligence: any;
    };
    history: {
        action: string;
        timestamp: string;
        proof: string;
    }[];
}

export class SovereignApp {
    private session: UserSession | null = null;

    constructor(
        private gateway: GovernanceInterface,
        public wallet: IronWalletInterface,
        public habit: IronHabitInterface,
        public team: IronTeamInterface,
        public performance: IronPerformanceInterface,
        public intelligence: IronIntelligenceInterface
    ) { }

    public login(userId: string, keyPair: KeyPair) {
        this.session = {
            userId,
            keyPair,
            loggedInAt: Date.now()
        };
    }

    public async performAction(
        actionId: string,
        payload: { metricId: string, value: any, protocolId?: string }
    ) {
        if (!this.session) throw new Error("App Error: User unauthenticated");

        // Construct Action using ActionBuilder (Phase 1: Modernization)
        const builder = new ActionBuilder();
        const action = builder
            .withInitiator(this.session.userId)
            .withProtocol(payload.protocolId || 'SYSTEM')
            .withMetric(payload.metricId)
            .withValue(payload.value)
            .build(this.session.keyPair);

        // Execute via Interface (L6)
        const commit = await this.gateway.submit(action);

        return {
            actionId,
            txId: commit.attemptId,
            timestamp: commit.timestamp,
            status: commit.status
        };
    }

    public getDashboard(): AppDashboard {
        if (!this.session) throw new Error("App Error: User unauthenticated");

        const dashboard: AppDashboard = {
            userId: this.session.userId,
            metrics: {},
            solutions: {
                wallet: this.performance.getScorecard(this.session.userId).authority,
                habit: this.performance.getScorecard(this.session.userId).discipline,
                team: this.performance.getConsole().orgHealth,
                performance: this.performance.getConsole().overallVelocity,
                intelligence: this.performance.getConsole().driftAlert
            },
            history: []
        };

        // Hydrate Metrics
        const vitalMetrics = ['reputation', 'standing', 'user.gamification.xp', 'habit.journal.streak'];
        for (const m of vitalMetrics) {
            dashboard.metrics[m] = this.gateway.getTruth(m);
        }

        return dashboard;
    }

    /**
     * Strategic Action: Daily Check-In (Iron Habit)
     */
    public async dailyCheckIn(proof: string) {
        if (!this.session) throw new Error("Unauthenticated");
        return this.habit.checkIn(this.session.userId, proof);
    }

    /**
     * Institutional Action: Sync Team (Iron Team)
     */
    public async teamSync(roleId: string) {
        if (!this.session) throw new Error("Unauthenticated");
        return this.team.syncTeam(roleId, this.session.userId, 'GOVERNANCE_SIGNATURE');
    }

    /**
     * Strategic Intelligence: Run Scenario (Iron Intelligence)
     */
    public async simulateShift(action: any) {
        return this.intelligence.runWhatIf(action, 86400 * 7); // Project 1 week
    }
}
