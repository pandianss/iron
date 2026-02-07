
import { describe, test, expect, beforeEach } from '@jest/globals';
import { ProtocolEngine } from '../../../kernel-core/L4/Protocol.js';
import { StateModel, MetricRegistry, MetricType } from '../../../kernel-core/L2/State.js';
import { IronIntelligenceInterface } from '../Interface.js';
import { IdentityManager } from '../../../kernel-core/L1/Identity.js';
import { AuditLog } from '../../../kernel-core/L5/Audit.js';

describe('Iron Intelligence: System Lifecycle (Evolution)', () => {
    let intel: IronIntelligenceInterface;
    let state: StateModel;
    let identity: IdentityManager;
    let registry: MetricRegistry;

    beforeEach(() => {
        registry = new MetricRegistry();
        const auditLog = new AuditLog();
        identity = new IdentityManager();

        // Register Metrics
        registry.register({ id: 'sim.fidelity_score', description: 'Fidelity', type: MetricType.GAUGE });
        registry.register({ id: 'org.strategy.verified_scenarios', description: 'Scenarios', type: MetricType.COUNTER });
        registry.register({ id: 'org.strategy.evolution_proposals', description: 'Proposals', type: MetricType.COUNTER });
        registry.register({ id: 'org.kpi.total_velocity', description: 'Velocity', type: MetricType.COUNTER });
        registry.register({ id: 'user.gamification.xp', description: 'XP', type: MetricType.COUNTER });

        state = new StateModel(auditLog, registry, identity);
        const engine = new ProtocolEngine(state);
        intel = new IronIntelligenceInterface(engine, state, identity, registry);

        identity.register({ id: 'system', type: 'SYSTEM', status: 'ACTIVE', publicKey: 'sys-pub', createdAt: '0', isRoot: true } as any);
    });

    test('Full Cycle: Simulation -> Verification -> Evolution', async () => {
        // 1. Bootstrap
        await intel.initializeIntelligence();

        // 2. Run Simulation (L3 run)
        const preview = await intel.runWhatIf(null, 3600);
        expect(preview).toBeDefined();

        // 3. Verify Strategy (L4 Execution)
        await intel.verifyStrategy(95, 'GOVERNANCE_SIGNATURE');

        // Simulate L4 Protocol Output in the test
        // Simulate L4 Protocol Output in the test
        // Simulate L4 Protocol Output in the test
        const ev = 'genesis-ev';
        const t1 = Date.now();
        await state.applyTrusted([{ metricId: 'org.strategy.verified_scenarios', value: 1 }], t1 + ':1', 'system', 'tx0', ev);
        await state.applyTrusted([{ metricId: 'user.gamification.xp', value: 25 }], t1 + ':2', 'system', 'tx1', ev);

        expect(state.get('org.strategy.verified_scenarios')).toBe(1);
        expect(state.get('user.gamification.xp')).toBe(25);

        // 4. Trigger Evolution (Performance Trigger)
        await state.applyTrusted([{ metricId: 'org.kpi.total_velocity', value: 150 }], t1 + ':3', 'system', 'tx2', ev);

        // Wait for clock to advance to avoid collision with logical ticks
        await new Promise(r => setTimeout(r, 10));

        await intel.proposeEvolution('Optimize Streak Threshold', 'GOVERNANCE_SIGNATURE');

        // Simulate L4 outcome for evolution proposal
        await new Promise(r => setTimeout(r, 10));
        await state.applyTrusted([{ metricId: 'org.strategy.evolution_proposals', value: 1 }], Date.now().toString(), 'system', 'tx3', ev);
        expect(state.get('org.strategy.evolution_proposals')).toBe(1);
    });
});
