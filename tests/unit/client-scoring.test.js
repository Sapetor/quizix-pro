/**
 * @jest-environment jsdom
 *
 * Tests for the shared client scoring module (public/js/utils/scoring-config.js).
 *
 * Expected point values are HARDCODED from the authoritative server formula in
 * services/scoring-service.js. If the client formula drifts from the server,
 * these assertions break — that is the point of the test.
 *
 * Server formula (per answer):
 *   basePoints      = 100 * difficultyMultiplier
 *   decayWindowMs   = questionTimeLimitMs > 0 ? questionTimeLimitMs : 10000
 *   timeBonus       = floor(10000 * max(0, (decayWindowMs - t) / decayWindowMs))   [no threshold]
 *   scaledTimeBonus = enabled ? floor(timeBonus * difficultyMultiplier / 10) : 0
 *   points          = basePoints + scaledTimeBonus            (correct)
 *   ordering        = floor(points * fraction)                (partial credit)
 *   points         *= doublePointsMultiplier
 */

import {
    calculatePoints,
    calculateTimeBonus,
    getDifficultyMultiplier,
    readScoringConfigFromDOM,
    BASE_POINTS,
    MAX_BONUS_TIME,
    TIME_BONUS_DIVISOR,
    DEFAULT_DIFFICULTY_MULTIPLIERS,
    DEFAULT_TIME_BONUS_ENABLED,
    DEFAULT_TIME_BONUS_THRESHOLD
} from '../../public/js/utils/scoring-config.js';

const ENABLED = { timeBonusEnabled: true, timeBonusThreshold: 0, difficultyMultipliers: { easy: 1, medium: 2, hard: 3 } };
const Q20 = 20000; // 20s question time limit in ms

describe('module constants mirror the server', () => {
    test('formula constants', () => {
        expect(BASE_POINTS).toBe(100);
        expect(MAX_BONUS_TIME).toBe(10000);
        expect(TIME_BONUS_DIVISOR).toBe(10);
    });
    test('default config', () => {
        expect(DEFAULT_DIFFICULTY_MULTIPLIERS).toEqual({ easy: 1, medium: 2, hard: 3 });
        expect(DEFAULT_TIME_BONUS_ENABLED).toBe(true);
        expect(DEFAULT_TIME_BONUS_THRESHOLD).toBe(0);
    });
});

describe('getDifficultyMultiplier', () => {
    test('known difficulties from defaults', () => {
        expect(getDifficultyMultiplier('easy')).toBe(1);
        expect(getDifficultyMultiplier('medium')).toBe(2);
        expect(getDifficultyMultiplier('hard')).toBe(3);
    });
    test('unknown difficulty falls back to 2', () => {
        expect(getDifficultyMultiplier('unknown')).toBe(2);
        expect(getDifficultyMultiplier(undefined)).toBe(2);
    });
    test('custom multipliers win', () => {
        expect(getDifficultyMultiplier('easy', { easy: 1.5 })).toBe(1.5);
    });
});

describe('calculateTimeBonus', () => {
    test('no threshold, instant answer = full bonus', () => {
        expect(calculateTimeBonus(0, 10000, 0, 20000)).toBe(10000);
    });
    test('no threshold, halfway = half bonus', () => {
        expect(calculateTimeBonus(10000, 10000, 0, 20000)).toBe(5000);
    });
    test('no threshold, at/after window = 0', () => {
        expect(calculateTimeBonus(20000, 10000, 0, 20000)).toBe(0);
        expect(calculateTimeBonus(25000, 10000, 0, 20000)).toBe(0);
    });
    test('within threshold = full bonus', () => {
        expect(calculateTimeBonus(3000, 10000, 5000, 20000)).toBe(10000);
    });
    test('past threshold decays from threshold to window end', () => {
        // remaining = 20000-5000 = 15000; elapsed = 12500-5000 = 7500; ratio = 0.5
        expect(calculateTimeBonus(12500, 10000, 5000, 20000)).toBe(5000);
    });
});

describe('calculatePoints — grid of difficulty x time x streak x toggles', () => {
    const cases = [
        // [label, args, expectedPoints, expectedBreakdown]
        ['medium, instant, enabled',
            { isCorrect: true, difficulty: 'medium', responseTime: 0, questionTimeLimitMs: Q20, config: ENABLED },
            2200, { basePoints: 200, timeBonus: 2000, difficultyMultiplier: 2, doublePointsMultiplier: 1 }],
        ['easy, halfway, enabled',
            { isCorrect: true, difficulty: 'easy', responseTime: 10000, questionTimeLimitMs: Q20, config: ENABLED },
            600, { basePoints: 100, timeBonus: 500, difficultyMultiplier: 1, doublePointsMultiplier: 1 }],
        ['hard, at time limit (no time bonus), enabled',
            { isCorrect: true, difficulty: 'hard', responseTime: 20000, questionTimeLimitMs: Q20, config: ENABLED },
            300, { basePoints: 300, timeBonus: 0, difficultyMultiplier: 3, doublePointsMultiplier: 1 }],
        ['wrong answer scores 0 with zeroed breakdown',
            { isCorrect: false, difficulty: 'medium', responseTime: 0, questionTimeLimitMs: Q20, config: ENABLED },
            0, { basePoints: 0, timeBonus: 0, difficultyMultiplier: 2, doublePointsMultiplier: 1 }],
        ['time bonus disabled -> base only',
            { isCorrect: true, difficulty: 'medium', responseTime: 0, questionTimeLimitMs: Q20,
              config: { timeBonusEnabled: false, timeBonusThreshold: 0, difficultyMultipliers: ENABLED.difficultyMultipliers } },
            200, { basePoints: 200, timeBonus: 0, difficultyMultiplier: 2, doublePointsMultiplier: 1 }],
        ['threshold grace: within threshold = full bonus',
            { isCorrect: true, difficulty: 'medium', responseTime: 3000, questionTimeLimitMs: Q20,
              config: { timeBonusEnabled: true, timeBonusThreshold: 5000, difficultyMultipliers: ENABLED.difficultyMultipliers } },
            2200, { basePoints: 200, timeBonus: 2000, difficultyMultiplier: 2, doublePointsMultiplier: 1 }],
        ['threshold grace: past threshold decays',
            { isCorrect: true, difficulty: 'medium', responseTime: 12500, questionTimeLimitMs: Q20,
              config: { timeBonusEnabled: true, timeBonusThreshold: 5000, difficultyMultipliers: ENABLED.difficultyMultipliers } },
            1200, { basePoints: 200, timeBonus: 1000, difficultyMultiplier: 2, doublePointsMultiplier: 1 }],
        ['ordering partial credit 0.5',
            { isCorrect: 0.5, difficulty: 'medium', responseTime: 0, questionTimeLimitMs: Q20, config: ENABLED },
            1100, { basePoints: 200, timeBonus: 2000, difficultyMultiplier: 2, doublePointsMultiplier: 1 }],
        ['double points power-up doubles total',
            { isCorrect: true, difficulty: 'medium', responseTime: 0, questionTimeLimitMs: Q20, config: ENABLED, doublePointsMultiplier: 2 },
            4400, { basePoints: 200, timeBonus: 2000, difficultyMultiplier: 2, doublePointsMultiplier: 2 }],
        ['unknown difficulty falls back to multiplier 2',
            { isCorrect: true, difficulty: 'unknown', responseTime: 0, questionTimeLimitMs: Q20, config: ENABLED },
            2200, { basePoints: 200, timeBonus: 2000, difficultyMultiplier: 2, doublePointsMultiplier: 1 }],
        ['custom fractional multiplier',
            { isCorrect: true, difficulty: 'easy', responseTime: 0, questionTimeLimitMs: Q20,
              config: { timeBonusEnabled: true, timeBonusThreshold: 0, difficultyMultipliers: { easy: 1.5, medium: 2, hard: 3 } } },
            1650, { basePoints: 150, timeBonus: 1500, difficultyMultiplier: 1.5, doublePointsMultiplier: 1 }],
        ['no time limit falls back to MAX_BONUS_TIME window',
            { isCorrect: true, difficulty: 'medium', responseTime: 5000, questionTimeLimitMs: 0, config: ENABLED },
            // decay = 10000; timeBonus = floor(10000*(10000-5000)/10000)=5000; scaled=floor(5000*2/10)=1000
            1200, { basePoints: 200, timeBonus: 1000, difficultyMultiplier: 2, doublePointsMultiplier: 1 }]
    ];

    test.each(cases)('%s', (_label, args, expectedPoints, expectedBreakdown) => {
        const result = calculatePoints(args);
        expect(result.points).toBe(expectedPoints);
        expect(result.breakdown).toEqual(expectedBreakdown);
    });

    test('defaults applied when config omitted (enabled, no threshold, default multipliers)', () => {
        const result = calculatePoints({ isCorrect: true, difficulty: 'medium', responseTime: 0, questionTimeLimitMs: Q20 });
        expect(result.points).toBe(2200);
    });
});

describe('readScoringConfigFromDOM', () => {
    function setupDom(prefix = '', { enabled = true, threshold = '5', easy = '1', medium = '2', hard = '3' } = {}) {
        document.body.innerHTML = `
            <input type="checkbox" id="${prefix}time-bonus-enabled" ${enabled ? 'checked' : ''}>
            <input id="${prefix}time-bonus-threshold" value="${threshold}">
            <input id="${prefix}easy-multiplier" value="${easy}">
            <input id="${prefix}medium-multiplier" value="${medium}">
            <input id="${prefix}hard-multiplier" value="${hard}">
        `;
        return { get: (id) => document.getElementById(id) };
    }

    test('reads live-session config with threshold converted seconds -> ms', () => {
        const dom = setupDom('');
        expect(readScoringConfigFromDOM(dom)).toEqual({
            timeBonusEnabled: true,
            timeBonusThreshold: 5000,
            difficultyMultipliers: { easy: 1, medium: 2, hard: 3 }
        });
    });

    test('thresholdToMs:false keeps raw seconds (saved-to-file config)', () => {
        const dom = setupDom('');
        expect(readScoringConfigFromDOM(dom, { thresholdToMs: false }).timeBonusThreshold).toBe(5);
    });

    test('prefix reads quick-start (qs-) inputs', () => {
        const dom = setupDom('qs-', { threshold: '3', easy: '1.5' });
        expect(readScoringConfigFromDOM(dom, { prefix: 'qs-' })).toEqual({
            timeBonusEnabled: true,
            timeBonusThreshold: 3000,
            difficultyMultipliers: { easy: 1.5, medium: 2, hard: 3 }
        });
    });

    test('missing inputs fall back to defaults', () => {
        const dom = { get: () => null };
        expect(readScoringConfigFromDOM(dom)).toEqual({
            timeBonusEnabled: true,
            timeBonusThreshold: 0,
            difficultyMultipliers: { easy: 1, medium: 2, hard: 3 }
        });
    });
});
