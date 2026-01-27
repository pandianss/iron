// src/kernel-core/L0/PluginContext.ts
import { StateModel } from '../L2/State.js';
import { AuditLog } from '../L5/Audit.js';
import type { PluginManifest } from './Plugin.js';

/**
 * Restricted State Access for Plugins
 */
export interface IPluginState {
    get(metricId: string): number | undefined;
    // Plugins can only read metrics they are authorized for? 
    // Or read-all but write-restricted? 
    // For now, read-all but through this restricted interface.
}

/**
 * Restricted Audit Access for Plugins
 */
export interface IPluginAudit {
    getHistory(): Promise<any[]>;
}

/**
 * Plugin Execution Context
 * Provides restricted APIs to plugins and binds execution to a manifest.
 */
export class PluginContext {
    constructor(
        public readonly manifest: PluginManifest,
        private state: StateModel,
        private audit: AuditLog
    ) { }

    /**
     * Get restricted state interface
     */
    get stateAPI(): IPluginState {
        return {
            get: (metricId: string) => this.state.get(metricId)
        };
    }

    /**
     * Get restricted audit interface
     */
    get auditAPI(): IPluginAudit {
        return {
            getHistory: () => this.audit.getHistory()
        };
    }

    /**
     * Wrap a function to run within this context
     * This is useful if we want to ensure any calls made by the plugin
     * are tracked or limited.
     */
    wrap<T extends (...args: any[]) => any>(fn: T): T {
        return ((...args: any[]) => {
            // For now just calls it, but we could set an "active context" global or similar
            return fn(...args);
        }) as T;
    }
}
