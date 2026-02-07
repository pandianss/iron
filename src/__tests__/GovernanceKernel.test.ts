
import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// 1. Mock Dependencies (ESM Hoisting)
// Note: These must be top-level and run before imports of the modules they mock.
jest.unstable_mockModule('../kernel-core/L1/Identity.js', () => ({
    IdentityManager: jest.fn(),
    AuthorityEngine: jest.fn(),
    CapabilitySet: jest.fn()
}));

jest.unstable_mockModule('../kernel-core/L2/State.js', () => ({
    StateModel: jest.fn(),
    MetricRegistry: jest.fn(),
}));

jest.unstable_mockModule('../kernel-core/L4/Protocol.js', () => ({
    ProtocolEngine: jest.fn()
}));

jest.unstable_mockModule('../kernel-core/L5/Audit.js', () => ({
    AuditLog: jest.fn()
}));

jest.unstable_mockModule('../kernel-core/L0/Guards.js', () => ({
    SignatureGuard: jest.fn(),
    ScopeGuard: jest.fn(),
    BudgetGuard: jest.fn(),
    TimeGuard: jest.fn(),
    InvariantGuard: jest.fn(),
    ReplayGuard: jest.fn(),
    MultiSigGuard: jest.fn(),
    IrreversibilityGuard: jest.fn()
}));

// Real imports for types/values we don't mock or are just types
import type { Action } from '../kernel-core/L2/State.js';
import { Budget, BudgetType } from '../kernel-core/L0/Primitives.js';

describe('GovernanceKernel (Phase II Hardening)', () => {
    let GovernanceKernelClass: any;
    let kernel: any;

    // Mocks references
    let MockIdentityManager: any;
    let MockDelegationEngine: any;
    let MockStateModel: any;
    let MockProtocolEngine: any;
    let MockAuditLog: any;
    let MockMetricRegistry: any;

    let mockSignatureGuard: any;
    let mockScopeGuard: any;
    let mockBudgetGuard: any;
    let mockInvariantGuard: any;
    let mockReplayGuard: any;
    let mockTimeGuard: any;

    let mockIdentity: any;
    let mockDelegation: any;
    let mockState: any;
    let mockProtocols: any;
    let mockAudit: any;
    let mockRegistry: any;
    let mockMultiSigGuard: any;
    let mockIrreversibilityGuard: any;

    beforeAll(async () => {
        // Dynamic import after mocks are defined
        const KernelModule = await import('../kernel-core/Kernel.js');
        GovernanceKernelClass = KernelModule.GovernanceKernel;

        const IdentityModule = await import('../kernel-core/L1/Identity.js');
        MockIdentityManager = IdentityModule.IdentityManager;
        MockDelegationEngine = IdentityModule.AuthorityEngine;

        const StateModule = await import('../kernel-core/L2/State.js');
        MockStateModel = StateModule.StateModel;
        MockMetricRegistry = StateModule.MetricRegistry;

        const ProtocolModule = await import('../kernel-core/L4/Protocol.js');
        MockProtocolEngine = ProtocolModule.ProtocolEngine;

        const AuditModule = await import('../kernel-core/L5/Audit.js');
        MockAuditLog = AuditModule.AuditLog;

        const GuardsModule = await import('../kernel-core/L0/Guards.js');
        mockSignatureGuard = GuardsModule.SignatureGuard;
        mockScopeGuard = GuardsModule.ScopeGuard;
        mockBudgetGuard = GuardsModule.BudgetGuard;
        mockInvariantGuard = GuardsModule.InvariantGuard;
        mockReplayGuard = GuardsModule.ReplayGuard;
        mockTimeGuard = GuardsModule.TimeGuard;
        mockMultiSigGuard = GuardsModule.MultiSigGuard;
        mockIrreversibilityGuard = GuardsModule.IrreversibilityGuard;
    });

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Instantiate Mocks
        mockIdentity = new MockIdentityManager();
        mockDelegation = new MockDelegationEngine();
        mockAudit = new MockAuditLog();
        mockRegistry = new MockMetricRegistry();
        mockState = new MockStateModel();
        mockProtocols = new MockProtocolEngine();

        // Setup Authority Behavior
        mockDelegation.authorized = jest.fn().mockReturnValue(true);

        // Setup Default Method Behaviors
        // Default Protocol Behavior
        mockProtocols.isRegistered = jest.fn().mockReturnValue(true);
        mockProtocols.get = jest.fn().mockReturnValue({ id: 'proto1', name: 'Test Protocol', strict: true });
        mockProtocols.evaluate = jest.fn().mockReturnValue([{ metricId: 'foo', value: 'bar' }]);

        // Default State Behavior
        mockState.validateMutation = jest.fn();
        mockState.applyTrusted = jest.fn();

        // Default Identity Behavior for Invariants
        mockIdentity.get = jest.fn().mockReturnValue({ id: 'alice', status: 'ACTIVE' });
        mockIdentity.revoke = jest.fn();

        // Audit Log
        mockAudit.append = jest.fn().mockReturnValue(Promise.resolve({
            evidenceId: 'new_hash',
            previousEvidenceId: 'old_hash',
            action: {} as any,
            status: 'SUCCESS',
            timestamp: '1000:0'
        }));

        // Guards defaults
        mockSignatureGuard.mockReturnValue({ ok: true });
        mockScopeGuard.mockReturnValue({ ok: true });
        mockBudgetGuard.mockReturnValue({ ok: true });
        mockInvariantGuard.mockReturnValue({ ok: true });
        mockReplayGuard.mockReturnValue({ ok: true });
        mockTimeGuard.mockReturnValue({ ok: true });
        // New guards defaults
        mockTimeGuard.mockReturnValue({ ok: true });
        mockMultiSigGuard.mockReturnValue({ ok: true });
        mockIrreversibilityGuard.mockReturnValue({ ok: true });


        // Instantiate Kernel
        kernel = new GovernanceKernelClass(
            mockIdentity,
            mockDelegation,
            mockState,
            mockProtocols,
            mockAudit,
            mockRegistry
        );

        kernel.boot();
    });

    const validAction: Action = {
        actionId: 'i1',
        initiator: 'alice',
        payload: { metricId: 'test.metric', value: 100 },
        timestamp: '1000:0',
        expiresAt: '2000:0',
        signature: '00'.repeat(32) // Valid hex
    };

    describe('Invariant I: Authority Conservation', () => {
        test('should ACCEPT when Signature and Scope are valid', async () => {
            const aid = await kernel.submitAttempt('alice', 'proto1', validAction);
            const status = await kernel.guardAttempt(aid);

            expect(status.status).toBe('ACCEPTED');
            expect(mockSignatureGuard).toHaveBeenCalled();
            expect(mockScopeGuard).toHaveBeenCalled();
        });

        test('should REJECT when Signature is invalid', async () => {
            mockSignatureGuard.mockReturnValue({ ok: false, violation: 'Bad Key' });

            const aid = await kernel.submitAttempt('alice', 'proto1', validAction);
            const status = await kernel.guardAttempt(aid);

            expect(status.status).toBe('REJECTED');
            expect(mockAudit.append).toHaveBeenCalledWith(
                expect.anything(),
                'REJECT',
                expect.stringContaining('Bad Key'),
                expect.anything()
            );
        });

        test('should REJECT when Scope is insufficient', async () => {
            mockScopeGuard.mockReturnValue({ ok: false, violation: 'lacks Jurisdiction' });
            // mockDelegation.authorized.mockReturnValue(false); // Ignored by mock guard

            const aid = await kernel.submitAttempt('alice', 'proto1', validAction);
            const status = await kernel.guardAttempt(aid);

            expect(status.status).toBe('REJECTED');
            expect(mockAudit.append).toHaveBeenCalledWith(
                expect.anything(),
                'REJECT',
                expect.stringContaining('lacks Jurisdiction'),
                expect.anything()
            );
        });

        test('should REJECT when Protocol is not registered', async () => {
            mockProtocols.isRegistered.mockReturnValue(false);

            const aid = await kernel.submitAttempt('alice', 'unknown_proto', validAction);
            const status = await kernel.guardAttempt(aid);

            expect(status.status).toBe('REJECTED');
            expect(mockAudit.append).toHaveBeenCalledWith(
                expect.anything(),
                'REJECT',
                expect.stringContaining('Protocol'),
                expect.anything()
            );
        });
    });

    describe('Invariant II: Budget Conservation', () => {
        test('should REJECT commit if budget is insufficient', async () => {
            const aid = await kernel.submitAttempt('alice', 'proto1', validAction, 10);
            await kernel.guardAttempt(aid);

            mockBudgetGuard.mockReturnValue({ ok: false, violation: 'Bankruptcy' });

            const budget = new Budget(BudgetType.ENERGY, 5);
            await expect(kernel.commitAttempt(aid, budget)).rejects.toThrow(/Budget Violation/);
        });

        test('should CONSUME budget on successful commit', async () => {
            const aid = await kernel.submitAttempt('alice', 'proto1', validAction, 10);
            await kernel.guardAttempt(aid);

            const budget = new Budget(BudgetType.ENERGY, 100);
            // We can't easily spy on valid 'budget' object method if we don't mock it, 
            // but we can check the 'used' property after.

            const initialConsumed = budget.consumed;
            await kernel.commitAttempt(aid, budget);

            expect(budget.consumed).toBe(initialConsumed + 10);
        });
    });

    describe('Invariant III: Lineage Immutability', () => {
        test('should return Commit object with Audit Hashes', async () => {
            const aid = await kernel.submitAttempt('alice', 'proto1', validAction);
            await kernel.guardAttempt(aid);

            const budget = new Budget(BudgetType.ENERGY, 100);
            const commit = await kernel.commitAttempt(aid, budget);

            expect(commit.status).toBe('COMMITTED');
            expect(commit.oldStateHash).toBe('old_hash');
            expect(commit.newStateHash).toBe('new_hash');
            expect(mockAudit.append).toHaveBeenCalledWith(validAction, 'SUCCESS');
        });
    });
});
