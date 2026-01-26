
import { KernelPlatform } from '../../Platform/KernelPlatform.js';
import type { Command } from '../../Platform/KernelPlatform.js';
import { randomNonce } from '../../L0/Crypto.js';

export interface WalletState {
    id: string;
    owner: string;
    balance: number;
    status: 'ACTIVE' | 'LOCKED' | 'EMPTY';
}

/**
 * WalletService: Headless Product (Stratum II/III)
 * Consumers: CLI, API, Mobile App.
 * Provider: KernelPlatform.
 */
export class WalletService {
    constructor(private platform: KernelPlatform) { }

    /**
     * Create a new digital vault for a user.
     */
    public async createWallet(userId: string, initialBalance: number): Promise<string> {
        const walletId = `wallet.${userId}.${randomNonce(4)}`;

        // This command maps intent to the 'iron.protocol.budget.v1' (or a new Wallet protocol)
        const cmd: Command = {
            id: randomNonce(),
            userId: userId,
            target: walletId,
            operation: 'iron.protocol.wallet.init',
            payload: initialBalance,
            signature: '00'.repeat(64) // Valid hex mock
        };

        await this.platform.execute(cmd);
        return walletId;
    }

    /**
     * Perform a treasury transfer.
     */
    public async transfer(fromUserId: string, targetWallet: string, amount: number): Promise<void> {
        const cmd: Command = {
            id: randomNonce(),
            userId: fromUserId,
            target: targetWallet,
            operation: 'iron.protocol.budget.v1',
            payload: amount,
            signature: '00'.repeat(64)
        };

        await this.platform.execute(cmd);
    }

    /**
     * Inspect wallet state via the platform query.
     */
    public getWallet(walletId: string): WalletState | null {
        const balance = this.platform.query(walletId);
        if (balance === undefined) return null;

        return {
            id: walletId,
            owner: 'tbd', // Metadata not in L0 state yet
            balance: balance,
            status: 'ACTIVE'
        };
    }
}
