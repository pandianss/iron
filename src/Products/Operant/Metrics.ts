import { MetricType, type MetricDefinition } from '../../kernel-core/L2/State.js';

/**
 * Core Operant Metrics for Skinnerian Behavioural Modification
 * 
 * These metrics track:
 * - Operants (specific physical behaviours)
 * - Tokens (generalized reinforcers)
 * - Reinforcers (primary reinforcers like screen time, app access)
 * - Shaping thresholds
 * - Contract escrow
 */

// Validator factory functions
const validators = {
    nonNegativeNumber: (value: any) => typeof value === 'number' && value >= 0,
    positiveNumber: (value: any) => typeof value === 'number' && value > 0,
    boolean: (value: any) => typeof value === 'boolean',
    probability: (value: any) => typeof value === 'number' && value >= 0 && value <= 1,
    hour: (value: any) => typeof value === 'number' && value >= 0 && value <= 23
};

export const OperantMetrics: Record<string, Omit<MetricDefinition, 'id'>> = {
    // ==================== OPERANTS (Behaviours) ====================

    'operant.writing.words': {
        description: 'Words written in writing session',
        type: MetricType.COUNTER,
        unit: 'words',
        validator: validators.nonNegativeNumber
    },

    'operant.run.distance': {
        description: 'Distance run in miles',
        type: MetricType.COUNTER,
        unit: 'miles',
        validator: validators.nonNegativeNumber
    },

    'operant.exercise.reps': {
        description: 'Exercise repetitions completed',
        type: MetricType.COUNTER,
        unit: 'reps',
        validator: validators.nonNegativeNumber
    },

    'operant.reading.pages': {
        description: 'Pages read',
        type: MetricType.COUNTER,
        unit: 'pages',
        validator: validators.nonNegativeNumber
    },

    // ==================== TOKEN ECONOMY ====================

    'tokens.user.balance': {
        description: 'User token balance (generalized reinforcer)',
        type: MetricType.GAUGE,
        unit: 'tokens',
        validator: validators.nonNegativeNumber
    },

    // ==================== REINFORCERS (Primary) ====================

    'reinforcer.screentime.minutes': {
        description: 'Available screen time in minutes',
        type: MetricType.GAUGE,
        unit: 'minutes',
        validator: validators.nonNegativeNumber
    },

    'reinforcer.social.access': {
        description: 'Access to social media apps',
        type: MetricType.BOOLEAN,
        unit: 'bool',
        validator: validators.boolean
    },

    'reinforcer.games.access': {
        description: 'Access to gaming apps',
        type: MetricType.BOOLEAN,
        unit: 'bool',
        validator: validators.boolean
    },

    'reinforcer.entertainment.access': {
        description: 'Access to entertainment apps (Netflix, YouTube, etc.)',
        type: MetricType.BOOLEAN,
        unit: 'bool',
        validator: validators.boolean
    },

    // ==================== SHAPING ====================

    'shaping.threshold.current': {
        description: 'Current performance threshold for shaping',
        type: MetricType.GAUGE,
        unit: 'units',
        validator: validators.nonNegativeNumber
    },

    // ==================== VARIABLE-RATIO ====================

    'vr.probability': {
        description: 'Probability of reinforcement (0-1)',
        type: MetricType.GAUGE,
        unit: 'probability',
        validator: validators.probability
    },

    'random.seed': {
        description: 'Random number for variable-ratio evaluation (0-1)',
        type: MetricType.GAUGE,
        unit: 'probability',
        validator: validators.probability
    },

    // ==================== CONTRACT/COMMITMENT ====================

    'contract.escrow.usd': {
        description: 'Escrowed funds for commitment contract',
        type: MetricType.GAUGE,
        unit: 'usd',
        validator: validators.nonNegativeNumber
    },

    'contract.target.value': {
        description: 'Target value for contract fulfillment',
        type: MetricType.GAUGE,
        unit: 'units',
        validator: validators.nonNegativeNumber
    },

    'contract.deadline.hour': {
        description: 'Deadline hour for contract (0-23)',
        type: MetricType.GAUGE,
        unit: 'hour',
        validator: validators.hour
    },

    'contract.failure.count': {
        description: 'Number of contract failures',
        type: MetricType.COUNTER,
        unit: 'failures',
        validator: validators.nonNegativeNumber
    },

    'charity.disliked.donation': {
        description: 'Donations to disliked charity (aversive consequence)',
        type: MetricType.COUNTER,
        unit: 'usd',
        validator: validators.nonNegativeNumber
    },

    // ==================== SYSTEM ====================

    'time.hour': {
        description: 'Current hour (0-23)',
        type: MetricType.GAUGE,
        unit: 'hour',
        validator: validators.hour
    },

    'operant.attempts.count': {
        description: 'Number of operant attempts in current period',
        type: MetricType.COUNTER,
        unit: 'attempts',
        validator: validators.nonNegativeNumber
    },

    'time.since.last.attempt': {
        description: 'Seconds since last operant attempt',
        type: MetricType.GAUGE,
        unit: 'seconds',
        validator: validators.nonNegativeNumber
    }
};

/**
 * Register all Operant metrics in the MetricRegistry
 */
export function registerOperantMetrics(registry: any): void {
    Object.entries(OperantMetrics).forEach(([id, metric]) => {
        registry.register({ ...metric, id });
    });
}
