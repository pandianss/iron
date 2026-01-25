import { StateModel } from '../L2/State.js';
import type { Action, ActionPayload } from '../L2/State.js';
import { AuditLog } from '../L5/Audit.js';
import { signData, hash } from '../L0/Crypto.js';
import type { KeyPair } from '../L0/Crypto.js';
import { GovernanceKernel } from '../Kernel.js';
import { Budget, BudgetType } from '../L0/Kernel.js';
import type { EntityID } from '../L0/Ontology.js';

/**
 * 6. Interface (Constitutional Interface)
 */
export class GovernanceInterface {
    constructor(
        private kernel: GovernanceKernel,
        private state: StateModel,
        private log: AuditLog
    ) { }

    public getTruth(id: string) { return (this.state as any).currentState.metrics[id]; }

    public getAuditTrail(id: string) {
        return this.log.getHistory()
            .filter(e => e.action.payload.metricId === id)
            .map(e => ({
                value: e.action.payload.value,
                timestamp: e.action.timestamp,
                proof: e.evidenceId
            }));
    }

    // The Single Door: All Writes must go through Kernel (Article VII)
    public submit(action: Action, options: { budgetLimit?: number } = {}) {
        const budget = new Budget(BudgetType.ENERGY, options.budgetLimit || 100);
        return this.kernel.execute(action, budget);
    }

    /**
     * Product 2: Governance Breach Monitor
     * Extracts structured violation data from the Audit Log.
     */
    public getBreachReports() {
        return this.log.getHistory()
            .filter(e => e.status === 'REJECT' || e.status === 'ABORTED')
            .map(e => ({
                actionId: e.action.actionId,
                initiator: e.action.initiator,
                reason: e.reason,
                metadata: e.metadata,
                timestamp: e.timestamp
            }));
    }

    /**
     * Product 2: Incident Reconstruction
     * Groups related evidence by context (e.g., metric, initiator).
     */
    public reconstructIncident(actionId: string) {
        const history = this.log.getHistory();
        const mainEntry = history.find(e => e.action.actionId === actionId);
        if (!mainEntry) return null;

        return {
            incident: mainEntry,
            timeline: history.filter(e =>
                e.action.initiator === mainEntry.action.initiator &&
                e.timestamp <= mainEntry.timestamp
            ).slice(-5) // Last 5 steps leadings to breach
        };
    }

    // --- Phase 1: Authority Management (Product 1: DAS) ---

    /**
     * Register a new entity in the system
     */
    public registerEntity(id: EntityID, publicKey: string, type: 'ACTOR' | 'OFFICE' | 'ASSET' | 'SYSTEM' | 'ABSTRACT' = 'ACTOR') {
        return this.kernel['identity'].register({
            id,
            publicKey,
            type,
            identityProof: 'USER_REGISTRATION',
            status: 'ACTIVE',
            createdAt: `${Date.now()}:0`
        });
    }

    /**
     * Grant authority/delegation to an entity
     */
    public grantAuthority(params: {
        grantee: EntityID;
        capability: string;
        targetMetric: string;
        expiresAt?: string;
        limits?: Record<string, number>;
        grantor: EntityID;
    }) {
        const authorityId = `auth:${Date.now()}:${Math.random()}`;
        return this.kernel['authority'].grant(
            authorityId,
            params.grantor,
            params.grantee,
            params.capability,
            params.targetMetric,
            `${Date.now()}:0`,
            'GOVERNANCE_SIGNATURE',
            params.expiresAt,
            params.limits
        );
    }

    /**
     * Revoke a delegation
     */
    public revokeAuthority(authorityId: string) {
        this.kernel['authority'].revoke(authorityId);
    }

    /**
     * Check if an entity is authorized for a capability
     */
    public checkAuthorization(entityId: EntityID, check: string, context?: { time?: string, value?: number }) {
        return this.kernel['authority'].authorized(entityId, check, context);
    }

    /**
     * List all delegations for an entity
     */
    public listDelegations(entityId?: EntityID) {
        const allDelegations = this.kernel['authority']['delegations'];
        if (!entityId) return allDelegations;
        return allDelegations.filter(d => d.grantee === entityId || d.granter === entityId);
    }

    // --- Phase 1: Protocol Management (Product 3: Policy Gate) ---

    /**
     * Propose a new protocol/policy
     */
    public proposeProtocol(protocol: any) {
        return this.kernel['protocols'].propose(protocol);
    }

    /**
     * Ratify a proposed protocol
     */
    public ratifyProtocol(protocolId: string, signature: string) {
        return this.kernel['protocols'].ratify(protocolId, signature);
    }

    /**
     * Activate a ratified protocol
     */
    public activateProtocol(protocolId: string) {
        return this.kernel['protocols'].activate(protocolId);
    }

    /**
     * Get protocol details
     */
    public getProtocol(protocolId: string) {
        return this.kernel['protocols'].get(protocolId);
    }

    /**
     * List all protocols (optionally filtered by category)
     */
    public listProtocols(category?: string) {
        const protocolsMap = this.kernel['protocols']['protocols'] as Map<string, any>;
        const allProtocols = Array.from(protocolsMap.values());
        if (!category) return allProtocols;
        return allProtocols.filter(p => p.category === category);
    }

    // --- Phase 1: Enhanced Breach Monitoring ---

    /**
     * Get breaches by entity
     */
    public getBreachesByEntity(entityId: EntityID) {
        return this.getBreachReports().filter(b => b.initiator === entityId);
    }

    /**
     * Get breaches by metric
     */
    public getBreachesByMetric(metricId: string) {
        return this.log.getHistory()
            .filter(e =>
                (e.status === 'REJECT' || e.status === 'ABORTED') &&
                e.action.payload.metricId === metricId
            )
            .map(e => ({
                actionId: e.action.actionId,
                initiator: e.action.initiator,
                reason: e.reason,
                metadata: e.metadata,
                timestamp: e.timestamp
            }));
    }

    /**
     * Verify audit log integrity
     */
    // --- Platform: Console API (Read-Optimized) ---

    // Returns a simplified state tree for visualization
    public getStateSnapshot(): Record<string, any> {
        return (this.kernel.State as any).currentState.metrics; // Protected access via getter if added, or any cast
    }

    // Returns audit trail for inspection
    public getRecentAudits(limit: number = 50): any[] {
        const history = (this.kernel.State as any).auditLog.getHistory();
        return history.slice(-limit).reverse(); // Newest first
    }

    // Returns authority structure for a principal (or root)
    public getAuthorityGraph(rootPrincipal: string = 'genesis'): any {
        const auth = (this.kernel as any).authority as any; // Cast to access AuthorityEngine
        // Note: AuthorityEngine property on Kernel is private, but available via L6 trust (since Interface is internal component).
        // Accessing 'authority' property.

        // 1. Get all delegations
        const allDelegations = auth.getDelegations();

        // 2. Recursive Builder
        const buildTree = (principal: string): any => {
            const children = allDelegations
                .filter((d: any) => d.granter === principal && d.status === 'ACTIVE')
                .map((d: any) => ({
                    principal: d.grantee,
                    capacity: d.capacity,
                    jurisdiction: d.jurisdiction,
                    limits: d.limits,
                    expires: d.expiresAt,
                    children: buildTree(d.grantee)
                }));

            return {
                principal,
                delegations: children
            };
        };

        return buildTree(rootPrincipal);
    }
}

// --- VI.1 Consent Law (Action Builder) ---
export class ActionBuilder {
    private initiator: EntityID = '';
    private protocolId: string = 'SYSTEM';
    private metricId: string = '';
    private value: any = null;
    private expiresAt: string = '0:0';
    private timestamp: string = '';

    private context: string = '';

    constructor() { }

    public withInitiator(id: EntityID): this { this.initiator = id; return this; }
    public withProtocol(id: string): this { this.protocolId = id; return this; }
    public withMetric(id: string): this { this.metricId = id; return this; }
    public withValue(val: any): this { this.value = val; return this; }

    // Binding the UI/Human Context to the Action (For Audit Evidence)
    public withContext(uiLabel: string, workflowId: string): this {
        this.context = `${uiLabel}::${workflowId}`;
        return this;
    }

    public build(keyPair: KeyPair): Action {
        if (!this.initiator || !this.metricId) throw new Error("Incomplete Action");

        this.timestamp = `${Date.now()}:0`;
        const payload: ActionPayload = { protocolId: this.protocolId, metricId: this.metricId, value: this.value };

        // Action ID = SHA256(Initiator + Payload + TS + Exp)
        const actionId = hash(`${this.initiator}:${JSON.stringify(payload)}:${this.timestamp}:${this.expiresAt}`);

        // Signature must match Kernel's validation string
        const data = `${actionId}:${this.initiator}:${JSON.stringify(payload)}:${this.timestamp}:${this.expiresAt}`;
        const signature = signData(data, keyPair.privateKey);

        return {
            actionId,
            initiator: this.initiator,
            payload,
            timestamp: this.timestamp,
            expiresAt: this.expiresAt,
            signature
        };
    }
}

// --- XI. Override (Primitive 11) ---
export interface OverrideAction {
    type: 'OVERRIDE';
    targetActionId: string;
    justification: string;
    signature: string;
}



