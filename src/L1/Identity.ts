
// src/L1/Identity.ts
import { verifySignature, Ed25519PublicKey, Signature } from '../L0/Crypto';

export type PrincipalId = string; // DID or UUID (derived from PubKey?)

export interface Principal {
    id: PrincipalId;
    publicKey: Ed25519PublicKey; // PEM string
    type: 'INDIVIDUAL' | 'ORGANIZATION' | 'AGENT';
    validFrom: number;
    validUntil: number;
}

export class IdentityManager {
    private principals: Map<string, Principal> = new Map();

    register(p: Principal) {
        // Validation?
        this.principals.set(p.id, p);
    }

    get(id: string): Principal | undefined {
        return this.principals.get(id);
    }
}

// --- Delegation ---
export interface Delegation {
    delegator: PrincipalId;
    delegate: PrincipalId;
    scope: string; // "Layer:Resource:Action"
    validUntil: number; // Wall clock time
    signature: Signature; // Sign(delegator + delegate + scope + validUntil)
}

export class DelegationEngine {
    private delegations: Delegation[] = [];

    constructor(private identityManager: IdentityManager) { }

    grant(d: Delegation): boolean {
        // Verify Signature
        const delegator = this.identityManager.get(d.delegator);
        if (!delegator) return false;

        // Data that was signed: "delegator:delegate:scope:validUntil"
        const data = `${d.delegator}:${d.delegate}:${d.scope}:${d.validUntil}`;

        if (!verifySignature(data, d.signature, delegator.publicKey)) {
            return false;
        }

        this.delegations.push(d);
        return true;
    }

    isAuthorized(actor: PrincipalId, resource: string, owner: PrincipalId): boolean {
        if (actor === owner) return true;

        const now = Date.now(); // L0 Time lookup needed? passed in?
        // Using Date.now() for simplicity in this engine logic, 
        // but strict system should pass LogicalTimestamp or L0 Time.

        const validDelegation = this.delegations.find(d =>
            d.delegator === owner &&
            d.delegate === actor &&
            d.scope === resource &&
            d.validUntil > now
        );

        return !!validDelegation;
    }
}
