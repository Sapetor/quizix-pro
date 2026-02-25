/**
 * Scoring Service
 * Centralized scoring logic for game answers.
 * Extracted from Game class for reusability and testing.
 */

const { QuestionTypeService } = require('./question-type-service');

class ScoringService {
    /**
     * Calculate score for an answer
     * @param {Object} params - Scoring parameters
     * @param {*} params.answer - Player's translated answer
     * @param {Object} params.question - Question object
     * @param {string} params.questionType - Type of question
     * @param {number} params.questionStartTime - When the question started (timestamp)
     * @param {Object} params.config - Server config with SCORING settings
     * @param {Object} params.scoringConfig - Optional per-game scoring config
     * @param {number} params.doublePointsMultiplier - Power-up multiplier (1 or 2)
     * @returns {Object} { points, isCorrect, breakdown, partialScore }
     */
    static calculateScore({
        answer,
        question,
        questionType,
        questionStartTime,
        config,
        scoringConfig = null,
        doublePointsMultiplier = 1
    }) {
        // Get correct answer key based on question type
        const correctAnswerKey = ScoringService.getCorrectAnswerKey(question, questionType);

        // Calculate tolerance for numeric questions
        const defaultTolerance = config.SCORING?.DEFAULT_NUMERIC_TOLERANCE || 0.1;
        const options = questionType === 'numeric'
            ? { tolerance: question.tolerance || defaultTolerance }
            : {};

        // Use QuestionTypeService for answer validation
        let isCorrect = QuestionTypeService.scoreAnswer(
            questionType,
            answer,
            correctAnswerKey,
            options
        );

        // Calculate time-based values
        const timeTaken = Date.now() - questionStartTime;
        const maxBonusTime = config.SCORING.MAX_BONUS_TIME;

        // Get difficulty multiplier
        const difficultyMultiplier = ScoringService.getDifficultyMultiplier(
            question.difficulty,
            config.SCORING.DIFFICULTY_MULTIPLIERS,
            scoringConfig?.difficultyMultipliers
        );

        // Time bonus configuration
        const timeBonusEnabled = scoringConfig?.timeBonusEnabled ?? true;
        const timeBonusThreshold = scoringConfig?.timeBonusThreshold ?? 0;

        // Calculate time bonus with optional threshold
        const timeBonus = ScoringService.calculateTimeBonus(
            timeTaken,
            maxBonusTime,
            timeBonusThreshold
        );

        // Calculate base points and scaled time bonus
        const basePoints = config.SCORING.BASE_POINTS * difficultyMultiplier;
        const scaledTimeBonus = timeBonusEnabled
            ? Math.floor(timeBonus * difficultyMultiplier / config.SCORING.TIME_BONUS_DIVISOR)
            : 0;

        // Handle partial credit for ordering questions
        let points = 0;
        let partialScore = null;

        if (question.type === 'ordering' && typeof isCorrect === 'number') {
            // isCorrect is a decimal (0-1) representing percentage correct
            partialScore = isCorrect;
            points = Math.floor((basePoints + scaledTimeBonus) * isCorrect);
            // Only mark as "correct" if the order is 100% right
            isCorrect = isCorrect === 1;
        } else {
            points = isCorrect ? basePoints + scaledTimeBonus : 0;
        }

        // Apply double points power-up multiplier
        points = points * doublePointsMultiplier;

        // Build breakdown for score transparency
        const breakdown = {
            basePoints,
            timeBonus: scaledTimeBonus,
            difficultyMultiplier,
            doublePointsMultiplier
        };

        return {
            points,
            isCorrect,
            breakdown,
            partialScore
        };
    }

    /**
     * Calculate time bonus based on response time
     * @param {number} timeTaken - Time taken to answer in ms
     * @param {number} maxBonusTime - Maximum bonus time in ms
     * @param {number} threshold - Optional threshold for maximum bonus (0 = disabled)
     * @returns {number} Time bonus value
     */
    static calculateTimeBonus(timeTaken, maxBonusTime, threshold = 0) {
        if (threshold > 0 && timeTaken <= threshold) {
            // Within threshold: award maximum time bonus
            return maxBonusTime;
        }
        // Beyond threshold or no threshold: linear decrease
        return Math.max(0, maxBonusTime - timeTaken);
    }

    /**
     * Get difficulty multiplier for a question
     * @param {string} difficulty - Question difficulty level
     * @param {Object} defaultMultipliers - Default multipliers from config
     * @param {Object} customMultipliers - Optional custom multipliers
     * @returns {number} Difficulty multiplier
     */
    static getDifficultyMultiplier(difficulty, defaultMultipliers, customMultipliers = null) {
        return customMultipliers?.[difficulty]
            ?? defaultMultipliers[difficulty]
            ?? 2; // Default fallback
    }

    /**
     * Get the correct answer key for a question based on its type
     * @param {Object} question - Question data
     * @param {string} questionType - Type of question
     * @returns {*} Correct answer key
     */
    static getCorrectAnswerKey(question, questionType) {
        switch (questionType) {
            case 'multiple-choice':
                return question.correctIndex !== undefined
                    ? question.correctIndex
                    : question.correctAnswer;
            case 'multiple-correct':
                return question.correctIndices || question.correctAnswers || [];
            case 'true-false':
            case 'numeric':
                return question.correctAnswer;
            case 'ordering':
                return question.correctOrder || [];
            default:
                return question.correctAnswer;
        }
    }

    /**
     * Calculate consensus bonus multiplier
     * @param {number} consensusPercent - Percentage of players who agreed
     * @returns {number} Bonus multiplier
     */
    static getConsensusBonus(consensusPercent) {
        if (consensusPercent === 100) {
            return 1.5; // Unanimous
        } else if (consensusPercent >= 75) {
            return 1.2; // Strong consensus
        }
        return 1.0; // Standard
    }

    /**
     * Calculate team points for consensus mode
     * @param {Object} params - Parameters
     * @param {boolean} params.isCorrect - Whether the answer is correct
     * @param {number} params.consensusPercent - Percentage consensus
     * @param {string} params.difficulty - Question difficulty
     * @param {Object} params.config - Server config
     * @returns {number} Team points
     */
    static calculateConsensusTeamPoints({ isCorrect, consensusPercent, difficulty, config }) {
        if (!isCorrect) return 0;

        const difficultyMultiplier = config.SCORING.DIFFICULTY_MULTIPLIERS[difficulty] || 2;
        const basePoints = config.SCORING.BASE_POINTS * difficultyMultiplier;
        const consensusBonus = ScoringService.getConsensusBonus(consensusPercent);

        return Math.floor(basePoints * consensusBonus);
    }
}

module.exports = { ScoringService };
