
import express from 'express';
import cors from 'cors';
import { GovernanceKernel } from '../../Kernel.js';
import { GovernanceInterface } from '../../L6/Interface.js';

export class ConsoleServer {
    private app = express();
    private port: number;

    constructor(
        private kernel: GovernanceKernel,
        private iface: GovernanceInterface,
        port: number = 3000
    ) {
        this.port = port;
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
    }

    private setupRoutes() {
        // --- Status ---
        this.app.get('/api/status', (req, res) => {
            res.json({
                lifecycle: this.kernel.Lifecycle,
                version: '1.0.0', // Protocol Version
                time: Date.now()
            });
        });

        // --- State Visualization (XIV.3) ---
        this.app.get('/api/state/snapshot', (req, res) => {
            try {
                const snapshot = this.iface.getStateSnapshot();
                res.json({ ok: true, data: snapshot });
            } catch (e: any) {
                res.status(500).json({ ok: false, error: e.message });
            }
        });

        this.app.get('/api/state/metric/:id', (req, res) => {
            const val = this.iface.getTruth(req.params.id);
            res.json({ ok: true, value: val?.value, meta: val });
        });

        // --- Audit Explorer (XIV.3) ---
        this.app.get('/api/audit/recent', (req, res) => {
            const limit = Number(req.query.limit) || 50;
            const history = this.iface.getRecentAudits(limit);
            res.json({ ok: true, count: history.length, data: history });
        });

        // --- Authority Graph (XIV.2) ---
        this.app.get('/api/authority/graph', (req, res) => {
            const root = req.query.root ? String(req.query.root) : 'genesis';
            const graph = this.iface.getAuthorityGraph(root);
            res.json({ ok: true, data: graph });
        });

        // --- Violations (XIV.4) ---
        this.app.get('/api/violations', (req, res) => {
            const reports = this.iface.getBreachReports();
            res.json({ ok: true, count: reports.length, data: reports });
        });

        // --- Studio: Validation (XIV.5) ---
        this.app.post('/api/studio/validate', (req, res) => {
            // Lazy load to avoid circular deps if possible, or just import at top
            const { ProtocolSchema } = require('../../../L4/ProtocolTypes.js');
            const result = ProtocolSchema.safeParse(req.body);
            if (result.success) {
                res.json({ ok: true, data: result.data });
            } else {
                res.json({ ok: false, errors: result.error.errors });
            }
        });

        // --- Studio: Simulation (XIV.5) ---
        this.app.post('/api/studio/simulate', (req, res) => {
            const draft = req.body.protocol;
            const horizon = req.body.horizon || 50;

            try {
                // 1. We need a Simulation Engine instance.
                // In a real app, this should be injected or singleton.
                // We'll instantiate a fresh one using the real Kernel components.
                const { SimulationEngine } = require('../../../L3/Simulation.js');
                // Kernel has protected properties, but we are inside Platform Trusted Layer.
                const state = (this.kernel as any).state;
                const registry = (this.kernel as any).registry;
                const protocols = (this.kernel as any).protocols;

                const sim = new SimulationEngine(registry, protocols);

                // 2. Run Simulation
                // We pass the draft protocol as 'extraProtocols' to be vetted.
                // Action is null (baseline forecast) or specifiable via body.
                // For Studio, we usually want to see "What happens if I click 'Simulate'?" implies "With NO action, just this protocol active".

                const forecast = sim.run(state, null, horizon, [draft]);

                res.json({ ok: true, forecast });
            } catch (e: any) {
                res.status(500).json({ ok: false, error: e.message });
            }
        });
    }

    public start() {
        this.app.listen(this.port, () => {
            console.log(`[IRON Console] Server running on http://localhost:${this.port}`);
            console.log(`[IRON Console] Linked to Kernel State: ACTIVE`);
        });
    }
}
