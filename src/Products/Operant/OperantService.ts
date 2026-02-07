import { KernelPlatform } from '../../Platform/KernelPlatform.js';
import { ActionFactory } from '../../kernel-core/L2/ActionFactory.js';
import { registerOperantMetrics } from './Metrics.js';
import type { MetricRegistry } from '../../kernel-core/L2/State.js';
import type { Ed25519PrivateKey } from '../../kernel-core/L0/Crypto.js';

/**
 * OperantService: Main interface for Skinnerian behavioural modification
 * 
 * This service acts as the "external controlling agency" that manipulates
 * environmental variables (reinforcement, deprivation, discriminative stimuli)
 * to predict and control user behaviour.
 */
export class OperantService {
    constructor(
        private platform: KernelPlatform,
        private registry: MetricRegistry
    ) {
        // Register all Operant metrics
        registerOperantMetrics(this.registry);
    }

    /**
     * Record an operant (behaviour) emission
     */
    public async recordOperant(
        operantId: string,
        value: number,
        initiator: string,
        privateKey: Ed25519PrivateKey
    ): Promise<void> {
        await this.platform.executeDirect(
            initiator,
            operantId,
            'operant.record',
            value,
            'GOVERNANCE_SIGNATURE' // Placeholder or actual signature if available
        );
    }

    /**
     * Get current token balance
     */
    public getTokenBalance(): number {
        return this.platform.query('tokens.user.balance') || 0;
    }

    /**
     * Exchange tokens for reinforcer
     */
    public async exchangeTokens(
        reinforcerId: string,
        tokenCost: number,
        initiator: string,
        privateKey: Ed25519PrivateKey
    ): Promise<void> {
        // Create action to trigger token exchange protocol
        await this.platform.executeDirect(
            initiator,
            'tokens.user.balance',
            `operant.exchange.${reinforcerId}`,
            -tokenCost,
            'GOVERNANCE_SIGNATURE'
        );
    }

    /**
     * Get reinforcer access status
     */
    public getReinforcerAccess(reinforcerId: string): boolean {
        return this.platform.query(reinforcerId) || false;
    }

    /**
     * Get current shaping threshold
     */
    public getShapingThreshold(): number {
        return this.platform.query('shaping.threshold.current') || 0;
    }

    /**
     * Get operant history from audit log
     */
    public getOperantHistory(operantId: string): any[] {
        // Query state history for this metric
        const history = this.platform.getHistory(operantId);
        return history || [];
    }
}
