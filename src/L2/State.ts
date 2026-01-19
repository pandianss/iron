
// src/L2/State.ts
import type { PrincipalId } from '../L1/Identity.js';
import { IdentityManager } from '../L1/Identity.js';
import { verifySignature, hash } from '../L0/Crypto.js';
import { AuditLog } from '../L5/Audit.js';
import { LogicalTimestamp } from '../L0/Kernel.js';

// --- Intent ---
export interface MetricPayload {
    metricId: string;
    value: any;
}

export interface Intent {
    intentId: string;
    principalId: PrincipalId;
    payload: MetricPayload;
    timestamp: string;
    expiresAt: string; // BigInt or String? String due to JSON/Serialization
    signature: string;
}

// --- Metrics ---
export enum MetricType {
    COUNTER = 'COUNTER',
    GAUGE = 'GAUGE',
    BOOLEAN = 'BOOLEAN'
}

export interface MetricDefinition {
    id: string;
    description: string;
    type: MetricType;
    unit?: string;
    validator?: (value: any) => boolean;
}

export class MetricRegistry {
    private metrics: Map<string, MetricDefinition> = new Map();
    register(def: MetricDefinition) { this.metrics.set(def.id, def); }
    get(id: string) { return this.metrics.get(id); }
}

// --- State ---
export interface StateValue<T = any> {
    value: T;
    updatedAt: string; // Timestamp from Intent
    evidenceHash: string; // Link to Audit Log Entry
    stateHash: string; // SHA256(PrevStateHash + LogEntryHash)
}

export class StateModel {
    private state: Map<string, StateValue> = new Map();
    private history: Map<string, StateValue[]> = new Map();

    constructor(
        private auditLog: AuditLog,
        private registry: MetricRegistry,
        private identityManager: IdentityManager
    ) { }

    public apply(intent: Intent): void {
        try {
            // 1. Verify Identity & Signature
            const principal = this.identityManager.get(intent.principalId);
            if (!principal) throw new Error("Unknown Principal");
            if (principal.revoked) throw new Error("Principal Revoked");

            const data = `${intent.intentId}:${intent.principalId}:${JSON.stringify(intent.payload)}:${intent.timestamp}:${intent.expiresAt}`;

            if (!verifySignature(data, intent.signature, principal.publicKey)) {
                throw new Error("Invalid Intent Signature");
            }

            // 2. Delegate to common application logic
            this.applyTrusted(intent.payload, intent.timestamp, intent.principalId, intent.intentId);

        } catch (e: any) {
            console.warn(`State Transition Failed: ${e.message}`);
            this.auditLog.append(intent, 'FAILURE');
            throw e;
        }
    }

    public validateMutation(payload: MetricPayload): void {
        if (!payload?.metricId) throw new Error("Missing Metric ID");
        const def = this.registry.get(payload.metricId);
        if (!def) throw new Error(`Unknown metric: ${payload.metricId}`);
        if (def.validator && !def.validator(payload.value)) throw new Error("Invalid Value");
    }

    /**
     * Applies a state transition without signature verification.
     * Use ONLY from trusted sources (e.g., Kernel after verification, Internal Engines).
     */
    public applyTrusted(payload: MetricPayload, timestamp: string, principalId: string = 'system', intentId?: string): Intent {
        this.validateMutation(payload);

        // 2. Monotonic Time Check
        const lastState = this.state.get(payload.metricId);
        if (lastState) {
            const current = LogicalTimestamp.fromString(timestamp);
            const last = LogicalTimestamp.fromString(lastState.updatedAt);

            if (current.time < last.time || (current.time === last.time && current.logical < last.logical)) {
                throw new Error("Time Violation: Monotonicity Breach");
            }
        }

        // 3. Construct dummy intent for logging if not provided
        const intent: Intent = {
            intentId: intentId || hash(`trusted:${principalId}:${payload.metricId}:${timestamp}:${Math.random()}`),
            principalId,
            payload,
            timestamp,
            expiresAt: '0',
            signature: 'TRUSTED'
        };

        // 4. Commit SUCCESS to Audit Log
        const logEntry = this.auditLog.append(intent, 'SUCCESS');

        // 5. Update State
        const prevStateHash = lastState ? lastState.stateHash : '0000000000000000000000000000000000000000000000000000000000000000';
        const stateHash = hash(prevStateHash + logEntry.hash);

        const newState: StateValue = {
            value: payload.value,
            updatedAt: timestamp,
            evidenceHash: logEntry.hash,
            stateHash: stateHash
        };

        this.state.set(payload.metricId, newState);
        if (!this.history.has(payload.metricId)) this.history.set(payload.metricId, []);
        this.history.get(payload.metricId)?.push(newState);

        return intent;
    }

    public get(id: string) { return this.state.get(id)?.value; }
    public getHistory(id: string) { return this.history.get(id) || []; }
}
