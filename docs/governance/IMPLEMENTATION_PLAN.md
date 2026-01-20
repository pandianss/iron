# Implementation Plan - IRON Reference Kernel Implementation

This plan defines the path to full IRON compliance by implementing the formal kernel execution core and strictly isolating state management.

## Proposed Changes

### Layer 0: Kernel Core (L0)

#### [MODIFY] [Kernel.ts](file:///e:/projects/iron/iron/src/Kernel.ts)
- Refactor `GovernanceKernel` to implement Section 3 APIs:
  - `submitAttempt`: Materialize internal `Attempt` state, assign ID, timestamp.
  - `guardAttempt`: Strictly validate signature, authority, and budget.
  - `commitAttempt`: Atomic execution of protocol, budget decrement, and log seals.
- Implement `TimeEngine` (Section 4.2) as a kernel-internal monotonic source.
- Implement `BudgetStore` (Section 2.2) with exclusive write access.

#### [MODIFY] [Guards.ts](file:///e:/projects/iron/iron/src/L0/Guards.ts)
- Align guards to work within the `guardAttempt` phase.
- Ensure guards are pure and side-effect free.

### Layer 1: Identity Kernel (L1)

#### [MODIFY] [Identity.ts](file:///e:/projects/iron/iron/src/L1/Identity.ts)
- Finalize `IdentityStore` (Section 2.1) consolidation.
- Implement `createIdentity`, `grantDelegation`, `revokeIdentity` as kernel-owned transitions.

### Layer 2: State / Truth Store (L2)

#### [MODIFY] [State.ts](file:///e:/projects/iron/iron/src/L2/State.ts)
- Refactor `StateModel` to act as the `TruthStore` (Section 2.4).
- Implement read-only snapshotting for the Protocol Sandbox.

### Layer 4: Protocol Sandbox (L4)

#### [MODIFY] [Protocol.ts](file:///e:/projects/iron/iron/src/L4/Protocol.ts)
- Implement `ProtocolSandbox` (Section 4.3) to isolate execution from direct store access.
- Ensure protocols only interact with provided snapshots and intent.

### Layer 5: Accountability (L5)

#### [MODIFY] [Audit.ts](file:///e:/projects/iron/iron/src/L5/Audit.ts)
- Finalize `EventLog` (Section 2.6) with cryptographic sealing.
- Ensure log-first or log-atomic semantics.

### [NEW] Phase 5: Federation Bridge (L6)

#### [MODIFY] [Interface.ts](file:///e:/projects/iron/iron/src/L6/Interface.ts)
- **`FederationBridge` Enhancements**:
  - Implement `registerPartner(publicKey, alias)`: Store public keys for remote kernels.
  - Implement `ingestAttestation(attestation, partnerAlias)`: Validate partner signature and ledger linkage.
  - Implement `Shadow Identity` mapping: Map remote principals to local identifiers.
- **`AttestationAPI` Enhancements**:
  - Implement `sealAttestation(intent)`: Create a cryptographically signed packet for external consumption.

## Verification Plan

### [NEW] Phase 6: Application Layer (L7)

#### [NEW] [App.ts](file:///e:/projects/iron/iron/src/L7/App.ts)
- **`SovereignApp` Controller**:
  - `login(userId, privateKey)`: Initialize a user session.
  - `performAction(actionId, params)`: High-level API to trigger kernel intents.
  - `getDashboard()`: Consolidated view of reputation, metrics, and audit history.
- **`ActionMapper`**:
  - Translates app actions (e.g., "MANDATORY_CHECKIN") into `MetricPayload` objects.

### [NEW] Phase 7: Constitutional Formalization

#### [NEW] [iron5_constitution.md](file:///C:/Users/sspan/.gemini/antigravity/brain/49ee65f8-3f29-4cd6-8e93-9589403f9e25/iron5_constitution.md)
- Formal codification of the IRON kernel laws and identity algebra.
- Implementation of the **Hostile Review & Patching** protocol to ensure system closure.
- Binding of formal annexes to the reference implementation.

## Verification Plan

### Application Scenarios
- **End-to-End Workflow**: Simulation of a user login, action execution, and state verification.
- **Session Security**: Prove that actions are rejected if the session key is missing or invalid.
- **Audit Transparency**: Demonstrate the "View Source" capability where an app action is traced back to a specific ledger hash.
