import { jest, describe, test, expect } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { AuditLog } from '../../L5/Audit.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { signData as sign, hash } from '../../L0/Crypto.js';

describe('M2.1 Threat Mitigation (Security)', () => {
    // Setup
    const registry = new MetricRegistry();
    registry.register({ id: 'wealth', description: 'Wealth', type: MetricType.COUNTER });

    const identity = new IdentityManager();
    const actors = ['alice', 'bob', 'forger', 'replayer', 'unauthorized', 'exploiter'];
    for (const id of actors) {
        identity.register({
            id, publicKey: `pub_${id}`, status: 'ACTIVE', type: 'INDIVIDUAL', createdAt: '0:0', identityProof: 'proof'
        } as any);
    }
    console.log("DEBUG: Identities Registered:", actors.map(a => !!identity.get(a)));
    // Eve: Malicious Actor
    identity.register({ id: 'eve', publicKey: 'pub_eve', status: 'ACTIVE', type: 'INDIVIDUAL', createdAt: '0:0', identityProof: 'p2' } as any);

    const authority = new AuthorityEngine(identity);
    // Default: allow everything (specific tests will override)
    authority.authorized = jest.fn().mockReturnValue(true) as any;

    const audit = new AuditLog();
    const state = new StateModel(audit as any, registry, identity);
    const protocols = new ProtocolEngine(state);

    const kernel = new GovernanceKernel(identity, authority, state, protocols, audit as any, registry);
    kernel.boot();

    // Mock Verify Signature for test simplicity (L0/Crypto.ts is real, but we mock the verification logic in our minds or utility if needed, 
    // but here we are integrating. Let's rely on the real verifySignature if possible. 
    // However, since we don't have real keys, we might need to mock verifySignature in the Guard or use TRUSTED to bypass for setup.)

    // WAIT. We need to test the Guard itself. 
    // The SignatureGuard uses verifySignature from L0/Crypto. 
    // We should probably rely on the real crypto if we can, or mock the module if it's too complex.
    // L0/Crypto.ts uses standardized crypto. 
    // For this test, valid signature generation might be hard without real keys.
    // Let's assume we can mock the `verifySignature` import or use a specific known key pair if the crypto module supports it.
    // OPTION B: We rely on the fact that `verifySignature` returns false for junk.

    const tryExecute = async (payload: any, budget?: any) => {
        try {
            const res = await kernel.execute(payload, budget);
            return { status: 'ACCEPTED', result: res, reason: '' };
        } catch (e: any) {
            // console.log("DEBUG: Caught", e.message); 
            return { status: 'REJECTED', reason: e.message };
        }
    };

    test('1.1 Forgery: Should reject action with invalid signature', async () => {
        const payload = { metricId: 'wealth', value: 100 };
        // Use valid hex signature 'deadbeef' so it passes Invariant Regex check, hitting SignatureGuard
        const badSig = 'deadbeef';

        const result = await tryExecute({
            actionId: 'a-forge', initiator: 'forger', timestamp: '10:0', expiresAt: '20:0', signature: badSig,
            payload
        } as any);

        expect(result.status).toBe('REJECTED');
        expect(result.reason).toContain('Invalid Signature');
    });

    test('1.2 Replay: Should reject duplicate ActionID', async () => {
        // First execution (Valid)
        const r1 = await tryExecute({
            actionId: 'a-replay-1', initiator: 'replayer', timestamp: '10:0', expiresAt: '20:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 10 }
        } as any);

        if (r1.status === 'REJECTED') console.log("DEBUG 1.2 Failure:", r1.reason);
        expect(r1.status).toBe('ACCEPTED');

        // Replay attempt
        const result = await tryExecute({
            actionId: 'a-replay-1', initiator: 'replayer', timestamp: '10:0', expiresAt: '20:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 10 }
        } as any);

        expect(result.status).toBe('REJECTED');
        expect(result.reason).toContain('Replay Violation');
    });

    test('1.3 Privilege Escalation: Should reject unauthorized capability', async () => {
        // Deny everything
        (authority.authorized as jest.Mock).mockReturnValue(false);

        // 'unauthorized' user attempts action
        const result = await tryExecute({
            actionId: 'a-scope-1', initiator: 'unauthorized', timestamp: '11:0', expiresAt: '21:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 10 }
        } as any);

        expect(result.status).toBe('REJECTED');
        // Kernel returns 'Scope Violation' or 'Authority Violation' depending on Guard message
        expect(result.reason).toMatch(/Scope Violation|Authority Violation/);

        // Grant Alice permission
        (authority.authorized as jest.Mock).mockImplementation((actor, cap) => {
            return actor === 'alice';
        });

        // Alice retry
        const resultAlice = await tryExecute({
            actionId: 'a-scope-2', initiator: 'alice', timestamp: '12:0', expiresAt: '22:0', signature: 'TRUSTED',
            payload: { metricId: 'wealth', value: 10 }
        } as any);
        expect(resultAlice.status).toBe('ACCEPTED');
    });

    test('1.4 Protocol Exploit: Should reject protocol signature from non-protocol', async () => {
        // Reset mock to ALLOW to ensure Scope doesn't block it.
        (authority.authorized as jest.Mock).mockReturnValue(true);

        const resultExploit = await tryExecute({
            actionId: 'a-exploit-1', initiator: 'exploiter', timestamp: '13:0', expiresAt: '23:0', signature: 'GOVERNANCE_SIGNATURE',
            payload: { metricId: 'wealth', value: 9999 }
        } as any);

        // With the fix in Guards.ts, this should now be REJECTED.
        expect(resultExploit.status).toBe('REJECTED');
        expect(resultExploit.reason).toContain('Invalid Signature');
    });
});
