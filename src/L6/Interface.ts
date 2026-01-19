import { StateModel } from '../L2/State.js';
import type { Intent } from '../L2/State.js';
import { AuditLog } from '../L5/Audit.js';
import { verifySignature, signData, hash } from '../L0/Crypto.js';
import type { KeyPair, Ed25519PublicKey } from '../L0/Crypto.js';

export class GovernanceInterface {
    constructor(private state: StateModel, private log: AuditLog) { }

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

    constructor(private state: StateModel) { }

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

        // Apply as Shadow State (Section 7.2)
        this.state.applyTrusted(
            { metricId: packet.payload.metricId, value: packet.payload.value },
            packet.payload.timestamp,
            `${packet.sourceKernel}:${packet.payload.subjectId}`,
            `EXT_SYNC:${packet.payload.ledgerHash}`
        );

        return true;
    }
}
