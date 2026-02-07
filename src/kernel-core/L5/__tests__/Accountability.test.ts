
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { AuditLog } from '../../L5/Audit.js';
import { IdentityManager, CapabilitySet } from '../../L1/Identity.js';
import { LogicalTimestamp } from '../../L0/Kernel.js';
import { SimulationEngine, MonteCarloEngine } from '../../L3/Simulation.js';
import { AccountabilityEngine } from '../Accountability.js';
import type { SLA } from '../Accountability.js';

describe('L5 Accountability Engine (Risk Awareness)', () => {
    let acc: AccountabilityEngine;
    let state: StateModel;
    let riskEngine: MonteCarloEngine;
    let identity: IdentityManager;
    let registry: MetricRegistry;

    const auth = {
        id: 'user1',
        publicKey: 'key',
        type: 'ACTOR' as const,
        alive: true,
        revoked: false,
        scopeOf: new CapabilitySet(['*']),
        parents: [],
        createdAt: '0:0'
    };

    beforeEach(() => {
        const audit = new AuditLog();
        registry = new MetricRegistry();
        identity = new IdentityManager();
        identity.register({
            ...auth,
            identityProof: 'TEST_KEY',
            status: 'ACTIVE'
        });
        identity.register({
            id: 'sys',
            publicKey: 'sys',
            type: 'SYSTEM',
            scopeOf: new CapabilitySet(['*']),
            parents: [],
            createdAt: '0:0',
            isRoot: true,
            identityProof: 'ROOT_PROOF',
            status: 'ACTIVE'
        });

        state = new StateModel(audit, registry, identity);
        const protocol = new ProtocolEngine(state);
        const sim = new SimulationEngine(registry, protocol);
        riskEngine = new MonteCarloEngine(sim); // Real Monte Carlo

        acc = new AccountabilityEngine(state, riskEngine);

        registry.register({ id: 'uptime', description: '', type: MetricType.GAUGE });
        registry.register({ id: 'leverage', description: '', type: MetricType.GAUGE });
        registry.register({ id: 'system.rewards', description: '', type: MetricType.GAUGE }); // Output metric for rewards
    });

    test('Should penalize purely based on Future Risk (Pre-crime)', async () => {
        // 3. Define SLA: Max 100. Risk Tolerance: 10% prob of failure.
        // Setup State: Leverage = 80 (Max is 100).
        // Trend: Increasing by 5 per tick.
        await state.applyTrusted([{ metricId: 'leverage', value: 70 }], '0:0', 'sys', undefined, 'test-val');
        await state.applyTrusted([{ metricId: 'leverage', value: 75 }], '1:0', 'sys', undefined, 'test-val');
        await state.applyTrusted([{ metricId: 'leverage', value: 80 }], '2:0', 'sys', undefined, 'test-val'); // Current

        // 3. Define SLA: Max 100. Risk Tolerance: 10% prob of failure.
        const safeLeverageSLA: SLA = {
            id: 'lev-sla',
            metricId: 'leverage',
            max: 100,
            windowTicks: 10,
            incentiveAmount: 10,
            penaltyAmount: 50,
            maxFailureProbability: 0.1 // Stict Risk Limit
        };

        acc.registerSLA(safeLeverageSLA);

        // 4. Evaluate
        // With current trend (+5), in 10 ticks => 80 + 50 = 130. 
        // Monte Carlo should detect ~100% failure prob.
        // Even though current (80) < Max (100), penalty should be applied due to Risk.

        await acc.evaluate(auth.id, LogicalTimestamp.fromString('3:0'));

        const rewards = state.get('system.rewards');
        console.log("Rewards after risk check:", rewards);

        // Should be negative (Penalty applied)
        expect(rewards).toBeLessThan(0);
        // Specifically -100 (-50 base penalty? No, wait. Is it compliant currently? Yes (80 < 100).
        // So logic:
        // if (compliant && !risky) -> Payout (+10)
        // else:
        //    if (!compliant) -> Penalty (-50)
        //    if (risky) -> Risk Penalty (-100)

        // Here: Compliant (Yes), Risky (Yes).
        // So Payload: -100.
        expect(rewards).toBe(-100);
    });

    test('Should payout if safe', async () => {
        await state.applyTrusted([{ metricId: 'leverage', value: 10 }], '0:0', 'sys', undefined, 'test-val');
        await state.applyTrusted([{ metricId: 'leverage', value: 10 }], '1:0', 'sys', undefined, 'test-val');

        const safeLeverageSLA: SLA = {
            id: 'lev-sla',
            metricId: 'leverage',
            max: 100,
            windowTicks: 10,
            incentiveAmount: 10,
            penaltyAmount: 50,
            maxFailureProbability: 0.1
        };
        acc.registerSLA(safeLeverageSLA);

        await acc.evaluate(auth.id, LogicalTimestamp.fromString('2:0'));
        expect(state.get('system.rewards')).toBe(10);
    });
});
