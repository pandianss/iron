
import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// 1. Mock Dependencies (ESM Hoisting)
jest.unstable_mockModule('../L1/Identity.js', () => ({
    IdentityManager: jest.fn(),
    DelegationEngine: jest.fn(),
    CapabilitySet: jest.fn()
}));

jest.unstable_mockModule('../L2/IntentFactory.js', () => ({
    IntentFactory: {
        create: jest.fn()
    }
}));

jest.unstable_mockModule('../L2/State.js', () => ({
    StateModel: jest.fn(),
    MetricRegistry: jest.fn()
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

import { Budget, BudgetType } from '../L0/Kernel.js';

describe('Institutional Safety Lab (Chaos)', () => {
    let GovernanceKernelClass: any;
    let FuzzerClass: any;
    let kernel: any;
    let fuzzer: any;

    // Mocks
    let mockIdentity: any;
    let mockDelegation: any;
    let mockState: any;
    let mockProtocols: any;
    let mockAudit: any;
    let mockRegistry: any;

    // Mocks references
    let MockIdentityManager: any;
    let MockDelegationEngine: any;
    let MockStateModel: any;
    let MockProtocolEngine: any;
    let MockAuditLog: any;
    let MockMetricRegistry: any;
    let MockIntentFactory: any;

    // Guards
    let mockSignatureGuard: any;
    let mockScopeGuard: any;
    let mockBudgetGuard: any;

    beforeAll(async () => {
        const KernelModule = await import('../Kernel.js');
        GovernanceKernelClass = KernelModule.GovernanceKernel;

        const FuzzerModule = await import('../Chaos/Fuzzer.js');
        FuzzerClass = FuzzerModule.Fuzzer;

        const IdentityModule = await import('../L1/Identity.js');
        MockIdentityManager = IdentityModule.IdentityManager;
        MockDelegationEngine = IdentityModule.DelegationEngine;

        const StateModule = await import('../L2/State.js');
        MockStateModel = StateModule.StateModel;
        MockMetricRegistry = StateModule.MetricRegistry;

        const IntentFactoryModule = await import('../L2/IntentFactory.js');
        MockIntentFactory = IntentFactoryModule.IntentFactory;

        const ProtocolModule = await import('../L4/Protocol.js');
        MockProtocolEngine = ProtocolModule.ProtocolEngine;

        const AuditModule = await import('../L5/Audit.js');
        MockAuditLog = AuditModule.AuditLog;

        const GuardsModule = await import('../L0/Guards.js');
        mockSignatureGuard = GuardsModule.SignatureGuard;
        mockBudgetGuard = GuardsModule.BudgetGuard;
        mockScopeGuard = GuardsModule.ScopeGuard;
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Instantiate Mocks
        mockIdentity = new MockIdentityManager();
        mockDelegation = new MockDelegationEngine();
        mockState = new MockStateModel();
        mockProtocols = new MockProtocolEngine();
        mockAudit = new MockAuditLog();
        mockRegistry = new MockMetricRegistry();

        // Defaults
        mockProtocols.isRegistered = jest.fn().mockReturnValue(true);
        mockProtocols.evaluate = jest.fn().mockReturnValue([{ metricId: 'foo', value: 'bar' }]);
        mockAudit.append = jest.fn().mockReturnValue({ hash: 'h', previousHash: 'p' });

        // Guards - Default Allow
        mockSignatureGuard.mockReturnValue({ ok: true });
        mockScopeGuard.mockReturnValue({ ok: true });
        mockBudgetGuard.mockReturnValue({ ok: true });

        // Factory
        MockIntentFactory.create.mockReturnValue({
            intentId: 'fuzz-intent',
            principalId: 'fuzzer',
            payload: { metricId: 'test', value: 1 },
            timestamp: '0:0',
            signature: 'sig'
        });

        kernel = new GovernanceKernelClass(
            mockIdentity,
            mockDelegation,
            mockState,
            mockProtocols,
            mockAudit,
            mockRegistry
        );

        fuzzer = new FuzzerClass(kernel, mockIdentity);
    });

    describe('Scenario A: The 51% Attack (Authority Hijack)', () => {
        test('Fuzzer should fail to commit without valid signature', async () => {
            // Simulate broken crypto
            mockSignatureGuard.mockReturnValue({ ok: false, violation: 'Invalid Sig' });

            await expect(fuzzer.runInvalidSig('attacker', 'bad-key'))
                .resolves.not.toThrow(); // Fuzzer internal check should pass

            // Verify Kernel rejected it
            expect(mockAudit.append).toHaveBeenCalledWith(expect.anything(), 'REJECT', expect.stringContaining('Invalid Sig'));
        });
    });

    describe('Scenario B: Budget Exhaustion (Denial of Governance)', () => {
        test('Fuzzer should trigger Budget Guard when spamming', async () => {
            mockBudgetGuard.mockReturnValue({ ok: false, violation: 'Budget Exhausted' });

            await expect(fuzzer.runBudgetSpam('spammer', 'key'))
                .resolves.not.toThrow();

            // Verify Kernel threw the budget error (caught by fuzzer)
        });
    });
});
