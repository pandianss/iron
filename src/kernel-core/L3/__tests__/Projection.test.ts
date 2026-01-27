import { jest, describe, test, expect } from '@jest/globals';
import { ProjectionEngine } from '../Projections.js';
import type { Projection } from '../Projections.js';
import type { Evidence } from '../../L5/Audit.js';

class SumProjection implements Projection<{ total: number }> {
    public name = 'SumProjection';
    public version = '1.0.0';
    private total = 0;

    reset() { this.total = 0; }

    apply(ev: Evidence) {
        if (ev.status === 'SUCCESS' && ev.action.payload.metricId === 'wealth') {
            this.total += Number(ev.action.payload.value);
        }
    }

    getState() { return { total: this.total }; }
}

describe('Projection Framework', () => {
    test('should replay audit log into projection', () => {
        const engine = new ProjectionEngine();
        const sumProj = new SumProjection();
        engine.register(sumProj);

        const events: Evidence[] = [
            {
                evidenceId: '1', previousEvidenceId: '0', timestamp: '0:0', status: 'SUCCESS',
                action: {
                    actionId: 'a1', initiator: 'alice', timestamp: '0:0', expiresAt: '1:0', signature: 's1',
                    payload: { metricId: 'wealth', value: 10 }
                }
            },
            {
                evidenceId: '2', previousEvidenceId: '1', timestamp: '1:0', status: 'SUCCESS',
                action: {
                    actionId: 'a2', initiator: 'alice', timestamp: '1:0', expiresAt: '2:0', signature: 's2',
                    payload: { metricId: 'wealth', value: 20 }
                }
            },
            {
                evidenceId: '3', previousEvidenceId: '2', timestamp: '2:0', status: 'REJECT',
                action: {
                    actionId: 'a3', initiator: 'alice', timestamp: '2:0', expiresAt: '3:0', signature: 's3',
                    payload: { metricId: 'wealth', value: 100 }
                }
            }
        ];

        events.forEach(e => engine.apply(e));

        expect(sumProj.getState().total).toBe(30);
    });
});
