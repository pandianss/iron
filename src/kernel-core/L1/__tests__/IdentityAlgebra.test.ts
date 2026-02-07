import { IdentityManager, DelegationEngine, CapabilitySet } from '../Identity.js';
import { generateKeyPair, signData } from '../../L0/Crypto.js';

describe('IRON Identity Algebra', () => {
    let im: IdentityManager;
    let de: DelegationEngine;
    const now = '1000:0';

    beforeEach(() => {
        im = new IdentityManager();
        de = new DelegationEngine(im);
    });

    describe('1. Identity Primitives & State', () => {
        test('I-1: Root immutability', () => {
            const root = {
                id: 'root-1',
                publicKey: 'key',
                type: 'ACTOR' as const,
                scopeOf: new CapabilitySet(['*']),
                parents: [],
                createdAt: now,
                identityProof: 'TEST_KEY',
                status: 'ACTIVE' as const,
                isRoot: true
            };
            im.register(root);

            expect(() => im.revoke('root-1', now)).toThrow(/Root entities cannot be revoked/); // Updated regex
            const p = im.get('root-1');
            expect(p?.alive).toBe(true);
            expect(p?.revoked).toBe(false);
        });

        test('I-2: No resurrection', () => {
            const user = {
                id: 'user-1',
                publicKey: 'key',
                type: 'ACTOR' as const,
                scopeOf: new CapabilitySet(['METRIC.READ']),
                parents: [],
                createdAt: now,
                identityProof: 'TEST_KEY',
                status: 'ACTIVE' as const
            };
            im.register(user);
            im.revoke('user-1', now);

            expect(() => im.register(user)).toThrow(/No Resurrection allowed/);
        });

        test('I-3: Scope monotonicity on revocation', () => {
            const user = {
                id: 'user-1',
                publicKey: 'key',
                type: 'ACTOR' as const,
                scopeOf: new CapabilitySet(['METRIC.READ']),
                parents: [],
                createdAt: now,
                identityProof: 'TEST_KEY',
                status: 'ACTIVE' as const
            };
            im.register(user);
            im.revoke('user-1', now);

            const p = im.get('user-1');
            expect(p?.scopeOf?.all.length).toBe(0);
        });

        test('I-4: Acyclic provenance', () => {
            im.register({ id: 'p1', publicKey: 'k1', type: 'SYSTEM', scopeOf: new CapabilitySet(), parents: [], createdAt: now, identityProof: 'k1', status: 'ACTIVE' });
            im.register({ id: 'p2', publicKey: 'k2', type: 'SYSTEM', scopeOf: new CapabilitySet(), parents: ['p1'], createdAt: now, identityProof: 'k2', status: 'ACTIVE' });

            expect(() => im.register({ id: 'p1', publicKey: 'k1', type: 'SYSTEM', scopeOf: new CapabilitySet(), parents: ['p2'], createdAt: now, identityProof: 'k1', status: 'ACTIVE' }))
                .toThrow(/Cyclic provenance detected/);
        });
    });

    describe('4 & 5. Authority & Delegation Algebra', () => {
        test('EffectiveScope: Root baseline', () => {
            im.register({
                id: 'root', publicKey: 'key', type: 'ACTOR',
                scopeOf: new CapabilitySet(['METRIC.READ']), parents: [], createdAt: now, isRoot: true,
                identityProof: 'k', status: 'ACTIVE'
            });

            const effective = de.getEffectiveScope('root');
            expect(effective.has('METRIC.READ')).toBe(true);
        });

        test('5.1 & 5.2: Grant rule and No scope amplification', () => {
            const keys = generateKeyPair();
            im.register({
                id: 'root', publicKey: keys.publicKey, type: 'ACTOR',
                scopeOf: new CapabilitySet(['METRIC']), parents: [], createdAt: now, isRoot: true,
                identityProof: 'k', status: 'ACTIVE'
            });
            im.register({
                id: 'user', publicKey: 'user-key', type: 'ACTOR',
                scopeOf: new CapabilitySet(['METRIC']), parents: [], createdAt: now,
                identityProof: 'k', status: 'ACTIVE'
            });

            // Root has 'METRIC', delegates 'METRIC.READ' to User.
            const scope = new CapabilitySet(['METRIC.READ']);
            const data = `root:user:${JSON.stringify(scope.all)}:${now}`;
            const sig = signData(data, keys.privateKey);

            de.grant('root', 'user', scope, now, 'GOVERNANCE_SIGNATURE');

            const userEffective = de.getEffectiveScope('user');
            expect(userEffective.has('METRIC.READ')).toBe(true);
            expect(userEffective.has('METRIC.WRITE')).toBe(false);

            // User tries to delegate 'METRIC.WRITE' (which they don't have)
            im.register({ id: 'other', publicKey: 'k', type: 'SYSTEM', scopeOf: new CapabilitySet(), parents: [], createdAt: now, identityProof: 'k', status: 'ACTIVE' });
            const badScope = new CapabilitySet(['METRIC.WRITE']);
            expect(() => de.grant('user', 'other', badScope, now, 'GOVERNANCE_SIGNATURE'))
                .toThrow(/Scope Amplification|Authority Escalation/);
        });

        test('6.2: Revocation propagation (Lazy re-evaluation)', () => {
            const rootKeys = generateKeyPair();
            const userKeys = generateKeyPair();

            im.register({ id: 'root', publicKey: rootKeys.publicKey, type: 'ACTOR', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: now, isRoot: true, identityProof: 'k', status: 'ACTIVE' });
            im.register({ id: 'mid', publicKey: userKeys.publicKey, type: 'ACTOR', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: now, identityProof: 'k', status: 'ACTIVE' });
            im.register({ id: 'end', publicKey: 'end-key', type: 'ACTOR', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: now, identityProof: 'k', status: 'ACTIVE' });

            // root -> mid
            const s1 = new CapabilitySet(['*']);
            de.grant('root', 'mid', s1, now, 'GOVERNANCE_SIGNATURE');

            // mid -> end
            const s2 = new CapabilitySet(['*']);
            de.grant('mid', 'end', s2, now, 'GOVERNANCE_SIGNATURE');

            expect(de.authorized('end', 'ANY')).toBe(true);

            // Revoke mid
            im.revoke('mid', now);

            // end should lose authority because mid is no longer alive
            expect(de.authorized('end', 'ANY')).toBe(false);
        });
    });
});
