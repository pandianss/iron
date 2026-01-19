
// src/L0/Guards.ts
import type { Principal } from '../L1/Identity.js';
import { IdentityManager, DelegationEngine } from '../L1/Identity.js';
import { verifySignature } from './Crypto.js';
import type { Intent } from '../L2/State.js';
import { Budget } from './Kernel.js';
import type { Protocol } from '../L4/Protocol.js';

// --- Guard Pattern ---
export type GuardResult = { ok: true } | { ok: false; violation: string };

export type Guard<T> = (input: T, ctx?: any) => GuardResult;

const OK: GuardResult = { ok: true };
const FAIL = (msg: string): GuardResult => ({ ok: false, violation: msg });

// --- Concrete Guards ---

// 1. Identity & Signature
export const SignatureGuard: Guard<{ intent: Intent, manager: IdentityManager }> = ({ intent, manager }) => {
    const p = manager.get(intent.principalId);
    if (!p) return FAIL("Principal not found");
    if (p.revoked) return FAIL("Principal revoked");

    const data = `${intent.intentId}:${intent.principalId}:${JSON.stringify(intent.payload)}:${intent.timestamp}:${intent.expiresAt}`;
    if (!verifySignature(data, intent.signature, p.publicKey)) return FAIL("Invalid Signature");

    return OK;
};

// 2. Scope (Delegation)
export const ScopeGuard: Guard<{ actor: string, capability: string, engine: DelegationEngine }> =
    ({ actor, capability, engine }) => {
        if (!engine.authorized(actor, capability)) {
            return FAIL(`Scope Violation: ${actor} lacks capability ${capability}`);
        }
        return OK;
    };

// 3. Time (Monotonicity)
export const TimeGuard: Guard<{ currentTs: string, lastTs: string }> = ({ currentTs, lastTs }) => {
    if (BigInt(currentTs) < BigInt(lastTs)) return FAIL("Time Violation: Backwards timestamp");
    return OK;
};

// 4. Budget
export const BudgetGuard: Guard<{ budget: Budget, cost: number }> = ({ budget, cost }) => {
    // Check only. Do not consume.
    if ((budget.limit - budget.used) < cost) return FAIL("Budget Exhausted");
    return OK;
};

// 5. Protocol Conflict
export const ConflictGuard: Guard<{ protocols: Protocol[] }> = ({ protocols }) => {
    if (protocols.length > 1) {
        // Check if allowMulti? 
        // Formal Spec: "lone p : Protocol". 
        // If >1 trigger for same action metric -> FAIL.
        // Assuming passed protocols are all triggering for the SAME action.
        return FAIL("Protocol Conflict: Multiple protocols triggered");
    }
    return OK;
};
