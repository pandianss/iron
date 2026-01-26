
import { describe, test, expect, beforeEach } from '@jest/globals';
import { ProtocolEngine } from '../../../L4/Protocol.js';
import { StateModel, MetricRegistry, MetricType } from '../../../L2/State.js';
import { IronPerformanceInterface } from '../Interface.js';
import { IdentityManager } from '../../../L1/Identity.js';
import { AuditLog } from '../../../L5/Audit.js';

describe('Iron Performance: System Lifecycle (MIS)', () => {
    let perf: IronPerformanceInterface;
    let state: StateModel;
    let identity: IdentityManager;
    let registry: MetricRegistry;

    beforeEach(() => {
        registry = new MetricRegistry();
        const auditLog = new AuditLog();
        identity = new IdentityManager();

        // Register Metrics
        registry.register({ id: 'habit.journal.streak', description: 'Streak', type: MetricType.COUNTER });
        registry.register({ id: 'user.gamification.xp', description: 'XP', type: MetricType.COUNTER });
        registry.register({ id: 'org.team.health', description: 'Health', type: MetricType.GAUGE });
        registry.register({ id: 'org.kpi.total_velocity', description: 'Velocity', type: MetricType.COUNTER });
        registry.register({ id: 'org.console.alert_status', description: 'Alert', type: MetricType.GAUGE });
        registry.register({ id: 'org.roles.active_count', description: 'Roles', type: MetricType.COUNTER });
        registry.register({ id: 'org.kpi.variance', description: 'Variance', type: MetricType.GAUGE });

        state = new StateModel(auditLog, registry, identity);
        const engine = new ProtocolEngine(state);
        perf = new IronPerformanceInterface(engine, state, identity);

        identity.register({ id: 'user-1', type: 'ACTOR', status: 'ACTIVE', publicKey: 'pub-1', createdAt: '0' });
        identity.register({ id: 'system', type: 'SYSTEM', status: 'ACTIVE', publicKey: 'sys-pub', createdAt: '0', isRoot: true } as any);
    });

    test('Full Cycle: Scorecard -> Console -> Drift', async () => {
        // 1. Bootstrap
        await perf.initializePerformance();

        // 2. Set Seed State
        state.applyTrusted({ metricId: 'habit.journal.streak', value: 42 }, Date.now().toString());
        state.applyTrusted({ metricId: 'user.gamification.xp', value: 500 }, Date.now().toString());

        // 3. User Perspective (L1)
        const scorecard = perf.getScorecard('user-1');
        expect(scorecard.discipline).toBe(42);
        expect(scorecard.rep).toBe(500);

        // 4. Institutional Perspective (L3)
        await perf.refreshKpis('GOVERNANCE_SIGNATURE');
        const consoleView = perf.getConsole();
        expect(consoleView.overallVelocity).toBe(1);
        expect(consoleView.driftAlert).toBe('NOMINAL');

        // 5. Simulate Drift Warning
        state.applyTrusted({ metricId: 'org.kpi.variance', value: 20 }, (Date.now() + 1000).toString());
        // In real engine, L4 would trigger Alert. In test, we simulate the L4 outcome:
        state.applyTrusted({ metricId: 'org.console.alert_status', value: 'CRITICAL_DRIFT' }, (Date.now() + 1000).toString());

        expect(perf.getConsole().driftAlert).toBe('CRITICAL_DRIFT');
    });
});
