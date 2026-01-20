import { GovernanceKernel } from '../Kernel.js';
import { IdentityManager, DelegationEngine, CapabilitySet } from '../L1/Identity.js';
import { StateModel, MetricRegistry, MetricType } from '../L2/State.js';
import { ProtocolEngine } from '../L4/Protocol.js';
import { AuditLog } from '../L5/Audit.js';
import { generateKeyPair } from '../L0/Crypto.js';
import { GovernanceInterface } from '../L6/Interface.js';
import { SovereignApp } from '../L7/App.js';

describe('IRON L7 Application Layer', () => {
    let app: SovereignApp;
    let kernel: GovernanceKernel;
    let gateway: GovernanceInterface;
    let state: StateModel;

    const userKeys = generateKeyPair();

    beforeEach(() => {
        const identity = new IdentityManager();
        const registry = new MetricRegistry();
        const audit = new AuditLog();
        const protocols = new ProtocolEngine(new StateModel(audit, registry, identity)); // Dummy for setup

        // Register Root
        const rootKeys = generateKeyPair();
        identity.register({ id: 'root', publicKey: rootKeys.publicKey, type: 'INDIVIDUAL', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: '0:0', isRoot: true });

        // Register User
        identity.register({
            id: 'alice',
            publicKey: userKeys.publicKey,
            type: 'INDIVIDUAL',
            scopeOf: new CapabilitySet(['*'])
        });

        registry.register({ id: 'reputation', description: '', type: MetricType.GAUGE });
        registry.register({ id: 'commitment', description: '', type: MetricType.GAUGE });

        state = new StateModel(audit, registry, identity);
        kernel = new GovernanceKernel(identity, new DelegationEngine(identity), state, new ProtocolEngine(state), audit, registry);
        gateway = new GovernanceInterface(state, audit);

        // Grant Alice authority (Section 1.3)
        kernel.grantDelegation('root', 'root', 'alice', ['METRIC.WRITE:reputation', 'METRIC.WRITE:commitment'], 9999);

        app = new SovereignApp(kernel, gateway);
    });

    test('E2E User Flow: Login -> Action -> Dashboard', async () => {
        // 1. Login
        app.login('alice', userKeys.privateKey);

        // 2. Perform Action
        const result = await app.performAction('CHECKIN', { metricId: 'reputation', value: 100 });
        expect(result.status).toBe('COMMITTED');

        // 3. Verify Dashboard
        const dashboard = app.getDashboard();
        expect(dashboard.userId).toBe('alice');
        expect(dashboard.metrics['reputation']).toBe(100);
        expect(dashboard.history.length).toBeGreaterThan(0);

        // Audit Transparency Check
        expect(dashboard.history[0].proof).toBeDefined();
        expect(dashboard.history[0].action).toBe('UPDATE:reputation');
    });

    test('Unauthenticated Rejection', async () => {
        await expect(app.performAction('STOLEN', { metricId: 'reputation', value: 1000 }))
            .rejects.toThrow(/App Error: User unauthenticated/);
    });
});
