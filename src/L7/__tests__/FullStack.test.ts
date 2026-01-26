
import { describe, test, expect, beforeEach } from '@jest/globals';
import { GovernanceInterface } from '../../L6/Interface.js';
import { SovereignApp } from '../App.js';
import { generateKeyPair } from '../../L0/Crypto.js';

// Mocks for Solutions
const mockWallet = { initializeWallet: async () => { } } as any;
const mockHabit = {
    startDiscipline: async () => { },
    checkIn: async () => ({ status: 'COMMITTED' })
} as any;
const mockTeam = {
    initializeOrg: async () => { },
    syncTeam: async () => ({ status: 'COMMITTED' })
} as any;
const mockPerformance = {
    initializePerformance: async () => { },
    getScorecard: () => ({ authority: 'ACTIVE', discipline: 42 }),
    getConsole: () => ({ orgHealth: 95, overallVelocity: 1.5, driftAlert: 'NOMINAL' })
} as any;
const mockIntelligence = {
    initializeIntelligence: async () => { },
    runWhatIf: async () => ({ predictedValue: 100 })
} as any;

describe('Sovereign App: Integrated Frontend Layer', () => {
    let app: SovereignApp;
    let mockGateway: any;
    const { publicKey, privateKey } = generateKeyPair();

    beforeEach(() => {
        mockGateway = {
            getTruth: (m: string) => (m === 'standing' ? 'SOVEREIGN' : 100),
            submit: () => ({ attemptId: 'tx1', timestamp: '0:0', status: 'ACCEPTED' })
        };

        app = new SovereignApp(
            mockGateway as any,
            mockWallet,
            mockHabit,
            mockTeam,
            mockPerformance,
            mockIntelligence
        );
        app.login('user1', { publicKey, privateKey });
    });

    test('Aggregate Dashboard: Pulls truth from all solutions', () => {
        const dashboard = app.getDashboard();

        expect(dashboard.userId).toBe('user1');
        expect(dashboard.solutions.wallet).toBe('ACTIVE');
        expect(dashboard.solutions.habit).toBe(42);
        expect(dashboard.solutions.team).toBe(95);
        expect(dashboard.solutions.performance).toBe(1.5);
    });

    test('Strategic Action: Habit Check-In flows to Solution', async () => {
        const result: any = await app.dailyCheckIn('proof-hash');
        expect(result.status).toBe('COMMITTED');
    });

    test('Simulation: Forecasting flows to Intelligence', async () => {
        const preview = await app.simulateShift({ metric: 'burn', val: 50 });
        if (!preview) throw new Error("Simulation failed");
        expect(preview.predictedValue).toBe(100);
    });
});
