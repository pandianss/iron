import { IronServer } from '../Server.js';
import type { Action } from '../../kernel-core/L0/Ontology.js';
import { generateKeyPair, signData } from '../../kernel-core/L0/Crypto.js';
import http from 'http';

// Helper for HTTP requests
function request(url: string, options: any, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode && res.statusCode >= 400) reject(json);
                    else resolve(json);
                } catch (e) {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

describe('M3: Application Foundation', () => {
    let server: IronServer;
    const PORT = 3001;
    const API_URL = `http://localhost:${PORT}`;
    const aliceKey = generateKeyPair();

    beforeAll(async () => {
        // Start Server (using in-memory DB or test file would be better, but implementing cleanup here)
        server = new IronServer(PORT);
        await server.start();
        // Wait briefly for boot
        await new Promise(r => setTimeout(r, 1000));
    });

    afterAll(() => {
        // server.close() - need to implement close in server
        // process.exit(0); // Force exit for now as Server loops
    });

    test('M3.2 API: POST /execute runs an action', async () => {
        // 1. Create Identity (Bootstrap Alice)
        // Need a way to inject identity or assume server starts with some?
        // Server follows standard boot, so no identities exist initially except via GENESIS protocols if any.
        // Or we use the internal kernel ref to seed it for the test.

        const kernel = (server as any).kernel;
        kernel.identity.register({
            id: 'alice',
            publicKey: aliceKey.publicKey,
            type: 'ACTOR',
            status: 'ACTIVE',
            isRoot: true,
            createdAt: '0:0'
        });

        // 2. Submit Action
        const action: Action = {
            actionId: `act-api-${Date.now()}`,
            initiator: 'alice',
            payload: { metricId: 'test.api.counter', value: 100 },
            timestamp: '1:0',
            expiresAt: '0',
            signature: ''
        };
        const data = `${action.actionId}:${action.initiator}:${JSON.stringify(action.payload)}:${action.timestamp}:${action.expiresAt}`;
        action.signature = signData(data, aliceKey.privateKey);

        const result = await request(`${API_URL}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, action);

        expect(result.status).toBe('COMMITTED');
        expect(result.attemptId).toBe(action.actionId);
    });

    test('M3.2 API: GET /state returns updated state', async () => {
        const state = await request(`${API_URL}/state/test.api.counter`, { method: 'GET' });
        expect(state.value).toBe(100);
    });

    test('M3.1 Persistence: Audit log contains the action', async () => {
        const audit = await request(`${API_URL}/audit`, { method: 'GET' });
        const entry = audit.find((e: any) => e.action.actionId.startsWith('act-api-'));
        expect(entry).toBeDefined();
        expect(entry.status).toBe('SUCCESS');
    });

});
