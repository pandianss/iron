# IRON Developer Guide

**Practical Patterns for Building on the Governance Kernel**

---

## Getting Started

### Installation

```bash
git clone https://github.com/yourusername/iron.git
cd iron
npm install
```

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

---

## Core Concepts

### 1. Actions

An **Action** is a signed intent to mutate state. It contains:
- `actionId`: Unique identifier
- `initiator`: EntityID (public key)
- `payload`: `{ metricId, value, protocolId? }`
- `timestamp`: Logical timestamp
- `expiresAt`: Expiration timestamp
- `signature`: Ed25519 signature

**Creating an Action**:

```typescript
import { ActionFactory } from './src/kernel-core/L2/ActionFactory.js';
import { generateKeyPair } from './src/kernel-core/L0/Crypto.js';

const keys = generateKeyPair();

const action = ActionFactory.create(
    'wallet.alice.balance',  // metricId
    100,                     // value
    'user.alice',            // initiator
    keys.privateKey,
    Date.now(),              // timestamp
    Date.now() + 60000,      // expiresAt
    'iron.protocol.budget.v1' // protocolId (optional)
);
```

---

### 2. Kernel Execution

The **GovernanceKernel** orchestrates the 3-phase execution model:

```typescript
import { GovernanceKernel } from './src/kernel-core/Kernel.js';
import { IdentityManager, AuthorityEngine } from './src/kernel-core/L1/Identity.js';
import { StateModel, MetricRegistry } from './src/kernel-core/L2/State.js';
import { ProtocolEngine } from './src/kernel-core/L4/Protocol.js';
import { AuditLog } from './src/kernel-core/L5/Audit.js';

// 1. Initialize Core Components
const idMan = new IdentityManager();
const auth = new AuthorityEngine(idMan);
const audit = new AuditLog();
const registry = new MetricRegistry();
const state = new StateModel(audit, registry, idMan);
const protos = new ProtocolEngine(state);

// 2. Create Kernel
const kernel = new GovernanceKernel(idMan, auth, state, protos, audit, registry);
kernel.boot();

// 3. Register Identity
idMan.register({
    id: 'user.alice',
    type: 'ACTOR',
    status: 'ACTIVE',
    publicKey: keys.publicKey,
    identityProof: 'VERIFIED',
    createdAt: '0:0'
});

// 4. Register Metric
registry.register({
    id: 'wallet.alice.balance',
    description: 'Alice Wallet Balance',
    type: 'GAUGE',
    unit: 'IRON'
});

// 5. Grant Authority
auth.grant(
    'grant.alice',
    'iron.system',
    'user.alice',
    'wallet.alice.*',
    '*',
    '0:0',
    'GOVERNANCE_SIGNATURE'
);

// 6. Execute Action
const commit = await kernel.execute(action);

console.log(`Committed: ${commit.newStateHash}`);
```

---

### 3. Protocols

**Protocols** are reactive business rules that trigger on state changes.

**Example: Budget Deduction Protocol**

```typescript
import type { Protocol } from './src/kernel-core/L4/Protocol.js';

const budgetProtocol: Protocol = {
    id: 'iron.protocol.budget.v1',
    preconditions: [
        { metricId: 'budget.energy', operator: 'GT', threshold: 0 }
    ],
    mutations: [
        { metricId: 'budget.energy', value: -10 }
    ],
    status: 'PROPOSED'
};

// Propose
protos.propose(budgetProtocol);

// Ratify (requires 24-hour cooldown)
await new Promise(resolve => setTimeout(resolve, 86400000)); // Wait 24 hours
protos.ratify(budgetProtocol.id!, 'GOVERNANCE_SIGNATURE', Date.now().toString());

// Activate
protos.activate(budgetProtocol.id!);
```

---

### 4. Guards

**Guards** are pure functions that validate actions before execution.

**Example: Custom Guard**

```typescript
import type { Guard, GuardResult } from './src/kernel-core/L0/Guards.js';
import { ErrorCode } from './src/kernel-core/Errors.js';

const FAIL = (code: ErrorCode, msg: string): GuardResult => 
    ({ ok: false, code, violation: msg });

export const MaxValueGuard: Guard<{ value: number, max: number }> = ({ value, max }) => {
    if (value > max) {
        return FAIL(ErrorCode.INVARIANT_VIOLATION, `Value ${value} exceeds max ${max}`);
    }
    return { ok: true };
};

// Register in Kernel
kernel.guards.register('MAX_VALUE', MaxValueGuard);
```

---

### 5. State Queries

**Reading State**:

```typescript
// Current value
const balance = state.get('wallet.alice.balance');

// Historical values
const history = state.getHistory('wallet.alice.balance');
console.log(history.map(h => ({ value: h.value, timestamp: h.updatedAt })));
```

---

### 6. Audit Trail

**Querying Audit Log**:

```typescript
const evidence = await audit.getHistory();

evidence.forEach(e => {
    console.log(`[${e.status}] ${e.action.actionId} by ${e.action.initiator}`);
    if (e.reason) console.log(`  Reason: ${e.reason}`);
});
```

**Verifying Integrity**:

```typescript
const isValid = await audit.verifyChain();
console.log(`Audit chain valid: ${isValid}`);
```

---

## Common Patterns

### Pattern 1: Multi-Signature Approval

```typescript
import { MultiSigGuard } from './src/kernel-core/L0/Guards.js';

const action = ActionFactory.create(
    'protocol.critical.activate',
    true,
    'user.admin',
    adminKeys.privateKey
);

// Collect signatures from 3 authorized signers
const signatures = [
    signData(actionData, signer1Keys.privateKey),
    signData(actionData, signer2Keys.privateKey),
    signData(actionData, signer3Keys.privateKey)
];

// Validate
const result = MultiSigGuard({
    action,
    requiredSignatures: 3,
    providedSignatures: signatures,
    authorizedSigners: ['signer.1', 'signer.2', 'signer.3', 'signer.4', 'signer.5'],
    identityManager: idMan
});

if (!result.ok) {
    throw new Error(`Multi-sig failed: ${result.violation}`);
}
```

---

### Pattern 2: Deliberation Latency

```typescript
import { ProposalCooldownGuard } from './src/kernel-core/L0/Guards.js';

// Propose Protocol
const proposalTimestamp = Date.now().toString();
protos.propose(myProtocol);

// Wait 24 hours
await new Promise(resolve => setTimeout(resolve, 86400000));

// Ratify with cooldown check
const currentTimestamp = Date.now().toString();
const cooldownResult = ProposalCooldownGuard({
    proposalTimestamp,
    currentTimestamp,
    minimumCooldown: 86400 // 24 hours in seconds
});

if (!cooldownResult.ok) {
    throw new Error(`Cooldown violation: ${cooldownResult.violation}`);
}

protos.ratify(myProtocol.id!, 'GOVERNANCE_SIGNATURE', currentTimestamp);
```

---

### Pattern 3: Irreversible Actions

```typescript
// Mark action as irreversible
const irreversibleAction = ActionFactory.create(
    'system.critical.shutdown',
    true,
    'user.admin',
    adminKeys.privateKey
);

irreversibleAction.payload.irreversible = true;

// Kernel will require higher approval threshold
const commit = await kernel.execute(irreversibleAction);
```

---

### Pattern 4: State Simulation

```typescript
import { SimulationEngine } from './src/kernel-core/L3/Simulation.js';

const sim = new SimulationEngine(state);

// Project future state
const projectedState = sim.simulate([
    { metricId: 'wallet.alice.balance', value: 50 },
    { metricId: 'wallet.bob.balance', value: 150 }
], state.currentState);

console.log(`Alice (projected): ${projectedState.metrics['wallet.alice.balance'].value}`);
console.log(`Bob (projected): ${projectedState.metrics['wallet.bob.balance'].value}`);
```

---

### Pattern 5: Audit Replay

```typescript
import { ReplayEngine } from './src/kernel-core/L3/Simulation.js';

// Rebuild state from audit log
const evidenceChain = await audit.getHistory();
const rebuiltState = await ReplayEngine.replay(evidenceChain, idMan, registry);

// Verify integrity
const isValid = state.verifyIntegrity();
console.log(`State integrity: ${isValid}`);
```

---

## Testing Patterns

### Unit Testing Guards

```typescript
import { describe, it, expect } from '@jest/globals';
import { SignatureGuard } from './src/kernel-core/L0/Guards.js';

describe('SignatureGuard', () => {
    it('should reject invalid signature', () => {
        const result = SignatureGuard({
            intent: invalidAction,
            manager: idMan
        });
        
        expect(result.ok).toBe(false);
        expect(result.violation).toContain('Invalid Signature');
    });
});
```

### Integration Testing Kernel

```typescript
describe('Kernel Execution', () => {
    it('should execute valid action', async () => {
        const commit = await kernel.execute(validAction);
        
        expect(commit.status).toBe('COMMITTED');
        expect(commit.newStateHash).toBeDefined();
    });
    
    it('should reject invalid action', async () => {
        await expect(kernel.execute(invalidAction)).rejects.toThrow('Kernel Reject');
    });
});
```

---

## Best Practices

### 1. Always Use ActionFactory
Don't manually construct `Action` objects. Use `ActionFactory.create()` to ensure proper signature generation.

### 2. Register Metrics Before Use
Always register metrics in the `MetricRegistry` before attempting to mutate them.

### 3. Grant Minimal Authority
Follow the principle of least privilege. Grant only the specific capabilities required.

### 4. Verify Audit Integrity Regularly
Periodically call `audit.verifyChain()` to ensure the evidence chain hasn't been corrupted.

### 5. Use Logical Timestamps
Use `LogicalTimestamp` for all time-based operations to ensure monotonicity.

---

## Troubleshooting

### Error: "Unknown metric"
**Cause**: Metric not registered in `MetricRegistry`  
**Fix**: Call `registry.register({ id, description, type, unit })`

### Error: "Entity not found"
**Cause**: Identity not registered in `IdentityManager`  
**Fix**: Call `idMan.register({ id, type, status, publicKey, identityProof, createdAt })`

### Error: "Scope Violation"
**Cause**: Entity lacks authority for the requested capability  
**Fix**: Call `auth.grant(granter, grantee, capacity, jurisdiction, timestamp, signature)`

### Error: "Replay Detected"
**Cause**: Action ID has already been processed  
**Fix**: Generate a new unique `actionId`

### Error: "Time Violation"
**Cause**: Timestamp is not monotonically increasing  
**Fix**: Ensure timestamps strictly advance

---

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for layer-by-layer details
- Read [CONSTITUTION.md](./CONSTITUTION.md) for governance rules
- Explore test files in `src/__tests__/` for more examples
