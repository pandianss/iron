# IRON Architecture

**Layer-by-Layer Breakdown of the Governance Kernel**

---

## Overview

IRON is structured as a **6-layer stack** (L0-L5), each enforcing a specific constitutional principle. Layers are **strictly isolated**: higher layers may only interact with lower layers through defined interfaces.

```
┌─────────────────────────────────────┐
│  L5: Audit (Accountability)         │  → Immutable Evidence Chain
├─────────────────────────────────────┤
│  L4: Protocol (Reactive Logic)      │  → Business Rules as Code
├─────────────────────────────────────┤
│  L3: Simulation (Projection)        │  → State Forecasting
├─────────────────────────────────────┤
│  L2: State (Truth Store)            │  → Merkle Chain of Snapshots
├─────────────────────────────────────┤
│  L1: Identity (Entities & Authority)│  → Cryptographic Principals
├─────────────────────────────────────┤
│  L0: Kernel (Guards & Invariants)   │  → Constitutional Enforcement
└─────────────────────────────────────┘
```

---

## L0: Kernel (Constitutional Enforcement)

**Purpose**: Enforce the **Behavioural Constitution** through Guards and Invariants.

### Components

#### `Kernel.ts`
The **GovernanceKernel** orchestrates the 3-phase execution model:
1. **Submit**: Materialize an `Attempt` from an `Action`
2. **Guard**: Validate via constitutional guards
3. **Commit**: Apply state transitions atomically

#### `Guards.ts`
Pure functions that return `{ ok: true }` or `{ ok: false, violation: string }`:
- **InvariantGuard**: Schema, type safety, anti-prototype pollution
- **SignatureGuard**: Cryptographic identity verification
- **ScopeGuard**: Authority and jurisdiction checks
- **ReplayGuard**: Prevent duplicate action IDs
- **BudgetGuard**: Fiscal law enforcement
- **ProposalCooldownGuard**: Deliberation latency (NEW)
- **MultiSigGuard**: Plurality requirement (NEW)

#### `Invariants.ts`
Hard constraints that **cannot be violated**:
- `INV-ID-01`: All actions must have a valid, registered initiator
- `INV-SEC-01`: Signatures must be cryptographically valid
- `INV-STATE-01`: Metric IDs must not be reserved keywords

#### `Crypto.ts`
Cryptographic primitives:
- `generateKeyPair()`: Ed25519 key generation
- `signData()`, `verifySignature()`: Signature operations
- `hash()`, `hashState()`: SHA-256 hashing
- `canonicalize()`: Deterministic JSON serialization

---

## L1: Identity (Entities & Authority)

**Purpose**: Manage cryptographic identities and authority grants.

### Components

#### `Identity.ts`
- **IdentityManager**: Registry of entities (ACTOR, SYSTEM, ROOT)
- **Entity**: `{ id, type, status, publicKey, identityProof }`
- **AuthorityEngine**: Manages jurisdiction grants and capability checks

### Key Operations
- `register(entity)`: Add a new identity
- `revoke(entityId)`: Mark an entity as REVOKED
- `grant(granter, grantee, capacity, jurisdiction)`: Delegate authority
- `authorized(actor, capability)`: Check if actor has permission

---

## L2: State (Truth Store)

**Purpose**: Maintain the **single source of truth** as a Merkle chain of state snapshots.

### Components

#### `State.ts`
- **StateModel**: Immutable state manager
- **StateSnapshot**: `{ state, hash, previousHash, actionId, timestamp }`
- **MetricRegistry**: Schema definitions for all metrics

### Key Operations
- `applyTrusted(mutations, timestamp, initiator)`: Atomic state transition
- `validateMutation(payload)`: Schema and type validation
- `verifyIntegrity()`: Verify Merkle chain integrity
- `get(metricId)`: Read current value
- `getHistory(metricId)`: Read historical values

### Guarantees
- **Temporal Monotonicity**: Timestamps must strictly advance
- **Cryptographic Linkage**: Each snapshot is hashed with `previousHash`
- **Immutability**: Past snapshots are frozen and cannot be altered

---

## L3: Simulation (State Projection)

**Purpose**: Project future state without committing mutations.

### Components

#### `Simulation.ts`
- **SimulationEngine**: Runs "what-if" scenarios
- **ReplayEngine**: Reconstructs state from audit log

### Key Operations
- `simulate(mutations, currentState)`: Project state changes
- `replay(evidenceChain)`: Rebuild state from evidence

---

## L4: Protocol (Reactive Business Logic)

**Purpose**: Encode business rules as **reactive protocols** that trigger on state changes.

### Components

#### `Protocol.ts`
- **ProtocolEngine**: Manages protocol lifecycle
- **Protocol**: `{ id, preconditions, mutations, status }`

### Lifecycle
1. **PROPOSED**: Protocol is submitted
2. **RATIFIED**: Protocol is approved (requires cooldown)
3. **ACTIVE**: Protocol is evaluating state changes
4. **DEPRECATED**: Protocol is deactivated

### Key Operations
- `propose(protocol)`: Submit a new protocol
- `ratify(protocolId, signature)`: Approve protocol (with cooldown check)
- `activate(protocolId)`: Enable protocol evaluation
- `evaluate(timestamp, mutation)`: Check if protocol triggers

### Example Protocol
```typescript
{
    id: 'iron.protocol.budget.v1',
    preconditions: [
        { metricId: 'budget.energy', operator: 'GT', threshold: 0 }
    ],
    mutations: [
        { metricId: 'budget.energy', value: -10 }
    ]
}
```

---

## L5: Audit (Accountability)

**Purpose**: Maintain an **immutable, cryptographically sealed** record of all actions.

### Components

#### `Audit.ts`
- **AuditLog**: Append-only evidence chain
- **Evidence**: `{ evidenceId, previousEvidenceId, action, status, timestamp }`

### Status Types
- `ATTEMPT`: Action submitted
- `ACCEPTED`: Passed all guards
- `SUCCESS`: Committed to state
- `REJECT`: Failed a guard
- `ABORTED`: Error during commit

### Key Operations
- `append(action, status, reason)`: Add evidence entry
- `verifyChain()`: Verify cryptographic integrity
- `getHistory()`: Retrieve full audit trail

### Guarantees
- **Append-Only**: Evidence cannot be deleted or modified
- **Cryptographic Sealing**: Each entry is hashed with `previousEvidenceId`
- **Deviation Memory**: All rejections are permanently recorded

---

## Execution Flow

```
1. User creates Action (signed with private key)
2. Kernel.submitAttempt() → Creates Attempt, logs ATTEMPT
3. Kernel.guardAttempt() → Runs all Guards
   ├─ REJECTED → Log REJECT, return error
   └─ ACCEPTED → Log ACCEPTED, proceed
4. Kernel.commitAttempt() → Execute Protocol, apply State
   ├─ ABORTED → Log ABORTED, rollback
   └─ SUCCESS → Log SUCCESS, update Merkle chain
5. Return Commit { attemptId, newStateHash, cost }
```

---

## Design Principles

### 1. **Impossibility Before Deterrence**
Guards return structural rejections, not warnings.

### 2. **Irrevocable Binding**
Every action is cryptographically signed and permanently attributed.

### 3. **Behavioural Memory**
All attempts (including failures) are logged immutably.

### 4. **Targeted Friction**
High-impact actions (Protocol ratification, OVERRIDE) require:
- Temporal spacing (ProposalCooldown)
- Plurality (MultiSig)

### 5. **Continuity Bias**
Irreversible actions face higher structural resistance.

---

## Extension Points

### Adding a New Guard
```typescript
// src/kernel-core/L0/Guards.ts
export const MyCustomGuard: Guard<{ input: any }> = ({ input }) => {
    if (/* violation condition */) {
        return FAIL(ErrorCode.CUSTOM_VIOLATION, "Reason");
    }
    return OK;
};

// Register in Kernel constructor
this.guards.register('MY_GUARD', MyCustomGuard);
```

### Adding a New Protocol
```typescript
const myProtocol: Protocol = {
    id: 'my.protocol.v1',
    preconditions: [{ metricId: 'trigger.metric', operator: 'EQ', threshold: 1 }],
    mutations: [{ metricId: 'result.metric', value: 100 }]
};

protocolEngine.propose(myProtocol);
protocolEngine.ratify(myProtocol.id, 'SIGNATURE');
protocolEngine.activate(myProtocol.id);
```

---

## Next Steps

- Read [CONSTITUTION.md](./CONSTITUTION.md) for the formal governance rules
- Read [GUIDE.md](./GUIDE.md) for developer patterns and examples
