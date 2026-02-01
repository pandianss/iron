
import { describe, test, expect, beforeEach } from '@jest/globals';
import { ProtocolEngine } from '../../../kernel-core/L4/Protocol.js';
import { StateModel } from '../../../kernel-core/L2/State.js';
import { Sovereign_Silence_Protocol, Sovereign_Silence_Escalation } from '../Protocols/SovereignSilence.js';
import { Medical_Emergency_Protocol } from '../Protocols/MedicalEmergency.js';

describe('Iron Wallet: Continuity Protocols', () => {
    let engine: ProtocolEngine;
    let mockState: StateModel;

    beforeEach(() => {
        // Mock StateModel as we only test Protocol Registration (syntax/validity), not full execution here
        mockState = {} as unknown as StateModel;
        engine = new ProtocolEngine(mockState);
    });

    test('Should validly propose Sovereign Silence protocols', () => {
        const p1 = Sovereign_Silence_Protocol;
        const id1 = engine.propose(p1);
        expect(engine.get(id1)?.lifecycle).toBe('PROPOSED');
        expect(engine.get(id1)?.id).toBe('iron.wallet.continuity.silence.v1');

        const p2 = Sovereign_Silence_Escalation;
        const id2 = engine.propose(p2);
        expect(engine.get(id2)?.category).toBe('Continuity');
    });

    test('Should validly propose Medical Emergency protocol', () => {
        const p = Medical_Emergency_Protocol;
        const id = engine.propose(p);

        expect(engine.get(id)?.lifecycle).toBe('PROPOSED');
        // Validate strictness
        expect(engine.get(id)?.strict).toBe(true);
        // Validate preconditions structure (basic check)
        expect(engine.get(id)?.preconditions?.length).toBe(3);
    });
});
