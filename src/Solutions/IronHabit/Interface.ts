
import { ProtocolEngine } from '../../kernel-core/L4/Protocol.js';
import { StateModel } from '../../kernel-core/L2/State.js';
import { IdentityManager } from '../../kernel-core/L1/Identity.js';
import { Daily_Journal_Protocol, Rest_Day_Protocol } from './Protocols/DailyHabit.js';

export class IronHabitInterface {
    constructor(
        private engine: ProtocolEngine,
        private state: StateModel,
        private identity: IdentityManager
    ) { }

    /**
     * User accepts the "Discipline Contract".
     */
    async startDiscipline() {
        // Idempotent: Propose + Ratify + Activate
        // 1. Journal
        if (!this.engine.isRegistered(Daily_Journal_Protocol.id!)) {
            this.engine.propose(Daily_Journal_Protocol);
            this.engine.ratify(Daily_Journal_Protocol.id!, 'TRUSTED'); // Mock sig
            this.engine.activate(Daily_Journal_Protocol.id!);
        }

        // 2. Rest Budget
        if (!this.engine.isRegistered(Rest_Day_Protocol.id!)) {
            this.engine.propose(Rest_Day_Protocol);
            this.engine.ratify(Rest_Day_Protocol.id!, 'TRUSTED');
            this.engine.activate(Rest_Day_Protocol.id!);
        }
    }

    /**
     * The Daily Act.
     * Proof is a string (URL, Hash, or Metadata). 
     * In a real system, verification logic would run here or inside the "Predicate".
     */
    async checkIn(userId: string, proof: string) {
        // 1. Send Action to L2
        // This implicitly triggers the "Daily Journal" protocol execution if conditions met
        // For simulation, we define the L2 Action.
        const intent = {
            actionId: `habit.chk.${Date.now()}`,
            initiator: userId,
            payload: {
                metricId: 'habit.journal.check_in',
                value: proof, // The "Proof"
                protocolId: Daily_Journal_Protocol.id // Bind to Protocol
            },
            timestamp: Date.now().toString(),
            expiresAt: '0',
            signature: 'sig-' + proof
        };

        await this.state.apply(intent as any);

        // Note: The 'Execution' part of L4 (mutating streak +1) happens 
        // IF the L4 Engine is hooked into `state.apply()`.
        // In the closed system refactor, `state.apply` handles basic metrics, 
        // but complex Protocol Execution (Rule-based mutations) typically requires
        // `engine.execute(intent)`.
        // We assume `state.apply` delegates to `engine` or `engine` observers `state`.
        // For this Solution Interface, we will explicitly simulate the *outcome* 
        // via applyTrusted for the Unit Test, as the full L4 hookup requires the Kernel loop.

        // If we were fully integrated:
        // engine.evaluate(Daily_Journal_Protocol, intent) -> Returns mutations
        // state.applyMutations(mutations)
    }

    /**
     * Spending a Token.
     */
    async skipDay(userId: string) {
        this.state.apply({
            actionId: `habit.skip.${Date.now()}`,
            initiator: userId,
            payload: {
                metricId: 'habit.journal.skip',
                value: true,
                protocolId: Rest_Day_Protocol.id
            },
            timestamp: Date.now().toString(),
            expiresAt: '0',
            signature: 'skip-sig'
        });
    }
}
