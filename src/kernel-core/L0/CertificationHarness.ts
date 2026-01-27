// src/kernel-core/L0/CertificationHarness.ts
import { CryptoEngine } from './Crypto.js';
import type { Action, EntityID, ActionPayload } from './Ontology.js';
import type { LogicalTimestamp } from './Kernel.js';

/**
 * Property-Based Testing Framework for Kernel Certification
 * Generates random valid and invalid actions for verification
 */

export interface PropertyTest<T> {
    name: string;
    description: string;
    property: (input: T) => boolean;
    generator: () => T;
    iterations?: number; // Default: 1000
}

export interface CertificationResult {
    testName: string;
    passed: boolean;
    iterations: number;
    failures: Array<{
        iteration: number;
        input: any;
        error: string;
    }>;
    duration: number; // milliseconds
}

/**
 * Action Generator
 * Creates random valid and invalid actions for property-based testing
 */
export class ActionGenerator {
    private entityIds: EntityID[] = [];
    private metricIds: string[] = [];
    private protocolIds: string[] = [];

    constructor(
        entityIds: EntityID[] = ['entity-1', 'entity-2', 'entity-3'],
        metricIds: string[] = ['wealth', 'health', 'karma'],
        protocolIds: string[] = ['TRANSFER', 'MINT', 'BURN']
    ) {
        this.entityIds = entityIds;
        this.metricIds = metricIds;
        this.protocolIds = protocolIds;
    }

    /**
     * Generate a random valid action
     */
    generateValid(): Action {
        const entityId = this.randomElement(this.entityIds);
        const metricId = this.randomElement(this.metricIds);
        const protocolId = this.randomElement(this.protocolIds);
        const timestamp = this.generateTimestamp();
        const expiresAt = `${Date.now() + 3600000}:0`; // 1 hour later

        const payload: ActionPayload = {
            metricId,
            value: this.randomInt(-100, 100),
            protocolId
        };

        const action: Action = {
            actionId: this.generateActionId(),
            initiator: entityId,
            payload,
            timestamp,
            expiresAt,
            signature: 'TRUSTED'
        };

        return action;
    }

    /**
     * Generate an action with a specific invariant violation
     */
    generateInvalid(violationType: 'INVALID_SIGNATURE' | 'MISSING_METRIC_ID' | 'PAYLOAD_OVERSIZE' | 'FUTURE_TIMESTAMP' | 'INVALID_ACTION_ID' | 'NON_FINITE_VALUE'): Action {
        const base = this.generateValid();

        switch (violationType) {
            case 'INVALID_SIGNATURE':
                return { ...base, signature: 'invalid-hex-signature!' };

            case 'MISSING_METRIC_ID':
                return { ...base, payload: { ...base.payload, metricId: undefined as any } };

            case 'PAYLOAD_OVERSIZE':
                const largePayload = { ...base.payload, metadata: { large: 'x'.repeat(20000) } };
                return { ...base, payload: largePayload as any };

            case 'FUTURE_TIMESTAMP':
                return { ...base, timestamp: `${Date.now() + 120000}:0` }; // 2 minutes in future

            case 'INVALID_ACTION_ID':
                return { ...base, actionId: '' };

            case 'NON_FINITE_VALUE':
                return { ...base, payload: { ...base.payload, value: NaN } };

            default:
                return base;
        }
    }

    /**
     * Generate a batch of random actions
     */
    generateBatch(count: number, validRatio: number = 0.8): Action[] {
        const actions: Action[] = [];
        const validCount = Math.floor(count * validRatio);
        const invalidCount = count - validCount;

        // Generate valid actions
        for (let i = 0; i < validCount; i++) {
            actions.push(this.generateValid());
        }

        // Generate invalid actions
        const violationTypes: Array<'INVALID_SIGNATURE' | 'MISSING_METRIC_ID' | 'PAYLOAD_OVERSIZE' | 'FUTURE_TIMESTAMP' | 'INVALID_ACTION_ID' | 'NON_FINITE_VALUE'> = [
            'INVALID_SIGNATURE',
            'MISSING_METRIC_ID',
            'PAYLOAD_OVERSIZE',
            'FUTURE_TIMESTAMP',
            'INVALID_ACTION_ID',
            'NON_FINITE_VALUE'
        ];

        for (let i = 0; i < invalidCount; i++) {
            const violationType = this.randomElement(violationTypes);
            actions.push(this.generateInvalid(violationType));
        }

        // Shuffle
        return this.shuffle(actions);
    }

    // Helper methods
    private randomElement<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)]!;
    }

    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private generateActionId(): string {
        return `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateTimestamp(): LogicalTimestamp {
        return `${Date.now()}:${this.randomInt(0, 1000)}`;
    }

    private shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j]!, result[i]!];
        }
        return result;
    }
}

/**
 * Certification Harness
 * Runs property-based tests and generates certification results
 */
export class CertificationHarness {
    /**
     * Run a property-based test
     */
    static async runPropertyTest<T>(test: PropertyTest<T>): Promise<CertificationResult> {
        const iterations = test.iterations || 1000;
        const failures: Array<{ iteration: number; input: any; error: string }> = [];
        const startTime = Date.now();

        for (let i = 0; i < iterations; i++) {
            try {
                const input = test.generator();
                const result = test.property(input);

                if (!result) {
                    failures.push({
                        iteration: i,
                        input,
                        error: 'Property returned false'
                    });
                }
            } catch (error) {
                failures.push({
                    iteration: i,
                    input: null,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        const duration = Date.now() - startTime;

        return {
            testName: test.name,
            passed: failures.length === 0,
            iterations,
            failures,
            duration
        };
    }

    /**
     * Run multiple property tests
     */
    static async runPropertyTests<T>(tests: PropertyTest<T>[]): Promise<CertificationResult[]> {
        const results: CertificationResult[] = [];

        for (const test of tests) {
            const result = await this.runPropertyTest(test);
            results.push(result);
        }

        return results;
    }

    /**
     * Generate a summary report
     */
    static generateSummary(results: CertificationResult[]): {
        totalTests: number;
        passed: number;
        failed: number;
        totalIterations: number;
        totalDuration: number;
        passRate: number;
    } {
        const totalTests = results.length;
        const passed = results.filter(r => r.passed).length;
        const failed = totalTests - passed;
        const totalIterations = results.reduce((sum, r) => sum + r.iterations, 0);
        const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
        const passRate = totalTests > 0 ? (passed / totalTests) * 100 : 0;

        return {
            totalTests,
            passed,
            failed,
            totalIterations,
            totalDuration,
            passRate
        };
    }
}
