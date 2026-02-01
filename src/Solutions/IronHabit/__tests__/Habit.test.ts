
import { describe, test, expect, beforeEach } from '@jest/globals';
import { ProtocolEngine } from '../../../kernel-core/L4/Protocol.js';
import { StateModel } from '../../../kernel-core/L2/State.js';
import { Daily_Journal_Protocol, Rest_Day_Protocol } from '../Protocols/DailyHabit.js';

describe('Iron Habit: Protocols', () => {
    let engine: ProtocolEngine;
    let mockState: StateModel;

    beforeEach(() => {
        mockState = {} as unknown as StateModel;
        engine = new ProtocolEngine(mockState);
    });

    test('Should validly propose Daily Journal', () => {
        const id = engine.propose(Daily_Journal_Protocol);
        expect(engine.get(id)?.category).toBe('Habit');
        expect(engine.get(id)?.execution[0].metricId).toBe('habit.journal.streak');
    });

    test('Should validly propose Rest Day logic', () => {
        const id = engine.propose(Rest_Day_Protocol);
        expect(engine.get(id)?.category).toBe('Budget'); // "Rest" consumes budget
        // Check prerequisite
        expect(engine.get(id)?.preconditions[0].metricId).toBe('user.gamification.rest_tokens');
    });
});
