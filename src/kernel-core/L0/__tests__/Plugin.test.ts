import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import type { PluginManifest, PluginCapability } from '../Plugin.js';
import { PluginManifestValidator } from '../Plugin.js';
import { PluginRegistry } from '../PluginRegistry.js';
import { CryptoEngine, hash } from '../Crypto.js';

describe('M2.2 Plugin Boundaries', () => {
    let validManifest: PluginManifest;
    let authorKeys: { publicKey: string; privateKey: string };

    beforeEach(() => {
        // Generate test keys using CryptoEngine
        const keyPair = CryptoEngine.generateKeyPair();
        authorKeys = {
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey
        };

        // Create valid manifest template
        const manifestWithoutSig = {
            id: 'test-plugin-1',
            name: 'Test Plugin',
            version: '1.0.0',
            author: {
                id: 'author-1',
                publicKey: `ed25519:${authorKeys.publicKey}`
            },
            capabilities: [
                { type: 'protocol', targets: ['test_metric'] }
            ] as PluginCapability[]
        };

        // Sign the manifest
        const canonical = JSON.stringify(sortObject(manifestWithoutSig));
        const manifestHash = hash(canonical);
        const signature = CryptoEngine.sign(manifestHash, authorKeys.privateKey);

        validManifest = {
            ...manifestWithoutSig,
            signature: `ed25519:${signature}`
        };
    });

    describe('PluginManifestValidator', () => {
        test('1.1 Should validate correct manifest structure', () => {
            expect(() => PluginManifestValidator.validateStructure(validManifest)).not.toThrow();
        });

        test('1.2 Should reject manifest without id', () => {
            const invalid = { ...validManifest };
            delete (invalid as any).id;
            expect(() => PluginManifestValidator.validateStructure(invalid)).toThrow('id is required');
        });

        test('1.3 Should reject manifest without capabilities', () => {
            const invalid = { ...validManifest, capabilities: [] };
            expect(() => PluginManifestValidator.validateStructure(invalid)).toThrow('capabilities must be a non-empty array');
        });

        test('1.4 Should reject invalid protocol capability (missing targets)', () => {
            const invalid = {
                ...validManifest,
                capabilities: [{ type: 'protocol' }] as any
            };
            expect(() => PluginManifestValidator.validateStructure(invalid)).toThrow('targets must be a non-empty array');
        });

        test('1.5 Should reject invalid guard capability (invalid phase)', () => {
            const invalid = {
                ...validManifest,
                capabilities: [{ type: 'guard', phase: 'INVALID' }] as any
            };
            expect(() => PluginManifestValidator.validateStructure(invalid)).toThrow('invalid phase');
        });

        test('1.6 Should verify valid signature', () => {
            expect(PluginManifestValidator.verifySignature(validManifest)).toBe(true);
        });

        test('1.7 Should reject invalid signature', () => {
            const invalid = { ...validManifest, signature: 'ed25519:invalidsignature' };
            expect(PluginManifestValidator.verifySignature(invalid)).toBe(false);
        });

        test('1.8 Should reject tampered manifest', async () => {
            const tampered = { ...validManifest, version: '2.0.0' }; // Changed version but kept old signature
            expect(PluginManifestValidator.verifySignature(tampered)).toBe(false);
        });
    });

    describe('PluginRegistry Lifecycle', () => {
        let registry: PluginRegistry;

        beforeEach(() => {
            registry = new PluginRegistry();
        });

        test('2.1 Should register plugin in PROPOSED state', () => {
            registry.register(validManifest, undefined, '100:0');
            const plugin = registry.get('test-plugin-1');

            expect(plugin).toBeDefined();
            expect(plugin!.lifecycle).toBe('PROPOSED');
            expect(plugin!.registeredAt).toBe('100:0');
        });

        test('2.2 Should reject duplicate plugin ID', () => {
            registry.register(validManifest);
            expect(() => registry.register(validManifest)).toThrow('already registered');
        });

        test('2.3 Should verify plugin (PROPOSED → VERIFIED)', () => {
            registry.register(validManifest);
            registry.verify('test-plugin-1');

            const plugin = registry.get('test-plugin-1');
            expect(plugin!.lifecycle).toBe('VERIFIED');
        });

        test('2.4 Should ratify plugin (VERIFIED → RATIFIED)', () => {
            registry.register(validManifest);
            registry.verify('test-plugin-1');
            registry.ratify('test-plugin-1', 'mock-gov-signature');

            const plugin = registry.get('test-plugin-1');
            expect(plugin!.lifecycle).toBe('RATIFIED');
        });

        test('2.5 Should activate plugin (RATIFIED → ACTIVE)', () => {
            registry.register(validManifest);
            registry.verify('test-plugin-1');
            registry.ratify('test-plugin-1', 'mock-gov-signature');
            registry.activate('test-plugin-1', '200:0');

            const plugin = registry.get('test-plugin-1');
            expect(plugin!.lifecycle).toBe('ACTIVE');
            expect(plugin!.activatedAt).toBe('200:0');
        });

        test('2.6 Should deprecate plugin (ACTIVE → DEPRECATED)', () => {
            registry.register(validManifest);
            registry.verify('test-plugin-1');
            registry.ratify('test-plugin-1', 'mock-gov-signature');
            registry.activate('test-plugin-1');
            registry.deprecate('test-plugin-1');

            const plugin = registry.get('test-plugin-1');
            expect(plugin!.lifecycle).toBe('DEPRECATED');
        });

        test('2.7 Should revoke plugin from any state', () => {
            registry.register(validManifest);
            registry.revoke('test-plugin-1', 'Security violation', '300:0');

            const plugin = registry.get('test-plugin-1');
            expect(plugin!.lifecycle).toBe('REVOKED');
            expect(plugin!.revocationReason).toBe('Security violation');
            expect(plugin!.revokedAt).toBe('300:0');
        });

        test('2.8 Should reject invalid lifecycle transitions', () => {
            registry.register(validManifest);

            // Cannot activate before ratify
            expect(() => registry.activate('test-plugin-1')).toThrow('Cannot activate plugin in state PROPOSED');

            // Cannot ratify before verify
            expect(() => registry.ratify('test-plugin-1', 'sig')).toThrow('Cannot ratify plugin in state PROPOSED');
        });
    });

    describe('Conflict Detection', () => {
        let registry: PluginRegistry;
        let plugin2Manifest: PluginManifest;

        beforeEach(() => {
            registry = new PluginRegistry();

            // Create second plugin manifest
            const manifestWithoutSig = {
                id: 'test-plugin-2',
                name: 'Test Plugin 2',
                version: '1.0.0',
                author: {
                    id: 'author-1',
                    publicKey: `ed25519:${authorKeys.publicKey}`
                },
                capabilities: [
                    { type: 'protocol', targets: ['test_metric'] } // Same target as plugin 1
                ] as PluginCapability[]
            };

            const canonical = JSON.stringify(sortObject(manifestWithoutSig));
            const manifestHash = hash(canonical);
            const signature = CryptoEngine.sign(manifestHash, authorKeys.privateKey);

            plugin2Manifest = {
                ...manifestWithoutSig,
                signature: `ed25519:${signature}`
            };
        });

        test('3.1 Should detect protocol conflicts', () => {
            // Register and activate first plugin
            registry.register(validManifest);
            registry.verify('test-plugin-1');
            registry.ratify('test-plugin-1', 'sig');
            registry.activate('test-plugin-1');

            // Attempt to register conflicting plugin
            registry.register(plugin2Manifest);

            // Should fail verification due to conflict
            expect(() => registry.verify('test-plugin-2')).toThrow('Protocol conflict');
        });

        test('3.2 Should allow non-conflicting protocols', () => {
            // Create plugin with different target
            const nonConflictingManifest = {
                id: 'test-plugin-3',
                name: 'Test Plugin 3',
                version: '1.0.0',
                author: {
                    id: 'author-1',
                    publicKey: `ed25519:${authorKeys.publicKey}`
                },
                capabilities: [
                    { type: 'protocol', targets: ['different_metric'] }
                ] as PluginCapability[]
            };

            const canonical = JSON.stringify(sortObject(nonConflictingManifest));
            const manifestHash = hash(canonical);
            const signature = CryptoEngine.sign(manifestHash, authorKeys.privateKey);
            const manifest = { ...nonConflictingManifest, signature: `ed25519:${signature}` };

            // Register and activate first plugin
            registry.register(validManifest);
            registry.verify('test-plugin-1');
            registry.ratify('test-plugin-1', 'sig');
            registry.activate('test-plugin-1');

            // Register non-conflicting plugin
            registry.register(manifest);

            // Should succeed
            expect(() => registry.verify('test-plugin-3')).not.toThrow();
        });

        test('3.3 Should allow multiple guards on same phase', () => {
            // Create two guard plugins for same phase
            const guard1 = createGuardManifest('guard-1', 'SIGNATURE', authorKeys);
            const guard2 = createGuardManifest('guard-2', 'SIGNATURE', authorKeys);

            registry.register(guard1);
            registry.verify('guard-1');
            registry.ratify('guard-1', 'sig');
            registry.activate('guard-1');

            registry.register(guard2);

            // Should not conflict
            expect(() => registry.verify('guard-2')).not.toThrow();
        });
    });

    describe('Dependency Management', () => {
        let registry: PluginRegistry;

        beforeEach(() => {
            registry = new PluginRegistry();
        });

        test('4.1 Should reject plugin with missing dependency', () => {
            const dependentManifest = createManifestWithDependencies(
                'dependent-1',
                ['missing-plugin'],
                authorKeys
            );

            expect(() => registry.register(dependentManifest)).toThrow('Missing dependency missing-plugin');
        });

        test('4.2 Should accept plugin with active dependency', () => {
            // Register and activate dependency
            registry.register(validManifest);
            registry.verify('test-plugin-1');
            registry.ratify('test-plugin-1', 'sig');
            registry.activate('test-plugin-1');

            // Register dependent plugin
            const dependentManifest = createManifestWithDependencies(
                'dependent-1',
                ['test-plugin-1'],
                authorKeys
            );

            expect(() => registry.register(dependentManifest)).not.toThrow();
        });
    });

    describe('Query Methods', () => {
        let registry: PluginRegistry;

        beforeEach(() => {
            registry = new PluginRegistry();

            // Register multiple plugins
            registry.register(validManifest);
            registry.verify('test-plugin-1');
            registry.ratify('test-plugin-1', 'sig');
            registry.activate('test-plugin-1');

            const guardManifest = createGuardManifest('guard-1', 'SIGNATURE', authorKeys);
            registry.register(guardManifest);
            registry.verify('guard-1');
            registry.ratify('guard-1', 'sig');
            registry.activate('guard-1');
        });

        test('5.1 Should get active plugins by capability type', () => {
            const protocols = registry.getActive('protocol');
            const guards = registry.getActive('guard');

            expect(protocols.length).toBe(1);
            expect(protocols[0]!.manifest.id).toBe('test-plugin-1');

            expect(guards.length).toBe(1);
            expect(guards[0]!.manifest.id).toBe('guard-1');
        });

        test('5.2 Should check plugin capabilities', () => {
            expect(registry.hasCapability('test-plugin-1', { type: 'protocol', targets: ['test_metric'] })).toBe(true);
            expect(registry.hasCapability('test-plugin-1', { type: 'protocol', targets: ['other_metric'] })).toBe(false);
            expect(registry.hasCapability('guard-1', { type: 'guard', phase: 'SIGNATURE' })).toBe(true);
        });
    });
});

// Helper functions
function sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => sortObject(item));

    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = sortObject(obj[key]);
    });
    return sorted;
}

function createGuardManifest(id: string, phase: string, keys: { publicKey: string; privateKey: string }): PluginManifest {
    const manifestWithoutSig = {
        id,
        name: `Guard ${id}`,
        version: '1.0.0',
        author: {
            id: 'author-1',
            publicKey: `ed25519:${keys.publicKey}`
        },
        capabilities: [
            { type: 'guard', phase }
        ] as PluginCapability[]
    };

    const canonical = JSON.stringify(sortObject(manifestWithoutSig));
    const manifestHash = hash(canonical);
    const signature = CryptoEngine.sign(manifestHash, keys.privateKey);

    return {
        ...manifestWithoutSig,
        signature: `ed25519:${signature}`
    };
}

function createManifestWithDependencies(
    id: string,
    dependencies: string[],
    keys: { publicKey: string; privateKey: string }
): PluginManifest {
    const manifestWithoutSig = {
        id,
        name: `Plugin ${id}`,
        version: '1.0.0',
        author: {
            id: 'author-1',
            publicKey: `ed25519:${keys.publicKey}`
        },
        capabilities: [
            { type: 'protocol', targets: ['dependent_metric'] }
        ] as PluginCapability[],
        dependencies
    };

    const canonical = JSON.stringify(sortObject(manifestWithoutSig));
    const manifestHash = hash(canonical);
    const signature = CryptoEngine.sign(manifestHash, keys.privateKey);

    return {
        ...manifestWithoutSig,
        signature: `ed25519:${signature}`
    };
}
