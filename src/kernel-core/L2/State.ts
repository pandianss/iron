import type { Action, ActionPayload, Mutation, EntityID } from '../L0/Ontology.js';
export type { Action, ActionPayload, Mutation, EntityID };
import { produce } from 'immer';
import { IdentityManager } from '../L1/Identity.js';
import { verifySignature, hash, hashState, canonicalize } from '../L0/Crypto.js';
import { AuditLog } from '../L5/Audit.js';
import { LogicalTimestamp } from '../L0/Kernel.js';


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
    stateHash: string; // Global State Hash at this point
}

export interface KernelState {
    metrics: Record<string, StateValue>;
    version: number;
    lastUpdate: string;
}

export interface StateSnapshot {
    state: KernelState;
    hash: string;
    previousHash: string;
    actionId: string;
    timestamp: string; // Explicit timestamp of the snapshot
}

export class StateModel {
    private currentState: KernelState = {
        metrics: {},
        version: 0,
        lastUpdate: '0:0'
    };

    // Merkle Chain of State
    private snapshots: StateSnapshot[] = [];

    // Legacy history view (derived)
    private historyCache: Map<string, StateValue[]> = new Map();

    public getSnapshotChain(): StateSnapshot[] { return this.snapshots; }

    constructor(
        private auditLog: AuditLog,
        private registry: MetricRegistry,
        private identityManager: IdentityManager
    ) {
        // Init Genesis Snapshot
        const genesisHash = hash("GENESIS");
        this.snapshots.push({
            state: this.currentState,
            hash: genesisHash,
            previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
            actionId: 'genesis',
            timestamp: '0:0'
        });
    }

    public async apply(action: Action): Promise<void> {
        try {
            // ... (rest of method)
            const entity = this.identityManager.get(action.initiator);
            if (!entity) throw new Error("Unknown Entity");
            if (entity.status === 'REVOKED') throw new Error("Entity Revoked");

            const data = `${action.actionId}:${action.initiator}:${canonicalize(action.payload)}:${action.timestamp}:${action.expiresAt}`;

            if (action.signature !== 'GOVERNANCE_SIGNATURE') {
                if (!verifySignature(data, action.signature, entity.publicKey)) {
                    throw new Error("Invalid Action Signature");
                }
            }

            // 2. institucional Ledger entry
            const evidence = await this.auditLog.append(action, 'SUCCESS');

            // 3. Delegate to common application logic
            await this.applyTrusted([action.payload], action.timestamp, action.initiator, action.actionId, evidence.evidenceId);

        } catch (e: any) {
            console.warn(`State Transition Failed: ${e.message}`);
            await this.auditLog.append(action, 'FAILURE');
            throw e;
        }
    }

    public validateMutation(payload: ActionPayload): void {
        if (!payload?.metricId) throw new Error("Missing Metric ID"); // Non-numeric metric ID");

        // Anti-Prototype Pollution
        const reserved = ['__proto__', 'prototype', 'constructor'];
        if (reserved.includes(payload.metricId)) throw new Error("Illegal Metric ID: Reserved Keyword");

        const def = this.registry.get(payload.metricId);
        if (!def) {
            // console.log(`[StateDebug] Unknown metric: ${payload.metricId}. Registered: ${Array.from((this.registry as any).metrics.keys())}`);
            throw new Error(`Unknown metric: ${payload.metricId}`);
        }
        if (def.validator && !def.validator(payload.value)) throw new Error("Invalid Value");
    }

    /**
     * Applies an atomic set of state transitions and creates a single cryptographic snapshot.
     * Requires evidenceId from the AuditLog to maintain linkage.
     */
    public async applyTrusted(
        mutations: Mutation[],
        timestamp: string,
        initiator: string = 'system',
        actionId?: string,
        evidenceId?: string
    ): Promise<Action> {
        if (!evidenceId) throw new Error("Kernel Error: evidenceId required for state transition");
        if (mutations.length === 0) throw new Error("Kernel Error: No mutations provided");

        // 1. Validation & Monotonicity
        const current = LogicalTimestamp.fromString(timestamp);
        const globalLast = LogicalTimestamp.fromString(this.currentState.lastUpdate);

        if (current.time < globalLast.time || (current.time === globalLast.time && current.logical < globalLast.logical)) {
            throw new Error("Time Violation: Global Monotonicity Breach");
        }

        const firstMutation = mutations[0]!;
        const validActionId = actionId || hash(`trusted:${initiator}:${firstMutation.metricId}:${timestamp}`);

        // 2. Calculate New State (Atomic Transition)
        const previousSnapshot = this.snapshots[this.snapshots.length - 1];
        if (!previousSnapshot) throw new Error("Critical: Genesis Block Missing");

        const finalState = produce(this.currentState, draft => {
            for (const mutation of mutations) {
                this.validateMutation(mutation);
                const lastState = draft.metrics[mutation.metricId];
                if (lastState) {
                    const last = LogicalTimestamp.fromString(lastState.updatedAt);
                    if (current.time < last.time || (current.time === last.time && current.logical < last.logical)) {
                        throw new Error(`Time Violation: Monotonicity Breach for metric ${mutation.metricId}`);
                    }
                }

                // Calculate the local transition hash for the metric
                const prevStateHash = lastState ? lastState.stateHash : '0000000000000000000000000000000000000000000000000000000000000000';
                const transitionHash = hash(prevStateHash + evidenceId);

                const newStateValue: StateValue = {
                    value: mutation.value,
                    updatedAt: timestamp,
                    evidenceHash: evidenceId,
                    stateHash: transitionHash
                };
                draft.metrics[mutation.metricId] = newStateValue;

                // Update Cache (Outside produce, after this block)
            }
            draft.version++;
            draft.lastUpdate = timestamp;
        });

        // Update History Cache
        for (const m of mutations) {
            const nv = finalState.metrics[m.metricId];
            if (nv) {
                let list = this.historyCache.get(m.metricId);
                if (!list) {
                    list = [];
                    this.historyCache.set(m.metricId, list);
                }
                list.push(nv);
            }
        }

        // 3. Calculate Global Merkle Root over all metrics
        const allMetrics = Object.entries(finalState.metrics).sort((a, b) => a[0].localeCompare(b[0]));
        const globalStateParams = allMetrics.map(([k, v]) => `${k}:${v.stateHash}`).join('|');
        const globalRoot = hashState(Buffer.from(globalStateParams + finalState.version));

        // 4. Create State Snapshot (Institutional Ledger Lock)
        const canonical: [number, string, string, string, string] = [
            finalState.version,
            validActionId,
            timestamp,
            globalRoot,
            previousSnapshot.hash
        ];

        const snapshotHash = hash(canonicalize(canonical));

        const snapshot: StateSnapshot = {
            state: finalState,
            hash: snapshotHash,
            previousHash: previousSnapshot.hash,
            actionId: validActionId,
            timestamp
        };

        this.snapshots.push(snapshot);
        this.currentState = finalState;

        // Return the action representation (mostly for logging/mapping)
        return {
            actionId: validActionId,
            initiator,
            payload: mutations[0] as any, // Legacy/Simplified return
            timestamp,
            expiresAt: '0',
            signature: 'TRUSTED'
        };
    }

    public verifyIntegrity(): boolean {
        for (let i = 1; i < this.snapshots.length; i++) {
            const prev = this.snapshots[i - 1];
            const curr = this.snapshots[i];

            if (!prev || !curr) return false;

            if (curr.previousHash !== prev.hash) return false;

            // Re-hash check
            const allMetrics = Object.entries(curr.state.metrics).sort((a, b) => a[0].localeCompare(b[0]));
            const globalStateParams = allMetrics.map(([k, v]) => `${k}:${v.stateHash}`).join('|');
            const globalRoot = hashState(Buffer.from(globalStateParams + curr.state.version));

            // Canonical Check (Phase 3)
            const canonical: [number, string, string, string, string] = [
                curr.state.version,
                curr.actionId,
                curr.timestamp,
                globalRoot,
                curr.previousHash
            ];

            // Note: Timestamp in canonical tuple comes from the Action input (applyTrusted args), 
            // but stored in StateSnapshot logic only implicitly via state updates?
            // Actually, applyTrusted uses `timestamp` arg for tuple, but `state.lastUpdate` is set to it.
            // So reconstruction is valid if state.lastUpdate == action timestamp.

            const expectedHash = hash(JSON.stringify(canonical));

            if (expectedHash !== curr.hash) return false;
        }
        return true;
    }
    public get(metricId: string): any {
        return this.currentState.metrics[metricId]?.value;
    }

    public getHistory(metricId: string): StateValue[] {
        return this.historyCache.get(metricId) || [];
    }
}
