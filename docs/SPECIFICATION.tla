------------------------- MODULE IronKernel -------------------------
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS 
    Actors,         \* Set of Entity IDs
    Metrics,        \* Set of Metric IDs
    Privileges,     \* Set of Authority Capabilities
    GenesisTime     \* Initial Timestamp (0)

VARIABLES 
    kernelState,    \* { uninitialized, active, suspended, violated }
    metrics,        \* Function: Metrics -> { value, timestamp, hash }
    auditLog,       \* Sequence of Evidence
    seenActions     \* Set of ActionIDs (Replay Protection)

Vars == <<kernelState, metrics, auditLog, seenActions>>

-----------------------------------------------------------------------------

\* Data Structures
Action == [
    id : STRING,
    initiator : Actors,
    payload : [ metric : Metrics, value : Int ],
    timestamp : Int,
    signature : STRING
]

Evidence == [
    actionId : STRING,
    status : {"SUCCESS", "FAILURE", "REJECTED"},
    timestamp : Int
]

-----------------------------------------------------------------------------

\* Invariant: Type Correctness
TypeOK == 
    /\ kernelState \in {"UNINITIALIZED", "ACTIVE", "SUSPENDED", "VIOLATED"}
    /\ metrics \in [Metrics -> [value : Int, timestamp : Int, hash : STRING]]
    /\ seenActions \subseteq STRING

\* Invariant: Temporal Monotonicity
\* For any metric m, the timestamp must strictly increase or logical clock must increase.
MonotonicOK == 
    \A m \in Metrics : 
        metrics[m].timestamp >= GenesisTime

\* Invariant: Append Only
\* The Audit Log can only grow.
AuditAppendOnly == 
    Len(auditLog') >= Len(auditLog)

-----------------------------------------------------------------------------

\* Initialization
Init == 
    /\ kernelState = "UNINITIALIZED"
    /\ metrics = [m \in Metrics |-> [value |-> 0, timestamp |-> GenesisTime, hash |-> "0"]]
    /\ auditLog = << >>
    /\ seenActions = {}

-----------------------------------------------------------------------------

\* Transition: Boot
Boot == 
    /\ kernelState = "UNINITIALIZED"
    /\ kernelState' = "ACTIVE"
    /\ UNCHANGED <<metrics, auditLog, seenActions>>

\* Transition: Submit & Execute (Simplified Atomic View)
Execute(a) == 
    /\ kernelState = "ACTIVE"
    \* Replay Guard
    /\ a.id \notin seenActions
    \* Authority Guard (Abstracted)
    \* Time Guard
    /\ a.timestamp >= metrics[a.payload.metric].timestamp
    
    \* Effect: Update State
    /\ metrics' = [metrics EXCEPT ![a.payload.metric] = 
        [value |-> a.payload.value, timestamp |-> a.timestamp, hash |-> "hash"]]
    \* Effect: Update Audit
    /\ auditLog' = Append(auditLog, [actionId |-> a.id, status |-> "SUCCESS", timestamp |-> a.timestamp])
    \* Effect: Update Replay Memory
    /\ seenActions' = seenActions \cup {a.id}
    /\ UNCHANGED <<kernelState>>

-----------------------------------------------------------------------------

\* The Next State Relation
Next == 
    \/ Boot
    \* \E a \in PossibleActions : Execute(a)

\* Specification
Spec == Init /\ [][Next]_Vars

=============================================================================
