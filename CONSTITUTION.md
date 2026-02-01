# IRON Constitution

**Formal Governance Rules for the Kernel**

---

## Preamble

This Constitution defines the **immutable laws** that the IRON Kernel enforces. These are not policies or guidelines—they are **structural constraints** encoded in the system's architecture.

---

## Article I: The Principle of Impossibility

**"Impossibility Before Deterrence"**

### I.1 Structural Nullity
Any action that violates a core invariant **shall be structurally impossible** to execute. It shall not be permitted and then punished; it shall return `Error("Structural Violation")`.

### I.2 No Bypass
There shall be no "break-glass" mechanism that does not carry an indelible, high-friction cost. All valid actions must pass through the Kernel's guard system.

### I.3 Guard Purity
Guards must be **pure functions** with no side effects. They return `{ ok: true }` or `{ ok: false, violation: string }`.

**Implementation**: `src/kernel-core/L0/Guards.ts`

---

## Article II: The Principle of Collective Cognition

**"Friction for Consequence"**

### II.1 Plurality Requirement
High-impact, irreversible actions (e.g., Protocol activation, Constitution amendment) **require multi-signature** or multi-session deliberation.

### II.2 Deliberation Latency
The system **must enforce temporal spacing** between Proposal and Ratification to prevent momentum-based errors.

**Minimum Cooldown**: 24 hours for Protocol ratification.

### II.3 Forced Articulation
No significant action may be taken without an explicit, recorded `Intent` payload. Ambiguity is treated as a nullity.

**Implementation**: `ProposalCooldownGuard`, `MultiSigGuard`

---

## Article III: The Principle of Binding

**"Irrevocable Responsibility"**

### III.1 Identity Persistence
Every action **must be cryptographically bound** to a persistent Identity (Ed25519 public key).

### III.2 Non-Transferability
Responsibility **cannot be delegated** to an anonymous pool or a transitory alias.

### III.3 No Retroactive Reassignment
The signer of an action is **permanently the author** of its effects.

**Implementation**: `SignatureGuard`, `IdentityManager`

---

## Article IV: The Principle of Memory

**"Behavioural Memory Over Punishment"**

### IV.1 Durable Deviation
The system **must retain an immutable trace** of every deviation, exception, or failure (`GuardResult: REJECTED`).

### IV.2 Visible Context
History is not just a log of effects, but a **log of attempts**. The "Shadow of the Future" is cast by the "Light of the Past".

### IV.3 Corrective Trace
Correction is achieved by the **visible accumulation of error**, assuming rational actors will minimize their own reputational friction.

**Implementation**: `AuditLog`, `Evidence` chain

---

## Article V: The Principle of Continuity

**"Continuity Bias"**

### V.1 Future Privilege
Actions that "mortgage the future" for the present are **structurally disadvantaged** (e.g., higher friction, higher consensus thresholds).

### V.2 Explicit Evolution
The rules of the system (Protocols) may only change through the system's own **heavy mechanisms**. No silent drift.

### V.3 Irreversibility Tax
Actions marked as `irreversible: true` require **higher approval thresholds** than reversible actions.

**Implementation**: `IrreversibilityGuard`, Protocol churn metrics

---

## Article VI: State Mechanics

**Source**: `src/kernel-core/L2/State.ts`

### VI.1 State Transition Law
The Kernel computes state $S_{t+1}$ from $S_t$ via Action $A$ **if and only if** $Guard(S_t, A)$ accepts.

### VI.2 Temporal Monotonicity
Time must **strictly advance**: $Timestamp(S_{t+1}) \geq Timestamp(S_t)$.

### VI.3 Immutability Isolate
Past state snapshots are **immutable** and cryptographically linked (Merkle Chain).

**Implementation**: `StateModel.applyTrusted()`, `TimeGuard`

---

## Article VII: The Authority Interface

**Source**: `src/kernel-core/L1/Identity.ts`, `src/kernel-core/L0/Guards.ts`

### VII.1 Identity Resolution
All actions must be signed by a **registered entity** or be rejected.

**Guard**: `SignatureGuard`

### VII.2 Jurisdiction
Entities may only mutate metrics if granted specific **Function capability** within a **Scope**.

**Guard**: `ScopeGuard`

### VII.3 Replay Protection
No action ID may be processed **twice**.

**Guard**: `ReplayGuard`

---

## Article VIII: The Institutional Ledger

**Source**: `src/kernel-core/L5/Audit.ts`

### VIII.1 Evidence
Every State Transition **must produce** an Evidence Record.

### VIII.2 Append-Only
The Audit Log **must never be mutated or deleted**.

### VIII.3 Chain of Custody
Evidence records must be **hashed and linked**: $H_n = Hash(H_{n-1} + Evidence)$.

**Implementation**: `AuditLog.append()`, `Evidence.evidenceId`

---

## Article IX: Privileged Operations

**Source**: `src/kernel-core/Kernel.ts`

### IX.1 Creation
The `ROOT` entity may **register new entities**.

**Method**: `createEntity()`

### IX.2 Mantle
The `ROOT` entity may **grant authority**.

**Method**: `grantAuthority()`

### IX.3 Recall
The `ROOT` entity may **revoke authority** or entities.

**Method**: `revokeAuthority()`, `revokeEntity()`

### IX.4 Emergency Override
In the event of Kernel deadlock or infinite loop, `ROOT` may **force a state transition** despite Protocol logic, provided:
1. `SignatureGuard` passes
2. Multi-signature requirement is met (3-of-5)
3. Justification is recorded in audit log

**Method**: `override(action, justification, signatures)`

---

## Article X: Fiscal Law

**Source**: `src/kernel-core/L0/Kernel.ts` (Budget)

### X.1 Energy Conservation
Every execution **requires Budget**.

### X.2 Bankruptcy
Execution **halts immediately** if Budget is exhausted.

**Guard**: `BudgetGuard`

---

## Article XI: Hardening & Invariants

**Source**: `src/kernel-core/L0/Invariants.ts`

### XI.1 Self-Defense
The Kernel **must reject** any input that violates:
- Type Safety
- Schema Validity
- Cryptographic Integrity

### XI.2 Fail-Safe
In the event of unrecoverable internal error, the Kernel **must transition** to `VIOLATED` or `ABORTED` state rather than producing corrupt state.

**Invariants**:
- `INV-ID-01`: All actions must have a valid, registered initiator
- `INV-SEC-01`: Signatures must be cryptographically valid
- `INV-STATE-01`: Metric IDs must not be reserved keywords (`__proto__`, `prototype`, `constructor`)

---

## Article XII: Protocol Lifecycle

**Source**: `src/kernel-core/L4/Protocol.ts`

### XII.1 Proposal
Any entity with `PROTOCOL:PROPOSE` authority may submit a Protocol.

### XII.2 Ratification
Protocols must be **ratified** before activation. Ratification requires:
1. Minimum 24-hour cooldown from proposal
2. Valid signature from authorized entity

### XII.3 Activation
Ratified protocols may be **activated** to begin evaluating state changes.

### XII.4 Deprecation
Active protocols may be **deprecated** to stop evaluation.

### XII.5 Conflict Resolution
If multiple protocols trigger on the same mutation, the system **rejects the action** with `PROTOCOL_VIOLATION`.

**Guard**: `ConflictGuard`

---

## Article XIII: Adversarial Audit

### XIII.1 Hostile Review
The Constitution and its implementation **must be adversarially audited** for exploits, loopholes, and ambiguities.

### XIII.2 Structural Fixes Only
Identified vulnerabilities **must be patched structurally**, not rhetorically. No policy workarounds.

### XIII.3 Public Disclosure
All constitutional amendments and patches **must be publicly disclosed** in the audit log.

---

## Verification

This Constitution is verified by:
- **Property-Based Testing**: `src/kernel-core/__tests__/*.test.ts`
- **Invariant Checks**: `src/kernel-core/L0/Invariants.ts`
- **Audit Replay**: `src/kernel-core/L0/__tests__/AuditReplay.test.ts`

---

**Ratified**: 2026-02-01  
**Version**: 2.0.0  
**Status**: ACTIVE
