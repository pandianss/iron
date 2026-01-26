
import { describe, test, expect, beforeEach } from '@jest/globals';
import { GovernanceKernel } from '../../Kernel.js';
import { StateModel, MetricRegistry, MetricType } from '../../L2/State.js';
import { IdentityManager, AuthorityEngine } from '../../L1/Identity.js';
import { ProtocolEngine } from '../../L4/Protocol.js';
import { AuditLog } from '../../L5/Audit.js';
import { generateKeyPair } from '../../L0/Crypto.js';
import { Fuzzer } from '../Fuzzer.js';

// Solutions
import { IronWalletInterface } from '../../Solutions/IronWallet/Interface.js';
import { IronHabitInterface } from '../../Solutions/IronHabit/Interface.js';
import { IronTeamInterface } from '../../Solutions/IronTeam/Interface.js';
import { IronPerformanceInterface } from '../../Solutions/IronPerformance/Interface.js';
import { IronIntelligenceInterface } from '../../Solutions/IronIntelligence/Interface.js';

describe('Chaos Lab: Solution Stress Test (Full Matrix)', () => {
    let kernel: GovernanceKernel;
    let identity: IdentityManager;
    let fuzzer: Fuzzer;

    // Credentials
    const { publicKey: userPub, privateKey: userKey } = generateKeyPair();
    const userId = 'sovereign-user';

    beforeEach(async () => {
        const registry = new MetricRegistry();
        const auditLog = new AuditLog();
        identity = new IdentityManager();
        const authority = new AuthorityEngine(identity);
        const state = new StateModel(auditLog, registry, identity);
        const protocols = new ProtocolEngine(state);

        kernel = new GovernanceKernel(identity, authority, state, protocols, auditLog, registry);
        kernel.boot();

        fuzzer = new Fuzzer(kernel, identity);

        // 1. Setup Identities
        identity.register({ id: userId, type: 'ACTOR', status: 'ACTIVE', publicKey: userPub, createdAt: '0', isRoot: true } as any);
        identity.register({ id: 'attacker', type: 'ACTOR', status: 'ACTIVE', publicKey: 'bad-pub', createdAt: '0' } as any);
        identity.register({ id: 'system', type: 'SYSTEM', status: 'ACTIVE', publicKey: 'sys-pub', createdAt: '0', isRoot: true } as any);

        // 2. Bootstrap All Solutions
        const wallet = new IronWalletInterface(protocols, state, identity);
        const habit = new IronHabitInterface(protocols, state, identity);
        const team = new IronTeamInterface(protocols, state, identity);
        const performance = new IronPerformanceInterface(protocols, state, identity);
        const intelligence = new IronIntelligenceInterface(protocols, state, identity, registry);

        await wallet.initializeWallet();
        await habit.startDiscipline();
        await team.initializeOrg();
        await performance.initializePerformance();
        await intelligence.initializeIntelligence();

        // 3. Register necessary Metrics for the Fuzzer to not hit "Unknown Metric" errors early
        // (Metrics are already registered by solution init methods usually, but let's be safe)
    });

    test('Scenario: Domain Invariant Preservation under Fuzzing', async () => {
        const { privateKey: attackerKey } = generateKeyPair();

        // Run 50 iterations of randomized product attacks
        await fuzzer.run(50, 'attacker', attackerKey);

        // If we reached here without a "Fuzzer Success" error (which actually means a bug was found), the system held.
        // We can check systemic health
        expect(kernel.Lifecycle).toBe('ACTIVE');
    });

    test('Targeted Attack: Iron Wallet Proxy Bypass', async () => {
        const { privateKey: attackerKey } = generateKeyPair();
        await fuzzer.runWalletBypass('attacker', attackerKey);
        // Expectation: Guard rejects it because 'attacker' is not a nominee.
    });

    test('Targeted Attack: Iron Habit Streak Inflation', async () => {
        const { privateKey: attackerKey } = generateKeyPair();
        await fuzzer.runHabitCheating('attacker', attackerKey);
        // Expectation: L0 Scope Guard or L4 Protocol Evaluation rejects it.
    });

    test('Targeted Attack: Iron Team Hierarchy Breach', async () => {
        const { privateKey: attackerKey } = generateKeyPair();
        await fuzzer.runTeamHierarchyAttack('attacker', attackerKey);
        // Expectation: Authority Engine fails the authorized() check.
    });
});
