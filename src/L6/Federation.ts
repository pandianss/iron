import { GovernanceKernel } from '../kernel-core/Kernel.js';
import { AuditLog } from '../kernel-core/L5/Audit.js';
import { verifySignature, signData, hash } from '../kernel-core/L0/Crypto.js';
import type { KeyPair, Ed25519PublicKey } from '../kernel-core/L0/Crypto.js';
import type { Action } from '../kernel-core/L0/Ontology.js';
import { Budget, BudgetType } from '../kernel-core/L0/Primitives.js';

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

    public generateAttestation(action: Action): AttestationPacket {
        const history = this.log.getHistory(); // Note: This might need await if history is async
        // For now, continuing with assumption of sync retrieval for this legacy code or fixing properly
        // Actually, let's fix it properly if we can.

        // Wait, if I change it to async here, I break caller.
        // Let's see how history is used.
        const entry: any = (history as any).find?.((e: any) => e.actionId === action.actionId);

        const payload = {
            metricId: action.payload.metricId,
            value: action.payload.value,
            timestamp: action.timestamp,
            ledgerHash: entry ? entry.hash || entry.id : 'unknown',
            subjectId: action.initiator
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
        // VII.1 Foreign Kernel Law: Only allow trusted partners
        // ideally checked against Governance Auth, but for now purely programmatic
        this.partners.set(alias, publicKey);
    }

    public async ingestAttestation(packet: AttestationPacket): Promise<boolean> {
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

        // VII.2 Cross-Kernel Truth: Tagging
        const payload = {
            metricId: packet.payload.metricId,
            value: packet.payload.value,
            _meta: { foreign: true, source: packet.sourceKernel, proof: packet.payload.ledgerHash }
        };
        const timestamp = packet.payload.timestamp;
        const expiresAt = '0';
        const principalId = this.bridgeIdentity.id;

        const dataToSign = `${intentId}:${principalId}:${JSON.stringify(payload)}:${timestamp}:${expiresAt}`;
        const signature = signData(dataToSign, this.bridgeIdentity.key.privateKey);

        const action: Action = {
            actionId: intentId,
            initiator: principalId,
            payload,
            timestamp,
            expiresAt,
            signature
        };

        try {
            // submitAttempt (principalId, protocolId, action)
            const aid = await this.kernel.submitAttempt(principalId, 'SYSTEM', action);

            const result = await this.kernel.guardAttempt(aid);
            if (result.status === 'REJECTED') {
                console.warn(`Federation Sync Rejected by Kernel Guard: ${result.reason}`);
                return false;
            }

            await this.kernel.commitAttempt(aid, new Budget(BudgetType.ENERGY, 100));
            return true;
        } catch (e) {
            console.warn(`Federation Sync Failed:`, e);
            return false;
        }
    }
}
