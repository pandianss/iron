---------------- MODULE IronKernel ----------------

EXTENDS Integers, Sequences, FiniteSets, TLC

(* -- Constants & Types -- *)
CONSTANTS 
    Agents,         \* Set of all possible Entity IDs
    Metrics,        \* Set of all trackable metrics
    GenesisTime     \* Start time 

VARIABLES 
    state,          \* The map of Metric -> Value
    auditLog,       \* Sequence of Evidence
    time,           \* Current Logical Timestamp
    signatures      \* Set of valid signatures (Abstracted)

(* -- Definitions -- *)
ActionID == Strings
Value == Integers \cup Strings

TypeOK == 
    /\ state \in [Metrics -> Value]
    /\ auditLog \in Seq(Evidence)
    /\ time \in [wall: Nat, logical: Nat]

(* -- Safety Properties (Invariants) -- *)

\* 1. Monotonicity: Time never moves backwards
Monotonicity == 
    \A i \in 1..Len(auditLog)-1 : 
        auditLog[i+1].timestamp >= auditLog[i].timestamp

\* 2. Audit Integrity: The log is append-only
AppendOnly == 
    \A i \in 1..Len(auditLog) : 
        auditLog[i] = auditLog'[i] \* The past never changes in the Next state

\* 3. Authorisation: No state change without a valid signature
AuthInv == 
    \A m \in Metrics : 
        state[m] /= state'[m] => 
            \E act \in Actions : 
                /\ act.payload.metricId = m 
                /\ VerifySig(act.signature, act.initiator)

(* -- Transition Relation (The Kernel) -- *)

Execute(actor, metric, val, sig) ==
    /\ VerifySig(sig, actor)                \* Signature Guard
    /\ CheckAuth(actor, metric)             \* Authority Guard
    /\ state' = [state EXCEPT ![metric] = val]
    /\ auditLog' = Append(auditLog, [actor, metric, val, time])
    /\ time' = [time EXCEPT !.logical = time.logical + 1]

Next == 
    \E a \in Agents, m \in Metrics, v \in Value, s \in signatures :
        Execute(a, m, v, s)

Spec == Init /\ [][Next]_vars

=============================================================================
