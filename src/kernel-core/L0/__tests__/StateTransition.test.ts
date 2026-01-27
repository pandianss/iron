
import { describe, test, expect, beforeEach } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { StateModel, MetricRegistry } from '../../L2/State.js';
import { IdentityManager, DelegationEngine } from '../../L1/Identity.js';
import { AuditLog } from '../../L5/Audit.js';
import { ProtocolEngine } from '../../L4/Protocol.js';

describe('Iron-5 Constitutional State Machine', () => {
    let kernel: GovernanceKernel;

    beforeEach(() => {
        const identity = new IdentityManager();
        const delegation = new DelegationEngine();
        const audit = new AuditLog();
        const registry = new MetricRegistry();
        const state = new StateModel(audit, registry, identity);
        const protocols = new ProtocolEngine(state);

        kernel = new GovernanceKernel(identity, delegation, state, protocols, audit, registry);
    });

    test('I. Initial State is CONSTITUTED', () => {
        expect(kernel.Lifecycle).toBe('CONSTITUTED');
    });

    test('II. Must Boot to become ACTIVE', () => {
        // Cannot submit in CONSTITUTED state
        expect(() => {
            kernel.submitAttempt('usr', 'proto', {} as any);
        }).toThrow(/Cannot submit attempt in state CONSTITUTED/);

        kernel.boot();
        expect(kernel.Lifecycle).toBe('ACTIVE');
    });

    // We can't easily force VIOLATED state from outside without mocking internal errors.
    // Ideally we'd test the 'VIOLATED' transition by injecting a critical failure.
});
