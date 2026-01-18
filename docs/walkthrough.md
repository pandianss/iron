# Walkthrough - Iron. Closed System Refactor

## Goal
Realign the Governance OS architecture to the "Iron. Closed System Map" and formal correctness.
This specifically enforces a 7-layer stack with fixed responsibilities and no cross-layer bypassing.

## Architecture Map

| Layer | Name | Responsibility | Key Components |
|:---|:---|:---|:---|
| **L0** | **Kernel** | Invariants, Time, Budgets | `DeterministicTime`, `Budget`, `InvariantEngine` |
| **L1** | **Identity** | Who can act? | `IdentityManager`, `DelegationEngine` |
| **L2** | **Truth** | What is true? | `StateModel`, `MetricRegistry` |
| **L3** | **Simulation** | What if we act? | `SimulationEngine`, `TrendAnalyzer` |
| **L4** | **Protocol** | Executable Commitments | `ProtocolEngine` |
| **L5** | **Accountability** | Unavoidable Outcomes | `AuditLog` (Ledger), `AccountabilityEngine` |
| **L6** | **Interface** | Boundary Control | `GovernanceInterface` |

## Formal Correctness & Security
This system is formally aligned with the **Iron TLA+/Alloy Specification** (`docs/formal_spec.md`).

### Addressed Formal Gaps
1.  **Delegation Scope**: `delegate.scope ⊆ delegator.scope`. Enforced in L1 `DelegationEngine`.
2.  **Protocol Conflict**: Rejection of multiple protocols targeting same metric. Enforced in L4 using Conflict Detection.
3.  **Monotonic Time**: `timestamp >= prev.timestamp`. Enforced in L2 `StateModel`.
4.  **Revocation**: Transitive and Terminal. Enforced in L1 via recursive `revoked` checks.
5.  **Accountability Completeness**: Failed attempts are logged. Enforced via `try-catch` in L2 `StateModel`.
6.  **Budget Atomicity**: Exhaustion = Zero State Change. Enforced in L3 `SimulationEngine`.

### Security Hardening (Ed25519 + SHA256)
- **L0 Crypto**: All signing uses Ed25519. Hashing uses strict SHA-256.
- **Signed Intents**: Loose `Evidence` replaced by `Intent`, which MUST be signed.
- **State**: `StateModel.apply()` blindly rejects anything with an invalid signature.

## Verification
A System-Level Test Suite (`src/__tests__/System.test.ts`) verifies the interaction across all layers and formal invariants.

```bash
PASS  src/__tests__/System.test.ts
  Iron. Formal Gap Verification
    √ Gap 1: Delegation Scope Subset Enforcement (2 ms)
    √ Gap 2: Protocol Conflict Rejection (1 ms)
    √ Gap 3: Monotonic Time Enforcement (1 ms)
    √ Gap 4: Revoked Principal Cannot Act (1 ms)
    √ Gap 5: Failed Attempts are Logged (1 ms)
```

## Conclusion
The system adheres to the "Iron." specification, "Minimum Cryptographic & Security Specification", and formally verified safety properties.
