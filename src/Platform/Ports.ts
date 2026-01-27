
import type { Action, StateSnapshot } from '../kernel-core/L2/State.js';
import type { EntityID } from '../kernel-core/L0/Ontology.js';
import type { Evidence } from '../kernel-core/L5/Audit.js';

/**
 * Persistence Port: Event Store
 * Handles the append-only log of institutional truth.
 */
export interface IEventStore {
    append(evidence: Evidence): Promise<void>;
    getHistory(): Promise<Evidence[]>;
    getLatest(): Promise<Evidence | null>;
}

/**
 * Persistence Port: State Repository
 * Handles the storage and retrieval of the Merkle-DAG state.
 */
export interface IStateRepository {
    saveSnapshot(snapshot: StateSnapshot): Promise<void>;
    getSnapshot(actionId: string): Promise<StateSnapshot | null>;
    getLatestSnapshot(): Promise<StateSnapshot | null>;
    getHistory(metricId: string): Promise<any[]>;
}

/**
 * Identity Port: Principal Registry
 * Maps product-level UserIDs to Kernel-level EntityIDs.
 */
export interface IPrincipalRegistry {
    resolve(userId: string): Promise<EntityID | null>;
    getPublicKey(entityId: EntityID): Promise<string | null>;
}

/**
 * Environment Port: System Clock
 * Normalizes time for the Kernel.
 */
export interface ISystemClock {
    now(): string; // Logical or ISO string
}
