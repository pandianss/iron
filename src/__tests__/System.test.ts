
import { DeterministicTime, Budget, BudgetType } from '../L0/Kernel';
import { generateKeyPair, KeyPair } from '../L0/Crypto';
import { IdentityManager, Principal } from '../L1/Identity';
import { StateModel, MetricRegistry, MetricType } from '../L2/State';
import { IntentFactory } from '../L2/IntentFactory';
import { TrendAnalyzer, SimulationEngine } from '../L3/Sim';
import { ProtocolEngine } from '../L4/Protocol';
import { AuditLog } from '../L5/Audit';
import { GovernanceInterface } from '../L6/Interface';

describe('Iron. Security Hardening', () => {
    // Core Components
    let time: DeterministicTime;
    let identity: IdentityManager;
    let auditLog: AuditLog;
    let registry: MetricRegistry;
    let state: StateModel;
    let sim: SimulationEngine;
    let protocol: ProtocolEngine;
    let iface: GovernanceInterface;

    // Admin Keys
    let adminKeys: KeyPair;
    let admin: Principal;

    beforeEach(() => {
        time = new DeterministicTime();

        // Setup Crypto Identity
        adminKeys = generateKeyPair();
        admin = {
            id: 'admin',
            publicKey: adminKeys.publicKey,
            type: 'INDIVIDUAL',
            validFrom: Date.now(),
            validUntil: Date.now() + 100000
        };

        identity = new IdentityManager();
        identity.register(admin);

        auditLog = new AuditLog();
        registry = new MetricRegistry();

        // Inject IdentityManager into State for Verification
        state = new StateModel(auditLog, registry, identity);

        registry.register({ id: 'load', description: '', type: MetricType.GAUGE });
        registry.register({ id: 'fan', description: '', type: MetricType.GAUGE });

        sim = new SimulationEngine(registry);
        protocol = new ProtocolEngine(state);
        iface = new GovernanceInterface(state, auditLog);
    });

    test('L0-L2: Signed Intent commits to L5 Log and updates L2 State', () => {
        const intent = IntentFactory.create(
            'load',
            50,
            admin.id,
            adminKeys.privateKey
        );
        state.apply(intent);

        // Check L2
        expect(state.get('load')).toBe(50);
        // Check L5
        expect(auditLog.getHistory().length).toBe(1);
        expect(auditLog.getHistory()[0].intent.intentId).toBe(intent.intentId);
    });

    test('L0-L2: Invalid Signature is Rejected', () => {
        const intent = IntentFactory.create(
            'load',
            50,
            admin.id,
            adminKeys.privateKey
        );
        // Tamper signature
        intent.signature = 'deadbeef';

        expect(() => {
            state.apply(intent);
        }).toThrow("Invalid Intent Signature");
    });

    test('L3: Simulation Signs its own Actions', () => {
        const budget = new Budget(BudgetType.RISK, 10);

        // Initial State with Valid Admin Signed Intent
        const intent = IntentFactory.create('load', 10, admin.id, adminKeys.privateKey);
        state.apply(intent);

        // Run Sim (internally generates SimAgent keys)
        const forecast = sim.run(state, { targetMetricId: 'load', mutation: 10 }, budget);

        expect(forecast).toBe(30);
        expect(budget.used).toBe(1);
    });

    test('L4: Protocol Executes with Authority Keys', () => {
        protocol.register({
            id: 'p1', triggerMetric: 'load', threshold: 80,
            actionMetric: 'fan', actionMutation: 100
        });

        // 1. Initial State
        state.apply(IntentFactory.create('load', 50, admin.id, adminKeys.privateKey));
        state.apply(IntentFactory.create('fan', 0, admin.id, adminKeys.privateKey));

        // exec with admin keys
        protocol.evaluateAndExecute(admin.id, adminKeys.privateKey, time.getNow());
        expect(state.get('fan')).toBe(0);

        // 2. Trigger
        state.apply(IntentFactory.create('load', 90, admin.id, adminKeys.privateKey));

        protocol.evaluateAndExecute(admin.id, adminKeys.privateKey, time.getNow());
        expect(state.get('fan')).toBe(100);
    });
});
