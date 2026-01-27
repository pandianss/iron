// src/L5/Audit.ts
import { hash, canonicalize } from '../L0/Crypto.js';
import type { Action } from '../L0/Ontology.js';

/**
 * Event Store Port (Internal reference to avoid circular deps if needed, 
 * but here we use it for type safety).
 */
export interface IEventStore {
    append(evidence: Evidence): Promise<void>;
    getHistory(): Promise<Evidence[]>;
    getLatest(): Promise<Evidence | null>;
}

// --- 12. Evidence (The institutional truth substrate) ---
export interface Evidence {
    evidenceId: string; // The identifying hash
    previousEvidenceId: string; // Chain linkage
    action: Action; // LinkedAction
    status: 'SUCCESS' | 'FAILURE' | 'ATTEMPT' | 'REJECT' | 'ABORTED' | 'ACCEPTED';
    reason?: string;
    metadata?: Record<string, any>; // Structured diagnostics (Product 2)
    timestamp: string; // Logical Timestamp: "time:logical"
}

export class AuditLog {
    private localChain: Evidence[] = [];
    private genesisHash = '0000000000000000000000000000000000000000000000000000000000000000';

    constructor(private store?: IEventStore) { }

    public async append(
        action: Action,
        status: 'SUCCESS' | 'FAILURE' | 'ATTEMPT' | 'REJECT' | 'ABORTED' | 'ACCEPTED' = 'SUCCESS',
        reason?: string,
        metadata?: Record<string, any>
    ): Promise<Evidence> {
        const latest = this.localChain.length > 0
            ? this.localChain[this.localChain.length - 1]
            : await this.store?.getLatest();

        const previousHash = latest ? latest.evidenceId : this.genesisHash;

        // IV.2 Temporal Law: Monotonicity is handled by Kernel/LogicalTimestamp
        // We use the action's timestamp as the definitive time for the evidence.
        const entryTs = action.timestamp;

        const entryHash = this.calculateHash(previousHash, action, status, entryTs, reason, metadata);

        const evidence: Evidence = {
            evidenceId: entryHash,
            previousEvidenceId: previousHash,
            action: action,
            status: status,
            timestamp: entryTs,
            ...(reason ? { reason } : {}),
            ...(metadata ? { metadata } : {})
        };

        // IV.1 Immutability Law
        Object.freeze(evidence);

        if (this.store) {
            await this.store.append(evidence);
        }

        this.localChain.push(evidence);
        return evidence;
    }

    public async getHistory(): Promise<Evidence[]> {
        if (this.store) {
            return await this.store.getHistory();
        }
        return [...this.localChain];
    }

    // IV.3 Historical Legitimacy
    public async verifyChain(): Promise<boolean> {
        const history = await this.getHistory();
        let prev = this.genesisHash;

        for (const entry of history) {
            // 1. Linkage Check
            if (entry.previousEvidenceId !== prev) return false;

            // 2. Hash Check
            const h = this.calculateHash(prev, entry.action, entry.status, entry.timestamp, entry.reason, entry.metadata);
            if (h !== entry.evidenceId) return false;

            prev = entry.evidenceId;
        }
        return true;
    }

    // Alias for compatibility
    public async verifyIntegrity(): Promise<boolean> { return this.verifyChain(); }

    private calculateHash(prevHash: string, action: Action, status: string, timestamp: string, reason?: string, metadata?: any): string {
        // Canonical Evidence Tuple (Phase 4 Strictness)
        // [PreviousHash, ActionID, Status, Timestamp, ReasonHash, MetadataHash]
        const reasonHash = reason ? hash(reason) : hash('');
        const metaHash = metadata ? hash(canonicalize(metadata)) : hash('{}');

        const canonical: [string, string, string, string, string, string] = [
            prevHash,
            action.actionId,
            status,
            timestamp,
            reasonHash,
            metaHash
        ];

        return hash(canonicalize(canonical));
    }

    public async getTip(): Promise<Evidence | null> {
        if (this.localChain.length > 0) return this.localChain[this.localChain.length - 1] ?? null;
        if (this.store) return (await this.store.getLatest()) ?? null;
        return null;
    }
}
