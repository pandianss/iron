
// src/L0/Crypto.ts
import { createHash, generateKeyPairSync, sign, verify, randomBytes } from 'crypto';

// 1.1 Hash Function (SHA-256)
export function hash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
}

// 1.2 Digital Signatures (Ed25519)
export type Ed25519PublicKey = string; // Hex encoded
export type Ed25519PrivateKey = string; // Hex encoded (for testing/chaos)
export type Signature = string; // Hex encoded

export interface KeyPair {
    publicKey: Ed25519PublicKey;
    privateKey: Ed25519PrivateKey;
}

export function generateKeyPair(): KeyPair {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return {
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(), // Store as PEM for Node compat or Raw Hex?
        // Node's crypto.sign/verify handles KeyObjects or PEM strings well. 
        // Spec says "valid Ed25519PublicKey". Usually strict 32-byte hex.
        // Node's internal representation is opaque unless exported.
        // For simplicity and interop, let's keep PEM string internally for Node, 
        // but if the spec implies raw bytes, we might need conversion.
        // Let's stick to PEM strings for this implementation as it's standard Node.
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    };
}

// Helper to get raw hex if needed? 
// For now, "Ed25519PublicKey" alias = string (PEM).

export function signData(data: string, privateKeyPem: string): Signature {
    return sign(null, Buffer.from(data), privateKeyPem).toString('hex');
}

export function verifySignature(data: string, signature: Signature, publicKeyPem: string): boolean {
    try {
        return verify(null, Buffer.from(data), publicKeyPem, Buffer.from(signature, 'hex'));
    } catch (e) {
        return false;
    }
}

// 1.3 Randomness
export function randomNonce(bytes: number = 32): string {
    return randomBytes(bytes).toString('hex');
}
