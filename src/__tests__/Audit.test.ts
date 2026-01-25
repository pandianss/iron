import { describe, test, expect } from '@jest/globals';
import { AuditLog } from '../L5/Audit.js';
import type { Evidence } from '../L5/Audit.js';

// Local definition to avoid ESM export issues with interfaces
interface Action {
    actionId: string;
    initiator: string;
    payload: { metricId: string; value: any;[key: string]: any };
    timestamp: string;
    expiresAt: string;
    signature: string;
}

// Mock Action
const mockAction: Action = {
    actionId: '00'.repeat(32),
    initiator: 'test',
    payload: { metricId: 'test', value: 1 },
    timestamp: '0',
    expiresAt: '0',
    signature: 'sig'
};

describe('Audit Log Integrity (Phase 4)', () => {
    test('AUDIT_01: Chain Verification', () => {
        const log = new AuditLog();
        log.append(mockAction, 'SUCCESS');
        log.append(mockAction, 'FAILURE');
        log.append(mockAction, 'SUCCESS');

        expect(log.verifyChain()).toBe(true);
    });

    test('AUDIT_02: Tamper Detection (Chain Break)', () => {
        const log = new AuditLog();
        log.append(mockAction, 'SUCCESS');
        const middle = log.append(mockAction, 'SUCCESS'); // Index 1
        log.append(mockAction, 'SUCCESS');

        expect(log.verifyChain()).toBe(true);

        // Manually tamper with internal chain
        // We need to cast to any to access private chain or bypass freeze if not deep frozen (Action is ref)
        // Note: The Evidence object itself is frozen, but `this.chain` array might be mutable via `any`.
        const chain = (log as any).chain as Evidence[];

        // Try to mutate the status of the middle entry
        // Since we froze it, strictly this should throw in strict mode or fail silently.
        try {
            (chain[1] as any).status = 'FAILURE';
        } catch (e) {
            // If it throws TypeError (ReadOnly), that's good! Immutability working.
        }

        // If we force it (e.g. by replacing the object entirely in the array)
        const forgedEntry = { ...chain[1], status: 'FAILURE' };
        chain[1] = forgedEntry as Evidence;

        // Now verification should fail because next entry's prevHash won't match hash(forgedEntry)
        expect(log.verifyChain()).toBe(false);
    });

    test('AUDIT_03: Runtime Immutability', () => {
        const log = new AuditLog();
        const entry = log.append(mockAction, 'SUCCESS');

        expect(Object.isFrozen(entry)).toBe(true);

        // Try to mutate
        expect(() => {
            (entry as any).status = 'FAILURE';
        }).toThrow();
        // Note: 'toThrow' works in strict mode. In non-strict it might just not change.
        // Jest runs in strict mode Usually.
    });
});
