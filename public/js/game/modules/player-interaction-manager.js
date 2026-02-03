/**
 * Player Interaction Manager Module
 * Handles answer selection, input handling, and player-specific interactions
 * Extracted from game-manager.js for better separation of concerns
 */

import { translationManager, getTranslation, getTrueFalseText } from '../../utils/translation-manager.js';
import { logger } from '../../core/config.js';
import { QuestionTypeRegistry } from '../../utils/question-type-registry.js';

export class PlayerInteractionManager {
    constructor(gameStateManager, gameDisplayManager, soundManager, socketManager) {
        this.gameStateManager = gameStateManager;
        this.gameDisplayManager = gameDisplayManager;
        this.soundManager = soundManager;
        this.socketManager = socketManager;
        this.eventBus = null; // Set by GameManager.setEventBus()

        // Bind methods to maintain context
        this.selectAnswer = this.selectAnswer.bind(this);
        this.submitMultipleCorrectAnswer = this.submitMultipleCorrectAnswer.bind(this);
        this.submitNumericAnswer = this.submitNumericAnswer.bind(this);
        this.submitOrderingAnswer = this.submitOrderingAnswer.bind(this);

        // Store bound handlers for cleanup (prevents memory leaks)
        this._handleMultipleChoiceClick = this._handleMultipleChoiceClick.bind(this);
        this._handleTrueFalseClick = this._handleTrueFalseClick.bind(this);
        this._handleNumericKeypress = this._handleNumericKeypress.bind(this);
    }

    /**
     * Handler for multiple choice option clicks (bound for cleanup)
     */
    _handleMultipleChoiceClick(event) {
        if (event.target.classList.contains('player-option')) {
            const answer = parseInt(event.target.dataset.answer);
            if (!isNaN(answer)) {
                this.selectAnswer(answer);
            }
        }
    }

    /**
     * Handler for true/false option clicks (bound for cleanup)
     */
    _handleTrueFalseClick(event) {
        if (event.target.classList.contains('tf-option')) {
            const answer = event.target.dataset.answer === 'true';
            this.selectAnswer(answer);
        }
    }

    /**
     * Handler for numeric input keypress (bound for cleanup)
     */
    _handleNumericKeypress(event) {
        if (event.key === 'Enter') {
            this.submitNumericAnswer();
        }
    }

    /**
     * Handle answer selection for multiple choice
     */
    selectAnswer(answer) {
        const gameState = this.gameStateManager.getGameState();

        if (gameState.isHost || gameState.resultShown || gameState.answerSubmitted) {
            logger.debug('Ignoring answer selection - host mode, result shown, or already submitted');
            return;
        }

        this.gameStateManager.setSelectedAnswer(answer);
        this.highlightSelectedAnswer(answer);

        // Auto-submit for multiple choice and true-false
        if (gameState.currentQuestion &&
            (gameState.currentQuestion.type === 'multiple-choice' || gameState.currentQuestion.type === 'true-false')) {
            this.submitAnswer(answer);
        }

        logger.debug('Answer selected:', answer);
    }

    /**
     * Highlight the selected answer visually
     */
    highlightSelectedAnswer(answer) {
        logger.debug('Highlighting selected answer:', answer);

        // Remove previous selections (CSS handles the styling via .selected class)
        document.querySelectorAll('.player-option, .tf-option').forEach(option => {
            option.classList.remove('selected');
        });

        // Highlight current selection (CSS .selected class handles border and styling)
        const selectedOption = document.querySelector(`[data-answer="${answer}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');

            // Play selection sound
            if (this.soundManager?.isSoundsEnabled()) {
                this.soundManager.playEnhancedSound(800, 0.1, 'sine', 0.1);
            }

            logger.debug('Answer highlighted successfully');
        }
    }

    /**
     * Submit multiple correct answer
     */
    submitMultipleCorrectAnswer() {
        return this.submitAnswerByType('multiple-correct');
    }

    /**
     * Submit answer by type - consolidated method using registry
     * @param {string} type - Answer type: 'multiple-correct', 'numeric', 'ordering', or 'direct'
     * @param {*} directAnswer - Direct answer value for 'direct' type
     */
    submitAnswerByType(type, directAnswer = null) {
        const gameState = this.gameStateManager.getGameState();
        const currentQuestion = gameState.currentQuestion;

        if (!currentQuestion) {
            logger.error('No current question available');
            return;
        }

        switch (type) {
            case 'multiple-correct': {
                const container = document.getElementById('player-multiple-correct');
                if (!container) {
                    this.showError(getTranslation('please_select_at_least_one'));
                    return;
                }
                const answer = QuestionTypeRegistry.extractAnswer('multiple-correct', container);
                if (!answer || answer.length === 0) {
                    this.showError(getTranslation('please_select_at_least_one'));
                    return;
                }
                logger.debug('Submitting multiple correct answers:', answer);
                this.submitAnswer(answer);
                break;
            }

            case 'numeric': {
                const container = document.getElementById('player-numeric');
                if (!container) {
                    this.showError(getTranslation('please_enter_valid_number'));
                    return;
                }
                const answer = QuestionTypeRegistry.extractAnswer('numeric', container);
                if (answer === null || isNaN(answer)) {
                    this.showError(getTranslation('please_enter_valid_number'));
                    return;
                }
                logger.debug('Submitting numeric answer:', answer);
                this.submitAnswer(answer);
                break;
            }

            case 'ordering': {
                const container = document.getElementById('player-ordering');
                if (!container) {
                    this.showError(getTranslation('please_arrange_items'));
                    return;
                }
                const answer = QuestionTypeRegistry.extractAnswer('ordering', container);
                if (!answer || answer.length === 0) {
                    this.showError(getTranslation('please_arrange_items'));
                    return;
                }
                logger.debug('Submitting ordering answer:', answer);
                this.submitAnswer(answer);
                break;
            }

            case 'direct':
                this.submitAnswer(directAnswer);
                break;

            default:
                logger.error('Unknown answer submission type:', type);
        }
    }

    /**
     * Submit numeric answer
     */
    submitNumericAnswer() {
        return this.submitAnswerByType('numeric');
    }

    /**
     * Submit ordering answer
     */
    submitOrderingAnswer() {
        return this.submitAnswerByType('ordering');
    }

    /**
     * Submit answer to server or local game session
     */
    submitAnswer(answer) {
        const gameState = this.gameStateManager.getGameState();

        if (gameState.isHost || gameState.answerSubmitted) {
            logger.debug('Cannot submit answer - host mode or answer already submitted');
            return;
        }

        // Check for event bus first (practice mode), then socket manager (multiplayer)
        if (!this.eventBus && !this.socketManager) {
            logger.error('No event bus or socket manager available for answer submission');
            return;
        }

        logger.debug('Submitting answer:', answer);

        // Mark answer as submitted to prevent double submission
        this.gameStateManager.markAnswerSubmitted();

        // Store answer locally
        this.gameStateManager.storePlayerAnswer(gameState.playerName, answer);

        // Send via event bus (works for both practice and multiplayer modes)
        if (this.eventBus) {
            this.eventBus.emit('submit-answer', { answer });
        } else if (this.socketManager) {
            // Fallback to direct socket manager (backward compatibility)
            this.socketManager.submitAnswer(answer);
        }

        // Play submission sound
        if (this.soundManager?.isSoundsEnabled()) {
            this.soundManager.playEnhancedSound(1000, 0.2, 'sine', 0.15);
        }
    }

    /**
     * Format answer for display
     */
    formatAnswerForDisplay(answer) {
        const gameState = this.gameStateManager.getGameState();
        const questionType = gameState.currentQuestion?.type;

        if (questionType === 'multiple-choice') {
            return `${translationManager.getOptionLetter(answer)}: ${gameState.currentQuestion?.options?.[answer] || answer}`;
        } else if (questionType === 'multiple-correct') {
            return Array.isArray(answer)
                ? answer.map(a => `${translationManager.getOptionLetter(a)}: ${gameState.currentQuestion?.options?.[a] || a}`).join(', ')
                : answer;
        } else if (questionType === 'true-false') {
            const tfText = getTrueFalseText(); return answer === true || answer === 'true' ? tfText.true : tfText.false;
        } else {
            return answer.toString();
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        logger.error('Player interaction error:', message);

        // Create error element
        const errorElement = document.createElement('div');
        errorElement.className = 'player-error-message';
        errorElement.innerHTML = `
            <div class="error-content">
                <div class="error-icon">⚠️</div>
                <div class="error-text">${message}</div>
            </div>
        `;

        // Style the error
        Object.assign(errorElement.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(239, 68, 68, 0.95)',
            color: 'white',
            padding: '15px 25px',
            borderRadius: '8px',
            zIndex: '10000',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
        });

        document.body.appendChild(errorElement);

        // Remove after delay
        setTimeout(() => {
            if (errorElement.parentNode) {
                errorElement.parentNode.removeChild(errorElement);
            }
        }, 3000);
    }

    /**
     * Setup event listeners for player interactions
     */
    setupEventListeners() {
        // Multiple choice option clicks (using bound handler for cleanup)
        document.addEventListener('click', this._handleMultipleChoiceClick);

        // True/false option clicks (using bound handler for cleanup)
        document.addEventListener('click', this._handleTrueFalseClick);

        // Multiple correct submit button
        const mcSubmitBtn = document.getElementById('submit-multiple-correct');
        if (mcSubmitBtn) {
            mcSubmitBtn.addEventListener('click', this.submitMultipleCorrectAnswer);
        }

        // Numeric submit button
        const numericSubmitBtn = document.getElementById('submit-numeric');
        if (numericSubmitBtn) {
            numericSubmitBtn.addEventListener('click', this.submitNumericAnswer);
        }

        // Enter key for numeric input (using bound handler for cleanup)
        const numericInput = document.getElementById('numeric-answer-input');
        if (numericInput) {
            numericInput.addEventListener('keypress', this._handleNumericKeypress);
        }

        // Note: Ordering submit button is wired up in question-renderer.js setupPlayerOrderingOptions()
        // to match the pattern used by numeric questions

        logger.debug('Player interaction event listeners setup');
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        // Remove document-level click listeners (prevents memory leaks)
        document.removeEventListener('click', this._handleMultipleChoiceClick);
        document.removeEventListener('click', this._handleTrueFalseClick);

        // Remove specific element listeners
        const mcSubmitBtn = document.getElementById('submit-multiple-correct');
        if (mcSubmitBtn) {
            mcSubmitBtn.removeEventListener('click', this.submitMultipleCorrectAnswer);
        }

        const numericSubmitBtn = document.getElementById('submit-numeric');
        if (numericSubmitBtn) {
            numericSubmitBtn.removeEventListener('click', this.submitNumericAnswer);
        }

        const numericInput = document.getElementById('numeric-answer-input');
        if (numericInput) {
            numericInput.removeEventListener('keypress', this._handleNumericKeypress);
        }

        // Note: Ordering submit button listener removed by GameManager tracked event cleanup

        logger.debug('Player interaction event listeners removed');
    }

    /**
     * Reset player interaction state
     */
    reset() {
        // Use centralized client selection clearing from GameDisplayManager
        this.gameDisplayManager.clearClientSelections();

        // Additional cleanup for elements that might have styling (using CSS class for reset)
        document.querySelectorAll('[data-answer], .option-display').forEach(element => {
            element.classList.remove('selected', 'correct', 'incorrect');
            // Temporarily add style-reset class to clear any lingering inline styles
            element.classList.add('style-reset');
        });

        // Remove style-reset class after a frame to allow CSS to apply
        requestAnimationFrame(() => {
            document.querySelectorAll('.style-reset').forEach(element => {
                element.classList.remove('style-reset');
            });
        });

        logger.debug('Player interaction state reset via centralized method');
    }
}