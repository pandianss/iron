
import { describe, test, expect, beforeEach } from '@jest/globals';
import { AuditLog } from '../Audit.js';

describe('Audit Log (IV. Truth & History)', () => {
    let audit: AuditLog;
    const mockIntent: any = { intentId: '1', principalId: 'u1', payload: {}, timestamp: '0:0' };

    beforeEach(() => {
        audit = new AuditLog();
    });

    test('IV.3 Historical Legitimacy: Verify Valid Chain', () => {
        audit.append({ ...mockIntent, intentId: '1' });
        audit.append({ ...mockIntent, intentId: '2' });
        expect(audit.verifyChain()).toBe(true);
    });

    test('IV.3 Historical Legitimacy: Detect Tampering (Hash)', () => {
        audit.append({ ...mockIntent, intentId: '1' });
        const entry = audit.append({ ...mockIntent, intentId: '2' });

        // Tamper with history
        (entry as any).status = 'FAILURE';

        expect(audit.verifyChain()).toBe(false);
    });

    test('IV.3 Historical Legitimacy: Detect Tampering (Linkage)', () => {
        audit.append(mockIntent);
        const e2 = audit.append(mockIntent);

        // Break link
        e2.previousHash = 'bad_hash';

        expect(audit.verifyChain()).toBe(false);
    });

    test('IV.2 Temporal Law: Monotonicity Enforcement', () => {
        // We need to mock Date.now() to test this effectively
        const realNow = Date.now;

        try {
            let time = 1000;
            global.Date.now = () => time;

            audit.append(mockIntent); // t=1000

            time = 2000;
            audit.append(mockIntent); // t=2000 (OK)

            time = 1500;
            // t=1500 < 2000 -> Should Fail
            expect(() => {
                audit.append(mockIntent);
            }).toThrow(/Time moved backwards/);

        } finally {
            global.Date.now = realNow;
        }
    });

    test('IV.2 Temporal Law: Monotonicity Verification', () => {
        const realNow = Date.now;
        try {
            let time = 1000;
            global.Date.now = () => time;

            audit.append(mockIntent); // t=1000
            const e2 = audit.append(mockIntent); // t=1000 (equal is fine)

            // Manually corrupt timestamp to be in the past relative to prev
            (e2 as any).timestamp = 500;

            expect(audit.verifyChain()).toBe(false);

        } finally {
            global.Date.now = realNow;
        }
    });
});
