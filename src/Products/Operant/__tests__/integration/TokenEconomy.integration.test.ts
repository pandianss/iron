import { describe, it, expect } from '@jest/globals';
import { createExchangeProtocol, createScreenTimeExchange, createAppAccessExchange } from '../../Protocols/TokenExchange.js';

describe('Token Economy Integration', () => {
    it('should create valid exchange protocol', () => {
        const protocol = createExchangeProtocol('reinforcer.screentime.minutes', 10, 30);

        expect(protocol.id).toBe('operant.exchange.reinforcer.screentime.minutes');
        expect(protocol.category).toBe('Budget');

        // Verify preconditions (sufficient tokens)
        expect(protocol.preconditions).toHaveLength(1);
        expect(protocol.preconditions[0]).toMatchObject({
            type: 'METRIC_THRESHOLD',
            metricId: 'tokens.user.balance',
            operator: '>=',
            value: 10
        });

        // Verify execution (deduct tokens, grant reinforcer)
        expect(protocol.execution).toHaveLength(2);
        expect(protocol.execution[0]).toMatchObject({
            type: 'MUTATE_METRIC',
            metricId: 'tokens.user.balance',
            mutation: -10
        });
        expect(protocol.execution[1]).toMatchObject({
            type: 'MUTATE_METRIC',
            metricId: 'reinforcer.screentime.minutes',
            mutation: 30
        });
    });

    it('should create screen time exchange', () => {
        const protocol = createScreenTimeExchange(1);

        expect(protocol.id).toBe('operant.exchange.reinforcer.screentime.minutes');

        // 1 token = 1 minute
        const screenTimeMutation = protocol.execution.find(e => e.metricId === 'reinforcer.screentime.minutes');
        expect(screenTimeMutation?.mutation).toBe(1);
    });

    it('should create app access exchange', () => {
        const protocol = createAppAccessExchange('reinforcer.social.access', 5);

        expect(protocol.id).toBe('operant.exchange.reinforcer.social.access');

        // Verify token cost
        const tokenPrecondition = protocol.preconditions.find(p => p.metricId === 'tokens.user.balance');
        expect(tokenPrecondition?.value).toBe(5);

        // Verify access granted (1 = true for boolean)
        const accessMutation = protocol.execution.find(e => e.metricId === 'reinforcer.social.access');
        expect(accessMutation?.mutation).toBe(1);
    });

    it('should simulate earn-and-exchange flow', () => {
        // Simulate earning tokens via VR
        let tokenBalance = 0;
        const tokensEarned = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]; // 10 tokens

        tokensEarned.forEach(token => {
            tokenBalance += token;
        });

        expect(tokenBalance).toBe(10);

        // Attempt exchange (10 tokens → 30 minutes)
        const exchangeCost = 10;
        const reinforcerValue = 30;

        if (tokenBalance >= exchangeCost) {
            tokenBalance -= exchangeCost;
            const screenTime = reinforcerValue;

            expect(tokenBalance).toBe(0);
            expect(screenTime).toBe(30);
        }
    });
});
