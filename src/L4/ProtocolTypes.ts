
// src/L4/ProtocolTypes.ts
import type { PrincipalId } from '../L1/Identity.js';

// --- Canonical Schema Definitions ---

export type ProtocolCategory = 'Intent' | 'Habit' | 'Budget' | 'Authority' | 'Accountability' | 'Risk';

// --- v1.0 Commercial Standard ---

export type SemanticVersion = string; // e.g., "1.0.0"

export interface EconomicModel {
    gas: number; // Computational cost (e.g., 1-100)
    price?: {
        amount: number;
        currency: 'USD' | 'IRON' | 'COMPUTE';
        model: 'PER_CALL' | 'SUBSCRIPTION';
    };
}

export type SafetyGrade = 'UNVERIFIED' | 'AUDITED' | 'CERTIFIED';

export interface Validity {
    from: number;
    until?: number;
}

export interface Scope {
    actors: string[];
    resources: string[]; // State domains
}

// Predicate: Simple Logic for Preconditions
export interface Predicate {
    type: 'METRIC_THRESHOLD' | 'INTENT_SIGNATURE' | 'TIME_WINDOW' | 'ALWAYS';
    metricId?: string;
    operator?: '>' | '<' | '==' | '>=' | '<=';
    value?: number | string | boolean;
}

// Rule: Deterministic Execution
export interface Rule {
    type: 'MUTATE_METRIC' | 'ALLOW_INTENT';
    metricId?: string;
    mutation?: number;
}

export interface BudgetDef {
    type: 'time' | 'attention' | 'risk' | 'simulation' | 'authority';
    limit: number;
}

export interface AccountabilityDef {
    mode: 'self' | 'peer' | 'org';
    severityOnViolation: 'info' | 'warn' | 'critical';
}

export interface RevocationDef {
    allowedBy: string;
    propagates: boolean;
}

export interface Protocol {
    id?: string;
    name: string;
    version: SemanticVersion;

    // Commercial Props
    category: ProtocolCategory;
    author?: string;
    economics?: EconomicModel;
    safety?: SafetyGrade;

    validity?: Validity;
    scope?: Scope;

    preconditions: (Predicate | string)[];
    execution: (Rule | string)[];

    budgets?: BudgetDef[];
    accountability?: AccountabilityDef;
    revocation?: RevocationDef;

    // Legacy mapping helpers if needed
    triggerMetric?: string;
    threshold?: number;
    actionMetric?: string; // Implicitly derived or explicit?
    actionMutation?: number;
}

export interface ProtocolBundle {
    bundleId: string;
    libraryName: string;
    version: string;
    owner: {
        publicKey: string; // ed25519:hex
        scope: string;
    };
    protocols: Protocol[];
    createdAt: string;
    signature: string; // ed25519:hex
}
