/**
 * PracticeModeManager
 * Orchestrates single-player practice mode
 * Entry point for starting practice sessions with saved quizzes
 */

import { LocalEventBus } from '../events/local-event-bus.js';
import { LocalGameSession } from './local-game-session.js';
import { logger } from '../core/config.js';
import { getTranslation } from '../utils/translation-manager.js';
import { APIHelper } from '../utils/api-helper.js';

export class PracticeModeManager {
    /**
     * Create a PracticeModeManager
     * @param {Object} gameManager - GameManager instance
     * @param {Object} uiManager - UIManager instance
     */
    constructor(gameManager, uiManager) {
        this.gameManager = gameManager;
        this.uiManager = uiManager;

        /** @type {LocalEventBus|null} */
        this.eventBus = null;

        /** @type {LocalGameSession|null} */
        this.gameSession = null;

        /** @type {Object|null} */
        this.currentQuiz = null;

        /** @type {string|null} */
        this.currentQuizFilename = null;

        this.isActive = false;

        // Bound handlers for cleanup
        this._boundHandlers = {};
    }

    /**
     * Start practice mode with a quiz
     * @param {string} quizFilename - Filename of the quiz to practice
     * @returns {Promise<boolean>} Success status
     */
    async startPracticeMode(quizFilename) {
        if (this.isActive) {
            logger.warn('[PracticeModeManager] Already in practice mode');
            return false;
        }

        logger.debug('[PracticeModeManager] Starting practice mode for:', quizFilename);

        try {
            // Load the quiz
            const quiz = await this.loadQuiz(quizFilename);
            if (!quiz) {
                return false;
            }

            this.currentQuiz = quiz;
            this.currentQuizFilename = quizFilename;
            this.isActive = true;

            // Check if power-ups are enabled (from quiz settings or UI checkbox)
            const powerUpsEnabled = quiz.powerUpsEnabled ||
                document.getElementById('enable-power-ups')?.checked ||
                false;

            // Create event bus and game session
            this.eventBus = new LocalEventBus({ debug: false });
            this.gameSession = new LocalGameSession(quiz, this.eventBus, {
                playerName: getTranslation('player') || 'Player',
                quizFilename: quizFilename,
                powerUpsEnabled: powerUpsEnabled
            });

            // Wire up GameManager with event bus
            this.gameManager.setEventBus(this.eventBus);

            // Register event handlers
            this.registerEventHandlers();

            // Update UI for practice mode
            this.updateUIForPracticeMode(true);

            // Start the game
            this.gameSession.startGame();

            logger.debug('[PracticeModeManager] Practice mode started successfully');
            return true;

        } catch (error) {
            logger.error('[PracticeModeManager] Failed to start practice mode:', error);
            this.cleanup();
            return false;
        }
    }

    /**
     * Load quiz from server
     * @param {string} filename - Quiz filename
     * @returns {Promise<Object|null>} Quiz data or null on error
     */
    async loadQuiz(filename) {
        try {
            const response = await fetch(APIHelper.getApiUrl(`api/quiz/${encodeURIComponent(filename)}`));
            if (!response.ok) {
                throw new Error(`Failed to load quiz: ${response.statusText}`);
            }
            const quiz = await response.json();
            logger.debug('[PracticeModeManager] Quiz loaded:', quiz.title);
            return quiz;
        } catch (error) {
            logger.error('[PracticeModeManager] Error loading quiz:', error);
            return null;
        }
    }

    /**
     * Register event handlers for game events
     * Mirrors socket-manager.js event handling
     */
    registerEventHandlers() {
        // Game started - show player game screen
        this._boundHandlers.gameStarted = (data) => {
            logger.debug('[PracticeModeManager] Game started:', data);
            // In practice mode, user plays as a player
            this.uiManager.showScreen('player-game-screen');

            // Initialize power-ups if enabled
            if (this.gameSession?.powerUpsEnabled) {
                this.gameManager.initializePowerUps(true);
            }
        };
        this.eventBus.on('game-started', this._boundHandlers.gameStarted);

        // Question start - display question and start timer
        this._boundHandlers.questionStart = (data) => {
            logger.debug('[PracticeModeManager] Question start:', data.questionIndex);

            // Clear any pending advance timer from previous question
            if (this._advanceTimer) {
                clearTimeout(this._advanceTimer);
                this._advanceTimer = null;
            }

            this.gameManager.displayQuestion(data);
            const timeLimit = data.timeLimit || 20;
            this.gameManager.startTimer(timeLimit * 1000);
        };
        this.eventBus.on('question-start', this._boundHandlers.questionStart);

        // Answer submitted (from player interaction)
        this._boundHandlers.submitAnswer = (data) => {
            logger.debug('[PracticeModeManager] Answer submitted:', data);
            if (this.gameSession) {
                this.gameSession.submitAnswer(data.answer);
            }
        };
        this.eventBus.on('submit-answer', this._boundHandlers.submitAnswer);

        // Player result (answer feedback)
        this._boundHandlers.playerResult = (data) => {
            logger.debug('[PracticeModeManager] Player result:', data);
            this.gameManager.showPlayerResult(data);
        };
        this.eventBus.on('player-result', this._boundHandlers.playerResult);

        // Question end (reveal answer) - auto-advance in practice mode
        this._boundHandlers.questionEnd = (data) => {
            logger.debug('[PracticeModeManager] Question end:', data);
            this.gameManager.stopTimer();

            // Auto-advance to next question after result display
            // Use slightly longer delay to allow result modal to complete
            const advanceDelay = 4500; // 4.5 seconds (after 4s result display)
            this._advanceTimer = setTimeout(() => {
                if (this.isActive && this.gameSession) {
                    logger.debug('[PracticeModeManager] Auto-advancing to next question');
                    this.gameSession.nextQuestion();
                }
            }, advanceDelay);
        };
        this.eventBus.on('question-end', this._boundHandlers.questionEnd);

        // Game end
        this._boundHandlers.gameEnd = (data) => {
            logger.debug('[PracticeModeManager] Game end:', data);
            this.handleGameEnd(data);
        };
        this.eventBus.on('game-end', this._boundHandlers.gameEnd);

        // Next question request (from UI)
        this._boundHandlers.nextQuestion = () => {
            logger.debug('[PracticeModeManager] Next question requested');
            if (this.gameSession) {
                this.gameSession.nextQuestion();
            }
        };
        this.eventBus.on('next-question', this._boundHandlers.nextQuestion);

        // Power-up usage request (from player UI)
        this._boundHandlers.usePowerUp = (data) => {
            logger.debug('[PracticeModeManager] Power-up request:', data);
            if (this.gameSession) {
                this.gameSession.usePowerUp(data.type);
            }
        };
        this.eventBus.on('use-power-up', this._boundHandlers.usePowerUp);

        // Power-up result (from game session)
        this._boundHandlers.powerUpResult = (data) => {
            logger.debug('[PracticeModeManager] Power-up result:', data);
            if (data.success) {
                const powerUpManager = this.gameManager.getPowerUpManager();
                if (data.type === 'fifty-fifty' && data.hiddenOptions) {
                    // Apply 50-50 effect
                    const question = this.gameSession.getCurrentQuestion();
                    if (question) {
                        powerUpManager?.applyFiftyFiftyToOptions(question.correctAnswer);
                    }
                } else if (data.type === 'extend-time' && data.extraSeconds) {
                    // Extend time
                    this.gameManager.timerManager?.extendTime(data.extraSeconds);
                }
                // double-points is applied automatically in scoring
            }
        };
        this.eventBus.on('power-up-result', this._boundHandlers.powerUpResult);

        logger.debug('[PracticeModeManager] Event handlers registered');
    }

    /**
     * Handle game end event
     * @param {Object} data - Game end data
     */
    handleGameEnd(data) {
        logger.debug('[PracticeModeManager] Handling game end', data);

        // Clear advance timer
        if (this._advanceTimer) {
            clearTimeout(this._advanceTimer);
            this._advanceTimer = null;
        }

        // Set UI state to results
        if (window.uiStateManager?.setState) {
            window.uiStateManager.setState('results');
        }

        // Stop timer and show final results (matching socket-manager behavior)
        this.gameManager.stopTimer();
        this.gameManager.showFinalResults(data.leaderboard);

        // Show practice-specific results
        this.showPracticeResults(data);
    }

    /**
     * Show practice mode results screen
     * @param {Object} data - Game end data
     */
    showPracticeResults(data) {
        const resultsContainer = document.getElementById('practice-results');
        if (!resultsContainer) {
            logger.debug('[PracticeModeManager] Practice results container not found, using standard results');
            return;
        }

        // Calculate percentage
        const percentage = Math.round((data.correctAnswers / data.totalQuestions) * 100);

        // Format time
        const totalSeconds = Math.round(data.totalTime / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const timeFormatted = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        // Build results HTML
        resultsContainer.innerHTML = `
            <div class="practice-results-content">
                <h2>${getTranslation('practice_complete') || 'Practice Complete!'}</h2>

                <div class="practice-score-display">
                    <div class="practice-score">${data.finalScore}</div>
                    <div class="practice-score-label">${getTranslation('points') || 'Points'}</div>
                </div>

                <div class="practice-stats">
                    <div class="practice-stat">
                        <span class="stat-value">${data.correctAnswers}/${data.totalQuestions}</span>
                        <span class="stat-label">${getTranslation('correct') || 'Correct'}</span>
                    </div>
                    <div class="practice-stat">
                        <span class="stat-value">${percentage}%</span>
                        <span class="stat-label">${getTranslation('accuracy') || 'Accuracy'}</span>
                    </div>
                    <div class="practice-stat">
                        <span class="stat-value">${timeFormatted}</span>
                        <span class="stat-label">${getTranslation('time') || 'Time'}</span>
                    </div>
                </div>

                ${data.isNewPersonalBest ? `
                    <div class="new-personal-best">
                        <span class="best-icon">🏆</span>
                        <span>${getTranslation('new_personal_best') || 'New Personal Best!'}</span>
                    </div>
                ` : `
                    <div class="personal-best-info">
                        <span>${getTranslation('personal_best') || 'Personal Best'}: ${data.personalBest}</span>
                    </div>
                `}

                <div class="practice-actions">
                    <button id="practice-try-again" class="primary-button">
                        ${getTranslation('try_again') || 'Try Again'}
                    </button>
                    <button id="practice-exit" class="secondary-button">
                        ${getTranslation('exit') || 'Exit'}
                    </button>
                </div>
            </div>
        `;

        // Show results container
        resultsContainer.classList.remove('hidden');

        // Wire up buttons
        const tryAgainBtn = document.getElementById('practice-try-again');
        const exitBtn = document.getElementById('practice-exit');

        if (tryAgainBtn) {
            tryAgainBtn.addEventListener('click', () => {
                this.restartPractice();
            });
        }

        if (exitBtn) {
            exitBtn.addEventListener('click', () => {
                this.exitPracticeMode();
            });
        }
    }

    /**
     * Restart practice with the same quiz
     */
    async restartPractice() {
        const filename = this.currentQuizFilename;

        // Clean up current session
        this.cleanup();

        // Hide results
        const resultsContainer = document.getElementById('practice-results');
        if (resultsContainer) {
            resultsContainer.classList.add('hidden');
        }

        // Start fresh
        if (filename) {
            await this.startPracticeMode(filename);
        }
    }

    /**
     * Exit practice mode and return to main menu
     */
    exitPracticeMode() {
        logger.debug('[PracticeModeManager] Exiting practice mode');

        // Clean up
        this.cleanup();

        // Hide results
        const resultsContainer = document.getElementById('practice-results');
        if (resultsContainer) {
            resultsContainer.classList.add('hidden');
        }

        // Update UI
        this.updateUIForPracticeMode(false);

        // Return to main menu
        if (this.uiManager) {
            this.uiManager.showScreen('main');
        }
    }

    /**
     * Update UI elements for practice mode
     * @param {boolean} isPractice - Whether entering or exiting practice mode
     */
    updateUIForPracticeMode(isPractice) {
        // Show/hide practice mode indicator
        const indicator = document.getElementById('practice-mode-indicator');
        if (indicator) {
            indicator.classList.toggle('hidden', !isPractice);
        }

        // Update any other UI elements as needed
        document.body.classList.toggle('practice-mode', isPractice);

        logger.debug(`[PracticeModeManager] UI updated for practice mode: ${isPractice}`);
    }

    /**
     * Clean up resources
     */
    cleanup() {
        logger.debug('[PracticeModeManager] Cleaning up');

        // Clear advance timer
        if (this._advanceTimer) {
            clearTimeout(this._advanceTimer);
            this._advanceTimer = null;
        }

        // Clean up game session
        if (this.gameSession) {
            this.gameSession.cleanup();
            this.gameSession = null;
        }

        // Remove event handlers
        if (this.eventBus) {
            Object.keys(this._boundHandlers).forEach(key => {
                // Map handler key to event name
                const eventMap = {
                    gameStarted: 'game-started',
                    questionStart: 'question-start',
                    submitAnswer: 'submit-answer',
                    playerResult: 'player-result',
                    questionEnd: 'question-end',
                    gameEnd: 'game-end',
                    nextQuestion: 'next-question'
                };
                const eventName = eventMap[key];
                if (eventName && this._boundHandlers[key]) {
                    this.eventBus.off(eventName, this._boundHandlers[key]);
                }
            });
            this.eventBus.disconnect();
            this.eventBus = null;
        }

        this._boundHandlers = {};

        // Clear game manager event bus
        if (this.gameManager) {
            this.gameManager.setEventBus(null);
        }

        // Reset state
        this.currentQuiz = null;
        this.currentQuizFilename = null;
        this.isActive = false;
    }

    /**
     * Check if practice mode is currently active
     * @returns {boolean}
     */
    isPracticeActive() {
        return this.isActive;
    }

    /**
     * Get current quiz stats from history
     * @returns {Object|null} Quiz stats or null
     */
    getCurrentQuizStats() {
        if (this.gameSession) {
            return this.gameSession.getQuizStats();
        }
        return null;
    }
}

export default PracticeModeManager;
