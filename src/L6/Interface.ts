import { StateModel } from '../L2/State.js';
import type { Intent } from '../L2/State.js';
import { AuditLog } from '../L5/Audit.js';
import { verifySignature, signData, hash } from '../L0/Crypto.js';
import type { KeyPair, Ed25519PublicKey } from '../L0/Crypto.js';
import { GovernanceKernel } from '../Kernel.js';
import { Budget, BudgetType } from '../L0/Kernel.js';

export class GovernanceInterface {
    constructor(
        private kernel: GovernanceKernel,
        private state: StateModel,
        private log: AuditLog
    ) { }

    public getTruth(id: string) { return this.state.get(id); }

    public getAuditTrail(id: string) {
        return this.log.getHistory()
            .filter(e => e.intent.payload.metricId === id)
            .map(e => ({
                value: e.intent.payload.value,
                timestamp: e.intent.timestamp,
                proof: e.hash
            }));
    }

    // The Single Door: All Writes must go through Kernel
    public submit(intent: Intent, options: { budgetLimit?: number } = {}) {
        const budget = new Budget(BudgetType.ENERGY, options.budgetLimit || 100);
        return this.kernel.execute(intent, budget);
    }
}

export interface AttestationPacket {
    payload: {
        metricId: string;
        value: any;
        timestamp: string;
        ledgerHash: string;
        subjectId: string;
    };
    sourceKernel: string;
    signature: string;
}

export class AttestationAPI {
    constructor(private log: AuditLog, private kernelKeys: KeyPair, private kernelId: string) { }

    public generateAttestation(intent: Intent): AttestationPacket {
        const history = this.log.getHistory();
        const entry = history.find(e => e.intent.intentId === intent.intentId);

        const payload = {
            metricId: intent.payload.metricId,
            value: intent.payload.value,
            timestamp: intent.timestamp,
            ledgerHash: entry ? entry.hash : 'unknown',
            subjectId: intent.principalId
        };

        const dataToSign = JSON.stringify(payload);
        const signature = signData(dataToSign, this.kernelKeys.privateKey);

        return {
            payload,
            sourceKernel: this.kernelId,
            signature: signature
        };
    }
}

export class FederationBridge {
    private partners: Map<string, Ed25519PublicKey> = new Map();

    constructor(
        private kernel: GovernanceKernel,
        private bridgeIdentity: { id: string; key: KeyPair }
    ) { }

    public registerPartner(alias: string, publicKey: Ed25519PublicKey) {
        this.partners.set(alias, publicKey);
    }

    public ingestAttestation(packet: AttestationPacket): boolean {
        const pubKey = this.partners.get(packet.sourceKernel);
        if (!pubKey) {
            console.warn(`Federation Reject: Unknown source kernel ${packet.sourceKernel}`);
            return false;
        }

        // Verify Partner Signature (C-8: External Attestation)
        const dataToVerify = JSON.stringify(packet.payload);
        if (!verifySignature(dataToVerify, packet.signature, pubKey)) {
            console.warn(`Federation Reject: Invalid Signature from ${packet.sourceKernel}`);
            return false;
        }

        // Construct Synthetic Intent signed by Bridge
        // The Bridge attests: "I verified X from Y"
        const intentId = hash(`ext:${packet.sourceKernel}:${packet.payload.ledgerHash}`);

        // We need to sign exactly what IntentFactory would sign or what Guard expects.
        // Guard expects: data = `${intentId}:${principalId}:${JSON.stringify(payload)}:${timestamp}:${expiresAt}`;
        const payload = {
            metricId: packet.payload.metricId,
            value: packet.payload.value,
            _meta: { source: packet.sourceKernel, proof: packet.payload.ledgerHash }
        };
        const timestamp = packet.payload.timestamp;
        const expiresAt = '0';
        const principalId = this.bridgeIdentity.id;

        const dataToSign = `${intentId}:${principalId}:${JSON.stringify(payload)}:${timestamp}:${expiresAt}`;
        const signature = signData(dataToSign, this.bridgeIdentity.key.privateKey);

        const foreignIntent: Intent = {
            intentId,
            principalId,
            payload,
            timestamp,
            expiresAt,
            signature
        };

        try {
            const aid = this.kernel.submitAttempt(principalId, 'SYSTEM', foreignIntent);

            const guard = this.kernel.guardAttempt(aid);
            if (guard === 'REJECTED') {
                // Peek at audit log or get reason? Kernel doesn't return reason on guardAttempt.
                // But we can check status? No, attempt is now REJECTED.
                console.warn(`Federation Sync Rejected by Kernel Guard. Check Audit Log.`);
                return false;
            }

            this.kernel.commitAttempt(aid, new Budget(BudgetType.ENERGY, 100));
            return true;
        } catch (e) {
            console.warn(`Federation Sync Failed:`, e);
            return false;
        }
    }
}
