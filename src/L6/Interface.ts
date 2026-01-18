
// src/L6/Interface.ts
import { StateModel } from '../L2/State';
import { AuditLog } from '../L5/Audit';

export class GovernanceInterface {
    constructor(private state: StateModel, private log: AuditLog) { }

    public getTruth(id: string) { return this.state.get(id); }

    public getAudit(id: string) {
        return this.log.getHistory(); // Returns LogEntry[] with Intent
    }
}
