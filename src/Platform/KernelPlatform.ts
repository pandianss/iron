
import type { Action, ActionPayload } from '../kernel-core/L2/State.js';
import type { AttemptID } from '../kernel-core/Kernel.js';
import { GovernanceKernel } from '../kernel-core/Kernel.js';
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
        private eventStore?: IEventStore
    ) {
        this.audit = new AuditLog(this.eventStore);
        this.kernel = new GovernanceKernel(
            this.identityManager,
            this.authorityEngine,
            repo as any,
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
            const entityId = await this.principal.resolve(userId);
            if (!entityId) throw new Error("UNAUTHORIZED_PRINCIPAL");

            const action: Action = {
                actionId: cmd.id,
                initiator: entityId,
                payload: { metricId: target, value: payload, protocolId: operation },
                timestamp: this.clock.now(),
                expiresAt: '0',
                signature: signature
            };

            const commit = await this.kernel.execute(action);
            return { ok: true, commitId: commit.attemptId };
        } catch (e) {
            return { ok: false, error: this.translateError(e, cmd) };
        }
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
                payload: { metricId, value, protocolId },
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
