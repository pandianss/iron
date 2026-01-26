
import { describe, it, expect } from '@jest/globals';
import { AuditLog } from '../L5/Audit.js';
import { hash, canonicalize } from '../L0/Crypto.js';
import type { Action } from '../L2/State.js';

describe('Audit Log Hardening (Phase 4)', () => {

    it('AUDIT-001: Deterministic Hashing (Canonicalization)', () => {
        const log = new AuditLog();
        const action: Action = {
            actionId: 'test', initiator: 'user', payload: { metricId: 'a', value: 1 },
            timestamp: '0', expiresAt: '0', signature: 'sig'
        };

        // Two metadata objects with same content, different order
        const meta1 = { a: 1, b: 2, c: { x: 9, y: 8 } };
        const meta2 = { b: 2, c: { y: 8, x: 9 }, a: 1 }; // shuffled keys

        const s1 = canonicalize(meta1);
        const s2 = canonicalize(meta2);
        expect(s1).toBe(s2);
        expect(hash(s1)).toBe(hash(s2));
    });

    it('AUDIT-002: Chain Integrity', () => {
        const log = new AuditLog();
        const actionBase: Action = {
            actionId: 'test', initiator: 'user', payload: { metricId: 'a', value: 1 },
            timestamp: '0', expiresAt: '0', signature: 'sig'
        };

        for (let i = 0; i < 10; i++) {
            // monotonic time delay
            const start = Date.now();
            while (Date.now() === start) { };

            log.append({ ...actionBase, actionId: `act-${i}` });
        }

        expect(log.verifyChain()).toBe(true);

        // Tamper test
        const history = log.getHistory();
        expect(Object.isFrozen(history[5])).toBe(true);

        // Try to tamper - MUST THROW in strict mode (or just fail if in lax mode, but we expect throw)
        expect(() => {
            (history[5] as any).status = 'FAILURE';
        }).toThrow();
    });
});
