import { StateModel, MetricRegistry } from '../L2/State.js';
import { TrendAnalyzer } from '../L2/Prediction.js';
import type { Forecast } from '../L2/Prediction.js';
import { LogicalTimestamp } from '../L0/Kernel.js';
import { AuditLog } from '../L5/Audit.js';
import { ProtocolEngine } from '../L4/Protocol.js';
import type { Protocol } from '../L4/Protocol.js';

// --- Action ---
export interface Action {
    id: string;
    description: string;
    targetMetricId: string;
    valueMutation: number;
}

// --- Monte Carlo Engine ---
export interface RiskProbability {
    metricId: string;
    horizon: number;
    meanPredictedValue: number;
    p10: number; // Worst 10% case
    p90: number; // Best 10% case
    probabilityOfFailure: number; // % runs violating min/max
}

export class MonteCarloEngine {
    constructor(private simEngine: SimulationEngine) { }

    public simulate(
        currentState: StateModel,
        action: Action | null,
        horizon: number,
        runs: number = 50,
        volatility: number = 0.1, // 10% random variance per tick
        failureCondition?: (value: number) => boolean,
        targetMetricId?: string,
        extraProtocols?: Protocol[] // New: Protocols to vet
    ): RiskProbability {
        const results: number[] = [];
        const targetId = targetMetricId || (action ? action.targetMetricId : "system.load");

        for (let i = 0; i < runs; i++) {
            // We need a way to inject noise into the SimulationEngine.
            // For now, we'll subclass or modify SimulationEngine to accept a 'noise' function.
            // Or simpler: We just perturb the *action* value for this run if valid, 
            // OR we assume the SimulationEngine's 'run' method can handle noise.

            // Let's assume we modify the 'run' method below to take a noise factor.
            // But for now, let's purely random-walk the *Action* magnitude if present.

            let resultVal = 0;
            if (action) {
                // Perturb action value: value * (1 + (rand - 0.5) * volatility)
                const noise = (Math.random() - 0.5) * 2 * volatility;
                const noisyAction = { ...action, valueMutation: action.valueMutation * (1 + noise) };
                const forecast = this.simEngine.run(currentState, noisyAction, horizon, extraProtocols);
                resultVal = forecast ? forecast.predictedValue : 0;
            } else {
                // Even without action, the trend might vary? 
                // TrendAnalyzer is deterministic. 
                // To simulate market noise, we'd need stochastic process in Prediction.ts.
                // For MVP, we only simulate "Execution Variance" (Action volatility) or basic noise.
                // Let's add basic white noise to result if no action, to simulate market volatility

                // We must pass a dummy action to force SimulationEngine to look at targetId
                const dummyAction: Action = { id: 'noop', description: 'noop', targetMetricId: targetId, valueMutation: 0 };
                const forecast = this.simEngine.run(currentState, dummyAction, horizon, extraProtocols);
                const noise = (Math.random() - 0.5) * 2 * volatility;
                resultVal = forecast ? forecast.predictedValue * (1 + noise) : 0;
            }
            results.push(resultVal);
        }

        results.sort((a, b) => a - b);
        const mean = results.reduce((a, b) => a + b, 0) / runs;
        const p10Index = Math.floor(runs * 0.1);
        const p90Index = Math.floor(runs * 0.9);

        const p10 = results[p10Index] ?? results[0] ?? 0;
        const p90 = results[p90Index] ?? results[results.length - 1] ?? 0;

        // Fail probability (e.g., if metric goes below 0 or above 100? hardcoded for now or passed in?)
        const defaultFailure = (r: number) => r < 0;
        const isFailure = failureCondition || defaultFailure;

        const failures = results.filter(r => isFailure(r)).length;

        return {
            metricId: targetId,
            horizon,
            meanPredictedValue: mean,
            p10,
            p90,
            probabilityOfFailure: failures / runs
        };
    }
}

export class SimulationEngine {
    constructor(private registry: MetricRegistry, private protocols: ProtocolEngine) { }

    public run(
        currentState: StateModel,
        action: Action | null,
        horizon: number,
        extraProtocols: Protocol[] = []
    ): Forecast | null {
        // 1. Fork Store (Ephemeral)
        const simAudit = new AuditLog();
        const simState = new StateModel(simAudit, this.registry, (currentState as any).identityManager);

        // 2. Hydrate Simulation with current reality
        const targetId = action ? action.targetMetricId : "system.load";
        const originalHistory = currentState.getHistory(targetId);

        originalHistory.forEach(h => {
            simState.applyTrusted({ metricId: targetId, value: h.value }, h.updatedAt, 'sim-baseline');
        });

        // 3. Apply Action (if any)
        if (action) {
            const currentVal = Number(simState.get(targetId) || 0);
            const newVal = currentVal + action.valueMutation;

            const lastTimeStr = originalHistory.length > 0 ? originalHistory[originalHistory.length - 1]!.updatedAt : "0:0";
            const time = LogicalTimestamp.fromString(lastTimeStr);

            simState.applyTrusted({ metricId: targetId, value: newVal }, time.toString(), 'sim-action');

            // 4. Trigger Protocols (Simulated)
            // Note: ProtocolEngine needs to be forked or use SimState
            const simProtocols = new ProtocolEngine(simState);

            // Register existing protocols
            // In a real system, we'd copy registered protocols. 
            // For MVP sim, we assume the passed ProtocolEngine is the source.
            (this.protocols as any).protocols.forEach((p: any, id: string) => simProtocols.register(p));

            // Register extra protocols (Vetting Candidates)
            extraProtocols.forEach(p => simProtocols.register(p));

            // Simulating a few ticks of protocols
            try {
                // Trigger Protocols based on the new state
                const mutations = simProtocols.evaluate(time);

                // Apply Protocol Mutations to Sim State
                mutations.forEach(m => {
                    simState.applyTrusted({ metricId: m.metricId, value: m.value }, time.toString(), 'sim-protocol');
                });
            } catch (e) {
                // Protocol conflict or failure in sim
                // In Monte Carlo, this might count as a failure?
                // For now, silent catch to allow simulation to proceed with partial data, 
                // or maybe we should rethrow to signal 'System Crash'?
                // Let's assume protocol error = stability risk, but for MVP we ignore.
            }
        }

        // 5. Run Prediction
        const analyzer = new TrendAnalyzer(simState);
        return analyzer.forecast(targetId, horizon);
    }
}

// --- Strategy ---
export class HybridStrategyEngine {
    constructor(private simEngine: SimulationEngine) { }

    public compare(
        currentState: StateModel,
        action: Action,
        horizon: number
    ): { baseline: Forecast | null, simulated: Forecast | null, delta: number } {

        const baseline = this.simEngine.run(currentState, null, horizon);
        const simulated = this.simEngine.run(currentState, action, horizon);

        let delta = 0;
        if (baseline && simulated) {
            delta = simulated.predictedValue - baseline.predictedValue;
        }

        return { baseline, simulated, delta };
    }
}

