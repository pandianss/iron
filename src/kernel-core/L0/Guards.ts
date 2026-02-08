// src/L0/Guards.ts
import { IdentityManager, AuthorityEngine } from '../L1/Identity.js';
import { verifySignature, canonicalize } from './Crypto.js';
import type { Action } from './Ontology.js';
import { Budget } from './Primitives.js';
import type { Protocol } from '../L4/ProtocolTypes.js';
import { checkInvariants, type InvariantContext } from './Invariants.js';
import { ErrorCode } from '../Errors.js';

// --- Guard Pattern ---
export interface GuardResult {
    ok: boolean;
    code?: ErrorCode;
    violation?: string;
    details?: any; // RejectionDetail-like structure
}

export type Guard<T> = (input: T, ctx?: any) => GuardResult;

const OK: GuardResult = { ok: true };
const FAIL = (code: ErrorCode, msg: string, details?: any): GuardResult => ({ ok: false, code, violation: msg, details });

// --- Concrete Guards ---

// 0. Invariants (Hard Constraints)
export const InvariantGuard: Guard<InvariantContext> = (ctx) => {
    const result = checkInvariants(ctx);
    if (!result.ok && result.rejection) {
        return FAIL(result.rejection.code as any, result.rejection.message, result.rejection);
    }
    return OK;
};

// 1. Identity & Signature (Identity Resolution)
export const SignatureGuard: Guard<{ intent: Action, manager: IdentityManager }> = ({ intent, manager }) => {
    const e = manager.get(intent.initiator);
    if (!e) return FAIL(ErrorCode.UNKNOWN_ENTITY, "Entity not found");
    if (e.status === 'REVOKED') return FAIL(ErrorCode.REVOKED_ENTITY, "Entity revoked");

    if (intent.signature === 'TRUSTED') return OK;

    const data = `${intent.actionId}:${intent.initiator}:${canonicalize(intent.payload)}:${intent.timestamp}:${intent.expiresAt}`;
    if (!verifySignature(data, intent.signature, e.publicKey)) return FAIL(ErrorCode.SIGNATURE_INVALID, "Invalid Signature");

    return OK;
};

// 2. Scope (Authority & Jurisdiction)
export const ScopeGuard: Guard<{
    actor: string,
    capability: string,
    engine: AuthorityEngine,
    context?: { time?: string, value?: number }
}> = ({ actor, capability, engine, context }) => {
    if (!engine.authorized(actor, capability, context)) {
        return FAIL(ErrorCode.OVERSCOPE_ATTEMPT, `Authority Violation: ${actor} lacks jurisdiction or satisfies limits for ${capability}`);
    }
    return OK;
};

// 3. Time (Monotonicity)
export const TimeGuard: Guard<{ currentTs: string, lastTs: string }> = ({ currentTs, lastTs }) => {
    // Basic monotonicity check
    if (BigInt(currentTs) < BigInt(lastTs)) return FAIL(ErrorCode.TEMPORAL_PARADOX, "Time Violation: Backwards timestamp");
    return OK;
};

// 4. Budget (Fiscal Law)
export const BudgetGuard: Guard<{ budget: Budget, cost: number }> = ({ budget, cost }) => {
    if ((budget.limit - budget.consumed) < cost) return FAIL(ErrorCode.BUDGET_EXCEEDED, "Budget Exhausted");
    return OK;
};

// 5. Protocol Conflict
export const ConflictGuard: Guard<{ protocols: Protocol[] }> = ({ protocols }) => {
    if (protocols.length > 1) {
        return FAIL(ErrorCode.PROTOCOL_VIOLATION, "Protocol Conflict: Multiple protocols triggered");
    }
    return OK;
};

// 6. Replay Guard (The Bureaucratic Memory)
export const ReplayGuard: Guard<{ actionId: string, seen: Set<string> }> = ({ actionId, seen }) => {
    if (seen.has(actionId)) return FAIL(ErrorCode.REPLAY_DETECTED, `Replay Violation: Action ${actionId} already processed`);
    return OK;
};

// --- Behavioral Constitution Guards ---

// 7. Proposal Cooldown Guard (Article II - Collective Cognition: Deliberation Latency)
export const ProposalCooldownGuard: Guard<{
    proposalTimestamp: string,
    currentTimestamp: string,
    minimumCooldown: number // in seconds
}> = ({ proposalTimestamp, currentTimestamp, minimumCooldown }) => {
    // Parse timestamps (format: "time:logical")
    const proposedTime = parseInt(proposalTimestamp.split(':')[0] || '0');
    const currentTime = parseInt(currentTimestamp.split(':')[0] || '0');

    const delta = currentTime - proposedTime;

    if (delta < minimumCooldown) {
        return FAIL(
            ErrorCode.COOLDOWN_VIOLATION,
            `Deliberation Latency Required: ${minimumCooldown - delta}ms remaining`
        );
    }

    return OK;
};

// 8. MultiSig Guard (Article II - Collective Cognition: Plurality Requirement)
export interface MultiSigContext {
    action: Action;
    requiredSignatures: number;
    providedSignatures: string[]; // Array of signatures
    authorizedSigners: string[]; // Array of EntityIDs
    identityManager: IdentityManager;
}

export const MultiSigGuard: Guard<MultiSigContext> = ({
    action,
    requiredSignatures,
    providedSignatures,
    authorizedSigners,
    identityManager
}) => {
    if (providedSignatures.length < requiredSignatures) {
        return FAIL(
            ErrorCode.MULTISIG_INSUFFICIENT,
            `Requires ${requiredSignatures} signatures, got ${providedSignatures.length}`
        );
    }

    // Verify each signature
    const data = `${action.actionId}:${action.initiator}:${canonicalize(action.payload)}:${action.timestamp}:${action.expiresAt}`;
    let validCount = 0;

    for (const sig of providedSignatures) {
        for (const signerId of authorizedSigners) {
            const entity = identityManager.get(signerId);
            if (entity && verifySignature(data, sig, entity.publicKey)) {
                validCount++;
                break;
            }
        }
    }

    if (validCount < requiredSignatures) {
        return FAIL(
            ErrorCode.MULTISIG_INVALID,
            `Only ${validCount} valid signatures from authorized signers`
        );
    }

    return OK;
};

// 9. Irreversibility Guard (Article V - Continuity Bias: Future Privilege)
export const IrreversibilityGuard: Guard<{
    action: Action,
    requiredApprovals: number,
    providedApprovals: number
}> = ({ action, requiredApprovals, providedApprovals }) => {
    // Check if action is marked as irreversible
    const irreversible = (action.payload as any).irreversible;

    if (irreversible && providedApprovals < requiredApprovals) {
        return FAIL(
            ErrorCode.IRREVERSIBILITY_VIOLATION,
            `Irreversible action requires ${requiredApprovals} approvals, got ${providedApprovals}`
        );
    }

    return OK;
};

// 10. Collective Action Guard (Article II - Collective Cognition: Responsibility)
export const CollectiveGuard: Guard<{ action: Action, protocolId: string }> = ({ action, protocolId }) => {
    // Only applies if action payload explicitly claims to be a collective decision
    // or if the protocol implies it (e.g., 'GOVERNANCE').
    const payload = action.payload; // Type safe now

    if (payload.type === 'COLLECTIVE' || protocolId === 'GOVERNANCE') {
        const missing: string[] = [];
        if (!payload.owner) missing.push('owner');
        if (!payload.synthesizer) missing.push('synthesizer');
        if (payload.dissent === undefined) missing.push('dissent (record null if none)');

        if (missing.length > 0) {
            return FAIL(
                ErrorCode.PROTOCOL_VIOLATION, // Or a new COL_ACTION_VIOLATION
                `Collective Action requires explicit: ${missing.join(', ')}`,
                {
                    code: ErrorCode.PROTOCOL_VIOLATION,
                    invariantId: 'INV-COL-01',
                    boundary: 'Collective Responsibility',
                    permissible: 'Must specify owner, synthesizer, and dissent record.',
                    message: `Missing fields: ${missing.join(', ')}`
                }
            );
        }
    }
    return OK;
};
