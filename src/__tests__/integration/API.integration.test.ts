
import { describe, test, expect, afterAll, beforeAll } from '@jest/globals';
import { IronServer } from '../../server/Server.js';
import type { Action } from '../../kernel-core/L0/Ontology.js';
import fs from 'fs';
import path from 'path';

const TEST_DB = 'test_api.db';
const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

describe('API Integration', () => {
    let server: any; // http.Server
    let ironServer: IronServer;

    beforeAll(async () => {
        // Ensure clean slate
        if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

        // Mock SQLiteEventStore inside IronServer?
        // IronServer hardcodes 'new SQLiteEventStore()'.
        // We might need to monkey-patch or constructor inject.
        // For now, let's assume IronServer uses default 'iron.db'.
        // Wait, IronServer constructor doesn't take DB path.
        // It does: this.eventStore = new SQLiteEventStore();
        // SQLiteEventStore defaults to 'iron.db'.

        // We should clear 'iron.db' before test if strict.
        if (fs.existsSync('iron.db')) {
            try { fs.unlinkSync('iron.db'); } catch { }
        }

        ironServer = new IronServer(PORT);
        server = await ironServer.start();
    });

    afterAll((done) => {
        if (server) {
            server.close(() => {
                // Cleanup
                if (fs.existsSync('iron.db')) {
                    try { fs.unlinkSync('iron.db'); } catch { }
                }
                done();
            });
        } else {
            done();
        }
    });

    test('POST /execute should process an action', async () => {
        const action: Action = {
            actionId: 'act_api_1',
            initiator: 'user_api',
            payload: { metricId: 'test.metric', value: 123 },
            timestamp: '1000:0',
            expiresAt: '2000:0',
            signature: 'sig_api'
        };

        const res = await fetch(`${BASE_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action)
        });

        const json = await res.json();
        expect(res.status).toBe(500);
        expect(json.error).toMatch(/Signature format must be valid hex/);
    });


    test('GET /audit should return history', async () => {
        const res = await fetch(`${BASE_URL}/audit`);
        const json = await res.json();
        expect(Array.isArray(json)).toBe(true);
        expect(json.length).toBeGreaterThan(0); // Should have the action from previous test
        expect(json[0].action.actionId).toBe('act_api_1');
    });

    test('GET /state should return snapshot', async () => {
        const res = await fetch(`${BASE_URL}/state`);
        const json = await res.json();
        expect(Array.isArray(json)).toBe(true);
    });
});
