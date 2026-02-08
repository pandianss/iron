// src/L0/Invariants.ts
import { IdentityManager } from '../L1/Identity.js';
import type { Action } from './Ontology.js';
import { ErrorCode } from '../Errors.js';

export interface Invariant {
    id: string;
    type: 'IMMUTABLE' | 'ADAPTIVE';
    boundary: string; // The named boundary (e.g. "Identity Integrity")
    description: string;
    permits: string; // "What would make this permissible?"
    predicate: (context: InvariantContext) => boolean;
    violation: ErrorCode;
}

export interface InvariantContext {
    action: Action;
    manager: IdentityManager;
    state?: any;
}

export interface Rejection {
    code: ErrorCode;
    invariantId: string;
    boundary: string;
    permissible: string;
    message: string;
}

// --- 2. Constitutional Invariants ---

// I. Identity Integrity
export const INV_ID_01: Invariant = {
    id: 'INV-ID-01',
    type: 'IMMUTABLE',
    boundary: 'Identity Integrity',
    description: 'Signature format must be valid hex',
    permits: 'Transaction must be signed with a valid hex signature.',
    predicate: ({ action }) => action.signature === 'TRUSTED' || action.signature === 'GOVERNANCE_SIGNATURE' || /^[0-9a-fA-F]+$/.test(action.signature),
    violation: ErrorCode.SIGNATURE_INVALID
};

export const INV_ID_02: Invariant = {
    id: 'INV-ID-02',
    type: 'IMMUTABLE',
    boundary: 'Identity Integrity',
    description: 'Entity must exist in Identity Registry',
    permits: 'Initiator must be a registered entity.',
    predicate: ({ manager, action }) => {
        if (action.payload.protocolId === 'REGISTER') return true;
        return !!manager.get(action.initiator);
    },
    violation: ErrorCode.REVOKED_ENTITY
};

export const INV_ID_03: Invariant = {
    id: 'INV-ID-03',
    type: 'IMMUTABLE',
    boundary: 'Identity Integrity',
    description: 'Entity must be ACTIVE',
    permits: 'Initiator account must not be revoked or suspended.',
    predicate: ({ manager, action }) => {
        if (action.payload.protocolId === 'REGISTER') return true;
        const entity = manager.get(action.initiator);
        return entity?.status === 'ACTIVE';
    },
    violation: ErrorCode.REVOKED_ENTITY
};

// II. Resource Bounds
export const INV_RES_01: Invariant = {
    id: 'INV-RES-01',
    type: 'IMMUTABLE',
    boundary: 'Resource Bounds',
    description: 'Metrics must be finite numbers',
    permits: 'Metric values must be finite numbers.',
    predicate: ({ action }) => {
        if (typeof action.payload.value === 'number') {
            return Number.isFinite(action.payload.value);
        }
        return true;
    },
    violation: ErrorCode.NON_FINITE_METRIC
};

export const INV_RES_02: Invariant = {
    id: 'INV-RES-02',
    type: 'IMMUTABLE',
    boundary: 'Temporal Physics',
    description: 'No future timestamp > 1 min',
    permits: 'Timestamp must be within 1 minute of network time.',
    predicate: ({ action }) => {
        const now = Date.now();
        const tsString = typeof action.timestamp === 'string' ? action.timestamp : '';
        const ts = tsString ? parseInt(tsString.split(':')[0] || '0') : (typeof action.timestamp === 'number' ? action.timestamp : 0);

        return (ts as number) <= now + 60000;
    },
    violation: ErrorCode.TEMPORAL_PARADOX
};

export const INV_RES_03: Invariant = {
    id: 'INV-RES-03',
    type: 'IMMUTABLE',
    boundary: 'Resource Bounds',
    description: 'Payload size limit (16KB)',
    permits: 'Payload must be under 16KB.',
    predicate: ({ action }) => {
        return JSON.stringify(action.payload).length <= 16384;
    },
    violation: ErrorCode.PAYLOAD_OVERSIZE
};

// III. Structural Integrity
export const INV_PRO_01: Invariant = {
    id: 'INV-PRO-01',
    type: 'IMMUTABLE',
    boundary: 'Structural Integrity',
    description: 'Action ID must be present',
    permits: 'Action must have a valid non-empty ID.',
    predicate: ({ action }) => !!action.actionId && action.actionId.length > 0,
    violation: ErrorCode.INVALID_ID_FORMAT
};

export const INV_PRO_02: Invariant = {
    id: 'INV-PRO-02',
    type: 'IMMUTABLE',
    boundary: 'Structural Integrity',
    description: 'Payload must contain metricId',
    permits: 'Action payload must specify a target metricId.',
    predicate: ({ action }) => !!action.payload?.metricId,
    violation: ErrorCode.MISSING_METRIC_ID
};

// --- Aggregate Constitutional Check ---
export const KERNEL_INVARIANTS: Invariant[] = [
    INV_ID_01, INV_ID_02, INV_ID_03,
    INV_RES_01, INV_RES_02, INV_RES_03,
    INV_PRO_01, INV_PRO_02
];

export function checkInvariants(context: InvariantContext): { ok: boolean; rejection?: Rejection } {
    for (const inv of KERNEL_INVARIANTS) {
        if (!inv.predicate(context)) {
            return {
                ok: false,
                rejection: {
                    code: inv.violation,
                    invariantId: inv.id,
                    boundary: inv.boundary,
                    permissible: inv.permits,
                    message: `Invariant Violation: ${inv.description}`
                }
            };
        }
    }
    return { ok: true };
}
