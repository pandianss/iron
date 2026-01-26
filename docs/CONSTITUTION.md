# The Constitution of the IRON Kernel

**Version**: 1.0.0 (Hardened)
**Date**: 2026-01-26
**Status**: ACTIVE

---

## Preamble
The IRON Kernel is a deterministic governance engine designed to enforce business logic with the rigor of physical law. This document defines the Articles of Operation that the kernel code implements.

---

## Article I: The Ontology of Truth
**Source**: `src/L0/Ontology.ts`, `src/L2/State.ts`

1.  **Metric**: A measurable unit of state. All metrics must be typed (COUNTER, GAUGE, BOOLEAN).
2.  **State**: The set of all metrics at a specific timestamp.
3.  **Action**: A signed intent to mutate a metric.
4.  **Identity**: A cryptographic entity (Ed25519 public key) authorized to sign actions.

---

## Article II: State Mechanics
**Source**: `src/Kernel.ts`, `src/L2/State.ts`

2.1 **State Transition Law**: The Kernel computes state $S_{t+1}$ from $S_t$ via Action $A$ iff $Guard(S_t, A)$ accepts. (`Transition` method)
2.2 **Temporal Monotonicity**: Time must strictly advance. $Timestamp(S_{t+1}) \ge Timestamp(S_t)$. (Implemented by `StateModel.applyTrusted` and `TimeGuard`).
2.3 **Immutability Isolate**: Past state snapshots are immutable and cryptographically linked (Merkle Chain).

---

## Article III: The Authority Interface
**Source**: `src/L0/Guards.ts`, `src/L1/Identity.ts`

3.1 **Identity Resolution**: All actions must be signed by a registered entity or be rejected (`SignatureGuard`).
3.2 **Jurisdiction**: Entities may only mutate metrics if granted specific `Function` capability within a `Scope` (`ScopeGuard`).
3.3 **Replay Protection**: No action ID may be processed twice (`ReplayGuard`).

---

## Article IV: The Institutional Ledger
**Source**: `src/L5/Audit.ts`

4.1 **Evidence**: Every State Transition must produce an Evidence Record.
4.2 **Append-Only**: The Audit Log must never be mutated or deleted.
4.3 **Chain of Custody**: Evidence records must be hashed and linked ($H_n = Hash(H_{n-1} + Evidence)$).

---

## Article V: Privileged Operations
**Source**: `src/Kernel.ts`

5.1 **Creation**: The `ROOT` entity may register new entities (`createEntity`).
5.2 **Mantle**: The `ROOT` entity may grant authority (`grantAuthority`).
5.3 **Recall**: The `ROOT` entity may revoke authority or entities (`revokeAuthority`).
5.4 **Emergency Override**: In the event of Kernel deadlock or infinite loop, `ROOT` may force a state transition despite Protocol logic, provided `SignatureGuard` passes (`override`).

---

## Article VII: Fiscal Law
**Source**: `src/L0/Kernel.ts` (Budget)

7.1 **Energy Conservation**: Every execution requires `Budget`.
7.2 **Bankruptcy**: Execution halts immediately if `Budget` is exhausted (`BudgetGuard`).

---

## Article XIII: Hardening & Invariants
**Source**: `src/L0/Invariants.ts`

13.1 **Self-Defense**: The Kernel MUST reject any input that violates Type Safety, Schema, or Cryptographic Integrity.
13.2 **Fail-Safe**: In the event of unrecoverable internal error, the Kernel MUST transition to `VIOLATED` or `ABORTED` state rather than producing corrupt state.

---
*Verified by Property-Based Testing (INV-001, INV-002) and Chaos Engineering (CHAOS-001).*
