import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { GovernanceKernel } from '../kernel-core/Kernel.js';
import { SQLiteEventStore } from '../infrastructure/persistence/SQLiteEventStore.js';
import { AuditLog } from '../kernel-core/L5/Audit.js';
import { IdentityManager, AuthorityEngine } from '../kernel-core/L1/Identity.js';
import { StateModel, MetricRegistry } from '../kernel-core/L2/State.js';
import { ProtocolEngine } from '../kernel-core/L4/Protocol.js';
import { ReplayEngine } from '../kernel-core/L0/Replay.js';
import type { Action } from '../kernel-core/L0/Ontology.js';

export class IronServer {
    private app: express.Express;
    private kernel: GovernanceKernel;
    private eventStore: SQLiteEventStore;

    constructor(private port: number = 3000) {
        this.app = express();
        this.app.use(cors());
        this.app.use(bodyParser.json());

        // 1. Initialize Infrastructure
        this.eventStore = new SQLiteEventStore();
        const audit = new AuditLog(this.eventStore);

        // 2. Initialize Kernel Components
        const registry = new MetricRegistry();
        const identity = new IdentityManager();
        const authority = new AuthorityEngine(identity);
        const state = new StateModel(audit, registry, identity);
        const protocols = new ProtocolEngine(state);

        // 3. Initialize Kernel
        this.kernel = new GovernanceKernel(identity, authority, state, protocols, audit, registry);

        // 4. Setup Routes
        this.setupRoutes();
    }

    public async start() {
        await this.boot();
    }

    private async boot() {
        // Replay History
        console.log("IronServer: Replaying History...");
        const replay = new ReplayEngine();
        await replay.replay(this.kernel['audit'], this.kernel);

        // Boot Kernel
        this.kernel.boot();
        console.log("IronServer: Kernel Active.");

        this.app.listen(this.port, () => {
            console.log(`IronServer: Listening on port ${this.port}`);
        });
    }

    private setupRoutes() {
        // Debug Middleware
        this.app.use((req, res, next) => {
            console.log(`[IronServer] ${req.method} ${req.url}`);
            next();
        });

        // State Query
        this.app.get('/state', (req, res) => {
            res.json(this.kernel.State.getSnapshotChain());
        });

        this.app.get('/state/:metricId', (req, res) => {
            const val = this.kernel.State.get(req.params.metricId);
            res.json({ metricId: req.params.metricId, value: val });
        });

        // Audit Query
        this.app.get('/audit', async (req, res) => {
            const history = await this.eventStore.getHistory();
            res.json(history);
        });

        // Action Execution
        this.app.post('/execute', async (req, res) => {
            try {
                const action: Action = req.body;

                // Basic Validation
                if (!action.actionId || !action.initiator || !action.payload) {
                    res.status(400).json({ error: "Invalid Action Structure" });
                    return;
                }

                const commit = await this.kernel.execute(action);
                res.json(commit);
            } catch (e: any) {
                console.error("Execute Error:", e.message);
                res.status(500).json({ error: e.message });
            }
        });
    }
}

// Start if run directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const server = new IronServer(3000);
    server.start();
}
