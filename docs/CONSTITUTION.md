# The IRON Constitution

**Version**: 1.0.0
**Status**: ACTIVE
**Enforcement**: HARD (Kernel Level)

## Preamble
We, the developers and agents of the IRON Kernel, in order to form a more perfect digital institution, establish this Constitution to govern the behavior of the software.

## Article I: Identity
**Principle**: "No Actor shall exist without cryptographic proof."
*   **Law**: `IdentityAlgebra`
*   **Implementation**: [`src/L1/Identity.ts`](../src/L1/Identity.ts)
*   **Enforcement**:
    *   `SignatureGuard` ([`src/L0/Guards.ts`](../src/L0/Guards.ts)): Rejects any Action without a valid Ed25519 signature from a registered Public Key.

## Article II: Authority
**Principle**: "Power is delegated, not assumed."
*   **Law**: `AuthorityEngine`
*   **Implementation**: [`src/L1/Identity.ts`](../src/L1/Identity.ts)
*   **Enforcement**:
    *   `AuthorityGuard` ([`src/L0/Guards.ts`](../src/L0/Guards.ts)): Checks `Jurisdiction` (Scope) and `Capacity` (Limit) before every write.

## Article III: State
**Principle**: "The Truth is singular and immutable."
*   **Law**: `CanonicalState`
*   **Implementation**: [`src/L2/State.ts`](../src/L2/State.ts)
*   **Enforcement**:
    *   `applyTrusted()`: Enforces `CanonicalTuple` hashing `[Version, Action, Time, Root]`.
    *   `verifyIntegrity()`: mathematical proof that the current state is derived from the Genesis block.

## Article IV: Audit
**Principle**: "History shall not be rewritten."
*   **Law**: `MerkleAuditLog`
*   **Implementation**: [`src/L5/Audit.ts`](../src/L5/Audit.ts)
*   **Enforcement**:
    *   `Monotonicity`: Time checks in `append()`.
    *   `TamperEvidence`: Merkle chaining in `verifyChain()`.
    *   `Immutability`: `Object.freeze()` on all runtime Evidence.

## Article V: Resilience
**Principle**: "The System shall survive the chaos."
*   **Law**: `ChaosResilience`
*   **Verification**: [`src/__tests__/Adversary.test.ts`](../src/__tests__/Adversary.test.ts)
*   **Enforcement**:
    *   `Idempotency`: Replay attacks are rejected.
    *   `AtomicCommit`: High concurrency does not corrupt state.
