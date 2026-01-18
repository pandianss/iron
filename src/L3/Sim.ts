
// src/L3/Sim.ts
import { StateModel } from '../L2/State';
import { IntentFactory } from '../L2/IntentFactory';
import { AuditLog } from '../L5/Audit';
import { MetricRegistry } from '../L2/State';
import { Budget } from '../L0/Kernel';
import { generateKeyPair, Ed25519PrivateKey } from '../L0/Crypto';
import { IdentityManager, Principal } from '../L1/Identity';

// --- Forecast Model ---
export class TrendAnalyzer {
    constructor(private state: StateModel) { }

    public forecast(metricId: string, horizon: number): number {
        const history = this.state.getHistory(metricId);
        if (history.length < 2) return 0;

        const p1 = Number(history[history.length - 2].value);
        const p2 = Number(history[history.length - 1].value);
        const slope = p2 - p1;

        return p2 + (slope * horizon);
    }
}

// --- Simulation Engine ---
export interface SimAction {
    targetMetricId: string;
    mutation: number;
}

export class SimulationEngine {
    constructor(private registry: MetricRegistry) { }

    public run(
        currentState: StateModel,
        action: SimAction,
        budget: Budget
    ): number {
        // 1. Consume Budget
        if (!budget.consume(1)) {
            throw new Error("Simulation Budget Exceeded");
        }

        // 2. Setup Ephemeral Simulation Context
        // We need a Sim Identity to sign things in the forked state.
        const simKeys = generateKeyPair();
        const simPrincipal: Principal = {
            id: 'sim-agent',
            publicKey: simKeys.publicKey,
            type: 'AGENT',
            validFrom: Date.now(),
            validUntil: Date.now() + 10000
        };

        const simIdentityManager = new IdentityManager();
        simIdentityManager.register(simPrincipal);

        const simLog = new AuditLog();
        const simState = new StateModel(simLog, this.registry, simIdentityManager);

        // 3. Hydrate (Simplified: Just current state as a signed intent by SimAgent)
        const currentVal = currentState.get(action.targetMetricId);
        if (currentVal !== undefined) {
            const intent = IntentFactory.create(
                action.targetMetricId,
                currentVal,
                simPrincipal.id,
                simKeys.privateKey
            );
            simState.apply(intent);
        }

        // 4. Apply Action (Signed by SimAgent)
        const newVal = Number(currentVal || 0) + action.mutation;
        const actionIntent = IntentFactory.create(
            action.targetMetricId,
            newVal,
            simPrincipal.id,
            simKeys.privateKey
        );
        simState.apply(actionIntent);

        // 5. Forecast
        const analyzer = new TrendAnalyzer(simState);
        return analyzer.forecast(action.targetMetricId, 1);
    }
}
