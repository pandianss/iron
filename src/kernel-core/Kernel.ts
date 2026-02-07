import { StateModel, MetricRegistry } from './L2/State.js';
import { IdentityManager, AuthorityEngine } from './L1/Identity.js';
import { ProtocolEngine } from './L4/Protocol.js';
import type { Mutation, Action, ActionPayload, KernelState, ActionID, CapacityID, JurisdictionID, EntityID } from './L0/Ontology.js';
import { AuditLog } from './L5/Audit.js';
import { SignatureGuard, ScopeGuard, TimeGuard, BudgetGuard, InvariantGuard, ReplayGuard, IrreversibilityGuard, MultiSigGuard } from './L0/Guards.js';
import { checkInvariants } from './L0/Invariants.js';
import type { Rejection } from './L0/Invariants.js';
import { LogicalTimestamp } from './L0/Kernel.js';
import { Budget } from './L0/Primitives.js';
import { GuardRegistry } from './L0/GuardRegistry.js';
import { PluginRegistry } from './L0/PluginRegistry.js';
import { ErrorCode, KernelError } from './Errors.js';

export type AttemptID = string;
export type AttemptStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMMITTED' | 'ABORTED';

/**
 * 8. Action (Primitive)
 * A signed attempt to invoke a protocol.
 */
export interface Attempt {
    id: AttemptID;
    initiator: EntityID;
    protocolId: string;
    action: Action;
    cost: number;
    timestamp: LogicalTimestamp;
    status: AttemptStatus;
}

export interface Commit {
    attemptId: AttemptID;
    oldStateHash: string; // From Evidence Trace
    newStateHash: string; // From Evidence Trace
    cost: number;
    timestamp: string;
    status: 'COMMITTED';
}

export class GovernanceKernel {
    private attempts: Map<AttemptID, Attempt> = new Map();
    private seenActions: Set<ActionID> = new Set(); // Replay Protection
    private lifecycle: KernelState = 'UNINITIALIZED';
    private guards: GuardRegistry;

    constructor(
        private identity: IdentityManager,
        private authority: AuthorityEngine,
        public state: StateModel,
        private protocols: ProtocolEngine,
        private audit: AuditLog,
        private registry: MetricRegistry,
        private pluginRegistry?: PluginRegistry
    ) {
        this.guards = new GuardRegistry(pluginRegistry, state, audit);
        // Register Constitutional Guards
        this.guards.register('INVARIANT', InvariantGuard);
        this.guards.register('SIGNATURE', SignatureGuard);
        this.guards.register('SCOPE', ScopeGuard);
        this.guards.register('TIME', TimeGuard);
        this.guards.register('REPLAY', ReplayGuard);
        this.guards.register('BUDGET', BudgetGuard);
        this.guards.register('IRREVERSIBILITY', IrreversibilityGuard);
        this.guards.register('MULTISIG', MultiSigGuard);

        this.transition('CONSTITUTED');
    }

    public get Lifecycle() { return this.lifecycle; }

    public getStateSnapshotChain() {
        return this.state.getSnapshotChain();
    }

    /**
     * II.2 State Transition Law (Charter Principle)
     */
    private transition(to: KernelState) {
        const from = this.lifecycle;

        // Illegal Transitions
        if (from === 'VIOLATED' && to === 'ACTIVE') throw new Error("Kernel Error: Cannot transition VIOLATED -> ACTIVE directly. Must RECOVER.");
        if (from === 'DISSOLVED') throw new Error("Kernel Error: Kernel is DISSOLVED. No further transitions allowed.");

        const allowed = {
            'UNINITIALIZED': ['CONSTITUTED'],
            'CONSTITUTED': ['ACTIVE'],
            'ACTIVE': ['SUSPENDED', 'VIOLATED', 'DISSOLVED'],
            'SUSPENDED': ['ACTIVE', 'DISSOLVED'],
            'VIOLATED': ['RECOVERED', 'DISSOLVED'],
            'RECOVERED': ['ACTIVE', 'SUSPENDED'],
            'DISSOLVED': []
        } as Record<KernelState, KernelState[]>;

        if (from !== 'UNINITIALIZED' && !allowed[from].includes(to)) {
            throw new Error(`Kernel Violation: Illegal State Transition ${from} -> ${to} `);
        }

        this.lifecycle = to;
    }

    public boot() {
        if (this.lifecycle === 'CONSTITUTED') {
            this.transition('ACTIVE');
        }
    }

    /**
     * M2.5 Persistence: Allow rehydrating the replay memory
     */
    public registerSeenAction(id: ActionID) {
        if (this.lifecycle !== 'UNINITIALIZED' && this.lifecycle !== 'CONSTITUTED') {
            // In strict mode, we might ban this if kernel is already active, 
            // but for now allow it as long as we haven't started processing new things?
            // Actually, ReplayEngine runs on a fresh kernel, so it will be in UNINITIALIZED or CONSTITUTED.
        }
        this.seenActions.add(id);
    }

    public get State() { return this.state; }
    public get Registry() { return this.registry; }
    public get Protocols() { return this.protocols; }

    /**
     * Article V: State Interface - Propose Transition (Submit Attempt)
     */
    public async submitAttempt(
        initiator: EntityID,
        protocolId: string,
        action: Action,
        cost: number = 1
    ): Promise<AttemptID> {
        if (this.lifecycle !== 'ACTIVE') {
            throw new Error(`Kernel Error: Cannot submit attempt in state ${this.lifecycle} `);
        }
        const attempt: Attempt = {
            id: action.actionId,
            initiator,
            protocolId,
            action,
            cost,
            timestamp: LogicalTimestamp.fromString(action.timestamp),
            status: 'PENDING'
        };

        this.attempts.set(attempt.id, attempt);
        await this.audit.append(action, 'ATTEMPT');
        return attempt.id;
    }

    /**
     * Article III.2 Authority Interface - Verify Mandate (Guard Attempt)
     */
    public async guardAttempt(attemptId: AttemptID): Promise<{ status: 'ACCEPTED' | 'REJECTED', reason?: string }> {
        if (this.lifecycle !== 'ACTIVE') throw new Error(`Kernel Error: Cannot guard attempt in state ${this.lifecycle} `);
        const attempt = this.attempts.get(attemptId);
        if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");

        // 1. Static Invariant Check
        let check = this.guards.evaluate('INVARIANT', { action: attempt.action, manager: this.identity });
        if (!check.ok) {
            const violation = (check as any).violation!;
            const match = /\[(.*?)\] (.*)/.exec(violation);
            const code = match ? match[1] : 'INVARIANT_VIOLATION';
            const message = (match && match[2]) ? match[2] : violation;

            await this.reject(attempt, { code: code as any, invariantId: 'Unknown', message });
            return { status: 'REJECTED', reason: message };
        }

        // 2. Identity & Signature
        const sigResult = this.guards.evaluate('SIGNATURE', { intent: attempt.action, manager: this.identity });
        if (!sigResult.ok) {
            const rejection: Rejection = {
                code: (sigResult as any).code || ErrorCode.SIGNATURE_INVALID,
                invariantId: 'INV-ID-01',
                message: (sigResult as any).violation || "Invalid Signature"
            };
            await this.reject(attempt, rejection);
            return { status: 'REJECTED', reason: rejection.message || "Invalid Signature" };
        }

        // 3. Scope & Jurisdiction
        const scopeResult = this.guards.evaluate('SCOPE', {
            actor: attempt.initiator,
            capability: `METRIC.WRITE:${attempt.action.payload.metricId}`,
            engine: this.authority,
            context: {
                time: attempt.action.timestamp,
                value: attempt.action.payload.value as number
            }
        });

        if (!scopeResult.ok) {
            const rejection: Rejection = {
                code: (scopeResult as any).code || ErrorCode.OVERSCOPE_ATTEMPT,
                invariantId: 'INV-AUTH-01',
                message: (scopeResult as any).violation || "Scope Violation"
            };
            await this.reject(attempt, rejection);
            return { status: 'REJECTED', reason: rejection.message || "Scope Violation" };
        }

        // 4. Replay Protection
        const replayResult = this.guards.evaluate('REPLAY', { actionId: attempt.id, seen: this.seenActions });
        if (!replayResult.ok) {
            const rejection: Rejection = {
                code: (replayResult as any).code || ErrorCode.REPLAY_DETECTED,
                invariantId: 'INV-SEC-01',
                message: (replayResult as any).violation || "Replay Detected"
            };
            await this.reject(attempt, rejection);
            return { status: 'REJECTED', reason: rejection.message || "Replay Detected" };
        }

        // 5. Irreversibility Guard (Continuity Bias)
        if ((attempt.action.payload as any).irreversible) {
            const irrResult = this.guards.evaluate('IRREVERSIBILITY', {
                action: attempt.action,
                requiredApprovals: 2, // Constitutional standard
                providedApprovals: 1 // Default for single action
            });

            if (!irrResult.ok) {
                const rejection: Rejection = {
                    code: ErrorCode.IRREVERSIBILITY_VIOLATION,
                    invariantId: 'INV-CONT-01',
                    message: (irrResult as any).violation
                };
                await this.reject(attempt, rejection);
                return { status: 'REJECTED', reason: (irrResult as any).violation };
            }
        }

        // 6. Protocol Binding
        if (attempt.protocolId !== 'SYSTEM' && attempt.protocolId !== 'ROOT') {
            if (!this.protocols.isRegistered(attempt.protocolId)) {
                const rejection: Rejection = {
                    code: ErrorCode.PROTOCOL_VIOLATION,
                    invariantId: 'PRO-BIND-01',
                    message: "Protocol Binding Violation: Protocol not registered"
                };
                await this.reject(attempt, rejection);
                return { status: 'REJECTED', reason: rejection.message };
            }
        }

        // Acceptance
        attempt.status = 'ACCEPTED';
        await this.audit.append(attempt.action, 'ACCEPTED');

        return { status: 'ACCEPTED' };
    }


    /**
     * Article V: State Interface - Commit Validated Transition
     */
    public async commitAttempt(attemptId: AttemptID, budget: Budget): Promise<Commit> {
        if (this.lifecycle !== 'ACTIVE') throw new Error(`Kernel Error: Cannot commit in state ${this.lifecycle} `);

        const attempt = this.attempts.get(attemptId);
        if (!attempt || attempt.status !== 'ACCEPTED') {
            throw new Error(`Kernel Error: Attempt ${attemptId} not in ACCEPTED state`);
        }

        // Article VII: Fiscal Law - Budget is equivalent to Physics
        const budResult = BudgetGuard({ budget, cost: attempt.cost });
        if (!budResult.ok) throw new Error(`Kernel Reject: Budget Violation(${(budResult as any).violation})`);

        try {
            // 1. Protocol Execution
            const transitions: Mutation[] = [
                { metricId: attempt.action.payload.metricId, value: attempt.action.payload.value }
            ];

            const sideEffects = this.protocols.evaluate(attempt.timestamp, transitions[0]);
            transitions.push(...sideEffects);

            // 2. State Validation
            for (const t of transitions) {
                this.state.validateMutation(t);
            }

            // ATOMIC COMMIT
            budget.consume(attempt.cost);

            // Article III.6 Institutional Ledger & Evidence
            const evidence = await this.audit.append(attempt.action, 'SUCCESS');

            // ATOMIC STATE COMMIT (One snapshot per action)
            await this.state.applyTrusted(
                transitions,
                attempt.action.timestamp,
                attempt.initiator,
                attempt.id,
                evidence.evidenceId
            );

            attempt.status = 'COMMITTED';

            this.attempts.delete(attemptId);
            this.seenActions.add(attempt.action.actionId);

            return {
                attemptId: attempt.id,
                oldStateHash: evidence.previousEvidenceId,
                newStateHash: evidence.evidenceId,
                cost: attempt.cost,
                timestamp: attempt.action.timestamp,
                status: 'COMMITTED'
            };

        } catch (e: any) {
            console.error("Kernel Commit Error:", e);
            attempt.status = 'ABORTED';
            await this.audit.append(attempt.action, 'ABORTED', e.message);
            throw new Error(`Kernel Halt: Commit Failed: ${e.message} `);
        }
    }

    // --- Article V: Privileged Interfaces ---

    public async createEntity(actor: EntityID, params: any): Promise<void> {
        this.checkGovernanceAuth(actor, 'ENTITY.CREATE');
        this.identity.register(params);
        await this.audit.append(this.createSystemAction(actor, 'system.entity', params), 'SUCCESS');
    }

    public async grantAuthority(actor: EntityID, granter: EntityID, grantee: EntityID, capacity: CapacityID, jurisdiction: JurisdictionID): Promise<void> {
        this.checkGovernanceAuth(actor, 'AUTHORITY.GRANT');
        const timestamp = '0:0';
        const sig = 'GOVERNANCE_SIGNATURE';
        const authorityId = `auth:${Date.now()} `;

        this.authority.grant(authorityId, granter, grantee, capacity, jurisdiction, timestamp, sig);
        await this.audit.append(this.createSystemAction(actor, 'system.authority', { granter, grantee, capacity, jurisdiction }), 'SUCCESS');
    }

    public async revokeAuthority(actor: EntityID, authorityId: string): Promise<void> {
        this.checkGovernanceAuth(actor, 'AUTHORITY.REVOKE');
        this.authority.revoke(authorityId);
        await this.audit.append(this.createSystemAction(actor, 'system.revocation', { authorityId }), 'SUCCESS');
    }

    public async revokeEntity(actor: EntityID, targetId: EntityID): Promise<void> {
        this.checkGovernanceAuth(actor, 'ENTITY.REVOKE');
        const timestamp = '0:0';
        this.identity.revoke(targetId, timestamp);
        await this.audit.append(this.createSystemAction(actor, 'system.revocation', { targetId }), 'SUCCESS');
    }

    private checkGovernanceAuth(actor: EntityID, action: string) {
        if (!this.authority.authorized(actor, `GOVERNANCE:${action} `)) {
            throw new Error(`Kernel Reject: Entity ${actor} not authorized for ${action}`);
        }
    }

    // Article V: Emergency Override (Article II.11)
    public async override(action: Action, justification: string, signatures?: string[]): Promise<Commit> {
        if (this.lifecycle !== 'ACTIVE') throw new Error("Kernel is not ACTIVE");

        if (!this.authority.authorized(action.initiator, 'GOVERNANCE:OVERRIDE')) {
            throw new Error("Override Violation: Actor is not authorized for GOVERNANCE:OVERRIDE");
        }

        // NEW: MultiSig Enforcement for Overrides
        const multiSigResult = this.guards.evaluate('MULTISIG', {
            action,
            requiredSignatures: 3, // Const-II-11 Requirement
            providedSignatures: signatures || [action.signature],
            authorizedSigners: ['root.1', 'root.2', 'root.3', 'root.4', 'root.5'],
            identityManager: this.identity
        });

        if (!multiSigResult.ok) {
            throw new Error(`Override Blocked: ${(multiSigResult as any).violation}`);
        }

        const aid = await this.submitAttempt(action.initiator, 'ROOT', action);
        const attempt = this.attempts.get(aid)!;

        attempt.status = 'ACCEPTED';
        await this.audit.append(action, 'SUCCESS', `OVERRIDE: ${justification}`);

        return await this.commitAttempt(aid, new Budget('RISK' as any, 1000));
    }

    private async reject(attempt: Attempt, rejection: Rejection, metadata?: Record<string, any>) {
        attempt.status = 'REJECTED';
        await this.audit.append(attempt.action, 'REJECT', rejection.message, {
            ...metadata,
            code: rejection.code,
            invariantId: rejection.invariantId
        });

        // Automatic Revocation (Product 1 requirement)
        if (rejection.code === 'REVOKED_ENTITY' || rejection.code === 'SIGNATURE_INVALID' || rejection.code === ErrorCode.OVERSCOPE_ATTEMPT) {
            console.log(`[Iron] Critical Breach(${rejection.code}).Triggering Automatic Revocation for ${attempt.initiator}`);
            try {
                this.identity.revoke(attempt.initiator, '0:0');
            } catch (e: any) {
                console.warn(`[Iron] Auto - Revocation Failed: ${e.message} `);
            }
        }
    }

    private createSystemAction(initiator: EntityID, metric: string, value: any): Action {
        return {
            actionId: `sys:${Date.now()}:${Math.random()} `,
            initiator,
            payload: { metricId: metric, value },
            timestamp: '0:0',
            expiresAt: '0',
            signature: 'SYSTEM'
        };
    }

    // Article V: Execution Entry (Legacy/Direct)
    public async execute(action: Action, budget?: Budget): Promise<Commit> {
        const aid = await this.submitAttempt(action.initiator, action.payload.protocolId || 'SYSTEM', action);
        const guardStatus = await this.guardAttempt(aid);
        if (guardStatus.status === 'REJECTED') {
            throw new Error(`Kernel Reject: ${guardStatus.reason} `);
        }
        const b = budget || new Budget('ENERGY' as any, 100);
        return await this.commitAttempt(aid, b);
    }

}

