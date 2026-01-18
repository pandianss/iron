
// src/L4/Protocol.ts
import { StateModel } from '../L2/State';
import { IntentFactory } from '../L2/IntentFactory';
import { LogicalTimestamp } from '../L0/Kernel';
import { PrincipalId } from '../L1/Identity';
import { Ed25519PrivateKey } from '../L0/Crypto';

export interface Protocol {
    id: string;
    triggerMetric: string;
    threshold: number;
    actionMetric: string;
    actionMutation: number;
}

export class ProtocolEngine {
    private protocols: Map<string, Protocol> = new Map();

    constructor(private state: StateModel) { }

    register(p: Protocol) { this.protocols.set(p.id, p); }

    // Execution now requires cryptographic authority (PrivateKey)
    evaluateAndExecute(authority: PrincipalId, privateKey: Ed25519PrivateKey, time: LogicalTimestamp) {
        for (const p of this.protocols.values()) {
            const val = Number(this.state.get(p.triggerMetric));
            if (!isNaN(val) && val > p.threshold) {
                // Execute
                const current = Number(this.state.get(p.actionMetric) || 0);
                const newVal = current + p.actionMutation;

                const intent = IntentFactory.create(
                    p.actionMetric,
                    newVal,
                    authority,
                    privateKey
                );

                this.state.apply(intent);
            }
        }
    }
}
