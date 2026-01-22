/**
 * Game Manager Module
 * Handles game flow, question display, player results, and game state management
 */

import { translationManager, getTranslation, getTrueFalseText } from '../utils/translation-manager.js';
import { TIMING, logger, UI, ANIMATION } from '../core/config.js';
// MathRenderer and mathJaxService now handled by GameDisplayManager
import { simpleMathJaxService } from '../utils/simple-mathjax-service.js';
import { dom, escapeHtml, escapeHtmlPreservingLatex } from '../utils/dom.js';
import { unifiedErrorHandler as errorBoundary } from '../utils/unified-error-handler.js';
import { modalFeedback } from '../utils/modal-feedback.js';
import { simpleResultsDownloader } from '../utils/simple-results-downloader.js';
import { GameDisplayManager } from './modules/game-display-manager.js';
import { GameStateManager as ModularGameStateManager } from './modules/game-state-manager.js';
import { APIHelper } from '../utils/api-helper.js';
import { PlayerInteractionManager } from './modules/player-interaction-manager.js';
import { TimerManager } from './modules/timer-manager.js';
import { QuestionRenderer } from './modules/question-renderer.js';
import QuestionTypeRegistry from '../utils/question-type-registry.js';
import { EventListenerManager } from '../utils/event-listener-manager.js';
import { AnswerRevealManager } from './modules/answer-reveal-manager.js';
import { LeaderboardManager } from './modules/leaderboard-manager.js';
import { PowerUpManager } from './modules/power-up-manager.js';

export class GameManager {
    constructor(socket, uiManager, soundManager, socketManager = null) {
        this.socket = socket;
        this.uiManager = uiManager;
        this.soundManager = soundManager;
        this.socketManager = socketManager;
        // MathRenderer now handled by GameDisplayManager
        this.displayManager = new GameDisplayManager(uiManager);
        this.stateManager = new ModularGameStateManager();
        this.timerManager = new TimerManager();
        this.interactionManager = new PlayerInteractionManager(this.stateManager, this.displayManager, soundManager, socketManager);
        this.questionRenderer = new QuestionRenderer(this.displayManager, this.stateManager, uiManager, this);
        this.answerRevealManager = new AnswerRevealManager(this.stateManager, this.displayManager);
        this.leaderboardManager = new LeaderboardManager(this.stateManager, uiManager, soundManager);
        this.powerUpManager = new PowerUpManager();

        // Setup power-up callbacks
        this.powerUpManager.setExtendTimeCallback((extraSeconds) => {
            this.timerManager.extendTime(extraSeconds);
        });
        this.powerUpManager.setFiftyFiftyCallback(() => {
            this.applyFiftyFifty();
        });

        // Initialize DOM Manager with common game elements
        dom.initializeGameElements();

        // Keep these specific to GameManager for now
        this.lastDisplayQuestionTime = 0; // Prevent rapid successive displayQuestion calls

        // Game state properties (gameEnded/resultShown moved to stateManager - single source of truth)
        this.currentQuizTitle = null;
        this.gameStartTime = null;

        // Memory management via EventListenerManager
        this.listenerManager = new EventListenerManager('GameManager');
        this.playerAnswers = new Map(); // Track player answers for cleanup

        // Bind cleanup method
        this.cleanup = this.cleanup.bind(this);

        // Auto-cleanup on page unload
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this.cleanup);
            window.addEventListener('unload', this.cleanup);
        }


    }

    /**
     * Update socket manager reference (called after initialization)
     */
    setSocketManager(socketManager) {
        this.socketManager = socketManager;
        if (this.interactionManager) {
            this.interactionManager.socketManager = socketManager;
        }
        // Set socket on power-up manager for multiplayer mode
        if (this.powerUpManager && socketManager?.socket) {
            this.powerUpManager.setSocket(socketManager.socket);
        }
    }

    /**
     * Set the event bus for game communication
     * Enables switching between multiplayer (socket) and practice (local) modes
     * @param {import('../events/event-bus-interface.js').IEventBus} eventBus - Event bus instance
     */
    setEventBus(eventBus) {
        this.eventBus = eventBus;
        if (this.interactionManager) {
            this.interactionManager.eventBus = eventBus;
        }
        if (this.powerUpManager) {
            this.powerUpManager.setEventBus(eventBus);
        }
        logger.debug(`GameManager: Event bus set to ${eventBus?.getMode?.()} mode`);
    }

    /**
     * Check if currently in practice mode
     * @returns {boolean}
     */
    isPracticeMode() {
        return this.eventBus?.getMode?.() === 'local';
    }

    /**
     * Get the current event bus
     * @returns {import('../events/event-bus-interface.js').IEventBus|null}
     */
    getEventBus() {
        return this.eventBus;
    }


    /**
     * Display a question to the player or host
     */
    displayQuestion(data) {
        return errorBoundary.safeExecute(() => {
            // Prevent rapid successive calls that could interfere with MathJax rendering
            const now = Date.now();
            if (this.lastDisplayQuestionTime && (now - this.lastDisplayQuestionTime) < 500) {
                logger.debug('🚫 Ignoring rapid displayQuestion call to prevent MathJax interference');
                return;
            }
            this.lastDisplayQuestionTime = now;

            logger.debug('Displaying question:', data);

            // Initialize display state
            this.initializeQuestionDisplay(data);

            // Get DOM elements and containers
            const elements = this.getQuestionElements();
            const optionsContainer = this.setupQuestionContainers(data);

            // Update content based on host/player mode
            const gameState = this.stateManager.getGameState();
            if (gameState.isHost) {
                this.questionRenderer.updateHostDisplay(data, elements);
            } else {
                this.questionRenderer.updatePlayerDisplay(data, elements, optionsContainer);
            }

            // Finalize display
            this.finalizeQuestionDisplay(data);
        }, {
            type: 'game_logic',
            operation: 'question_display',
            questionId: data.questionId
        }, () => {
            // Fallback: show error message
            logger.error('Failed to display question, showing error state');
            this.showQuestionErrorState();
        });
    }

    /**
     * Initialize question display state and reset for new question
     */
    initializeQuestionDisplay(data) {
        const gameState = this.stateManager.getGameState();
        logger.debug('QuestionInit', { type: data.type, options: data.options?.length, isHost: gameState.isHost });

        // CRITICAL: Hide and clear modal feedback to prevent stale explanation display
        // This ensures previous question's explanation doesn't show while waiting for new results
        if (modalFeedback) {
            modalFeedback.hide();
            modalFeedback.clearContent();
        }

        // FIXED: Re-enable conservative element cleaning to prevent MathJax interference
        this.cleanGameElementsForFreshRendering();


        // Initialize question state using state manager
        this.stateManager.initializeQuestionState(data);

        // Reset button states for new question
        this.resetButtonStatesForNewQuestion();

        // Reset player interaction state (clear highlighting, etc.)
        this.interactionManager.reset();

        // Update power-ups for new question (reset hidden options, update availability)
        this.updatePowerUpsForQuestion(data.type);

    }

    /**
     * Get question display elements
     */
    getQuestionElements() {
        return this.displayManager.getQuestionElements();
    }

    /**
     * Setup question containers based on question type
     */
    setupQuestionContainers(data) {
        let optionsContainer = null;

        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) {
            optionsContainer = this.setupPlayerContainers(data);
        } else {
            logger.debug('Host mode');
        }

        return optionsContainer;
    }

    /**
     * Setup player containers based on question type
     */
    setupPlayerContainers(data) {
        logger.debug('Player mode - setting up containers');

        // Hide all answer type containers
        dom.queryAll('.player-answer-type').forEach(type => type.classList.add('hidden'));

        // Get container configuration from registry
        const config = QuestionTypeRegistry.getPlayerContainerConfig(data.type);
        if (!config) {
            logger.warn('Unknown question type:', data.type);
            return null;
        }

        const container = dom.get(config.containerId);
        logger.debug(`${config.containerId} found:`, !!container);

        if (container) {
            container.classList.remove('hidden');
            const optionsContainer = container.querySelector(config.optionsSelector);
            logger.debug('Player optionsContainer set to:', optionsContainer);
            return optionsContainer;
        }

        return null;
    }

    /**
     * Finalize question display with common actions
     */
    finalizeQuestionDisplay(data) {
        logger.debug('Finalizing question display');

        // Play question start sound
        if (this.soundManager?.isSoundsEnabled()) {
            this.soundManager.playQuestionStartSound();
        }

        // Store current question data
        this.currentQuestion = data;

        // Trigger mobile layout adaptation for content-aware display
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('question-content-updated', {
                detail: { questionData: data, isHost: this.stateManager.getGameState().isHost }
            }));
        }, 250); // Delay to ensure DOM and MathJax rendering is complete
    }

    /**
     * Update the question counter display (host)
     */
    updateQuestionCounter(current, total) {
        this.displayManager.updateQuestionCounter(current, total);
    }

    /**
     * Update the question counter display (player)
     */
    updatePlayerQuestionCounter(current, total) {
        this.displayManager.updatePlayerQuestionCounter(current, total);
    }

    /**
     * Submit multiple correct answer
     */
    submitMultipleCorrectAnswer() {
        this.interactionManager.submitMultipleCorrectAnswer();
    }

    /**
     * Handle player selecting an answer
     */
    selectAnswer(answer) {
        this.interactionManager.selectAnswer(answer);
    }

    /**
     * Highlight selected answer and disable options (from monolithic version)
     */
    highlightSelectedAnswer(answer) {
        logger.debug('Highlighting selected answer:', answer);

        // Handle multiple choice options
        const options = document.querySelectorAll('.player-option');
        options.forEach(option => {
            option.disabled = true;
            option.classList.remove('selected');
            option.classList.add('disabled');
        });

        if (typeof answer === 'number' && options[answer]) {
            options[answer].classList.add('selected');
            logger.debug('Added selected class to option:', answer);
        }

        // Handle true/false options
        const tfOptions = document.querySelectorAll('.true-btn, .false-btn');
        tfOptions.forEach(option => {
            option.disabled = true;
            option.classList.remove('selected');
        });

        // Find and highlight the selected true/false option
        if (typeof answer === 'boolean') {
            // Convert boolean back to index for UI highlighting: true = 0, false = 1
            const index = answer === true ? 0 : 1;
            const selectedTFOption = document.querySelector(`[data-answer="${index}"]`);
            if (selectedTFOption && selectedTFOption.classList.contains('tf-option')) {
                selectedTFOption.classList.add('selected');
                logger.debug('Added selected class to T/F option:', answer, 'at index:', index);
            }
        } else if (typeof answer === 'number') {
            const selectedTFOption = document.querySelector(`[data-answer="${answer}"]`);
            if (selectedTFOption && (selectedTFOption.classList.contains('true-btn') || selectedTFOption.classList.contains('false-btn'))) {
                selectedTFOption.classList.add('selected');
                logger.debug('Added selected class to T/F option:', answer);
            }
        }

        // Handle multiple correct checkboxes
        const checkboxes = document.querySelectorAll('.multiple-correct-option');
        checkboxes.forEach(checkbox => {
            checkbox.disabled = true;
        });
    }

    /**
     * Submit numeric answer
     */
    submitNumericAnswer() {
        this.interactionManager.submitNumericAnswer();
    }

    /**
     * Submit ordering answer
     */
    submitOrderingAnswer() {
        this.interactionManager.submitOrderingAnswer();
    }

    // ==================== POWER-UP METHODS ====================

    /**
     * Initialize power-ups for a new game
     * @param {boolean} enabled - Whether power-ups are enabled for this game
     */
    initializePowerUps(enabled) {
        this.powerUpManager.initialize(enabled);
        if (enabled) {
            this.powerUpManager.bindEventListeners();
        }
    }

    /**
     * Apply 50-50 power-up to current question - hides half of the wrong answers
     */
    applyFiftyFifty() {
        const currentQuestion = this.stateManager.getGameState().currentQuestion;
        if (!currentQuestion || currentQuestion.correctAnswer === undefined) {
            logger.warn('[GameManager] Cannot apply 50-50: no current question or correct answer');
            return;
        }

        this.powerUpManager.applyFiftyFiftyToOptions(currentQuestion.correctAnswer);
    }

    /**
     * Update power-up availability for new question
     * @param {string} questionType - Type of current question
     */
    updatePowerUpsForQuestion(questionType) {
        if (!this.powerUpManager.enabled) return;

        this.powerUpManager.resetFiftyFiftyOptions();
        this.powerUpManager.updateFiftyFiftyAvailability(questionType);
    }

    /** @returns {PowerUpManager} */
    getPowerUpManager() {
        return this.powerUpManager;
    }

    /** @returns {number} Points multiplier (1 or 2) */
    getPointsMultiplier() {
        return this.powerUpManager.getPointsMultiplier();
    }

    /** Consume double points after scoring */
    consumeDoublePoints() {
        this.powerUpManager.consumeDoublePoints();
    }

    // ==================== END POWER-UP METHODS ====================

    // Answer submission feedback now handled by GameDisplayManager

    /**
     * Show player result (correct/incorrect) using modal feedback system
     */
    showPlayerResult(data) {
        return errorBoundary.safeExecute(() => {
            const gameState = this.stateManager.getGameState();

            // Prevent multiple displays of same result
            if (gameState.resultShown) {
                logger.debug('Result already shown, skipping');
                return;
            }
            this.stateManager.markResultShown();

            const isCorrect = data.isCorrect !== undefined ? data.isCorrect : data.correct;
            const earnedPoints = data.points || 0;
            const explanation = data.explanation || null;
            const partialScore = data.partialScore; // For ordering questions with partial credit

            // Determine if this is a partial correct (ordering question with some but not all correct)
            const isPartiallyCorrect = !isCorrect && partialScore !== undefined && partialScore > 0;

            // Prepare feedback message
            let feedbackMessage;
            if (isCorrect) {
                feedbackMessage = getTranslation('correct_answer_msg');
            } else if (isPartiallyCorrect) {
                feedbackMessage = getTranslation('partially_correct') || 'Partially Correct!';
            } else {
                feedbackMessage = getTranslation('incorrect_answer_msg');
            }

            // Add total score to message if available
            if (earnedPoints > 0 && data.totalScore !== undefined) {
                feedbackMessage += ` (+${earnedPoints} ${getTranslation('points')})`;
            }

            // Extend display time if explanation is present
            const displayDuration = explanation ? TIMING.RESULT_DISPLAY_DURATION + 2000 : TIMING.RESULT_DISPLAY_DURATION;

            // Show modal feedback instead of inline feedback
            if (isCorrect) {
                modalFeedback.showCorrect(feedbackMessage, earnedPoints, displayDuration, explanation);
            } else if (isPartiallyCorrect) {
                modalFeedback.showPartial(feedbackMessage, earnedPoints, displayDuration, explanation, partialScore);
            } else {
                modalFeedback.showIncorrect(feedbackMessage, earnedPoints, displayDuration, explanation);
            }

            // Show correct answer if player was wrong (preserve existing functionality)
            if (!isCorrect && (data.correctAnswer !== undefined || data.correctAnswers !== undefined)) {
                // Delay to allow modal to appear first
                setTimeout(() => {
                    // Handle multiple-correct questions (array) or single answer
                    const correctData = data.correctAnswers !== undefined ? data.correctAnswers : data.correctAnswer;
                    this.showCorrectAnswerOnClient(correctData, data.questionType || data.type);
                }, 500);
            }

            // Play result sound
            if (isCorrect) {
                if (this.soundManager?.isSoundsEnabled()) {
                    this.soundManager.playCorrectAnswerSound();
                }
            } else if (isPartiallyCorrect) {
                // Play a different sound for partial - use correct sound but it's not as celebratory
                if (this.soundManager?.isSoundsEnabled()) {
                    this.soundManager.playCorrectAnswerSound();
                }
            } else {
                if (this.soundManager?.isSoundsEnabled()) {
                    this.soundManager.playIncorrectAnswerSound();
                }
            }

        }, {
            type: 'game_logic',
            operation: 'player_result',
            playerId: data.playerId
        }, () => {
            // Fallback: show basic modal feedback
            logger.error('Failed to show player result, using fallback modal');
            modalFeedback.show(false, 'Error displaying result', null, 2000);
        });
    }

    // ==================== ANSWER REVEAL METHODS (delegated to AnswerRevealManager) ====================

    /**
     * Show answer submitted feedback using modal system
     */
    showAnswerSubmitted(answer) {
        this.answerRevealManager.showAnswerSubmitted(answer);
    }

    /**
     * Format answer value for display based on type
     */
    formatAnswerForDisplay(answer) {
        return this.answerRevealManager.formatAnswerForDisplay(answer);
    }

    /**
     * Show answer rejected feedback using modal system
     */
    showAnswerRejected(message) {
        this.answerRevealManager.showAnswerRejected(message);
    }

    /**
     * Show correct answer on client side when player was wrong
     */
    showCorrectAnswerOnClient(correctAnswer, questionType) {
        this.answerRevealManager.showCorrectAnswerOnClient(correctAnswer, questionType);
    }

    /**
     * Apply correct answer styling to an element
     */
    applyCorrectAnswerStyle(element) {
        this.answerRevealManager.applyCorrectAnswerStyle(element);
    }

    /**
     * Reset button states for new question (fix for answer input bug)
     */
    resetButtonStatesForNewQuestion() {
        logger.debug('Resetting button states for new question');

        // Reset selected answer
        this.selectedAnswer = null;

        // Clear player answers from previous question to prevent memory buildup
        // This is especially important for long games with many questions
        this.playerAnswers.clear();

        // Use centralized client selection clearing
        this.displayManager.clearClientSelections();

        logger.debug('Button states reset completed via centralized method');
    }

    /**
     * Clear previous question content to prevent flash during screen transitions
     */
    clearPreviousQuestionContent() {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;

        // Use centralized host content clearing from DisplayManager
        this.displayManager.clearHostQuestionContent(true); // true = show loading message
    }

    /**
     * Clean game elements of any MathJax contamination from loaded quizzes
     * This prevents conflicts when loaded quiz data has pre-processed MathJax content
     */
    cleanGameElementsForFreshRendering() {
        // Game elements that must be clean before MathJax rendering
        const gameElements = document.querySelectorAll([
            '#current-question',        // Host question display
            '#player-question-text',    // Player question display
            '.player-option',           // Player multiple choice options
            '.option-display',          // Host option displays
            '.tf-option',               // True/false options
            '.checkbox-option',         // Multiple correct options
            '.numeric-input-container'  // Numeric input area
        ].join(', '));

        gameElements.forEach(element => {
            if (element) {
                // SIMPLIFIED: Remove all MathJax containers that cause conflicts
                const existingMath = element.querySelectorAll('mjx-container');
                if (existingMath.length > 0) {
                    logger.debug('🧹 Removing existing MathJax containers');
                    existingMath.forEach(mjx => mjx.remove());
                }

                // Remove MathJax processing classes that could cause conflicts
                element.classList.remove('processing-math', 'math-ready', 'MathJax_Processed');

                // Remove any pointer-events none that might have been added
                if (element.style.pointerEvents === 'none') {
                    element.style.pointerEvents = '';
                }
            }
        });

        // Clear any lingering question images from previous questions
        this.clearAllQuestionImages();

        // Clear any lingering explanation from previous question
        const existingExplanation = document.querySelector('.question-explanation-display');
        if (existingExplanation) {
            existingExplanation.remove();
        }

        // Clear numeric correct answer display from previous question
        const existingNumericAnswer = document.querySelector('.numeric-correct-answer-display');
        if (existingNumericAnswer) {
            existingNumericAnswer.remove();
        }

        logger.debug('🧹 Cleaned game elements for fresh rendering');
    }

    /**
     * Clear all question images from both host and player displays
     */
    clearAllQuestionImages() {
        // Clear host question image
        const hostImageContainer = document.getElementById('question-image-display');
        if (hostImageContainer) {
            hostImageContainer.classList.add('hidden');
            const hostImg = hostImageContainer.querySelector('img');
            if (hostImg) {
                hostImg.src = '';
                hostImg.removeAttribute('src');
            }
        }

        // Clear player question image
        const playerImageContainer = document.getElementById('player-question-image');
        if (playerImageContainer) {
            playerImageContainer.classList.add('hidden');
            const playerImg = playerImageContainer.querySelector('img');
            if (playerImg) {
                playerImg.src = '';
                playerImg.removeAttribute('src');
            }
        }

        logger.debug('🖼️ Cleared all question images');
    }

    /**
     * Reset button styles (from monolithic version)
     */
    resetButtonStyles(options) {
        options.forEach(option => {
            option.classList.remove('correct-answer-highlight', 'host-correct-answer', 'hidden');
        });
    }

    /**
     * Highlight correct answers on host display (original monolithic style)
     */
    highlightCorrectAnswers(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;

        const questionType = data.questionType || data.type;
        const options = document.querySelectorAll('.option-display');

        if (questionType === 'multiple-choice') {
            // Support both correctAnswer and correctIndex (server may use either)
            const correctIdx = data.correctIndex ?? data.correctAnswer;
            if (options[correctIdx]) {
                this.applyHostCorrectStyle(options[correctIdx]);
            }
        } else if (questionType === 'true-false') {
            // For true-false, correctAnswer is a string ("true" or "false")
            // Convert to index: "true" = 0, "false" = 1
            const correctIndex = (data.correctAnswer === true || data.correctAnswer === 'true') ? 0 : 1;
            if (options[correctIndex]) {
                this.applyHostCorrectStyle(options[correctIndex]);
            }
        } else if (questionType === 'multiple-correct') {
            // Support both correctAnswers and correctIndices (server may use either)
            const correctIndices = data.correctIndices || data.correctAnswers || [];
            if (Array.isArray(correctIndices)) {
                correctIndices.forEach(index => {
                    if (options[index]) {
                        this.applyHostCorrectStyle(options[index]);
                    }
                });
            }
        }
    }

    /**
     * Apply correct answer styling to host display element (thicker border)
     */
    applyHostCorrectStyle(element) {
        if (!element) return;
        element.classList.add('host-correct-answer');
    }

    /**
     * Show correct answer (original monolithic style)
     */
    showCorrectAnswer(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;

        const questionType = data.questionType || data.type;

        if (questionType === 'numeric') {
            // Show numeric answer in options container (original style)
            this.showNumericCorrectAnswer(data.correctAnswer, data.tolerance);
        } else {
            // Highlight correct answers in the grid
            this.highlightCorrectAnswers(data);
        }

        // Show explanation if available
        if (data.explanation) {
            this.showExplanation(data.explanation);
        }
    }

    /**
     * Show explanation for the correct answer
     */
    showExplanation(explanation) {
        // Remove any existing explanation
        const existingExplanation = document.querySelector('.question-explanation-display');
        if (existingExplanation) {
            existingExplanation.remove();
        }

        // Show the explanation in the question display area
        const questionDisplay = document.getElementById('host-question-display');
        if (questionDisplay && explanation) {
            const explanationDiv = document.createElement('div');
            explanationDiv.className = 'question-explanation-display';

            // Create structure with textContent for safety, then allow MathJax to process
            const content = document.createElement('div');
            content.className = 'explanation-content';

            const icon = document.createElement('div');
            icon.className = 'explanation-icon';
            icon.textContent = '💡';

            const textDiv = document.createElement('div');
            textDiv.className = 'explanation-text';
            // Use textContent first for XSS safety, then replace with innerHTML for LaTeX
            // This is safe because the content comes from quiz data, not user input
            textDiv.innerHTML = escapeHtmlPreservingLatex(explanation);

            content.appendChild(icon);
            content.appendChild(textDiv);
            explanationDiv.appendChild(content);
            questionDisplay.appendChild(explanationDiv);

            // Render MathJax for the explanation text
            simpleMathJaxService.render([textDiv]).catch(err => {
                logger.warn('MathJax render error in explanation (non-blocking):', err);
            });
        }
    }


    /**
     * Show numeric correct answer in top frame
     */
    showNumericCorrectAnswer(correctAnswer, tolerance) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;

        // Remove any existing correct answer display
        const existingAnswer = document.querySelector('.numeric-correct-answer-display');
        if (existingAnswer) {
            existingAnswer.remove();
        }

        // Show the answer in the question display area (top frame)
        const questionDisplay = document.getElementById('host-question-display');
        if (questionDisplay) {
            let answerText = `${getTranslation('correct_answer')}: ${correctAnswer}`;
            if (tolerance) {
                answerText += ` (±${tolerance})`;
            }

            // Create the correct answer display
            const correctAnswerDiv = document.createElement('div');
            correctAnswerDiv.className = 'numeric-correct-answer-display';
            correctAnswerDiv.innerHTML = `
                <div class="numeric-correct-answer-content">
                    <div class="correct-icon">✅</div>
                    <div class="correct-text">${answerText}</div>
                </div>
            `;

            // Insert after the question content
            questionDisplay.appendChild(correctAnswerDiv);
        }

        // Hide the bottom options container for numeric questions
        const optionsContainer = document.getElementById('answer-options');
        if (optionsContainer) {
            optionsContainer.classList.add('hidden');
        }

        // Add class to hide the entire host-multiple-choice frame for numeric questions
        const hostMultipleChoice = document.getElementById('host-multiple-choice');
        if (hostMultipleChoice) {
            hostMultipleChoice.classList.add('numeric-question-type');
        }
    }

    /**
     * Update live answer count during question (real-time updates)
     */
    updateLiveAnswerCount(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost || !data) return;

        logger.debug('Live answer count update:', data);

        // Update response counts
        dom.setContent('responses-count', data.answeredPlayers || 0);
        dom.setContent('total-players', data.totalPlayers || 0);

        // Show the statistics container
        const container = document.getElementById('answer-statistics');
        if (container) {
            container.classList.remove('hidden');
        }
    }

    /**
     * Update answer statistics for host display
     */
    updateAnswerStatistics(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost || !data) return;

        logger.debug('Answer statistics data received:', data);
        logger.debug('Data structure:', {
            answeredPlayers: data.answeredPlayers,
            totalPlayers: data.totalPlayers,
            answerCounts: data.answerCounts,
            questionType: data.questionType || data.type
        });

        // Get existing statistics container
        const statisticsContainer = document.getElementById('answer-statistics');
        if (!statisticsContainer) {
            logger.warn('Answer statistics container not found in HTML');
            return;
        }

        // Show statistics container
        if (statisticsContainer) {
            statisticsContainer.classList.remove('hidden');

            // Update response counts
            dom.setContent('responses-count', data.answeredPlayers || 0);
            dom.setContent('total-players', data.totalPlayers || 0);

            // Update individual answer statistics
            const questionType = data.questionType || data.type;
            logger.debug('Question type:', questionType, 'Answer counts:', data.answerCounts);

            if (questionType === 'multiple-choice' || questionType === 'multiple-correct') {
                const optionCount = data.optionCount || Object.keys(data.answerCounts).length || 4;
                this.showMultipleChoiceStatistics(optionCount);
                for (let i = 0; i < optionCount; i++) {
                    const count = data.answerCounts[i] || 0;
                    logger.debug(`Updating option ${i}: ${count} answers`);
                    this.updateStatItem(i, count, data.answeredPlayers || 0);
                }
            } else if (questionType === 'true-false') {
                this.showTrueFalseStatistics();
                const trueCount = data.answerCounts['true'] || data.answerCounts[0] || 0;
                const falseCount = data.answerCounts['false'] || data.answerCounts[1] || 0;
                logger.debug(`True/False counts: true=${trueCount}, false=${falseCount}`);
                this.updateStatItem(0, trueCount, data.answeredPlayers || 0);
                this.updateStatItem(1, falseCount, data.answeredPlayers || 0);
            } else if (questionType === 'numeric') {
                this.showNumericStatistics(data.answerCounts);
            } else if (questionType === 'ordering') {
                this.showOrderingStatistics(data.answerCounts);
            }
        }
    }


    /**
     * Show statistics for multiple choice questions
     */
    showMultipleChoiceStatistics(optionCount) {
        this.showHostStatistics('multiple-choice', { optionCount });
    }

    /**
     * Show statistics for true/false questions
     */
    showTrueFalseStatistics() {
        this.showHostStatistics('true-false');
    }

    /**
     * Show statistics for numeric questions
     */
    showNumericStatistics(answerCounts) {
        this.showHostStatistics('numeric', { answerCounts });
    }

    /**
     * Show statistics for ordering questions
     */
    showOrderingStatistics(answerCounts) {
        this.showHostStatistics('ordering', { answerCounts });
    }

    /**
     * Create custom statistics display for numeric answers
     */
    createNumericStatisticsDisplay(answerCounts, sortedAnswers) {
        const statsContent = document.getElementById('stats-grid');
        if (!statsContent) return;

        // Create or update numeric stats display
        let numericStatsDiv = document.getElementById('numeric-stats-display');
        if (!numericStatsDiv) {
            numericStatsDiv = document.createElement('div');
            numericStatsDiv.id = 'numeric-stats-display';
            numericStatsDiv.className = 'numeric-stats-display';
            statsContent.appendChild(numericStatsDiv);
        }

        // Clear previous content
        numericStatsDiv.innerHTML = '';

        if (sortedAnswers.length === 0) {
            numericStatsDiv.innerHTML = `<div class="no-answers">${getTranslation('no_answers_yet')}</div>`;
            return;
        }

        // Show up to max common answers
        const maxDisplay = UI.MAX_NUMERIC_DISPLAY;
        const totalAnswers = Object.values(answerCounts).reduce((sum, count) => sum + count, 0);

        // Sort by count (descending) then by value (ascending)
        const sortedByCount = sortedAnswers.sort((a, b) => {
            const countDiff = answerCounts[b] - answerCounts[a];
            return countDiff !== 0 ? countDiff : parseFloat(a) - parseFloat(b);
        });

        const displayAnswers = sortedByCount.slice(0, maxDisplay);

        numericStatsDiv.innerHTML = `
            <div class="numeric-stats-header">
                <h4>${getTranslation('player_answers')}</h4>
            </div>
            <div class="numeric-answers-list">
                ${displayAnswers.map(answer => {
        const count = answerCounts[answer];
        const percentage = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
        return `
                        <div class="numeric-answer-item">
                            <span class="answer-value">${answer}</span>
                            <div class="answer-bar-container">
                                <div class="answer-bar" style="width: ${percentage}%"></div>
                                <span class="answer-count">${count}</span>
                            </div>
                        </div>
                    `;
    }).join('')}
                ${sortedAnswers.length > maxDisplay ? `
                    <div class="more-answers">
                        +${sortedAnswers.length - maxDisplay} ${getTranslation('more_answers')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Clear custom statistics displays (numeric and ordering) when switching question types
     */
    clearNumericStatisticsDisplay() {
        const numericStatsDiv = document.getElementById('numeric-stats-display');
        if (numericStatsDiv) {
            numericStatsDiv.remove();
        }
        const orderingStatsDiv = document.getElementById('ordering-stats-display');
        if (orderingStatsDiv) {
            orderingStatsDiv.remove();
        }
    }

    /**
     * Show statistics for host display - consolidated method
     * @param {string} type - Question type: 'multiple-choice', 'true-false', or 'numeric'
     * @param {Object} options - Configuration object
     * @param {number} [options.optionCount] - Number of options for multiple choice
     * @param {Object} [options.answerCounts] - Answer counts for numeric questions
     */
    showHostStatistics(type, options = {}) {
        const statsContent = document.getElementById('stats-grid');
        if (!statsContent) return;

        // Always clear numeric display first
        this.clearNumericStatisticsDisplay();

        switch (type) {
            case 'multiple-choice':
                this.setupMultipleChoiceStats(options.optionCount);
                break;
            case 'true-false':
                this.setupTrueFalseStats();
                break;
            case 'numeric':
                this.setupNumericStats(options.answerCounts);
                break;
            case 'ordering':
                this.setupOrderingStats(options.answerCounts);
                break;
            default:
                logger.warn('Unknown statistics type:', type);
        }
    }

    /**
     * Setup multiple choice statistics display
     */
    setupMultipleChoiceStats(optionCount) {
        for (let i = 0; i < UI.MAX_STAT_ITEMS; i++) {
            const statItem = document.getElementById(`stat-item-${i}`);
            const optionLabel = statItem?.querySelector('.option-label');

            if (statItem && optionLabel) {
                if (i < optionCount) {
                    statItem.classList.remove('hidden');
                    statItem.classList.add('visible-flex');
                    optionLabel.textContent = translationManager.getOptionLetter(i);
                    this.resetStatItemValues(statItem);
                } else {
                    statItem.classList.add('hidden');
                    statItem.classList.remove('visible-flex');
                }
            }
        }
    }

    /**
     * Setup true/false statistics display
     */
    setupTrueFalseStats() {
        const tfTexts = getTrueFalseText();
        for (let i = 0; i < UI.MAX_STAT_ITEMS; i++) {
            const statItem = document.getElementById(`stat-item-${i}`);
            const optionLabel = statItem?.querySelector('.option-label');

            if (statItem && optionLabel) {
                if (i === 0) {
                    statItem.classList.remove('hidden');
                    statItem.classList.add('visible-flex');
                    optionLabel.textContent = tfTexts.true;
                    this.resetStatItemValues(statItem);
                } else if (i === 1) {
                    statItem.classList.remove('hidden');
                    statItem.classList.add('visible-flex');
                    optionLabel.textContent = tfTexts.false;
                    this.resetStatItemValues(statItem);
                } else {
                    statItem.classList.add('hidden');
                    statItem.classList.remove('visible-flex');
                }
            }
        }
    }

    /**
     * Setup numeric statistics display
     */
    setupNumericStats(answerCounts) {
        // Hide all regular stat items
        for (let i = 0; i < UI.MAX_STAT_ITEMS; i++) {
            const statItem = document.getElementById(`stat-item-${i}`);
            if (statItem) {
                statItem.classList.add('hidden');
                statItem.classList.remove('visible-flex');
            }
        }

        // Create custom numeric display
        const answers = Object.keys(answerCounts || {});
        const sortedAnswers = answers.sort((a, b) => parseFloat(a) - parseFloat(b));
        this.createNumericStatisticsDisplay(answerCounts, sortedAnswers);
    }

    /**
     * Setup ordering statistics display (shows most common sequence orders)
     */
    setupOrderingStats(answerCounts) {
        // Hide all regular stat items
        for (let i = 0; i < UI.MAX_STAT_ITEMS; i++) {
            const statItem = document.getElementById(`stat-item-${i}`);
            if (statItem) {
                statItem.classList.add('hidden');
                statItem.classList.remove('visible-flex');
            }
        }

        // Show most common ordering sequences
        const statsGrid = document.getElementById('stats-grid');
        if (!statsGrid) return;

        let orderingDisplay = document.getElementById('ordering-stats-display');
        if (!orderingDisplay) {
            orderingDisplay = document.createElement('div');
            orderingDisplay.id = 'ordering-stats-display';
            orderingDisplay.className = 'numeric-stats-display';
            statsGrid.appendChild(orderingDisplay);
        }

        orderingDisplay.innerHTML = '';

        const orderKeys = Object.keys(answerCounts || {});
        if (orderKeys.length === 0) {
            orderingDisplay.innerHTML = `<div class="no-answers">${getTranslation('no_answers_yet')}</div>`;
            return;
        }

        // Sort by count (most common first)
        const sortedOrders = orderKeys.sort((a, b) => answerCounts[b] - answerCounts[a]);
        const maxCount = answerCounts[sortedOrders[0]] || 1;

        sortedOrders.slice(0, UI.MAX_STAT_ITEMS).forEach(orderKey => {
            try {
                const count = answerCounts[orderKey] || 0;
                const percentage = Math.round((count / maxCount) * 100);
                const orderIndices = JSON.parse(orderKey);
                // Convert indices to letters (A, B, C, etc.) for display
                const orderDisplay = orderIndices.map(idx => translationManager.getOptionLetter(idx)).join(' → ');

                const orderItem = document.createElement('div');
                orderItem.className = 'numeric-stat-item';
                orderItem.innerHTML = `
                    <div class="numeric-stat-label">${orderDisplay}</div>
                    <div class="numeric-stat-bar">
                        <div class="numeric-stat-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="numeric-stat-count">${count}</div>
                `;
                orderingDisplay.appendChild(orderItem);
            } catch (e) {
                logger.warn('Failed to parse ordering answer:', orderKey, e);
            }
        });
    }

    /**
     * Reset stat item values to defaults
     */
    resetStatItemValues(statItem) {
        const statCount = statItem.querySelector('.stat-count');
        const statFill = statItem.querySelector('.stat-fill');
        if (statCount) statCount.textContent = '0';
        if (statFill) statFill.style.width = '0%';
    }

    /**
     * Update individual statistic item
     */
    updateStatItem(index, count, totalAnswered) {
        const statCount = document.getElementById(`stat-count-${index}`);
        const statFill = document.getElementById(`stat-fill-${index}`);

        logger.debug(`updateStatItem: index=${index}, count=${count}, totalAnswered=${totalAnswered}`);

        if (statCount) {
            statCount.textContent = count;
            logger.debug(`Updated stat count for index ${index}: ${count}`);
        } else {
            logger.warn(`stat-count-${index} element not found`);
        }

        if (statFill) {
            if (totalAnswered > 0) {
                const percentage = (count / totalAnswered) * ANIMATION.PERCENTAGE_CALCULATION_BASE;
                statFill.style.width = `${percentage}%`;
                logger.debug(`Updated stat fill for index ${index}: ${percentage}%`);
            } else {
                statFill.style.width = '0%';
            }
        } else {
            logger.warn(`stat-fill-${index} element not found`);
        }
    }

    /**
     * Hide answer statistics
     */
    hideAnswerStatistics() {
        const statisticsContainer = document.getElementById('answer-statistics');
        if (statisticsContainer) {
            statisticsContainer.classList.add('hidden');
        }
    }

    // ==================== LEADERBOARD METHODS (delegated to LeaderboardManager) ====================

    /**
     * Show leaderboard
     */
    showLeaderboard(leaderboard) {
        this.leaderboardManager.showLeaderboard(leaderboard);
    }

    /**
     * Show final results
     */
    showFinalResults(leaderboard) {
        // Delegate to LeaderboardManager with callback for saving results
        this.leaderboardManager.showFinalResults(
            leaderboard,
            this.socket,
            (lb) => this.saveGameResults(lb)
        );
    }

    /**
     * Update leaderboard display
     */
    updateLeaderboardDisplay(leaderboard) {
        this.leaderboardManager.updateLeaderboardDisplay(leaderboard);
    }

    /**
     * Show player final screen
     */
    showPlayerFinalScreen(leaderboard) {
        this.leaderboardManager.showPlayerFinalScreen(leaderboard, this.socket);
    }

    /**
     * Update final leaderboard (top 3 players)
     */
    updateFinalLeaderboard(topPlayers) {
        this.leaderboardManager.updateFinalLeaderboard(topPlayers);
    }

    /**
     * Show game complete confetti
     */
    showGameCompleteConfetti() {
        this.leaderboardManager.showGameCompleteConfetti();
    }

    /**
     * Play game ending fanfare
     */
    playGameEndingFanfare() {
        this.leaderboardManager.playGameEndingFanfare();
    }

    /**
     * Update players list
     */
    updatePlayersList(players) {
        logger.debug('updatePlayersList called with:', players);
        const playersListElement = document.getElementById('players-list');
        logger.debug('playersListElement found:', !!playersListElement);
        if (!playersListElement) {
            logger.debug('players-list element not found');
            return;
        }

        // Handle case where players is undefined or not an array
        if (!players || !Array.isArray(players)) {
            logger.debug('Players list is undefined or not an array:', players);
            return;
        }

        playersListElement.innerHTML = '';

        players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            playerElement.innerHTML = `
                <div class="player-avatar">👤</div>
                <div class="player-name">${escapeHtml(player.name)}</div>
            `;
            playersListElement.appendChild(playerElement);
        });

        // Update player count in lobby with animation
        const lobbyPlayerCount = document.getElementById('lobby-player-count');
        if (lobbyPlayerCount) {
            // Add a simple scale animation for number changes
            const currentCount = parseInt(lobbyPlayerCount.textContent) || 0;
            const newCount = players.length;

            if (currentCount !== newCount) {
                lobbyPlayerCount.classList.add('scale-pulse');
                setTimeout(() => {
                    lobbyPlayerCount.textContent = newCount;
                }, 150);
                // Remove class after animation completes so it can be triggered again
                setTimeout(() => {
                    lobbyPlayerCount.classList.remove('scale-pulse');
                }, 300);
            }
        }

        // Update legacy player count (for compatibility) - but check if element exists
        const legacyPlayerCount = document.getElementById('player-count');
        if (legacyPlayerCount) {
            dom.setContent('player-count', players.length);
        }
    }

    /**
     * Update timer display
     */
    updateTimerDisplay(timeRemaining) {
        this.timerManager.updateTimerDisplay(timeRemaining);
    }

    /**
     * Start game timer with countdown sounds
     */
    startTimer(duration, onTick = null, onComplete = null) {
        // Wrap tick callback to include countdown sounds
        const tickWithSound = (timeRemaining) => {
            const seconds = Math.ceil(timeRemaining / 1000);

            // Play countdown sounds for 5, 3, 2, 1 seconds (check mute state at playback time)
            if (this.soundManager?.isSoundsEnabled()) {
                this.soundManager.playCountdownTick(seconds);
            }

            // Call original tick callback if provided
            if (onTick) {
                onTick(timeRemaining);
            }
        };

        // Wrap complete callback to play timer expired sound
        const completeWithSound = () => {
            if (this.soundManager?.isSoundsEnabled()) {
                this.soundManager.playTimerExpired();
            }

            if (onComplete) {
                onComplete();
            }
        };

        return this.timerManager.startTimer(duration, tickWithSound, completeWithSound);
    }

    /**
     * Stop game timer
     */
    stopTimer() {
        this.timerManager.stopTimer();
    }

    /**
     * Reset game state
     */
    resetGameState() {
        // IMPORTANT: Preserve this.currentQuiz for analytics - DON'T reset it here!
        // The currentQuiz data contains question metadata needed for detailed analytics
        logger.debug('🔄 Resetting game state. Preserving currentQuiz for analytics:', {
            hasCurrentQuiz: !!this.currentQuiz,
            questionsCount: this.currentQuiz?.questions?.length
        });

        this.currentQuestion = null;
        this.selectedAnswer = null;
        this.playerAnswers.clear();
        // gameEnded/resultShown now handled by stateManager.reset() below
        this.stopTimer();

        // CRITICAL FIX: Reset the modular state manager too!
        // This was causing the new game restart bug where stale state from
        // previous games would interfere with new games
        this.stateManager.reset();

        // Reset all game modules to ensure clean state for new games
        if (this.interactionManager) {
            this.interactionManager.reset();
        }
        // Timer is already reset by this.stopTimer() call above

        // Reset fanfare played flag for new games
        this.fanfarePlayed = false;

        // Hide the CSV download tool from previous game
        simpleResultsDownloader.hideDownloadTool();

        // Hide final results overlay from previous game
        const finalResults = document.getElementById('final-results');
        if (finalResults) {
            finalResults.classList.add('hidden');
            finalResults.classList.remove('game-complete-animation');
        }

        // 🔧 FIX: Clear player list UI to prevent phantom players from previous game
        const playersListElement = document.getElementById('players-list');
        if (playersListElement) {
            playersListElement.innerHTML = '';
            logger.debug('🧹 Cleared player list UI during game reset');
        }

        // Reset player count displays
        const lobbyPlayerCount = document.getElementById('lobby-player-count');
        if (lobbyPlayerCount) {
            lobbyPlayerCount.textContent = '0';
        }
        const legacyPlayerCount = document.getElementById('player-count');
        if (legacyPlayerCount) {
            legacyPlayerCount.textContent = '0';
        }

        // Clean up event listeners and timers when resetting game
        this.cleanup();

        logger.debug('🔄 Complete game state reset - both main and modular state managers');
    }

    /**
     * Set player info
     */
    setPlayerInfo(name, isHost = false) {
        this.stateManager.setPlayerName(name);
        this.stateManager.setHostMode(isHost);
        logger.debug('PlayerInfo', { name, isHost });
    }

    /**
     * Get player name from state manager
     */
    get playerName() {
        return this.stateManager.playerName;
    }

    /**
     * Set game pin
     */
    setGamePin(pin) {
        this.stateManager.setGamePin(pin);
    }

    /**
     * Set quiz title for results saving
     */
    setQuizTitle(title) {
        this.currentQuizTitle = title;
        logger.debug('Quiz title set:', title);
    }

    /**
     * Set quiz data for results export
     */
    setQuizData(quiz) {
        logger.debug('📊 setQuizData called:', {
            hasQuiz: !!quiz,
            questionsCount: quiz?.questions?.length,
            quizTitle: quiz?.title,
            quizId: quiz?.id
        });
        this.currentQuiz = quiz;

        // Store quiz title separately as backup for results
        if (quiz?.title) {
            this.currentQuizTitle = quiz.title;
        }

        logger.debug('📊 currentQuiz set successfully - analytics data preserved');
    }

    /**
     * Mark game start time for results saving
     */
    markGameStartTime() {
        this.gameStartTime = new Date().toISOString();
        logger.debug('Game start time marked:', this.gameStartTime);
    }

    // ==================== MEMORY MANAGEMENT METHODS ====================
    // Delegated to EventListenerManager for centralized tracking

    /**
     * Add event listener with automatic tracking for cleanup
     */
    addEventListenerTracked(element, event, handler, options = {}) {
        this.listenerManager.addEventListenerTracked(element, event, handler, options);
    }

    /**
     * Create timer with automatic tracking for cleanup
     */
    createTimerTracked(callback, interval, isInterval = false) {
        return isInterval
            ? this.listenerManager.createInterval(callback, interval)
            : this.listenerManager.createTimeout(callback, interval);
    }

    /**
     * Remove tracked event listener
     */
    removeEventListenerTracked(element, event, handler) {
        this.listenerManager.removeEventListenerTracked(element, event, handler);
    }

    /**
     * Clear specific timer
     */
    clearTimerTracked(timer) {
        this.listenerManager.clearTimerTracked(timer);
    }

    /**
     * Comprehensive cleanup method - removes all tracked event listeners, timers, and references
     */
    cleanup() {
        logger.debug('GameManager cleanup started');

        try {
            // Delegate to EventListenerManager for listener/timer cleanup
            this.listenerManager.cleanup();

            // Clear game state
            this.playerAnswers.clear();
            this.currentQuestion = null;
            this.selectedAnswer = null;

            // Clear main timer if it exists
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }

            // Clean up power-ups
            if (this.powerUpManager) {
                this.powerUpManager.cleanup();
            }

            // Remove page unload listeners
            if (typeof window !== 'undefined') {
                window.removeEventListener('beforeunload', this.cleanup);
                window.removeEventListener('unload', this.cleanup);
            }

            logger.debug('GameManager cleanup completed successfully');
        } catch (error) {
            logger.error('Error during GameManager cleanup:', error);
        }
    }

    /**
     * Safe DOM manipulation that doesn't destroy event listeners
     */
    safeSetContent(element, content) {
        if (!element) return;

        // Clear existing content while preserving structure
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }

        // Set new content
        if (typeof content === 'string') {
            element.innerHTML = content;
        } else if (content && content.nodeType) {
            element.appendChild(content);
        }
    }

    /**
     * Create element with tracked event listeners
     */
    createElementWithEvents(tagName, attributes = {}, events = {}) {
        const element = document.createElement(tagName);

        // Set attributes
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else {
                element.setAttribute(key, value);
            }
        });

        // Add tracked event listeners
        Object.entries(events).forEach(([event, handler]) => {
            this.addEventListenerTracked(element, event, handler);
        });

        return element;
    }

    // ==================== ERROR STATE METHODS ====================

    /**
     * Show error state when question display fails
     */
    showQuestionErrorState() {
        try {
            const containers = ['current-question', 'player-question-text'];
            containers.forEach(containerId => {
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = `
                        <div class="error-state">
                            <p>⚠️ ${getTranslation('question_load_error')}</p>
                            <p>Please wait for the next question...</p>
                        </div>
                    `;
                }
            });

            // Hide all option containers
            document.querySelectorAll('.player-options, .answer-options').forEach(container => {
                container.classList.add('hidden');
            });
        } catch (error) {
            logger.error('Failed to show question error state:', error);
        }
    }

    /**
     * Show error state when player result display fails
     */
    showResultErrorState() {
        try {
            const resultElement = document.getElementById('answer-feedback');
            if (resultElement) {
                resultElement.classList.remove('hidden');
                resultElement.classList.add('error-bg');

                const messageElement = document.getElementById('feedback-message');
                if (messageElement) {
                    messageElement.textContent = '⚠️ Result display error';
                }

                // Hide after delay and clean up
                setTimeout(() => {
                    resultElement.classList.add('hidden');
                    resultElement.classList.remove('error-bg');
                }, 3000);
            }
        } catch (error) {
            logger.error('Failed to show result error state:', error);
        }
    }

    /**
     * Set static timer display when timer fails
     */
    setStaticTimerDisplay(seconds) {
        this.timerManager.setStaticTimerDisplay(seconds);
    }

    // ===============================
    // DEBUG METHODS - Call from browser console
    // ===============================

    /**
     * Debug game state - call debugGame() from console
     */


    /**
     * Debug MathJax state - call debugMathJax() from console
     */


    /**
     * Debug LaTeX elements - call debugLatex() from console
     */


    /**
     * Save game results to server for later download
     */
    async saveGameResults(leaderboard) {
        try {
            const gameState = this.stateManager.getGameState();

            // Only save results if we're the host and have game data
            if (!gameState.isHost || !gameState.gamePin) {
                logger.debug('📊 Not saving results - not host or no game PIN');
                return;
            }

            // Get quiz title from the game data (if available)
            const quizTitle = this.currentQuizTitle || gameState.quizTitle || 'Unknown Quiz';

            // Prepare results data for saving
            const resultsData = {
                quizTitle: quizTitle,
                gamePin: gameState.gamePin,
                results: leaderboard || [],
                startTime: this.gameStartTime || new Date().toISOString(),
                endTime: new Date().toISOString()
            };

            // Debug: Check what quiz data we have
            logger.debug('📊 Quiz data debug:', {
                hasCurrentQuiz: !!this.currentQuiz,
                currentQuizKeys: this.currentQuiz ? Object.keys(this.currentQuiz) : null,
                hasQuestions: !!(this.currentQuiz && this.currentQuiz.questions),
                questionsLength: this.currentQuiz?.questions?.length,
                sampleQuestion: this.currentQuiz?.questions?.[0]
            });

            // Add questions data if available for detailed analytics
            if (this.currentQuiz && this.currentQuiz.questions) {
                logger.debug('📊 Including questions data for analytics:', this.currentQuiz.questions.length, 'questions');
                resultsData.questions = this.currentQuiz.questions.map((q, index) => ({
                    questionNumber: index + 1,
                    text: q.question || q.text,
                    type: q.type || 'multiple-choice',
                    correctAnswer: q.correctAnswer,
                    correctAnswers: q.correctAnswers,
                    correctOrder: q.correctOrder,
                    options: q.options,
                    difficulty: q.difficulty || 'medium',
                    timeLimit: q.time
                }));
            } else {
                logger.debug('📊 No questions data available - CSV will use basic format');
            }

            logger.debug('📊 Saving game results:', {
                quizTitle: resultsData.quizTitle,
                gamePin: resultsData.gamePin,
                playerCount: resultsData.results.length
            });

            // Save results to server
            const response = await fetch(APIHelper.getApiUrl('api/save-results'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(resultsData)
            });

            if (response.ok) {
                const result = await response.json();
                logger.debug('📊 Results saved successfully:', result.filename);
            } else {
                const errorText = await response.text();
                logger.error('📊 Failed to save results:', response.status, errorText);
            }

        } catch (error) {
            logger.error('📊 Error saving game results:', error);
        }
    }
}