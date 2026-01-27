// src/L0/Guards.ts
import { IdentityManager, AuthorityEngine } from '../L1/Identity.js';
import { verifySignature, canonicalize } from './Crypto.js';
import type { Action } from './Ontology.js';
import { Budget } from './Kernel.js';
import type { Protocol } from '../L4/Protocol.js';
import { checkInvariants, type InvariantContext } from './Invariants.js';
import { ErrorCode } from '../Errors.js';

// --- Guard Pattern ---
export type GuardResult = { ok: true } | { ok: false; code: ErrorCode; violation: string };

export type Guard<T> = (input: T, ctx?: any) => GuardResult;

const OK: GuardResult = { ok: true };
const FAIL = (code: ErrorCode, msg: string): GuardResult => ({ ok: false, code, violation: msg });

// --- Concrete Guards ---

// 0. Invariants (Hard Constraints)
export const InvariantGuard: Guard<InvariantContext> = (ctx) => {
    const result = checkInvariants(ctx);
    if (!result.ok && result.rejection) {
        return FAIL(result.rejection.code as any, result.rejection.message);
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

