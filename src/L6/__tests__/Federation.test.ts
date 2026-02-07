import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { FederationBridge, AttestationAPI } from '../Federation.js';
import { generateKeyPair, hash, signData } from '../../kernel-core/L0/Crypto.js';

describe('Federation (VII. Foreign Kernel Law)', () => {
    // Mock Kernel
    const mockKernel: any = {
        submitAttempt: jest.fn(async () => 'aid1'),
        guardAttempt: jest.fn(async () => ({ status: 'ACCEPTED' })),
        commitAttempt: jest.fn(async () => ({ status: 'COMMITTED', attemptId: 'aid1' }))
    };

    const bridgeKeys = generateKeyPair();
    const foreignKeys = generateKeyPair();

    let bridge: FederationBridge;

    beforeEach(() => {
        bridge = new FederationBridge(mockKernel as any, { id: 'bridge_user', key: bridgeKeys });
        bridge.registerPartner('kernel_b', foreignKeys.publicKey);
        jest.clearAllMocks();
    });

    test('VII.1 Foreign Kernel Law: Ingest Valid Attestation', async () => {
        // Create valid foreign attestation
        const payload = {
            metricId: 'foo',
            value: 10,
            timestamp: '0:0',
            ledgerHash: 'hash1',
            subjectId: 'u1'
        };
        const sig = signData(JSON.stringify(payload), foreignKeys.privateKey);

        const success = await bridge.ingestAttestation({
            payload,
            sourceKernel: 'kernel_b',
            signature: sig
        });

        expect(success).toBe(true);
        expect(mockKernel.submitAttempt).toHaveBeenCalled();
        expect(mockKernel.commitAttempt).toHaveBeenCalled();
    });

    test('VII.1 Foreign Kernel Law: Reject Unknown Source', async () => {
        const payload = { metricId: 'foo', value: 10, timestamp: '0:0', ledgerHash: 'h', subjectId: 'u1' };
        const sig = signData(JSON.stringify(payload), foreignKeys.privateKey);

        const success = await bridge.ingestAttestation({
            payload,
            sourceKernel: 'kernel_unknown',
            signature: sig
        });

        expect(success).toBe(false);
    });

    test('VII.1 Foreign Kernel Law: Reject Invalid Signature', async () => {
        const payload = { metricId: 'foo', value: 10, timestamp: '0:0', ledgerHash: 'h', subjectId: 'u1' };
        const sig = 'bad_sig';

        const success = await bridge.ingestAttestation({
            payload,
            sourceKernel: 'kernel_b',
            signature: sig
        });

        expect(success).toBe(false);
    });
});
