/**
 * Game Class
 * Represents a single game instance with players, questions, and scoring.
 * Extracted from game-session-service.js for better separation of concerns.
 */

const { v4: uuidv4 } = require('uuid');
const { QuestionTypeService } = require('./question-type-service');
const { ScoringService } = require('./scoring-service');
const { getLimits } = require('../config/limits');

/**
 * Fisher-Yates shuffle - returns shuffled copy and index mapping
 * @param {Array} array - Array to shuffle
 * @returns {{shuffled: Array, mapping: number[]}} Shuffled array and original index mapping
 */
function shuffleWithMapping(array) {
    const indices = array.map((_, i) => i);
    const shuffled = [...array];

    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // mapping[shuffledIndex] = originalIndex
    return { shuffled, mapping: indices };
}

/**
 * Game class representing a single game session
 */
class Game {
    constructor(hostId, quiz, logger, config, limits = null) {
        this.id = uuidv4();
        this.pin = this.generatePin();
        this.hostId = hostId;
        this.quiz = quiz;
        this.players = new Map();
        this.currentQuestion = -1;
        this.gameState = 'lobby';
        this.questionStartTime = null;
        this.leaderboard = [];
        this.questionTimer = null;
        this.advanceTimer = null;
        this.leaderboardTimer = null;
        this.startTimer = null;
        this.earlyEndTimer = null;
        this.isAdvancing = false;
        this.endingQuestionEarly = false;
        this.startTime = null;
        this.endTime = null;
        this.createdAt = Date.now(); // Track game creation time for cleanup
        this.manualAdvancement = quiz.manualAdvancement || false;
        this.powerUpsEnabled = quiz.powerUpsEnabled || false;
        this.logger = logger;
        this.config = config;
        this.limits = limits || getLimits(); // Use injected limits or get from config

        // Scoring configuration (optional, per-game session)
        // Falls back to server defaults if not provided
        this.scoringConfig = quiz.scoringConfig || null;

        // Per-player answer option mapping for shuffled answers
        // Maps playerId -> array where mapping[shuffledIndex] = originalIndex
        this.answerMappings = new Map();

        // Consensus mode properties
        this.isConsensusMode = quiz.consensusMode || false;
        this.consensusConfig = {
            threshold: parseInt(quiz.consensusThreshold || '66', 10),
            discussionTime: quiz.discussionTime || 30,
            allowChat: quiz.allowChat || false
        };
        this.teamScore = 0;
        // Proposals for current question: Map<playerId, answerIndex>
        this.proposals = new Map();
        // Discussion messages for current question
        this.discussionMessages = [];
        // Tracks whether consensus was locked for current question
        this.consensusLocked = false;
    }

    /**
     * Generate PIN (temporary method, will be replaced by service method)
     */
    generatePin() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Add a player to the game
     * @param {string} playerId - Socket ID of the player
     * @param {string} playerName - Player's name
     * @returns {Object} Result with success status and player data or error
     */
    addPlayer(playerId, playerName) {
        // Enforce player limit
        if (this.players.size >= this.limits.MAX_PLAYERS_PER_GAME) {
            return {
                success: false,
                error: `Game is full (max ${this.limits.MAX_PLAYERS_PER_GAME} players)`
            };
        }

        const playerData = {
            id: playerId,
            name: playerName,
            score: 0,
            answers: [],
            ...(this.powerUpsEnabled && { powerUps: this.createInitialPowerUpState() })
        };

        this.players.set(playerId, playerData);
        return { success: true, player: playerData };
    }

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
     * Remove a player from the game
     * @param {string} playerId - Socket ID of the player
     */
    removePlayer(playerId) {
        this.players.delete(playerId);
    }

    /**
     * Use a power-up for a player
     * @param {string} playerId - Socket ID of the player
     * @param {string} powerUpType - Type of power-up ('fifty-fifty', 'extend-time', 'double-points')
     * @returns {Object} Result with success and any additional data
     */
    usePowerUp(playerId, powerUpType) {
        if (!this.powerUpsEnabled) {
            return { success: false, error: 'Power-ups not enabled for this game' };
        }

        const player = this.players.get(playerId);
        if (!player?.powerUps) {
            return { success: false, error: 'Player not found or power-ups not initialized' };
        }

        const powerUp = player.powerUps[powerUpType];
        if (!powerUp || powerUp.used) {
            return { success: false, error: powerUp ? 'Power-up already used' : 'Unknown power-up type' };
        }

        powerUp.used = true;
        powerUp.available = false;

        const result = { success: true, type: powerUpType };

        if (powerUpType === 'fifty-fifty') {
            const question = this.quiz.questions[this.currentQuestion];
            if (question?.type === 'multiple-choice') {
                result.hiddenOptions = this.calculateHiddenOptions(question);
            }
        } else if (powerUpType === 'extend-time') {
            result.extraSeconds = 10;
        } else if (powerUpType === 'double-points') {
            powerUp.active = true;
        }

        this.logger.debug(`Player ${playerId} used power-up: ${powerUpType}`);
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
     * Check if a player has double points active and consume it
     * @param {string} playerId - Socket ID of the player
     * @returns {number} Multiplier (1 or 2)
     */
    getAndConsumeDoublePoints(playerId) {
        const doublePoints = this.players.get(playerId)?.powerUps?.['double-points'];
        if (doublePoints?.active) {
            doublePoints.active = false;
            return 2;
        }
        return 1;
    }

    /**
     * Advance to the next question
     * @returns {boolean} True if there are more questions, false otherwise
     */
    nextQuestion() {
        const nextQuestionIndex = this.currentQuestion + 1;
        const hasMore = nextQuestionIndex < this.quiz.questions.length;

        this.logger.debug('nextQuestion() DEBUG:', {
            currentQuestion: this.currentQuestion,
            nextQuestionIndex: nextQuestionIndex,
            totalQuestions: this.quiz.questions.length,
            hasMore: hasMore,
            gamePin: this.pin
        });

        if (hasMore) {
            this.currentQuestion = nextQuestionIndex;
            this.gameState = 'question';
            this.questionTimer = null;
            this.advanceTimer = null;
            this.leaderboardTimer = null;
            this.logger.debug(`Advanced to question ${this.currentQuestion + 1}`);
        } else {
            this.logger.debug('NO MORE QUESTIONS - should end game');
        }

        return hasMore;
    }

    /**
     * End the current question
     */
    endQuestion() {
        this.gameState = 'revealing';
        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }
        if (this.advanceTimer) {
            clearTimeout(this.advanceTimer);
            this.advanceTimer = null;
        }
    }

    /**
     * Submit an answer for a player
     * @param {string} playerId - Socket ID of the player
     * @param {*} answer - Player's answer
     * @param {string} answerType - Type of answer
     * @returns {Object} Result with isCorrect and points
     */
    submitAnswer(playerId, answer, answerType) {
        const player = this.players.get(playerId);
        if (!player) return false;

        const question = this.quiz.questions[this.currentQuestion];
        const questionType = question.type || 'multiple-choice';

        // Translate shuffled answer indices back to original indices
        const translatedAnswer = this.translateShuffledAnswer(playerId, answer, questionType);

        // Get double points multiplier
        const doublePointsMultiplier = this.getAndConsumeDoublePoints(playerId);

        // Use ScoringService for centralized scoring logic
        const scoringResult = ScoringService.calculateScore({
            answer: translatedAnswer,
            question,
            questionType,
            questionStartTime: this.questionStartTime,
            config: this.config,
            scoringConfig: this.scoringConfig,
            doublePointsMultiplier
        });

        const answerData = {
            answer,
            isCorrect: scoringResult.isCorrect,
            points: scoringResult.points,
            timeMs: Date.now() - this.questionStartTime,
            doublePointsUsed: doublePointsMultiplier > 1,
            breakdown: scoringResult.breakdown
        };

        // Add partialScore for ordering questions (enables "partially correct" feedback)
        if (scoringResult.partialScore !== null) {
            answerData.partialScore = scoringResult.partialScore;
        }

        player.answers[this.currentQuestion] = answerData;
        player.score += scoringResult.points;

        return {
            isCorrect: scoringResult.isCorrect,
            points: scoringResult.points,
            doublePointsUsed: doublePointsMultiplier > 1,
            breakdown: scoringResult.breakdown
        };
    }

    // ==================== CONSENSUS MODE METHODS ====================

    /**
     * Submit or update a proposal for the current question
     * @param {string} playerId - Player's socket ID
     * @param {number} answer - Proposed answer index
     * @returns {Object} Updated proposal distribution
     */
    submitProposal(playerId, answer) {
        if (!this.isConsensusMode || this.consensusLocked) {
            return null;
        }

        this.proposals.set(playerId, answer);
        return this.getProposalDistribution();
    }

    /**
     * Get the current proposal distribution
     * @returns {Object} Distribution with counts, players, percentage, and leading answer
     */
    getProposalDistribution() {
        const distribution = {};
        const playersByAnswer = {};
        let totalProposals = 0;

        // Count proposals and track players per answer
        for (const [playerId, answer] of this.proposals) {
            if (!distribution[answer]) {
                distribution[answer] = 0;
                playersByAnswer[answer] = [];
            }
            distribution[answer]++;
            totalProposals++;

            const player = this.players.get(playerId);
            if (player) {
                playersByAnswer[answer].push(player.name);
            }
        }

        // Find leading answer
        let leadingAnswer = null;
        let maxCount = 0;
        for (const [answer, count] of Object.entries(distribution)) {
            if (count > maxCount) {
                maxCount = count;
                leadingAnswer = parseInt(answer, 10);
            }
        }

        // Calculate consensus percentage for leading answer
        const totalPlayers = this.players.size;
        const consensusPercent = totalPlayers > 0
            ? Math.round((maxCount / totalPlayers) * 100)
            : 0;

        return {
            proposals: Object.fromEntries(
                Object.entries(distribution).map(([answer, count]) => [
                    answer,
                    { count, players: playersByAnswer[answer] || [] }
                ])
            ),
            consensusPercent,
            leadingAnswer,
            totalProposals,
            totalPlayers
        };
    }

    /**
     * Check if consensus threshold has been reached
     * @returns {Object|null} Consensus result or null if not reached
     */
    checkConsensus() {
        if (!this.isConsensusMode) return null;

        const distribution = this.getProposalDistribution();
        const threshold = this.consensusConfig.threshold;

        if (distribution.consensusPercent >= threshold) {
            return {
                reached: true,
                answer: distribution.leadingAnswer,
                percentage: distribution.consensusPercent
            };
        }

        return { reached: false };
    }

    /**
     * Lock in the current consensus and calculate team points
     * @returns {Object} Consensus result with team points
     */
    lockConsensus() {
        if (!this.isConsensusMode || this.consensusLocked) {
            return null;
        }

        this.consensusLocked = true;
        const consensus = this.checkConsensus();
        const question = this.quiz.questions[this.currentQuestion];

        if (!consensus || !consensus.reached) {
            // No consensus reached - no points
            return {
                answer: null,
                percentage: 0,
                isCorrect: false,
                teamPoints: 0
            };
        }

        // Check if consensus answer is correct
        const correctAnswer = this.getCorrectAnswerKey(question);
        const isCorrect = consensus.answer === correctAnswer;

        // Calculate team points with consensus bonus
        let teamPoints = 0;
        if (isCorrect) {
            const difficultyMultiplier = this.config.SCORING.DIFFICULTY_MULTIPLIERS[question.difficulty] || 2;
            const basePoints = this.config.SCORING.BASE_POINTS * difficultyMultiplier;

            // Consensus bonus multiplier
            let consensusBonus = 1.0;
            if (consensus.percentage === 100) {
                consensusBonus = 1.5; // Unanimous
            } else if (consensus.percentage >= 75) {
                consensusBonus = 1.2; // Strong consensus
            }

            teamPoints = Math.floor(basePoints * consensusBonus);
        }

        this.teamScore += teamPoints;

        return {
            answer: consensus.answer,
            percentage: consensus.percentage,
            isCorrect,
            teamPoints,
            totalTeamScore: this.teamScore
        };
    }

    /**
     * Reset consensus state for new question
     */
    resetConsensusForQuestion() {
        this.proposals.clear();
        this.discussionMessages = [];
        this.consensusLocked = false;
    }

    /**
     * Add a discussion message (quick response or chat)
     * @param {string} playerId - Player's socket ID
     * @param {string} type - Message type ('quick' or 'chat')
     * @param {string} content - Message content or quick response type
     * @param {string} targetPlayer - Optional target player for "agree" responses
     * @returns {Object} The created message
     */
    addDiscussionMessage(playerId, type, content, targetPlayer = null) {
        const player = this.players.get(playerId);
        if (!player) return null;

        const message = {
            id: Date.now().toString(),
            playerId,
            playerName: player.name,
            type,
            content,
            targetPlayer,
            timestamp: Date.now()
        };

        this.discussionMessages.push(message);

        // Keep only last 50 messages to prevent memory issues
        if (this.discussionMessages.length > 50) {
            this.discussionMessages.shift();
        }

        return message;
    }

    // ==================== END CONSENSUS MODE METHODS ====================

    /**
     * Get the correct answer key for a question based on its type
     * @param {Object} question - Question data
     * @returns {*} Correct answer key
     */
    getCorrectAnswerKey(question) {
        const type = question.type || 'multiple-choice';

        switch (type) {
            case 'multiple-choice':
                return question.correctIndex !== undefined ? question.correctIndex : question.correctAnswer;
            case 'multiple-correct':
                return question.correctIndices || question.correctAnswers || [];
            case 'true-false':
            case 'numeric':
                return question.correctAnswer;
            case 'ordering':
                return question.correctOrder || [];
            default:
                this.logger.warn(`Unknown question type '${type}', using default correctAnswer field`);
                return question.correctAnswer;
        }
    }

    /**
     * Translate shuffled answer indices back to original indices
     * @param {string} playerId - Player's socket ID
     * @param {*} answer - The player's answer (may be shuffled index)
     * @param {string} questionType - Type of question
     * @returns {*} Translated answer with original indices
     */
    translateShuffledAnswer(playerId, answer, questionType) {
        const mapping = this.answerMappings?.get(playerId);
        if (!mapping) return answer;

        if (questionType === 'multiple-choice' && typeof answer === 'number') {
            return mapping[answer];
        }
        if (questionType === 'multiple-correct' && Array.isArray(answer)) {
            return answer.map(idx => mapping[idx]);
        }
        return answer;
    }

    /**
     * Update the leaderboard
     * Sorts by score (descending), then by total time (ascending) as tiebreaker
     */
    updateLeaderboard() {
        this.leaderboard = Array.from(this.players.values())
            .sort((a, b) => {
                // Primary sort: higher score wins
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                // Tiebreaker: faster total response time wins
                const aTotalTime = Object.values(a.answers).reduce((sum, ans) => sum + (ans.timeMs || 0), 0);
                const bTotalTime = Object.values(b.answers).reduce((sum, ans) => sum + (ans.timeMs || 0), 0);
                return aTotalTime - bTotalTime;
            })
            .slice(0, 10);
    }

    /**
     * Get answer statistics for the current question
     * @returns {Object} Statistics object
     */
    getAnswerStatistics() {
        const question = this.quiz.questions[this.currentQuestion];

        if (!question) {
            return {
                totalPlayers: this.players.size,
                answeredPlayers: 0,
                answerCounts: {},
                questionType: 'multiple-choice'
            };
        }

        const stats = {
            totalPlayers: this.players.size,
            answeredPlayers: 0,
            answerCounts: {},
            questionType: question.type || 'multiple-choice'
        };

        if (question.type === 'multiple-choice' || question.type === 'multiple-correct') {
            question.options.forEach((_, index) => {
                stats.answerCounts[index] = 0;
            });
        } else if (question.type === 'true-false') {
            stats.answerCounts['true'] = 0;
            stats.answerCounts['false'] = 0;
        } else if (question.type === 'numeric') {
            stats.answerCounts = {};
        } else if (question.type === 'ordering') {
            stats.answerCounts = {};
        }

        Array.from(this.players.values()).forEach(player => {
            const playerAnswer = player.answers[this.currentQuestion];
            if (playerAnswer) {
                stats.answeredPlayers++;
                const answer = playerAnswer.answer;

                if (question.type === 'multiple-choice') {
                    if (stats.answerCounts[answer] !== undefined) {
                        stats.answerCounts[answer]++;
                    }
                } else if (question.type === 'multiple-correct') {
                    if (Array.isArray(answer)) {
                        answer.forEach(a => {
                            if (stats.answerCounts[a] !== undefined) {
                                stats.answerCounts[a]++;
                            }
                        });
                    }
                } else if (question.type === 'true-false') {
                    const normalizedAnswer = answer.toString().toLowerCase();
                    if (stats.answerCounts[normalizedAnswer] !== undefined) {
                        stats.answerCounts[normalizedAnswer]++;
                    }
                } else if (question.type === 'numeric') {
                    stats.answerCounts[answer.toString()] = (stats.answerCounts[answer.toString()] || 0) + 1;
                } else if (question.type === 'ordering') {
                    const orderKey = JSON.stringify(answer);
                    stats.answerCounts[orderKey] = (stats.answerCounts[orderKey] || 0) + 1;
                }
            }
        });

        // Add option count for dynamic display
        stats.optionCount = question.options?.length || 4;

        // Add scoring info for host breakdown display
        stats.scoringInfo = this.getScoringInfoForQuestion(question);

        return stats;
    }

    /**
     * Get scoring info for a question (for host breakdown display)
     * @param {Object} question - Question object
     * @returns {Object} Scoring info object
     */
    getScoringInfoForQuestion(question) {
        const customMultipliers = this.scoringConfig?.difficultyMultipliers;
        const defaultMultipliers = this.config.SCORING.DIFFICULTY_MULTIPLIERS;
        const difficultyMultiplier = customMultipliers?.[question.difficulty]
            ?? defaultMultipliers[question.difficulty]
            ?? 2;

        const timeBonusEnabled = this.scoringConfig?.timeBonusEnabled ?? true;
        const timeBonusThreshold = this.scoringConfig?.timeBonusThreshold ?? 0;
        const basePoints = this.config.SCORING.BASE_POINTS * difficultyMultiplier;

        return {
            basePoints: basePoints,
            difficultyMultiplier: difficultyMultiplier,
            difficulty: question.difficulty || 'medium',
            timeBonusEnabled: timeBonusEnabled,
            timeBonusThreshold: timeBonusThreshold
        };
    }

    /**
     * Save game results to file
     * Note: Client-side also saves via REST API for redundancy
     */
    async saveResults() {
        try {
            const fs = require('fs').promises;
            const path = require('path');

            // Ensure results directory exists
            const resultsDir = 'results';
            try {
                await fs.access(resultsDir);
            } catch {
                await fs.mkdir(resultsDir, { recursive: true });
            }

            const results = {
                quizTitle: this.quiz.title || 'Untitled Quiz',
                gamePin: this.pin,
                results: Array.from(this.players.values()).map(player => ({
                    name: player.name,
                    score: player.score,
                    answers: player.answers
                })),
                startTime: this.startTime,
                endTime: this.endTime,
                saved: new Date().toISOString(),
                questions: this.quiz.questions.map((q, index) => ({
                    questionNumber: index + 1,
                    text: q.question || q.text,
                    type: q.type || 'multiple-choice',
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    correctAnswers: q.correctAnswers,
                    correctOrder: q.correctOrder,
                    difficulty: q.difficulty || 'medium',
                    timeLimit: q.timeLimit || q.time,
                    concepts: q.concepts || []
                }))
            };

            const filename = `results_${this.pin}_${Date.now()}.json`;
            await fs.writeFile(path.join(resultsDir, filename), JSON.stringify(results, null, 2));
            this.logger.info(`Results saved: ${filename}`);
        } catch (error) {
            this.logger.error('Error saving game results:', error);
        }
    }

    /**
     * Calculate personal concept mastery for a specific player
     * @param {string} playerId - Socket ID of the player
     * @returns {Object} Concept mastery data for this player
     */
    calculatePlayerConceptMastery(playerId) {
        const player = this.players.get(playerId);
        if (!player || !player.answers) {
            return { concepts: [], hasConcepts: false };
        }

        const conceptStats = {};

        // Analyze each question's concepts and player's performance
        this.quiz.questions.forEach((question, qIndex) => {
            const concepts = question.concepts || [];
            if (concepts.length === 0) return;

            const answer = player.answers[qIndex];
            const isCorrect = answer?.isCorrect || false;

            concepts.forEach(concept => {
                if (!conceptStats[concept]) {
                    conceptStats[concept] = {
                        name: concept,
                        total: 0,
                        correct: 0
                    };
                }
                conceptStats[concept].total++;
                if (isCorrect) conceptStats[concept].correct++;
            });
        });

        // Calculate mastery percentages and sort
        const conceptList = Object.values(conceptStats)
            .map(c => ({
                name: c.name,
                mastery: c.total > 0 ? Math.round((c.correct / c.total) * 100) : 0,
                correct: c.correct,
                total: c.total
            }))
            .sort((a, b) => a.mastery - b.mastery); // Weakest first

        return {
            concepts: conceptList,
            hasConcepts: conceptList.length > 0
        };
    }

    /**
     * Clear all active timers to prevent memory leaks
     * Called during game cleanup and when game is deleted
     */
    clearTimers() {
        if (this.questionTimer) {
            clearTimeout(this.questionTimer);
            this.questionTimer = null;
        }
        if (this.advanceTimer) {
            clearTimeout(this.advanceTimer);
            this.advanceTimer = null;
        }
        if (this.earlyEndTimer) {
            clearTimeout(this.earlyEndTimer);
            this.earlyEndTimer = null;
        }
        if (this.startTimer) {
            clearTimeout(this.startTimer);
            this.startTimer = null;
        }
        if (this.leaderboardTimer) {
            clearTimeout(this.leaderboardTimer);
            this.leaderboardTimer = null;
        }
    }

    /**
     * Reset game for rematch - keeps PIN, quiz, and players but resets scores
     * Players remain in the game room, new players can join
     */
    reset() {
        this.logger.debug(`Resetting game ${this.pin} for rematch`);

        // Clear all timers
        this.clearTimers();

        // Reset game progress
        this.currentQuestion = -1;
        this.gameState = 'lobby';
        this.questionStartTime = null;
        this.leaderboard = [];
        this.isAdvancing = false;
        this.endingQuestionEarly = false;
        this.startTime = null;
        this.endTime = null;
        this.answerMappings.clear();

        // Reset each player's score and answers but keep them in the game
        this.players.forEach((player) => {
            player.score = 0;
            player.answers = [];
            // Reset power-ups if enabled
            if (this.powerUpsEnabled && player.powerUps) {
                player.powerUps = this.createInitialPowerUpState();
            }
        });

        // Reset consensus mode state
        if (this.isConsensusMode) {
            this.teamScore = 0;
            this.proposals.clear();
            this.discussionMessages = [];
            this.consensusLocked = false;
        }

        this.logger.info(`Game ${this.pin} reset for rematch with ${this.players.size} players`);
    }

    /**
     * Clean up game resources and remove stale player references
     */
    cleanup() {
        this.logger.debug(`Cleaning up game ${this.pin} with ${this.players.size} players`);

        // Clear all timers to prevent memory leaks
        this.clearTimers();

        // Clear internal player references
        this.players.clear();

        // Clear other game state
        this.leaderboard = [];
        this.gameState = 'ended';

        this.logger.debug(`Game ${this.pin} cleanup completed`);
    }
}

module.exports = { Game, shuffleWithMapping };
