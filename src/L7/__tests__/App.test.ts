
import { describe, test, expect, beforeEach } from '@jest/globals';
import { DeterministicTime } from '../../kernel-core/L0/Kernel.js';
import { IdentityManager, AuthorityEngine } from '../../kernel-core/L1/Identity.js';
import { StateModel, MetricRegistry, MetricType } from '../../kernel-core/L2/State.js';
import { ProtocolEngine } from '../../kernel-core/L4/Protocol.js';
import { AuditLog } from '../../kernel-core/L5/Audit.js';
import { GovernanceKernel } from '../../kernel-core/Kernel.js';
import { GovernanceInterface } from '../../L6/Interface.js';
import { SovereignApp } from '../App.js';
import { generateKeyPair } from '../../kernel-core/L0/Crypto.js';

describe('L7 Sovereign App', () => {
    let kernel: GovernanceKernel;
    let gateway: GovernanceInterface;
    let app: SovereignApp;
    let identity: IdentityManager;
    let state: StateModel;
    let authority: AuthorityEngine;

    const userKeys = generateKeyPair();

    beforeEach(() => {
        const audit = new AuditLog();
        const registry = new MetricRegistry();
        identity = new IdentityManager();
        authority = new AuthorityEngine(identity);
        state = new StateModel(audit, registry, identity);
        const protocol = new ProtocolEngine(state);

        identity.register({
            id: 'user',
            publicKey: userKeys.publicKey,
            type: 'ACTOR',
            identityProof: 'SYSTEM_GENESIS',
            status: 'ACTIVE',
            createdAt: '0:0',
            isRoot: true
        });

        registry.register({ id: 'reputation', description: '', type: MetricType.GAUGE });

        kernel = new GovernanceKernel(identity, authority, state, protocol, audit, registry);
        gateway = new GovernanceInterface(kernel, state, audit);
        kernel.boot();

        const mockWallet = {} as any;
        const mockHabit = { checkIn: async () => ({}) } as any;
        const mockTeam = { syncTeam: async () => ({}) } as any;
        const mockPerformance = {
            getScorecard: () => ({ authority: {}, discipline: {} }),
            getConsole: () => ({ orgHealth: {}, overallVelocity: {}, driftAlert: {} })
        } as any;
        const mockIntelligence = { runWhatIf: async () => ({}) } as any;

        app = new SovereignApp(
            gateway,
            mockWallet,
            mockHabit,
            mockTeam,
            mockPerformance,
            mockIntelligence
        );
    });

    test('User Login & Action Execution', async () => {
        // 1. Login
        app.login('user', userKeys);

        // 2. Perform Action via App -> Gateway -> Kernel
        const result = await app.performAction('act-1', { metricId: 'reputation', value: 100 });

        expect(result.status).toBe('COMMITTED');
        expect(result.txId).toBeDefined();

        // 3. Check Dashboard Reflection (Audit Trail)
        const dashboard = app.getDashboard();
        expect(dashboard.metrics['reputation'].value).toBe(100);
        expect((await (gateway as any).getRecentAudits()).length).toBeGreaterThanOrEqual(1);
    });

    test('Unauthenticated Action Should Fail', async () => {
        // App expects login or it throws
        await expect(app.performAction('fail', { metricId: 'reputation', value: 0 }))
            .rejects.toThrow(/App Error: User unauthenticated/);
    });
});
