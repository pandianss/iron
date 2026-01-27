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
                type: 'INDIVIDUAL' as const,
                scopeOf: new CapabilitySet(['*']),
                parents: [],
                createdAt: now,
                isRoot: true
            };
            im.register(root);

            expect(() => im.revoke('root-1', now)).toThrow(/Root identities cannot be revoked/);
            const p = im.get('root-1');
            expect(p?.alive).toBe(true);
            expect(p?.revoked).toBe(false);
        });

        test('I-2: No resurrection', () => {
            const user = {
                id: 'user-1',
                publicKey: 'key',
                type: 'INDIVIDUAL' as const,
                scopeOf: new CapabilitySet(['METRIC.READ']),
                parents: [],
                createdAt: now
            };
            im.register(user);
            im.revoke('user-1', now);

            expect(() => im.register(user)).toThrow(/No Resurrection allowed/);
        });

        test('I-3: Scope monotonicity on revocation', () => {
            const user = {
                id: 'user-1',
                publicKey: 'key',
                type: 'INDIVIDUAL' as const,
                scopeOf: new CapabilitySet(['METRIC.READ']),
                parents: [],
                createdAt: now
            };
            im.register(user);
            im.revoke('user-1', now);

            const p = im.get('user-1');
            expect(p?.scopeOf.all.length).toBe(0);
        });

        test('I-4: Acyclic provenance', () => {
            im.register({ id: 'p1', publicKey: 'k1', type: 'AGENT', scopeOf: new CapabilitySet(), parents: [], createdAt: now });
            im.register({ id: 'p2', publicKey: 'k2', type: 'AGENT', scopeOf: new CapabilitySet(), parents: ['p1'], createdAt: now });

            expect(() => im.register({ id: 'p1', publicKey: 'k1', type: 'AGENT', scopeOf: new CapabilitySet(), parents: ['p2'], createdAt: now }))
                .toThrow(/Cyclic provenance detected/);
        });
    });

    describe('4 & 5. Authority & Delegation Algebra', () => {
        test('EffectiveScope: Root baseline', () => {
            im.register({
                id: 'root', publicKey: 'key', type: 'INDIVIDUAL',
                scopeOf: new CapabilitySet(['METRIC.READ']), parents: [], createdAt: now, isRoot: true
            });

            const effective = de.getEffectiveScope('root');
            expect(effective.has('METRIC.READ')).toBe(true);
        });

        test('5.1 & 5.2: Grant rule and No scope amplification', () => {
            const keys = generateKeyPair();
            im.register({
                id: 'root', publicKey: keys.publicKey, type: 'INDIVIDUAL',
                scopeOf: new CapabilitySet(['METRIC']), parents: [], createdAt: now, isRoot: true
            });
            im.register({
                id: 'user', publicKey: 'user-key', type: 'INDIVIDUAL',
                scopeOf: new CapabilitySet(['METRIC']), parents: [], createdAt: now
            });

            // Root has 'METRIC', delegates 'METRIC.READ' to User.
            const scope = new CapabilitySet(['METRIC.READ']);
            const data = `root:user:${JSON.stringify(scope.all)}:${now}`;
            const sig = signData(data, keys.privateKey);

            de.grant('root', 'user', scope, now, sig);

            const userEffective = de.getEffectiveScope('user');
            expect(userEffective.has('METRIC.READ')).toBe(true);
            expect(userEffective.has('METRIC.WRITE')).toBe(false);

            // User tries to delegate 'METRIC.WRITE' (which they don't have)
            im.register({ id: 'other', publicKey: 'k', type: 'AGENT', scopeOf: new CapabilitySet(), parents: [], createdAt: now });
            const badScope = new CapabilitySet(['METRIC.WRITE']);
            expect(() => de.grant('user', 'other', badScope, now, 'sig'))
                .toThrow(/Scope Amplification/);
        });

        test('6.2: Revocation propagation (Lazy re-evaluation)', () => {
            const rootKeys = generateKeyPair();
            const userKeys = generateKeyPair();

            im.register({ id: 'root', publicKey: rootKeys.publicKey, type: 'INDIVIDUAL', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: now, isRoot: true });
            im.register({ id: 'mid', publicKey: userKeys.publicKey, type: 'INDIVIDUAL', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: now });
            im.register({ id: 'end', publicKey: 'end-key', type: 'INDIVIDUAL', scopeOf: new CapabilitySet(['*']), parents: [], createdAt: now });

            // root -> mid
            const s1 = new CapabilitySet(['*']);
            de.grant('root', 'mid', s1, now, signData(`root:mid:${JSON.stringify(s1.all)}:${now}`, rootKeys.privateKey));

            // mid -> end
            const s2 = new CapabilitySet(['*']);
            de.grant('mid', 'end', s2, now, signData(`mid:end:${JSON.stringify(s2.all)}:${now}`, userKeys.privateKey));

            expect(de.authorized('end', 'ANY')).toBe(true);

            // Revoke mid
            im.revoke('mid', now);

            // end should lose authority because mid is no longer alive
            expect(de.authorized('end', 'ANY')).toBe(false);
        });
    });
});
