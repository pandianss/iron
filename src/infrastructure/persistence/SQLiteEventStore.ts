import Database from 'better-sqlite3';
import type { IEventStore, Evidence } from '../../kernel-core/L5/Audit.js';

export class SQLiteEventStore implements IEventStore {
    private db: Database.Database;

    constructor(dbPath: string = 'iron.db') {
        this.db = new Database(dbPath);
        this.initialize();
    }

    private initialize() {
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS audit_log (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                evidenceId TEXT UNIQUE NOT NULL,
                previousEvidenceId TEXT,
                actionId TEXT NOT NULL,
                initiator TEXT NOT NULL,
                status TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                payload TEXT NOT NULL,
                signature TEXT,
                metadata TEXT
            )
        `);
    }

    async append(evidence: Evidence): Promise<void> {
        const stmt = this.db.prepare(`
            INSERT INTO audit_log (
                evidenceId, previousEvidenceId, actionId, initiator, status, timestamp, payload, signature, metadata
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `);

        const payloadStr = JSON.stringify(evidence.action.payload);
        const metaStr = evidence.metadata ? JSON.stringify(evidence.metadata) : null;

        stmt.run(
            evidence.evidenceId,
            evidence.previousEvidenceId,
            evidence.action.actionId,
            evidence.action.initiator,
            evidence.status,
            evidence.action.timestamp,
            payloadStr,
            evidence.action.signature,
            metaStr
        );
    }

    async getHistory(): Promise<Evidence[]> {
        const stmt = this.db.prepare('SELECT * FROM audit_log ORDER BY sequence ASC');
        const rows = stmt.all() as any[];

        return rows.map(this.mapRowToEvidence);
    }

    async getLatest(): Promise<Evidence | null> {
        const stmt = this.db.prepare('SELECT * FROM audit_log ORDER BY sequence DESC LIMIT 1');
        const row = stmt.get() as any;

        if (!row) return null;
        return this.mapRowToEvidence(row);
    }

    private mapRowToEvidence(row: any): Evidence {
        return {
            evidenceId: row.evidenceId,
            previousEvidenceId: row.previousEvidenceId,
            action: {
                actionId: row.actionId,
                initiator: row.initiator,
                timestamp: row.timestamp,
                signature: row.signature,
                payload: JSON.parse(row.payload),
                expiresAt: '0', // Not stored in schema currently, defaulting
            },
            status: row.status,
            timestamp: row.timestamp, // Add missing top-level timestamp
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        };
    }

    public close() {
        this.db.close();
    }
}
