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
        this._handleOptionClick = this._handleOptionClick.bind(this);
        this._handleNumericKeypress = this._handleNumericKeypress.bind(this);

        // Every error banner currently on screen, with its own removal timeout.
        // A single shared timeout id let a second banner cancel the first one's
        // removal, leaving that fixed-position banner on screen until reload.
        this._errorBanners = [];
    }

    /**
     * Handler for option clicks - covers both multiple choice and true/false (bound for cleanup)
     */
    _handleOptionClick(event) {
        const mcButton = event.target.closest('.player-option');
        if (mcButton) {
            const answer = parseInt(mcButton.dataset.answer);
            if (!isNaN(answer)) this.selectAnswer(answer);
            return;
        }
        const tfButton = event.target.closest('.tf-option');
        if (tfButton) {
            const answer = tfButton.dataset.answer === 'true';
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
        // Scoped: consensus mode renders .proposal-bar[data-answer] into the discussion
        // feed above #player-multiple-choice, so an unscoped lookup can highlight it.
        const selectedOption = document.querySelector(
            `.player-option[data-answer="${answer}"], .tf-option[data-answer="${answer}"]`);
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

        // Hide player timer after submitting
        const playerTimer = document.getElementById('player-timer');
        if (playerTimer) playerTimer.classList.add('hidden');

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
     * Close the answer gate at round end (local timer expiry or the server's
     * question-end). Without this, a tap between timer zero and the arrival of
     * player-result still emitted submit-answer, the server rejected it, and the
     * player saw a red rejection modal just before their real result.
     * The disabled flags are undone by GameDisplayManager.clearClientSelections()
     * on the next question.
     */
    lockAnswers() {
        const gameState = this.gameStateManager.getGameState();
        if (gameState.isHost) return;

        this.gameStateManager.markAnswerSubmitted();

        const elements = this.gameDisplayManager.getClientElements();
        [...elements.multipleChoiceOptions, ...elements.trueFalseOptions].forEach(option => {
            option.disabled = true;
            option.classList.add('disabled');
        });
        elements.checkboxOptions.forEach(option => {
            const checkbox = option.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.disabled = true;
            option.classList.add('disabled');
        });
        if (elements.numericInput) elements.numericInput.disabled = true;
        if (elements.submitButton) elements.submitButton.disabled = true;
        if (elements.multipleSubmitButton) elements.multipleSubmitButton.disabled = true;

        logger.debug('Answer input locked for this question');
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

        // Remove after delay; each banner owns its own timeout (tracked for cleanup)
        const banner = { element: errorElement, timeoutId: null };
        banner.timeoutId = setTimeout(() => {
            this._removeErrorBanner(banner);
        }, 3000);
        this._errorBanners.push(banner);
    }

    /**
     * Remove one error banner and forget it
     * @param {{element: HTMLElement, timeoutId: number|null}} banner
     */
    _removeErrorBanner(banner) {
        clearTimeout(banner.timeoutId);
        banner.element.remove();
        const index = this._errorBanners.indexOf(banner);
        if (index !== -1) {
            this._errorBanners.splice(index, 1);
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Clear every pending error banner and its timeout
        [...this._errorBanners].forEach(banner => this._removeErrorBanner(banner));

        // Remove event listeners
        this.removeEventListeners();

        logger.debug('PlayerInteractionManager cleanup completed');
    }

    /**
     * Setup event listeners for player interactions
     */
    setupEventListeners() {
        // Option clicks for multiple choice and true/false (single handler)
        document.addEventListener('click', this._handleOptionClick);

        // Multiple correct submit button
        const mcSubmitBtn = document.getElementById('submit-multiple');
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

        // Note: Ordering submit button is wired up in question-renderer.js initializePlayerOrderingDragDrop()

        logger.debug('Player interaction event listeners setup');
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        // Remove document-level click listener (prevents memory leaks)
        document.removeEventListener('click', this._handleOptionClick);

        // Remove specific element listeners
        const mcSubmitBtn = document.getElementById('submit-multiple');
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

        // Note: Ordering submit button listener removed when container innerHTML is replaced

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