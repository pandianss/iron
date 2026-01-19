import { DeterministicTime } from '../../L0/Kernel.js';
import { IdentityManager, DelegationEngine, CapabilitySet } from '../../L1/Identity.js';
import type { Principal } from '../../L1/Identity.js';
import { MetricRegistry, MetricType, StateModel } from '../../L2/State.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import type { Protocol } from '../../L4/Protocol.js';
import { AuditLog } from '../../L5/Audit.js';
import { generateKeyPair } from '../../L0/Crypto.js';
import { GovernanceKernel } from '../../Kernel.js';
import { IntentFactory } from '../../L2/IntentFactory.js';

describe('L4 Protocol System', () => {
    let audit: AuditLog;
    let time: DeterministicTime;
    let registry: MetricRegistry;
    let identity: IdentityManager;
    let delegation: DelegationEngine;
    let state: StateModel;
    let engine: ProtocolEngine;
    let kernel: GovernanceKernel;

    const adminKeys = generateKeyPair();
    const admin: any = {
        id: 'admin',
        publicKey: adminKeys.publicKey,
        type: 'INDIVIDUAL',
        scopeOf: new CapabilitySet(['*']),
        parents: [],
        createdAt: '0:0',
        isRoot: true
    };

    beforeEach(() => {
        audit = new AuditLog();
        time = new DeterministicTime();
        registry = new MetricRegistry();
        identity = new IdentityManager();
        identity.register(admin);
        delegation = new DelegationEngine(identity);
        state = new StateModel(audit, registry, identity);

        registry.register({ id: 'temp', description: 'Temperature', type: MetricType.GAUGE });
        registry.register({ id: 'fan', description: 'Fan Speed', type: MetricType.GAUGE });

        engine = new ProtocolEngine(state);
        kernel = new GovernanceKernel(identity, delegation, state, engine, audit, registry);
    });

    test('should trigger protocol when condition met', () => {
        const coolingProtocol: Protocol = {
            id: 'p-cool',
            name: 'Cooling Logic',
            category: 'Intent',
            preconditions: [{
                type: 'METRIC_THRESHOLD',
                metricId: 'temp',
                operator: '>',
                value: 30
            }],
            execution: [{
                type: 'MUTATE_METRIC',
                metricId: 'fan',
                mutation: 10
            }]
        };

        engine.register(coolingProtocol);

        // Case 1: Temp = 20 (No Trigger)
        kernel.execute(IntentFactory.create('temp', 20, admin.id, adminKeys.privateKey, '0:1'));
        kernel.execute(IntentFactory.create('fan', 0, admin.id, adminKeys.privateKey, '0:2'));
        expect(state.get('fan')).toBe(0);

        // Case 2: Temp = 35 (Trigger)
        kernel.execute(IntentFactory.create('temp', 35, admin.id, adminKeys.privateKey, '0:3'));
        expect(state.get('fan')).toBe(10);
    });

    test('should execute multiple rules', () => {
        const coolingProtocol: Protocol = {
            id: 'p-cool',
            name: 'Cooling',
            category: 'Intent',
            preconditions: [{ type: 'METRIC_THRESHOLD', metricId: 'temp', operator: '>', value: 30 }],
            execution: [
                { type: 'MUTATE_METRIC', metricId: 'fan', mutation: 50 },
                { type: 'MUTATE_METRIC', metricId: 'temp', mutation: -5 }
            ]
        };
        engine.register(coolingProtocol);

        kernel.execute(IntentFactory.create('fan', 10, admin.id, adminKeys.privateKey, '0:4'));
        kernel.execute(IntentFactory.create('temp', 40, admin.id, adminKeys.privateKey, '0:5'));

        expect(state.get('fan')).toBe(60);
        expect(state.get('temp')).toBe(35);
    });
});
