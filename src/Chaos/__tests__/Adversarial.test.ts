
import { describe, it, expect } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { AuditLog } from '../../L5/Audit.js';
import { generateKeyPair, signData } from '../../L0/Crypto.js';

function createHardenedKernel() {
    const registry = new MetricRegistry();
    const auditLog = new AuditLog();
    const identity = new IdentityManager();
    const authority = new AuthorityEngine(identity);
    const state = new StateModel(auditLog, registry, identity);
    const protocols = new ProtocolEngine(state);

    // Hardened Kernel
    const kernel = new GovernanceKernel(identity, authority, state, protocols, auditLog, registry);
    kernel.boot();

    // Register Root (The Source of Authority)
    identity.register({
        id: 'root',
        type: 'SYSTEM',
        status: 'ACTIVE',
        identityProof: 'genesis',
        publicKey: generateKeyPair().publicKey,
        createdAt: '0:0',
        isRoot: true
    });

    return { kernel, identity, authority, registry, state };
}

describe('Phase 5: Adversarial Scenarios (Threat Modeling)', () => {

    it('THREAT-01: Replay Attack (The Xerox Exploit)', () => {
        const { kernel, identity, authority, registry } = createHardenedKernel();

        // Setup Victim
        const { publicKey, privateKey } = generateKeyPair();
        const victim = 'victim-01';
        identity.register({ id: victim, type: 'ACTOR', status: 'ACTIVE', publicKey, createdAt: '0', identityProof: 'gen' });

        registry.register({ id: 'coin', description: 'Coin', type: MetricType.COUNTER, validator: v => v >= 0 });
        authority.grant('auth-1', 'root', victim, 'TOTAL_CAPACITY', '*', '0', 'GOVERNANCE_SIGNATURE');

        // 1. Create Valid Action
        const actionPayload = { metricId: 'coin', value: 10 };
        const timestamp = Date.now().toString();
        const action = {
            actionId: 'tx-unique-1', // Fixed ID
            initiator: victim,
            payload: actionPayload,
            timestamp,
            expiresAt: '0',
            signature: ''
        };
        // Canonical Signature Construction
        const data = `${action.actionId}:${action.initiator}:${JSON.stringify(action.payload)}:${action.timestamp}:${action.expiresAt}`;
        action.signature = signData(data, privateKey);

        // 2. Submit First Time -> Success
        const aid1 = kernel.submitAttempt(victim, 'SYSTEM', action);
        const res1 = kernel.guardAttempt(aid1);
        expect(res1.status).toBe('ACCEPTED');
        kernel.commitAttempt(aid1, { consume: () => { } } as any);

        // 3. Replay Attack: Resubmit EXACT same action object
        try {
            const aid2 = kernel.submitAttempt(victim, 'SYSTEM', action);
            const res2 = kernel.guardAttempt(aid2);

            if (res2.status === 'ACCEPTED') {
                kernel.commitAttempt(aid2, { consume: () => { } } as any);
                // IF WE GET HERE, REPLAY SUCCEEDED -> VULNERABILITY
                throw new Error("Vulnerability Detected: Replay Attack Successful");
            }
        } catch (e: any) {
            if (e.message.includes("Vulnerability")) throw e;
            expect(e.message).toMatch(/Action ID|Duplicate|Replay|Already|exists/i);
        }
    });

    it('THREAT-02: Time Warp (The DeLorean Exploit)', () => {
        const { kernel, identity, authority, registry } = createHardenedKernel();
        const { publicKey, privateKey } = generateKeyPair();
        const traveler = 'marty';
        identity.register({ id: traveler, type: 'ACTOR', status: 'ACTIVE', publicKey, createdAt: '0', identityProof: 'gen' });
        registry.register({ id: 'flux', description: 'Flux', type: MetricType.GAUGE });
        authority.grant('auth-2', 'root', traveler, 'TOTAL_CAPACITY', '*', '0', 'GOVERNANCE_SIGNATURE');

        // Case A: Future Action (Far Future)
        const futureAction = {
            actionId: 'future-1',
            initiator: traveler,
            payload: { metricId: 'flux', value: 88 },
            timestamp: (Date.now() + 1000000).toString(), // +1000s
            expiresAt: '0',
            signature: ''
        };
        const data = `${futureAction.actionId}:${futureAction.initiator}:${JSON.stringify(futureAction.payload)}:${futureAction.timestamp}:${futureAction.expiresAt}`;
        futureAction.signature = signData(data, privateKey);

        const aid1 = kernel.submitAttempt(traveler, 'SYSTEM', futureAction);
        const res1 = kernel.guardAttempt(aid1);

        expect(res1.status).toBe('REJECTED');
        expect(res1.reason).toMatch(/Future|Timestamp|Temporal/i);

        // Case B: Past        // 1. Commit t=Now
        const now = Date.now();
        const t1 = { ...futureAction, actionId: 't1', timestamp: now.toString() };
        const dataT1 = `${t1.actionId}:${t1.initiator}:${JSON.stringify(t1.payload)}:${t1.timestamp}:${t1.expiresAt}`;
        t1.signature = signData(dataT1, privateKey);

        const aidT1 = kernel.submitAttempt(traveler, 'SYSTEM', t1);
        kernel.guardAttempt(aidT1);
        kernel.commitAttempt(aidT1, { consume: () => { } } as any);

        // 2. Submit t=Now-5000 (Past relative to State)
        const past = { ...futureAction, actionId: 'past-1', timestamp: (now - 5000).toString() };
        // Resign
        const dataPast = `${past.actionId}:${past.initiator}:${JSON.stringify(past.payload)}:${past.timestamp}:${past.expiresAt}`;
        past.signature = signData(dataPast, privateKey);

        const aid2 = kernel.submitAttempt(traveler, 'SYSTEM', past);
        const res2 = kernel.guardAttempt(aid2);

        if (res2.status === 'ACCEPTED') {
            // Try Commit
            expect(() => {
                kernel.commitAttempt(aid2, { consume: () => { } } as any);
            }).toThrow(/Monotonicity|Time/i);
        }
    });

    it('THREAT-03: Sybil Flood (The Clone Exploit)', () => {
        const { kernel, identity } = createHardenedKernel();
        const { publicKey } = generateKeyPair();
        identity.register({ id: 'sybil-master', type: 'ACTOR', status: 'ACTIVE', publicKey, createdAt: '0', identityProof: 'gen' });

        const aid = kernel.submitAttempt('sybil-master', 'SYSTEM', {
            actionId: 'spam',
            initiator: 'sybil-master',
            payload: { metricId: 'x', value: 1 },
            timestamp: Date.now().toString(),
            expiresAt: '0',
            signature: 'garbage'
        });

        const res = kernel.guardAttempt(aid);
        expect(res.status).toBe('REJECTED');
    });

});
