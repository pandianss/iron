import { describe, test, expect, beforeAll } from '@jest/globals';
import { CertificationHarness, ActionGenerator, type PropertyTest } from '../CertificationHarness.js';
import { checkInvariants, KERNEL_INVARIANTS, type InvariantContext } from '../Invariants.js';
import { IdentityManager } from '../../L1/Identity.js';
import type { Action } from '../Ontology.js';

describe('M2.3 Invariant Certification', () => {
    let generator: ActionGenerator;
    let identityManager: IdentityManager;

    beforeAll(() => {
        generator = new ActionGenerator();
        identityManager = new IdentityManager();

        // Register test entities
        const now = "100:0";
        identityManager.register({
            id: 'entity-1',
            type: 'ACTOR',
            identityProof: 'test-proof-1',
            status: 'ACTIVE',
            publicKey: 'mock-key-1',
            createdAt: now
        });
        identityManager.register({
            id: 'entity-2',
            type: 'ACTOR',
            identityProof: 'test-proof-2',
            status: 'ACTIVE',
            publicKey: 'mock-key-2',
            createdAt: now
        });
        identityManager.register({
            id: 'entity-3',
            type: 'ACTOR',
            identityProof: 'test-proof-3',
            status: 'ACTIVE',
            publicKey: 'mock-key-3',
            createdAt: now
        });
    });

    describe('Individual Invariant Verification', () => {
        test('INV-ID-01: Signature format must be valid hex', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-ID-01',
                description: 'Valid actions have valid signature formats',
                generator: () => generator.generateValid(),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    // Valid actions should pass
                    if (action.signature === 'TRUSTED' || action.signature === 'GOVERNANCE_SIGNATURE') {
                        return result.ok;
                    }

                    // Hex signatures should pass
                    if (/^[0-9a-fA-F]+$/.test(action.signature)) {
                        return result.ok;
                    }

                    // Invalid signatures should fail with correct error
                    return !result.ok && result.rejection?.code === 'SIGNATURE_INVALID';
                },
                iterations: 1000
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
            expect(result.failures.length).toBe(0);
        });

        test('INV-ID-01: Invalid signatures are rejected', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-ID-01-NEGATIVE',
                description: 'Invalid signatures are correctly rejected',
                generator: () => generator.generateInvalid('INVALID_SIGNATURE'),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    // Should fail with SIGNATURE_INVALID
                    return !result.ok && result.rejection?.code === 'SIGNATURE_INVALID';
                },
                iterations: 100
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-RES-01: Metric delta must be finite', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-RES-01',
                description: 'Metric deltas are always finite numbers',
                generator: () => generator.generateValid(),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    const value = action.payload?.value;
                    if (value !== undefined && !Number.isFinite(value)) {
                        return !result.ok && result.rejection?.code === 'NON_FINITE_METRIC';
                    }

                    return result.ok;
                },
                iterations: 1000
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-RES-01: Non-finite deltas are rejected', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-RES-01-NEGATIVE',
                description: 'Non-finite values (NaN, Infinity) are rejected',
                generator: () => generator.generateInvalid('NON_FINITE_VALUE'),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    return !result.ok && result.rejection?.code === 'NON_FINITE_METRIC';
                },
                iterations: 100
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-RES-02: No future timestamps > 1 min', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-RES-02',
                description: 'Timestamps cannot be more than 1 minute in the future',
                generator: () => generator.generateValid(),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    // Valid timestamps should pass
                    return result.ok;
                },
                iterations: 1000
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-RES-02: Future timestamps are rejected', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-RES-02-NEGATIVE',
                description: 'Future timestamps (>1 min) are rejected',
                generator: () => generator.generateInvalid('FUTURE_TIMESTAMP'),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    return !result.ok && result.rejection?.code === 'TEMPORAL_PARADOX';
                },
                iterations: 100
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-RES-03: Payload size limit (16KB)', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-RES-03',
                description: 'Payloads must be under 16KB',
                generator: () => generator.generateValid(),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    const size = JSON.stringify(action.payload).length;
                    if (size > 16384) {
                        return !result.ok && result.rejection?.code === 'PAYLOAD_OVERSIZE';
                    }

                    return result.ok;
                },
                iterations: 1000
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-RES-03: Oversized payloads are rejected', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-RES-03-NEGATIVE',
                description: 'Payloads exceeding 16KB are rejected',
                generator: () => generator.generateInvalid('PAYLOAD_OVERSIZE'),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    return !result.ok && result.rejection?.code === 'PAYLOAD_OVERSIZE';
                },
                iterations: 100
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-PRO-01: Action ID must be present', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-PRO-01',
                description: 'All actions must have a non-empty action ID',
                generator: () => generator.generateValid(),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    if (!action.actionId || action.actionId.length === 0) {
                        return !result.ok && result.rejection?.code === 'INVALID_ID_FORMAT';
                    }

                    return result.ok;
                },
                iterations: 1000
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-PRO-01: Missing action IDs are rejected', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-PRO-01-NEGATIVE',
                description: 'Actions without IDs are rejected',
                generator: () => generator.generateInvalid('INVALID_ACTION_ID'),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    return !result.ok && result.rejection?.code === 'INVALID_ID_FORMAT';
                },
                iterations: 100
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-PRO-02: Payload must contain metricId', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-PRO-02',
                description: 'All action payloads must have a metricId',
                generator: () => generator.generateValid(),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    if (!action.payload?.metricId) {
                        return !result.ok && result.rejection?.code === 'MISSING_METRIC_ID';
                    }

                    return result.ok;
                },
                iterations: 1000
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });

        test('INV-PRO-02: Missing metricId is rejected', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'INV-PRO-02-NEGATIVE',
                description: 'Actions without metricId are rejected',
                generator: () => generator.generateInvalid('MISSING_METRIC_ID'),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);

                    return !result.ok && result.rejection?.code === 'MISSING_METRIC_ID';
                },
                iterations: 100
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);
            expect(result.passed).toBe(true);
        });
    });

    describe('Comprehensive Invariant Certification', () => {
        test('All invariants hold for 10,000 random valid actions', async () => {
            const propertyTest: PropertyTest<Action> = {
                name: 'ALL-INVARIANTS',
                description: 'All kernel invariants hold for valid actions',
                generator: () => generator.generateValid(),
                property: (action: Action) => {
                    const context: InvariantContext = { action, manager: identityManager };
                    const result = checkInvariants(context);
                    return result.ok;
                },
                iterations: 10000
            };

            const result = await CertificationHarness.runPropertyTest(propertyTest);

            expect(result.passed).toBe(true);
            expect(result.failures.length).toBe(0);

            console.log(`✅ Certified: All ${KERNEL_INVARIANTS.length} invariants verified across ${result.iterations} iterations in ${result.duration}ms`);
        });

        test('Invalid actions are correctly rejected', async () => {
            const batch = generator.generateBatch(1000, 0.5); // 50% valid, 50% invalid
            let validAccepted = 0;
            let invalidRejected = 0;
            let falsePositives = 0;
            let falseNegatives = 0;

            for (const action of batch) {
                const context: InvariantContext = { action, manager: identityManager };
                const result = checkInvariants(context);

                // Determine if action is actually valid
                const now = Date.now();
                const ts = parseInt(action.timestamp.split(':')[0] || '0');
                const isActuallyValid =
                    action.actionId && action.actionId.length > 0 &&
                    action.payload?.metricId &&
                    (action.signature === 'TRUSTED' || action.signature === 'GOVERNANCE_SIGNATURE' || /^[0-9a-fA-F]+$/.test(action.signature)) &&
                    Number.isFinite(action.payload?.value) &&
                    JSON.stringify(action.payload).length <= 16384 &&
                    ts <= now + 60000 &&
                    identityManager.get(action.initiator)?.status === 'ACTIVE';

                if (isActuallyValid && result.ok) {
                    validAccepted++;
                } else if (!isActuallyValid && !result.ok) {
                    invalidRejected++;
                } else if (isActuallyValid && !result.ok) {
                    falsePositives++;
                } else if (!isActuallyValid && result.ok) {
                    falseNegatives++;
                }
            }

            console.log(`Certification Results:
  Valid Accepted: ${validAccepted}
  Invalid Rejected: ${invalidRejected}
  False Positives: ${falsePositives}
  False Negatives: ${falseNegatives}
  Accuracy: ${((validAccepted + invalidRejected) / batch.length * 100).toFixed(2)}%`);

            expect(falseNegatives).toBe(0); // No invalid actions should pass
            expect(falsePositives).toBe(0); // No valid actions should be rejected
        });
    });
});
