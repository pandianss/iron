import { GovernanceKernel } from '../Kernel.js';
import { AuditLog } from '../L5/Audit.js';
import { ProjectionEngine } from '../L3/Projections.js';

export class ReplayEngine {
    /**
     * Replays the provided AuditLog onto the Kernel.
     * WARNING: This should be used on a fresh Kernel instance.
     */
    public async replay(log: AuditLog, kernel: GovernanceKernel, projections?: ProjectionEngine): Promise<void> {
        const history = await log.getHistory();

        console.log(`[ReplayEngine] Starting replay of ${history.length} events...`);

        for (const entry of history) {
            // 1. Feed Projections (Read Model)
            if (projections) {
                projections.apply(entry);
            }

            // M2.5 Persistence: Hydrate Replay Memory
            kernel.registerSeenAction(entry.action.actionId);

            // 2. Reconstruct Kernel (Write Model)
            if (entry.status === 'SUCCESS') {
                try {
                    // We apply trusted mutations directly to bypass guards 
                    // since they were already validated during original execution.
                    await kernel.state.applyTrusted(
                        [entry.action.payload],
                        entry.action.timestamp,
                        entry.action.initiator,
                        entry.action.actionId,
                        entry.evidenceId
                    );
                } catch (e: any) {
                    throw new Error(`Replay Failure at Action ${entry.action.actionId}: ${e.message}`);
                }
            }
        }

        // Final Integrity Check
        const logTip = await log.getTip();
        const kernelSnapshots = kernel.state.getSnapshotChain();
        const kernelTip = kernelSnapshots[kernelSnapshots.length - 1];

        if (logTip && kernelTip) {
            // Note: AuditLog hashes Evidence, StateModel hashes StateSnapshots.
            // But StateSnapshot contains evidenceHash.
            if (kernelTip.actionId !== logTip.action.actionId) {
                console.warn(`[ReplayEngine] Tip mismatch. Kernel: ${kernelTip.actionId}, Log: ${logTip.action.actionId}`);
            }
        }

        console.log(`[ReplayEngine] Replay complete.`);
    }
}
