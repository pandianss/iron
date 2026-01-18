
// src/L2/IntentFactory.ts
import { Intent, MetricPayload } from './State';
import { signData, hash, Ed25519PrivateKey, Ed25519PublicKey } from '../L0/Crypto';

export class IntentFactory {
    static create(
        metricId: string,
        value: any,
        principalId: string,
        privateKey: Ed25519PrivateKey,
        timestamp: number = Date.now(),
        expiresAt: number = Date.now() + 60000 // 1 min validity
    ): Intent {
        const payload: MetricPayload = { metricId, value };

        // Construct canonical data string for Signing
        // "principalId:JSON(payload):timestamp:expiresAt"
        // Note: IntentId is usually the hash of this data.

        // Let's define the data to sign strictly.
        const payloadStr = JSON.stringify(payload);
        const tsStr = timestamp.toString();
        const expStr = expiresAt.toString();

        // Intent ID = SHA256(Principal + Payload + TS + Exp)
        const intentId = hash(`${principalId}:${payloadStr}:${tsStr}:${expStr}`);

        // SIgnature covers the Intent ID as well (provenance binding)
        // Data to Sign: "intentId:principalId:payload:ts:exp"
        // This MUST match verification logic in L2/State.ts
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
