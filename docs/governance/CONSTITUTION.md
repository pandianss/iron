# IRON Constitution

**(Closed Governance Operating System)**

## Preamble — Purpose and Closure

IRON is a closed governance operating system. It exists to make authority, obligation, and accountability mechanically enforceable for individuals and enterprises.

IRON is correct if and only if:
1. All authority flows from identity.
2. All effects pass through the kernel.
3. All state change is logged.
4. No protocol can govern IRON itself.

IRON SHALL be recognized as a constitutional machine. It is not a framework for development, but a law for execution. Every implementation SHALL be bound by this Constitution without exception.

---

## Article I — Constitutional Objects

### Section 1.1 — Constitutional Enumeration
The IRON system SHALL consist of exactly the following constitutional objects:
1. **The Kernel** (Executive Authority)
2. **The Identity System** (Principal Algebra)
3. **The Governed Truth** (State Materialization)
4. **The Execution Law** (Formal Sequence)
5. **The Protocol Capability Constitution** (Boundary Law)
6. **The Invariant Set** (Non-Negotiable Properties)

No other object, layer, service, or authority SHALL possess governing power within IRON.

### Section 1.2 — Supremacy and Exhaustiveness
In case of conflict between any system element and a constitutional object, the constitutional object SHALL prevail. No additional governing object, power surface, or authority source SHALL be introduced beyond those enumerated. Any implementation admitting models not permitted by these objects is non-compliant.

---

## Article II — The Kernel

### Section 2.1 — Sole Executive Authority
The kernel is the constitutional core of IRON and SHALL be the sole executive authority within the system. All governance, execution, and state transition SHALL be mediated exclusively by the kernel.

### Section 2.2 — Exclusivity of Power
The kernel alone SHALL be permitted to:
- Recognize identities and derive authority.
- Generate monotonic time and maintain budgets.
- Install and execute isolated protocols.
- Validate and apply mutations to governed state.
- Append irreversible accountability records.

### Section 2.3 — Kernel Isolation and Integrity
The kernel SHALL operate in isolation, protecting its internal state and execution domain from protocol interference. Any modification of kernel behavior MUST itself be a kernel-governed act.

---

## Article III — Identity and Authority

### Section 3.1 — Constitutional Status of Identity
Identity is a constitutional primitive. All authority, responsibility, and budget SHALL be bound to identities recognized by the kernel. Federated and external principals SHALL be represented exclusively through local Proxy Identities owned and managed by the local kernel. There are no implicit, virtual, or truly external identities within IRON.

### Section 3.2 — Authority as Derivable Property
Authority SHALL NOT be a stored possession; it is a kernel-derived property. The kernel SHALL derive effective authority solely from intrinsic scope, valid delegation, and revocation rules. Root identities established at system genesis SHALL serve as the terminal, non-revocable anchors for all derivation; their initial state MUST conform to the Invariant Set. Revocation is terminal and absorbing—no identity MAY act without currently derivable authority.

### Section 3.3 — Delegation and Non-Escalation
Delegation SHALL be explicit, restrictive, and monotonic. No identity MAY delegate more power than it currently holds. No execution trace SHALL exist in which authority is created or expanded outside kernel-recognized derivation.

---

## Article IV — State and Governed Truth

### Section 4.1 — Materialization of Acts
Governed state (Truth) is the persistent materialization of all committed governance acts. IRON SHALL recognize only state changes that are kernel-mediated and accountability-linked.

### Section 4.2 — Exclusivity of Truth
The Kernel SHALL be the sole authority for maintaining Governed Truth. Any representation of state that diverges from the Kernel’s internal stores is constitutionally invalid.

### Section 4.3 — Isolation of Governed Truth
The Kernel SHALL prevent direct access to the Truth Store. All modifications SHALL occur exclusively through the Commit phase of the Execution Law. Protocols SHALL observe only kernel-supplied snapshots of truth.

---

## Article V — Execution Law

### Section 5.1 — The Mandatory Cycle
Every governance act SHALL progress through the mandatory, ordered sequence:
**Attempt → Guard → Execute → Commit**

### Section 5.2 — Phase Constraints
- **Attempt**: Materialization of intent and binding of terminal identity and time.
- **Guard**: Sole evaluation of authority, budgets, and protocol validity.
- **Execute**: Isolated, deterministic evaluation of protocol logic.
- **Commit**: Atomic application of mutations and accountability binding.

### Section 5.3 — Non-Bypassability
There SHALL exist no code path capable of mutating state outside this law. Rejection MUST be logged, and failure MUST preserve state consistency without side effects.

---

## Article VI — Time, Budgets, and Accountability

### Section 6.1 — Temporal Order
The kernel SHALL be the sole source of monotonic, totally ordered time. Every Attempt, rejection, and Commit SHALL be bound to kernel time.

### Section 6.2 — Constitutional Budgets
Every identity SHALL be bound to a non-negative, kernel-maintained budget. No Attempt SHALL be committed unless sufficient budget exists to cover the action cost. Budgets SHALL NOT underflow. Budgets SHALL NOT be incremented or "refilled" by protocol-proposed mutations; they MAY only be modified through dedicated, kernel-governed Identity Management transitions.

### Section 6.3 — Irreversible Accountability
The kernel SHALL maintain an append-only, cryptographically sealed accountability log. Every state transition MUST be reconstructible from the log. No Commit SHALL occur without a corresponding record.

---

## Article VII — Protocols and Capability Law

### Section 7.1 — Constitutional Boundaries
Protocols are governed computational instruments with no authority or identity. They SHALL execute only within kernel-controlled isolation.

### Section 7.2 — Resource and Mutation Limits
Protocols MAY read or write only kernel-exported resource classes (Metrics, Commitments, Assets, Access, Local State). They SHALL NOT access kernel internals, identity state, or time.

### Section 7.3 — Determinism and Inspectability
Every protocol SHALL be deterministic, total, and statically inspectable. Protocol execution SHALL terminate within mechanical limits defined and enforced by the kernel. Any protocol that fails to terminate or exceeds resource bounds during execution SHALL be terminally rejected. Black-box protocols or those with non-deterministic side effects are constitutionally forbidden.

---

## Article VIII — Closure and Supremacy

### Section 8.1 — Closure Law
The IRON system is closed. No operator MAY create new authority surfaces, bypass execution flow, or modify logs. Any system failing these constraints is NOT IRON.

### Section 8.2 — Interpretation
In cases of conflict, the most restrictive interpretation of this Constitution SHALL prevail. The **Annex A Formal Model** SHALL be the final arbiter of correctness; the Reference Kernel Implementation exists only to realize that model. Mechanical divergence of the implementation from the formal model renders the implementation constitutionally invalid.

---

## Article IX — Amendments and Finality

### Section 9.1 — Admissible Amendments
Only clarifications, formalizations, and corrections of inconsistency are admissible. No amendment MAY expand the governing surface or grant new powers to any component.

### Section 9.2 — Closure Clause
This Constitution establishes the terminal governance boundaries for IRON. It is a standalone constitutional object, fixed and closed.

---

## Annexes — Formal Binding

### Annex A — Formal State Machine
The core execution logic is bound to [Kernel.ts](file:///e:/projects/iron/iron/src/Kernel.ts).

### Annex B — Identity Algebra
The rules of derivation and capability matching are bound to [Identity.ts](file:///e:/projects/iron/iron/src/L1/Identity.ts).

### Annex C — Protocol Capability Constitution
Mutation boundaries are bound to [Protocol.ts](file:///e:/projects/iron/iron/src/L4/Protocol.ts).

### Annex D — Non-Negotiable Invariants
The following invariants SHALL be mechanically enforced:
- **No Unsigned Authority**: Implicit actors are forbidden.
- **No Unauthorized Mutation**: Escaped side-effects are invalid.
- **No Identity Resurrection**: Revocation is eternally terminal.
- **No Log Mutation**: History is immutable and append-only.
- **No Budget Underflow**: Scarcity is mechanically enforced.
- **No Non-Kernel Truth**: State exists only via Commit.

### Annex E — Compliance Contract
Verification of this Constitution SHALL be performed by the [Compliance Suite](file:///e:/projects/iron/iron/src/__tests__/Compliance.test.ts).
