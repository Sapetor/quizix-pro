/**
 * LocalGameSession
 * Client-side game session manager for single-player practice mode
 * Mirrors the Game class from services/game-session-service.js but runs locally
 */

import { logger, SCORING, TIMING } from '../core/config.js';
import QuestionTypeRegistry from '../utils/question-type-registry.js';
import { getJSON, setJSON } from '../utils/storage-utils.js';
import {
    calculatePoints as computePoints,
    DEFAULT_DIFFICULTY_MULTIPLIERS,
    DEFAULT_TIME_BONUS_ENABLED,
    DEFAULT_TIME_BONUS_THRESHOLD
} from '../utils/scoring-config.js';

/**
 * @typedef {Object} PracticeHistoryEntry
 * @property {number} bestScore - Personal best score
 * @property {number} bestTime - Best completion time in ms
 * @property {number} attempts - Number of attempts
 * @property {string} lastPlayed - ISO timestamp of last play
 */

/**
 * @typedef {'lobby'|'playing'|'question'|'revealing'|'finished'} GamePhase
 */

export class LocalGameSession {
    /**
     * Create a LocalGameSession
     * @param {Object} quiz - Quiz data with title and questions
     * @param {import('../events/local-event-bus.js').LocalEventBus} eventBus - Event bus for communication
     * @param {Object} options - Configuration options
     */
    constructor(quiz, eventBus, options = {}) {
        this.quiz = quiz;
        this.eventBus = eventBus;
        this.options = {
            playerName: 'Player',
            ...options
        };

        // Game state
        this.currentQuestionIndex = -1;
        this.playerScore = 0;
        this.playerAnswers = [];
        this.questionStartTime = null;
        this.gameStartTime = null;
        this.gameEndTime = null;
        this.questionTimer = null;

        /** @type {GamePhase} */
        this.phase = 'lobby';

        // Scoring configuration (optional, per-game session)
        // Falls back to server-matching defaults if not provided
        const scoringConfig = options.scoringConfig || null;
        this.scoringConfig = scoringConfig;

        // Difficulty multipliers, time bonus toggle, and threshold. Defaults
        // mirror the server (see utils/scoring-config.js).
        this.difficultyMultipliers = scoringConfig?.difficultyMultipliers || { ...DEFAULT_DIFFICULTY_MULTIPLIERS };
        this.timeBonusEnabled = scoringConfig?.timeBonusEnabled ?? DEFAULT_TIME_BONUS_ENABLED;
        this.timeBonusThreshold = scoringConfig?.timeBonusThreshold ?? DEFAULT_TIME_BONUS_THRESHOLD;

        // Power-ups state
        this.powerUpsEnabled = options.powerUpsEnabled || false;
        this.powerUps = this.createInitialPowerUpState();

        // Load practice history from localStorage
        this.history = this.loadHistory();
    }

    /**
     * Get the current question
     * @returns {Object|null}
     */
    getCurrentQuestion() {
        if (this.currentQuestionIndex < 0 || this.currentQuestionIndex >= this.quiz.questions.length) {
            return null;
        }
        return this.quiz.questions[this.currentQuestionIndex];
    }

    /**
     * Start the game
     */
    startGame() {
        logger.debug('[LocalGameSession] Starting game');

        this.phase = 'playing';
        this.gameStartTime = performance.now();
        this.currentQuestionIndex = -1;
        this.playerScore = 0;
        this.playerAnswers = [];

        // Emit game started event
        this.eventBus.emit('game-started', {
            title: this.quiz.title,
            totalQuestions: this.quiz.questions.length,
            isPracticeMode: true
        });

        // Start first question
        this.nextQuestion();
    }

    /**
     * Advance to the next question
     */
    nextQuestion() {
        this.currentQuestionIndex++;

        if (this.currentQuestionIndex >= this.quiz.questions.length) {
            // Game over
            this.endGame();
            return;
        }

        const question = this.getCurrentQuestion();
        this.phase = 'question';
        this.questionStartTime = performance.now();

        // Clear any existing timer
        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }

        // Emit question start event (matching server format - questionNumber is 1-indexed)
        // Support both 'time' and 'timeLimit' field names for compatibility
        const questionTime = question.timeLimit || question.time || TIMING.DEFAULT_QUESTION_TIME;
        this.eventBus.emit('question-start', {
            questionNumber: this.currentQuestionIndex + 1,  // 1-indexed to match server
            totalQuestions: this.quiz.questions.length,
            question: question.question,        // Text string
            options: question.options || [],     // Options array
            type: question.type || 'multiple-choice',
            image: question.image || '',
            timeLimit: questionTime
        });

        // Set up question timer (track end time so power-ups can re-arm it)
        const timeLimit = questionTime * 1000;
        this.questionEndsAt = Date.now() + timeLimit;
        this.questionTimer = setTimeout(() => {
            this.handleQuestionTimeout();
        }, timeLimit);
    }

    /**
     * Sanitize question data for player (hide correct answer)
     * @param {Object} question - Full question data
     * @returns {Object} Sanitized question
     */
    sanitizeQuestionForPlayer(question) {
        const sanitized = {
            question: question.question,
            type: question.type,
            timeLimit: question.timeLimit || question.time, // Support both property names
            difficulty: question.difficulty,
            image: question.image
        };

        // Include options for choice-based questions
        if (question.options) {
            sanitized.options = [...question.options];
        }

        return sanitized;
    }

    /**
     * Handle question timeout
     */
    handleQuestionTimeout() {
        if (this.phase !== 'question') return;

        logger.debug('[LocalGameSession] Question timeout');

        // Record timeout as no answer
        this.playerAnswers.push({
            questionIndex: this.currentQuestionIndex,
            answer: null,
            isCorrect: false,
            points: 0,
            responseTime: null,
            timedOut: true
        });

        this.revealAnswer(null, false, 0);
    }

    /**
     * Submit player answer
     * @param {*} answer - Player's answer
     */
    submitAnswer(answer) {
        if (this.phase !== 'question') {
            logger.debug('[LocalGameSession] Cannot submit - not in question phase');
            return;
        }

        // Clear the timer
        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }

        const responseTime = performance.now() - this.questionStartTime;
        const question = this.getCurrentQuestion();

        // Poll: no correct answer, no points, no verdict (mirrors ScoringService)
        if (question.isPoll === true) {
            this.playerAnswers.push({
                questionIndex: this.currentQuestionIndex,
                answer,
                isCorrect: null,
                isPoll: true,
                points: 0,
                responseTime
            });
            this.revealAnswer(answer, null, 0);
            return;
        }

        // Score the answer
        const correctAnswer = this.getCorrectAnswer(question);
        const isCorrect = this.scoreAnswer(question.type, answer, correctAnswer, question);

        // Calculate points (returns object with points and breakdown)
        const result = this.calculatePoints(isCorrect, question, responseTime);
        const points = result.points;

        // Update score
        this.playerScore += points;

        // Record answer with breakdown
        this.playerAnswers.push({
            questionIndex: this.currentQuestionIndex,
            answer,
            isCorrect,
            points: points,
            responseTime,
            breakdown: result.breakdown
        });

        // Reveal the answer with breakdown
        this.revealAnswer(answer, isCorrect, points, result.breakdown);
    }

    /**
     * Reveal the correct answer and show results
     * @param {*} playerAnswer - Player's submitted answer
     * @param {boolean|number} isCorrect - Whether answer was correct (or partial credit)
     * @param {number} points - Points earned
     * @param {Object} breakdown - Score breakdown object
     */
    revealAnswer(playerAnswer, isCorrect, points, breakdown = null) {
        this.phase = 'revealing';

        const question = this.getCurrentQuestion();
        const isPoll = question?.isPoll === true;
        const correctAnswer = isPoll ? null : this.getCorrectAnswer(question);

        // Emit player result event
        this.eventBus.emit('player-result', {
            isPoll,
            correct: typeof isCorrect === 'number' ? isCorrect === 1 : isCorrect,
            partialScore: typeof isCorrect === 'number' ? isCorrect : null,
            points,
            totalScore: this.playerScore,
            correctAnswer,
            playerAnswer,
            questionIndex: this.currentQuestionIndex,
            breakdown: breakdown
        });

        // Emit question end event
        this.eventBus.emit('question-end', {
            questionIndex: this.currentQuestionIndex,
            correctAnswer,
            playerAnswer,
            isCorrect,
            points,
            totalScore: this.playerScore,
            breakdown: breakdown,
            // Single-player leaderboard (just the player)
            leaderboard: [{
                name: this.options.playerName,
                score: this.playerScore
            }]
        });
    }

    /**
     * Get the correct answer for a question
     * @param {Object} question - Question data
     * @returns {*} Correct answer
     */
    getCorrectAnswer(question) {
        switch (question.type) {
            case 'multiple-choice':
                // Quiz files use correctAnswer (index), fallback to correctIndex for compatibility
                return question.correctAnswer !== undefined ? question.correctAnswer : question.correctIndex;
            case 'multiple-correct':
                // Quiz files use correctAnswers (array), fallback to correctIndices for compatibility
                return question.correctAnswers !== undefined ? question.correctAnswers : question.correctIndices;
            case 'true-false':
                // Quiz files may store as string "true"/"false" or boolean
                // Normalize to boolean for comparison with player answer
                if (typeof question.correctAnswer === 'string') {
                    return question.correctAnswer.toLowerCase() === 'true';
                }
                return question.correctAnswer;
            case 'numeric':
                return question.numericAnswer !== undefined ? question.numericAnswer : question.correctAnswer;
            case 'ordering':
                return question.correctOrder;
            default:
                return question.correctAnswer !== undefined ? question.correctAnswer : question.correctIndex;
        }
    }

    /**
     * Score an answer using QuestionTypeRegistry
     * @param {string} type - Question type
     * @param {*} playerAnswer - Player's answer
     * @param {*} correctAnswer - Correct answer
     * @param {Object} question - Full question for additional options
     * @returns {boolean|number} True/false or partial credit (0-1)
     */
    scoreAnswer(type, playerAnswer, correctAnswer, question) {
        const options = {};

        // For numeric questions, pass tolerance
        if (type === 'numeric') {
            options.tolerance = question.tolerance || SCORING.DEFAULT_NUMERIC_TOLERANCE || 0.1;
        }

        return QuestionTypeRegistry.scoreAnswer(type, playerAnswer, correctAnswer, options);
    }

    /**
     * Calculate points for an answer. Delegates to the shared client scoring
     * module (utils/scoring-config.js), which mirrors the server formula.
     * @param {boolean|number} isCorrect - Whether correct (or partial credit)
     * @param {Object} question - Question data
     * @param {number} responseTime - Response time in ms
     * @returns {Object} Points object with total and breakdown
     */
    calculatePoints(isCorrect, question, responseTime) {
        // Consume the double-points power-up (even on wrong answers, matching prior behavior)
        const doublePointsMultiplier = this.getAndConsumeDoublePoints();
        const questionTimeSec = question.timeLimit || question.time || TIMING.DEFAULT_QUESTION_TIME;

        return computePoints({
            isCorrect,
            difficulty: question.difficulty,
            responseTime,
            questionTimeLimitMs: questionTimeSec * 1000,
            config: {
                timeBonusEnabled: this.timeBonusEnabled,
                timeBonusThreshold: this.timeBonusThreshold,
                difficultyMultipliers: this.difficultyMultipliers
            },
            doublePointsMultiplier
        });
    }

    // ==================== POWER-UP METHODS ====================

    /**
     * Create initial power-up state object
     * @returns {Object} Fresh power-up state
     */
    createInitialPowerUpState() {
        return {
            'fifty-fifty': { available: true, used: false },
            'extend-time': { available: true, used: false },
            'double-points': { available: true, used: false, active: false }
        };
    }

    /**
     * Use a power-up
     * @param {string} type - Power-up type
     * @returns {Object} Result with success and any additional data
     */
    usePowerUp(type) {
        if (!this.powerUpsEnabled) {
            return { success: false, error: 'Power-ups not enabled' };
        }

        const powerUp = this.powerUps[type];
        if (!powerUp || powerUp.used) {
            return { success: false, error: powerUp ? 'Power-up already used' : 'Unknown power-up type' };
        }

        powerUp.used = true;
        powerUp.available = false;

        const result = { success: true, type };

        if (type === 'fifty-fifty') {
            const question = this.getCurrentQuestion();
            if (question?.type === 'multiple-choice') {
                result.hiddenOptions = this.calculateHiddenOptions(question);
            }
        } else if (type === 'extend-time') {
            const extraMs = 10000;
            result.extraSeconds = 10;
            // Re-arm the authoritative question timeout with the added time
            if (this.questionTimer) {
                clearTimeout(this.questionTimer);
            }
            this.questionEndsAt = (this.questionEndsAt || Date.now()) + extraMs;
            const remainingMs = Math.max(0, this.questionEndsAt - Date.now());
            this.questionTimer = setTimeout(() => {
                this.handleQuestionTimeout();
            }, remainingMs);
        } else if (type === 'double-points') {
            powerUp.active = true;
        }

        this.eventBus.emit('power-up-result', result);
        logger.debug(`[LocalGameSession] Power-up used: ${type}`);
        return result;
    }

    /**
     * Calculate which options to hide for 50-50 power-up
     * @param {Object} question - Current question
     * @returns {number[]} Indices to hide
     */
    calculateHiddenOptions(question) {
        const correctAnswer = question.correctAnswer;
        const optionsCount = question.options?.length || 4;
        const wrongIndices = [];

        for (let i = 0; i < optionsCount; i++) {
            if (i !== correctAnswer) wrongIndices.push(i);
        }

        const numToHide = Math.ceil(wrongIndices.length / 2);
        const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, numToHide);
    }

    /**
     * Get and consume double points multiplier
     * @returns {number} Multiplier (1 or 2)
     */
    getAndConsumeDoublePoints() {
        const doublePoints = this.powerUps['double-points'];
        if (doublePoints?.active) {
            doublePoints.active = false;
            return 2;
        }
        return 1;
    }

    /**
     * Consume double points without returning multiplier
     */
    consumeDoublePoints() {
        if (this.powerUps['double-points']) {
            this.powerUps['double-points'].active = false;
        }
    }

    /**
     * Reset power-ups for new game
     */
    resetPowerUps() {
        this.powerUps = this.createInitialPowerUpState();
    }

    // ==================== END POWER-UP METHODS ====================

    /**
     * End the game
     */
    endGame() {
        this.phase = 'finished';
        this.gameEndTime = performance.now();

        const totalTime = this.gameEndTime - this.gameStartTime;
        const correctCount = this.playerAnswers.filter(a => a.isCorrect === true || (typeof a.isCorrect === 'number' && a.isCorrect >= 0.5)).length;

        // Check for personal best
        const isNewBest = this.updatePersonalBest(this.playerScore, totalTime);

        // Get current best for comparison
        const quizKey = this.getQuizKey();
        const currentBest = this.history[quizKey];

        // Emit game end event
        this.eventBus.emit('game-end', {
            finalScore: this.playerScore,
            totalQuestions: this.quiz.questions.length,
            correctAnswers: correctCount,
            totalTime,
            playerAnswers: this.playerAnswers,
            personalBest: currentBest?.bestScore || this.playerScore,
            isNewPersonalBest: isNewBest,
            leaderboard: [{
                name: this.options.playerName,
                score: this.playerScore,
                correctAnswers: correctCount
            }]
        });

        logger.debug('[LocalGameSession] Game ended', {
            score: this.playerScore,
            correct: correctCount,
            total: this.quiz.questions.length,
            isNewBest
        });
    }

    /**
     * Get unique key for this quiz (for history storage)
     * @returns {string}
     */
    getQuizKey() {
        // Use filename if available, otherwise hash of title
        return this.options.quizFilename || this.quiz.title.toLowerCase().replace(/\s+/g, '_');
    }

    /**
     * Load practice history from localStorage
     * @returns {Object<string, PracticeHistoryEntry>}
     */
    loadHistory() {
        return getJSON('practiceHistory') || {};
    }

    /**
     * Save practice history to localStorage
     */
    saveHistory() {
        setJSON('practiceHistory', this.history);
    }

    /**
     * Update personal best if score is higher
     * @param {number} score - Current game score
     * @param {number} time - Completion time in ms
     * @returns {boolean} True if this is a new personal best
     */
    updatePersonalBest(score, time) {
        const quizKey = this.getQuizKey();
        const existing = this.history[quizKey];

        const isNewBest = !existing || score > existing.bestScore;

        this.history[quizKey] = {
            bestScore: isNewBest ? score : existing.bestScore,
            bestTime: isNewBest ? time : (time < existing.bestTime ? time : existing.bestTime),
            attempts: (existing?.attempts || 0) + 1,
            lastPlayed: new Date().toISOString()
        };

        this.saveHistory();

        return isNewBest;
    }

    /**
     * Get stats for this quiz from history
     * @returns {PracticeHistoryEntry|null}
     */
    getQuizStats() {
        const quizKey = this.getQuizKey();
        return this.history[quizKey] || null;
    }

    /**
     * Cleanup timers and state
     */
    cleanup() {
        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }
        this.phase = 'finished';
    }
}

export default LocalGameSession;
