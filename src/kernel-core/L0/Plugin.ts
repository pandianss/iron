// src/kernel-core/L0/Plugin.ts
import { hash, verifySignature } from './Crypto.js';
import type { EntityID } from './Ontology.js';

/**
 * Plugin Capability Types
 * Declares what a plugin is allowed to access
 */
export type PluginCapability =
    | { type: 'protocol'; targets: string[] }  // Which metrics it can mutate
    | { type: 'guard'; phase: GuardType }      // Which guard phase it hooks
    | { type: 'projection'; events: string[] }; // Which events it consumes

export type GuardType = 'INVARIANT' | 'SIGNATURE' | 'SCOPE' | 'TIME' | 'REPLAY' | 'BUDGET';

/**
 * Plugin Lifecycle States
 */
export type PluginLifecycle =
    | 'PROPOSED'    // Submitted, manifest validated
    | 'VERIFIED'    // Signature checked, capabilities reviewed
    | 'RATIFIED'    // Governance approved
    | 'ACTIVE'      // Currently executing
    | 'DEPRECATED'  // Marked for removal, still functional
    | 'REVOKED';    // Disabled, cannot be reactivated

/**
 * Plugin Manifest
 * Formal declaration of plugin identity, capabilities, and authorship
 */
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    description?: string;
    author: {
        id: EntityID;
        publicKey: string;
    };
    capabilities: PluginCapability[];
    dependencies?: string[]; // IDs of required plugins
    signature: string;       // Signature over canonical manifest (excluding signature field)
}

/**
 * Plugin Container
 * Combines manifest with lifecycle state and execution code
 */
export interface Plugin {
    manifest: PluginManifest;
    lifecycle: PluginLifecycle;
    code?: any; // The actual plugin implementation (guard function, protocol definition, etc.)
    registeredAt: string; // Timestamp
    activatedAt?: string;
    revokedAt?: string;
    revocationReason?: string;
}

/**
 * Plugin Manifest Validator
 * Validates manifest structure and cryptographic integrity
 */
export class PluginManifestValidator {
    /**
     * Validate manifest structure
     */
    static validateStructure(manifest: PluginManifest): void {
        if (!manifest.id || typeof manifest.id !== 'string') {
            throw new Error('PluginManifest: id is required and must be a string');
        }
        if (!manifest.name || typeof manifest.name !== 'string') {
            throw new Error('PluginManifest: name is required and must be a string');
        }
        if (!manifest.version || typeof manifest.version !== 'string') {
            throw new Error('PluginManifest: version is required and must be a string');
        }
        if (!manifest.author || !manifest.author.id || !manifest.author.publicKey) {
            throw new Error('PluginManifest: author with id and publicKey is required');
        }
        if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
            throw new Error('PluginManifest: capabilities must be a non-empty array');
        }
        if (!manifest.signature || typeof manifest.signature !== 'string') {
            throw new Error('PluginManifest: signature is required and must be a string');
        }

        // Validate each capability
        for (const cap of manifest.capabilities) {
            this.validateCapability(cap);
        }
    }

    /**
     * Validate individual capability
     */
    private static validateCapability(cap: PluginCapability): void {
        if (!cap.type) {
            throw new Error('PluginCapability: type is required');
        }

        switch (cap.type) {
            case 'protocol':
                if (!Array.isArray(cap.targets) || cap.targets.length === 0) {
                    throw new Error('PluginCapability(protocol): targets must be a non-empty array');
                }
                break;
            case 'guard':
                if (!cap.phase) {
                    throw new Error('PluginCapability(guard): phase is required');
                }
                const validPhases: GuardType[] = ['INVARIANT', 'SIGNATURE', 'SCOPE', 'TIME', 'REPLAY', 'BUDGET'];
                if (!validPhases.includes(cap.phase)) {
                    throw new Error(`PluginCapability(guard): invalid phase ${cap.phase}`);
                }
                break;
            case 'projection':
                if (!Array.isArray(cap.events) || cap.events.length === 0) {
                    throw new Error('PluginCapability(projection): events must be a non-empty array');
                }
                break;
            default:
                throw new Error(`PluginCapability: unknown type ${(cap as any).type}`);
        }
    }

    /**
     * Verify cryptographic signature
     * Signature is over the canonical JSON of the manifest (excluding signature field)
     */
    static verifySignature(manifest: PluginManifest): boolean {
        // Create canonical representation (sorted keys, no signature field)
        const canonical = this.canonicalize(manifest);
        const manifestHash = hash(canonical);

        // Extract signature and public key
        let sig = manifest.signature;
        let pubKey = manifest.author.publicKey;

        // Handle ed25519: prefix if present
        if (sig.startsWith('ed25519:')) sig = sig.split(':')[1]!;
        if (pubKey.startsWith('ed25519:')) pubKey = pubKey.split(':')[1]!;

        return verifySignature(manifestHash, sig, pubKey);
    }

    /**
     * Create canonical JSON representation (sorted keys, no signature)
     */
    private static canonicalize(manifest: PluginManifest): string {
        const copy = { ...manifest };
        delete (copy as any).signature;

        // Sort object keys recursively
        const sorted = this.sortObject(copy);
        return JSON.stringify(sorted);
    }

    /**
     * Recursively sort object keys
     */
    private static sortObject(obj: any): any {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => this.sortObject(item));

        const sorted: any = {};
        Object.keys(obj).sort().forEach(key => {
            sorted[key] = this.sortObject(obj[key]);
        });
        return sorted;
    }

    /**
     * Full validation: structure + signature
     */
    static validate(manifest: PluginManifest): void {
        this.validateStructure(manifest);

        if (!this.verifySignature(manifest)) {
            throw new Error('PluginManifest: Invalid signature');
        }
    }
}
