
import { describe, test, expect, beforeEach } from '@jest/globals';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { AuditLog } from '../../L5/Audit.js';
import { IdentityManager, CapabilitySet } from '../../L1/Identity.js';
import { SimulationEngine, MonteCarloEngine } from '../Simulation.js';

describe('L3 Simulation Engine (Stochastic)', () => {
    let sim: SimulationEngine;
    let monteCarlo: MonteCarloEngine;
    let state: StateModel;
    let registry: MetricRegistry;

    beforeEach(() => {
        const audit = new AuditLog();
        registry = new MetricRegistry();
        const identity = new IdentityManager();
        identity.register({ id: 'sys', publicKey: 'key', type: 'AGENT', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: '0:0', isRoot: true });

        state = new StateModel(audit, registry, identity);
        const protocols = new ProtocolEngine(state);

        sim = new SimulationEngine(registry, protocols);
        monteCarlo = new MonteCarloEngine(sim);

        registry.register({ id: 'cash', description: 'Cash Flow', type: MetricType.GAUGE });
    });

    test('Monte Carlo should capture variance', () => {
        // Setup history (Stable trend: 100, 100, 100)
        // With Action (+10) -> Expect 110.
        // With Volatility -> Expect distribution.

        state.applyTrusted({ metricId: 'cash', value: 100 }, '0:0', 'sys');
        state.applyTrusted({ metricId: 'cash', value: 100 }, '1:0', 'sys');
        state.applyTrusted({ metricId: 'cash', value: 100 }, '2:0', 'sys');

        const action = {
            id: 'invest',
            description: 'Invest',
            targetMetricId: 'cash',
            valueMutation: 10 // Base mutation
        };

        // Run Monte Carlo with High Volatility (0.5 = 50% variance on mutation)
        const risk = monteCarlo.simulate(state, action, 10, 100, 0.5);

        // Debug output
        console.log("Monte Carlo Result:", risk);

        expect(risk.metricId).toBe('cash');
        // Trend is Positive (100 -> 110). Linear Regression Extrapolates.
        // Mean should be > 130 given the slope.
        expect(risk.meanPredictedValue).toBeGreaterThan(130);

        // P10 and P90 should differ due to volatility
        expect(risk.p90).not.toBe(risk.p10);
        expect(risk.p90).toBeGreaterThan(risk.p10);
    });

    test('Scenario should detect Failure Probability (Bankruptcy)', () => {
        // Setup: Low Cash (10). Action: -8 cost.
        // Volatility 0.5 (50%). Expected cost could be -12 (Bankruptcy) or -4 (Safe).
        state.applyTrusted({ metricId: 'cash', value: 10 }, '0:0', 'sys');
        state.applyTrusted({ metricId: 'cash', value: 10 }, '1:0', 'sys');

        const riskyAction = {
            id: 'gamble',
            description: 'Gamble',
            targetMetricId: 'cash',
            valueMutation: -8
        };

        const risk = monteCarlo.simulate(state, riskyAction, 1, 100, 0.5);

        console.log("Bankruptcy Probability:", risk.probabilityOfFailure);

        // Some runs should result in < 0 (10 - 12 = -2)
        // Some runs should result in > 0 (10 - 4 = 6)
        expect(risk.probabilityOfFailure).toBeGreaterThan(0);
        expect(risk.probabilityOfFailure).toBeLessThan(1);
    });
});
