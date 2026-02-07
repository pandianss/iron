import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { DeterministicTime, InvariantEngine, InvariantViolation } from '../kernel-core/L0/Kernel.js';
import { Budget } from '../kernel-core/L0/Primitives.js';
import { StateModel, MetricRegistry, MetricType } from '../kernel-core/L2/State.js';
import { IdentityManager, AuthorityEngine } from '../kernel-core/L1/Identity.js';
import { ProtocolEngine } from '../kernel-core/L4/Protocol.js';
import { AuditLog } from '../kernel-core/L5/Audit.js';
import { hash, canonicalize } from '../kernel-core/L0/Crypto.js';
import { WorkflowProxy } from '../L6/Proxy.js';
import { ActionFactory } from '../kernel-core/L2/ActionFactory.js';
import { GovernanceKernel } from '../kernel-core/Kernel.js';
import { signData, generateKeyPair } from '../kernel-core/L0/Crypto.js';
import { GovernanceInterface } from '../L6/Interface.js';

describe('Enterprise Verification: Phase 2 Execution Control', () => {
    let kernel: GovernanceKernel;
    let identity: IdentityManager;
    let authority: AuthorityEngine;
    let state: StateModel;
    let protocol: ProtocolEngine;
    let auditLog: AuditLog;
    let registry: MetricRegistry;
    let ui: GovernanceInterface;
    let proxy: WorkflowProxy;

    const adminKeys = generateKeyPair();
    const userKeys = generateKeyPair();

    beforeEach(() => {
        identity = new IdentityManager();
        authority = new AuthorityEngine(identity);
        auditLog = new AuditLog();
        registry = new MetricRegistry();
        state = new StateModel(auditLog, registry, identity);
        protocol = new ProtocolEngine(state);
        kernel = new GovernanceKernel(identity, authority, state, protocol, auditLog, registry);
        kernel.boot();

        ui = new GovernanceInterface(kernel, state, auditLog);
        proxy = new WorkflowProxy(ui, userKeys);

        // Register Users
        identity.register({ id: 'admin', publicKey: adminKeys.publicKey, type: 'ACTOR', identityProof: 'SYSTEM', status: 'ACTIVE', createdAt: '0:0', isRoot: true });
        identity.register({ id: 'user', publicKey: userKeys.publicKey, type: 'ACTOR', identityProof: 'USER_INVITE', status: 'ACTIVE', createdAt: '0:0' });

        // Register Metric
        registry.register({ id: 'expenditure', description: 'Institutional Expenditure', type: 'GAUGE' as any });

        // Grant basic jurisdiction
        authority.grant('auth-1', 'admin', 'user', 'METRIC.WRITE', 'expenditure', '0:0', 'GOVERNANCE_SIGNATURE');
    });

    test.skip('Product 3 (Policy Gate): Strict Protocol blocking execution', () => {
        // Define a STRICT policy: Only allow payments <= 500
        const policyId = protocol.propose({
            id: 'PAYMENT_POLICY',
            name: 'Expenditure Limit Policy',
            version: '1.0',
            category: 'Risk',
            lifecycle: 'PROPOSED',
            strict: true, // MANDATORY COMPLIANCE
            preconditions: [
                { type: 'METRIC_THRESHOLD', metricId: 'expenditure', operator: '<=', value: 500 }
            ],
            execution: [
                { type: 'MUTATE_METRIC', metricId: 'expenditure', mutation: 0 }
            ],
            triggerConditions: [],
            authorizedCapacities: [],
            stateTransitions: [],
            completionConditions: []
        } as any);
        protocol.ratify(policyId, 'GOVERNANCE_SIGNATURE');
        protocol.activate(policyId);

        // 1. Valid Action (Value 200 <= 500)
        const validAction = ActionFactory.create('expenditure', 200, 'user', userKeys.privateKey, undefined, undefined, 'PAYMENT_POLICY');
        expect(() => kernel.execute(validAction)).not.toThrow();

        // 2. Invalid Action (Value 1000 > 500)
        const invalidAction = ActionFactory.create('expenditure', 1000, 'user', userKeys.privateKey, undefined, undefined, 'PAYMENT_POLICY');
        expect(() => kernel.execute(invalidAction)).toThrow(/Policy Violation/);

        // Ensure state was NOT updated
        expect(state.get('expenditure')).toBe(200);
    });

    test.skip('Product 4 (Workflow Guard): Proxy intercepting and gating side-effects', async () => {
        // Simple Policy: No payments over 1000
        const policyId = protocol.propose({
            id: 'LIMIT_POLICY',
            name: 'Hard Account Limit',
            category: 'Risk',
            version: '1.0',
            strict: true,
            preconditions: [{ type: 'METRIC_THRESHOLD', metricId: 'expenditure', operator: '<=', value: 1000 }],
            execution: [{ type: 'MUTATE_METRIC', metricId: 'expenditure', mutation: 0 }],
            triggerConditions: [],
            authorizedCapacities: [],
            stateTransitions: [],
            completionConditions: []
        } as any);
        protocol.ratify(policyId, 'GOVERNANCE_SIGNATURE');
        protocol.activate(policyId);

        let bankTransferCalled = false;
        const bankTransfer = () => { bankTransferCalled = true; return 'TX_SUCCESS'; };

        // 1. Valid Transfer
        const res1 = await proxy.intercept('expenditure', 500, bankTransfer, 'user', 'LIMIT_POLICY');
        expect(res1).toBe('TX_SUCCESS');
        expect(bankTransferCalled).toBe(true);

        // 2. Invalid Transfer
        bankTransferCalled = false;
        await expect(proxy.intercept('expenditure', 2000, bankTransfer, 'user', 'LIMIT_POLICY'))
            .rejects.toThrow(/Governance Violation/);

        // CRITICAL: The bank transfer function MUST NOT have been called
        expect(bankTransferCalled).toBe(false);
    });
});
