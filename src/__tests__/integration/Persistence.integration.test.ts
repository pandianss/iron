
import { describe, test, expect, afterAll, beforeEach } from '@jest/globals';
import { SQLiteEventStore } from '../../infrastructure/persistence/SQLiteEventStore.js';
import type { Evidence, Action } from '../../kernel-core/L0/Ontology.js';
import fs from 'fs';

const TEST_DB = 'test_persistence.db';

describe('SQLite Persistence Integration', () => {
    let store: SQLiteEventStore;

    beforeEach(() => {
        if (fs.existsSync(TEST_DB)) {
            fs.unlinkSync(TEST_DB);
        }
        store = new SQLiteEventStore(TEST_DB);
    });

    afterEach(() => {
        store.close();
        if (fs.existsSync(TEST_DB)) {
            try {
                fs.unlinkSync(TEST_DB);
            } catch (e) { /* Ignore */ }
        }
    });

    afterAll(() => {
        if (fs.existsSync(TEST_DB)) {
            try {
                fs.unlinkSync(TEST_DB);
            } catch (e) { /* Ignore */ }
        }
    });

    test('should persist and retrieve evidence', async () => {
        const action: Action = {
            actionId: 'act_1',
            initiator: 'user_1',
            payload: { key: 'value' },
            timestamp: '1000:0',
            expiresAt: '2000:0',
            signature: 'sig_1'
        };

        const evidence: Evidence = {
            evidenceId: 'ev_1',
            previousEvidenceId: 'genesis',
            action: action,
            status: 'SUCCESS',
            timestamp: '1000:0',
            reason: 'verified',
            metadata: { ip: '127.0.0.1' }
        };

        await store.append(evidence);

        const history = await store.getHistory();
        expect(history.length).toBe(1);
        expect(history[0].evidenceId).toBe('ev_1');
        expect(history[0].action.payload).toEqual({ key: 'value' });
        expect(history[0].reason).toBe('verified');
        expect(history[0].action.expiresAt).toBe('2000:0');
    });

    test('should recover state after restart', async () => {
        const action: Action = {
            actionId: 'act_persistence',
            initiator: 'user_persist',
            payload: { data: 'persistent' },
            timestamp: '5000:0',
            expiresAt: '0',
            signature: 'sig_p'
        };

        const evidence: Evidence = {
            evidenceId: 'ev_persist',
            previousEvidenceId: 'ev_1',
            action: action,
            status: 'ACCEPTED',
            timestamp: '5000:0'
        };

        await store.append(evidence);
        store.close();

        // Restart
        const newStore = new SQLiteEventStore(TEST_DB);
        const latest = await newStore.getLatest();

        expect(latest).not.toBeNull();
        expect(latest?.evidenceId).toBe('ev_persist');
        expect(latest?.status).toBe('ACCEPTED');

        newStore.close();
    });
});
