
import { GovernanceKernel } from '../Kernel.js';
import type { Action, ActionPayload } from '../L2/State.js';
import {
    PlatformError,
    PolicyViolationError,
    SecurityViolationError,
    DataIntegrityError,
    InfrastructureError
} from './Errors.js';
import type { IStateRepository, IPrincipalRegistry } from './Ports.js';

/**
 * The Domain Command: A product-level intention.
 */
export interface Command {
    id: string;
    userId: string;
    target: string; // Metric or Resource
    operation: string;
    payload: any;
    signature: string;
    timestamp?: string;
}

/**
 * KernelPlatform: The official interface layer.
 * All Products Call This. No Product Calls L0 directly.
 */
export class KernelPlatform {
    constructor(
        private kernel: GovernanceKernel,
        private repository: IStateRepository,
        private identity: IPrincipalRegistry
    ) { }

    /**
     * Dispatches a product command to the governance machine.
     */
    public async execute(cmd: Command): Promise<{ success: boolean, actionId: string }> {
        try {
            // 1. Resolve Principal
            const entityId = await this.identity.resolve(cmd.userId);
            if (!entityId) {
                throw new SecurityViolationError(`User ${cmd.userId} not mapped to kernel principal`, cmd.userId);
            }

            // 2. Map Command to Action
            const action: Action = {
                actionId: cmd.id,
                initiator: entityId,
                payload: {
                    protocolId: cmd.operation, // We map 'operation' to protocol
                    metricId: cmd.target,
                    value: cmd.payload
                },
                timestamp: cmd.timestamp || Date.now().toString(),
                expiresAt: '0',
                signature: cmd.signature
            };

            // 3. Execution via Kernel
            // This will trigger Guards, Protocols, and State mutations.
            this.kernel.execute(action);

            // 4. Persistence Persist (In-memory or Store)
            // The kernel updates the StateModel, which we can sync here.
            const latest = this.kernel.getStateSnapshotChain().slice(-1)[0];
            if (latest) {
                await this.repository.saveSnapshot(latest);
            }

            return { success: true, actionId: action.actionId };

        } catch (e: any) {
            throw this.translateError(e, cmd);
        }
    }

    /**
     * Read-only Query
     */
    public query(metricId: string): any {
        return this.kernel.state.get(metricId);
    }

    /**
     * Translates low-level Kernel rejections into Platform Errors.
     */
    private translateError(e: any, cmd: Command): PlatformError {
        const msg = e.message || "Unknown Kernel Error";

        if (msg.includes("Policy Violation") || msg.includes("reverts") || msg.includes("rejects")) {
            return new PolicyViolationError(msg, cmd.operation);
        }
        if (msg.includes("Authority") || msg.includes("Signature") || msg.includes("Jurisdiction")) {
            return new SecurityViolationError(msg, cmd.userId, cmd.target);
        }
        if (msg.includes("Invariant") || msg.includes("Integrity") || msg.includes("Merkle")) {
            return new DataIntegrityError(msg);
        }

        return new InfrastructureError(msg, e);
    }
}
