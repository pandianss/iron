
import { StateModel } from './State.js';

// --- Prediction Models ---

export interface Forecast {
    metricId: string;
    horizon: number; // ticks into future
    predictedValue: number;
    confidenceLow: number;
    confidenceHigh: number;
}

export class TrendAnalyzer {
    constructor(private state: StateModel) { }

    // Simple Linear Regression over last N points
    public forecast(metricId: string, horizon: number, historyDepth: number = 10): Forecast | null {
        const history = this.state.getHistory(metricId);
        if (history.length < 2) return null;

        const points = history.slice(-historyDepth).map((h, i) => {
            // Parse timestamp simply for linear reg? Or just use index?
            // Let's use index for simplicity in this MVP
            return { x: i, y: Number(h.value) }; // Assuming numeric metric
        });

        if (isNaN(points[0].y)) return null; // Non-numeric metric

        // y = mx + c
        const n = points.length;
        const sumX = points.reduce((a, b) => a + b.x, 0);
        const sumY = points.reduce((a, b) => a + b.y, 0);
        const sumXY = points.reduce((a, b) => a + (b.x * b.y), 0);
        const sumXX = points.reduce((a, b) => a + (b.x * b.x), 0);

        const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const c = (sumY - m * sumX) / n;

        // Predict
        // current x is n-1. Target is n-1 + horizon.
        const targetX = (n - 1) + horizon;
        const predictedValue = m * targetX + c;

        // Calculate basic error (std dev of residuals) for confidence band
        // This is a naive heuristic for correct "Risk Layer"
        const residuals = points.map(p => (m * p.x + c) - p.y);
        const variance = residuals.reduce((a, r) => a + r * r, 0) / n;
        const stdDev = Math.sqrt(variance);

        // arbitrary 95% confidence multiplier (approx 2 sigma)
        const confidenceBand = stdDev * 2;

        return {
            metricId,
            horizon,
            predictedValue,
            confidenceLow: predictedValue - confidenceBand,
            confidenceHigh: predictedValue + confidenceBand
        };
    }
}

// --- Scenario ---
export class Scenario {
    constructor(public name: string, public mutations: Record<string, any>) { }
}

export class ScenarioModel {
    // "What will happen if nothing changes" is the base case (TrendAnalyzer)
}
