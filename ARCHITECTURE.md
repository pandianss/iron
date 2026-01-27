# IRON System Architecture

> **Definition**: IRON is a hierarchical Governance Operating System designed to enforce "Institutional Physics".
>
> **Institutional Physics** refers to the invariant laws governing authority, state transition, accountability, and resource constraints that cannot be violated by any actor, including the system administrators.
>
> **Identity**: IRON is an **Executable Kernel**. It is not a protocol (though it contains them) and not a reference architecture (though it provides one). It is the machine that enforces the law.

---

## I. Architectural Objects
The system is composed of seven irreducible primitives.

1.  **Kernel**: The deterministic state machine foundation.
2.  **Identity**: The cryptographic actor definition (Public Key + Identity Proof).
3.  **State**: The append-only, Merkle-linked ledger of truth.
4.  **Intent**: A signed request to change state (Action).
5.  **Protocol**: A ratifiable, versioned logic module defining state transition rules.
6.  **Guard**: A pure function that accepts or rejects Intents based on invariants.
7.  **Capability**: A distinct unit of authority granted to an Identity.
8.  **Plugin**: A signed, restricted extension module providing Guards, Protocols, or Projections.

---

## II. Layer Laws (L0–L7)
The system is stratified into **Law-Bound Layers** (mechanisms) and **Replaceable Layers** (policy/application).

### A. The Governance Substrate (Law-Bound)
*These layers must obey strict kernel invariants. They cannot be bypassed.*

#### Layer 0: Physics (The Invariant Core)
*   **Role**: Determinism and Enforcment.
*   **Invariants**:
    1.  **Authority**: No action executes without valid cryptographic provenance.
    2.  **Legitimacy**: No state transition occurs outside the `Attempt -> Guard -> Commit` cycle.
    3.  **Audit**: No mutation occurs without generating a verifiable evidence trail.
    4.  **Isolation**: The Kernel must be side-effect free; it inputs Intents and outputs State/Audit.
    5.  **Plugin Context**: Plugins must execute within a restricted `PluginContext`, with NO direct access to Kernel internals.

#### Layer 1: Identity (The Authority Algebra)
*   **Role**: Definition of "Who".
*   **Invariants**:
    1.  **Closure**: Authority is closed under delegation. If A delegates to B, A must hold the capability.
    2.  **Revocation**: Revocation is immediate and propagates downstream (eventual consistency acceptable only if specified).
    3.  **Scope**: No identity exists outside the `IdentityManager` registry.

#### Layer 2: State (The Ledger of Truth)
*   **Role**: Definition of "What".
*   **Invariants**:
    1.  **Immutability**: Past state cannot be modified, only appended to.
    2.  **Continuity**: Every state snapshot $S_n$ must cryptographically reference $S_{n-1}$.
    3.  **Truth**: Metrics inside L2 are the *only* authoritative source of system reality.

### B. The Organizational Runtime (Gov-Ops)
*These layers leverage the kernel to run the organization.*

#### Layer 3: Simulation (The Advisory Plane)
*   **Role**: Forecasting and Risk Assessment (Monte Carlo).
*   **Invariants**:
    1.  **Advisory Only**: Simulation outputs are non-binding.
    2.  **Isolation**: No simulated state may mutate canonical L2 state.
    3.  **Divergence**: Divergence between Simulation and Reality triggers an "Anomaly" event, not a fault.

#### Layer 4: Protocols (The Legislature)
*   **Role**: Definition of "How".
*   **Laws**:
    1.  **Ratification**: Code does not execute until Ratified by an Authority.
    2.  **Versioned**: All protocols are immutable once active; changes require new versions.
    3.  **Capability Bound**: Protocols originating from Plugins are strictly limited to the Metric Targets declared in the Plugin Manifest.

#### Layer 5: Audit (The Judiciary)
*   **Role**: Evidence and Proof.
*   **Laws**:
    1.  **Completeness**: Every `REJECT` and `SUCCESS` is recorded.
    2.  **Exportability**: Proofs must be verifiable by external systems without private keys.

### C. The Application Surface (Replaceable)
*These layers are interfaces. They have no authority.*

#### Layer 6: Interface (The API)
*   **Role**: Transport and Translation.
*   **Laws**:
    1.  **Read-Only Optimization**: May cache state but is never the source of truth.
    2.  **Passthrough**: All writes MUST pass primarily to L0.

#### Layer 7: Experience (The UI)
*   **Role**: Human Interaction.
*   **Laws**:
    1.  **No Logic**: Does not enforce rules (Kernel does). Only visualizes them.

---

## III. Execution Topology
The flow of an Action through the system:

1.  **Origination** (L7): User constructs an Intent (Payload).
2.  **Signing** (L6): Intent is signed by User's Private Key.
3.  **Entry** (L0): Intent enters the Boundary Guard.
    *   *Check*: Signature Validity.
    *   *Check*: Message Integrity.
4.  **Authority Check** (L1): `AuthorityGuard` verifies Grant/Capability.
5.  **Rejection Mechanics** (L4): `ProtocolGuard` runs Logic rules.
    *   *If Fail*: Intent -> `REJECT` -> Audit Log. Halt.
6.  **Commit** (L2): `StateModel` applies mutation.
    *   *Effect*: New Merkle Root.
    *   *Effect*: New Audit Entry (`SUCCESS`).

---

## IV. Boundary & Failure Laws

### 1. Failure Semantics
*   **Guard Failure**: If a Guard throws/fails, the system **Must Reject**. Fail-Closed.
*   **Kernel Panic**: Any inconsistency in State Hashing triggers a `SYSTEM_HALT`.
*   **Simulation Divergence**: If L3 predicts X and L2 produces Y, the system logs a `PRE_CRIME_ANOMALY` but proceeds with L2 (Reality wins).
*   **Plugin Revocation**: If a Plugin is `REVOKED` or `DEPRECATED`, its associated Guards and Protocols are immediately bypassed or disabled.

### 2. Plugin Enforcement Law
*   **Static Enforcement**: Plugins cannot be registered if they request overlapping Protocol targets or invalid Guard phases.
*   **Runtime Enforcement**: Every plugin call is wrapped in a `PluginContext` that enforces read-only access to state and append-only access to audit.
*   **Capability Check**: The Kernel MUST verify that a plugin still possesses the required capability *at the moment of execution*.

### 3. Upgrade Law
*   **Kernel Evolution**: The Kernel code itself is immutable at runtime. Upgrades require a `MIGRATION` event (transfer of State Root to new Kernel instance).
*   **Protocol Evolution**: Handled via L4 `deprecate` / `activate` lifecycle.

### 3. Forbidden Architectures
*   **Never**: Allow UI (L7) to write directly to Database (L2) bypassing Kernel (L0).
*   **Never**: Allow Simulation (L3) to "auto-correct" Reality (L2).
*   **Never**: Hardcode specific Identities (e.g., "The CEO") into Kernel Logic (L0). Always use Roles/Capabilities.
*   **Never**: Allow a Plugin to access another Plugin's private state or memory.
