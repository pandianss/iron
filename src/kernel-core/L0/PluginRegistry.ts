// src/kernel-core/L0/PluginRegistry.ts
import type { Plugin, PluginManifest, PluginLifecycle, PluginCapability } from './Plugin.js';
import { PluginManifestValidator } from './Plugin.js';
import { verifySignature } from './Crypto.js';

/**
 * Plugin Registry
 * Manages plugin lifecycle and enforces capability-based security
 */
export class PluginRegistry {
    private plugins: Map<string, Plugin> = new Map();
    private governancePublicKey: string | undefined;

    constructor(governancePublicKey?: string) {
        this.governancePublicKey = governancePublicKey;
    }

    /**
     * Register a new plugin (PROPOSED state)
     */
    register(manifest: PluginManifest, code?: any, timestamp: string = new Date().toISOString()): void {
        // Validate manifest structure and signature
        PluginManifestValidator.validate(manifest);

        // Check for duplicate ID
        if (this.plugins.has(manifest.id)) {
            throw new Error(`PluginRegistry: Plugin ${manifest.id} already registered`);
        }

        // Check dependencies
        if (manifest.dependencies) {
            for (const depId of manifest.dependencies) {
                const dep = this.plugins.get(depId);
                if (!dep) {
                    throw new Error(`PluginRegistry: Missing dependency ${depId}`);
                }
                if (dep.lifecycle !== 'ACTIVE' && dep.lifecycle !== 'DEPRECATED') {
                    throw new Error(`PluginRegistry: Dependency ${depId} is not ACTIVE (current: ${dep.lifecycle})`);
                }
            }
        }

        // Create plugin in PROPOSED state
        const plugin: Plugin = {
            manifest,
            lifecycle: 'PROPOSED',
            code,
            registeredAt: timestamp
        };

        this.plugins.set(manifest.id, plugin);
    }

    /**
     * Verify plugin (PROPOSED → VERIFIED)
     * Checks signature and capability conflicts
     */
    verify(id: string): void {
        const plugin = this.plugins.get(id);
        if (!plugin) {
            throw new Error(`PluginRegistry: Plugin ${id} not found`);
        }
        if (plugin.lifecycle !== 'PROPOSED') {
            throw new Error(`PluginRegistry: Cannot verify plugin in state ${plugin.lifecycle}`);
        }

        // Re-verify signature (redundant but defensive)
        if (!PluginManifestValidator.verifySignature(plugin.manifest)) {
            throw new Error(`PluginRegistry: Invalid signature for plugin ${id}`);
        }

        // Check for capability conflicts
        this.checkConflicts(plugin);

        // Transition to VERIFIED
        plugin.lifecycle = 'VERIFIED';
    }

    /**
     * Ratify plugin (VERIFIED → RATIFIED)
     * Requires governance signature
     */
    ratify(id: string, governanceSignature: string): void {
        const plugin = this.plugins.get(id);
        if (!plugin) {
            throw new Error(`PluginRegistry: Plugin ${id} not found`);
        }
        if (plugin.lifecycle !== 'VERIFIED') {
            throw new Error(`PluginRegistry: Cannot ratify plugin in state ${plugin.lifecycle}`);
        }

        // Verify governance signature if governance key is configured
        if (this.governancePublicKey) {
            let sig = governanceSignature;
            let pubKey = this.governancePublicKey;

            if (sig.startsWith('ed25519:')) sig = sig.split(':')[1]!;
            if (pubKey.startsWith('ed25519:')) pubKey = pubKey.split(':')[1]!;

            if (!verifySignature(id, sig, pubKey)) {
                throw new Error(`PluginRegistry: Invalid governance signature for plugin ${id}`);
            }
        }

        // Transition to RATIFIED
        plugin.lifecycle = 'RATIFIED';
    }

    /**
     * Activate plugin (RATIFIED → ACTIVE)
     */
    activate(id: string, timestamp: string = new Date().toISOString()): void {
        const plugin = this.plugins.get(id);
        if (!plugin) {
            throw new Error(`PluginRegistry: Plugin ${id} not found`);
        }
        if (plugin.lifecycle === 'ACTIVE') {
            return; // Already active
        }
        if (plugin.lifecycle !== 'RATIFIED') {
            throw new Error(`PluginRegistry: Cannot activate plugin in state ${plugin.lifecycle}`);
        }

        // Transition to ACTIVE
        plugin.lifecycle = 'ACTIVE';
        plugin.activatedAt = timestamp;
    }

    /**
     * Deprecate plugin (ACTIVE → DEPRECATED)
     */
    deprecate(id: string): void {
        const plugin = this.plugins.get(id);
        if (!plugin) {
            throw new Error(`PluginRegistry: Plugin ${id} not found`);
        }
        if (plugin.lifecycle !== 'ACTIVE') {
            throw new Error(`PluginRegistry: Cannot deprecate plugin in state ${plugin.lifecycle}`);
        }

        plugin.lifecycle = 'DEPRECATED';
    }

    /**
     * Revoke plugin (any state → REVOKED)
     */
    revoke(id: string, reason: string, timestamp: string = new Date().toISOString()): void {
        const plugin = this.plugins.get(id);
        if (!plugin) {
            throw new Error(`PluginRegistry: Plugin ${id} not found`);
        }
        if (plugin.lifecycle === 'REVOKED') {
            return; // Already revoked
        }

        plugin.lifecycle = 'REVOKED';
        plugin.revokedAt = timestamp;
        plugin.revocationReason = reason;
    }

    /**
     * Get plugin by ID
     */
    get(id: string): Plugin | undefined {
        return this.plugins.get(id);
    }

    /**
     * Get all active plugins of a specific capability type
     */
    getActive(capabilityType: 'protocol' | 'guard' | 'projection'): Plugin[] {
        const active: Plugin[] = [];
        for (const plugin of this.plugins.values()) {
            if (plugin.lifecycle === 'ACTIVE') {
                const hasCapability = plugin.manifest.capabilities.some(cap => cap.type === capabilityType);
                if (hasCapability) {
                    active.push(plugin);
                }
            }
        }
        return active;
    }

    /**
     * Get all plugins (for debugging/admin)
     */
    getAll(): Plugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Check for capability conflicts
     * Throws if plugin conflicts with existing active plugins
     */
    private checkConflicts(plugin: Plugin): void {
        for (const cap of plugin.manifest.capabilities) {
            if (cap.type === 'protocol') {
                this.checkProtocolConflicts(plugin.manifest.id, cap.targets);
            }
            // Guards and projections don't have conflicts (multiple can coexist)
        }
    }

    /**
     * Check protocol conflicts
     * Two active protocols cannot target the same metric
     */
    private checkProtocolConflicts(pluginId: string, targets: string[]): void {
        for (const plugin of this.plugins.values()) {
            // Skip self, non-active, and deprecated plugins
            if (plugin.manifest.id === pluginId) continue;
            if (plugin.lifecycle !== 'ACTIVE' && plugin.lifecycle !== 'RATIFIED' && plugin.lifecycle !== 'VERIFIED') continue;

            // Check for overlapping targets
            for (const cap of plugin.manifest.capabilities) {
                if (cap.type === 'protocol') {
                    const overlap = targets.filter(t => cap.targets.includes(t));
                    if (overlap.length > 0) {
                        throw new Error(
                            `PluginRegistry: Protocol conflict. Plugin ${pluginId} targets ${overlap.join(', ')} ` +
                            `which are already targeted by plugin ${plugin.manifest.id}`
                        );
                    }
                }
            }
        }
    }

    /**
     * Check if a plugin has a specific capability
     */
    hasCapability(pluginId: string, capability: PluginCapability): boolean {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return false;

        return plugin.manifest.capabilities.some(cap => {
            if (cap.type !== capability.type) return false;

            switch (cap.type) {
                case 'protocol':
                    return capability.type === 'protocol' &&
                        cap.targets.some(t => capability.targets.includes(t));
                case 'guard':
                    return capability.type === 'guard' && cap.phase === capability.phase;
                case 'projection':
                    return capability.type === 'projection' &&
                        cap.events.some(e => capability.events.includes(e));
                default:
                    return false;
            }
        });
    }
}
