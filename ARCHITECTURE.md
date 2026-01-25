# The IRON Architecture

IRON is a hierarchical Governance Operating System designed to enforce "Institutional Physics".
It is structured into layers (L0-L7), separating mechanism from policy.

## Layer Map

### 1. The Kernel (L0-L2)
*   **Layer 0 (Physics)**: `src/L0`
    *   **Kernel**: The deterministic state machine (`Kernel.ts`). Enforces invariants (Authority, Budget).
    *   **Guards**: Pure functions that validate Intents (`Guards.ts`).
*   **Layer 1 (Identity)**: `src/L1`
    *   **IdentityManager**: Manages Principals (Agents, Humans, Systems).
    *   **DelegationEngine**: Algebra of Authority (`CapabilitySet`).
*   **Layer 2 (State)**: `src/L2`
    *   **StateModel**: The immutable ledger of Truth.
    *   **Intent**: The atomic unit of change.

### 2. The Runtime (L3-L5)
*   **Layer 3 (Simulation)**: `src/L3`
    *   **MonteCarloEngine**: Stochastic forecasting of future states.
    *   **Purpose**: To enable "Pre-Crime" accountability and algorithmic vetting.
*   **Layer 4 (Protocols)**: `src/L4`
    *   **ProtocolEngine**: The runtime for governance logic extensions.
    *   **ProtocolMarket**: The "App Store" with algorithmic safety vetting.
*   **Layer 5 (Audit)**: `src/L5`
    *   **AuditLog**: Cryptographic proof of history (Merkle Lineage).
    *   **Accountability**: Enforces SLAs based on historical and predicted performance.

### 3. The Interface (L6-L7)
*   **Layer 6 (Gateway)**: `src/L6`
    *   **GovernanceInterface**: The public API. Abstracts Kernel complexity.
    *   **FederationBridge**: Connects to other Kernels.
*   **Layer 7 (Application)**: `src/L7`
    *   **SovereignApp**: Reference implementation of a client consuming the Kernel.
