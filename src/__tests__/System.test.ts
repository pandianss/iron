
import { DeterministicTime, Budget } from '../L0/Kernel.js';
import type { BudgetType } from '../L0/Kernel.js';
import { generateKeyPair } from '../L0/Crypto.js';
import type { KeyPair } from '../L0/Crypto.js';
import { IdentityManager, DelegationEngine, CapabilitySet } from '../L1/Identity.js';
import type { Principal, Delegation } from '../L1/Identity.js';
import { StateModel, MetricRegistry, MetricType } from '../L2/State.js';
import { IntentFactory } from '../L2/IntentFactory.js';
import { SimulationEngine } from '../L3/Simulation.js';
import { ProtocolEngine } from '../L4/Protocol.js';
import type { Protocol } from '../L4/Protocol.js';
import { AuditLog } from '../L5/Audit.js';
import { GovernanceInterface } from '../L6/Interface.js';
import { GovernanceKernel } from '../Kernel.js';
import { Fuzzer } from '../Chaos/Fuzzer.js';

describe('Iron. Operationalization (Kernel & Guards)', () => {
    // Core
    let time: DeterministicTime;
    let identity: IdentityManager;
    let delegation: DelegationEngine;
    let auditLog: AuditLog;
    let registry: MetricRegistry;
    let state: StateModel;
    let protocol: ProtocolEngine;
    let kernel: GovernanceKernel;

    // Identities
    let adminKeys: KeyPair;
    let admin: Principal;

    beforeEach(() => {
        time = new DeterministicTime();
        adminKeys = generateKeyPair();

        identity = new IdentityManager();
        identity.register({
            id: 'admin',
            publicKey: adminKeys.publicKey,
            type: 'INDIVIDUAL',
            scopeOf: new CapabilitySet(['*']),
            parents: [],
            createdAt: '0:0',
            isRoot: true
        });
        admin = identity.get('admin')!;

        delegation = new DelegationEngine(identity);
        auditLog = new AuditLog();
        registry = new MetricRegistry();
        state = new StateModel(auditLog, registry, identity);

        registry.register({ id: 'load', description: '', type: MetricType.GAUGE });
        registry.register({ id: 'fan', description: '', type: MetricType.GAUGE });

        protocol = new ProtocolEngine(state);

        // Kernel Setup
        kernel = new GovernanceKernel(identity, delegation, state, protocol, auditLog, registry);
    });

    test('Atomic Execution Flow: Attempt -> Guard -> Execute -> Outcome', () => {
        const intent = IntentFactory.create('load', 50, admin.id, adminKeys.privateKey);

        const receipt = kernel.execute(intent);
        expect(receipt.status).toBe('COMMITTED');

        // Verify L5 Log: Should have ATTEMPT and SUCCESS (from State)
        const history = auditLog.getHistory();
        expect(history.length).toBeGreaterThanOrEqual(2);
        expect(history[0]!.status).toBe('ATTEMPT');
        expect(history[1]!.status).toBe('SUCCESS');

        expect(state.get('load')).toBe(50);
    });

    test('Guard Rejection: Invalid Signature', () => {
        const intent = IntentFactory.create('load', 50, admin.id, adminKeys.privateKey);
        intent.signature = 'bad';

        expect(() => kernel.execute(intent)).toThrow(/Kernel Reject: Invalid Signature/);
        expect(auditLog.getHistory().length).toBe(2);
    });

    test('Guard Rejection: Scope Violation', () => {
        const userKeys = generateKeyPair();
        identity.register({
            id: 'user',
            publicKey: userKeys.publicKey,
            type: 'INDIVIDUAL',
            scopeOf: CapabilitySet.empty(),
            parents: [],
            createdAt: '0:0'
        });

        const intent = IntentFactory.create('load', 50, 'user', userKeys.privateKey);

        expect(() => kernel.execute(intent)).toThrow(/Scope Violation/);
    });

    test('Protocol Conflict Rejection (Gap 2) - New Schema', () => {
        // Register P1: Controls 'fan'
        const p1: Protocol = {
            id: 'fan-control-1', name: 'FanControl1', category: 'Intent',
            preconditions: [{ type: 'METRIC_THRESHOLD', metricId: 'load', operator: '>', value: 80 }],
            execution: [{ type: 'MUTATE_METRIC', metricId: 'fan', mutation: 1 }]
        };
        protocol.register(p1);

        // Register P2: Controls 'fan' (Conflict)
        const p2: Protocol = {
            id: 'fan-control-2', name: 'FanControl2', category: 'Intent',
            preconditions: [{ type: 'METRIC_THRESHOLD', metricId: 'load', operator: '>', value: 80 }],
            execution: [{ type: 'MUTATE_METRIC', metricId: 'fan', mutation: 5 }]
        };
        protocol.register(p2);

        // Set Load > 80 to trigger both via Kernel
        const intent = IntentFactory.create('load', 90, admin.id, adminKeys.privateKey);

        // Execute via Kernel (Commit phase will trigger protocols and fail on conflict)
        expect(() => {
            kernel.execute(intent);
        }).toThrow(/Protocol Conflict/);
    });

    test('Chaos Fuzzer Run', async () => {
        const fuzzer = new Fuzzer(kernel, identity);
        await fuzzer.run(10);
    });
});
