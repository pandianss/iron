import type { Intent, MetricPayload } from './L2/State.js';
import { StateModel, MetricRegistry } from './L2/State.js';
import { IdentityManager, DelegationEngine, CapabilitySet } from './L1/Identity.js';
import { ProtocolEngine } from './L4/Protocol.js';
import type { Mutation } from './L4/Protocol.js';
import { AuditLog } from './L5/Audit.js';
import { SignatureGuard, ScopeGuard, TimeGuard, BudgetGuard } from './L0/Guards.js';
import { Budget, LogicalTimestamp } from './L0/Kernel.js';

export type AttemptID = string;
export type AttemptStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMMITTED' | 'ABORTED';

export interface Attempt {
    id: AttemptID;
    actor: string;
    protocolId: string;
    intent: Intent;
    cost: number;
    timestamp: LogicalTimestamp;
    status: AttemptStatus;
}

export interface Commit {
    attemptId: AttemptID;
    oldStateHash: string; // From Audit Lineage
    newStateHash: string; // From Audit Lineage
    cost: number;
    timestamp: string;
    status: 'COMMITTED';
}

export class GovernanceKernel {
    private attempts: Map<AttemptID, Attempt> = new Map();

    constructor(
        private identity: IdentityManager,
        private delegation: DelegationEngine,
        private state: StateModel,
        private protocols: ProtocolEngine,
        private audit: AuditLog,
        private registry: MetricRegistry
    ) { }

    public get State() { return this.state; }
    public get Registry() { return this.registry; }
    public get Protocols() { return this.protocols; } // Capitalized to denote Accessor

    // 3.1 Submit Attempt (Input)
    public submitAttempt(
        actor: string,
        protocolId: string,
        intent: Intent,
        cost: Nat = 1
    ): AttemptID {
        const attempt: Attempt = {
            id: intent.intentId,
            actor,
            protocolId,
            intent,
            cost,
            timestamp: LogicalTimestamp.fromString(intent.timestamp),
            status: 'PENDING'
        };

        this.attempts.set(attempt.id, attempt);
        this.audit.append(intent, 'ATTEMPT');
        return attempt.id;
    }

    // 3.2 Guard Attempt (Invariant I: Authority)
    public guardAttempt(attemptId: AttemptID): 'ACCEPTED' | 'REJECTED' {
        const attempt = this.attempts.get(attemptId);
        if (!attempt) throw new Error("Kernel Error: Attempt not found");

        // Invariant I: The Authority Conservation Law
        // Authority = Signature (Identity) + Delegation (Scope)

        // I.a Signature Check
        const sigResult = SignatureGuard({ intent: attempt.intent, manager: this.identity });
        if (!sigResult.ok) {
            this.reject(attempt, `Authority Violation: Invalid Signature (${sigResult.violation})`);
            return 'REJECTED';
        }

        // I.b Scope Check (Algebra)
        const targetMetric = attempt.intent.payload.metricId;
        const scopeResult = ScopeGuard({
            actor: attempt.actor,
            capability: `METRIC.WRITE:${targetMetric}`,
            engine: this.delegation
        });
        if (!scopeResult.ok) {
            this.reject(attempt, `Authority Violation: Insufficient Scope (${scopeResult.violation})`);
            return 'REJECTED';
        }

        // Protocol Binding Law (Invariant IV)
        if (!this.protocols.isRegistered(attempt.protocolId) && attempt.protocolId !== 'SYSTEM') {
            this.reject(attempt, "Protocol Binding Violation: Protocol not registered");
            return 'REJECTED';
        }

        attempt.status = 'ACCEPTED';
        return 'ACCEPTED';
    }

    // 3.3 Commit Attempt (Invariant II & III)
    public commitAttempt(attemptId: AttemptID, budget: Budget): Commit {
        const attempt = this.attempts.get(attemptId);
        if (!attempt || attempt.status !== 'ACCEPTED') {
            throw new Error(`Kernel Error: Attempt ${attemptId} not in ACCEPTED state`);
        }

        // Invariant II: Budget Conservation Law
        const budResult = BudgetGuard({ budget, cost: attempt.cost });
        if (!budResult.ok) throw new Error(`Kernel Reject: Budget Violation (${budResult.violation})`);

        try {
            // 1. Protocol Execution (Strict Determinism)
            const mutations: Mutation[] = [
                { metricId: attempt.intent.payload.metricId, value: attempt.intent.payload.value }
            ];

            const sideEffects = this.protocols.evaluate(attempt.timestamp, mutations[0]);
            mutations.push(...sideEffects);

            // 2. State Validation
            for (const m of mutations) {
                this.state.validateMutation(m);
            }

            // ATOMIC COMMIT BOUNDARY
            // ---------------------
            budget.consume(attempt.cost);

            // Apply Mutations
            for (const m of mutations) {
                this.state.applyTrusted(
                    m,
                    attempt.intent.timestamp,
                    mutations.indexOf(m) === 0 ? attempt.actor : 'SYSTEM',
                    `${attempt.id}${mutations.indexOf(m) > 0 ? ':se:' + m.metricId : ''}`
                );
            }

            attempt.status = 'COMMITTED';

            // Invariant III: Lineage Immutability Law
            // Capture the hash chain from the Audit Log
            const logEntry = this.audit.append(attempt.intent, 'SUCCESS');

            const commit: Commit = {
                attemptId: attempt.id,
                oldStateHash: logEntry.previousHash,
                newStateHash: logEntry.hash, // The cryptographically committed state
                cost: attempt.cost,
                timestamp: attempt.intent.timestamp,
                status: 'COMMITTED'
            };

            return commit;

        } catch (e: any) {
            attempt.status = 'ABORTED';
            this.audit.append(attempt.intent, 'ABORTED', e.message);
            throw new Error(`Kernel Halt: Commit Failed: ${e.message}`);
        }
    }

    // --- Governance API (Privileged) ---

    public createIdentity(actor: string, params: any): void {
        this.checkGovernanceAuth(actor, 'IDENTITY.CREATE');
        this.identity.register(params);
        this.audit.append(this.createSystemIntent(actor, 'system.identity', params), 'SUCCESS');
    }

    public grantDelegation(actor: string, granter: string, grantee: string, scope: string[], expiresAt: number): void {
        this.checkGovernanceAuth(actor, 'IDENTITY.DELEGATE');
        const sig = 'GOVERNANCE_SIGNATURE';
        this.delegation.grant(granter, grantee, new CapabilitySet(scope), expiresAt.toString(), sig);
        this.audit.append(this.createSystemIntent(actor, 'system.delegation', { granter, grantee, scope }), 'SUCCESS');
    }

    public revokeIdentity(actor: string, targetId: string): void {
        this.checkGovernanceAuth(actor, 'IDENTITY.REVOKE');
        const timestamp = '0:0';
        this.identity.revoke(targetId, timestamp);
        this.audit.append(this.createSystemIntent(actor, 'system.revocation', { targetId }), 'SUCCESS');
    }

    private checkGovernanceAuth(actor: string, action: string) {
        if (!this.delegation.authorized(actor, `GOVERNANCE:${action}`)) {
            throw new Error(`Kernel Reject: Actor ${actor} not authorized for ${action}`);
        }
    }

    private reject(attempt: Attempt, reason: string) {
        attempt.status = 'REJECTED';
        this.audit.append(attempt.intent, 'REJECT', reason);
    }

    private createSystemIntent(actor: string, metric: string, value: any): Intent {
        return {
            intentId: `sys:${Date.now()}:${Math.random()}`, // Non-deterministic, but system generated
            principalId: actor,
            payload: { metricId: metric, value },
            timestamp: '0:0',
            expiresAt: '0',
            signature: 'SYSTEM'
        } as any;
    }

    // Legacy support wrapper
    public execute(intent: Intent, budget?: Budget): Commit {
        const aid = this.submitAttempt(intent.principalId, 'SYSTEM', intent);

        const guardStatus = this.guardAttempt(aid);
        if (guardStatus === 'REJECTED') {
            const attempt = this.attempts.get(aid);
            // Re-throw the specific rejection reason if possible, or generic
            throw new Error(`Kernel Reject: Attempt rejected during guard phase.`);
        }

        const b = budget || new Budget('ENERGY' as any, 100);
        return this.commitAttempt(aid, b);
    }
}

type Nat = number;

