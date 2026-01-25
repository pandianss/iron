import { describe, test, expect } from '@jest/globals';
import * as Invariants from '../L0/Invariants.js';
import { InvariantGuard } from '../L0/Guards.js';
import { IdentityManager } from '../L1/Identity.js';
import type { Entity } from '../L1/Identity.js';
// Action is now defined in Invariants or we use local partial
type Action = Invariants.Action;

describe('Kernel Invariants (Phase 2)', () => {
    // Mock Context
    const mockManager = {
        get: (id: string) => {
            if (id === 'valid-user') return {
                id: 'valid-user',
                type: 'ACTOR',
                status: 'ACTIVE',
                publicKey: '123',
                createdAt: '0',
                identityProof: 'proof'
            } as Entity;
            if (id === 'revoked-user') return {
                id: 'revoked-user',
                type: 'ACTOR',
                status: 'REVOKED',
                publicKey: '123',
                createdAt: '0',
                identityProof: 'proof'
            } as Entity;
            return undefined;
        }
    } as unknown as IdentityManager;

    const baseAction: Action = {
        actionId: '00'.repeat(32), // 64 chars
        initiator: 'valid-user',
        payload: { metricId: 'test', value: 10 },
        timestamp: String(Date.now()),
        expiresAt: String(Date.now() + 10000),
        signature: '00'.repeat(64) // 128 chars
    };

    test('INV_ID_01: Signature Length', () => {
        expect(Invariants.INV_ID_01({ action: baseAction, manager: mockManager }).success).toBe(true);
        expect(Invariants.INV_ID_01({
            action: { ...baseAction, signature: 'short' },
            manager: mockManager
        }).success).toBe(false);
    });

    test('INV_ID_02: Entity Existence', () => {
        expect(Invariants.INV_ID_02({ action: baseAction, manager: mockManager }).success).toBe(true);
        expect(Invariants.INV_ID_02({
            action: { ...baseAction, initiator: 'unknown-ghost' },
            manager: mockManager
        }).success).toBe(false);
    });

    test('INV_RES_01: Metric NaN Check', () => {
        expect(Invariants.INV_RES_01({
            action: { ...baseAction, payload: { metricId: 'A', value: NaN } },
            manager: mockManager
        }).success).toBe(false);

        expect(Invariants.INV_RES_01({
            action: { ...baseAction, payload: { metricId: 'A', value: Infinity } },
            manager: mockManager
        }).success).toBe(false);
    });

    test('INV_RES_02: Future Timestamp', () => {
        expect(Invariants.INV_RES_02({
            action: { ...baseAction, timestamp: String(Date.now() + 100000) }, // Way in future
            manager: mockManager
        }).success).toBe(false);
    });

    test('InvariantGuard Aggregation', () => {
        const result = InvariantGuard({ action: baseAction, manager: mockManager });
        if (!result.ok) console.log("Guard Failed:", result.violation);
        expect(result.ok).toBe(true);

        const badResult = InvariantGuard({
            action: { ...baseAction, signature: 'bad' },
            manager: mockManager
        });
        expect(badResult.ok).toBe(false);
        if (!badResult.ok) {
            expect(badResult.violation).toContain('INV_ID_01');
        }
    });

});
