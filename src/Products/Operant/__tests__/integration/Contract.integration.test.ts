import { describe, it, expect } from '@jest/globals';
import { createContractProtocol, createContractSuccessProtocol, createEscalatingContractProtocol } from '../../Protocols/Contract.js';

describe('Contract Integration', () => {
    it('should create valid contract failure protocol', () => {
        const protocol = createContractProtocol('operant.writing.words', 500, 50, 18);

        expect(protocol.id).toBe('operant.contract.operant.writing.words');
        expect(protocol.category).toBe('Accountability');
        expect(protocol.strict).toBe(true); // Must execute

        // Verify preconditions (target not met + deadline reached)
        expect(protocol.preconditions).toHaveLength(2);
        expect(protocol.preconditions[0]).toMatchObject({
            type: 'METRIC_THRESHOLD',
            metricId: 'operant.writing.words',
            operator: '<',
            value: 500
        });
        expect(protocol.preconditions[1]).toMatchObject({
            type: 'METRIC_THRESHOLD',
            metricId: 'time.hour',
            operator: '==',
            value: 18
        });

        // Verify execution (transfer escrow to charity)
        expect(protocol.execution).toHaveLength(2);
        expect(protocol.execution[0]).toMatchObject({
            type: 'MUTATE_METRIC',
            metricId: 'contract.escrow.usd',
            mutation: -50
        });
        expect(protocol.execution[1]).toMatchObject({
            type: 'MUTATE_METRIC',
            metricId: 'charity.disliked.donation',
            mutation: 50
        });
    });

    it('should create valid contract success protocol', () => {
        const protocol = createContractSuccessProtocol('operant.writing.words', 500, 50, 18);

        expect(protocol.id).toBe('operant.contract.success.operant.writing.words');

        // Verify preconditions (target MET + deadline reached)
        expect(protocol.preconditions[0]).toMatchObject({
            type: 'METRIC_THRESHOLD',
            metricId: 'operant.writing.words',
            operator: '>=',
            value: 500
        });

        // Verify execution (return escrow as tokens)
        const tokenMutation = protocol.execution.find(e => e.metricId === 'tokens.user.balance');
        expect(tokenMutation?.mutation).toBe(50);
    });

    it('should create escalating contract protocol', () => {
        const baseEscrow = 50;
        const failureCount = 2;
        const protocol = createEscalatingContractProtocol('operant.run.distance', 5, baseEscrow, failureCount, 18);

        expect(protocol.id).toBe('operant.contract.escalating.operant.run.distance');

        // Escrow should double for each failure: 50 * 2^2 = 200
        const expectedEscrow = baseEscrow * Math.pow(2, failureCount);
        expect(expectedEscrow).toBe(200);

        // Verify escalated amount in execution
        const charityMutation = protocol.execution.find(e => e.metricId === 'charity.disliked.donation');
        expect(charityMutation?.mutation).toBe(200);

        // Verify failure count incremented
        const failureCountMutation = protocol.execution.find(e => e.metricId === 'contract.failure.count');
        expect(failureCountMutation?.mutation).toBe(1);
    });

    it('should simulate contract failure scenario', () => {
        // Setup
        let escrow = 50;
        let charityDonation = 0;
        const targetWords = 500;
        const actualWords = 300; // Failed to meet target
        const currentHour = 18; // Deadline

        // Check preconditions
        const targetNotMet = actualWords < targetWords;
        const deadlineReached = currentHour === 18;

        if (targetNotMet && deadlineReached) {
            // Execute contract failure
            charityDonation += escrow;
            escrow = 0;
        }

        expect(escrow).toBe(0);
        expect(charityDonation).toBe(50);
    });

    it('should simulate contract success scenario', () => {
        // Setup
        let escrow = 50;
        let tokenBalance = 0;
        const targetWords = 500;
        const actualWords = 500; // Met target
        const currentHour = 18; // Deadline

        // Check preconditions
        const targetMet = actualWords >= targetWords;
        const deadlineReached = currentHour === 18;

        if (targetMet && deadlineReached) {
            // Execute contract success
            tokenBalance += escrow;
            escrow = 0;
        }

        expect(escrow).toBe(0);
        expect(tokenBalance).toBe(50);
    });
});
