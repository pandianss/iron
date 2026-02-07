import { DeterministicTime } from '../kernel-core/L0/Kernel.js';
import { Budget, BudgetType } from '../kernel-core/L0/Primitives.js';
import { generateKeyPair } from '../kernel-core/L0/Crypto.js';
import type { KeyPair } from '../kernel-core/L0/Crypto.js';
import { IdentityManager, AuthorityEngine } from '../kernel-core/L1/Identity.js';
import type { Entity } from '../kernel-core/L1/Identity.js';
import { StateModel, MetricRegistry, MetricType } from '../kernel-core/L2/State.js';
import { ActionFactory } from '../kernel-core/L2/ActionFactory.js';
import { ProtocolEngine } from '../kernel-core/L4/Protocol.js';
import type { Protocol } from '../kernel-core/L4/Protocol.js';
import { AuditLog } from '../kernel-core/L5/Audit.js';
import { GovernanceKernel } from '../kernel-core/Kernel.js';

describe('Iron Operationalization (Kernel & Guards)', () => {
    // Core
    let time: DeterministicTime;
    let identity: IdentityManager;
    let authority: AuthorityEngine;
    let auditLog: AuditLog;
    let registry: MetricRegistry;
    let state: StateModel;
    let protocol: ProtocolEngine;
    let kernel: GovernanceKernel;

    // Identities
    let adminKeys: KeyPair;

    beforeEach(() => {
        time = new DeterministicTime();
        adminKeys = generateKeyPair();

        identity = new IdentityManager();
        identity.register({
            id: 'admin',
            publicKey: adminKeys.publicKey,
            type: 'ACTOR',
            identityProof: 'SYSTEM_GENESIS',
            status: 'ACTIVE',
            createdAt: '0:0',
            isRoot: true
        });

        authority = new AuthorityEngine(identity);
        auditLog = new AuditLog();
        registry = new MetricRegistry();
        state = new StateModel(auditLog, registry, identity);

        registry.register({ id: 'load', description: '', type: MetricType.GAUGE });
        registry.register({ id: 'fan', description: '', type: MetricType.GAUGE });

        protocol = new ProtocolEngine(state);

        // Kernel Setup
        kernel = new GovernanceKernel(identity, authority, state, protocol, auditLog, registry);
        kernel.boot();
    });


    test('Atomic Execution Flow: Attempt -> Guard -> Execute -> Outcome', async () => {
        const action = ActionFactory.create('load', 50, 'admin', adminKeys.privateKey);

        const receipt = await kernel.execute(action);
        expect(receipt.status).toBe('COMMITTED');

        // Verify L5 Log: Should have ATTEMPT, ACCEPTED, and SUCCESS (from State)
        const history = await auditLog.getHistory();
        expect(history.length).toBeGreaterThanOrEqual(3);
        expect(history[0]!.status).toBe('ATTEMPT');
        expect(history[1]!.status).toBe('ACCEPTED');
        expect(history[2]!.status).toBe('SUCCESS');

        expect((state as any).currentState.metrics['load'].value).toBe(50);
    });

    test('Guard Rejection: Invalid Signature', async () => {
        const action = ActionFactory.create('load', 50, 'admin', adminKeys.privateKey);
        action.signature = 'bad';

        await expect(kernel.execute(action)).rejects.toThrow(/Kernel Reject:/);

        expect((await auditLog.getHistory()).length).toBe(2);
    });

    test('Guard Rejection: Authority Violation (Lacks Jurisdiction)', async () => {
        const userKeys = generateKeyPair();
        identity.register({
            id: 'user',
            publicKey: userKeys.publicKey,
            type: 'ACTOR',
            identityProof: 'USER_INVITE',
            status: 'ACTIVE',
            createdAt: '0:0'
        });

        // user has NO authority yet
        const action = ActionFactory.create('load', 50, 'user', userKeys.privateKey);

        await expect(kernel.execute(action)).rejects.toThrow(/Authority Violation/);
    });

    test('Protocol Conflict Rejection', async () => {
        // Register P1: Controls 'fan'
        const p1: Protocol = {
            id: 'fan-control-1',
            name: 'FanControl1',
            version: '1.0.0',
            category: 'Intent',
            lifecycle: 'ACTIVE',
            triggerConditions: [],
            authorizedCapacities: [],
            stateTransitions: [],
            completionConditions: [],
            preconditions: [{ type: 'METRIC_THRESHOLD', metricId: 'load', operator: '>', value: 80 }],
            execution: [{ type: 'MUTATE_METRIC', metricId: 'fan', mutation: 1 }]
        };
        const id1 = protocol.propose(p1);
        protocol.ratify(id1, 'TRUSTED');
        protocol.activate(id1);

        // Register P2: Controls 'fan' (Conflict)
        const p2: Protocol = {
            id: 'fan-control-2',
            name: 'FanControl2',
            version: '1.0.0',
            category: 'Intent',
            lifecycle: 'ACTIVE',
            triggerConditions: [],
            authorizedCapacities: [],
            stateTransitions: [],
            completionConditions: [],
            preconditions: [{ type: 'METRIC_THRESHOLD', metricId: 'load', operator: '>', value: 80 }],
            execution: [{ type: 'MUTATE_METRIC', metricId: 'fan', mutation: 5 }]
        };

        const id2 = protocol.propose(p2);
        protocol.ratify(id2, 'GOVERNANCE_SIGNATURE');
        protocol.activate(id2);


        // Set Load > 80 to trigger both via Kernel
        const action = ActionFactory.create('load', 90, 'admin', adminKeys.privateKey);

        // Execute via Kernel (Commit phase will trigger protocols and fail on conflict)
        await expect(kernel.execute(action)).rejects.toThrow(/Protocol Conflict/);
    });
});

