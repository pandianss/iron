// src/L5/Audit.ts
import { hash } from '../L0/Crypto.js';
import type { Intent } from '../L2/State.js';

// --- Audit Log (Hash Chain) ---
export interface LogEntry {
    hash: string;
    previousHash: string;
    intent: Intent;
    status: 'SUCCESS' | 'FAILURE' | 'ATTEMPT' | 'REJECT' | 'ABORTED';
    reason?: string;
}

export class AuditLog {
    private chain: LogEntry[] = [];
    private genesisHash = '0000000000000000000000000000000000000000000000000000000000000000';

    public append(intent: Intent, status: 'SUCCESS' | 'FAILURE' | 'ATTEMPT' | 'REJECT' | 'ABORTED' = 'SUCCESS', reason?: string): LogEntry {
        const previousHash = this.chain.length > 0 ? this.chain[this.chain.length - 1]!.hash : this.genesisHash;
        const entryHash = this.calculateHash(previousHash, intent, status, reason);

        const entry: LogEntry = {
            hash: entryHash,
            previousHash: previousHash,
            intent: intent,
            status: status,
            ...(reason ? { reason } : {})
        };

        this.chain.push(entry);
        return entry;
    }

    public getHistory(): LogEntry[] { return [...this.chain]; }

    public verifyIntegrity(): boolean {
        let prev = this.genesisHash;
        for (const entry of this.chain) {
            if (entry.previousHash !== prev) return false;
            const h = this.calculateHash(prev, entry.intent, entry.status);
            if (h !== entry.hash) return false;
            prev = entry.hash;
        }
        return true;
    }

    private calculateHash(prevHash: string, intent: Intent, status: string, reason?: string): string {
        const data = prevHash + JSON.stringify(intent) + status + (reason || '');
        return hash(data);
    }
}
