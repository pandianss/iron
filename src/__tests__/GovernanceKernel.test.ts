
import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// 1. Mock Dependencies (ESM Hoisting)
// Note: These must be top-level and run before imports of the modules they mock.
jest.unstable_mockModule('../L1/Identity.js', () => ({
    IdentityManager: jest.fn(),
    DelegationEngine: jest.fn(),
    CapabilitySet: jest.fn()
}));

jest.unstable_mockModule('../L2/State.js', () => ({
    StateModel: jest.fn(),
    MetricRegistry: jest.fn(),
}));

jest.unstable_mockModule('../L4/Protocol.js', () => ({
    ProtocolEngine: jest.fn()
}));

jest.unstable_mockModule('../L5/Audit.js', () => ({
    AuditLog: jest.fn()
}));

jest.unstable_mockModule('../L0/Guards.js', () => ({
    SignatureGuard: jest.fn(),
    ScopeGuard: jest.fn(),
    BudgetGuard: jest.fn(),
    TimeGuard: jest.fn()
}));

// Real imports for types/values we don't mock or are just types
import type { Intent } from '../L2/State.js';
import { Budget, BudgetType } from '../L0/Kernel.js';

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

    let mockIdentity: any;
    let mockDelegation: any;
    let mockState: any;
    let mockProtocols: any;
    let mockAudit: any;
    let mockRegistry: any;

    beforeAll(async () => {
        // Dynamic import after mocks are defined
        const KernelModule = await import('../Kernel.js');
        GovernanceKernelClass = KernelModule.GovernanceKernel;

        const IdentityModule = await import('../L1/Identity.js');
        MockIdentityManager = IdentityModule.IdentityManager;
        MockDelegationEngine = IdentityModule.DelegationEngine;

        const StateModule = await import('../L2/State.js');
        MockStateModel = StateModule.StateModel;
        MockMetricRegistry = StateModule.MetricRegistry;

        const ProtocolModule = await import('../L4/Protocol.js');
        MockProtocolEngine = ProtocolModule.ProtocolEngine;

        const AuditModule = await import('../L5/Audit.js');
        MockAuditLog = AuditModule.AuditLog;

        const GuardsModule = await import('../L0/Guards.js');
        mockSignatureGuard = GuardsModule.SignatureGuard;
        mockScopeGuard = GuardsModule.ScopeGuard;
        mockBudgetGuard = GuardsModule.BudgetGuard;
    });

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Instantiate Mocks
        mockIdentity = new MockIdentityManager();
        mockDelegation = new MockDelegationEngine(); // Args don't matter as it's a mock
        mockAudit = new MockAuditLog();
        mockRegistry = new MockMetricRegistry();
        mockState = new MockStateModel();
        mockProtocols = new MockProtocolEngine();

        // Setup Default Method Behaviors
        // Default Protocol Behavior
        mockProtocols.isRegistered = jest.fn().mockReturnValue(true);
        mockProtocols.evaluate = jest.fn().mockReturnValue([{ metricId: 'foo', value: 'bar' }]);

        // Default State Behavior
        mockState.validateMutation = jest.fn();
        mockState.applyTrusted = jest.fn();

        // Audit Log
        mockAudit.append = jest.fn().mockReturnValue({
            hash: 'new_hash',
            previousHash: 'old_hash',
            intent: {} as any,
            status: 'SUCCESS'
        });

        // Guards defaults
        mockSignatureGuard.mockReturnValue({ ok: true });
        mockScopeGuard.mockReturnValue({ ok: true });
        mockBudgetGuard.mockReturnValue({ ok: true });

        // Instantiate Kernel
        kernel = new GovernanceKernelClass(
            mockIdentity,
            mockDelegation,
            mockState,
            mockProtocols,
            mockAudit,
            mockRegistry
        );
    });

    const validIntent: Intent = {
        intentId: 'i1',
        principalId: 'alice',
        payload: { metricId: 'test.metric', value: 100 },
        timestamp: '1000:0',
        expiresAt: '2000:0',
        signature: 'valid_sig'
    };

    describe('Invariant I: Authority Conservation', () => {
        test('should ACCEPT when Signature and Scope are valid', () => {
            const aid = kernel.submitAttempt('alice', 'proto1', validIntent);
            const status = kernel.guardAttempt(aid);

            expect(status).toBe('ACCEPTED');
            expect(mockSignatureGuard).toHaveBeenCalled();
            expect(mockScopeGuard).toHaveBeenCalled();
        });

        test('should REJECT when Signature is invalid', () => {
            mockSignatureGuard.mockReturnValue({ ok: false, violation: 'Bad Key' });

            const aid = kernel.submitAttempt('alice', 'proto1', validIntent);
            const status = kernel.guardAttempt(aid);

            expect(status).toBe('REJECTED');
            expect(mockAudit.append).toHaveBeenCalledWith(expect.anything(), 'REJECT', expect.stringContaining('Bad Key'));
        });

        test('should REJECT when Scope is insufficient', () => {
            mockScopeGuard.mockReturnValue({ ok: false, violation: 'No Access' });

            const aid = kernel.submitAttempt('alice', 'proto1', validIntent);
            const status = kernel.guardAttempt(aid);

            expect(status).toBe('REJECTED');
            expect(mockAudit.append).toHaveBeenCalledWith(expect.anything(), 'REJECT', expect.stringContaining('No Access'));
        });

        test('should REJECT when Protocol is not registered', () => {
            mockProtocols.isRegistered.mockReturnValue(false);

            const aid = kernel.submitAttempt('alice', 'unknown_proto', validIntent);
            const status = kernel.guardAttempt(aid);

            expect(status).toBe('REJECTED');
            expect(mockAudit.append).toHaveBeenCalledWith(expect.anything(), 'REJECT', expect.stringContaining('Protocol'));
        });
    });

    describe('Invariant II: Budget Conservation', () => {
        test('should REJECT commit if budget is insufficient', () => {
            const aid = kernel.submitAttempt('alice', 'proto1', validIntent, 10);
            kernel.guardAttempt(aid);

            mockBudgetGuard.mockReturnValue({ ok: false, violation: 'Bankruptcy' });

            const budget = new Budget(BudgetType.ENERGY, 5);
            expect(() => kernel.commitAttempt(aid, budget)).toThrow(/Budget Violation/);
        });

        test('should CONSUME budget on successful commit', () => {
            const aid = kernel.submitAttempt('alice', 'proto1', validIntent, 10);
            kernel.guardAttempt(aid);

            const budget = new Budget(BudgetType.ENERGY, 100);
            // We can't easily spy on valid 'budget' object method if we don't mock it, 
            // but we can check the 'used' property after.

            const initialUsed = budget.used;
            kernel.commitAttempt(aid, budget);

            expect(budget.used).toBe(initialUsed + 10);
        });
    });

    describe('Invariant III: Lineage Immutability', () => {
        test('should return Commit object with Audit Hashes', () => {
            const aid = kernel.submitAttempt('alice', 'proto1', validIntent);
            kernel.guardAttempt(aid);

            const budget = new Budget(BudgetType.ENERGY, 100);
            const commit = kernel.commitAttempt(aid, budget);

            expect(commit.status).toBe('COMMITTED');
            expect(commit.oldStateHash).toBe('old_hash');
            expect(commit.newStateHash).toBe('new_hash');
            expect(mockAudit.append).toHaveBeenCalledWith(validIntent, 'SUCCESS');
        });
    });
});
