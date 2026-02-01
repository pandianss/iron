# IRON: Institutional Runtime for Operational Norms

**A Behavioural Operating System for Governance**

---

## What is IRON?

IRON is a **deterministic governance kernel** that enforces business logic with the rigor of physical law. It is not a policy engine, a workflow tool, or a compliance checklist. It is a **structural constraint system** that makes certain behaviours impossible, others costly, and all actions permanently accountable.

### Core Principle

> **Behaviour is shaped by structure, not by persuasion.**

IRON does not rely on training, incentives, or punishment. It alters the decision environment to make correct behaviour feel natural and shortcuts feel structurally heavy.

---

## Key Features

### 1. **Impossibility Before Deterrence**
Invalid actions are **structurally rejected** before execution. No warnings, no after-the-fact correction—just `Error("Structural Violation")`.

### 2. **Irrevocable Responsibility Binding**
Every action is cryptographically bound to an identity. Responsibility cannot be transferred, diffused, or retroactively reassigned.

### 3. **Behavioural Memory**
The system retains an immutable trace of **all attempts**, including rejections. Deviation leaves a durable, visible record.

### 4. **Targeted Friction**
High-impact actions (e.g., Protocol activation, irreversible mutations) require deliberation, plurality, or temporal spacing.

### 5. **Continuity Bias**
Actions that "mortgage the future" face higher structural resistance. The system privileges long-term consistency over short-term optimization.

---

## Architecture

IRON is organized into **6 layers** (L0-L5), each enforcing a specific constitutional principle:

```
L5: Audit          → Immutable Evidence Chain
L4: Protocol       → Reactive Business Logic
L3: Simulation     → State Projection
L2: State          → Truth Store (Merkle Chain)
L1: Identity       → Cryptographic Entities & Authority
L0: Kernel         → Guards, Invariants, Budget
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.

---

## Quick Start

### Installation

```bash
npm install
```

### Running Tests

```bash
npm test
```

### Example: Creating a Governed Action

```typescript
import { GovernanceKernel } from './src/kernel-core/Kernel.js';
import { ActionFactory } from './src/kernel-core/L2/ActionFactory.js';
import { generateKeyPair } from './src/kernel-core/L0/Crypto.js';

// 1. Generate Identity
const keys = generateKeyPair();

// 2. Create Action
const action = ActionFactory.create(
    'wallet.alice.balance',  // metricId
    100,                     // value
    'user.alice',            // initiator
    keys.privateKey
);

// 3. Execute via Kernel
const commit = await kernel.execute(action);

console.log(`Committed: ${commit.newStateHash}`);
```

---

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Layer-by-layer breakdown
- **[CONSTITUTION.md](./CONSTITUTION.md)**: Formal governance rules
- **[GUIDE.md](./GUIDE.md)**: Developer guide and patterns

---

## Philosophy

IRON is built on the **Behavioural Constitution**, a set of design principles that prioritize:

1. **Structural Correction** over moral instruction
2. **Collective Cognition** for high-impact actions
3. **Forced Articulation** before execution
4. **Normalized Adversarial Challenge** (dissent without courage)
5. **Deliberate Evolution Only** (no silent drift)

See [CONSTITUTION.md](./CONSTITUTION.md) for the full constitutional framework.

---

## Use Cases

- **Financial Systems**: Enforce budget constraints, multi-signature approvals, and audit trails
- **Supply Chain**: Immutable provenance tracking with cryptographic evidence
- **Governance Platforms**: Protocol-driven decision-making with deliberation friction
- **Healthcare**: HIPAA-compliant access control with irrevocable audit logs

---

## License

MIT

---

## Contributing

IRON is designed to be **adversarially audited**. If you find a structural loophole, exploit, or ambiguity, please open an issue with:

1. The constitutional principle violated
2. A minimal reproduction
3. A proposed structural fix (not a policy patch)

---

**Built with the conviction that institutions should be designed like operating systems: deterministic, auditable, and incorruptible.**
