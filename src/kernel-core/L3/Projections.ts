import type { Evidence } from '../L5/Audit.js';

/**
 * Article IV.4: The Projected View
 * Projections are Read-Models derived purely from the Audit Log.
 * They must be deterministic and idempotent.
 */
export interface Projection<T> {
    name: string;
    version: string;

    /**
     * Resets the internal state of the projection to its zero value.
     */
    reset(): void;

    /**
     * Applies a single piece of evidence to the projection.
     * This must be a pure function of the current state + evidence.
     */
    apply(evidence: Evidence): void;

    /**
     * Returns the current state of the projection.
     */
    getState(): T;
}

export class ProjectionEngine {
    private projections: Map<string, Projection<any>> = new Map();

    public register(projection: Projection<any>) {
        if (this.projections.has(projection.name)) {
            console.warn(`[ProjectionEngine] Overwriting projection: ${projection.name}`);
        }
        this.projections.set(projection.name, projection);
    }

    public get<T>(name: string): Projection<T> | undefined {
        return this.projections.get(name) as Projection<T>;
    }

    /**
     * Feeds a single event to all registered projections.
     */
    public apply(evidence: Evidence) {
        for (const projection of this.projections.values()) {
            try {
                projection.apply(evidence);
            } catch (e: any) {
                console.error(`[ProjectionEngine] Projection '${projection.name}' failed on evidence ${evidence.evidenceId}:`, e);
                // We do NOT throw here. A single projection failure should not halt the kernel or other projections.
                // This is a "Best Effort" read model.
            }
        }
    }

    /**
     * Resets all projections.
     */
    public reset() {
        for (const projection of this.projections.values()) {
            projection.reset();
        }
    }
}
