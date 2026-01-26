// src/L0/Crypto.ts
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { blake3 } from '@noble/hashes/blake3';
import { randomBytes } from 'crypto';

// --- Configuration ---
// Enforce Synchronous SHA-512 for Deterministic Execution
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// --- Types ---
export type Ed25519PublicKey = string; // Hex
export type Ed25519PrivateKey = string; // Hex
export type Signature = string; // Hex
export type Hash = string; // Hex

export interface KeyPair {
    publicKey: Ed25519PublicKey;
    privateKey: Ed25519PrivateKey;
}

export interface CryptoError {
    code: 'INVALID_SIGNATURE' | 'INVALID_KEY' | 'HASH_FAILURE';
    message: string;
}

// --- Crypto Engine ---
export class CryptoEngine {

    /**
     * Generate a fresh KeyPair using system entropy.
     */
    static generateKeyPair(): KeyPair {
        const privateKey = ed.utils.randomPrivateKey();
        const publicKey = ed.getPublicKey(privateKey);
        return {
            privateKey: Buffer.from(privateKey).toString('hex'),
            publicKey: Buffer.from(publicKey).toString('hex')
        };
    }

    /**
     * Sign canonical data using Ed25519.
     * @param data - The raw string or buffer to sign
     * @param privateKeyHex - Hex-encoded private key
     */
    static sign(data: string | Uint8Array, privateKeyHex: string): Signature {
        const msg = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
        const sig = ed.sign(msg, privateKeyHex);
        return Buffer.from(sig).toString('hex');
    }

    /**
     * Verify a signature against a public key.
     * @param data - The signed data
     * @param signatureHex - The signature to verify
     * @param publicKeyHex - The signer's public key
     */
    static verify(
        data: string | Uint8Array,
        signatureHex: string,
        publicKeyHex: string
    ): boolean {
        try {
            const msg = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
            return ed.verify(signatureHex, msg, publicKeyHex);
        } catch (e) {
            return false;
        }
    }

    /**
     * Compute a SHA-256 hash (Legacy/Compatibility).
     */
    static hash(data: string | Uint8Array): Hash {
        const bytes = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
        return Buffer.from(sha256(bytes)).toString('hex');
    }

    /**
     * Compute a Blake3 hash (State Merkle Roots).
     * High-performance hashing for large state trees.
     */
    static hashState(data: Uint8Array): Hash {
        return Buffer.from(blake3(data)).toString('hex');
    }

    /**
     * Generate a cryptographic nonce.
     */
    static nonce(bytes = 32): string {
        return randomBytes(bytes).toString('hex');
    }

    /**
     * Deterministic JSON serialization (RFC 8785 compliant-ish).
     * Sorts object keys recursively to ensure Hash(A) === Hash(B) if A == B semantically.
     */
    static canonicalize(data: any): string {
        if (data === undefined) return '';
        if (data === null) return 'null';
        if (typeof data !== 'object') return JSON.stringify(data);
        if (Array.isArray(data)) {
            return '[' + data.map(i => CryptoEngine.canonicalize(i)).join(',') + ']';
        }
        const keys = Object.keys(data).sort();
        return '{' + keys.map(k =>
            JSON.stringify(k) + ':' + CryptoEngine.canonicalize(data[k])
        ).join(',') + '}';
    }
}

// --- Legacy Exports (for backward compatibility during migration) ---
export const generateKeyPair = CryptoEngine.generateKeyPair;
export const signData = CryptoEngine.sign;
export const verifySignature = CryptoEngine.verify;
export const hash = CryptoEngine.hash;
export const hashState = (d: Uint8Array) => CryptoEngine.hashState(d);
export const randomNonce = CryptoEngine.nonce;
export const canonicalize = CryptoEngine.canonicalize;
