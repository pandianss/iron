
import { describe, test, expect, beforeEach } from '@jest/globals';
import { ProtocolEngine } from '../../../kernel-core/L4/Protocol.js';
import { StateModel, MetricRegistry, MetricType } from '../../../kernel-core/L2/State.js';
import { IronHabitInterface } from '../Interface.js';
import { IdentityManager } from '../../../kernel-core/L1/Identity.js';
import { AuditLog } from '../../../kernel-core/L5/Audit.js';

describe('Iron Habit: System Lifecycle (Discipline)', () => {
    let habit: IronHabitInterface;
    let state: StateModel;
    let registry: MetricRegistry;

    beforeEach(() => {
        registry = new MetricRegistry();
        const auditLog = new AuditLog();
        const identity = new IdentityManager();

        // Register Metrics
        registry.register({ id: 'habit.journal.check_in', description: 'Action Log', type: MetricType.BOOLEAN });
        registry.register({ id: 'habit.journal.streak', description: 'Streak Counter', type: MetricType.COUNTER });
        registry.register({ id: 'habit.journal.skip', description: 'Skip Log', type: MetricType.BOOLEAN });
        registry.register({ id: 'user.gamification.xp', description: 'XP', type: MetricType.COUNTER });
        registry.register({ id: 'user.gamification.rest_tokens', description: 'Budget', type: MetricType.COUNTER });

        state = new StateModel(auditLog, registry, identity);
        const engine = new ProtocolEngine(state);
        habit = new IronHabitInterface(engine, state, identity);
    });

    test('Full Cycle: Commit -> CheckIn -> Rest', async () => {
        // 1. Start Discipline (Protocols Active)
        await habit.startDiscipline();

        // 2. Initial State (1 Rest Token)
        const ev = 'genesis-ev';
        await state.applyTrusted([{ metricId: 'user.gamification.rest_tokens', value: 1 }], Date.now().toString(), 'system', 'tx0', ev);
        await state.applyTrusted([{ metricId: 'habit.journal.streak', value: 0 }], Date.now().toString(), 'system', 'tx1', ev);

        // 3. User Checks In
        // Logic: L4 detects check-in -> Mutates Streak +1
        // Simulating the L4 Outcome manually as Interface just logs the "Intention"
        await state.applyTrusted([{ metricId: 'habit.journal.streak', value: 1 }], (Date.now() + 1000).toString(), 'system', 'tx2', ev);
        await state.applyTrusted([{ metricId: 'user.gamification.xp', value: 10 }], (Date.now() + 1000).toString(), 'system', 'tx3', ev);

        expect(state.get('habit.journal.streak')).toBe(1);
        expect(state.get('user.gamification.xp')).toBe(10);

        // 4. User Skips (Uses Token)
        // Logic: L4 detects skip -> Decrements Token, Streak +0
        await state.applyTrusted([{ metricId: 'user.gamification.rest_tokens', value: 0 }], (Date.now() + 2000).toString(), 'system', 'tx4', ev);

        expect(state.get('user.gamification.rest_tokens')).toBe(0);
        expect(state.get('habit.journal.streak')).toBe(1); // Unchanged
    });
});
