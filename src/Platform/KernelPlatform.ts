import { StateModel } from '../kernel-core/L2/State.js';
import type { Action, ActionPayload } from '../kernel-core/L2/State.js';
import type { AttemptID, Commit } from '../kernel-core/Kernel.js';
import { GovernanceKernel } from '../kernel-core/Kernel.js';
import { Budget } from '../kernel-core/L0/Primitives.js';
import {
    PlatformError,
    PolicyViolationError,
    SecurityViolationError,
    DataIntegrityError,
    InfrastructureError
} from './Errors.js';
import type { IStateRepository, IPrincipalRegistry, ISystemClock, IEventStore } from './Ports.js';
import { AuditLog } from '../kernel-core/L5/Audit.js';

/**
 * The Domain Command: A product-level intention.
 */
export interface Command {
    id: string;
    userId: string;
    target: string; // Metric or Resource
    operation: string;
    payload: any;
    signature: string;
    timestamp?: string;
}

/**
 * KernelPlatform: The official interface layer.
 * All Products Call This. No Product Calls L0 directly.
 */
export class KernelPlatform {
    private kernel: GovernanceKernel;
    private audit: AuditLog;

    constructor(
        private repo: IStateRepository,
        private principal: IPrincipalRegistry,
        private clock: ISystemClock,
        // Dependency Injection for Core Engines
        private identityManager: any,
        private authorityEngine: any,
        private protocols: any,
        private metrics: any,
        private eventStore?: IEventStore,
        injectedState?: StateModel
    ) {
        this.audit = new AuditLog(this.eventStore);
        const state = injectedState || new StateModel(this.audit, this.metrics, this.identityManager);
        this.kernel = new GovernanceKernel(
            this.identityManager,
            this.authorityEngine,
            state,
            this.protocols,
            this.audit,
            this.metrics
        );
    }

    /**
     * Legacy/Direct execution (Shortcut for simple actions)
     */
    public async executeDirect(userId: string, target: string, operation: string, payload: any, signature: string): Promise<any> {
        const cmd: Command = {
            id: `direct:${Date.now()}`,
            userId,
            target,
            operation,
            payload,
            signature
        };

        try {
            return await this.execute(cmd);
        } catch (e) {
            return { ok: false, error: this.translateError(e, cmd) };
        }
    }

    /**
     * Standard Execution Entry (Atomic)
     */
    public async execute(cmd: Command): Promise<any> {
        const entityId = await this.principal.resolve(cmd.userId);
        if (!entityId) throw new Error("UNAUTHORIZED_PRINCIPAL");

        const action: Action = {
            actionId: cmd.id,
            initiator: entityId,
            payload: {
                metricId: cmd.target,
                value: cmd.payload,
                protocolId: cmd.operation || 'SYSTEM'
            },
            timestamp: cmd.timestamp || this.clock.now(),
            expiresAt: '0',
            signature: cmd.signature
        };

        const commit = await this.kernel.execute(action, new Budget('ENERGY' as any, 100));
        return { ok: true, commitId: commit.attemptId };
    }

    /**
     * Two-phase commit: Step 1 - Submit Attempt
     */
    public async submitAction(userId: string, actionId: string, metricId: string, value: any, protocolId?: string): Promise<string> {
        const cmd: Command = {
            id: actionId,
            userId,
            target: metricId,
            operation: protocolId || 'SYSTEM',
            payload: value,
            signature: 'GOVERNANCE_SIGNATURE' // Placeholder
        };

        try {
            const entityId = await this.principal.resolve(userId);
            if (!entityId) throw new Error("UNAUTHORIZED_PRINCIPAL");

            const action: Action = {
                actionId,
                initiator: entityId,
                payload: { metricId, value, protocolId: protocolId || 'SYSTEM' },
                timestamp: this.clock.now(),
                expiresAt: '0',
                signature: 'GOVERNANCE_SIGNATURE'
            };

            return await this.kernel.submitAttempt(entityId, protocolId || 'SYSTEM', action);
        } catch (e) {
            throw this.translateError(e, cmd);
        }
    }

    /**
     * Two-phase commit: Step 2 - Commit Attempt
     */
    public async commitAction(attemptId: string, budget: any): Promise<any> {
        try {
            const commit = await this.kernel.commitAttempt(attemptId, budget);
            return {
                ok: true,
                commitId: commit.attemptId,
                newStateHash: commit.newStateHash
            };
        } catch (e) {
            return { ok: false, error: this.translateError(e) };
        }
    }

    /**
     * Read-only Query
     */
    public query(metricId: string): any {
        return this.kernel.state.get(metricId);
    }

    /**
     * Get state history
     */
    public getHistory(metricId: string): any[] {
        return this.kernel.state.getHistory(metricId);
    }

    /**
     * Translates low-level Kernel rejections into Platform Errors.
     */
    private translateError(e: any, cmd?: Command): PlatformError {
        const msg = e.message || "Unknown Kernel Error";
        const op = cmd?.operation || "unknown";
        const user = cmd?.userId || "unknown";
        const target = cmd?.target || "unknown";

        if (msg.includes("Policy Violation") || msg.includes("reverts") || msg.includes("rejects")) {
            return new PolicyViolationError(msg, op);
        }
        if (msg.includes("Authority") || msg.includes("Signature") || msg.includes("Jurisdiction")) {
            return new SecurityViolationError(msg, user, target);
        }
        if (msg.includes("Invariant") || msg.includes("Integrity") || msg.includes("Merkle")) {
            return new DataIntegrityError(msg);
        }

        return new InfrastructureError(msg, e);
    }
}
