/**
 * Game Manager Module
 * Handles game flow, question display, player results, and game state management
 */

import { translationManager, getTranslation } from '../utils/translation-manager.js';
import { TIMING, logger } from '../core/config.js';
// MathRenderer and mathJaxService now handled by GameDisplayManager
import { simpleMathJaxService } from '../utils/simple-mathjax-service.js';
import { dom, escapeHtml, escapeHtmlPreservingLatex, hide } from '../utils/dom.js';
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
import { ConsensusManager } from './modules/consensus-manager.js';
import { DiscussionManager } from './modules/discussion-manager.js';
import { StatisticsManager } from './modules/statistics-manager.js';

export class GameManager {
    constructor(socket, uiManager, soundManager, socketManager = null) {
        this.socket = socket;
        this.uiManager = uiManager;
        this.soundManager = soundManager;
        this.socketManager = socketManager;
        // MathRenderer now handled by GameDisplayManager
        this.displayManager = new GameDisplayManager(uiManager);
        this.stateManager = new ModularGameStateManager();
        this.timerManager = new TimerManager(soundManager);
        this.statisticsManager = new StatisticsManager(this.stateManager);
        this.interactionManager = new PlayerInteractionManager(this.stateManager, this.displayManager, soundManager, socketManager);
        // Setup player interaction event listeners (click handlers for answer selection)
        this.interactionManager.setupEventListeners();
        this.questionRenderer = new QuestionRenderer(this.displayManager, this.stateManager, uiManager, this);
        this.answerRevealManager = new AnswerRevealManager(this.stateManager, this.displayManager);
        this.leaderboardManager = new LeaderboardManager(this.stateManager, uiManager, soundManager);
        this.powerUpManager = new PowerUpManager();
        this.consensusManager = new ConsensusManager(this.stateManager, socketManager);
        this.discussionManager = new DiscussionManager(this.stateManager, socketManager);

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

        // Reset consensus mode for new question
        this.resetConsensusForQuestion();

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

    // ==================== CONSENSUS MODE METHODS ====================

    /**
     * Initialize consensus mode for a new game
     * @param {Object} config - Consensus configuration from game settings
     */
    initializeConsensusMode(config) {
        if (!config || !config.enabled) {
            this.consensusManager.reset();
            this.discussionManager.reset();
            return;
        }

        this.consensusManager.initialize({
            threshold: config.threshold,
            allowChat: config.allowChat
        });
        this.discussionManager.initialize(config.allowChat);

        // Bind event listeners
        this.consensusManager.bindEventListeners();

        logger.debug('Consensus mode initialized', config);
    }

    /**
     * Reset consensus for new question
     */
    resetConsensusForQuestion() {
        if (this.consensusManager.enabled) {
            this.consensusManager.resetForQuestion();
            this.discussionManager.resetForQuestion();
        }
    }

    /**
     * Get consensus manager instance
     * @returns {ConsensusManager}
     */
    getConsensusManager() {
        return this.consensusManager;
    }

    /**
     * Get discussion manager instance
     * @returns {DiscussionManager}
     */
    getDiscussionManager() {
        return this.discussionManager;
    }

    // ==================== END CONSENSUS MODE METHODS ====================

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

            // No auto-dismiss when explanation is present — stays until next question or user tap
            const displayDuration = explanation ? 0 : TIMING.RESULT_DISPLAY_DURATION;

            // Show modal feedback instead of inline feedback
            if (isCorrect) {
                modalFeedback.showCorrect(feedbackMessage, earnedPoints, displayDuration, explanation);
            } else if (isPartiallyCorrect) {
                modalFeedback.showPartial(feedbackMessage, earnedPoints, displayDuration, explanation, partialScore);
            } else {
                modalFeedback.showIncorrect(feedbackMessage, earnedPoints, displayDuration, explanation);
            }

            // Show the player's submitted answer inside the modal
            const playerAnswers = this.stateManager.getPlayerAnswers();
            const storedAnswer = playerAnswers.get(gameState.playerName);
            if (storedAnswer !== undefined) {
                const answerText = this.answerRevealManager.formatAnswerForDisplay(storedAnswer);
                modalFeedback.setPlayerAnswer(answerText);
            }

            // Show correct answer to ALL players (not just wrong ones) after a short delay
            if (data.correctAnswer !== undefined || data.correctAnswers !== undefined) {
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
        const hostImageContainer = dom.get('question-image-display');
        if (hostImageContainer) {
            hostImageContainer.classList.add('hidden');
            const hostImg = hostImageContainer.querySelector('img');
            if (hostImg) {
                hostImg.src = '';
                hostImg.removeAttribute('src');
            }
        }

        // Clear player question image
        const playerImageContainer = dom.get('player-question-image');
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
     * Highlight correct answers on host display (original monolithic style)
     */
    highlightCorrectAnswers(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;

        const questionType = data.questionType || data.type;
        // Scoped to the host screen: `.option-display` also exists in the editor
        // preview and the player view, and an unscoped query indexes into
        // whichever look-alike tiles happen to be in the DOM.
        const options = document.querySelectorAll('#host-game-screen .option-display');

        if (questionType === 'multiple-choice') {
            // Support both correctAnswer and correctIndex (server may use either)
            const correctIdx = data.correctIndex ?? data.correctAnswer;
            if (options[correctIdx]) {
                this.applyHostCorrectStyle(options[correctIdx]);
            }
        } else if (questionType === 'true-false') {
            // Host T/F tiles are `.tf-option[data-answer]`, not `.option-display`
            // (see renderHostOptions in question-type-registry.js and updateStatItem below)
            const answer = (data.correctAnswer === true || data.correctAnswer === 'true') ? 'true' : 'false';
            const tile = document.querySelector(`#answer-options .tf-option[data-answer="${answer}"]`);
            this.applyHostCorrectStyle(tile);
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
        } else if (questionType === 'ordering') {
            this.revealHostOrdering(data.correctOrder);
        }
    }

    /**
     * Reveal the correct sequence of an ordering question on the host screen.
     * The host tiles are rendered in a random order (renderHostOptions in
     * question-type-registry.js) and nobody drags them there, so the reveal
     * reorders them into the correct sequence, renumbers the badges, and rings
     * each tile — correctness by FORM, not hue.
     * @param {number[]} correctOrder - Canonical option indices in correct order
     */
    revealHostOrdering(correctOrder) {
        if (!Array.isArray(correctOrder) || correctOrder.length === 0) {
            logger.warn('Ordering reveal skipped: no correctOrder in payload');
            return;
        }

        const container = document.querySelector('#host-game-screen .ordering-display');
        if (!container) return;

        const byOriginalIndex = new Map();
        container.querySelectorAll('.ordering-display-item').forEach(item => {
            byOriginalIndex.set(Number(item.dataset.originalIndex), item);
        });

        correctOrder.forEach((originalIndex, position) => {
            const item = byOriginalIndex.get(Number(originalIndex));
            if (!item) return;

            const number = item.querySelector('.ordering-item-number');
            if (number) number.textContent = String(position + 1);
            item.dataset.orderIndex = String(position);
            item.classList.add('host-correct-order');
            container.appendChild(item); // moves the tile into correct-order position
        });
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
        const questionDisplay = dom.get('host-question-display');
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
        const questionDisplay = dom.get('host-question-display');
        if (questionDisplay) {
            let answerText = `${getTranslation('correct_answer')}: ${escapeHtml(String(correctAnswer))}`;
            if (tolerance) {
                answerText += ` (±${escapeHtml(String(tolerance))})`;
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
        const optionsContainer = dom.get('answer-options');
        if (optionsContainer) {
            optionsContainer.classList.add('hidden');
        }

        // Add class to hide the entire host-multiple-choice frame for numeric questions
        const hostMultipleChoice = dom.get('host-multiple-choice');
        if (hostMultipleChoice) {
            hostMultipleChoice.classList.add('numeric-question-type');
        }
    }

    /**
     * Update live answer count during question (real-time updates)
     */
    updateLiveAnswerCount(data) {
        this.statisticsManager.updateLiveAnswerCount(data);
    }

    /**
     * Update answer statistics for host display
     */
    updateAnswerStatistics(data) {
        this.statisticsManager.updateAnswerStatistics(data);
    }

    /**
     * Render score breakdown for host display
     */
    renderHostBreakdown(scoringInfo) {
        this.statisticsManager.renderHostBreakdown(scoringInfo);
    }

    /**
     * Show statistics for multiple choice questions
     */
    showMultipleChoiceStatistics(optionCount) {
        this.statisticsManager.showMultipleChoiceStatistics(optionCount);
    }

    /**
     * Show statistics for true/false questions
     */
    showTrueFalseStatistics() {
        this.statisticsManager.showTrueFalseStatistics();
    }

    /**
     * Show statistics for numeric questions
     */
    showNumericStatistics(answerCounts) {
        this.statisticsManager.showNumericStatistics(answerCounts);
    }

    /**
     * Show statistics for ordering questions
     */
    showOrderingStatistics(answerCounts) {
        this.statisticsManager.showOrderingStatistics(answerCounts);
    }

    /**
     * Create custom statistics display for numeric answers
     */
    createNumericStatisticsDisplay(answerCounts, sortedAnswers) {
        this.statisticsManager.createNumericStatisticsDisplay(answerCounts, sortedAnswers);
    }

    /**
     * Clear custom statistics displays (numeric and ordering) when switching question types
     */
    clearNumericStatisticsDisplay() {
        this.statisticsManager.clearNumericStatisticsDisplay();
    }

    /**
     * Show statistics for host display - consolidated method
     */
    showHostStatistics(type, options = {}) {
        this.statisticsManager.showHostStatistics(type, options);
    }

    /**
     * Setup multiple choice statistics display
     */
    setupMultipleChoiceStats(optionCount) {
        this.statisticsManager.setupMultipleChoiceStats(optionCount);
    }

    /**
     * Setup true/false statistics display
     */
    setupTrueFalseStats() {
        this.statisticsManager.setupTrueFalseStats();
    }

    /**
     * Setup numeric statistics display
     */
    setupNumericStats(answerCounts) {
        this.statisticsManager.setupNumericStats(answerCounts);
    }

    /**
     * Setup ordering statistics display (shows most common sequence orders)
     */
    setupOrderingStats(answerCounts) {
        this.statisticsManager.setupOrderingStats(answerCounts);
    }

    /**
     * Reset stat item values to defaults
     */
    resetStatItemValues(statItem) {
        this.statisticsManager.resetStatItemValues(statItem);
    }

    /**
     * Update individual statistic item
     */
    updateStatItem(index, count, totalAnswered) {
        this.statisticsManager.updateStatItem(index, count, totalAnswered);
    }

    /**
     * Hide answer statistics
     */
    hideAnswerStatistics() {
        this.statisticsManager.hideAnswerStatistics();
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
     * @param {Array} leaderboard - Final leaderboard data
     * @param {Object} [conceptMastery] - Optional personal concept mastery data for players
     */
    showFinalResults(leaderboard, conceptMastery = null) {
        // Delegate to LeaderboardManager with callback for saving results
        this.leaderboardManager.showFinalResults(
            leaderboard,
            this.socket,
            (lb) => this.saveGameResults(lb),
            conceptMastery
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
        const playersListElement = dom.get('players-list');
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

        const chipColors = [
            'var(--option-0-start)',
            'var(--option-1-start)',
            'var(--option-2-start)',
            'var(--option-3-start)',
            'var(--option-4-start)',
            'var(--option-5-start)'
        ];

        // Empty roster: a dashed "waiting" chip rather than a blank card. The
        // lobby card is ~500px tall, so with no players at all the card read as
        // a rendering failure. textContent, not innerHTML — this is plain text.
        //
        // It reuses `.player-item` for the chip geometry, so it is picked up by
        // a bare `.player-item` query. ANY code counting players must filter
        // `:not(.placeholder)` — this already broke the visual suite's
        // waitForPlayerCount, which resolved instantly at zero players.
        if (players.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'player-item placeholder placeholder-full';
            placeholder.textContent =
                getTranslation('waiting_for_players') || 'Waiting for players...';
            playersListElement.appendChild(placeholder);
        }

        players.forEach((player, idx) => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            const color = chipColors[idx % chipColors.length];
            playerElement.style.setProperty('--chip-color', color);
            const name = player.name || '';
            // Array.from iterates by code point so surrogate pairs (astral
            // plane letters) aren't split — charAt(0) would return an
            // unpaired high surrogate that renders as a replacement glyph.
            const initial = Array.from(name.trim())[0] || '•';
            playerElement.innerHTML = `
                <span class="player-avatar ed-serif" aria-hidden="true">${escapeHtml(initial)}</span>
                <span class="player-name">${escapeHtml(name)}</span>
            `;
            playersListElement.appendChild(playerElement);
        });

        // Update the editorial "N in the room" headline if present
        const headlineCount = document.getElementById('lobby-headline-count');
        if (headlineCount) headlineCount.textContent = players.length;

        // Update player count in lobby with animation
        const lobbyPlayerCount = dom.get('lobby-player-count');
        if (lobbyPlayerCount) {
            // Add a simple scale animation for number changes
            const currentCount = parseInt(lobbyPlayerCount.textContent) || 0;
            const newCount = players.length;

            if (currentCount !== newCount) {
                // Write the number immediately: the old 150ms delay left this count
                // disagreeing with the "N in the room" headline above for 150ms.
                lobbyPlayerCount.textContent = newCount;
                lobbyPlayerCount.classList.add('scale-pulse');
                // Remove class after animation completes so it can be triggered again
                setTimeout(() => {
                    lobbyPlayerCount.classList.remove('scale-pulse');
                }, 300);
            }
        }

        // Update legacy player count (for compatibility) - but check if element exists
        const legacyPlayerCount = dom.get('player-count');
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
     * (countdown/expired sounds are owned by TimerManager, wired via soundManager)
     */
    startTimer(duration, onTick = null, onComplete = null) {
        return this.timerManager.startTimer(duration, onTick, onComplete);
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

        // Reset leaderboard state (clears fanfarePlayed so final results show again)
        if (this.leaderboardManager) {
            this.leaderboardManager.reset();
        }

        // Reset power-up state and hide power-up bar from previous game
        if (this.powerUpManager) {
            this.powerUpManager.reset();
        }

        // Reset consensus mode state
        if (this.consensusManager) {
            this.consensusManager.reset();
        }
        if (this.discussionManager) {
            this.discussionManager.reset();
        }

        // Hide the CSV download tool from previous game
        simpleResultsDownloader.hideDownloadTool();

        // Hide final results overlay from previous game
        const finalResults = dom.get('final-results');
        if (finalResults) {
            finalResults.classList.add('hidden');
            finalResults.classList.remove('game-complete-animation');
        }

        // 🔧 FIX: Clear player list UI to prevent phantom players from previous game
        const playersListElement = dom.get('players-list');
        if (playersListElement) {
            playersListElement.innerHTML = '';
            logger.debug('🧹 Cleared player list UI during game reset');
        }

        // Reset player count displays
        const lobbyPlayerCount = dom.get('lobby-player-count');
        if (lobbyPlayerCount) {
            lobbyPlayerCount.textContent = '0';
        }
        const legacyPlayerCount = dom.get('player-count');
        if (legacyPlayerCount) {
            legacyPlayerCount.textContent = '0';
        }
        const headlineCount = document.getElementById('lobby-headline-count');
        if (headlineCount) {
            headlineCount.textContent = '0';
        }

        // Clear all visible game screen content to prevent stale data flash
        this.clearGameDisplayContent();

        // NOTE: Do NOT call this.cleanup() here — cleanup() removes event
        // listeners (e.g. answer button click handlers) that are meant to
        // persist for the lifetime of the app.  reset() above already
        // clears the visual/state for each module.

        logger.debug('🔄 Complete game state reset - both main and modular state managers');
    }

    /**
     * Clear all visible game screen DOM content to prevent stale data between games.
     * Resets question text, timer, answer options, statistics, and feedback
     * to their initial HTML state.
     */
    clearGameDisplayContent() {
        const placeholder = getTranslation('question_will_appear_here') || 'Question will appear here';

        // Reset question text (host + player)
        const hostQuestion = document.getElementById('current-question');
        if (hostQuestion) {
            hostQuestion.textContent = placeholder;
            hostQuestion.className = '';
        }
        const playerQuestion = document.getElementById('player-question-text');
        if (playerQuestion) {
            playerQuestion.textContent = placeholder;
            playerQuestion.className = '';
        }

        // Reset question counters
        const hostCounter = document.getElementById('question-counter');
        if (hostCounter) hostCounter.textContent = '';
        const playerCounter = document.getElementById('player-question-counter');
        if (playerCounter) playerCounter.textContent = '';

        // Reset timers (host + player)
        const timer = document.getElementById('timer');
        if (timer) {
            timer.textContent = '';
            timer.classList.remove('warning');
        }
        const playerTimer = document.getElementById('player-timer');
        if (playerTimer) {
            playerTimer.textContent = '';
            playerTimer.classList.remove('warning');
            playerTimer.classList.add('hidden');
        }

        // Hide and clear question images
        const hostImageContainer = document.getElementById('question-image-display');
        if (hostImageContainer) hostImageContainer.classList.add('hidden');
        const playerImageContainer = document.getElementById('player-question-image');
        if (playerImageContainer) playerImageContainer.classList.add('hidden');

        // Hide and clear question videos
        const hostVideoContainer = document.getElementById('question-video-display');
        if (hostVideoContainer) {
            hostVideoContainer.classList.add('hidden');
            hostVideoContainer.innerHTML = '';
        }
        const playerVideoContainer = document.getElementById('player-question-video');
        if (playerVideoContainer) {
            playerVideoContainer.classList.add('hidden');
            playerVideoContainer.innerHTML = '';
        }

        // Reset host answer options
        const hostOptions = document.getElementById('answer-options');
        if (hostOptions) hostOptions.innerHTML = '';

        // Reset player multiple-choice options (clear selection state, keep structure)
        document.querySelectorAll('.player-option').forEach(opt => {
            opt.classList.remove('selected', 'correct', 'incorrect', 'disabled', 'power-up-hidden', 'player-answered', 'player-answered-wrong');
            opt.removeAttribute('data-player-badge');
            opt.style.pointerEvents = '';
        });

        // Reset true/false options
        document.querySelectorAll('.tf-option').forEach(opt => {
            opt.classList.remove('selected', 'correct', 'incorrect', 'disabled', 'player-answered', 'player-answered-wrong');
            opt.removeAttribute('data-player-badge');
        });

        // Reset multiple-correct checkboxes
        document.querySelectorAll('.checkbox-option').forEach(opt => {
            opt.classList.remove('selected', 'correct', 'incorrect', 'player-answered', 'player-answered-wrong');
            opt.removeAttribute('data-player-badge');
            const checkbox = opt.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = false;
        });

        // Reset numeric input
        const numericInput = document.getElementById('numeric-answer-input');
        if (numericInput) numericInput.value = '';

        // Hide all answer type containers except default
        document.querySelectorAll('.player-answer-type').forEach(type => {
            type.classList.add('hidden');
        });
        const defaultAnswerType = document.getElementById('player-multiple-choice');
        if (defaultAnswerType) defaultAnswerType.classList.remove('hidden');

        // Hide answer statistics and reset bars
        const answerStats = document.getElementById('answer-statistics');
        if (answerStats) {
            answerStats.classList.add('hidden');
            answerStats.classList.remove('counting-only');
        }
        for (let i = 0; i < 6; i++) {
            const fill = document.getElementById(`stat-fill-${i}`);
            if (fill) fill.style.width = '0%';
            const count = document.getElementById(`stat-count-${i}`);
            if (count) count.textContent = '0';
        }

        // Reset response counts
        const responsesCount = document.getElementById('responses-count');
        if (responsesCount) responsesCount.textContent = '0';
        const totalPlayers = document.getElementById('total-players');
        if (totalPlayers) totalPlayers.textContent = '0';

        // Hide answer feedback
        const feedback = document.getElementById('answer-feedback');
        if (feedback) feedback.classList.add('hidden');

        // Hide score breakdown
        const scoreBreakdown = document.getElementById('host-score-breakdown');
        if (scoreBreakdown) hide(scoreBreakdown);

        // Hide game controls
        const gameControls = document.getElementById('game-controls');
        if (gameControls) hide(gameControls);

        // Clear modal feedback from previous game
        if (modalFeedback) {
            modalFeedback.hide();
            modalFeedback.clearContent();
        }

        // Remove any lingering dynamic elements from previous game
        document.querySelectorAll('.correct-answer-display, .numeric-correct-answer-display, .question-explanation-display').forEach(el => el.remove());

        logger.debug('🧹 Cleared all game display content');
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

            // Clean up interaction and timer managers
            this.interactionManager?.cleanup();
            this.timerManager?.cleanup();

            // Clean up power-ups
            if (this.powerUpManager) {
                this.powerUpManager.cleanup();
            }

            // Clean up consensus mode
            if (this.consensusManager) {
                this.consensusManager.cleanup();
            }
            if (this.discussionManager) {
                this.discussionManager.cleanup();
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
                const container = dom.get(containerId);
                if (container) {
                    container.innerHTML = `
                        <div class="error-state">
                            <p>⚠️ ${getTranslation('question_load_error')}</p>
                            <p>${translationManager.getTranslationSync('please_wait_next_question') || 'Please wait for the next question...'}</p>
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
            const resultElement = dom.get('answer-feedback');
            if (resultElement) {
                resultElement.classList.remove('hidden');
                resultElement.classList.add('error-bg');

                const messageElement = dom.get('feedback-message');
                if (messageElement) {
                    messageElement.textContent = '⚠️ ' + (translationManager.getTranslationSync('result_display_error') || 'Result display error');
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

    /**
     * Save game results to server for later download
     */
    saveGameResults() {
        // No-op: the server persists results in endGame() (services/game.js saveResults,
        // idempotent per game). This client-side POST was a redundant second write that
        // produced duplicate result files with different timestamps. Practice mode never
        // set a host gamePin so it never saved here anyway. Kept as a stub so the
        // leaderboard save callback wiring stays intact.
    }
}