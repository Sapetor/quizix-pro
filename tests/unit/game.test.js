/**
 * Game Class — Behavioral Unit Tests
 *
 * Exercises the game state machine and its invariants: lifecycle, player
 * management, power-ups, answer submission (accept / duplicate / wrong),
 * score accumulation, consensus mode, leaderboard ordering, answer statistics,
 * timer clearing, reset/cleanup, and results-save idempotency.
 *
 * Scoring *formula* correctness is covered by game-scoring-parity.test.js and
 * scoring-service.test.js — here we only assert that scores accumulate and
 * persist through the Game object correctly.
 *
 * I/O is mocked: atomic-write (file writes) and fs.mkdir are stubbed so
 * saveResults never touches disk. Timers use jest fake timers.
 */

jest.mock('../../services/atomic-write', () => ({
    atomicWriteFile: jest.fn().mockResolvedValue(undefined)
}));

const fs = require('fs');
const { atomicWriteFile } = require('../../services/atomic-write');
const { Game } = require('../../services/game');

const CONFIG = {
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 },
        DEFAULT_NUMERIC_TOLERANCE: 0.1
    },
    TIMING: {
        DEFAULT_QUESTION_TIME: 20
    }
};

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

const DEFAULT_LIMITS = { MAX_PLAYERS_PER_GAME: 200 };

function makeGame(quizOverrides = {}, { scoringConfig = null, limits = DEFAULT_LIMITS } = {}) {
    const quiz = {
        title: 'Test Quiz',
        questions: [],
        ...quizOverrides
    };
    if (scoringConfig) quiz.scoringConfig = scoringConfig;
    return new Game('host-1', quiz, mockLogger, CONFIG, limits);
}

function mcQuestion(overrides = {}) {
    return {
        type: 'multiple-choice',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 1,
        correctIndex: 1,
        difficulty: 'easy',
        timeLimit: 20,
        ...overrides
    };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Game — construction & initial state', () => {
    test('initializes lobby state, empty players, and timer nulls', () => {
        const game = makeGame();
        expect(game.gameState).toBe('lobby');
        expect(game.currentQuestion).toBe(-1);
        expect(game.players.size).toBe(0);
        expect(game.teamScore).toBe(0);
        expect(game.resultsSaved).toBe(false);
        expect(game.questionTimer).toBeNull();
        expect(game.advanceTimer).toBeNull();
        expect(game.startTimer).toBeNull();
        expect(game.earlyEndTimer).toBeNull();
        expect(game.leaderboardTimer).toBeNull();
    });

    test('generates a 6-digit string PIN and a UUID id', () => {
        const game = makeGame();
        expect(game.pin).toMatch(/^\d{6}$/);
        expect(typeof game.id).toBe('string');
        expect(game.id.length).toBeGreaterThan(0);
    });

    test('reads flags and consensus config from quiz', () => {
        const game = makeGame({
            manualAdvancement: true,
            powerUpsEnabled: true,
            consensusMode: true,
            consensusThreshold: '80',
            discussionTime: 45,
            allowChat: true
        });
        expect(game.manualAdvancement).toBe(true);
        expect(game.powerUpsEnabled).toBe(true);
        expect(game.isConsensusMode).toBe(true);
        expect(game.consensusConfig).toEqual({ threshold: 80, discussionTime: 45, allowChat: true });
    });

    test('defaults consensus threshold to 66 when unspecified', () => {
        const game = makeGame({ consensusMode: true });
        expect(game.consensusConfig.threshold).toBe(66);
    });

    test('falls back to null scoringConfig when quiz omits it', () => {
        expect(makeGame().scoringConfig).toBeNull();
    });
});

describe('Game — addPlayer / removePlayer', () => {
    test('adds a player with zeroed score and empty answers', () => {
        const game = makeGame();
        const res = game.addPlayer('p1', 'Alice');
        expect(res.success).toBe(true);
        expect(res.player).toMatchObject({ id: 'p1', name: 'Alice', score: 0, answers: [] });
        expect(game.players.size).toBe(1);
    });

    test('does not attach powerUps when power-ups disabled', () => {
        const game = makeGame();
        game.addPlayer('p1', 'Alice');
        expect(game.players.get('p1').powerUps).toBeUndefined();
    });

    test('attaches fresh power-up state when enabled', () => {
        const game = makeGame({ powerUpsEnabled: true });
        game.addPlayer('p1', 'Alice');
        const pu = game.players.get('p1').powerUps;
        expect(pu['fifty-fifty']).toEqual({ available: true, used: false });
        expect(pu['double-points']).toEqual({ available: true, used: false, active: false });
    });

    test('rejects joining past MAX_PLAYERS_PER_GAME with error_game_full', () => {
        const game = makeGame({}, { limits: { MAX_PLAYERS_PER_GAME: 2 } });
        expect(game.addPlayer('p1', 'A').success).toBe(true);
        expect(game.addPlayer('p2', 'B').success).toBe(true);
        const res = game.addPlayer('p3', 'C');
        expect(res.success).toBe(false);
        expect(res.messageKey).toBe('error_game_full');
        expect(game.players.size).toBe(2);
    });

    test('removePlayer deletes from the map', () => {
        const game = makeGame();
        game.addPlayer('p1', 'Alice');
        game.removePlayer('p1');
        expect(game.players.has('p1')).toBe(false);
    });
});

describe('Game — power-ups', () => {
    function gameWithPlayer() {
        const game = makeGame({ powerUpsEnabled: true, questions: [mcQuestion()] });
        game.addPlayer('p1', 'Alice');
        game.currentQuestion = 0;
        return game;
    }

    test('rejects usePowerUp when power-ups disabled for the game', () => {
        const game = makeGame();
        game.addPlayer('p1', 'Alice');
        const res = game.usePowerUp('p1', 'fifty-fifty');
        expect(res.success).toBe(false);
        expect(res.messageKey).toBe('error_powerup_not_enabled');
    });

    test('rejects unknown player', () => {
        const game = gameWithPlayer();
        expect(game.usePowerUp('ghost', 'fifty-fifty').messageKey).toBe('error_player_not_found');
    });

    test('rejects unknown power-up type', () => {
        const game = gameWithPlayer();
        expect(game.usePowerUp('p1', 'teleport').messageKey).toBe('error_unknown_powerup');
    });

    test('fifty-fifty returns hidden options and marks the power-up used', () => {
        const game = gameWithPlayer();
        const res = game.usePowerUp('p1', 'fifty-fifty');
        expect(res.success).toBe(true);
        expect(Array.isArray(res.hiddenOptions)).toBe(true);
        // 4 options, 1 correct → 3 wrong → hide ceil(3/2) = 2
        expect(res.hiddenOptions).toHaveLength(2);
        expect(res.hiddenOptions).not.toContain(1); // never hides the correct index
        expect(game.players.get('p1').powerUps['fifty-fifty'].used).toBe(true);
    });

    test('rejects reusing a spent power-up', () => {
        const game = gameWithPlayer();
        game.usePowerUp('p1', 'extend-time');
        const res = game.usePowerUp('p1', 'extend-time');
        expect(res.success).toBe(false);
        expect(res.messageKey).toBe('error_powerup_already_used');
    });

    test('extend-time returns 10 extra seconds', () => {
        const game = gameWithPlayer();
        expect(game.usePowerUp('p1', 'extend-time').extraSeconds).toBe(10);
    });

    test('double-points activates and is consumed once by getAndConsumeDoublePoints', () => {
        const game = gameWithPlayer();
        game.usePowerUp('p1', 'double-points');
        expect(game.players.get('p1').powerUps['double-points'].active).toBe(true);
        expect(game.getAndConsumeDoublePoints('p1')).toBe(2); // consumes
        expect(game.getAndConsumeDoublePoints('p1')).toBe(1); // already consumed
    });

    test('getAndConsumeDoublePoints returns 1 when not active', () => {
        const game = gameWithPlayer();
        expect(game.getAndConsumeDoublePoints('p1')).toBe(1);
    });

    test('fifty-fifty remaps hidden options through the player answer mapping', () => {
        const game = gameWithPlayer();
        // mapping[shuffledIndex] = originalIndex; reversed order here
        game.answerMappings.set('p1', [3, 2, 1, 0]);
        const res = game.usePowerUp('p1', 'fifty-fifty');
        // Every returned index must be a valid shuffled position (0..3)
        res.hiddenOptions.forEach(i => expect(i).toBeGreaterThanOrEqual(0));
        res.hiddenOptions.forEach(i => expect(i).toBeLessThan(4));
        // Correct original index 1 sits at shuffled position 2, so 2 must not appear
        expect(res.hiddenOptions).not.toContain(2);
    });
});

describe('Game — question advancement', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('nextQuestion advances index and returns true while questions remain', () => {
        const game = makeGame({ questions: [mcQuestion(), mcQuestion()] });
        expect(game.nextQuestion()).toBe(true);
        expect(game.currentQuestion).toBe(0);
        expect(game.gameState).toBe('question');
        expect(game.nextQuestion()).toBe(true);
        expect(game.currentQuestion).toBe(1);
    });

    test('nextQuestion returns false and does not advance past the last question', () => {
        const game = makeGame({ questions: [mcQuestion()] });
        game.nextQuestion(); // -> 0
        expect(game.nextQuestion()).toBe(false);
        expect(game.currentQuestion).toBe(0);
    });

    test('nextQuestion clears stale question/advance/leaderboard timers', () => {
        const game = makeGame({ questions: [mcQuestion(), mcQuestion()] });
        game.questionTimer = setTimeout(() => {}, 1000);
        game.advanceTimer = setTimeout(() => {}, 1000);
        game.leaderboardTimer = setTimeout(() => {}, 1000);
        game.nextQuestion();
        expect(game.questionTimer).toBeNull();
        expect(game.advanceTimer).toBeNull();
        expect(game.leaderboardTimer).toBeNull();
    });

    test('endQuestion moves to revealing and clears question/advance timers', () => {
        const game = makeGame({ questions: [mcQuestion()] });
        game.questionTimer = setTimeout(() => {}, 1000);
        game.advanceTimer = setTimeout(() => {}, 1000);
        game.endQuestion();
        expect(game.gameState).toBe('revealing');
        expect(game.questionTimer).toBeNull();
        expect(game.advanceTimer).toBeNull();
    });
});

describe('Game — submitAnswer', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function startedGame(questions) {
        const game = makeGame({ questions });
        game.addPlayer('p1', 'Alice');
        game.currentQuestion = 0;
        game.gameState = 'question';
        game.questionStartTime = Date.now();
        return game;
    }

    test('returns false for an unknown player', () => {
        const game = startedGame([mcQuestion()]);
        expect(game.submitAnswer('ghost', 1, 'multiple-choice')).toBe(false);
    });

    test('scores a correct answer and accumulates it onto the player score', () => {
        const game = startedGame([mcQuestion({ correctAnswer: 1, correctIndex: 1 })]);
        const res = game.submitAnswer('p1', 1, 'multiple-choice');
        expect(res.isCorrect).toBe(true);
        expect(res.points).toBeGreaterThan(0);
        expect(game.players.get('p1').score).toBe(res.points);
    });

    test('records a wrong answer as zero points', () => {
        const game = startedGame([mcQuestion({ correctAnswer: 1, correctIndex: 1 })]);
        const res = game.submitAnswer('p1', 0, 'multiple-choice');
        expect(res.isCorrect).toBe(false);
        expect(res.points).toBe(0);
        expect(game.players.get('p1').score).toBe(0);
    });

    test('is idempotent per question — a duplicate submission does not double-score', () => {
        const game = startedGame([mcQuestion({ correctAnswer: 1, correctIndex: 1 })]);
        const first = game.submitAnswer('p1', 1, 'multiple-choice');
        const scoreAfterFirst = game.players.get('p1').score;
        const second = game.submitAnswer('p1', 0, 'multiple-choice'); // even a different answer
        expect(second).toEqual(game.players.get('p1').answers[0]);
        expect(game.players.get('p1').score).toBe(scoreAfterFirst);
        expect(second.points).toBe(first.points);
    });

    test('accumulates score across two questions', () => {
        const game = startedGame([
            mcQuestion({ correctAnswer: 1, correctIndex: 1 }),
            mcQuestion({ correctAnswer: 2, correctIndex: 2 })
        ]);
        const r1 = game.submitAnswer('p1', 1, 'multiple-choice');
        game.currentQuestion = 1;
        game.questionStartTime = Date.now();
        const r2 = game.submitAnswer('p1', 2, 'multiple-choice');
        expect(r2.isCorrect).toBe(true);
        expect(game.players.get('p1').score).toBe(r1.points + r2.points);
    });

    test('applies the double-points multiplier and stores the flag', () => {
        const game = makeGame({ powerUpsEnabled: true, questions: [mcQuestion()] });
        game.addPlayer('p1', 'Alice');
        game.currentQuestion = 0;
        game.gameState = 'question';
        game.questionStartTime = Date.now();
        game.usePowerUp('p1', 'double-points');

        const withDouble = game.submitAnswer('p1', 1, 'multiple-choice');

        // Compare to a control game answered identically without the multiplier.
        const control = makeGame({ questions: [mcQuestion()] });
        control.addPlayer('c', 'C');
        control.currentQuestion = 0;
        control.gameState = 'question';
        control.questionStartTime = Date.now();
        const single = control.submitAnswer('c', 1, 'multiple-choice');

        expect(withDouble.doublePointsUsed).toBe(true);
        expect(withDouble.points).toBe(single.points * 2);
    });

    test('translates a shuffled multiple-choice index back to the original before scoring', () => {
        const game = startedGame([mcQuestion({ correctAnswer: 1, correctIndex: 1 })]);
        // mapping[shuffledIndex] = originalIndex; correct original 1 lives at shuffled 3
        game.answerMappings.set('p1', [3, 2, 0, 1]);
        const res = game.submitAnswer('p1', 3, 'multiple-choice');
        expect(res.isCorrect).toBe(true);
    });
});

describe('Game — consensus mode', () => {
    function consensusGame(question) {
        const game = makeGame({
            consensusMode: true,
            consensusThreshold: '66',
            questions: [question]
        });
        game.currentQuestion = 0;
        game.gameState = 'question';
        return game;
    }

    test('submitProposal is a no-op (returns null) outside consensus mode', () => {
        const game = makeGame({ questions: [mcQuestion()] });
        expect(game.submitProposal('p1', 1)).toBeNull();
    });

    test('submitProposal records the proposal and returns the distribution', () => {
        const game = consensusGame(mcQuestion());
        game.addPlayer('p1', 'A');
        game.addPlayer('p2', 'B');
        const dist = game.submitProposal('p1', 1);
        expect(dist.totalProposals).toBe(1);
        expect(dist.totalPlayers).toBe(2);
        expect(dist.leadingAnswer).toBe(1);
    });

    test('submitProposal is rejected once consensus is locked', () => {
        const game = consensusGame(mcQuestion());
        game.addPlayer('p1', 'A');
        game.submitProposal('p1', 1);
        game.lockConsensus();
        expect(game.submitProposal('p1', 2)).toBeNull();
    });

    test('consensusPercent is computed against total player count', () => {
        const game = consensusGame(mcQuestion());
        game.addPlayer('p1', 'A');
        game.addPlayer('p2', 'B');
        game.addPlayer('p3', 'C');
        game.submitProposal('p1', 1);
        game.submitProposal('p2', 1);
        // 2 of 3 → 67%
        expect(game.getProposalDistribution().consensusPercent).toBe(67);
    });

    test('checkConsensus reports reached only at/above threshold', () => {
        const game = consensusGame(mcQuestion());
        ['p1', 'p2', 'p3'].forEach(id => game.addPlayer(id, id));
        game.submitProposal('p1', 1);
        expect(game.checkConsensus().reached).toBe(false); // 33%
        game.submitProposal('p2', 1);
        const reached = game.checkConsensus(); // 67% >= 66
        expect(reached.reached).toBe(true);
        expect(reached.answer).toBe(1);
    });

    test('lockConsensus awards team points for a correct unanimous answer and accumulates teamScore', () => {
        const game = consensusGame(mcQuestion({ correctAnswer: 1, correctIndex: 1, difficulty: 'hard' }));
        game.addPlayer('p1', 'A');
        game.addPlayer('p2', 'B');
        game.submitProposal('p1', 1);
        game.submitProposal('p2', 1);
        const res = game.lockConsensus();
        expect(res.isCorrect).toBe(true);
        expect(res.teamPoints).toBeGreaterThan(0);
        expect(game.teamScore).toBe(res.teamPoints);
        expect(res.totalTeamScore).toBe(res.teamPoints);
    });

    test('lockConsensus awards zero for a consensus on the wrong answer', () => {
        const game = consensusGame(mcQuestion({ correctAnswer: 1, correctIndex: 1 }));
        game.addPlayer('p1', 'A');
        game.addPlayer('p2', 'B');
        game.submitProposal('p1', 0);
        game.submitProposal('p2', 0);
        const res = game.lockConsensus();
        // Consensus is reached (66% agree) but on the wrong option → not correct, no points.
        expect(res.percentage).toBeGreaterThanOrEqual(66);
        expect(res.isCorrect).toBe(false);
        expect(res.teamPoints).toBe(0);
        expect(game.teamScore).toBe(0);
    });

    test('lockConsensus awards zero and null answer when no consensus is reached', () => {
        const game = consensusGame(mcQuestion({ correctAnswer: 1, correctIndex: 1 }));
        ['p1', 'p2', 'p3'].forEach(id => game.addPlayer(id, id));
        game.submitProposal('p1', 0);
        game.submitProposal('p2', 1);
        game.submitProposal('p3', 2);
        const res = game.lockConsensus();
        expect(res.answer).toBeNull();
        expect(res.teamPoints).toBe(0);
    });

    test('lockConsensus is single-shot (second call returns null)', () => {
        const game = consensusGame(mcQuestion());
        game.addPlayer('p1', 'A');
        game.submitProposal('p1', 1);
        expect(game.lockConsensus()).not.toBeNull();
        expect(game.lockConsensus()).toBeNull();
    });

    test('resetConsensusForQuestion clears proposals, messages, and lock', () => {
        const game = consensusGame(mcQuestion());
        game.addPlayer('p1', 'A');
        game.submitProposal('p1', 1);
        game.lockConsensus();
        game.resetConsensusForQuestion();
        expect(game.proposals.size).toBe(0);
        expect(game.discussionMessages).toEqual([]);
        expect(game.consensusLocked).toBe(false);
    });

    test('addDiscussionMessage returns null for unknown player and caps history at 50', () => {
        const game = consensusGame(mcQuestion());
        expect(game.addDiscussionMessage('ghost', 'chat', 'hi')).toBeNull();
        game.addPlayer('p1', 'A');
        for (let i = 0; i < 55; i++) game.addDiscussionMessage('p1', 'chat', `m${i}`);
        expect(game.discussionMessages.length).toBe(50);
        expect(game.discussionMessages[game.discussionMessages.length - 1].content).toBe('m54');
    });
});

describe('Game — leaderboard', () => {
    test('sorts by score descending', () => {
        const game = makeGame();
        game.addPlayer('p1', 'Alice');
        game.addPlayer('p2', 'Bob');
        game.players.get('p1').score = 100;
        game.players.get('p2').score = 300;
        game.updateLeaderboard();
        expect(game.leaderboard.map(p => p.name)).toEqual(['Bob', 'Alice']);
    });

    test('breaks score ties by faster total answer time', () => {
        const game = makeGame();
        game.addPlayer('slow', 'Slow');
        game.addPlayer('fast', 'Fast');
        game.players.get('slow').score = 200;
        game.players.get('fast').score = 200;
        game.players.get('slow').answers = { 0: { timeMs: 9000 } };
        game.players.get('fast').answers = { 0: { timeMs: 1000 } };
        game.updateLeaderboard();
        expect(game.leaderboard.map(p => p.name)).toEqual(['Fast', 'Slow']);
    });

    test('includes removed (disconnected) players so their scores persist', () => {
        const game = makeGame();
        game.addPlayer('p1', 'Active');
        game.players.get('p1').score = 50;
        game.removedPlayers.push({ name: 'Gone', score: 500, answers: {} });
        game.updateLeaderboard();
        expect(game.leaderboard[0].name).toBe('Gone');
    });
});

describe('Game — answer statistics', () => {
    test('returns an empty shell when there is no current question', () => {
        const game = makeGame({ questions: [] });
        game.addPlayer('p1', 'A');
        game.currentQuestion = 0;
        const stats = game.getAnswerStatistics();
        expect(stats.totalPlayers).toBe(1);
        expect(stats.answeredPlayers).toBe(0);
    });

    test('counts multiple-choice answers and excludes disconnected players from totals', () => {
        const game = makeGame({ questions: [mcQuestion({ options: ['A', 'B', 'C', 'D'] })] });
        game.addPlayer('p1', 'A');
        game.addPlayer('p2', 'B');
        game.addPlayer('p3', 'C');
        game.currentQuestion = 0;
        game.players.get('p1').answers[0] = { answer: 1 };
        game.players.get('p2').answers[0] = { answer: 1 };
        game.players.get('p3').disconnected = true;
        game.players.get('p3').answers[0] = { answer: 0 };

        const stats = game.getAnswerStatistics();
        expect(stats.totalPlayers).toBe(2);       // p3 excluded
        expect(stats.answeredPlayers).toBe(2);
        expect(stats.answerCounts[1]).toBe(2);
        expect(stats.answerCounts[0]).toBe(0);     // p3's answer not counted
        expect(stats.scoringInfo).toBeDefined();
    });

    test('initializes true/false buckets and counts case-insensitively', () => {
        const game = makeGame({ questions: [{ type: 'true-false', correctAnswer: true }] });
        game.addPlayer('p1', 'A');
        game.currentQuestion = 0;
        game.players.get('p1').answers[0] = { answer: 'True' };
        const stats = game.getAnswerStatistics();
        expect(stats.answerCounts.true).toBe(1);
        expect(stats.answerCounts.false).toBe(0);
    });
});

describe('Game — concept mastery', () => {
    test('reports no concepts when the quiz has none', () => {
        const game = makeGame({ questions: [mcQuestion()] });
        game.addPlayer('p1', 'A');
        const mastery = game.calculatePlayerConceptMastery('p1');
        expect(mastery.hasConcepts).toBe(false);
        expect(mastery.concepts).toEqual([]);
    });

    test('aggregates per-concept mastery and sorts weakest first', () => {
        const game = makeGame({
            questions: [
                mcQuestion({ concepts: ['algebra'] }),
                mcQuestion({ concepts: ['geometry'] })
            ]
        });
        game.addPlayer('p1', 'A');
        game.players.get('p1').answers = [
            { isCorrect: true },   // algebra correct
            { isCorrect: false }   // geometry wrong
        ];
        const mastery = game.calculatePlayerConceptMastery('p1');
        expect(mastery.hasConcepts).toBe(true);
        expect(mastery.concepts[0]).toMatchObject({ name: 'geometry', mastery: 0 });
        expect(mastery.concepts[1]).toMatchObject({ name: 'algebra', mastery: 100 });
    });

    test('returns empty for an unknown player', () => {
        const game = makeGame({ questions: [mcQuestion({ concepts: ['x'] })] });
        expect(game.calculatePlayerConceptMastery('ghost').hasConcepts).toBe(false);
    });
});

describe('Game — clearTimers / reset / cleanup', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('clearTimers nulls every tracked timer handle', () => {
        const game = makeGame();
        game.questionTimer = setTimeout(() => {}, 1000);
        game.advanceTimer = setTimeout(() => {}, 1000);
        game.earlyEndTimer = setTimeout(() => {}, 1000);
        game.startTimer = setTimeout(() => {}, 1000);
        game.leaderboardTimer = setTimeout(() => {}, 1000);
        game.clearTimers();
        expect(game.questionTimer).toBeNull();
        expect(game.advanceTimer).toBeNull();
        expect(game.earlyEndTimer).toBeNull();
        expect(game.startTimer).toBeNull();
        expect(game.leaderboardTimer).toBeNull();
    });

    test('reset returns to lobby, keeps players, and zeroes scores/answers', () => {
        const game = makeGame({ powerUpsEnabled: true, questions: [mcQuestion()] });
        game.addPlayer('p1', 'Alice');
        game.players.get('p1').score = 500;
        game.players.get('p1').answers = [{ isCorrect: true }];
        game.currentQuestion = 3;
        game.gameState = 'finished';
        game.resultsSaved = true;

        game.reset();

        expect(game.gameState).toBe('lobby');
        expect(game.currentQuestion).toBe(-1);
        expect(game.resultsSaved).toBe(false);
        expect(game.players.has('p1')).toBe(true);        // player retained
        expect(game.players.get('p1').score).toBe(0);
        expect(game.players.get('p1').answers).toEqual([]);
        expect(game.players.get('p1').powerUps['fifty-fifty'].used).toBe(false);
    });

    test('reset zeroes teamScore and consensus state in consensus mode', () => {
        const game = makeGame({ consensusMode: true, questions: [mcQuestion()] });
        game.addPlayer('p1', 'A');
        game.teamScore = 900;
        game.proposals.set('p1', 1);
        game.consensusLocked = true;
        game.reset();
        expect(game.teamScore).toBe(0);
        expect(game.proposals.size).toBe(0);
        expect(game.consensusLocked).toBe(false);
    });

    test('cleanup clears players and marks the game ended', () => {
        const game = makeGame();
        game.addPlayer('p1', 'A');
        game.cleanup();
        expect(game.players.size).toBe(0);
        expect(game.gameState).toBe('ended');
        expect(game.leaderboard).toEqual([]);
    });
});

describe('Game — saveResults (idempotent, mocked I/O)', () => {
    beforeEach(() => {
        atomicWriteFile.mockClear();
        jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    });
    afterEach(() => {
        fs.promises.mkdir.mockRestore();
    });

    test('writes results exactly once even when called repeatedly', async () => {
        const game = makeGame({ questions: [mcQuestion()] });
        game.addPlayer('p1', 'Alice');
        game.players.get('p1').score = 100;

        await game.saveResults();
        await game.saveResults();

        expect(atomicWriteFile).toHaveBeenCalledTimes(1);
        expect(game.resultsSaved).toBe(true);
    });

    test('serializes player scores and quiz metadata into the payload', async () => {
        const game = makeGame({ title: 'My Quiz', questions: [mcQuestion({ question: 'Q1?' })] });
        game.addPlayer('p1', 'Alice');
        game.players.get('p1').score = 250;

        await game.saveResults();

        const [, payload] = atomicWriteFile.mock.calls[0];
        const parsed = JSON.parse(payload);
        expect(parsed.quizTitle).toBe('My Quiz');
        expect(parsed.gamePin).toBe(game.pin);
        expect(parsed.results[0]).toMatchObject({ name: 'Alice', score: 250 });
        expect(parsed.questions[0]).toMatchObject({ questionNumber: 1, text: 'Q1?' });
    });
});
