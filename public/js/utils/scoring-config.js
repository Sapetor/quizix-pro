/**
 * Shared client-side scoring: config shape/defaults + the points formula.
 *
 * This MIRRORS services/scoring-service.js (the authoritative server
 * implementation). The formula, constants, and defaults here are a client-side
 * copy used by local practice mode and score-preview display. If you change
 * scoring on the server, change it here too — and vice versa. The two files
 * must stay in lockstep or clients and the server will disagree on points.
 */

// --- Formula constants (mirror server config.SCORING) ---
export const BASE_POINTS = 100;
export const MAX_BONUS_TIME = 10000;
export const TIME_BONUS_DIVISOR = 10;

// --- Default scoring config (mirror server defaults) ---
export const DEFAULT_DIFFICULTY_MULTIPLIERS = Object.freeze({ easy: 1, medium: 2, hard: 3 });
export const DEFAULT_TIME_BONUS_ENABLED = true;
export const DEFAULT_TIME_BONUS_THRESHOLD = 0;

// Fallback multiplier for an unknown/missing difficulty (matches server)
const DEFAULT_DIFFICULTY_MULTIPLIER = 2;

/**
 * Read a scoring config object from DOM inputs.
 *
 * The four host/practice UIs read the same field shape but differ in two ways,
 * both handled by options here:
 *  - `prefix`: quick-start inputs are prefixed with 'qs-'.
 *  - `thresholdToMs`: live-session configs use milliseconds (the unit the
 *    formula and server expect); the saved-to-file config keeps raw seconds so
 *    it round-trips with the seconds-based `time-bonus-threshold` UI input.
 *
 * @param {{get: (id: string) => (HTMLElement|null)}} dom - dom accessor
 * @param {Object} [opts]
 * @param {string} [opts.prefix=''] - id prefix (e.g. 'qs-')
 * @param {boolean} [opts.thresholdToMs=true] - convert threshold seconds -> ms
 * @returns {{timeBonusEnabled: boolean, timeBonusThreshold: number, difficultyMultipliers: {easy: number, medium: number, hard: number}}}
 */
export function readScoringConfigFromDOM(dom, { prefix = '', thresholdToMs = true } = {}) {
    const thresholdRaw = parseInt(dom.get(`${prefix}time-bonus-threshold`)?.value) || DEFAULT_TIME_BONUS_THRESHOLD;
    return {
        timeBonusEnabled: dom.get(`${prefix}time-bonus-enabled`)?.checked ?? DEFAULT_TIME_BONUS_ENABLED,
        timeBonusThreshold: thresholdToMs ? thresholdRaw * 1000 : thresholdRaw,
        difficultyMultipliers: {
            easy: parseFloat(dom.get(`${prefix}easy-multiplier`)?.value) || DEFAULT_DIFFICULTY_MULTIPLIERS.easy,
            medium: parseFloat(dom.get(`${prefix}medium-multiplier`)?.value) || DEFAULT_DIFFICULTY_MULTIPLIERS.medium,
            hard: parseFloat(dom.get(`${prefix}hard-multiplier`)?.value) || DEFAULT_DIFFICULTY_MULTIPLIERS.hard
        }
    };
}

/**
 * Look up a difficulty multiplier (mirrors ScoringService.getDifficultyMultiplier).
 * @param {string} difficulty
 * @param {Object} [multipliers] - per-game multipliers; defaults applied per-key
 * @returns {number}
 */
export function getDifficultyMultiplier(difficulty, multipliers = DEFAULT_DIFFICULTY_MULTIPLIERS) {
    return multipliers?.[difficulty] ?? DEFAULT_DIFFICULTY_MULTIPLIER;
}

/**
 * Time bonus with optional grace threshold (mirrors ScoringService.calculateTimeBonus).
 * Decays linearly from `maxBonusValue` to 0 across `decayWindowMs`.
 * @param {number} timeTaken - response time in ms
 * @param {number} maxBonusValue - bonus ceiling
 * @param {number} [threshold=0] - answers within this window get the full bonus
 * @param {number} [decayWindowMs=0] - decay window (question time limit)
 * @returns {number}
 */
export function calculateTimeBonus(timeTaken, maxBonusValue, threshold = 0, decayWindowMs = 0) {
    if (threshold > 0 && timeTaken <= threshold) {
        return maxBonusValue;
    }
    const window = decayWindowMs > 0 ? decayWindowMs : maxBonusValue;
    if (threshold > 0) {
        const remaining = window - threshold;
        if (remaining <= 0) return maxBonusValue;
        const elapsed = timeTaken - threshold;
        const ratio = Math.max(0, (remaining - elapsed) / remaining);
        return Math.floor(maxBonusValue * ratio);
    }
    const ratio = Math.max(0, (window - timeTaken) / window);
    return Math.floor(maxBonusValue * ratio);
}

/**
 * Calculate points for a single answer (mirrors ScoringService.calculateScore).
 *
 * Wrong answers score 0 and report a zeroed breakdown (client display choice);
 * the point total still matches the server's 0.
 *
 * @param {Object} params
 * @param {boolean|number} params.isCorrect - true/false, or a 0-1 partial (ordering)
 * @param {string} params.difficulty
 * @param {number} params.responseTime - response time in ms
 * @param {number} params.questionTimeLimitMs - decay window (question time limit in ms)
 * @param {Object} [params.config] - { timeBonusEnabled, timeBonusThreshold, difficultyMultipliers }
 * @param {number} [params.doublePointsMultiplier=1] - power-up multiplier (1 or 2)
 * @returns {{points: number, breakdown: {basePoints: number, timeBonus: number, difficultyMultiplier: number, doublePointsMultiplier: number}}}
 */
export function calculatePoints({
    isCorrect,
    difficulty,
    responseTime,
    questionTimeLimitMs,
    config = {},
    doublePointsMultiplier = 1
}) {
    const difficultyMultiplier = getDifficultyMultiplier(difficulty, config.difficultyMultipliers);
    const timeBonusEnabled = config.timeBonusEnabled ?? DEFAULT_TIME_BONUS_ENABLED;
    const timeBonusThreshold = config.timeBonusThreshold ?? DEFAULT_TIME_BONUS_THRESHOLD;

    // Wrong answer (a boolean false, not a partial score): 0 points.
    if (!isCorrect && typeof isCorrect !== 'number') {
        return {
            points: 0,
            breakdown: { basePoints: 0, timeBonus: 0, difficultyMultiplier, doublePointsMultiplier }
        };
    }

    const decayWindowMs = questionTimeLimitMs > 0 ? questionTimeLimitMs : MAX_BONUS_TIME;
    const timeBonus = calculateTimeBonus(responseTime, MAX_BONUS_TIME, timeBonusThreshold, decayWindowMs);

    const basePoints = BASE_POINTS * difficultyMultiplier;
    const scaledTimeBonus = timeBonusEnabled
        ? Math.floor(timeBonus * difficultyMultiplier / TIME_BONUS_DIVISOR)
        : 0;

    let points = basePoints + scaledTimeBonus;

    // Partial credit for ordering questions (isCorrect is a 0-1 fraction)
    if (typeof isCorrect === 'number') {
        points = Math.floor(points * isCorrect);
    }

    points = points * doublePointsMultiplier;

    return {
        points,
        breakdown: { basePoints, timeBonus: scaledTimeBonus, difficultyMultiplier, doublePointsMultiplier }
    };
}
