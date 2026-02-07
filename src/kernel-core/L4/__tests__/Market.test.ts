
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { ProtocolEngine } from '../Protocol.js';
import type { ProtocolBundle } from '../Protocol.js';
import { ProtocolMarket } from '../Market.js';
import { MonteCarloEngine, SimulationEngine } from '../../L3/Simulation.js';
import { IdentityManager, CapabilitySet } from '../../L1/Identity.js';
import { AuditLog } from '../../L5/Audit.js';

describe('L4 Protocol Market (Safety Vetting)', () => {
    let market: ProtocolMarket;
    let state: StateModel;
    let registry: MetricRegistry;

    const owner = {
        entityId: 'u1',
        publicKey: 'ed25519:deadbeef'
    };

    beforeEach(() => {
        const audit = new AuditLog();
        registry = new MetricRegistry();
        const identity = new IdentityManager();
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
        const protocolEngine = new ProtocolEngine(state);
        const simEngine = new SimulationEngine(registry, protocolEngine);
        const riskEngine = new MonteCarloEngine(simEngine);

        market = new ProtocolMarket(protocolEngine, riskEngine, state);

        registry.register({ id: 'stability', description: '', type: MetricType.GAUGE });
        registry.register({ id: 'system.load', description: 'System Heartbeat', type: MetricType.GAUGE });

        // Use an async setup or wrap in IIFE if needed, but here we can just do it in each test or the beforeAll
        // Actually, beforeEach is fine if we await
    });

    test('Should INSTALL a Safe Protocol', async () => {
        await state.applyTrusted([{ metricId: 'system.load', value: 100 }], '0:0', 'sys', undefined, 'init');
        await state.applyTrusted([{ metricId: 'stability', value: 100 }], '0:0', 'sys', undefined, 'init');

        const safeBundle: ProtocolBundle = {
            bundleId: 'safe-bundle',
            owner: owner,
            signature: 'sig',
            protocols: [{
                id: 'safe-p',
                name: 'SafeProto',
                version: '1.0.0',
                category: 'Intent',
                lifecycle: 'ACTIVE',
                preconditions: [{ type: 'ALWAYS' }],
                triggerConditions: [],
                authorizedCapacities: [],
                stateTransitions: [],
                completionConditions: [],
                execution: []
            }]
        };

        const result = await market.vet(safeBundle);
        expect(result.allowed).toBe(true);
        expect(result.riskDelta).toBeLessThanOrEqual(0);
    });

    test('Should REJECT a Risky Protocol', async () => {
        await state.applyTrusted([{ metricId: 'system.load', value: 100 }], '0:0', 'sys', undefined, 'init');
        await state.applyTrusted([{ metricId: 'stability', value: 100 }], '0:0', 'sys', undefined, 'init');

        // A protocol that reduces stability drastically
        const riskyBundle: ProtocolBundle = {
            bundleId: 'risky-bundle',
            owner: owner,
            signature: 'sig',
            protocols: [{
                id: 'chaos',
                name: 'ChaosMaker',
                version: '1.0.0',
                category: 'Risk',
                lifecycle: 'ACTIVE',
                preconditions: [{ type: 'ALWAYS' }],
                triggerConditions: [],
                authorizedCapacities: [],
                stateTransitions: [],
                completionConditions: [],
                execution: [{
                    type: 'MUTATE_METRIC',
                    metricId: 'system.load',
                    mutation: -50
                }]
            }]
        };

        const result = await market.vet(riskyBundle);

        console.log("Risky Vetting Result:", result);

        expect(result.allowed).toBe(false);
        expect(result.riskDelta).toBeGreaterThan(0);
        expect(result.reason).toMatch(/Risk increased/);
    });
});
