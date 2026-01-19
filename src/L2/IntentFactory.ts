
// src/L2/IntentFactory.ts
import type { Intent, MetricPayload } from './State.js';
import { signData, hash } from '../L0/Crypto.js';
import type { Ed25519PrivateKey, Ed25519PublicKey } from '../L0/Crypto.js';

export class IntentFactory {
    static create(
        metricId: string,
        value: any,
        principalId: string,
        privateKey: Ed25519PrivateKey,
        timestamp: string | number = Date.now(),
        expiresAt: string | number = Date.now() + 60000 // 1 min validity
    ): Intent {
        const payload: MetricPayload = { metricId, value };

        // Construct canonical data string for Signing
        const payloadStr = JSON.stringify(payload);

        // Ensure formal format "time:logical"
        const tsStr = typeof timestamp === 'string' && timestamp.includes(':')
            ? timestamp
            : `${timestamp}:0`;

        const expStr = typeof expiresAt === 'string' && expiresAt.includes(':')
            ? expiresAt
            : `${expiresAt}:0`;

        // Intent ID = SHA256(Principal + Payload + TS + Exp)
        const intentId = hash(`${principalId}:${payloadStr}:${tsStr}:${expStr}`);

        // Signature covers the Intent ID as well (provenance binding)
        const signableData = `${intentId}:${principalId}:${payloadStr}:${tsStr}:${expStr}`;
        const signature = signData(signableData, privateKey);

        return {
            intentId,
            principalId,
            payload,
            timestamp: tsStr,
            expiresAt: expStr,
            signature
        };
    }
}
