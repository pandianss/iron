
import { ProtocolEngine } from '../../kernel-core/L4/Protocol.js';
import { StateModel } from '../../kernel-core/L2/State.js';
import { IdentityManager } from '../../kernel-core/L1/Identity.js';
import { Sovereign_Silence_Protocol, Sovereign_Silence_Escalation } from './Protocols/SovereignSilence.js';
import { Medical_Emergency_Protocol } from './Protocols/MedicalEmergency.js';

export class IronWalletInterface {
    constructor(
        private engine: ProtocolEngine,
        private state: StateModel,
        private identity: IdentityManager
    ) { }

    /**
     * Bootstraps the Wallet with necessary protocols for a new User.
     */
    async initializeWallet() {
        // Idempotent registration
        if (!this.engine.isRegistered(Sovereign_Silence_Protocol.id!)) {
            this.engine.propose(Sovereign_Silence_Protocol);
        }
        if (!this.engine.isRegistered(Sovereign_Silence_Escalation.id!)) {
            this.engine.propose(Sovereign_Silence_Escalation);
        }
        if (!this.engine.isRegistered(Medical_Emergency_Protocol.id!)) {
            this.engine.propose(Medical_Emergency_Protocol);
        }

        // In a real app, we would auto-ratify/activate here based on user signature
        // For now, we assume implicit activation for the solution
        this.engine.ratify(Sovereign_Silence_Protocol.id!, 'user-sig-1');
        this.engine.activate(Sovereign_Silence_Protocol.id!);

        this.engine.ratify(Medical_Emergency_Protocol.id!, 'user-sig-1');
        this.engine.activate(Medical_Emergency_Protocol.id!);
    }

    /**
     * The Heartbeat.
     * Call this when the user opens the app (Lazarus Trigger).
     * Resets any 'WARNING' or 'PROVISIONAL' states in the Silence Protocol.
     */
    async proofOfLife(userId: string, signature: string) {
        // 1. Validate Signature (Identity Layer)
        // this.identity.verify(userId, signature)... 

        // 2. Telemetry (L2)
        // Update 'last_seen' metric
        await this.state.apply({
            actionId: 'sys.lazarus.' + Date.now(),
            initiator: userId,
            payload: { metricId: 'user.activity.days_since_last_seen', value: 0 },
            timestamp: Date.now().toString(),
            expiresAt: '0',
            signature: signature
        }); // Casting for brevity in sketch

        // 3. Status Reset (L4)
        // If state was WARNING, finding Proof of Life should reset it in the next Tick
        // This is implicit in the Protocol logic (Preconditions will fail for 'Warning' if days < 30)
        // But we explicitly force state to ACTIVE to be safe/responsive
        await this.state.apply({
            actionId: 'sys.reset.' + Date.now(),
            initiator: userId,
            payload: { metricId: 'user.authority.state', value: 'ACTIVE' },
            timestamp: Date.now().toString(),
            expiresAt: '0',
            signature: signature
        });
    }

    /**
     * Nominee claims an emergency.
     */
    async declareEmergency(nomineeId: string, targetUserId: string) {
        // Sets the request flag.
        // The MedicalEmergency Protocol (L4) will pick this up + Quorum to decide outcome.
        await this.state.apply({
            actionId: 'nominee.req.' + Date.now(),
            initiator: nomineeId,
            payload: { metricId: 'access.request.emergency_active', value: true },
            timestamp: Date.now().toString(),
            expiresAt: '0',
            signature: 'nominee_sig'
        });
    }

    /**
     * Get current status of the Sovereign.
     */
    getStatus(userId: string) {
        // Read directly from L2 Truth
        // In a real implementation this might check L4 Protocol Lifecycle too
        return {
            state: 'ACTIVE', // Mock, would fetch from state.getMetric
            warnings: []
        };
    }
}
