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

export interface CommitReceipt {
    attemptId: AttemptID;
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

    // 3.1 Submit Attempt
    public submitAttempt(
        actor: string,
        protocolId: string,
        intent: Intent,
        cost: Nat = 1
    ): AttemptID {
        const attempt: Attempt = {
            id: intent.intentId, // Use Intent ID as base Attempt ID for binding
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

    // 3.2 Guard Attempt (Pure Validation)
    public guardAttempt(attemptId: AttemptID): 'ACCEPTED' | 'REJECTED' {
        const attempt = this.attempts.get(attemptId);
        if (!attempt) throw new Error("Kernel Error: Attempt not found");

        // 1. Signature Verify
        const sigResult = SignatureGuard({ intent: attempt.intent, manager: this.identity });
        if (!sigResult.ok) {
            this.reject(attempt, sigResult.violation);
            return 'REJECTED';
        }

        // 2. Resolve Authority (Iron-5 Algebra Section 8)
        const targetMetric = attempt.intent.payload.metricId;
        const scopeResult = ScopeGuard({
            actor: attempt.actor,
            capability: `METRIC.WRITE:${targetMetric}`,
            engine: this.delegation
        });
        if (!scopeResult.ok) {
            this.reject(attempt, scopeResult.violation);
            return 'REJECTED';
        }

        // 3. Protocol Validation (Section 3.2)
        if (!this.protocols.isRegistered(attempt.protocolId) && attempt.protocolId !== 'SYSTEM') {
            this.reject(attempt, "Protocol not installed");
            return 'REJECTED';
        }

        attempt.status = 'ACCEPTED';
        return 'ACCEPTED';
    }

    // 3.3 Commit Attempt (Atomic Mutation)
    public commitAttempt(attemptId: AttemptID, budget: Budget): CommitReceipt {
        const attempt = this.attempts.get(attemptId);
        if (!attempt || attempt.status !== 'ACCEPTED') {
            throw new Error(`Kernel Error: Attempt ${attemptId} not in ACCEPTED state`);
        }

        // 4. Budget Verify (Reserved at Commit Start)
        const budResult = BudgetGuard({ budget, cost: attempt.cost });
        if (!budResult.ok) throw new Error(`Kernel Reject: ${budResult.violation}`);

        try {
            // 2-PHASE COMMIT (Section 3.3)
            // Phase 1: Evaluation (Sandbox)
            const mutations: Mutation[] = [
                { metricId: attempt.intent.payload.metricId, value: attempt.intent.payload.value }
            ];

            const sideEffects = this.protocols.evaluate(attempt.timestamp, mutations[0]);
            mutations.push(...sideEffects);

            // Phase 2: Dry Run (Validation Only)
            for (const m of mutations) {
                this.state.validateMutation(m);
            }

            // ATOMIC BOUNDARY (Section 3.3)
            budget.consume(attempt.cost);

            for (const m of mutations) {
                this.state.applyTrusted(
                    m,
                    attempt.intent.timestamp,
                    mutations.indexOf(m) === 0 ? attempt.actor : 'SYSTEM',
                    `${attempt.id}${mutations.indexOf(m) > 0 ? ':se:' + m.metricId : ''}`
                );
            }

            attempt.status = 'COMMITTED';

            return {
                attemptId: attempt.id,
                timestamp: attempt.intent.timestamp,
                status: 'COMMITTED'
            };

        } catch (e: any) {
            attempt.status = 'ABORTED';
            throw new Error(`Kernel Halt: Commit Failed: ${e.message}`);
        }
    }

    // 3.4 Identity Kernel APIs (Governance transitions)

    public createIdentity(actor: string, params: any): void {
        this.checkGovernanceAuth(actor, 'IDENTITY.CREATE');
        this.identity.register(params);
        this.audit.append({
            intentId: `gov:create:${params.id}`,
            principalId: actor,
            payload: { metricId: 'system.identity', value: params },
            timestamp: this.state.getHistory('system.identity')[0]?.updatedAt || '0:0', // Placeholder
            expiresAt: '0',
            signature: 'GOV'
        } as any, 'SUCCESS');
    }

    public grantDelegation(actor: string, granter: string, grantee: string, scope: string[], expiresAt: number): void {
        this.checkGovernanceAuth(actor, 'IDENTITY.DELEGATE');

        // Use DelegationEngine to handle formal 5.1/5.2 checks internally or here
        const sig = 'GOVERNANCE_SIGNATURE'; // In a real system, this would be signed by the Kernel
        this.delegation.grant(granter, grantee, new CapabilitySet(scope), expiresAt.toString(), sig);

        this.audit.append({
            intentId: `gov:grant:${granter}:${grantee}`,
            principalId: actor,
            payload: { metricId: 'system.delegation', value: { granter, grantee, scope } },
            timestamp: '0:0',
            expiresAt: expiresAt.toString(),
            signature: 'GOV'
        } as any, 'SUCCESS');
    }

    public revokeIdentity(actor: string, targetId: string): void {
        this.checkGovernanceAuth(actor, 'IDENTITY.REVOKE');
        const timestamp = '0:0'; // In a real system, use TimeStore.now()
        this.identity.revoke(targetId, timestamp);

        this.audit.append({
            intentId: `gov:revoke:${targetId}`,
            principalId: actor,
            payload: { metricId: 'system.revocation', value: { targetId } },
            timestamp: timestamp,
            expiresAt: '0',
            signature: 'GOV'
        } as any, 'SUCCESS');
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

    // Legacy support for single-shot execution
    public execute(intent: Intent, budget?: Budget): CommitReceipt {
        const aid = this.submitAttempt(intent.principalId, 'SYSTEM', intent);

        const guardStatus = this.guardAttempt(aid);
        if (guardStatus === 'REJECTED') {
            const sigResult = SignatureGuard({ intent, manager: this.identity });
            if (!sigResult.ok) throw new Error(`Kernel Reject: ${sigResult.violation}`);

            const targetMetric = intent.payload.metricId;
            const scopeResult = ScopeGuard({
                actor: intent.principalId,
                capability: `METRIC.WRITE:${targetMetric}`,
                engine: this.delegation
            });
            if (!scopeResult.ok) throw new Error(`Kernel Reject: ${scopeResult.violation}`);

            throw new Error(`Kernel Reject: Guard failed`);
        }

        const b = budget || new Budget('ENERGY' as any, 100);
        return this.commitAttempt(aid, b);
    }
}

type Nat = number;

