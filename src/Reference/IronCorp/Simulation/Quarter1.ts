
import { GovernanceKernel } from '../../../Kernel.js';
import { IdentityManager, AuthorityEngine } from '../../../L1/Identity.js';
import { StateModel, MetricRegistry, MetricType } from '../../../L2/State.js';
import { ProtocolEngine } from '../../../L4/Protocol.js';
import { AuditLog } from '../../../L5/Audit.js';
import { IronCorpIdentities, IronCorpOrgChar } from '../Seed.js';
import { BudgetProtocol } from '../Protocols/Budget.js';
import { SecurityProtocol } from '../Protocols/Security.js';
import * as ed from '@noble/ed25519';
import { LogicalTimestamp, Budget, BudgetType } from '../../../L0/Kernel.js';

// Setup Helper
async function setupIronCorp() {
    const idMan = new IdentityManager();
    // 1. Register Org Chart
    IronCorpOrgChar.forEach(e => idMan.register(e));

    const auth = new AuthorityEngine(idMan);
    // 2. Grant Root Authorities
    // CEO -> CFO (Budget)
    const now = '0:0';
    // We access authority engine directly for genesis seeding
    auth.grant('auth.genesis.cfo', 'iron.ceo', 'iron.cfo', 'finance.opex.remaining', '*', now, 'GOVERNANCE_SIGNATURE');

    // 3. Metrics
    const registry = new MetricRegistry();
    registry.register({ id: 'finance.opex.remaining', type: MetricType.COUNTER, description: 'Q1 OPEX Budget' });
    registry.register({ id: 'security.defcon', type: MetricType.GAUGE, description: 'DEFCON Level' });
    registry.register({ id: 'system.config.port', type: MetricType.GAUGE, description: 'Server Port' });

    const audit = new AuditLog();
    const state = new StateModel(audit, registry, idMan);
    const protos = new ProtocolEngine(state);
    const kernel = new GovernanceKernel(idMan, auth, state, protos, audit, registry);

    // Boot
    await kernel.boot();

    // 4. Install Protocols
    protos.propose(BudgetProtocol);
    protos.ratify(BudgetProtocol.id!, 'GENESIS_SIG');
    protos.activate(BudgetProtocol.id!);

    protos.propose(SecurityProtocol);
    protos.ratify(SecurityProtocol.id!, 'GENESIS_SIG');
    protos.activate(SecurityProtocol.id!);

    // 5. Initial State
    // CEO sets Budget to 100
    // We need to construct a valid signed action.
    const setBudgetAction = createAction(
        IronCorpIdentities.CEO,
        'finance.opex.remaining',
        100,
        'param:init'
    );
    // Apply via Kernel (Root bypasses some protocol checks or we rely on 'param:init' being un-governed/system)
    // Actually, to set the initial value, we might need a trusted call or a protocol that allows 'INIT'.
    // For simplicity, we use `state.applyTrusted` to "Seed" the ledger, simulating a prior quarter carry-over.
    state.applyTrusted({ metricId: 'finance.opex.remaining', value: 100 }, '0:1', 'iron.system');
    state.applyTrusted({ metricId: 'security.defcon', value: 3 }, '0:1', 'iron.system');

    return { kernel, state, audit };
}

function createAction(identity: { priv: Uint8Array, pub: string }, metricId: string, value: any, protocolId: string = 'iron.protocol.budget.v1') {
    const ts = Date.now().toString();
    const payload = { protocolId, metricId, value };
    const initiator = Object.keys(IronCorpIdentities).find(k => (IronCorpIdentities as any)[k].pub === identity.pub)?.toLowerCase();
    const actorId = `iron.${initiator}`; // Mapping convention from Seed

    const actionId = Buffer.from(ed.utils.randomPrivateKey().slice(0, 32)).toString('hex');
    const data = `${actionId}:${actorId}:${JSON.stringify(payload)}:${ts}:0`;
    const sig = ed.sign(Buffer.from(data), identity.priv);

    return {
        actionId,
        initiator: actorId,
        payload,
        timestamp: ts,
        expiresAt: '0',
        signature: Buffer.from(sig).toString('hex')
    };
}

// --- SIMULATION ---
async function run() {
    console.log("=== IronCorp Q1 Simulation Start ===");
    const { kernel, state, audit } = await setupIronCorp();

    // Scenario 1: CFO Spends Money (Valid)
    console.log("\n[Step 1] CFO Authorizes $10 Spend...");
    const spendAction = createAction(IronCorpIdentities.CFO, 'finance.opex.remaining', 90, BudgetProtocol.id!);
    // Wait, the protocol MUTATES by -1? No, the protocol says "MUTATION: -1". 
    // The action payload might be ignored if the protocol enforces the mutation, OR the protocol validates the payload.
    // In our simplified MVP, `ProtocolEngine.evaluate` returns mutations based on rules.
    // If Rule is `MUTATE_METRIC` with `mutation: -1`, it decrements regardless of payload?
    // Let's assume the Action drives the State, and Protocol Vetoes it?
    // Actually `Protocol.ts` `getRulesMutations` applies the mutation defined in the rule using the current state.
    // If the Rule says `mutation: -1`, it ignores the action value? 
    // This is `Habit` behavior. 
    // For `Intent` behavior (CFO sets budget to 90), the rule should be different or absent (allow mutation).
    // Let's stick to the deployed protocol: It decrements by 1 per action. So CFO "Approves a Transaction".

    try {
        kernel.execute(spendAction);
        console.log("SUCCESS: Budget Decremented via Protocol.");
    } catch (e: any) {
        console.error("FAIL:", e.message);
    }

    console.log("Current Budget:", state.get('finance.opex.remaining')); // Should be 99 (100 - 1)

    // Scenario 2: CTO Spends Money (Invalid - Not in Jurisdiction? Or just Protocol applies same logic?)
    // Currently AuthorityEngine checks Jurisdiction. We haven't set up delegations fully.
    // So CTO might be rejected by AuthorityGuard if we enforced it.
    // But let's assume Authority is open for now (Root/System).

    // Scenario 3: Deplete Budget
    console.log("\n[Step 3] Rapid Spending...");
    for (let i = 0; i < 105; i++) {
        const a = createAction(IronCorpIdentities.CFO, 'finance.opex.remaining', 0, BudgetProtocol.id!);
        try {
            kernel.execute(a);
        } catch (e) {
            // Expected failures when budget hits 0
            // console.log(`Tx ${i} Failed`);
        }
    }

    console.log("Final Budget:", state.get('finance.opex.remaining')); // Should be 0, not negative.

    // Scenario 4: Audit
    console.log("\n[Step 4] Audit Report");
    const history = audit.getHistory();
    console.log(`Total Events: ${history.length}`);
    const rejections = history.filter(h => h.status === 'REJECT' || h.status === 'ABORTED');
    console.log(`Violations Prevented: ${rejections.length}`);

    console.log("=== Simulation Complete ===");
}

run();
