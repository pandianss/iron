
import { jest, describe, test, expect, beforeEach, beforeAll } from '@jest/globals';

// --- Mocks for Outer Layers ---
jest.unstable_mockModule('../kernel-core/L2/State.js', () => ({
    StateModel: jest.fn().mockImplementation(() => ({
        validateMutation: jest.fn(),
        applyTrusted: jest.fn(),
        get: jest.fn()
    })),
    MetricRegistry: jest.fn().mockImplementation(() => ({
        get: jest.fn()
    })),
}));

jest.unstable_mockModule('../kernel-core/L4/Protocol.js', () => ({
    ProtocolEngine: jest.fn().mockImplementation(() => ({
        isRegistered: jest.fn().mockReturnValue(true),
        evaluate: jest.fn().mockReturnValue([])
    }))
}));

// --- Real Inner Layers (The Core) ---
import { GovernanceKernel } from '../kernel-core/Kernel.js';
import { IdentityManager, AuthorityEngine } from '../kernel-core/L1/Identity.js';
import { AuditLog } from '../kernel-core/L5/Audit.js';
import { Budget, BudgetType } from '../kernel-core/L0/Primitives.js';
import { generateKeyPair, signData, hash } from '../kernel-core/L0/Crypto.js';
import type { Action } from '../kernel-core/L2/State.js';

describe('The CONSTITUTION (Supreme Court Verification)', () => {
    let kernel: GovernanceKernel;
    let identity: IdentityManager;
    let authority: AuthorityEngine;
    let audit: AuditLog;

    // Mocks
    let mockState: any;
    let mockProtocols: any;
    let mockRegistry: any;

    const rootKeys = generateKeyPair();
    const userKeys = generateKeyPair();
    const malloryKeys = generateKeyPair(); // Attacker

    let testTime = 1000000;
    const realNow = Date.now;

    beforeAll(() => {
        global.Date.now = () => testTime;
    });

    afterAll(() => {
        global.Date.now = realNow;
    });

    beforeEach(async () => {
        testTime += 1000;
        const StateModule = await import('../kernel-core/L2/State.js');
        const ProtocolModule = await import('../kernel-core/L4/Protocol.js');

        mockState = new StateModule.StateModel(audit, mockRegistry, identity);
        mockRegistry = new StateModule.MetricRegistry();
        mockProtocols = new ProtocolModule.ProtocolEngine(mockState);

        // Real Logic
        audit = new AuditLog();
        identity = new IdentityManager();
        authority = new AuthorityEngine(identity);

        // Register ROOT (Article I)
        identity.register({
            id: 'ROOT',
            type: 'ACTOR',
            identityProof: 'ROOT_PROOF',
            status: 'ACTIVE',
            publicKey: rootKeys.publicKey,
            isRoot: true,
            createdAt: '0:0'
        });

        // Register USER
        identity.register({
            id: 'user',
            type: 'ACTOR',
            identityProof: 'USER_PROOF',
            status: 'ACTIVE',
            publicKey: userKeys.publicKey,
            createdAt: '0:0'
        });

        kernel = new GovernanceKernel(
            identity,
            authority,
            mockState,
            mockProtocols,
            audit,
            mockRegistry
        );

        kernel.boot();

        // DELEGATE POWER (Article III.2)
        kernel.grantAuthority('ROOT', 'ROOT', 'user', 'USER_ROLE', 'METRIC.WRITE:user.data');
    });

    const createAction = (initiator: string, keys: any, metric: string, val: any, ts: string = '1000:0') => {
        const payload = { metricId: metric, value: val };
        const exp = '0:0';

        // Match ActionFactory: Action ID = SHA256(Initiator + Payload + TS + Exp)
        const id = hash(`${initiator}:${JSON.stringify(payload)}:${ts}:${exp}`);

        // MATCH Guards.ts: `${intent.actionId}:${intent.initiator}:${JSON.stringify(intent.payload)}:${intent.timestamp}:${intent.expiresAt}`
        const data = `${id}:${initiator}:${JSON.stringify(payload)}:${ts}:${exp}`;

        return {
            actionId: id,
            initiator: initiator,
            payload,
            timestamp: ts,
            expiresAt: exp,
            signature: signData(data, keys.privateKey)
        } as Action;
    };

    // --- III. Authority Law ---
    test('Law I (Authority): Signature Forgery is Impossible', async () => {
        kernel.boot();

        // Mallory masquerades as User
        const fakeAction = createAction('user', malloryKeys, 'user.data', 666);

        const aid = await kernel.submitAttempt('attacker', 'proto1', fakeAction);
        const result = await kernel.guardAttempt(aid);

        expect(result.status).toBe('REJECTED');

        // Verify Audit Log (Evidence System)
        const history = await audit.getHistory();
        const entry = history.slice().reverse().find(e => e.action.actionId === fakeAction.actionId);
        expect(entry).toBeDefined();
        expect(entry?.status).toBe('REJECT');
        expect(entry?.reason).toMatch(/Invalid Signature/);
    });

    test('Law I (Authority): Jurisdiction Enforcement', async () => {
        kernel.boot();

        // User tries to write to ROOT data (Outside of granted jurisdiction)
        const exceedAction = createAction('user', userKeys, 'kernel.root.config', 1);

        const aid = await kernel.submitAttempt('user', 'proto1', exceedAction);
        const result = await kernel.guardAttempt(aid);

        expect(result.status).toBe('REJECTED');
        const history = await audit.getHistory();
        const entry = history.slice().reverse().find(e => e.action.actionId === exceedAction.actionId);
        expect(entry?.status).toBe('REJECT');
        expect(entry?.reason).toMatch(/lacks jurisdiction/i);
    });

    // --- II. State Law ---
    test('Law II (State): Action requires Active Kernel', async () => {
        const audit2 = new AuditLog();
        const kernel2 = new GovernanceKernel(identity, authority, mockState, mockProtocols, audit2, mockRegistry);

        const action = createAction('user', userKeys, 'user.data', 1);

        await expect(async () => {
            await kernel2.submitAttempt('user', 'proto1', action);
        }).rejects.toThrow(/Cannot submit attempt in state CONSTITUTED/);
    });

    // --- III. Economic Law ---
    test('Law III (Economics): Budget is Finite', async () => {
        kernel.boot();
        const action = createAction('user', userKeys, 'user.data', 1);
        const aid = await kernel.submitAttempt('user', 'proto1', action, 50);
        await kernel.guardAttempt(aid);

        const tinyBudget = new Budget(BudgetType.ENERGY, 40);

        await expect(kernel.commitAttempt(aid, tinyBudget)).rejects.toThrow(/Error/);
    });

    // --- IV. Truth & Time Law ---
    test('Law IV (Truth): Time is Monotonic', async () => {
        const startTs = testTime;

        const i1 = createAction('user', userKeys, 'user.data', 1, `${startTs}:0`);
        const aid1 = await kernel.submitAttempt('user', 'proto1', i1);
        await kernel.guardAttempt(aid1);
        try {
            await kernel.commitAttempt(aid1, new Budget(BudgetType.ENERGY, 100));
        } catch (e) { /* Warning: Setup failed, but proceeding */ }

        // Move time BACKWARDS
        testTime = startTs - 500;

        const i2 = createAction('user', userKeys, 'user.data', 2, `${testTime}:0`);
        const aid2 = await kernel.submitAttempt('user', 'proto1', i2);
        const status = await kernel.guardAttempt(aid2);
        expect(status.status).toBe('REJECTED');
        expect(status.reason).toMatch(/(Time|Temporal|Invariant)/);
    });

    // --- V. Identity Lifecycle Law ---
    test('Law V (Identity): Revoked Entity has Zero Power', async () => {
        kernel.boot();

        // Revoke user
        identity.revoke('user', 'now');

        const action = createAction('user', userKeys, 'user.data', 1);

        const aid = await kernel.submitAttempt('user', 'proto1', action);
        const result = await kernel.guardAttempt(aid);

        expect(result.status).toBe('REJECTED');
        const history = await audit.getHistory();
        const entry = history.slice().reverse().find(e => e.action.actionId === action.actionId);
        expect(entry?.reason).toMatch(/Entity must be ACTIVE/);
    });
});
