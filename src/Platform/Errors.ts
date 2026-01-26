
/**
 * IRON Platform: Domain Error Taxonomy
 * Translates Stratum 0/1 Kernel events into Stratum II/III Product exceptions.
 */

export abstract class PlatformError extends Error {
    constructor(public message: string, public code: string, public metadata?: any) {
        super(message);
        this.name = this.constructor.name;
    }
}

/**
 * Thrown when a protocol prevents execution (e.g. Budget Exhausted).
 */
export class PolicyViolationError extends PlatformError {
    constructor(message: string, protocolId: string, details?: any) {
        super(message, 'POLICY_VIOLATION', { protocolId, ...details });
    }
}

/**
 * Thrown when identity or jurisdiction checks fail.
 */
export class SecurityViolationError extends PlatformError {
    constructor(message: string, actorId: string, cap?: string) {
        super(message, 'SECURITY_VIOLATION', { actorId, capability: cap });
    }
}

/**
 * Thrown when Merkle roots or invariants are breached.
 */
export class DataIntegrityError extends PlatformError {
    constructor(message: string, trace?: string) {
        super(message, 'DATA_INTEGRITY_BREACH', { trace });
    }
}

/**
 * Thrown when the environment/platform fails (e.g. storage full).
 */
export class InfrastructureError extends PlatformError {
    constructor(message: string, underlying?: any) {
        super(message, 'INFRASTRUCTURE_FAILURE', { underlying });
    }
}

/**
 * Thrown when a system-level limit is hit (e.g. rate limit).
 */
export class ResourceExhaustionError extends PlatformError {
    constructor(message: string, resource: string) {
        super(message, 'RESOURCE_EXHAUSTED', { resource });
    }
}
