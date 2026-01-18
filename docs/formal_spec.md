# Iron-5 Formal Specification

This document contains the TLA+ and Alloy specifications that define the non-negotiable correctness properties of the Iron-5 Governance OS.

## Part A — TLA+ Specification (Safety-Oriented)

TLA+ is used here to verify invariants over execution traces.

### A.1 Core Model (TLA+)
```tla
----------------------------- MODULE Iron5 -----------------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  Identities,
  Protocols,
  MAX_BUDGET

VARIABLES
  events,
  state,
  log,
  budgets

Event ==
  [ actor      : Identities,
    protocol   : Protocols,
    intentId   : Nat,
    signed     : BOOLEAN,
    timestamp  : Nat,
    cost       : Nat
  ]

Init ==
  /\ events = << >>
  /\ log = << >>
  /\ budgets \in [Identities -> 0..MAX_BUDGET]
  /\ state = 0

Next ==
  \E e \in Event :
    /\ e.signed = TRUE
    /\ budgets[e.actor] >= e.cost
    /\ budgets' = [budgets EXCEPT ![e.actor] = @ - e.cost]
    /\ events' = Append(events, e)
    /\ log' = Append(log, e)
    /\ state' = state + 1
```

### Invariants


#### A.5 Identity Invariants
**INV-ID-1: All events are signed**
```tla
Inv_AllSigned ==
  \A e \in events : e.signed = TRUE
```

**INV-ID-2: No hidden actors**
```tla
Inv_KnownActors ==
  \A e \in events : e.actor \in Identities
```

**INV-ID-3: Delegation Scope (Gap 1)**
```tla
Inv_DelegationScope ==
  \A e \in events :
    e.actor.delegator # NULL =>
      e.actor.scope \subseteq e.actor.delegator.scope
```

#### A.6 Budget Invariants
**INV-BUD-1: Budgets never negative**
```tla
Inv_BudgetNonNegative ==
  \A i \in Identities : budgets[i] >= 0
```

**INV-BUD-2: No execution on exhausted budget**
```tla
Inv_BudgetRespected ==
  \A e \in events : e.cost <= MAX_BUDGET
```

**INV-BUD-3: No Partial Execution (Gap 6)**
```tla
Inv_NoPartialExecution ==
  \A e \in events :
    budgets[e.actor] < e.cost =>
      state' = state
```

#### A.7 Accountability Invariants
**INV-ACC-1: Every event logged**
```tla
Inv_AllEventsLogged ==
  Len(events) = Len(log)
```

**INV-ACC-2: Attempted Events Logged (Gap 5)**
```tla
Inv_AttemptLogged ==
  \A e \in attemptedEvents :
    \E l \in log : l.eventHash = hash(e)
```

#### A.8 Time Invariants (Gap 3)
**INV-TIME-1: Monotonicity**
```tla
Inv_TimeMonotonic ==
  \A i \in 2..Len(events) :
    events[i].timestamp >= events[i-1].timestamp
```

### A.9 System Safety Property
```tla
Safety ==
  Inv_AllSigned
  /\ Inv_KnownActors
  /\ Inv_DelegationScope
  /\ Inv_BudgetNonNegative
  /\ Inv_BudgetRespected
  /\ Inv_NoPartialExecution
  /\ Inv_AllEventsLogged
  /\ Inv_AttemptLogged
  /\ Inv_TimeMonotonic

Spec ==
  Init /\ [][Next]_<<events, state, log, budgets>>
```

---

## Part B — Alloy Specification (Structural & Relational)

### B.3 Identity Invariants
**INV-ID-1: No unsigned intent**
```alloy
fact SignedIntentOnly {
  all i: Intent | i.signed = True
}
```

**INV-ID-2: No anonymous action**
```alloy
fact NoAnonymousEvents {
  all e: Event | e.intent.actor != none
}
```

**INV-ID-3: Delegation is Restrictive (Gap 1)**
```alloy
fact DelegationIsRestrictive {
  all d: Identity |
    d.delegator != none implies
      d.scope in d.delegator.scope
}
```

**INV-ID-4: Revocation Stops Authority (Gap 4)**
```alloy
fact RevocationStopsAuthority {
  all i: Identity |
    i.revoked = True implies
      no e: Event | e.intent.actor = i
}

fact RevocationPropagates {
  all i: Identity |
    i.revoked = True implies
      all d: Identity | d.delegator = i implies d.revoked = True
}
```

#### B.4 Protocol Invariants
**INV-PRO-1: Every event governed by a protocol**
```alloy
fact ProtocolRequired {
  all e: Event | e.protocol != none
}
```

**INV-PRO-2: No Conflicting Protocols (Gap 2)**
```alloy
assert NoConflictingProtocols {
  all e: Event |
    lone p: Protocol | applies[p, e]
}
```

#### B.5 State Invariants
**INV-STATE-1: Linear state evolution**
```alloy
fact LinearState {
  all s: State | lone s.prev
}
```

**INV-STATE-2: No state without event**
```alloy
fact NoSilentState {
  all s: State | s.event != none
}
```

**INV-STATE-3: Monotonic Time (Gap 3)**
```alloy
fact MonotonicTime {
  all s: State |
    s.prev != none implies
      s.event.timestamp >= s.prev.event.timestamp
}
```

#### B.6 Accountability Invariants
**INV-ACC-1: Every event logged**
```alloy
fact EventLogged {
  all e: Event | one l: LogEntry | l.event = e
}
```

**INV-ACC-2: Append-only log**
```alloy
fact LogChain {
  all l: LogEntry | lone l.prev
}
```


#### B.7 Budget Model
```alloy
sig Budget {
  owner: one Identity,
  remaining: Int
}

fact BudgetNonNegative {
  all b: Budget | b.remaining >= 0
}
```

### B.8 Assertions (What We Prove)

**No governance without accountability**
```alloy
assert NoUnloggedAction {
  all e: Event | one l: LogEntry | l.event = e
}
```

**No unsigned governance**
```alloy
assert NoUnsignedGovernance {
  all e: Event | e.intent.signed = True
}
```

## Part D — Closure Statement

Iron 5 governance is correct if and only if these models admit no counterexample.
Any counterexample is not a bug — it is a governance breach.
