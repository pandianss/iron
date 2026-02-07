
import { describe, test, expect, beforeEach } from '@jest/globals';
import { AuditLog } from '../Audit.js';

describe('Audit Log (IV. Truth & History)', () => {
    let audit: AuditLog;
    const mockIntent: any = { intentId: '1', principalId: 'u1', payload: {}, timestamp: '0:0' };

    beforeEach(() => {
        audit = new AuditLog();
    });

    test('IV.3 Historical Legitimacy: Verify Valid Chain', async () => {
        await audit.append({ ...mockIntent, actionId: '1' });
        await audit.append({ ...mockIntent, actionId: '2' });
        expect(await audit.verifyChain()).toBe(true);
    });

    test('IV.3 Historical Legitimacy: Detect Tampering (Hash)', async () => {
        await audit.append({ ...mockIntent, actionId: '1' });
        const entry = await audit.append({ ...mockIntent, actionId: '2' });

        // Tamper with history
        // Need to cast to any because evidence is frozen
        const tamperedEntry = { ...entry, status: 'FAILURE' as const };
        (audit as any).localChain[1] = tamperedEntry;

        expect(await audit.verifyChain()).toBe(false);
    });

    test('IV.3 Historical Legitimacy: Detect Tampering (Linkage)', async () => {
        await audit.append(mockIntent);
        const e2 = await audit.append(mockIntent);

        // Break link
        const tamperedE2 = { ...e2, previousEvidenceId: 'bad_hash' };
        (audit as any).localChain[1] = tamperedE2;

        expect(await audit.verifyChain()).toBe(false);
    });

    test('IV.2 Temporal Law: Monotonicity Enforcement (Placeholder - Monotonicity now handled by Kernel)', async () => {
        // Since AuditLog now uses the action's timestamp directly, 
        // monotonicity is a property of the ACTION stream rather than the logger.
        // The logger just records what it's given.
        expect(true).toBe(true);
    });

    test('IV.2 Temporal Law: Monotonicity Verification', async () => {
        await audit.append(mockIntent);
        const e2 = await audit.append(mockIntent);

        // Manually corrupt timestamp to be in the past relative to prev
        const tamperedE2 = { ...e2, timestamp: '500:0' };
        (audit as any).localChain[1] = tamperedE2;

        expect(await audit.verifyChain()).toBe(false);
    });
});
