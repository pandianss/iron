import { GovernanceKernel } from '../Kernel.js';
import { IdentityManager, DelegationEngine, CapabilitySet } from '../L1/Identity.js';
import { StateModel, MetricRegistry, MetricType } from '../L2/State.js';
import { ProtocolEngine } from '../L4/Protocol.js';
import { AuditLog } from '../L5/Audit.js';
import { IntentFactory } from '../L2/IntentFactory.js';
import { generateKeyPair } from '../L0/Crypto.js';
import { Budget } from '../L0/Kernel.js';

describe('Iron-5 Compliance (Section 8)', () => {
    let kernel: GovernanceKernel;
    let auditLog: AuditLog;
    let state: StateModel;
    let identity: IdentityManager;
    let delegation: DelegationEngine;
    let protocols: ProtocolEngine;
    let registry: MetricRegistry;

    const rootKeys = generateKeyPair();

    beforeEach(() => {
        auditLog = new AuditLog();
        registry = new MetricRegistry();
        identity = new IdentityManager();

        // Register ROOT
        identity.register({
            id: 'root',
            publicKey: rootKeys.publicKey,
            type: 'INDIVIDUAL',
            scopeOf: new CapabilitySet(['*']),
            parents: [],
            createdAt: '0:0',
            isRoot: true
        });

        delegation = new DelegationEngine(identity);
        state = new StateModel(auditLog, registry, identity);
        protocols = new ProtocolEngine(state);
        kernel = new GovernanceKernel(identity, delegation, state, protocols, auditLog, registry);

        registry.register({ id: 'metric.a', description: '', type: MetricType.GAUGE });
        registry.register({ id: 'metric.b', description: '', type: MetricType.GAUGE });
    });

    test('C-1: Authority Non-Escalation (Section 5.2)', () => {
        // Root creates Admin A with GOVERNANCE power
        kernel.createIdentity('root', {
            id: 'admin_a',
            publicKey: rootKeys.publicKey,
            type: 'INDIVIDUAL',
            scopeOf: new CapabilitySet(['GOVERNANCE:*', 'METRIC.WRITE:metric.a'])
        });

        // Root grants 'metric.a' to Admin A
        kernel.grantDelegation('root', 'root', 'admin_a', ['METRIC.WRITE:metric.a'], 9999);
        // Root grants IDENTITY.DELEGATE to Admin A
        kernel.grantDelegation('root', 'root', 'admin_a', ['GOVERNANCE:IDENTITY.DELEGATE'], 9999);

        // Root creates User
        kernel.createIdentity('root', {
            id: 'user',
            publicKey: generateKeyPair().publicKey,
            type: 'INDIVIDUAL',
            scopeOf: new CapabilitySet(['*'])
        });

        // admin_a tries to grant 'metric.b' to User (Escalation Attempt)
        expect(() => {
            kernel.grantDelegation('admin_a', 'admin_a', 'user', ['METRIC.WRITE:metric.b'], 9999);
        }).toThrow(/Grant Error: Scope Amplification/);
    });

    test('C-2: Revocation Propagation (Section 6.2)', () => {
        const userKeys = generateKeyPair();
        // parent needs GOVERNANCE:* in scopeOf to hold delegated power
        kernel.createIdentity('root', {
            id: 'parent',
            publicKey: userKeys.publicKey,
            type: 'INDIVIDUAL',
            scopeOf: new CapabilitySet(['*'])
        });
        kernel.grantDelegation('root', 'root', 'parent', ['*'], 9999);

        kernel.createIdentity('root', {
            id: 'child',
            publicKey: generateKeyPair().publicKey,
            type: 'INDIVIDUAL',
            scopeOf: new CapabilitySet(['*'])
        });
        kernel.grantDelegation('parent', 'parent', 'child', ['METRIC.WRITE:metric.a'], 9999);

        // Verify child is authorized
        expect(delegation.authorized('child', 'METRIC.WRITE:metric.a')).toBe(true);

        // Revoke parent
        kernel.revokeIdentity('root', 'parent');

        // Verify child is NO LONGER authorized
        expect(delegation.authorized('child', 'METRIC.WRITE:metric.a')).toBe(false);
    });

    test('C-3: Atomic Commit Safety (Section 3.3)', () => {
        // Initialize state
        state.applyTrusted({ metricId: 'metric.a', value: 0 }, '0:0');

        // We simulate a protocol that attempts to mutate a non-existent metric or causes an error
        protocols.register({
            id: 'p-crash',
            name: 'Crash Protocol',
            category: 'Intent',
            preconditions: [{ type: 'METRIC_THRESHOLD', metricId: 'metric.a', operator: '>=', value: 0 }],
            execution: [{ type: 'MUTATE_METRIC', metricId: 'NON_EXISTENT', mutation: 1 }]
        });

        const intent = IntentFactory.create('metric.a', 20, 'root', rootKeys.privateKey, '0:10');

        // commitAttempt should fail because of 'NON_EXISTENT' metric mutation error in side-effects
        expect(() => kernel.execute(intent)).toThrow(/Kernel Halt: Commit Failed/);

        // VERIFY ATOMICITY: metric.a SHOULD NOT HAVE CHANGED TO 20 if side-effects failed
        expect(state.get('metric.a')).toBe(0);
    });

    test('C-4: Log Immutability (Section 2.6)', () => {
        kernel.execute(IntentFactory.create('metric.a', 5, 'root', rootKeys.privateKey, '0:20'));

        const history = auditLog.getHistory();
        const lastEntry = history[history.length - 1]!;
        const originalHash = lastEntry.hash;

        // Attempt to tamper with log (simulated)
        lastEntry.status = 'SUCCESS_TAMPERED' as any;

        // verifyIntegrity should detect tampering
        expect(auditLog.verifyIntegrity()).toBe(false);
    });
});
