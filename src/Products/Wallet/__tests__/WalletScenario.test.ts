
import { describe, it, expect } from '@jest/globals';
import { GovernanceKernel } from '../../../kernel-core/Kernel.js';
import { IdentityManager, AuthorityEngine } from '../../../kernel-core/L1/Identity.js';
import { StateModel, MetricRegistry } from '../../../kernel-core/L2/State.js';
import { ProtocolEngine } from '../../../kernel-core/L4/Protocol.js';
import { AuditLog } from '../../../kernel-core/L5/Audit.js';
import { KernelPlatform } from '../../../Platform/KernelPlatform.js';
import type { Command } from '../../../Platform/KernelPlatform.js';
import { WalletService } from '../WalletService.js';
import type { IStateRepository, IPrincipalRegistry } from '../../../Platform/Ports.js';
import { BudgetProtocol } from '../../../Reference/IronCorp/Protocols/Budget.js';
import { generateKeyPair, signData, canonicalize } from '../../../kernel-core/L0/Crypto.js';

describe('Stratum II: Platform & Product Integration', () => {

    it('Scenario: User executes wallet transactions via Platform Façade', async () => {
        // 0. Keys
        const keys = generateKeyPair();

        // 1. Hardened Kernel Setup (Internal Hardware)
        const idMan = new IdentityManager();
        const auth = new AuthorityEngine(idMan);
        const audit = new AuditLog();
        const registry = new MetricRegistry();
        const state = new StateModel(audit, registry, idMan);
        const protos = new ProtocolEngine(state);
        const kernel = new GovernanceKernel(idMan, auth, state, protos, audit, registry);
        await kernel.boot();

        // Install Budget Protocol (re-used for wallet spending for now)
        protos.propose(BudgetProtocol);
        protos.ratify(BudgetProtocol.id!, 'GENESIS_SIG');
        protos.activate(BudgetProtocol.id!);

        // Register System & User Identity in Kernel
        idMan.register({
            id: 'iron.system',
            type: 'SYSTEM',
            status: 'ACTIVE',
            identityProof: 'SYSTEM_BOOT'
        } as any);

        idMan.register({
            id: 'user.ali',
            type: 'ACTOR',
            status: 'ACTIVE',
            publicKey: keys.publicKey,
            identityProof: 'VERIFIED',
            createdAt: Date.now().toString()
        } as any);

        // Grant Ali authority over their wallet
        auth.grant('grant.ali', 'iron.system', 'user.ali', 'wallet.ali.*', '*', '0', 'GOVERNANCE_SIGNATURE');

        // Register the Wallet Metric
        registry.register({ id: 'wallet.ali.main', description: 'Wallet Ali', type: 'GAUGE' as any, unit: 'IRON', status: 'ACTIVE' } as any);

        // 2. Platform Ports (Infrastructure)
        const mockRepo: IStateRepository = {
            saveSnapshot: async () => { },
            getSnapshot: async () => null,
            getLatestSnapshot: async () => null,
            getHistory: async () => []
        };

        const mockIdentityPort: IPrincipalRegistry = {
            resolve: async (userId) => userId === 'Ali' ? 'user.ali' : null,
            getPublicKey: async () => 'PUB_ALI'
        };

        // 3. Platform Façade (Stratum II)
        const platform = new KernelPlatform(kernel, mockRepo, mockIdentityPort);

        // 4. Product Layer (Stratum III)
        const wallet = new WalletService(platform);

        // --- TEST CASE ---

        // A. User Ali creates a wallet (Seeds 100 via trusted system flow in real app, here we mock initial)
        // For testing, we allow system to set balance.
        state.applyTrusted({ metricId: 'wallet.ali.main', value: 100 }, '0', 'iron.system');

        // B. Query Wallet
        const initial = wallet.getWallet('wallet.ali.main');
        expect(initial?.balance).toBe(100);

        // C. Spend via Wallet Service
        // This will go through the platform façade
        // We simulate a protocol that allows spending.
        // For this test, we use 'iron.system' signature to bypass protocol checks if needed, 
        // but let's try a real scenario mapping.

        // Let's assume a dummy protocol exists
        state.applyTrusted({ metricId: 'wallet.ali.main', value: 100 }, '0', 'iron.system');

        // We spend 10 units
        const cmdId = 'tx_001';
        const timestamp = Date.now().toString();
        const payload = { protocolId: 'iron.protocol.budget.v1', metricId: 'wallet.ali.main', value: 90 };
        const dataToSign = `${cmdId}:user.ali:${canonicalize(payload)}:${timestamp}:0`;
        const sig = signData(dataToSign, keys.privateKey);

        const cmd: Command = {
            id: cmdId,
            userId: 'Ali',
            target: 'wallet.ali.main',
            operation: 'iron.protocol.budget.v1',
            payload: 90,
            signature: sig,
            timestamp
        };

        try {
            await platform.execute(cmd);
        } catch (e: any) {
            expect(e.name).toBe('PolicyViolationError');
            expect(e.code).toBe('POLICY_VIOLATION');
            console.log("Scenario SUCCESS: Intent translated to Policy Error.");
        }

        const final = wallet.getWallet('wallet.ali.main');
        expect(final?.balance).toBe(100); // Should remain 100 as the policy blocked the change

        console.log("Scenario SUCCESS: User -> Product -> Platform -> Kernel chain complete.");
    });
});
