# IRON WALLET: Scope & Boundary Constitution

> **Mandate**: Iron Wallet is a **Personal Continuity and Authority System**. It exists to preserve institutional memory, formalize authority/succession, and enforce continuity protocols.

## 1. The Boundary Laws
All features and roadmap items must survive this filter.

### 1.1 The Positive Constraints (MUST)
*   **Governed Objects Only**: We only store objects wrapped in a Governance Context (Authority, Lifecycle, Evidence, Continuity Rules).
*   **Authority Primacy**: Control structures (Who can do what?) precede convenience features.
*   **Protocolized Continuity**: Everything must have a "Time" component (Expiration, Succession, Review).
*   **Evidence is First-Class**: The *provenance* of an object is as important as the object itself.
*   **Execution over Notification**: The system *does* things (signs, transfers, revokes), it doesn't just *remind* you.

### 1.2 The Negative Constraints (NEVER)
*   **No Arbitrary Storage**: Not a Dropbox. If it doesn't have a continuity rule, it doesn't belong.
*   **No Chat/Comms**: Communication is ephemeral; Iron is permanent.
*   **No Fiat Banking**: We govern *Authority* over assets, not the transaction rails themselves (unless via Extension).
*   **No "Productivity"**: We are not a Todo list. We are an Obligation Engine.
*   **No Kernel Bypassing**: Never hardcode logic that should be in the L4 Kernel protocols.

---

## 2. Core Capabilities (In-Scope)

### 2.1 Identity & Authority (L1)
*   **Sovereign Keys**: Ed25519 Key generation and custody.
*   **Attestation**: Signing "I did this" or "I agree to this".
*   **Delegation**: Granting temporary authority to another Iron Wallet ("Emergency Access").

### 2.2 Continuity & Succession (L2)
*   **Deadman Switch**: "If I don't check in for 30 days, transfer Authority X to Person Y."
*   **Living Will**: Cryptographically enforceable instructions for medical/asset authority.
*   **Critical Vault**: Storage of seed phrases/documents *wrapped* in access protocols (e.g., "Requires 2 of 3 guardians to open").

### 2.3 Evidence & Truth (L3)
*   **Audit Trail**: Immutable log of every login, signature, and delegation.
*   **Proof of Existence**: Hashing documents to prove they existed at Time T.

---

## 3. Approved Evolution Path

1.  **Individual (Now)**: "My Password Manager but for my Legal authority."
2.  **Family (Next)**: "The Family Trust OS." Joint custody, inheritance protocols.
3.  **Organization (Future)**: "The Boardroom." Multi-sig governance of corporate entities.
4.  **Institution (Final)**: "The Sovereign Node." A fully autonomous legal entity.

---

## 5. Threat Model

- **Adversary Type**: "The Compromised Device" — A malicious actor gains persistent file-level access but cannot break Ed25519 cryptography.
- **Key Risk**: "State Corruption" — Injecting false metrics or replaying legitimate but expired actions.
- **Mitigation**: 
    - Full Merkle-DAG validation on every boot.
    - Deterministic replay of all events to verify head-state.
    - Hardware/Secured signatures (L0) required for all transitions.

## 6. Non-negotiable Guarantees

- **G1: No Invisible Transitions**: No state change can occur without an associated hashed and signed event in the audit log.
- **G2: Authority-First**: If the `AuthorityEngine` (L1) rejects a granter/grantee relationship, the Kernel must halt execution of that branch immediately.
- **G3: Immutability of History**: Changing a single byte in the historical event log must result in a Merkle failure and kernel suspension.

## 7. Failure Semantics

- **FS1: Fail-Hard/Loud**: On any invariant breach, the Kernel transitions to `VIOLATED` and refuses all further commands.
- **FS2: Atomic Rollback**: If a commit fails (e.g., IO error), the in-memory state must not reflect the partial results; the system must restart and replay to the last known good hash.
- **FS3: Traceability**: Every failure must be associated with the specific `ActionID` that triggered it and the specific `Guard` that caught it.
