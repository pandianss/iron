
import express from 'express';
import cors from 'cors';
import { GovernanceKernel } from '../../kernel-core/Kernel.js';
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
        this.app.get('/api/audit/recent', async (req, res) => {
            const limit = Number(req.query.limit) || 50;
            const history = await this.iface.getRecentAudits(limit);
            res.json({ ok: true, count: history.length, data: history });
        });

        // --- Authority Graph (XIV.2) ---
        this.app.get('/api/authority/graph', (req, res) => {
            const root = req.query.root ? String(req.query.root) : 'genesis';
            const graph = this.iface.getAuthorityGraph(root);
            res.json({ ok: true, data: graph });
        });

        // --- Violations (XIV.4) ---
        this.app.get('/api/violations', async (req, res) => {
            const reports = await this.iface.getBreachReports();
            res.json({ ok: true, count: reports.length, data: reports });
        });

        this.app.post('/api/studio/validate', (req, res) => {
            // Lazy load to avoid circular deps if possible, or just import at top
            const { ProtocolSchema } = require('../../../kernel-core/L4/ProtocolTypes.js');
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
                const { SimulationEngine } = require('../../../kernel-core/L3/Simulation.js');
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

        // --- IRE: Risk Engine (Stratum IV) ---
        this.app.get('/api/ire/risks', (req, res) => {
            const { RiskRegistry } = require('../../Solutions/IRE/RiskRegistry.js');
            // In real app, singleton registry
            const registry = new RiskRegistry();
            res.json({ ok: true, data: registry.getRisks() });
        });

        this.app.get('/api/ire/compliance', (req, res) => {
            const { RiskRegistry } = require('../../Solutions/IRE/RiskRegistry.js');
            const registry = new RiskRegistry();

            // Get Active Protocols from Kernel
            const protocols = (this.kernel as any).protocols; // ProtocolEngine
            const activeList: any[] = [];
            // Access private map via iteration if possible or just use a helper
            // ProtocolEngine has private map. We need a public getter in ProtocolEngine or cast.
            // (this.kernel as any).protocols.protocols is the map
            (protocols as any).protocols.forEach((p: any) => activeList.push(p));

            const risks = registry.getRisks();
            const scorecard = risks.map((r: any) => ({
                riskId: r.id,
                name: r.name,
                severity: r.severity,
                mitigated: registry.assessMitigation(activeList, r.id)
            }));

            res.json({ ok: true, data: scorecard });
        });
    }


    public start() {
        this.app.listen(this.port, () => {
            console.log(`[IRON Console] Server running on http://localhost:${this.port}`);
            console.log(`[IRON Console] Linked to Kernel State: ACTIVE`);
        });
    }
}
