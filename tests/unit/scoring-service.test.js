/**
 * Scoring Service Tests
 *
 * Comprehensive tests for the scoring system covering:
 * - Base formula (basePoints + timeBonus) × multipliers
 * - All question types (multiple-choice, multiple-correct, true-false, numeric, ordering)
 * - All difficulty levels (easy, medium, hard) with default and custom multipliers
 * - Time bonus: enabled, disabled, and threshold (grace period) mode
 * - Power-up double points multiplier
 * - Partial credit for ordering questions
 * - Consensus mode team scoring
 * - Multi-player game scenarios through Game.submitAnswer
 * - Edge cases: wrong answers, timeouts, boundary conditions
 */

const { ScoringService } = require('../../services/scoring-service');
const { Game } = require('../../services/game');

// ─── Helpers ───────────────────────────────────────────────────────────────

const CONFIG = {
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 },
        DEFAULT_NUMERIC_TOLERANCE: 0.1
    },
    TIMING: {
        DEFAULT_QUESTION_TIME: 20,
        LEADERBOARD_DISPLAY_TIME: 3000,
        GAME_START_DELAY: 3000,
        AUTO_ADVANCE_DELAY: 3000
    }
};

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Use fake timers so Date.now() is deterministic across test runs
beforeEach(() => jest.useFakeTimers({ now: 1000000 }));
afterEach(() => jest.useRealTimers());

/** Build a calculateScore params object with sensible defaults */
function buildScoreParams(overrides = {}) {
    const now = Date.now();
    return {
        answer: 0,
        question: {
            type: 'multiple-choice',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 0,
            difficulty: 'medium',
            timeLimit: 20
        },
        questionType: 'multiple-choice',
        questionStartTime: now - 5000, // answered in 5 seconds
        config: CONFIG,
        scoringConfig: null,
        doublePointsMultiplier: 1,
        questionTimeLimitMs: 20000, // 20 seconds default
        ...overrides
    };
}

/** Helper: compute expected score for correct answer */
function expectedScore({ timeTakenMs, difficulty = 'medium', config = CONFIG, scoringConfig = null, doublePoints = 1, questionTimeLimitMs = 20000 }) {
    const defaultMultipliers = config.SCORING.DIFFICULTY_MULTIPLIERS;
    const customMultipliers = scoringConfig?.difficultyMultipliers;
    const diffMult = customMultipliers?.[difficulty] ?? defaultMultipliers[difficulty] ?? 2;
    const timeBonusEnabled = scoringConfig?.timeBonusEnabled ?? true;
    const threshold = scoringConfig?.timeBonusThreshold ?? 0;
    const maxBonus = config.SCORING.MAX_BONUS_TIME;
    const decayWindow = questionTimeLimitMs > 0 ? questionTimeLimitMs : maxBonus;

    let timeBonus;
    if (threshold > 0 && timeTakenMs <= threshold) {
        timeBonus = maxBonus;
    } else {
        const ratio = Math.max(0, (decayWindow - timeTakenMs) / decayWindow);
        timeBonus = Math.floor(maxBonus * ratio);
    }

    const base = config.SCORING.BASE_POINTS * diffMult;
    const scaled = timeBonusEnabled
        ? Math.floor(timeBonus * diffMult / config.SCORING.TIME_BONUS_DIVISOR)
        : 0;

    return (base + scaled) * doublePoints;
}

// ─── ScoringService.calculateScore ─────────────────────────────────────────

describe('ScoringService.calculateScore', () => {

    // ── Multiple-Choice ────────────────────────────────────────────────────

    describe('multiple-choice questions', () => {
        test('correct answer with medium difficulty, 5s response on 20s question', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 5000
            }));

            expect(result.isCorrect).toBe(true);
            // 20s question, 5s answer → ratio=15/20=0.75, bonus=floor(10000*0.75)=7500
            // scaledTimeBonus=floor(7500*2/10)=1500 → 200+1500=1700
            expect(result.points).toBe(1700);
            expect(result.breakdown.basePoints).toBe(200);
            expect(result.breakdown.timeBonus).toBe(1500);
            expect(result.breakdown.difficultyMultiplier).toBe(2);
        });

        test('wrong answer always scores 0 regardless of speed', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: 1, // wrong
                questionStartTime: now - 1000 // very fast
            }));

            expect(result.isCorrect).toBe(false);
            expect(result.points).toBe(0);
        });

        test('correct answer at halfway (10s on 20s) gets 50% time bonus', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 10000
            }));

            expect(result.isCorrect).toBe(true);
            // ratio=10/20=0.5, bonus=floor(10000*0.5)=5000
            // scaledTimeBonus=floor(5000*2/10)=1000 → 200+1000=1200
            expect(result.points).toBe(1200);
            expect(result.breakdown.timeBonus).toBe(1000);
        });

        test('correct answer near limit (18s on 20s) still gets some bonus', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 18000
            }));

            expect(result.isCorrect).toBe(true);
            // ratio=2/20=0.1, bonus=floor(10000*0.1)=1000
            // scaledTimeBonus=floor(1000*2/10)=200 → 200+200=400
            expect(result.points).toBe(400);
            expect(result.breakdown.timeBonus).toBe(200);
        });

        test('instant answer (0ms) gets maximum time bonus', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now // 0ms
            }));

            expect(result.isCorrect).toBe(true);
            // ratio=20/20=1.0, bonus=10000, scaled=floor(10000*2/10)=2000 → 200+2000=2200
            expect(result.points).toBe(2200);
            expect(result.breakdown.timeBonus).toBe(2000);
        });

        test('answer at exact time limit gets 0 bonus (base points only)', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 20000 // exactly 20s on 20s question
            }));

            expect(result.isCorrect).toBe(true);
            expect(result.points).toBe(200); // base only
            expect(result.breakdown.timeBonus).toBe(0);
        });
    });

    // ── Difficulty Levels ──────────────────────────────────────────────────

    describe('difficulty levels', () => {
        const difficulties = [
            { level: 'easy', multiplier: 1 },
            { level: 'medium', multiplier: 2 },
            { level: 'hard', multiplier: 3 }
        ];

        difficulties.forEach(({ level, multiplier }) => {
            test(`${level} question (×${multiplier}) — correct, 5s`, () => {
                const now = Date.now();
                const result = ScoringService.calculateScore(buildScoreParams({
                    question: {
                        type: 'multiple-choice',
                        options: ['A', 'B', 'C', 'D'],
                        correctIndex: 0,
                        difficulty: level
                    },
                    questionStartTime: now - 5000
                }));

                const expected = expectedScore({ timeTakenMs: 5000, difficulty: level });
                expect(result.points).toBe(expected);
                expect(result.breakdown.difficultyMultiplier).toBe(multiplier);
            });
        });

        test('missing difficulty falls back to multiplier 2', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                question: {
                    type: 'multiple-choice',
                    options: ['A', 'B'],
                    correctIndex: 0
                    // no difficulty field
                },
                questionStartTime: now - 5000
            }));

            expect(result.breakdown.difficultyMultiplier).toBe(2);
        });

        test('unknown difficulty falls back to multiplier 2', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                question: {
                    type: 'multiple-choice',
                    options: ['A', 'B'],
                    correctIndex: 0,
                    difficulty: 'legendary'
                },
                questionStartTime: now - 5000
            }));

            expect(result.breakdown.difficultyMultiplier).toBe(2);
        });
    });

    // ── Custom Difficulty Multipliers ──────────────────────────────────────

    describe('custom difficulty multipliers (per-game scoringConfig)', () => {
        test('custom multipliers override defaults', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                question: {
                    type: 'multiple-choice',
                    options: ['A', 'B'],
                    correctIndex: 0,
                    difficulty: 'easy'
                },
                questionStartTime: now - 5000,
                scoringConfig: {
                    difficultyMultipliers: { easy: 5, medium: 10, hard: 15 }
                }
            }));

            // easy custom=5, 5s on 20s → ratio=0.75, bonus=7500
            // base=500, scaledTimeBonus=floor(7500*5/10)=3750 → 4250
            expect(result.points).toBe(4250);
            expect(result.breakdown.difficultyMultiplier).toBe(5);
        });

        test('partial custom multipliers: overridden + fallback', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                question: {
                    type: 'multiple-choice',
                    options: ['A', 'B'],
                    correctIndex: 0,
                    difficulty: 'hard'
                },
                questionStartTime: now - 5000,
                scoringConfig: {
                    difficultyMultipliers: { easy: 10 }
                    // medium and hard not overridden → fall back to defaults
                }
            }));

            // hard default = 3
            expect(result.breakdown.difficultyMultiplier).toBe(3);
        });
    });

    // ── True-False ─────────────────────────────────────────────────────────

    describe('true-false questions', () => {
        test('correct boolean answer', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: true,
                question: {
                    type: 'true-false',
                    correctAnswer: true,
                    difficulty: 'easy'
                },
                questionType: 'true-false',
                questionStartTime: now - 3000
            }));

            expect(result.isCorrect).toBe(true);
            // easy=1, 3s on 20s → ratio=17/20=0.85, bonus=floor(10000*0.85)=8500
            // base=100, scaledTimeBonus=floor(8500*1/10)=850 → 950
            expect(result.points).toBe(950);
        });

        test('string "true" matches boolean true', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: 'true',
                question: {
                    type: 'true-false',
                    correctAnswer: true,
                    difficulty: 'medium'
                },
                questionType: 'true-false',
                questionStartTime: now - 5000
            }));

            expect(result.isCorrect).toBe(true);
        });

        test('wrong boolean answer scores 0', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: false,
                question: {
                    type: 'true-false',
                    correctAnswer: true,
                    difficulty: 'hard'
                },
                questionType: 'true-false',
                questionStartTime: now - 1000
            }));

            expect(result.isCorrect).toBe(false);
            expect(result.points).toBe(0);
        });
    });

    // ── Multiple-Correct ──────────────────────────────────────────────────

    describe('multiple-correct questions', () => {
        test('all correct selections scores full points', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: [0, 2],
                question: {
                    type: 'multiple-correct',
                    options: ['A', 'B', 'C', 'D'],
                    correctIndices: [0, 2],
                    difficulty: 'hard'
                },
                questionType: 'multiple-correct',
                questionStartTime: now - 4000
            }));

            expect(result.isCorrect).toBe(true);
            // hard=3, 4s on 20s → ratio=16/20=0.8, bonus=floor(10000*0.8)=8000
            // base=300, scaledTimeBonus=floor(8000*3/10)=2400 → 2700
            expect(result.points).toBe(2700);
        });

        test('missing one correct selection scores 0 (no partial credit)', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: [0], // missing 2
                question: {
                    type: 'multiple-correct',
                    options: ['A', 'B', 'C', 'D'],
                    correctIndices: [0, 2],
                    difficulty: 'medium'
                },
                questionType: 'multiple-correct',
                questionStartTime: now - 3000
            }));

            expect(result.isCorrect).toBe(false);
            expect(result.points).toBe(0);
        });

        test('extra wrong selection scores 0', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: [0, 1, 2], // extra 1
                question: {
                    type: 'multiple-correct',
                    options: ['A', 'B', 'C', 'D'],
                    correctIndices: [0, 2],
                    difficulty: 'medium'
                },
                questionType: 'multiple-correct',
                questionStartTime: now - 3000
            }));

            expect(result.isCorrect).toBe(false);
            expect(result.points).toBe(0);
        });

        test('order of selections does not matter', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: [2, 0], // reversed order
                question: {
                    type: 'multiple-correct',
                    options: ['A', 'B', 'C', 'D'],
                    correctIndices: [0, 2],
                    difficulty: 'medium'
                },
                questionType: 'multiple-correct',
                questionStartTime: now - 5000
            }));

            expect(result.isCorrect).toBe(true);
            expect(result.points).toBeGreaterThan(0);
        });
    });

    // ── Numeric ───────────────────────────────────────────────────────────

    describe('numeric questions', () => {
        test('exact answer is correct', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: 42,
                question: {
                    type: 'numeric',
                    correctAnswer: 42,
                    tolerance: 0.5,
                    difficulty: 'medium'
                },
                questionType: 'numeric',
                questionStartTime: now - 6000
            }));

            expect(result.isCorrect).toBe(true);
        });

        test('answer within tolerance is correct', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: 42.3,
                question: {
                    type: 'numeric',
                    correctAnswer: 42,
                    tolerance: 0.5,
                    difficulty: 'easy'
                },
                questionType: 'numeric',
                questionStartTime: now - 5000
            }));

            expect(result.isCorrect).toBe(true);
        });

        test('answer outside tolerance is wrong', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: 43,
                question: {
                    type: 'numeric',
                    correctAnswer: 42,
                    tolerance: 0.5,
                    difficulty: 'medium'
                },
                questionType: 'numeric',
                questionStartTime: now - 3000
            }));

            expect(result.isCorrect).toBe(false);
            expect(result.points).toBe(0);
        });

        test('uses default tolerance (0.1) when question has none', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: 10.05,
                question: {
                    type: 'numeric',
                    correctAnswer: 10,
                    difficulty: 'medium'
                    // no tolerance → uses DEFAULT_NUMERIC_TOLERANCE = 0.1
                },
                questionType: 'numeric',
                questionStartTime: now - 5000
            }));

            expect(result.isCorrect).toBe(true);
        });

        test('just outside default tolerance is wrong', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: 10.2,
                question: {
                    type: 'numeric',
                    correctAnswer: 10,
                    difficulty: 'medium'
                },
                questionType: 'numeric',
                questionStartTime: now - 5000
            }));

            expect(result.isCorrect).toBe(false);
        });
    });

    // ── Ordering (Partial Credit) ─────────────────────────────────────────

    describe('ordering questions (partial credit)', () => {
        test('perfect order scores 100%', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: [0, 1, 2, 3],
                question: {
                    type: 'ordering',
                    options: ['A', 'B', 'C', 'D'],
                    correctOrder: [0, 1, 2, 3],
                    difficulty: 'medium'
                },
                questionType: 'ordering',
                questionStartTime: now - 5000
            }));

            expect(result.isCorrect).toBe(true);
            expect(result.partialScore).toBe(1);
            // 5s on 20s, medium: 200 + 1500 = 1700
            expect(result.points).toBe(1700);
        });

        test('50% correct positions scores 50% of points', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: [0, 1, 3, 2], // 2 out of 4 correct (indices 0,1)
                question: {
                    type: 'ordering',
                    options: ['A', 'B', 'C', 'D'],
                    correctOrder: [0, 1, 2, 3],
                    difficulty: 'medium'
                },
                questionType: 'ordering',
                questionStartTime: now - 5000
            }));

            expect(result.isCorrect).toBe(false); // not 100%
            expect(result.partialScore).toBe(0.5);
            // 5s on 20s, medium: (200 + 1500) * 0.5 = 850
            expect(result.points).toBe(850);
        });

        test('0 correct positions scores 0', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: [3, 2, 1, 0], // all wrong positions
                question: {
                    type: 'ordering',
                    options: ['A', 'B', 'C', 'D'],
                    correctOrder: [0, 1, 2, 3],
                    difficulty: 'hard'
                },
                questionType: 'ordering',
                questionStartTime: now - 5000
            }));

            expect(result.isCorrect).toBe(false);
            expect(result.partialScore).toBe(0);
            expect(result.points).toBe(0);
        });

        test('partial credit with hard difficulty', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: [0, 1, 2, 5, 3, 4], // 3 out of 6 correct (pos 0,1,2)
                question: {
                    type: 'ordering',
                    options: ['A', 'B', 'C', 'D', 'E', 'F'],
                    correctOrder: [0, 1, 2, 3, 4, 5],
                    difficulty: 'hard'
                },
                questionType: 'ordering',
                questionStartTime: now - 8000
            }));

            expect(result.partialScore).toBe(0.5);
            // 8s on 20s, hard: ratio=12/20=0.6, bonus=floor(10000*0.6)=6000
            // base=300, scaledTimeBonus=floor(6000*3/10)=1800 → (300+1800)*0.5=1050
            expect(result.points).toBe(1050);
        });
    });

    // ── Time Bonus Threshold (Grace Period) ────────────────────────────────

    describe('time bonus threshold (grace period mode)', () => {
        test('answer within threshold gets maximum time bonus', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 2000, // 2s
                scoringConfig: { timeBonusThreshold: 3000 } // 3s grace period
            }));

            expect(result.isCorrect).toBe(true);
            // timeBonus = MAX_BONUS_TIME = 10000 (within threshold)
            // scaledTimeBonus = floor(10000 * 2 / 10) = 2000
            // total = 200 + 2000 = 2200
            expect(result.points).toBe(2200);
            expect(result.breakdown.timeBonus).toBe(2000);
        });

        test('answer at exact threshold gets maximum time bonus', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 3000, // exactly 3s
                scoringConfig: { timeBonusThreshold: 3000 }
            }));

            expect(result.points).toBe(2200);
        });

        test('answer just after threshold decays smoothly (no cliff)', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 3001, // 1ms past 3s threshold
                scoringConfig: { timeBonusThreshold: 3000 }
            }));

            // remaining window = 20000-3000 = 17000ms
            // elapsed past threshold = 1ms → ratio = 16999/17000 ≈ 0.9999
            // bonus = floor(10000 * 0.9999) = 9999 → nearly full
            // scaled = floor(9999*2/10) = 1999 → total = 200+1999 = 2199
            expect(result.points).toBe(2199);
            // Should be very close to the max (2200), not a cliff drop
        });

        test('answer at midpoint between threshold and end gets 50%', () => {
            const now = Date.now();
            // threshold=5s, question=20s → remaining=15s, midpoint=5+7.5=12.5s
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 12500,
                scoringConfig: { timeBonusThreshold: 5000 }
            }));

            // elapsed past threshold = 7500ms, remaining window = 15000ms
            // ratio = (15000-7500)/15000 = 0.5 → bonus = 5000
            // scaled = floor(5000*2/10) = 1000 → total = 200+1000 = 1200
            expect(result.points).toBe(1200);
        });

        test('threshold=0 means disabled (proportional decay from start)', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 2000,
                scoringConfig: { timeBonusThreshold: 0 }
            }));

            // 2s on 20s: ratio=18/20=0.9, bonus=floor(10000*0.9)=9000
            // scaledTimeBonus=floor(9000*2/10)=1800 → 200+1800=2000
            expect(result.points).toBe(2000);
        });

        test('two players: both within threshold get same max bonus', () => {
            const now = Date.now();
            const threshold = 5000;

            const fast = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 1000,
                scoringConfig: { timeBonusThreshold: threshold }
            }));

            const slow = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 4500,
                scoringConfig: { timeBonusThreshold: threshold }
            }));

            // Both within 5s threshold → same points
            expect(fast.points).toBe(slow.points);
            expect(fast.points).toBe(2200);
        });

        test('threshold with hard difficulty', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                question: {
                    type: 'multiple-choice',
                    options: ['A', 'B'],
                    correctIndex: 0,
                    difficulty: 'hard'
                },
                questionStartTime: now - 2000,
                scoringConfig: { timeBonusThreshold: 5000 }
            }));

            // hard=3, threshold → max bonus
            // base=300, timeBonus=floor(10000*3/10)=3000 → 3300
            expect(result.points).toBe(3300);
        });
    });

    // ── Proportional Decay (time limit scaling) ──────────────────────────

    describe('proportional decay scales with question time limit', () => {
        test('same response time, different time limits → different bonuses', () => {
            const now = Date.now();

            // 5s answer on 10s question → ratio=0.5, bonus=5000
            const short = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 5000,
                questionTimeLimitMs: 10000
            }));

            // 5s answer on 30s question → ratio=25/30=0.833, bonus=floor(10000*0.833)=8333
            const long = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 5000,
                questionTimeLimitMs: 30000
            }));

            // Longer time limit = more generous bonus for same response time
            expect(long.points).toBeGreaterThan(short.points);
            // short: scaled=floor(5000*2/10)=1000 → 200+1000=1200
            expect(short.points).toBe(1200);
            // long: scaled=floor(8333*2/10)=1666 → 200+1666=1866
            expect(long.points).toBe(1866);
        });

        test('answering at 50% of time limit always gives same ratio', () => {
            const now = Date.now();

            // 5s on 10s
            const a = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 5000,
                questionTimeLimitMs: 10000
            }));

            // 15s on 30s
            const b = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 15000,
                questionTimeLimitMs: 30000
            }));

            // Both at 50% → same bonus
            expect(a.points).toBe(b.points);
        });

        test('10s question: answering at 9.5s gives small bonus, not 0', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 9500,
                questionTimeLimitMs: 10000
            }));

            // ratio=500/10000=0.05, bonus=floor(10000*0.05)=500
            // scaled=floor(500*2/10)=100 → 200+100=300
            expect(result.points).toBe(300);
            expect(result.points).toBeGreaterThan(200); // more than base
        });
    });

    // ── Time Bonus Disabled ────────────────────────────────────────────────

    describe('time bonus disabled (flat scoring mode)', () => {
        test('only base points awarded, regardless of speed', () => {
            const now = Date.now();
            const fast = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 1000,
                scoringConfig: { timeBonusEnabled: false }
            }));

            const slow = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 9000,
                scoringConfig: { timeBonusEnabled: false }
            }));

            // Both get base only: 200
            expect(fast.points).toBe(200);
            expect(slow.points).toBe(200);
            expect(fast.breakdown.timeBonus).toBe(0);
            expect(slow.breakdown.timeBonus).toBe(0);
        });

        test('flat scoring still respects difficulty multiplier', () => {
            const now = Date.now();
            const easy = ScoringService.calculateScore(buildScoreParams({
                question: {
                    type: 'multiple-choice',
                    options: ['A', 'B'],
                    correctIndex: 0,
                    difficulty: 'easy'
                },
                questionStartTime: now - 3000,
                scoringConfig: { timeBonusEnabled: false }
            }));

            const hard = ScoringService.calculateScore(buildScoreParams({
                question: {
                    type: 'multiple-choice',
                    options: ['A', 'B'],
                    correctIndex: 0,
                    difficulty: 'hard'
                },
                questionStartTime: now - 3000,
                scoringConfig: { timeBonusEnabled: false }
            }));

            expect(easy.points).toBe(100); // 100*1
            expect(hard.points).toBe(300); // 100*3
        });

        test('wrong answer still 0 with flat scoring', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: 1,
                questionStartTime: now - 1000,
                scoringConfig: { timeBonusEnabled: false }
            }));

            expect(result.points).toBe(0);
        });
    });

    // ── Double Points Power-Up ─────────────────────────────────────────────

    describe('double points power-up', () => {
        test('doubles total score (base + time bonus)', () => {
            const now = Date.now();
            const normal = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 5000,
                doublePointsMultiplier: 1
            }));

            const doubled = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 5000,
                doublePointsMultiplier: 2
            }));

            expect(doubled.points).toBe(normal.points * 2);
            // 5s on 20s, medium: (200+1500)*2 = 3400
            expect(doubled.points).toBe(3400);
        });

        test('double points on wrong answer is still 0', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: 1,
                questionStartTime: now - 2000,
                doublePointsMultiplier: 2
            }));

            expect(result.points).toBe(0);
        });

        test('double points with ordering partial credit', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                answer: [0, 1, 3, 2], // 50% correct
                question: {
                    type: 'ordering',
                    options: ['A', 'B', 'C', 'D'],
                    correctOrder: [0, 1, 2, 3],
                    difficulty: 'medium'
                },
                questionType: 'ordering',
                questionStartTime: now - 5000,
                doublePointsMultiplier: 2
            }));

            // 5s on 20s, medium: (200 + 1500) * 0.5 * 2 = 1700
            expect(result.points).toBe(1700);
        });

        test('double points with flat scoring', () => {
            const now = Date.now();
            const result = ScoringService.calculateScore(buildScoreParams({
                questionStartTime: now - 5000,
                scoringConfig: { timeBonusEnabled: false },
                doublePointsMultiplier: 2
            }));

            // base only 200, doubled → 400
            expect(result.points).toBe(400);
        });
    });
});

// ─── ScoringService.calculateTimeBonus ─────────────────────────────────────

describe('ScoringService.calculateTimeBonus', () => {
    // With 20s decay window (typical question time limit)
    const DECAY = 20000;
    const MAX = 10000;

    test('0ms → maximum bonus', () => {
        expect(ScoringService.calculateTimeBonus(0, MAX, 0, DECAY)).toBe(10000);
    });

    test('10s on 20s question → 50% bonus', () => {
        // ratio = 10000/20000 = 0.5 → floor(10000 * 0.5) = 5000
        expect(ScoringService.calculateTimeBonus(10000, MAX, 0, DECAY)).toBe(5000);
    });

    test('20s on 20s question → 0 bonus', () => {
        expect(ScoringService.calculateTimeBonus(20000, MAX, 0, DECAY)).toBe(0);
    });

    test('beyond time limit → 0 bonus (clamped)', () => {
        expect(ScoringService.calculateTimeBonus(25000, MAX, 0, DECAY)).toBe(0);
    });

    test('5s on 20s → 75% bonus', () => {
        expect(ScoringService.calculateTimeBonus(5000, MAX, 0, DECAY)).toBe(7500);
    });

    test('threshold: 2000ms taken, 3000ms threshold → max', () => {
        expect(ScoringService.calculateTimeBonus(2000, MAX, 3000, DECAY)).toBe(10000);
    });

    test('threshold: 3000ms taken, 3000ms threshold → max', () => {
        expect(ScoringService.calculateTimeBonus(3000, MAX, 3000, DECAY)).toBe(10000);
    });

    test('threshold: 4000ms taken, 3000ms threshold → smooth decay from max', () => {
        // remaining window = 20000-3000 = 17000ms, elapsed past threshold = 1000ms
        // ratio = (17000-1000)/17000 = 16000/17000 ≈ 0.9412
        // bonus = floor(10000 * 0.9412) = 9411
        expect(ScoringService.calculateTimeBonus(4000, MAX, 3000, DECAY)).toBe(9411);
    });

    test('threshold: midpoint between threshold and end → 50% bonus', () => {
        // threshold=5000, decay=20000 → remaining=15000, midpoint at 12500ms
        // elapsed = 12500-5000 = 7500, ratio = 7500/15000 = 0.5
        expect(ScoringService.calculateTimeBonus(12500, MAX, 5000, DECAY)).toBe(5000);
    });

    test('short 10s question: 5s taken → 50% bonus', () => {
        expect(ScoringService.calculateTimeBonus(5000, MAX, 0, 10000)).toBe(5000);
    });

    test('long 60s question: 30s taken → 50% bonus', () => {
        expect(ScoringService.calculateTimeBonus(30000, MAX, 0, 60000)).toBe(5000);
    });

    test('fallback: no decayWindow → uses maxBonusValue as window', () => {
        // backward compat: 5000ms taken, maxBonus=10000, no decay window
        // ratio = (10000-5000)/10000 = 0.5 → floor(10000*0.5) = 5000
        expect(ScoringService.calculateTimeBonus(5000, MAX, 0)).toBe(5000);
    });
});

// ─── ScoringService.getDifficultyMultiplier ────────────────────────────────

describe('ScoringService.getDifficultyMultiplier', () => {
    const defaults = { easy: 1, medium: 2, hard: 3 };

    test('returns default multiplier', () => {
        expect(ScoringService.getDifficultyMultiplier('easy', defaults)).toBe(1);
        expect(ScoringService.getDifficultyMultiplier('medium', defaults)).toBe(2);
        expect(ScoringService.getDifficultyMultiplier('hard', defaults)).toBe(3);
    });

    test('custom multiplier overrides default', () => {
        expect(ScoringService.getDifficultyMultiplier('easy', defaults, { easy: 10 })).toBe(10);
    });

    test('missing custom falls back to default', () => {
        expect(ScoringService.getDifficultyMultiplier('hard', defaults, { easy: 10 })).toBe(3);
    });

    test('unknown difficulty with no match falls back to 2', () => {
        expect(ScoringService.getDifficultyMultiplier('extreme', defaults)).toBe(2);
    });

    test('undefined difficulty falls back to 2', () => {
        expect(ScoringService.getDifficultyMultiplier(undefined, defaults)).toBe(2);
    });
});

// ─── Consensus Mode Scoring ────────────────────────────────────────────────

describe('ScoringService consensus mode', () => {
    describe('getConsensusBonus', () => {
        test('100% consensus → 1.5x', () => {
            expect(ScoringService.getConsensusBonus(100)).toBe(1.5);
        });

        test('75% consensus → 1.2x', () => {
            expect(ScoringService.getConsensusBonus(75)).toBe(1.2);
        });

        test('90% consensus → 1.2x', () => {
            expect(ScoringService.getConsensusBonus(90)).toBe(1.2);
        });

        test('74% consensus → 1.0x', () => {
            expect(ScoringService.getConsensusBonus(74)).toBe(1.0);
        });

        test('0% consensus → 1.0x', () => {
            expect(ScoringService.getConsensusBonus(0)).toBe(1.0);
        });
    });

    describe('calculateConsensusTeamPoints', () => {
        test('correct, 100% consensus, hard → 450', () => {
            const result = ScoringService.calculateConsensusTeamPoints({
                isCorrect: true,
                consensusPercent: 100,
                difficulty: 'hard',
                config: CONFIG
            });
            // base=300, bonus=1.5 → 450
            expect(result).toBe(450);
        });

        test('correct, 80% consensus, medium → 240', () => {
            const result = ScoringService.calculateConsensusTeamPoints({
                isCorrect: true,
                consensusPercent: 80,
                difficulty: 'medium',
                config: CONFIG
            });
            // base=200, bonus=1.2 → 240
            expect(result).toBe(240);
        });

        test('correct, 50% consensus, easy → 100 (no bonus)', () => {
            const result = ScoringService.calculateConsensusTeamPoints({
                isCorrect: true,
                consensusPercent: 50,
                difficulty: 'easy',
                config: CONFIG
            });
            // base=100, bonus=1.0 → 100
            expect(result).toBe(100);
        });

        test('wrong answer → 0 regardless of consensus', () => {
            const result = ScoringService.calculateConsensusTeamPoints({
                isCorrect: false,
                consensusPercent: 100,
                difficulty: 'hard',
                config: CONFIG
            });
            expect(result).toBe(0);
        });
    });
});

// ─── Multi-Player Game Scenarios via Game.submitAnswer ──────────────────────

describe('Multi-player game scoring via Game.submitAnswer', () => {
    let game;

    const multiQuiz = {
        title: 'Multi-Type Scoring Test',
        questions: [
            {
                type: 'multiple-choice',
                question: 'Capital of France?',
                options: ['Berlin', 'Paris', 'Rome', 'Madrid'],
                correctIndex: 1,
                difficulty: 'easy',
                timeLimit: 20
            },
            {
                type: 'true-false',
                question: 'The sun is a star?',
                correctAnswer: true,
                difficulty: 'easy',
                timeLimit: 15
            },
            {
                type: 'multiple-correct',
                question: 'Which are prime?',
                options: ['2', '4', '5', '9'],
                correctIndices: [0, 2],
                difficulty: 'medium',
                timeLimit: 25
            },
            {
                type: 'numeric',
                question: 'What is 7×8?',
                correctAnswer: 56,
                tolerance: 0.5,
                difficulty: 'medium',
                timeLimit: 20
            },
            {
                type: 'ordering',
                question: 'Order smallest to largest',
                options: ['100', '10', '1', '1000'],
                correctOrder: [2, 1, 0, 3],
                difficulty: 'hard',
                timeLimit: 30
            }
        ]
    };

    beforeEach(() => {
        game = new Game('host-1', multiQuiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');
        game.addPlayer('charlie', 'Charlie');
    });

    function startQuestion(index) {
        game.currentQuestion = index;
        game.gameState = 'question';
        game.questionStartTime = Date.now();
    }

    function startQuestionAtTime(index, startTime) {
        game.currentQuestion = index;
        game.gameState = 'question';
        game.questionStartTime = startTime;
    }

    // ── Scenario 1: All correct, different speeds ──────────────────────

    test('scenario 1: all correct same question, different response times', () => {
        // Easy MC: base=100, timeBonus varies
        const baseTime = Date.now();
        startQuestionAtTime(0, baseTime - 10000); // question started 10s ago

        // Manually set questionStartTime for each "arrival"
        // Alice answers at 2s
        game.questionStartTime = baseTime - 2000;
        const alice = game.submitAnswer('alice', 1, 'multiple-choice');

        // Bob answers at 5s
        game.questionStartTime = baseTime - 5000;
        const bob = game.submitAnswer('bob', 1, 'multiple-choice');

        // Charlie answers at 9s
        game.questionStartTime = baseTime - 9000;
        const charlie = game.submitAnswer('charlie', 1, 'multiple-choice');

        expect(alice.isCorrect).toBe(true);
        expect(bob.isCorrect).toBe(true);
        expect(charlie.isCorrect).toBe(true);

        // Alice fastest → most points
        expect(alice.points).toBeGreaterThan(bob.points);
        expect(bob.points).toBeGreaterThan(charlie.points);
    });

    // ── Scenario 2: Mixed correctness ─────────────────────────────────

    test('scenario 2: mixed correct/wrong on true-false', () => {
        startQuestion(1); // true-false, easy

        const alice = game.submitAnswer('alice', true, 'true-false');
        const bob = game.submitAnswer('bob', false, 'true-false');
        const charlie = game.submitAnswer('charlie', true, 'true-false');

        expect(alice.isCorrect).toBe(true);
        expect(alice.points).toBeGreaterThan(0);

        expect(bob.isCorrect).toBe(false);
        expect(bob.points).toBe(0);

        expect(charlie.isCorrect).toBe(true);
        expect(charlie.points).toBeGreaterThan(0);
    });

    // ── Scenario 3: Multiple-correct, various combinations ────────────

    test('scenario 3: multiple-correct with various player selections', () => {
        startQuestion(2); // multiple-correct [0,2], medium

        const alice = game.submitAnswer('alice', [0, 2], 'multiple-correct'); // all correct
        const bob = game.submitAnswer('bob', [0], 'multiple-correct');        // missing one
        const charlie = game.submitAnswer('charlie', [1, 3], 'multiple-correct'); // all wrong

        expect(alice.isCorrect).toBe(true);
        expect(alice.points).toBeGreaterThan(0);

        expect(bob.isCorrect).toBe(false);
        expect(bob.points).toBe(0);

        expect(charlie.isCorrect).toBe(false);
        expect(charlie.points).toBe(0);
    });

    // ── Scenario 4: Numeric with tolerance ────────────────────────────

    test('scenario 4: numeric question, tolerance boundary', () => {
        startQuestion(3); // numeric, correct=56, tolerance=0.5

        const alice = game.submitAnswer('alice', 56, 'numeric');      // exact
        const bob = game.submitAnswer('bob', 56.4, 'numeric');        // within tolerance
        const charlie = game.submitAnswer('charlie', 57, 'numeric');  // outside tolerance

        expect(alice.isCorrect).toBe(true);
        expect(bob.isCorrect).toBe(true);
        expect(charlie.isCorrect).toBe(false);

        expect(alice.points).toBeGreaterThan(0);
        expect(bob.points).toBeGreaterThan(0);
        expect(charlie.points).toBe(0);
    });

    // ── Scenario 5: Ordering partial credit, multi-player ─────────────

    test('scenario 5: ordering with various partial credit results', () => {
        startQuestion(4); // ordering [2,1,0,3], hard

        const alice = game.submitAnswer('alice', [2, 1, 0, 3], 'ordering');   // 100%
        const bob = game.submitAnswer('bob', [2, 1, 3, 0], 'ordering');       // 50% (indices 0,1 correct)
        const charlie = game.submitAnswer('charlie', [3, 0, 1, 2], 'ordering'); // 0% all wrong

        expect(alice.isCorrect).toBe(true);
        expect(alice.points).toBeGreaterThan(0);

        // Bob gets partial credit
        expect(bob.isCorrect).toBe(false);
        expect(bob.points).toBeGreaterThan(0);
        expect(bob.points).toBeLessThan(alice.points);

        expect(charlie.isCorrect).toBe(false);
        expect(charlie.points).toBe(0);
    });

    // ── Scenario 6: Score accumulation across questions ───────────────

    test('scenario 6: scores accumulate correctly across multiple questions', () => {
        // Q0: easy MC
        startQuestion(0);
        game.submitAnswer('alice', 1, 'multiple-choice'); // correct
        game.submitAnswer('bob', 0, 'multiple-choice');   // wrong

        const aliceAfterQ0 = game.players.get('alice').score;
        const bobAfterQ0 = game.players.get('bob').score;

        expect(aliceAfterQ0).toBeGreaterThan(0);
        expect(bobAfterQ0).toBe(0);

        // Q1: easy TF
        startQuestion(1);
        game.submitAnswer('alice', true, 'true-false');  // correct
        game.submitAnswer('bob', true, 'true-false');    // correct

        const aliceAfterQ1 = game.players.get('alice').score;
        const bobAfterQ1 = game.players.get('bob').score;

        expect(aliceAfterQ1).toBeGreaterThan(aliceAfterQ0);
        expect(bobAfterQ1).toBeGreaterThan(0); // Bob finally scores
        expect(aliceAfterQ1).toBeGreaterThan(bobAfterQ1); // Alice still ahead
    });

    // ── Scenario 7: Duplicate answer prevention ───────────────────────

    test('scenario 7: player cannot double-score same question', () => {
        startQuestion(0);

        game.submitAnswer('alice', 1, 'multiple-choice');
        const scoreAfterFirst = game.players.get('alice').score;

        // Submit again for same question
        game.submitAnswer('alice', 1, 'multiple-choice');
        const scoreAfterSecond = game.players.get('alice').score;

        expect(scoreAfterSecond).toBe(scoreAfterFirst);
    });

    // ── Scenario 8: Leaderboard ordering ──────────────────────────────

    test('scenario 8: leaderboard ordered by score then time', () => {
        startQuestion(0);

        // Alice: correct, fast
        game.submitAnswer('alice', 1, 'multiple-choice');
        // Bob: correct (same question, slightly later due to execution time)
        game.submitAnswer('bob', 1, 'multiple-choice');
        // Charlie: wrong
        game.submitAnswer('charlie', 0, 'multiple-choice');

        game.updateLeaderboard();

        expect(game.leaderboard[0].name).toBe('Alice');
        expect(game.leaderboard[1].name).toBe('Bob');
        expect(game.leaderboard[2].name).toBe('Charlie');
        expect(game.leaderboard[2].score).toBe(0);
    });
});

// ─── Multi-Player with Scoring Config Overrides ────────────────────────────

describe('Multi-player game with scoring config overrides', () => {
    const simpleQuiz = {
        title: 'Config Override Test',
        questions: [
            {
                type: 'multiple-choice',
                question: 'Q1',
                options: ['A', 'B'],
                correctIndex: 0,
                difficulty: 'medium',
                timeLimit: 20
            },
            {
                type: 'multiple-choice',
                question: 'Q2',
                options: ['A', 'B'],
                correctIndex: 0,
                difficulty: 'hard',
                timeLimit: 20
            }
        ]
    };

    test('flat scoring: all correct players get same points regardless of speed', () => {
        const quiz = { ...simpleQuiz, scoringConfig: { timeBonusEnabled: false } };
        const game = new Game('host-1', quiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');

        game.currentQuestion = 0;
        game.gameState = 'question';

        // Alice answers "instantly"
        game.questionStartTime = Date.now();
        const alice = game.submitAnswer('alice', 0, 'multiple-choice');

        // Bob answers after 8 seconds
        game.questionStartTime = Date.now() - 8000;
        const bob = game.submitAnswer('bob', 0, 'multiple-choice');

        // Both should get same base-only points
        expect(alice.points).toBe(bob.points);
        expect(alice.points).toBe(200); // medium, base only
    });

    test('threshold mode: answers within grace period get same max points', () => {
        const quiz = { ...simpleQuiz, scoringConfig: { timeBonusThreshold: 5000 } };
        const game = new Game('host-1', quiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');

        game.currentQuestion = 0;
        game.gameState = 'question';

        // Alice answers at 1s (within 5s threshold)
        game.questionStartTime = Date.now() - 1000;
        const alice = game.submitAnswer('alice', 0, 'multiple-choice');

        // Bob answers at 4.5s (still within threshold)
        game.questionStartTime = Date.now() - 4500;
        const bob = game.submitAnswer('bob', 0, 'multiple-choice');

        expect(alice.points).toBe(bob.points);
        expect(alice.points).toBe(2200); // max: 200 + 2000
    });

    test('threshold mode: answer after threshold gets reduced bonus', () => {
        const quiz = { ...simpleQuiz, scoringConfig: { timeBonusThreshold: 3000 } };
        const game = new Game('host-1', quiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');

        game.currentQuestion = 0;
        game.gameState = 'question';

        // Alice within threshold
        game.questionStartTime = Date.now() - 2000;
        const alice = game.submitAnswer('alice', 0, 'multiple-choice');

        // Bob outside threshold at 7s
        game.questionStartTime = Date.now() - 7000;
        const bob = game.submitAnswer('bob', 0, 'multiple-choice');

        expect(alice.points).toBe(2200); // max (within threshold)
        expect(bob.points).toBeLessThan(alice.points);
        // Bob: 7s, threshold=3s, 20s question → remaining=17s, elapsed past=4s
        // ratio=13000/17000≈0.7647, bonus=floor(10000*0.7647)=7647
        // scaled=floor(7647*2/10)=1529 → 200+1529=1729
        expect(bob.points).toBe(1729);
    });

    test('custom multipliers change point values', () => {
        const quiz = {
            ...simpleQuiz,
            scoringConfig: {
                difficultyMultipliers: { easy: 1, medium: 5, hard: 10 }
            }
        };
        const game = new Game('host-1', quiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');

        game.currentQuestion = 0;
        game.gameState = 'question';
        game.questionStartTime = Date.now() - 5000;

        const result = game.submitAnswer('alice', 0, 'multiple-choice');

        // 5s on 20s, medium custom=5: ratio=0.75, bonus=7500
        // base=500, scaledTimeBonus=floor(7500*5/10)=3750 → 4250
        expect(result.points).toBe(4250);
    });
});

// ─── Power-Up Integration in Game ──────────────────────────────────────────

describe('Power-up scoring integration via Game', () => {
    const quiz = {
        title: 'Power-Up Test',
        powerUpsEnabled: true,
        questions: [
            {
                type: 'multiple-choice',
                question: 'Q1',
                options: ['A', 'B', 'C', 'D'],
                correctIndex: 0,
                correctAnswer: 0,
                difficulty: 'medium',
                timeLimit: 20
            }
        ]
    };

    test('double-points power-up doubles score on correct answer', () => {
        const game = new Game('host-1', quiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');

        game.currentQuestion = 0;
        game.gameState = 'question';
        game.questionStartTime = Date.now() - 5000;

        // Alice activates double-points
        game.usePowerUp('alice', 'double-points');
        const alice = game.submitAnswer('alice', 0, 'multiple-choice');

        // Bob no power-up
        const bob = game.submitAnswer('bob', 0, 'multiple-choice');

        expect(alice.doublePointsUsed).toBe(true);
        expect(bob.doublePointsUsed).toBe(false);
        expect(alice.points).toBe(bob.points * 2);
    });

    test('double-points consumed on wrong answer (0 × 2 = 0)', () => {
        const game = new Game('host-1', quiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');

        game.currentQuestion = 0;
        game.gameState = 'question';
        game.questionStartTime = Date.now() - 3000;

        game.usePowerUp('alice', 'double-points');
        const result = game.submitAnswer('alice', 1, 'multiple-choice');

        expect(result.doublePointsUsed).toBe(true);
        expect(result.points).toBe(0);

        // Power-up should be consumed (not available for next question)
        const player = game.players.get('alice');
        expect(player.powerUps['double-points'].used).toBe(true);
        expect(player.powerUps['double-points'].active).toBe(false);
    });
});

// ─── Consensus Mode via Game ───────────────────────────────────────────────

describe('Consensus mode scoring via Game', () => {
    const consensusQuiz = {
        title: 'Consensus Test',
        consensusMode: true,
        consensusThreshold: '66',
        discussionTime: 30,
        questions: [
            {
                type: 'multiple-choice',
                question: 'Q1',
                options: ['A', 'B', 'C'],
                correctIndex: 1,
                correctAnswer: 1,
                difficulty: 'medium',
                timeLimit: 20
            }
        ]
    };

    test('unanimous correct consensus gives 1.5x team bonus', () => {
        const game = new Game('host-1', consensusQuiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');

        game.currentQuestion = 0;
        game.gameState = 'question';

        // All players propose correct answer
        game.submitProposal('alice', 1);
        game.submitProposal('bob', 1);

        const result = game.lockConsensus();

        expect(result.isCorrect).toBe(true);
        expect(result.percentage).toBe(100);
        // base=200, bonus=1.5 → 300
        expect(result.teamPoints).toBe(300);
    });

    test('75%+ correct consensus gives 1.2x team bonus', () => {
        const game = new Game('host-1', consensusQuiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');
        game.addPlayer('charlie', 'Charlie');
        game.addPlayer('dave', 'Dave');

        game.currentQuestion = 0;
        game.gameState = 'question';

        // 3 out of 4 (75%) propose correct answer
        game.submitProposal('alice', 1);
        game.submitProposal('bob', 1);
        game.submitProposal('charlie', 1);
        game.submitProposal('dave', 0); // dissenter

        const result = game.lockConsensus();

        expect(result.isCorrect).toBe(true);
        expect(result.percentage).toBe(75);
        // base=200, bonus=1.2 → 240
        expect(result.teamPoints).toBe(240);
    });

    test('consensus on wrong answer gives 0 team points', () => {
        const game = new Game('host-1', consensusQuiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');

        game.currentQuestion = 0;
        game.gameState = 'question';

        // Unanimous but wrong
        game.submitProposal('alice', 0);
        game.submitProposal('bob', 0);

        const result = game.lockConsensus();

        expect(result.isCorrect).toBe(false);
        expect(result.teamPoints).toBe(0);
    });

    test('no consensus reached gives 0 team points', () => {
        const game = new Game('host-1', {
            ...consensusQuiz,
            consensusThreshold: '80'
        }, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');
        game.addPlayer('charlie', 'Charlie');

        game.currentQuestion = 0;
        game.gameState = 'question';

        // Split vote: 2/3 = 66%, below 80% threshold
        game.submitProposal('alice', 1);
        game.submitProposal('bob', 1);
        game.submitProposal('charlie', 0);

        const result = game.lockConsensus();

        expect(result.isCorrect).toBe(false);
        expect(result.teamPoints).toBe(0);
    });

    test('team score accumulates across questions', () => {
        const twoQuestionQuiz = {
            ...consensusQuiz,
            questions: [
                consensusQuiz.questions[0],
                {
                    type: 'multiple-choice',
                    question: 'Q2',
                    options: ['X', 'Y'],
                    correctIndex: 0,
                    correctAnswer: 0,
                    difficulty: 'hard',
                    timeLimit: 20
                }
            ]
        };

        const game = new Game('host-1', twoQuestionQuiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');

        // Q1: medium, unanimous correct → 300
        game.currentQuestion = 0;
        game.gameState = 'question';
        game.submitProposal('alice', 1);
        game.submitProposal('bob', 1);
        game.lockConsensus();

        expect(game.teamScore).toBe(300);

        // Q2: hard, unanimous correct → base=300, bonus=1.5 → 450
        game.resetConsensusForQuestion();
        game.currentQuestion = 1;
        game.submitProposal('alice', 0);
        game.submitProposal('bob', 0);
        game.lockConsensus();

        expect(game.teamScore).toBe(750);
    });
});

// ─── Full Game Simulation: 4 Players, 5 Questions ──────────────────────────

describe('Full game simulation: realistic scoring scenarios', () => {
    const fullQuiz = {
        title: 'Full Scoring Simulation',
        questions: [
            // Q0: Easy MC
            {
                type: 'multiple-choice',
                question: 'Easy MC',
                options: ['A', 'B', 'C', 'D'],
                correctIndex: 2,
                difficulty: 'easy',
                timeLimit: 20
            },
            // Q1: Medium TF
            {
                type: 'true-false',
                question: 'Medium TF',
                correctAnswer: false,
                difficulty: 'medium',
                timeLimit: 15
            },
            // Q2: Hard Multiple-Correct
            {
                type: 'multiple-correct',
                question: 'Hard multi-correct',
                options: ['A', 'B', 'C', 'D', 'E'],
                correctIndices: [1, 3, 4],
                difficulty: 'hard',
                timeLimit: 30
            },
            // Q3: Medium Numeric
            {
                type: 'numeric',
                question: 'Medium numeric',
                correctAnswer: 3.14,
                tolerance: 0.05,
                difficulty: 'medium',
                timeLimit: 20
            },
            // Q4: Hard Ordering
            {
                type: 'ordering',
                question: 'Hard ordering',
                options: ['D', 'B', 'A', 'C'],
                correctOrder: [2, 1, 3, 0],
                difficulty: 'hard',
                timeLimit: 30
            }
        ]
    };

    test('4 players across 5 diverse question types', () => {
        const game = new Game('host-1', fullQuiz, mockLogger, CONFIG);
        game.addPlayer('alice', 'Alice');
        game.addPlayer('bob', 'Bob');
        game.addPlayer('charlie', 'Charlie');
        game.addPlayer('diana', 'Diana');

        // ── Q0: Easy MC (correct=2) ──
        game.currentQuestion = 0;
        game.gameState = 'question';
        game.questionStartTime = Date.now() - 3000;

        game.submitAnswer('alice', 2, 'multiple-choice');   // correct
        game.submitAnswer('bob', 2, 'multiple-choice');     // correct
        game.submitAnswer('charlie', 0, 'multiple-choice'); // wrong
        game.submitAnswer('diana', 2, 'multiple-choice');   // correct

        expect(game.players.get('alice').score).toBeGreaterThan(0);
        expect(game.players.get('charlie').score).toBe(0);

        // ── Q1: Medium TF (correct=false) ──
        game.currentQuestion = 1;
        game.gameState = 'question';
        game.questionStartTime = Date.now() - 4000;

        game.submitAnswer('alice', false, 'true-false');   // correct
        game.submitAnswer('bob', true, 'true-false');      // wrong
        game.submitAnswer('charlie', false, 'true-false'); // correct
        game.submitAnswer('diana', false, 'true-false');   // correct

        // ── Q2: Hard multi-correct (correct=[1,3,4]) ──
        game.currentQuestion = 2;
        game.gameState = 'question';
        game.questionStartTime = Date.now() - 6000;

        game.submitAnswer('alice', [1, 3, 4], 'multiple-correct');   // correct
        game.submitAnswer('bob', [1, 3, 4], 'multiple-correct');     // correct
        game.submitAnswer('charlie', [1, 3], 'multiple-correct');    // missing one → wrong
        game.submitAnswer('diana', [0, 1, 3, 4], 'multiple-correct'); // extra → wrong

        // ── Q3: Medium numeric (correct=3.14, tol=0.05) ──
        game.currentQuestion = 3;
        game.gameState = 'question';
        game.questionStartTime = Date.now() - 5000;

        game.submitAnswer('alice', 3.14, 'numeric');    // exact
        game.submitAnswer('bob', 3.10, 'numeric');      // within tolerance
        game.submitAnswer('charlie', 3.20, 'numeric');  // outside
        game.submitAnswer('diana', 3.12, 'numeric');    // within

        // ── Q4: Hard ordering (correct=[2,1,3,0]) ──
        game.currentQuestion = 4;
        game.gameState = 'question';
        game.questionStartTime = Date.now() - 8000;

        game.submitAnswer('alice', [2, 1, 3, 0], 'ordering');   // 100%
        game.submitAnswer('bob', [2, 1, 0, 3], 'ordering');     // 50%
        game.submitAnswer('charlie', [0, 1, 3, 2], 'ordering'); // 25% (only index 1 correct)
        game.submitAnswer('diana', [2, 1, 3, 0], 'ordering');   // 100%

        // Final leaderboard
        game.updateLeaderboard();

        const scores = {};
        game.leaderboard.forEach(p => { scores[p.name] = p.score; });

        // Alice: all correct across all types → highest
        // Diana: 4 correct, 1 wrong (multi-correct) → second
        // Bob: 3 correct + partial ordering, 1 wrong TF → third-ish
        // Charlie: 1 correct (TF) + tiny partial ordering → lowest

        expect(scores['Alice']).toBeGreaterThan(scores['Bob']);
        expect(scores['Alice']).toBeGreaterThan(scores['Charlie']);
        expect(scores['Diana']).toBeGreaterThan(scores['Charlie']);

        // Verify no scores are negative
        Object.values(scores).forEach(s => expect(s).toBeGreaterThanOrEqual(0));
    });

    test('player answering all correctly but slowly vs. fast wrong mix', () => {
        const game = new Game('host-1', fullQuiz, mockLogger, CONFIG);
        game.addPlayer('slow-ace', 'SlowAce');
        game.addPlayer('fast-miss', 'FastMiss');

        // SlowAce: always correct but near 10s mark (base points only)
        // FastMiss: alternates correct/wrong at 1s mark

        // Q0: Easy MC
        game.currentQuestion = 0;
        game.gameState = 'question';

        game.questionStartTime = Date.now() - 9500;
        game.submitAnswer('slow-ace', 2, 'multiple-choice');    // correct, slow

        game.questionStartTime = Date.now() - 1000;
        game.submitAnswer('fast-miss', 0, 'multiple-choice');   // wrong, fast

        // Q1: Medium TF
        game.currentQuestion = 1;
        game.gameState = 'question';

        game.questionStartTime = Date.now() - 9000;
        game.submitAnswer('slow-ace', false, 'true-false');     // correct, slow

        game.questionStartTime = Date.now() - 1000;
        game.submitAnswer('fast-miss', false, 'true-false');    // correct, fast

        // SlowAce should have more total from 2 correct (even if slow)
        // than FastMiss with only 1 correct (even though fast)
        const slowScore = game.players.get('slow-ace').score;
        const fastScore = game.players.get('fast-miss').score;

        // SlowAce: Q0 ≈100 (base only, easy), Q1 ≈200+some
        // FastMiss: Q0=0, Q1 ≈200+1800=2000
        // So FastMiss might actually be higher with 1 fast correct vs 2 slow correct
        // This demonstrates the time bonus weight
        expect(slowScore).toBeGreaterThan(0);
        expect(fastScore).toBeGreaterThan(0);
    });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────

describe('Scoring edge cases', () => {
    test('null answer treated as wrong', () => {
        const now = Date.now();
        const result = ScoringService.calculateScore(buildScoreParams({
            answer: null,
            questionStartTime: now - 5000
        }));

        expect(result.isCorrect).toBe(false);
        expect(result.points).toBe(0);
    });

    test('undefined answer treated as wrong', () => {
        const now = Date.now();
        const result = ScoringService.calculateScore(buildScoreParams({
            answer: undefined,
            questionStartTime: now - 5000
        }));

        expect(result.isCorrect).toBe(false);
        expect(result.points).toBe(0);
    });

    test('ordering: mismatched array lengths returns 0', () => {
        const now = Date.now();
        const result = ScoringService.calculateScore(buildScoreParams({
            answer: [0, 1], // only 2 items for 4-item order
            question: {
                type: 'ordering',
                options: ['A', 'B', 'C', 'D'],
                correctOrder: [0, 1, 2, 3],
                difficulty: 'medium'
            },
            questionType: 'ordering',
            questionStartTime: now - 5000
        }));

        expect(result.points).toBe(0);
    });

    test('numeric: NaN answer is wrong', () => {
        const now = Date.now();
        const result = ScoringService.calculateScore(buildScoreParams({
            answer: 'not-a-number',
            question: {
                type: 'numeric',
                correctAnswer: 42,
                difficulty: 'medium'
            },
            questionType: 'numeric',
            questionStartTime: now - 5000
        }));

        expect(result.isCorrect).toBe(false);
        expect(result.points).toBe(0);
    });

    test('very large time taken still returns 0 bonus (no negative)', () => {
        const now = Date.now();
        const result = ScoringService.calculateScore(buildScoreParams({
            questionStartTime: now - 60000 // 60 seconds
        }));

        expect(result.isCorrect).toBe(true);
        expect(result.breakdown.timeBonus).toBe(0);
        expect(result.points).toBe(200); // base only
    });

    test('getCorrectAnswerKey handles all question types', () => {
        expect(ScoringService.getCorrectAnswerKey(
            { correctIndex: 2 }, 'multiple-choice'
        )).toBe(2);

        expect(ScoringService.getCorrectAnswerKey(
            { correctIndices: [0, 1] }, 'multiple-correct'
        )).toEqual([0, 1]);

        expect(ScoringService.getCorrectAnswerKey(
            { correctAnswer: true }, 'true-false'
        )).toBe(true);

        expect(ScoringService.getCorrectAnswerKey(
            { correctAnswer: 42 }, 'numeric'
        )).toBe(42);

        expect(ScoringService.getCorrectAnswerKey(
            { correctOrder: [2, 0, 1] }, 'ordering'
        )).toEqual([2, 0, 1]);
    });

    test('multiple-correct: legacy correctAnswers field works', () => {
        expect(ScoringService.getCorrectAnswerKey(
            { correctAnswers: [0, 3] }, 'multiple-correct'
        )).toEqual([0, 3]);
    });
});

// ─── Score Breakdown Verification ──────────────────────────────────────────

describe('Score breakdown transparency', () => {
    test('breakdown contains all components', () => {
        const now = Date.now();
        const result = ScoringService.calculateScore(buildScoreParams({
            questionStartTime: now - 4000
        }));

        expect(result.breakdown).toEqual({
            basePoints: 200,
            timeBonus: expect.any(Number),
            difficultyMultiplier: 2,
            doublePointsMultiplier: 1
        });

        // Verify breakdown math adds up
        expect(result.points).toBe(
            result.breakdown.basePoints + result.breakdown.timeBonus
        );
    });

    test('breakdown with double points shows multiplier', () => {
        const now = Date.now();
        const result = ScoringService.calculateScore(buildScoreParams({
            questionStartTime: now - 5000,
            doublePointsMultiplier: 2
        }));

        expect(result.breakdown.doublePointsMultiplier).toBe(2);
        expect(result.points).toBe(
            (result.breakdown.basePoints + result.breakdown.timeBonus) * 2
        );
    });
});
