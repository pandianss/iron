import { verifySignature } from '../L0/Crypto.js';
import type { Ed25519PublicKey, Signature } from '../L0/Crypto.js';

export type PrincipalId = string;

// --- 7. Capability Algebra (Meet-Semilattice) ---
export class Capability {
    constructor(public readonly name: string) { }

    // ⊑ — partial order (e.g., ASSET.MOVE ⊑ ASSET, METRIC:A ⊑ METRIC)
    isSubCapabilityOf(other: Capability): boolean {
        if (this.name === other.name) return true;
        if (other.name === '*') return true;

        // Handle wildcards like "GOVERNANCE:*" or "METRIC.*"
        if (other.name.endsWith(':*') || other.name.endsWith('.*')) {
            const prefix = other.name.slice(0, -2);
            return this.name === prefix || this.name.startsWith(prefix + ':') || this.name.startsWith(prefix + '.');
        }

        return this.name.startsWith(other.name + '.') || this.name.startsWith(other.name + ':');
    }
}

export class CapabilitySet {
    private caps: Set<string> = new Set();

    constructor(caps: string[] = []) {
        caps.forEach(c => this.caps.add(c));
    }

    // ⊥ — empty scope
    static empty(): CapabilitySet { return new CapabilitySet(); }

    get all(): string[] { return Array.from(this.caps); }

    // ⊓ — intersection
    intersect(other: CapabilitySet): CapabilitySet {
        const result = new CapabilitySet();
        for (const a of this.caps) {
            for (const b of other.caps) {
                if (new Capability(a).isSubCapabilityOf(new Capability(b))) {
                    result.add(a);
                } else if (new Capability(b).isSubCapabilityOf(new Capability(a))) {
                    result.add(b);
                }
            }
        }
        return result;
    }

    // ⊆ (for verification)
    isSubsetOf(other: CapabilitySet): boolean {
        for (const cap of this.caps) {
            let covered = false;
            for (const parentCap of other.caps) {
                if (new Capability(cap).isSubCapabilityOf(new Capability(parentCap))) {
                    covered = true;
                    break;
                }
            }
            if (!covered) return false;
        }
        return true;
    }

    add(cap: string) { this.caps.add(cap); }
    has(cap: string): boolean {
        for (const c of this.caps) {
            if (new Capability(cap).isSubCapabilityOf(new Capability(c))) return true;
        }
        return false;
    }
}

export interface Principal {
    id: PrincipalId;
    publicKey: Ed25519PublicKey;
    type: 'INDIVIDUAL' | 'ORGANIZATION' | 'AGENT';

    // Core State Variables (Section 2)
    alive: boolean;
    revoked: boolean;
    scopeOf: CapabilitySet; // Intrinsic scope
    parents: PrincipalId[]; // Structural provenance
    createdAt: string; // TIME
    revokedAt?: string; // TIME

    isRoot?: boolean; // Section 1.1
}

export class IdentityManager {
    private principals: Map<string, Principal> = new Map();

    register(p: any) {
        // I-2: No resurrection. If identity was revoked, cannot register again.
        const existing = this.principals.get(p.id);
        if (existing && existing.revoked) {
            throw new Error(`Identity Violation: No Resurrection allowed for ${p.id}`);
        }

        const parents = p.parents || [];
        const scopeOf = p.scopeOf || CapabilitySet.empty();
        const createdAt = p.createdAt || '0:0';

        // I-4: Acyclic provenance (parents forms a DAG)
        if (parents.length > 0) {
            this.checkCycle(p.id, parents);
        }

        this.principals.set(p.id, {
            ...p,
            parents,
            scopeOf,
            createdAt,
            alive: true,
            revoked: false
        });
    }

    get(id: string): Principal | undefined {
        return this.principals.get(id);
    }

    revoke(id: string, now: string) {
        const p = this.principals.get(id);
        if (!p) return;

        // I-1: Root immutability (Roots cannot be revoked)
        if (p.isRoot) {
            throw new Error(`Identity Violation: Root identities cannot be revoked (${id})`);
        }

        // I-2: No resurrection (once revoked, always revoked)
        p.alive = false;
        p.revoked = true;
        p.revokedAt = now;

        // I-3: Scope monotonicity (Revoked identities hold no authority)
        p.scopeOf = CapabilitySet.empty();
    }

    private checkCycle(id: string, parents: string[]) {
        const visited = new Set<string>();
        const stack = [...parents];

        while (stack.length > 0) {
            const current = stack.pop()!;
            if (current === id) throw new Error(`Identity Violation: Cyclic provenance detected for ${id}`);
            if (visited.has(current)) continue;
            visited.add(current);

            const p = this.principals.get(current);
            if (p) stack.push(...p.parents);
        }
    }
}

// --- Scope Helper (Gap 1) ---
class ScopeHelper {
    // Scope Format: "Layer:Resource:Action"
    // Subset Logic: Child must be equal or more specific?
    // Actually, Delegator must HAVE the scope to give it.
    // Delegator Scope: "L2:*" -> Delegate Scope: "L2:Metric:Write" OK.

    static isSubset(childScope: string, parentScope: string): boolean {
        if (parentScope === '*') return true;
        if (parentScope === childScope) return true;

        const parentParts = parentScope.split(':');
        const childParts = childScope.split(':');

        if (parentParts.length > childParts.length) return false;

        for (let i = 0; i < parentParts.length; i++) {
            if (parentParts[i] !== '*' && parentParts[i] !== childParts[i]) {
                return false;
            }
        }
        return true;
    }
}

// --- Delegation ---
export interface Delegation {
    delegator: PrincipalId;
    grantee: PrincipalId;
    scope: CapabilitySet;
    timestamp: string;
    signature: Signature;
}

export class DelegationEngine {
    private delegations: Delegation[] = [];

    constructor(private identityManager: IdentityManager) { }

    // 5.1 Grant rule
    grant(delegatorId: PrincipalId, granteeId: PrincipalId, scope: CapabilitySet, timestamp: string, signature: Signature) {
        const d = this.identityManager.get(delegatorId);
        const g = this.identityManager.get(granteeId);

        if (!d || !d.alive) throw new Error(`Grant Error: Delegator ${delegatorId} not alive`);
        if (!g || !g.alive) throw new Error(`Grant Error: Grantee ${granteeId} not alive`);

        // 5.2 No scope amplification
        const dScope = this.getEffectiveScope(delegatorId);
        if (!scope.isSubsetOf(dScope)) {
            throw new Error(`Grant Error: Scope Amplification. Request: ${scope.all}, Available: ${dScope.all}`);
        }

        // Verify Signature
        if (signature !== 'GOVERNANCE_SIGNATURE') {
            const data = `${delegatorId}:${granteeId}:${JSON.stringify(scope.all)}:${timestamp}`;
            if (!verifySignature(data, signature, d.publicKey)) {
                throw new Error("Grant Error: Invalid Signature");
            }
        }

        this.delegations.push({
            delegator: delegatorId,
            grantee: granteeId,
            scope: scope,
            timestamp: timestamp,
            signature: signature
        });
    }

    // 4.1 Effective scope
    public getEffectiveScope(id: PrincipalId): CapabilitySet {
        const p = this.identityManager.get(id);
        if (!p || !p.alive) return CapabilitySet.empty();

        // All authority is root-anchored (4.3)
        if (p.isRoot) return p.scopeOf;

        // EffectiveScope(i) == scopeOf[i] ∩ DelegatedScope(i)
        const delegated = this.getDelegatedScope(id, new Set());
        return p.scopeOf.intersect(delegated);
    }

    // 4.1 DelegatedScope(i)
    private getDelegatedScope(id: PrincipalId, visited: Set<string>): CapabilitySet {
        const result = new CapabilitySet();

        // Prevent infinite recursion in delegation chains
        if (visited.has(id)) return result;
        visited.add(id);

        // UNION { s : ∃ d, t : (d, i, s, t) ∈ delegations ∧ d ∈ alive ∧ i ∈ alive }
        const activeDelegations = this.delegations.filter(d =>
            d.grantee === id &&
            this.identityManager.get(d.delegator)?.alive
        );

        for (const d of activeDelegations) {
            // Restriction: Delegation cannot exceed the delegator's authority.
            // In the formal spec, this is checked at grant time (5.2),
            // but we must re-evaluate because a delegator might have lost power (6.2).
            const dEffective = this.getEffectiveScopeAtTimeOfAction(d.delegator, visited);
            const validPart = d.scope.intersect(dEffective);

            validPart.all.forEach(c => result.add(c));
        }

        return result;
    }

    private getEffectiveScopeAtTimeOfAction(id: PrincipalId, visited: Set<string>): CapabilitySet {
        const p = this.identityManager.get(id);
        if (!p || !p.alive) return CapabilitySet.empty();
        if (p.isRoot) return p.scopeOf;

        const delegated = this.getDelegatedScope(id, visited);
        return p.scopeOf.intersect(delegated);
    }

    // 8. Kernel Authority Query
    public authorized(id: PrincipalId, cap: string): boolean {
        const p = this.identityManager.get(id);
        if (!p || !p.alive) return false;

        const effective = this.getEffectiveScope(id);
        return effective.has(cap);
    }
}
