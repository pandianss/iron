
import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';
import { DeterministicTime } from '../../L0/Kernel.js';
import { IdentityManager, DelegationEngine, CapabilitySet } from '../../L1/Identity.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { AuditLog } from '../../L5/Audit.js';
import { GovernanceKernel } from '../../Kernel.js';
import { GovernanceInterface } from '../../L6/Interface.js';
import { SovereignApp } from '../App.js';
import { generateKeyPair } from '../../L0/Crypto.js';

describe('L7 Sovereign App', () => {
    let kernel: GovernanceKernel;
    let gateway: GovernanceInterface;
    let app: SovereignApp;
    let identity: IdentityManager;
    let state: StateModel;

    const userKeys = generateKeyPair();

    beforeEach(() => {
        const audit = new AuditLog();
        const registry = new MetricRegistry();
        identity = new IdentityManager();
        const delegation = new DelegationEngine(identity);
        state = new StateModel(audit, registry, identity);
        const protocol = new ProtocolEngine(state);

        identity.register({
            id: 'user',
            publicKey: userKeys.publicKey,
            type: 'INDIVIDUAL',
            scopeOf: new CapabilitySet(['*']),
            parents: [],
            createdAt: '0:0',
            isRoot: true
        });

        registry.register({ id: 'reputation', description: '', type: MetricType.GAUGE });

        kernel = new GovernanceKernel(identity, delegation, state, protocol, audit, registry);
        gateway = new GovernanceInterface(kernel, state, audit);
        app = new SovereignApp(gateway);
    });

    test('User Login & Action Execution', async () => {
        // 1. Login
        app.login('user', userKeys.privateKey);

        // 2. Perform Action via App -> Gateway -> Kernel
        const result = await app.performAction('act-1', { metricId: 'reputation', value: 100 });

        expect(result.status).toBe('COMMITTED');
        expect(result.txId).toBeDefined();

        // 3. Check Dashboard Reflection (Audit Trail)
        const dashboard = app.getDashboard();
        expect(dashboard.metrics['reputation']).toBe(100);
        expect(dashboard.history.length).toBeGreaterThanOrEqual(1);
        expect(dashboard.history[0].action).toBe('UPDATE:reputation');
    });

    test('Unauthenticated Action Should Fail', async () => {
        await expect(app.performAction('fail', { metricId: 'reputation', value: 0 }))
            .rejects.toThrow(/User unauthenticated/);
    });
});
