/**
 * IRON Kernel Error Taxonomy
 * Centralized error codes for formal rejections and terminal failures.
 */

export enum ErrorCode {
    // I. Identity & Signature (INV-ID)
    SIGNATURE_INVALID = 'SIGNATURE_INVALID',
    REVOKED_ENTITY = 'REVOKED_ENTITY',
    UNKNOWN_ENTITY = 'UNKNOWN_ENTITY',
    SELF_DELEGATION = 'SELF_DELEGATION',

    // II. Authority & Scope (INV-AUTH)
    OVERSCOPE_ATTEMPT = 'OVERSCOPE_ATTEMPT',
    EXPIRED_AUTHORITY = 'EXPIRED_AUTHORITY',
    AUTHORITY_NOT_FOUND = 'AUTHORITY_NOT_FOUND',

    // III. Protocol & Lifecycle (INV-PRO)
    PROTOCOL_VIOLATION = 'PROTOCOL_VIOLATION',
    PROTOCOL_NOT_FOUND = 'PROTOCOL_NOT_FOUND',
    PROTOCOL_NOT_ACTIVE = 'PROTOCOL_NOT_ACTIVE',
    INVALID_ID_FORMAT = 'INVALID_ID_FORMAT',
    MISSING_METRIC_ID = 'MISSING_METRIC_ID',

    // IV. Fiscal & Resource (INV-RES)
    BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
    NON_FINITE_METRIC = 'NON_FINITE_METRIC',
    NEGATIVE_BALANCE = 'NEGATIVE_BALANCE',
    PAYLOAD_OVERSIZE = 'PAYLOAD_OVERSIZE',

    // V. Temporal & Security (INV-SEC)
    TEMPORAL_PARADOX = 'TEMPORAL_PARADOX',
    REPLAY_DETECTED = 'REPLAY_DETECTED',
    CLOCK_SKEW_REJECTED = 'CLOCK_SKEW_REJECTED',

    // VI. Kernel Lifecycle & Internal
    KERNEL_NOT_ACTIVE = 'KERNEL_NOT_ACTIVE',
    ATTEMPT_NOT_FOUND = 'ATTEMPT_NOT_FOUND',
    COMMIT_FAILED = 'COMMIT_FAILED',
    REPLAY_FAILURE = 'REPLAY_FAILURE',
    INTEGRITY_BREACH = 'INTEGRITY_BREACH',
    STATE_TRANSITION_FAILED = 'STATE_TRANSITION_FAILED',

    // VII. Behavioral Constitution (Friction Layer)
    COOLDOWN_VIOLATION = 'COOLDOWN_VIOLATION',
    MULTISIG_INSUFFICIENT = 'MULTISIG_INSUFFICIENT',
    MULTISIG_INVALID = 'MULTISIG_INVALID',
    IRREVERSIBILITY_VIOLATION = 'IRREVERSIBILITY_VIOLATION',
}

export class KernelError extends Error {
    constructor(
        public readonly code: ErrorCode,
        public readonly message: string,
        public readonly metadata?: Record<string, any>
    ) {
        super(`[Iron:${code}] ${message}`);
        this.name = 'KernelError';
    }
}
