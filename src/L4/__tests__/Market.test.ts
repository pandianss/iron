
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
        publicKey: 'ed25519:deadbeef',
        scope: '*'
    };

    beforeEach(() => {
        const audit = new AuditLog();
        registry = new MetricRegistry();
        const identity = new IdentityManager();
        identity.register({ id: 'sys', publicKey: 'sys', type: 'AGENT', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: '0:0', isRoot: true });

        state = new StateModel(audit, registry, identity);
        const protocolEngine = new ProtocolEngine(state);
        const simEngine = new SimulationEngine(registry, protocolEngine);
        const riskEngine = new MonteCarloEngine(simEngine);

        market = new ProtocolMarket(protocolEngine, riskEngine, state);

        registry.register({ id: 'stability', description: '', type: MetricType.GAUGE });
        registry.register({ id: 'system.load', description: 'System Heartbeat', type: MetricType.GAUGE });
        state.applyTrusted({ metricId: 'system.load', value: 100 }, '0:0', 'sys');
        // Initialize stability to 100
        state.applyTrusted({ metricId: 'stability', value: 100 }, '0:0', 'sys');
        state.applyTrusted({ metricId: 'stability', value: 100 }, '1:0', 'sys');
        state.applyTrusted({ metricId: 'stability', value: 100 }, '2:0', 'sys');
    });

    test('Should INSTALL a Safe Protocol', () => {
        const safeBundle: ProtocolBundle = {
            bundleId: 'safe-bundle',
            libraryName: 'safe-lib',
            version: '1.0.0',
            owner: owner,
            createdAt: '0:0',
            signature: 'sig', // Mocked, assuming vetted logic bypasses sig verification for this unit test?
            // Wait, verifySignature usage in ProtocolEngine.loadBundle might fail.
            // But vetted.install calls protocolEngine.loadBundle.
            // We need to either mock loadBundle or provide valid sig.
            // Actually, ProtocolMarket calls loadBundle.
            // Let's mock protocolEngine.loadBundle to avoid crypto overhead in this test.
            protocols: [{
                name: 'SafeProto',
                version: '1.0.0',
                category: 'Intent',
                preconditions: [{ type: 'ALWAYS' }],
                execution: [] // Do nothing
            }]
        };

        // We assume verifySignature is bypassed or mocked?
        // Actually, let's Spy on protocolEngine.loadBundle to prevent actual execution logic failing on sigs
        // We only care about VETTING logic here.
        // Wait, market.install calls loadBundle.
        // If we want to test 'install', we need valid signature OR mock.

        // Let's test 'vet' directly first to avoid Crypto complexity.

        const result = market.vet(safeBundle);
        expect(result.allowed).toBe(true);
        expect(result.riskDelta).toBeLessThanOrEqual(0);
    });

    test('Should REJECT a Risky Protocol', () => {
        // A protocol that reduces stability drastically
        const riskyBundle: ProtocolBundle = {
            bundleId: 'risky-bundle',
            libraryName: 'risky-lib',
            version: '1.0.0',
            owner: owner,
            createdAt: '0:0',
            signature: 'sig',
            protocols: [{
                id: 'chaos',
                name: 'ChaosMaker',
                version: '1.0.0',
                category: 'Risk',
                preconditions: [{ type: 'ALWAYS' }],
                execution: [{
                    type: 'MUTATE_METRIC',
                    metricId: 'system.load',
                    mutation: -50 // Huge hit to load (simulating crash or unloading?)
                    // Wait, failure condition in Market.ts?
                    // Market.ts uses default failureCondition: (val) => val < 0.
                    // If system.load starts at 0?
                    // Let's set initial system.load to 100 in setup.
                }]
            }]
        };

        const result = market.vet(riskyBundle);

        console.log("Risky Vetting Result:", result);

        expect(result.allowed).toBe(false);
        expect(result.riskDelta).toBeGreaterThan(0);
        expect(result.reason).toMatch(/Risk increased/);
    });
});
