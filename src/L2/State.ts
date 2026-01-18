
// src/L2/State.ts
import { PrincipalId, IdentityManager } from '../L1/Identity'; // Need IdentityManager to look up keys
import { verifySignature, hash } from '../L0/Crypto';
import { AuditLog } from '../L5/Audit';

// --- Intent (Replaces Evidence) ---
export interface MetricPayload {
    metricId: string;
    value: any;
}

export interface Intent {
    intentId: string; // Hash of payload+meta?
    principalId: PrincipalId;
    payload: MetricPayload;
    timestamp: string;
    expiresAt: string;
    signature: string; // Sign(intentId + principalId + JSON(payload) + timestamp + expiresAt)
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
    updatedAt: string;
    evidenceHash: string; // Link to Audit Log Entry
    stateHash: string; // SHA256(PrevStateHash + IntentHash)
}

export class StateModel {
    private state: Map<string, StateValue> = new Map();
    private history: Map<string, StateValue[]> = new Map();

    // Global State Hash? Or Per-Metric?
    // "State[n].hash = ..." implies a global or per-metric chain.
    // L5 AuditLog chains Events. State reflects the *Result*.
    // Let's chain per-metric state for granular provenance.

    constructor(
        private auditLog: AuditLog,
        private registry: MetricRegistry,
        private identityManager: IdentityManager // Dependency for Verification
    ) { }

    public apply(intent: Intent): void {
        // 1. Verify Identity & Signature
        const principal = this.identityManager.get(intent.principalId);
        if (!principal) throw new Error("Unknown Principal");

        // Reconstruct signed data payload
        const data = `${intent.intentId}:${intent.principalId}:${JSON.stringify(intent.payload)}:${intent.timestamp}:${intent.expiresAt}`;

        if (!verifySignature(data, intent.signature, principal.publicKey)) {
            console.error("Sig Verification Failed!");
            console.error("Data:", data);
            console.error("Key:", principal.publicKey);
            console.error("Sig:", intent.signature);
            throw new Error("Invalid Intent Signature");
        }

        // 2. Validate Payload
        const payload = intent.payload;
        if (!payload?.metricId) return;
        const def = this.registry.get(payload.metricId);
        if (!def) throw new Error(`Unknown metric: ${payload.metricId}`);
        if (def.validator && !def.validator(payload.value)) throw new Error("Invalid Value");

        // 3. Commit to Audit Log (L5)
        const logEntry = this.auditLog.append(intent);

        // 4. Update State (Hash Linked)
        const lastState = this.state.get(payload.metricId);
        const prevStateHash = lastState ? lastState.stateHash : '0000000000000000000000000000000000000000000000000000000000000000';
        const stateHash = hash(prevStateHash + logEntry.hash); // Chain result

        const newState: StateValue = {
            value: payload.value,
            updatedAt: intent.timestamp,
            evidenceHash: logEntry.hash,
            stateHash: stateHash
        };

        this.state.set(payload.metricId, newState);
        if (!this.history.has(payload.metricId)) this.history.set(payload.metricId, []);
        this.history.get(payload.metricId)?.push(newState);
    }

    public get(id: string) { return this.state.get(id)?.value; }
    public getHistory(id: string) { return this.history.get(id) || []; }
}
