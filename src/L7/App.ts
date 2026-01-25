import { GovernanceInterface } from '../L6/Interface.js';
import { IntentFactory } from '../L2/IntentFactory.js';
import type { Ed25519PublicKey, Ed25519PrivateKey } from '../L0/Crypto.js';
import { hash } from '../L0/Crypto.js';

export interface UserSession {
    userId: string;
    privateKey: Ed25519PrivateKey;
    loggedInAt: number;
}

export interface AppDashboard {
    userId: string;
    metrics: Record<string, any>;
    history: {
        action: string;
        timestamp: string;
        proof: string;
    }[];
}

export class SovereignApp {
    private session: UserSession | null = null;

    constructor(
        private gateway: GovernanceInterface
    ) { }

    public login(userId: string, privateKey: Ed25519PrivateKey) {
        this.session = {
            userId,
            privateKey,
            loggedInAt: Date.now()
        };
    }

    public async performAction(actionId: string, payload: { metricId: string, value: any }) {
        if (!this.session) throw new Error("App Error: User unauthenticated");

        // Construct Kernel Intent
        const timestamp = `0:${Math.floor(Date.now() / 1000)}`;
        const intent = IntentFactory.create(
            payload.metricId,
            payload.value,
            this.session.userId,
            this.session.privateKey,
            timestamp
        );

        // Execute via Interface (L6)
        const commit = this.gateway.submit(intent);

        return {
            actionId,
            txId: commit.attemptId,
            timestamp: commit.timestamp,
            status: commit.status
        };
    }

    public getDashboard(): AppDashboard {
        if (!this.session) throw new Error("App Error: User unauthenticated");

        const metrics = ['reputation', 'standing', 'commitment'];
        const dashboard: AppDashboard = {
            userId: this.session.userId,
            metrics: {},
            history: []
        };

        for (const m of metrics) {
            dashboard.metrics[m] = this.gateway.getTruth(m);
            const trail = this.gateway.getAuditTrail(m);
            dashboard.history.push(...trail.map(t => ({
                action: `UPDATE:${m}`,
                timestamp: t.timestamp,
                proof: t.proof
            })));
        }

        return dashboard;
    }
}
