
import { IdentityManager } from '../L1/Identity.js';
import * as ed from '@noble/ed25519';

// Local definition to avoid ESM export issues with interfaces
export interface Action {
    actionId: string;
    initiator: string;
    payload: { metricId: string; value: any;[key: string]: any };
    timestamp: string;
    expiresAt: string;
    signature: string;
}

export type InvariantCode =
    | 'INV_ID_01' | 'INV_ID_02' | 'INV_ID_03'
    | 'INV_DEL_01' | 'INV_DEL_02' | 'INV_DEL_03'
    | 'INV_RES_01' | 'INV_RES_02' | 'INV_RES_03'
    | 'INV_PRO_01' | 'INV_PRO_02';

export interface InvariantResult {
    success: boolean;
    code?: InvariantCode;
    message?: string;
}

export interface InvariantContext {
    action: Action;
    manager: IdentityManager;
    state?: any; // For future state-based invariants
}

export type Invariant = (context: InvariantContext) => InvariantResult;

const PASS = (): InvariantResult => ({ success: true });
const FAIL = (code: InvariantCode, message: string): InvariantResult => ({ success: false, code, message });

// --- 1. Entity Integrity (Identity) ---

export const INV_ID_01: Invariant = ({ action }) => {
    // Public Key must be valid hex (usually 64 chars for Ed25519)
    // We can loosely check hex format and length.
    // Ed25519 keys are 32 bytes = 64 hex chars.
    const pk = action.initiator; // Assuming initiator IS the public key or ID. 
    // In IRON L1, initiator is usually the ID (hash of PK) or PK itself if no ID system yet.
    // Let's assume initiator is the Identity ID. The PK is verified in SignatureGuard.
    // INV_ID_01 checks if the PK *provided* in the context (if available) is valid.
    // Wait, the action signature verification recovers/uses a PK.
    // Let's look at the Action structure. It usually implies a known entity.

    // Simplification for Phase 2: We might check if the initiator string looks sane.
    // But let's check the signature format here as a proxy for "Crypto Integrity".

    if (!/^[0-9a-fA-F]{128}$/.test(action.signature)) {
        return FAIL('INV_ID_01', "Signature must be 128-char hex string");
    }
    return PASS();
};

export const INV_ID_02: Invariant = ({ manager, action }) => {
    // Entity must exist if it's not a genesis/register action
    // (This might overlap with SignatureGuard looking up the entity, but Invariant makes it explicit logic)
    const entity = manager.get(action.initiator);
    // If we want to enforce that Unknown Entities cannot act:
    if (!entity) {
        // Exception: Registration actions? 
        // For now, strict kernel: You must exist.
        // Wait, how do you register? 
        // Exception: Registration actions?
        // If generic "REGISTER" protocol is used
        if (action.payload.protocolId === 'REGISTER') return PASS();

        return FAIL('INV_ID_02', "Entity not found");
    }
    return PASS();
};

export const INV_ID_03: Invariant = ({ manager, action }) => {
    const entity = manager.get(action.initiator);
    if (!entity) return PASS(); // Handled by ID_02 or REGISTER case

    // Type sanity check
    const validTypes = ['ACTOR', 'OFFICE', 'SYSTEM', 'ASSET', 'ABSTRACT'];
    if (!validTypes.includes(entity.type)) {
        return FAIL('INV_ID_03', `Invalid Entity Type: ${entity.type}`);
    }
    return PASS();
};

// --- 2. Delegation Safety (Hierarchy) ---

export const INV_DEL_01: Invariant = ({ manager, action }) => {
    // Delegation Depth Check
    if (action.payload.protocolId === 'DELEGATE') {
        // Logic to inspect depth would go here.
    }
    return PASS();
};

export const INV_DEL_02: Invariant = ({ action }) => {
    // No Self-Delegation
    if (action.payload.protocolId === 'DELEGATE') {
        const target = action.payload.value?.target; // Assuming target is in value for DELEGATE
        if (target === action.initiator) {
            return FAIL('INV_DEL_02', "Cannot delegate to self");
        }
    }
    return PASS();
};

export const INV_DEL_03: Invariant = ({ action }) => {
    // Parent capability subset check (Placeholder)
    return PASS();
};

// --- 3. Resource Bounds (State) ---

export const INV_RES_01: Invariant = ({ action }) => {
    // Metric numeric safety
    if (typeof action.payload.value === 'number') {
        if (!Number.isFinite(action.payload.value)) {
            return FAIL('INV_RES_01', "Metric value must be finite number");
        }
    }
    return PASS();
};

export const INV_RES_02: Invariant = ({ action }) => {
    // Timestamp sanity (not future, not too old - though 'too old' is subjective/monotonic)
    // Let's strict check: Timestamp cannot be > 1 minute in future (clock skew tolerance)
    const now = Date.now();
    const ts = typeof action.timestamp === 'string' ? parseInt(action.timestamp) : action.timestamp;

    if (ts > now + 60000) {
        return FAIL('INV_RES_02', "Timestamp is in the future");
    }
    return PASS();
};

export const INV_RES_03: Invariant = ({ action }) => {
    // Signature length - actually covered in ID_01, let's make this Payload Size Limit
    const payloadSize = JSON.stringify(action.payload).length;
    if (payloadSize > 1024 * 16) { // 16KB limit
        return FAIL('INV_RES_03', "Payload exceeds 16KB limit");
    }
    return PASS();
};


// --- 4. Protocol Correctness (Logic) ---

export const INV_PRO_01: Invariant = ({ action }) => {
    // ActionId Determinism implies we can't easily re-verify without hashing here.
    // But we can check structural invariants of the ID format.
    if (!action.actionId || action.actionId.length < 32) {
        return FAIL('INV_PRO_01', "Invalid Action ID format");
    }
    return PASS();
};

export const INV_PRO_02: Invariant = ({ action }) => {
    // Required fields
    if (!action.payload || !action.payload.metricId) {
        return FAIL('INV_PRO_02', "Payload requires metricId");
    }
    return PASS();
};

// --- Aggregation ---

export const AllInvariants = [
    INV_ID_01, INV_ID_02, INV_ID_03,
    INV_DEL_02, // Skipping 01/03 placeholders for now
    INV_RES_01, INV_RES_02, INV_RES_03,
    INV_PRO_01, INV_PRO_02
];

export const checkInvariants = (context: InvariantContext): InvariantResult => {
    for (const inv of AllInvariants) {
        const res = inv(context);
        if (!res.success) return res;
    }
    return PASS();
};
