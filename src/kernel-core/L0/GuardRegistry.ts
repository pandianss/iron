import type { Guard, GuardResult } from './Guards.js';
import { PluginRegistry } from './PluginRegistry.js';
import { PluginContext } from './PluginContext.js';
import { StateModel } from '../L2/State.js';
import { AuditLog } from '../L5/Audit.js';

export type GuardType = 'INVARIANT' | 'SIGNATURE' | 'SCOPE' | 'TIME' | 'BUDGET' | 'CONFLICT' | 'REPLAY' | 'IRREVERSIBILITY' | 'MULTISIG' | 'COLLECTIVE';

interface RegisteredGuard {
    name: string;
    guard: Guard<any>;
    pluginId?: string;
}

export class GuardRegistry {
    private guards: Map<GuardType, RegisteredGuard[]> = new Map();

    constructor(
        private pluginRegistry?: PluginRegistry,
        private state?: StateModel,
        private audit?: AuditLog
    ) { }

    /**
     * Legacy register (system guards)
     */
    public register<T>(type: GuardType, guard: Guard<T>) {
        const existing = this.guards.get(type) || [];
        existing.push({ name: 'SYSTEM', guard });
        this.guards.set(type, existing);
    }

    /**
     * Register a guard from a plugin
     */
    public registerFromPlugin<T>(pluginId: string, type: GuardType, name: string, guard: Guard<T>) {
        if (!this.pluginRegistry) throw new Error("GuardRegistry: PluginRegistry not configured");
        if (!this.state || !this.audit) throw new Error("GuardRegistry: StateModel or AuditLog not configured for PluginContext");

        const plugin = this.pluginRegistry.get(pluginId);
        if (!plugin) throw new Error(`GuardRegistry: Plugin ${pluginId} not found`);

        // Check capability
        const hasCap = plugin.manifest.capabilities.some(cap => cap.type === 'guard' && cap.phase === type);
        if (!hasCap) {
            throw new Error(`GuardRegistry: Plugin ${pluginId} does not have 'guard' capability for phase ${type}`);
        }

        // Create context and wrap
        const ctx = new PluginContext(plugin.manifest, this.state, this.audit);
        const wrappedGuard = ctx.wrap(guard);

        const existing = this.guards.get(type) || [];
        existing.push({ name, guard: wrappedGuard, pluginId });
        this.guards.set(type, existing);
    }

    public evaluate<T>(type: GuardType, context: T): GuardResult {
        const registered = this.guards.get(type);
        if (!registered || registered.length === 0) {
            // Default to OK if no guards for this phase (except maybe INVARIANT?)
            return { ok: true };
        }

        for (const entry of registered) {
            // Lifecycle Check: If from plugin, check if active
            if (entry.pluginId && this.pluginRegistry) {
                const plugin = this.pluginRegistry.get(entry.pluginId);
                if (!plugin || (plugin.lifecycle !== 'ACTIVE' && plugin.lifecycle !== 'DEPRECATED')) {
                    continue; // Skip inactive plugin guards
                }
            }

            const result = entry.guard(context);
            if (!result.ok) {
                // Return first failure
                return result;
            }
        }

        return { ok: true };
    }
}
