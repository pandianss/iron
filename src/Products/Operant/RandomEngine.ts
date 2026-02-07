/**
 * RandomEngine: Deterministic pseudo-random number generator
 * 
 * Uses Linear Congruential Generator (LCG) for reproducible randomness.
 * This is crucial for testing and replay of behavioural sequences.
 */
export class RandomEngine {
    private seed: number;

    constructor(seed?: number) {
        this.seed = seed || Date.now();
    }

    /**
     * Generate next random number in [0, 1)
     * Uses LCG: X(n+1) = (a * X(n) + c) mod m
     */
    public next(): number {
        // LCG parameters (from Numerical Recipes)
        const a = 1103515245;
        const c = 12345;
        const m = 2147483648; // 2^31

        this.seed = (a * this.seed + c) % m;
        return this.seed / m;
    }

    /**
     * Set seed for reproducible sequences
     */
    public setSeed(seed: number): void {
        this.seed = seed;
    }

    /**
     * Get current seed
     */
    public getSeed(): number {
        return this.seed;
    }

    /**
     * Generate random integer in [min, max]
     */
    public nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * Generate random boolean with given probability
     */
    public nextBoolean(probability: number = 0.5): boolean {
        return this.next() < probability;
    }
}
