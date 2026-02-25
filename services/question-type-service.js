/**
 * Question Type Service (Backend/CommonJS version)
 *
 * Backend version of QuestionTypeRegistry for use in server.js
 * Provides validation and scoring logic for all question types
 *
 * Note: Keep in sync with public/js/utils/question-type-registry.js
 */

// Respect production environment - only log in development
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';

const logger = {
    warn: (msg, ...args) => {
        if (!isProduction) console.warn(`⚠️ [QuestionTypeService] ${msg}`, ...args);
    },
    error: (msg, ...args) => {
    // Errors are always logged, but could be sent to external service in production
        console.error(`❌ [QuestionTypeService] ${msg}`, ...args);
    }
};

/**
 * Question type definitions (validation and scoring only)
 */
const QUESTION_TYPES = {
    'multiple-choice': {
        validate: (data) => {
            if (!data.options || !Array.isArray(data.options)) {
                return { valid: false, error: 'Options must be an array' };
            }
            if (data.options.length < 2) {
                return { valid: false, error: 'At least 2 options required' };
            }
            if (data.correctIndex === undefined || data.correctIndex < 0 || data.correctIndex >= data.options.length) {
                return { valid: false, error: 'Valid correct answer must be selected' };
            }
            return { valid: true };
        },

        scoreAnswer: (playerAnswer, correctAnswer) => {
            return playerAnswer === correctAnswer;
        },

        /**
         * Normalize player answer for consistent comparison
         */
        normalizeAnswer: (answer) => {
            if (typeof answer === 'string') return parseInt(answer, 10);
            return answer;
        },

        /**
         * Build statistics from player answers
         * @param {Array} answers - Array of player answers
         * @param {Object} question - Question data
         * @returns {Object} Statistics object
         */
        buildStatistics: (answers, question) => {
            const optionCounts = new Array(question.options?.length || 4).fill(0);
            answers.forEach(answer => {
                const idx = typeof answer === 'number' ? answer : parseInt(answer, 10);
                if (idx >= 0 && idx < optionCounts.length) {
                    optionCounts[idx]++;
                }
            });
            return {
                type: 'distribution',
                optionCounts,
                total: answers.length
            };
        }
    },

    'multiple-correct': {
        validate: (data) => {
            if (!data.options || !Array.isArray(data.options)) {
                return { valid: false, error: 'Options must be an array' };
            }
            if (data.options.length < 2) {
                return { valid: false, error: 'At least 2 options required' };
            }
            if (!data.correctIndices || !Array.isArray(data.correctIndices) || data.correctIndices.length === 0) {
                return { valid: false, error: 'At least one correct answer must be selected' };
            }
            const allValid = data.correctIndices.every(idx => idx >= 0 && idx < data.options.length);
            if (!allValid) {
                return { valid: false, error: 'Invalid correct answer indices' };
            }
            return { valid: true };
        },

        scoreAnswer: (playerAnswer, correctAnswer) => {
            if (!Array.isArray(playerAnswer) || !Array.isArray(correctAnswer)) {
                return false;
            }
            const sortedPlayer = [...playerAnswer].sort((a, b) => a - b);
            const sortedCorrect = [...correctAnswer].sort((a, b) => a - b);
            if (sortedPlayer.length !== sortedCorrect.length) {
                return false;
            }
            return sortedPlayer.every((val, index) => val === sortedCorrect[index]);
        },

        normalizeAnswer: (answer) => {
            if (!Array.isArray(answer)) return [];
            return answer.map(a => typeof a === 'string' ? parseInt(a, 10) : a).sort((a, b) => a - b);
        },

        buildStatistics: (answers, question) => {
            const optionCounts = new Array(question.options?.length || 4).fill(0);
            answers.forEach(answerArray => {
                if (Array.isArray(answerArray)) {
                    answerArray.forEach(idx => {
                        if (idx >= 0 && idx < optionCounts.length) {
                            optionCounts[idx]++;
                        }
                    });
                }
            });
            return { type: 'multi-distribution', optionCounts, total: answers.length };
        }
    },

    'true-false': {
        validate: (data) => {
            if (data.correctAnswer === undefined || data.correctAnswer === null) {
                return { valid: false, error: 'Correct answer (True or False) must be selected' };
            }
            if (typeof data.correctAnswer !== 'boolean') {
                return { valid: false, error: 'Correct answer must be boolean' };
            }
            return { valid: true };
        },

        scoreAnswer: (playerAnswer, correctAnswer) => {
            // Normalize both to boolean for comparison
            const normalizeBoolean = (val) => {
                if (typeof val === 'boolean') return val;
                if (typeof val === 'string') {
                    return val.toLowerCase() === 'true';
                }
                return Boolean(val);
            };
            return normalizeBoolean(playerAnswer) === normalizeBoolean(correctAnswer);
        },

        normalizeAnswer: (answer) => {
            if (typeof answer === 'boolean') return answer;
            if (typeof answer === 'string') return answer.toLowerCase() === 'true';
            return Boolean(answer);
        },

        buildStatistics: (answers, _question) => {
            let trueCount = 0, falseCount = 0;
            answers.forEach(answer => {
                if (answer === true || answer === 'true') trueCount++;
                else falseCount++;
            });
            return { type: 'binary', trueCount, falseCount, total: answers.length };
        }
    },

    'numeric': {
        validate: (data) => {
            if (data.correctAnswer === undefined || data.correctAnswer === null) {
                return { valid: false, error: 'Numeric answer required' };
            }
            if (isNaN(data.correctAnswer)) {
                return { valid: false, error: 'Answer must be a valid number' };
            }
            if (data.tolerance !== undefined && (isNaN(data.tolerance) || data.tolerance < 0)) {
                return { valid: false, error: 'Tolerance must be a non-negative number' };
            }
            return { valid: true };
        },

        scoreAnswer: (playerAnswer, correctAnswer, tolerance = 0.1) => {
            const playerNum = parseFloat(playerAnswer);
            const correctNum = parseFloat(correctAnswer);
            if (isNaN(playerNum) || isNaN(correctNum)) {
                return false;
            }
            const diff = Math.abs(playerNum - correctNum);
            return diff <= tolerance;
        },

        normalizeAnswer: (answer) => {
            const num = parseFloat(answer);
            return isNaN(num) ? null : num;
        },

        buildStatistics: (answers, question) => {
            const numericAnswers = answers.map(a => parseFloat(a)).filter(n => !isNaN(n));
            const correctAnswer = question.correctAnswer;
            const tolerance = question.tolerance || 0.1;
            const correctCount = numericAnswers.filter(a => Math.abs(a - correctAnswer) <= tolerance).length;
            return {
                type: 'numeric',
                answers: numericAnswers.slice(0, 10), // Sample of answers
                correctCount,
                total: answers.length,
                average: numericAnswers.length > 0 ? numericAnswers.reduce((a, b) => a + b, 0) / numericAnswers.length : 0
            };
        }
    },

    'ordering': {
        validate: (data) => {
            if (!data.options || !Array.isArray(data.options)) {
                return { valid: false, error: 'Options must be an array' };
            }
            if (data.options.length < 2) {
                return { valid: false, error: 'At least 2 options required for ordering' };
            }
            if (!data.correctOrder || !Array.isArray(data.correctOrder)) {
                return { valid: false, error: 'Correct order must be specified' };
            }
            if (data.correctOrder.length !== data.options.length) {
                return { valid: false, error: 'Correct order length must match options length' };
            }
            return { valid: true };
        },

        /**
     * Score ordering question with partial credit
     * Returns a number between 0 and 1 representing the percentage correct
     */
        scoreAnswer: (playerOrder, correctOrder, options = {}) => {
            if (!Array.isArray(playerOrder) || !Array.isArray(correctOrder)) {
                return 0;
            }
            if (playerOrder.length !== correctOrder.length) {
                return 0;
            }

            // Calculate partial credit based on correct positions
            let correctPositions = 0;
            for (let i = 0; i < playerOrder.length; i++) {
                if (playerOrder[i] === correctOrder[i]) {
                    correctPositions++;
                }
            }

            // Return percentage correct (0-1) for partial credit
            return correctPositions / correctOrder.length;
        },

        normalizeAnswer: (answer) => {
            if (!Array.isArray(answer)) return [];
            return answer.map(a => typeof a === 'string' ? parseInt(a, 10) : a);
        },

        buildStatistics: (answers, question) => {
            const correctOrder = question.correctOrder || [];
            let fullyCorrect = 0;
            let partialScores = [];

            answers.forEach(playerOrder => {
                if (!Array.isArray(playerOrder)) return;
                let correctPositions = 0;
                for (let i = 0; i < Math.min(playerOrder.length, correctOrder.length); i++) {
                    if (playerOrder[i] === correctOrder[i]) correctPositions++;
                }
                const score = correctOrder.length > 0 ? correctPositions / correctOrder.length : 0;
                partialScores.push(score);
                if (score === 1) fullyCorrect++;
            });

            return {
                type: 'ordering',
                fullyCorrect,
                averageScore: partialScores.length > 0 ? partialScores.reduce((a, b) => a + b, 0) / partialScores.length : 0,
                total: answers.length
            };
        }
    }
};

/**
 * QuestionTypeService - Public API
 */
class QuestionTypeService {

    /**
   * Get question type definition
   */
    static getType(typeId) {
        const type = QUESTION_TYPES[typeId];
        if (!type) {
            logger.warn(`Unknown question type: ${typeId}, falling back to multiple-choice`);
            return QUESTION_TYPES['multiple-choice'];
        }
        return type;
    }

    /**
   * Check if question type exists
   */
    static isValidType(typeId) {
        return typeId in QUESTION_TYPES;
    }

    /**
   * Validate question data
   * @param {string} typeId - Question type ID
   * @param {Object} data - Question data to validate
   * @returns {Object} { valid: boolean, error?: string }
   */
    static validate(typeId, data) {
        try {
            return this.getType(typeId).validate(data);
        } catch (error) {
            logger.error(`Error validating question for type ${typeId}:`, error);
            return { valid: false, error: `Validation error: ${error.message}` };
        }
    }

    /**
   * Score player answer
   * @param {string} typeId - Question type ID
   * @param {*} playerAnswer - Player's answer
   * @param {*} correctAnswer - Correct answer
   * @param {Object} options - Additional options (e.g., tolerance for numeric)
   * @returns {boolean|number} True/false for exact scoring, 0-1 for partial credit (ordering)
   */
    static scoreAnswer(typeId, playerAnswer, correctAnswer, options = {}) {
        try {
            const type = this.getType(typeId);

            // For numeric questions, pass tolerance
            if (typeId === 'numeric' && options.tolerance !== undefined) {
                return type.scoreAnswer(playerAnswer, correctAnswer, options.tolerance);
            }

            // For ordering questions, pass options (currently unused but future-proof)
            if (typeId === 'ordering') {
                return type.scoreAnswer(playerAnswer, correctAnswer, options);
            }

            return type.scoreAnswer(playerAnswer, correctAnswer);
        } catch (error) {
            logger.error(`Error scoring answer for type ${typeId}:`, error);
            return false;
        }
    }

    /**
   * Get all supported question type IDs
   */
    static getTypeIds() {
        return Object.keys(QUESTION_TYPES);
    }

    /**
     * Normalize answer for consistent comparison
     * @param {string} typeId - Question type ID
     * @param {*} answer - Player answer to normalize
     * @returns {*} Normalized answer
     */
    static normalizeAnswer(typeId, answer) {
        try {
            const type = this.getType(typeId);
            return type.normalizeAnswer ? type.normalizeAnswer(answer) : answer;
        } catch (error) {
            logger.error(`Error normalizing answer for type ${typeId}:`, error);
            return answer;
        }
    }

    /**
     * Build statistics from answers
     * @param {string} typeId - Question type ID
     * @param {Array} answers - Array of player answers
     * @param {Object} question - Question data
     * @returns {Object} Statistics object
     */
    static buildStatistics(typeId, answers, question) {
        try {
            const type = this.getType(typeId);
            return type.buildStatistics ? type.buildStatistics(answers, question) : { type: 'unknown', total: answers.length };
        } catch (error) {
            logger.error(`Error building statistics for type ${typeId}:`, error);
            return { type: 'error', total: answers.length };
        }
    }
}

module.exports = { QuestionTypeService };
