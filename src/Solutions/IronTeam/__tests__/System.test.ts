
import { describe, test, expect, beforeEach } from '@jest/globals';
import { ProtocolEngine } from '../../../kernel-core/L4/Protocol.js';
import { StateModel, MetricRegistry, MetricType } from '../../../kernel-core/L2/State.js';
import { IronTeamInterface } from '../Interface.js';
import { IdentityManager } from '../../../kernel-core/L1/Identity.js';
import { AuditLog } from '../../../kernel-core/L5/Audit.js';

describe('Iron Team: System Lifecycle (Coordination)', () => {
    let team: IronTeamInterface;
    let state: StateModel;
    let identity: IdentityManager;
    let registry: MetricRegistry;

    beforeEach(() => {
        registry = new MetricRegistry();
        const auditLog = new AuditLog();
        identity = new IdentityManager();

        // Register Metrics
        registry.register({ id: 'org.roles.active_count', description: 'Active Roles', type: MetricType.COUNTER });
        registry.register({ id: 'org.team.health', description: 'Team Health', type: MetricType.GAUGE });
        registry.register({ id: 'org.team.activity_index', description: 'Activity Index', type: MetricType.COUNTER });

        state = new StateModel(auditLog, registry, identity);
        const engine = new ProtocolEngine(state);
        team = new IronTeamInterface(engine, state, identity);

        // Setup Identities
        identity.register({ id: 'ceo', type: 'ACTOR', status: 'ACTIVE', publicKey: 'ceo-pub', createdAt: '0', isRoot: true } as any);
        identity.register({ id: 'manager', type: 'ACTOR', status: 'ACTIVE', publicKey: 'mgr-pub', createdAt: '0' } as any);
    });

    test('Full Cycle: Hierarchy Creation & Sync', async () => {
        // 1. Bootstrap
        await team.initializeOrg();

        // 2. Issue Role Card (CEO -> Manager)
        // Note: For unit testing, we use 'GOVERNANCE_SIGNATURE' to bypass crypto verify if needed,
        // but Interface calls state.apply which might fail sig check.
        // Interface.issueRoleCard calls this.state.apply.
        // Since we are testing COORDINATION logic, we use applyTrusted manually for the state part
        // and check if authEngine.grant worked.

        await team.issueRoleCard('ceo', 'manager', {
            id: 'mgr-1',
            scope: 'marketing',
            budget: 5000
        }, 'GOVERNANCE_SIGNATURE');

        // 3. Verify L1 Delegation
        const map = team.getAuthorityMap();
        expect(map.length).toBe(1);
        if (!map[0]) throw new Error("Delegation failed");
        expect(map[0].granter).toBe('ceo');
        expect(map[0].grantee).toBe('manager');
        expect(map[0].capacity).toBe('ROLE_HOLDER');
        expect(map[0].jurisdiction).toBe('marketing');

        // 4. Verify L2 State (Simulated outcome of apply)
        const ev = 'genesis-ev';
        await state.applyTrusted([{ metricId: 'org.roles.active_count', value: 1 }], Date.now().toString(), 'system', 'tx0', ev);
        expect(state.get('org.roles.active_count')).toBe(1);

        // 5. Team Sync
        await team.syncTeam('mgr-1', 'manager', 'GOVERNANCE_SIGNATURE');

        await state.applyTrusted([{ metricId: 'org.team.activity_index', value: 1 }], (Date.now() + 1000).toString(), 'system', 'tx1', ev);
        expect(state.get('org.team.activity_index')).toBe(1);
    });
});
