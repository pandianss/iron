
import { ProtocolEngine } from './Protocol.js';
import type { ProtocolBundle } from './Protocol.js';
import { MonteCarloEngine } from '../L3/Simulation.js';
import { StateModel } from '../L2/State.js';

export class ProtocolMarket {
    constructor(
        private protocolEngine: ProtocolEngine,
        private riskEngine: MonteCarloEngine,
        private state: StateModel
    ) { }

    public async vet(bundle: ProtocolBundle): Promise<{ allowed: boolean; riskDelta: number; reason?: string }> {
        // 1. Baseline Risk (Current State)
        // We simulate "Inertia" (running 10 ticks forward with no action)
        const baselineRisk = await this.riskEngine.simulate(
            this.state,
            null, // No specific action, just system drift
            20,   // Horizon
            50,   // Runs
            0.1   // Volatility
        );

        // 2. Simulated Risk (With New Bundle)
        const simulatedRisk = await this.riskEngine.simulate(
            this.state,
            null,
            20,
            50,
            0.1,
            undefined, // Default failure ( < 0 )
            undefined, // Default metric
            bundle.protocols // <--- The Vetting!
        );

        const delta = simulatedRisk.probabilityOfFailure - baselineRisk.probabilityOfFailure;
        console.log(`[Market] Vetting '${bundle.bundleId}': Baseline Risk=${baselineRisk.probabilityOfFailure}, New Risk=${simulatedRisk.probabilityOfFailure}, Delta=${delta}`);

        // 3. Judgment
        // Zero Tolerance for Increased Risk in Month 4 MVP
        if (delta > 0) {
            return {
                allowed: false,
                riskDelta: delta,
                reason: `Risk increased by ${(delta * 100).toFixed(1)}%`
            };
        }

        return { allowed: true, riskDelta: delta };
    }

    public async install(bundle: ProtocolBundle, trustScope: string) {
        // 1. Algorithmic Vetting
        const vetting = await this.vet(bundle);
        if (!vetting.allowed) {
            throw new Error(`Market Violation: Bundle Rejected. Reason: ${vetting.reason}`);
        }

        // 2. Install
        this.protocolEngine.loadBundle(bundle, trustScope);
    }
}
