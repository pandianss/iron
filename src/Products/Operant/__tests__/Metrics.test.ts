import { describe, it, expect, beforeEach } from '@jest/globals';
import { MetricRegistry } from '../../../kernel-core/L2/State.js';
import { registerOperantMetrics, OperantMetrics } from '../Metrics.js';

describe('Operant Metrics', () => {
    let registry: MetricRegistry;

    beforeEach(() => {
        registry = new MetricRegistry();
        registerOperantMetrics(registry);
    });

    it('should register all operant metrics', () => {
        const metricIds = Object.keys(OperantMetrics);

        metricIds.forEach(id => {
            const metric = registry.get(id);
            expect(metric).toBeDefined();
            expect(metric?.id).toBe(id);
        });
    });

    it('should validate operant.writing.words', () => {
        const metric = registry.get('operant.writing.words');
        expect(metric).toBeDefined();
        expect(metric?.validator?.(500)).toBe(true);
        expect(metric?.validator?.(-10)).toBe(false);
        expect(metric?.validator?.('invalid')).toBe(false);
    });

    it('should validate tokens.user.balance', () => {
        const metric = registry.get('tokens.user.balance');
        expect(metric).toBeDefined();
        expect(metric?.validator?.(100)).toBe(true);
        expect(metric?.validator?.(-5)).toBe(false);
    });

    it('should validate reinforcer.social.access', () => {
        const metric = registry.get('reinforcer.social.access');
        expect(metric).toBeDefined();
        expect(metric?.validator?.(true)).toBe(true);
        expect(metric?.validator?.(false)).toBe(true);
        expect(metric?.validator?.('yes')).toBe(false);
    });

    it('should validate vr.probability', () => {
        const metric = registry.get('vr.probability');
        expect(metric).toBeDefined();
        expect(metric?.validator?.(0.5)).toBe(true);
        expect(metric?.validator?.(0)).toBe(true);
        expect(metric?.validator?.(1)).toBe(true);
        expect(metric?.validator?.(1.5)).toBe(false);
        expect(metric?.validator?.(-0.1)).toBe(false);
    });

    it('should validate time.hour', () => {
        const metric = registry.get('time.hour');
        expect(metric).toBeDefined();
        expect(metric?.validator?.(12)).toBe(true);
        expect(metric?.validator?.(0)).toBe(true);
        expect(metric?.validator?.(23)).toBe(true);
        expect(metric?.validator?.(24)).toBe(false);
        expect(metric?.validator?.(-1)).toBe(false);
    });
});
