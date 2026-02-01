
import type { Protocol } from '../../kernel-core/L4/ProtocolTypes.js';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskCategory = 'SECURITY' | 'FINANCIAL' | 'OPERATIONAL' | 'COMPLIANCE';

export interface Risk {
    id: string;
    name: string;
    description: string;
    category: RiskCategory;
    severity: RiskSeverity;
    // Which protocol types mitigates this?
    mitigationCriteria?: {
        requiredProtocolCategory?: string;
        requiredMetric?: string;
    };
}

export interface Obligation {
    id: string;
    description: string;
    authority: string; // e.g. "ISO 27001", "GDPR"
    mappedRisks: string[]; // Risk IDs
}

export class RiskRegistry {
    private risks: Map<string, Risk> = new Map();
    private obligations: Map<string, Obligation> = new Map();

    constructor() {
        // Seed standard risks
        this.registerRisk({
            id: 'R_UNAUTH_ACCESS',
            name: "Unauthorized System Access",
            description: "Principals accessing resources without explicit grant.",
            category: "SECURITY",
            severity: "CRITICAL",
            mitigationCriteria: { requiredMetric: "security.access.level" }
        });
        this.registerRisk({
            id: 'R_BUDGET_OVERRUN',
            name: "Uncontrolled Spending",
            description: "OPEX exceeding allocated limits.",
            category: "FINANCIAL",
            severity: "HIGH",
            mitigationCriteria: { requiredMetric: "finance.opex.remaining" }
        });
    }

    public registerRisk(risk: Risk) {
        this.risks.set(risk.id, risk);
    }

    public registerObligation(obl: Obligation) {
        this.obligations.set(obl.id, obl);
    }

    public getRisks(): Risk[] {
        return Array.from(this.risks.values());
    }

    public getObligations(): Obligation[] {
        return Array.from(this.obligations.values());
    }

    /**
     * Analyzes active protocols to determine if a Risk is mitigated.
     * Simple Heuristic: Is there an ACTIVE protocol that targets the required metric?
     */
    public assessMitigation(activeProtocols: Protocol[], riskId: string): boolean {
        const risk = this.risks.get(riskId);
        if (!risk || !risk.mitigationCriteria) return false;

        return activeProtocols.some(p => {
            if (p.lifecycle !== 'ACTIVE') return false;

            // Check if protocol targets the mitigation metric
            // We need to peek into execution rules
            const targets = p.execution.some(r =>
                typeof r !== 'string' &&
                r.type === 'MUTATE_METRIC' &&
                r.metricId === risk.mitigationCriteria?.requiredMetric
            );

            // Also check preconditions (sometimes pure restriction is the control)
            const guards = p.preconditions.some(pr =>
                typeof pr !== 'string' &&
                pr.type === 'METRIC_THRESHOLD' &&
                pr.metricId === risk.mitigationCriteria?.requiredMetric
            );

            return targets || guards;
        });
    }
}
