/**
 * JSDoc Type Definitions for Quizix Pro
 * This file provides type definitions for IDE autocompletion and documentation.
 * Import types with: @typedef {import('./types.js').TypeName} TypeName
 */

// ============================================================================
// Question Types
// ============================================================================

/**
 * @typedef {'multiple-choice'|'multiple-correct'|'true-false'|'numeric'|'ordering'} QuestionType
 */

/**
 * @typedef {'easy'|'medium'|'hard'} Difficulty
 */

/**
 * @typedef {Object} QuestionOption
 * @property {string} text - Option text content
 * @property {boolean} [isCorrect] - Whether this option is correct (for multiple-correct)
 * @property {string} [image] - Optional image URL for the option
 */

/**
 * @typedef {Object} Question
 * @property {string} question - The question text
 * @property {QuestionType} type - Question type
 * @property {number} time - Time limit in seconds
 * @property {Difficulty} difficulty - Difficulty level
 * @property {string[]} [options] - Answer options (for multiple-choice, ordering)
 * @property {number} [correctIndex] - Index of correct answer (for multiple-choice)
 * @property {boolean[]} [correctIndices] - Array of correct indices (for multiple-correct)
 * @property {boolean} [correctAnswer] - Correct answer (for true-false)
 * @property {number} [numericAnswer] - Correct numeric answer
 * @property {number} [tolerance] - Tolerance for numeric answers (0-1)
 * @property {number[]} [correctOrder] - Correct ordering indices
 * @property {string} [image] - Optional question image URL
 * @property {string} [explanation] - Optional explanation for the answer
 */

// ============================================================================
// Quiz Types
// ============================================================================

/**
 * @typedef {Object} Quiz
 * @property {string} title - Quiz title
 * @property {Question[]} questions - Array of questions
 * @property {boolean} [manualAdvancement] - Whether host manually advances questions
 * @property {boolean} [randomizeQuestions] - Whether to randomize question order
 * @property {boolean} [randomizeAnswers] - Whether to randomize answer options
 * @property {number} [questionTime] - Default question time in seconds
 */

/**
 * @typedef {Object} QuizFile
 * @property {string} filename - Quiz filename
 * @property {string} title - Quiz title
 * @property {number} questionCount - Number of questions
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} [modifiedAt] - ISO timestamp of last modification
 */

// ============================================================================
// Player Types
// ============================================================================

/**
 * @typedef {Object} Player
 * @property {string} id - Socket ID
 * @property {string} name - Player display name
 * @property {number} score - Current score
 * @property {number} [streak] - Current answer streak
 * @property {boolean} [answered] - Whether player answered current question
 * @property {number} [answerTime] - Time taken to answer in ms
 */

/**
 * @typedef {Object} PlayerAnswer
 * @property {string} playerId - Socket ID of player
 * @property {string} playerName - Player display name
 * @property {number|string|boolean|number[]} answer - The answer submitted
 * @property {number} answerTime - Time taken to answer in ms
 * @property {boolean} [isCorrect] - Whether the answer was correct
 * @property {number} [points] - Points awarded
 */

/**
 * @typedef {Object} LeaderboardEntry
 * @property {string} name - Player name
 * @property {number} score - Total score
 * @property {number} [rank] - Position in leaderboard
 * @property {number} [correctAnswers] - Number of correct answers
 */

// ============================================================================
// Game State Types
// ============================================================================

/**
 * @typedef {Object} GameState
 * @property {boolean} isHost - Whether current user is the host
 * @property {boolean} gameStarted - Whether game has started
 * @property {boolean} gameEnded - Whether game has ended
 * @property {number} currentQuestionIndex - Current question index
 * @property {string} [gamePin] - Current game PIN
 * @property {Player[]} [players] - Array of players (host only)
 * @property {boolean} [answerSubmitted] - Whether player submitted answer
 * @property {boolean} [resultShown] - Whether result was shown
 */

/**
 * @typedef {'idle'|'lobby'|'playing'|'question'|'results'|'leaderboard'|'ended'} GamePhase
 */

// ============================================================================
// Socket Event Types
// ============================================================================

/**
 * @typedef {Object} GameCreatedEvent
 * @property {string} pin - Game PIN
 * @property {string} title - Quiz title
 * @property {string} qrCodeDataUrl - QR code data URL
 * @property {string} [networkUrl] - Network URL for joining
 */

/**
 * @typedef {Object} PlayerJoinedEvent
 * @property {string} playerId - Player socket ID
 * @property {string} playerName - Player display name
 * @property {number} playerNumber - Player number
 * @property {Player[]} players - Updated player list
 */

/**
 * @typedef {Object} QuestionStartEvent
 * @property {number} questionIndex - Current question index
 * @property {number} totalQuestions - Total number of questions
 * @property {Question} question - Question data (sanitized for players)
 * @property {number} timeLimit - Time limit in seconds
 */

/**
 * @typedef {Object} AnswerResultEvent
 * @property {boolean} correct - Whether answer was correct
 * @property {number} points - Points awarded
 * @property {number} totalScore - New total score
 * @property {number} [streak] - Current streak
 * @property {number|string|boolean|number[]} [correctAnswer] - The correct answer
 */

/**
 * @typedef {Object} QuestionEndEvent
 * @property {LeaderboardEntry[]} leaderboard - Current leaderboard
 * @property {Object} statistics - Answer statistics
 * @property {number|string|boolean|number[]} correctAnswer - The correct answer
 */

/**
 * @typedef {Object} GameEndEvent
 * @property {LeaderboardEntry[]} leaderboard - Final leaderboard
 * @property {Object} [statistics] - Game statistics
 */

// ============================================================================
// AI Generation Types
// ============================================================================

/**
 * @typedef {'claude'|'openai'|'ollama'|'gemini'} AIProvider
 */

/**
 * @typedef {Object} AIGenerationOptions
 * @property {AIProvider} provider - AI provider to use
 * @property {string} [model] - Specific model to use
 * @property {number} [temperature] - Generation temperature (0-1)
 * @property {number} questionCount - Number of questions to generate
 * @property {QuestionType} questionType - Type of questions to generate
 * @property {Difficulty} difficulty - Difficulty level
 * @property {string} topic - Topic or subject matter
 * @property {string} [context] - Additional context or source material
 */

/**
 * @typedef {Object} AIGenerationResult
 * @property {Question[]} questions - Generated questions
 * @property {string} [rawResponse] - Raw AI response
 * @property {string} [error] - Error message if generation failed
 */

// ============================================================================
// Results Types
// ============================================================================

/**
 * @typedef {Object} GameResults
 * @property {string} quizTitle - Title of the quiz
 * @property {string} gamePin - Game PIN used
 * @property {string} date - ISO timestamp
 * @property {number} duration - Game duration in ms
 * @property {LeaderboardEntry[]} leaderboard - Final leaderboard
 * @property {QuestionResult[]} questions - Per-question results
 */

/**
 * @typedef {Object} QuestionResult
 * @property {string} question - Question text
 * @property {QuestionType} type - Question type
 * @property {number} correctCount - Number of correct answers
 * @property {number} totalAnswers - Total answers submitted
 * @property {number} averageTime - Average answer time in ms
 * @property {Object} answerDistribution - Distribution of answers
 */

// ============================================================================
// UI Types
// ============================================================================

/**
 * @typedef {'home'|'quiz-editor'|'host-lobby'|'host-game'|'player-join'|'player-game'|'leaderboard'|'results'} ScreenName
 */

/**
 * @typedef {Object} ToastOptions
 * @property {'success'|'error'|'warning'|'info'} type - Toast type
 * @property {number} [duration] - Duration in ms
 * @property {boolean} [dismissible] - Whether user can dismiss
 */

/**
 * @typedef {Object} ModalOptions
 * @property {string} title - Modal title
 * @property {string} content - Modal HTML content
 * @property {boolean} [closable] - Whether modal can be closed
 * @property {Function} [onClose] - Callback when modal closes
 */

// ============================================================================
// Service Types
// ============================================================================

/**
 * @typedef {Object} ServiceRegistration
 * @property {*} instance - The service instance
 * @property {boolean} initialized - Whether service is initialized
 */

/**
 * @typedef {Object} EventListenerEntry
 * @property {string} event - Event name
 * @property {Function} handler - Event handler function
 * @property {Object} [options] - addEventListener options
 */

// ============================================================================
// Export (for module compatibility)
// ============================================================================

// This file is primarily for JSDoc type definitions
// Export empty object for ES module compatibility
export default {};
