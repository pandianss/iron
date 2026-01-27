
import { ProtocolEngine } from '../Protocol.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { AuditLog } from '../../L5/Audit.js';
import { IdentityManager } from '../../L1/Identity.js';
import type { Protocol } from '../ProtocolTypes.js';

describe('L4 Deep Audit: Adversary Suite', () => {
    let state: StateModel;
    let engine: ProtocolEngine;
    let registry: MetricRegistry;

    beforeEach(() => {
        registry = new MetricRegistry();
        registry.register({ id: 'test.metric', type: MetricType.COUNTER, description: 'Test' });

        const audit = new AuditLog();
        state = new StateModel(audit, registry, new IdentityManager());
        engine = new ProtocolEngine(state);

        // Seed State
        state.applyTrusted({ metricId: 'test.metric', value: 100 }, '0:0');
    });

    test('Exploit 1: Operator Bypass (Invalid Operator checks)', () => {
        // Attack: Provide an operator not handled by the engine.
        // If engine silently skips the check, it might return 'true' at the end.
        const attackProto: Protocol = {
            id: 'attack.bypass',
            name: "Bypass",
            version: "1.0.0",
            category: "Risk",
            lifecycle: "ACTIVE", // Force ACTIVE to skip lifecycle check
            strict: true,
            execution: [{ type: "MUTATE_METRIC", metricId: "test.metric", mutation: -100 }],
            preconditions: [
                {
                    type: "METRIC_THRESHOLD",
                    metricId: "test.metric",
                    operator: "INVALID_OP" as any, // TypeScript bypass
                    value: 999999 // Should fail if checked properly
                }
            ]
        };

        // We inject directly to bypass 'propose' validation for this test 
        // to see if the RUNTIME engine is robust.
        (engine as any).protocols.set(attackProto.id, attackProto);

        const mutations = engine.evaluate('0:1' as LogicalTimestamp); // Cast timestamp for test

        // If vulnerability exists, mutations will be generated despite the impossible threshold (or invalid op)
        // If robust, it should either throw or return empty.
        // Current logic: Loop skips 'if', reaches end, returns 'preconditions.length > 0' (true).
        expect(mutations.length).toBe(0);
    });

    test('Exploit 2: Type Confusion (NaN Threshold)', () => {
        const attackProto: Protocol = {
            id: 'attack.nan',
            name: "NaN Attack",
            version: "1.0.0",
            category: "Risk",
            lifecycle: "ACTIVE",
            execution: [{ type: "MUTATE_METRIC", metricId: "test.metric", mutation: -50 }],
            preconditions: [
                {
                    type: "METRIC_THRESHOLD",
                    metricId: "test.metric",
                    operator: ">",
                    value: "NotANumber" as any // Results in NaN
                }
            ]
        };

        (engine as any).protocols.set(attackProto.id, attackProto);

        // 100 > NaN is False.
        // Logic: if (!(current > thresh)) return false.
        // !(False) is True. Returns False.
        // So this should be SAFE (Fail-Closed).
        const mutations = engine.evaluate('0:1' as LogicalTimestamp);
        expect(mutations.length).toBe(0);
    });

    test('Exploit 3: Lifecycle Bypass (Proposed Execution)', () => {
        const proto: Protocol = {
            id: 'attack.lifecycle',
            name: "Unratified",
            version: "1.0.0",
            category: "Intent",
            lifecycle: "PROPOSED",
            execution: [{ type: "MUTATE_METRIC", metricId: "test.metric", mutation: 1 }],
            preconditions: [{ type: "ALWAYS" }]
        };

        (engine as any).protocols.set(proto.id, proto);
        const mutations = engine.evaluate('0:1' as LogicalTimestamp);

        // Should NOT execute
        expect(mutations.length).toBe(0);
    });

    test('Exploit 4: Prototype Pollution in Metric ID', () => {
        const attackProto: Protocol = {
            id: 'attack.proto',
            name: "Proto",
            version: "1.0.0",
            category: "Risk",
            lifecycle: "ACTIVE",
            execution: [{ type: "MUTATE_METRIC", metricId: "__proto__", mutation: 1 }],
            preconditions: [{ type: "ALWAYS" }]
        } as unknown as Protocol;
        (engine as any).protocols.set(attackProto.id, attackProto);

        // This might arguably fail or pollute. We expect safe handling (no crash, no pollution).
        expect(() => engine.evaluate('0:1' as any)).not.toThrow();
    });
});
