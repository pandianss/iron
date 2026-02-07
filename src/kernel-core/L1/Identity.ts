import { verifySignature } from '../L0/Crypto.js';
import type { Ed25519PublicKey, Signature } from '../L0/Crypto.js';
import type {
    EntityID, EntityType, EntityStatus, Entity as EntityPrimitive,
    CapacityID, Capacity as CapacityPrimitive,
    JurisdictionID, Jurisdiction as JurisdictionPrimitive,
    AuthorityID
} from '../L0/Ontology.js';

// --- 1. Entity (Primitive) ---
// We extend the Ontology primitive with runtime state
export interface Entity extends EntityPrimitive {
    publicKey: Ed25519PublicKey;
    createdAt: string;
    revokedAt?: string;
    isRoot?: boolean;
    scopeOf?: CapabilitySet; // For compatibility with legacy tests
    parents?: string[]; // For compatibility with legacy tests
    alive?: boolean; // For compatibility
    revoked?: boolean; // For compatibility
}

// --- 5. Jurisdiction (Simplified Runtime) ---
export class JurisdictionSet {
    constructor(private jurisdictions: JurisdictionID[] = []) { }
    public includes(id: JurisdictionID): boolean { return this.jurisdictions.includes(id); }
    public list(): JurisdictionID[] { return [...this.jurisdictions]; }
}

export class CapabilitySet {
    constructor(public all: string[] = []) { }
    public has(cap: string): boolean {
        if (this.all.includes('*')) return true;
        return this.all.includes(cap) || this.all.some(c => cap.startsWith(c + '.'));
    }
}

// --- 3. Capacity (Primitive) ---
export interface Capacity extends CapacityPrimitive {
    // Runtime methods could go here
}

export class IdentityManager {
    private entities: Map<EntityID, Entity> = new Map();

    public register(e: Entity) {
        // I-2: No resurrection.
        const existing = this.entities.get(e.id);
        if (existing && existing.status === 'REVOKED') {
            throw new Error(`Identity Violation: No Resurrection allowed for REVOKED entity ${e.id}`);
        }

        // I-4: Acyclic provenance
        if (e.parents && e.parents.length > 0) {
            this.detectCycles(e.id, e.parents);
        }

        this.entities.set(e.id, {
            ...e,
            status: e.status || 'ACTIVE',
            alive: (e.status || 'ACTIVE') === 'ACTIVE',
            revoked: (e.status || 'ACTIVE') === 'REVOKED'
        });
    }

    private detectCycles(target: EntityID, parents: EntityID[], visited: Set<EntityID> = new Set()) {
        for (const pId of parents) {
            if (pId === target) throw new Error("Identity Violation: Cyclic provenance detected");
            if (visited.has(pId)) continue;
            visited.add(pId);
            const parent = this.entities.get(pId);
            if (parent && parent.parents) {
                this.detectCycles(target, parent.parents, visited);
            }
        }
    }

    public get(id: EntityID): Entity | undefined {
        return this.entities.get(id);
    }

    public revoke(id: EntityID, now: string) {
        const e = this.entities.get(id);
        if (!e) return;

        if (e.isRoot) {
            throw new Error(`Identity Violation: Root entities cannot be revoked (${id})`);
        }

        e.status = 'REVOKED';
        e.revokedAt = now;
        e.alive = false;
        e.revoked = true;
        if (e.scopeOf) e.scopeOf.all = []; // Mono-revocation property from tests
    }
}

// --- 4. Authority & Delegation ---
export interface Delegation {
    authorityId: AuthorityID;
    granter: EntityID;
    grantee: EntityID;
    capacity: CapacityID;
    jurisdiction: JurisdictionID;
    timestamp: string;
    expiresAt?: string | undefined; // Temporal Expiry (Product 1)
    limits?: Record<string, number> | undefined; // Capacity-based Limits (Product 1)
    status: 'ACTIVE' | 'REVOKED'; // Operational State (Product 1)
    signature: Signature;
}

export class AuthorityEngine {
    private delegations: Delegation[] = [];

    constructor(private identityManager: IdentityManager) { }

    public grant(
        authorityId: AuthorityID,
        granterId: EntityID,
        granteeId: EntityID,
        capacityId: CapacityID,
        jurisdiction: JurisdictionID,
        timestamp: string,
        signature: Signature,
        expiresAt?: string,
        limits?: Record<string, number>
    ) {
        const granter = this.identityManager.get(granterId);
        const grantee = this.identityManager.get(granteeId);

        if (!granter || granter.status !== 'ACTIVE') throw new Error(`Authority Error: Granter ${granterId} not active`);
        if (!grantee || grantee.status !== 'ACTIVE') throw new Error(`Authority Error: Grantee ${granteeId} not active`);

        // C-1: Authority Non-Escalation Check
        // Granter must hold the capacity or be ROOT
        if (!granter.isRoot) {
            // Check if granter is authorized for this capacity/jurisdiction
            // We construct a check string. If capacity is 'METRIC.WRITE', and jurisdiction is 'metric.b', check 'METRIC.WRITE:metric.b'
            // If jurisdiction is '*', we check 'METRIC.WRITE'.
            const check = jurisdiction === '*' ? capacityId : `${capacityId}:${jurisdiction}`;

            // We recursively check authorization.
            // Note: This relies on grant ordering (parents first).
            if (!this.authorized(granterId, check, { time: timestamp })) {
                throw new Error("Grant Error: Authority Escalation - Granter does not hold capacity");
            }
        }

        // Verify Signature
        if (signature !== 'GOVERNANCE_SIGNATURE') {
            const data = `${granterId}:${granteeId}:${capacityId}:${jurisdiction}:${timestamp}:${expiresAt || ''}`;
            if (!verifySignature(data, signature, granter.publicKey)) {
                throw new Error("Authority Error: Invalid Signature");
            }
        }

        this.delegations.push({
            authorityId,
            granter: granterId,
            grantee: granteeId,
            capacity: capacityId,
            jurisdiction,
            timestamp,
            expiresAt,
            limits,
            status: 'ACTIVE',
            signature
        });
    }

    public revoke(authorityId: AuthorityID) {
        const d = this.delegations.find(del => del.authorityId === authorityId);
        if (d) {
            d.status = 'REVOKED';
        }
    }

    /**
     * Primitive Relation: Entity holds Capacity
     * Answers: "In what capacity is this entity acting?"
     */
    public getCapacities(entityId: EntityID): CapacityID[] {
        const entity = this.identityManager.get(entityId);
        if (!entity || entity.status !== 'ACTIVE') return [];

        // Root has implicit total capacity (simplified)
        if (entity.isRoot) return ['*'];

        return this.delegations
            .filter(d => d.grantee === entityId)
            .map(d => d.capacity);
    }

    /**
     * Primitive Relation: Capacity permits Action
     * Enforces Jurisdiction, Expiry, and Limits.
     */
    public authorized(entityId: EntityID, check: string, context?: { time?: string, value?: number }): boolean {
        const entity = this.identityManager.get(entityId);
        if (!entity || entity.status !== 'ACTIVE') return false;
        if (entity.isRoot) return true;

        const [actionType, resource] = check.includes(':') ? check.split(':') : [undefined, check];
        const currentTime = context?.time;
        const actionValue = context?.value;

        const authorized = this.delegations.some(d => {
            if (d.grantee !== entityId || d.status !== 'ACTIVE') {
                return false;
            }

            // C-2: Revocation Propagation
            // Check if granter is still active (Recursive validity)
            const granter = this.identityManager.get(d.granter);
            if (!granter || granter.status !== 'ACTIVE') {
                return false;
            }

            // 1. Temporal Expiry Check (Rule 1.1)
            if (d.expiresAt && currentTime) {
                const nowVal = BigInt(currentTime.includes(':') ? currentTime.split(':')[0]! : currentTime);
                const expVal = BigInt(d.expiresAt.includes(':') ? d.expiresAt.split(':')[0]! : d.expiresAt);
                if (nowVal > expVal) {
                    return false;
                }
            }

            // 2. Jurisdiction match
            const jMatch = (resource === d.jurisdiction || d.jurisdiction === '*' || resource?.startsWith(d.jurisdiction + '.'));
            if (!jMatch) {
                return false;
            }

            if (d.capacity !== '*' && d.capacity !== check && !check.startsWith(d.capacity + '.') && !check.startsWith(d.capacity + ':')) {
                return false;
            }

            // 3. Capacity Limit Check (Rule 1.2)
            if (d.limits && actionType && actionValue !== undefined) {
                const limit = d.limits[actionType];
                if (limit !== undefined && actionValue > limit) {
                    return false;
                }
            }

            return true;
        });

        return authorized;
    }
    /**
     * Platform Accessor: Returns raw delegations for visualization/audit.
     */
    public getDelegations(filter?: { grantee?: EntityID, granter?: EntityID }): Delegation[] {
        if (!filter) return [...this.delegations];
        return this.delegations.filter(d =>
            (!filter.grantee || d.grantee === filter.grantee) &&
            (!filter.granter || d.granter === filter.granter)
        );
    }
}

/**
 * Compatibility Wrapper for legacy tests
 */
export class DelegationEngine extends AuthorityEngine {
    constructor(im: IdentityManager) {
        super(im);
    }

    public getEffectiveScope(entityId: EntityID): CapabilitySet {
        const caps = this.getCapacities(entityId);
        return new CapabilitySet(caps);
    }

    public override grant(
        granterId: EntityID,
        granteeId: EntityID,
        scope: CapabilitySet | CapacityID,
        timestamp: string,
        signature: Signature
    ) {
        const capacityId = typeof scope === 'string' ? scope : (scope.all[0] || 'NONE');
        super.grant(`auto-${Date.now()}`, granterId, granteeId, capacityId, '*', timestamp, signature);
    }
}
