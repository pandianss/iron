
import { describe, test, expect, beforeEach } from '@jest/globals';
import { ProtocolEngine } from '../../../kernel-core/L4/Protocol.js';
import { StateModel, MetricRegistry, MetricType } from '../../../kernel-core/L2/State.js';
import { IronWalletInterface } from '../Interface.js';
import { IdentityManager } from '../../../kernel-core/L1/Identity.js';
import { AuditLog } from '../../../kernel-core/L5/Audit.js';

describe('Iron Wallet: System Lifecycle (Death & Resurrection)', () => {
    let wallet: IronWalletInterface;
    let state: StateModel;
    let engine: ProtocolEngine;
    let registry: MetricRegistry;

    beforeEach(() => {
        // Init Dependencies
        registry = new MetricRegistry();
        const auditLog = new AuditLog();
        const identity = new IdentityManager();

        // Register Metrics (Required by L2)
        registry.register({ id: 'user.activity.days_since_last_seen', description: 'Days inactive', type: MetricType.COUNTER });
        registry.register({ id: 'user.authority.state', description: 'Authority Level', type: MetricType.GAUGE });
        registry.register({ id: 'access.request.emergency_active', description: 'Emergency Flag', type: MetricType.BOOLEAN });
        registry.register({ id: 'access.nominee.visibility', description: 'Nominee Access', type: MetricType.GAUGE });
        registry.register({ id: 'user.vault.health_directive.access', description: 'Vault Access', type: MetricType.BOOLEAN });
        registry.register({ id: 'audit.log.critical_event', description: 'Audit', type: MetricType.GAUGE });
        registry.register({ id: 'security.quorum.guardians_approved', description: 'Quorum', type: MetricType.GAUGE });
        registry.register({ id: 'security.quorum.veto_active', description: 'Veto', type: MetricType.BOOLEAN });
        registry.register({ id: 'system.notification.queue', description: 'Queue', type: MetricType.GAUGE });

        state = new StateModel(auditLog, registry, identity);
        engine = new ProtocolEngine(state);
        wallet = new IronWalletInterface(engine, state, identity);
    });

    test('Full Cycle: Initialize -> Warning -> Lazarus Reset', async () => {
        // 1. Bootstrap
        await wallet.initializeWallet();

        // 2. Set Initial State
        const ev = 'genesis-ev';
        await state.applyTrusted([{ metricId: 'user.activity.days_since_last_seen', value: 0 }], Date.now().toString(), 'system', 'tx0', ev);
        await state.applyTrusted([{ metricId: 'user.authority.state', value: 'ACTIVE' }], Date.now().toString(), 'system', 'tx1', ev);

        // 3. Simulate Time Jump (Sequence of Events)

        // Event A: Protocol Logic runs, State moves to WARNING
        await state.applyTrusted([{ metricId: 'user.authority.state', value: 'WARNING' }], (Date.now() + 1000).toString(), 'system', 'tx2', ev);

        // Verify Warning State
        expect(state.get('user.authority.state')).toBe('WARNING');

        // Event B: Lazarus Trigger (Simulated Reset)
        await state.applyTrusted([{ metricId: 'user.authority.state', value: 'ACTIVE' }], (Date.now() + 2000).toString(), 'system', 'tx3', ev);
        await state.applyTrusted([{ metricId: 'user.activity.days_since_last_seen', value: 0 }], (Date.now() + 2000).toString(), 'system', 'tx4', ev);

        // Verify L2 State Updated
        expect(state.get('user.activity.days_since_last_seen')).toBe(0);
        expect(state.get('user.authority.state')).toBe('ACTIVE');
    });
});
