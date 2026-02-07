
import { GovernanceKernel } from '../../kernel-core/Kernel.js';
import { StateModel } from '../../kernel-core/L2/State.js';
import { AuditLog } from '../../kernel-core/L5/Audit.js';
import { MetricRegistry, MetricType } from '../../kernel-core/L2/State.js';
import { ProtocolEngine } from '../../kernel-core/L4/Protocol.js';
import { IdentityManager } from '../../kernel-core/L1/Identity.js';
import { AuthorityEngine } from '../../kernel-core/L1/Identity.js';
import { GovernanceInterface } from '../../L6/Interface.js';
import { ConsoleServer } from './Server.js';

async function bootstrap() {
    const audit = new AuditLog();
    const registry = new MetricRegistry();
    const identity = new IdentityManager();
    const state = new StateModel(audit, registry, identity);
    const protocols = new ProtocolEngine(state);
    const authority = new AuthorityEngine(identity);

    const kernel = new GovernanceKernel(identity, authority, state, protocols, audit, registry);
    await kernel.boot();

    // Register some dummy Operant metrics for the UI demo
    registry.register({ id: 'operant.focus', description: 'Real-time Focus Level', type: MetricType.GAUGE });
    registry.register({ id: 'operant.training.volume', description: 'Training Volume', type: MetricType.GAUGE });
    registry.register({ id: 'tokens.user.balance', description: 'Token Balance', type: MetricType.GAUGE });
    registry.register({ id: 'operant.cognitive.load', description: 'Cognitive Load', type: MetricType.GAUGE });

    const now = `${Date.now()}:0`;
    await state.applyTrusted([{ metricId: 'operant.focus', value: 85 }], now, 'SYSTEM', undefined, 'gen-v-01');
    await state.applyTrusted([{ metricId: 'operant.training.volume', value: 450 }], now, 'SYSTEM', undefined, 'gen-v-01');
    await state.applyTrusted([{ metricId: 'tokens.user.balance', value: 1200 }], now, 'SYSTEM', undefined, 'gen-v-01');
    await state.applyTrusted([{ metricId: 'operant.cognitive.load', value: 35 }], now, 'SYSTEM', undefined, 'gen-v-01');

    // Register a dummy Habit protocol
    protocols.propose({
        id: 'writing-01',
        name: 'Daily Writing Discipline',
        version: '1.0.0',
        category: 'Habit',
        lifecycle: 'ACTIVE',
        execution: [],
        preconditions: [],
        triggerConditions: [],
        authorizedCapacities: [],
        stateTransitions: [],
        completionConditions: []
    } as any);

    const iface = new GovernanceInterface(kernel, state, audit);
    const server = new ConsoleServer(kernel, iface, 3000);

    server.start();
}

bootstrap().catch(console.error);
