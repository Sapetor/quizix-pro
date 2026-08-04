/**
 * Answer Reveal Manager Module
 * Player-side answer feedback: submission/rejection modals and the correct-answer
 * highlight on the player's own option list.
 *
 * The HOST reveal (highlighting the winning tile on #host-game-screen, the numeric
 * answer card and the explanation card) lives in game-manager.js — that is the copy
 * socket-manager's `question-timeout` handler calls. The duplicate host methods that
 * used to sit here queried `.host-option`, a selector no screen renders any more, so
 * they were dead and have been removed.
 */

import { getTranslation } from '../../utils/translation-manager.js';
import { logger } from '../../core/config.js';
import { modalFeedback } from '../../utils/modal-feedback.js';

export class AnswerRevealManager {
    /**
     * Create an AnswerRevealManager
     * @param {Object} stateManager - Game state manager
     * @param {Object} displayManager - Display manager
     */
    constructor(stateManager, displayManager) {
        this.stateManager = stateManager;
        this.displayManager = displayManager;
    }

    /**
     * Show answer submitted feedback
     * @param {*} answer - The submitted answer
     */
    showAnswerSubmitted(answer) {
        logger.debug('showAnswerSubmitted called with:', answer);

        const prefix = getTranslation('answer_submitted');
        const displayText = `${prefix}: ${this.formatAnswerForDisplay(answer)}`;

        modalFeedback.showSubmission(displayText, 2000);
        logger.debug('Answer submission modal feedback shown:', displayText);
    }

    /**
     * Format answer value for display
     * @param {*} answer - Answer to format
     * @returns {string} Formatted answer
     */
    formatAnswerForDisplay(answer) {
        if (Array.isArray(answer)) {
            return answer.map(a => String.fromCharCode(65 + a)).join(', ');
        }

        if (typeof answer === 'boolean') {
            return answer ? getTranslation('true') : getTranslation('false');
        }

        if (typeof answer === 'string') {
            return answer.toUpperCase();
        }

        if (typeof answer === 'number') {
            const gameState = this.stateManager.getGameState();
            const questionType = gameState.currentQuestion?.type;

            if (questionType === 'numeric') {
                return String(answer);
            }

            if (Number.isInteger(answer) && answer >= 0 && answer <= 3) {
                return String.fromCharCode(65 + answer);
            }

            return String(answer);
        }

        return String(answer);
    }

    /**
     * Show answer rejected feedback
     * @param {string} message - Rejection message
     */
    showAnswerRejected(message) {
        logger.warn('showAnswerRejected called:', message);

        const displayText = message || getTranslation('answer_not_submitted') || 'Answer could not be submitted';
        modalFeedback.show(false, displayText, null, 2500);

        logger.debug('Answer rejection modal feedback shown:', displayText);
    }

    /**
     * Show correct answer on client side
     * @param {*} correctAnswer - The correct answer
     * @param {string} questionType - Type of question
     */
    showCorrectAnswerOnClient(correctAnswer, questionType, isPoll = false) {
        logger.debug('Showing correct answer on client:', correctAnswer, 'type:', questionType);

        // Poll: mark what the player chose, but nothing is right or wrong here
        if (isPoll) {
            this.markPlayerSelections(undefined, questionType);
            return;
        }

        // Mark player's selected answer(s) before applying correct answer styles
        this.markPlayerSelections(correctAnswer, questionType);

        // Handle multiple-correct questions
        if (questionType === 'multiple-correct' && Array.isArray(correctAnswer)) {
            const checkboxOptions = document.querySelectorAll('.checkbox-option');
            correctAnswer.forEach(index => {
                if (checkboxOptions[index]) {
                    this.applyCorrectAnswerStyle(checkboxOptions[index]);
                    logger.debug('Highlighted correct checkbox option:', index);
                }
            });
            return;
        }

        // Handle multiple choice options
        const options = document.querySelectorAll('.player-option');
        if (typeof correctAnswer === 'number' && options[correctAnswer]) {
            this.applyCorrectAnswerStyle(options[correctAnswer]);
            logger.debug('Highlighted correct option:', correctAnswer);
        }

        // Handle true/false options
        const tfAnswerStr = (typeof correctAnswer === 'boolean') ? String(correctAnswer) : correctAnswer;
        if (tfAnswerStr === 'true' || tfAnswerStr === 'false') {
            const correctTFOption = document.querySelector(`.tf-option[data-answer="${tfAnswerStr}"]`);
            if (correctTFOption) {
                this.applyCorrectAnswerStyle(correctTFOption);
                logger.debug('Highlighted correct T/F option:', tfAnswerStr);
            }
        }
    }

    /**
     * Mark the player's selected answer(s) with visual indicator classes.
     * Adds .player-answered to selected options, and .player-answered-wrong
     * if the selection does not match the correct answer.
     * @param {*} correctAnswer - The correct answer value
     * @param {string} questionType - Type of question
     */
    markPlayerSelections(correctAnswer, questionType) {
        const badgeText = getTranslation('your_answer') || 'Your answer';

        if (questionType === 'multiple-correct') {
            const correctSet = new Set(Array.isArray(correctAnswer) ? correctAnswer : []);
            const checkboxOptions = document.querySelectorAll('.checkbox-option');
            checkboxOptions.forEach((option, index) => {
                const checkbox = option.querySelector('input[type="checkbox"]');
                const isChecked = checkbox?.checked;
                if (isChecked) {
                    option.classList.add('player-answered');
                    option.dataset.playerBadge = badgeText;
                    if (!correctSet.has(index)) {
                        option.classList.add('player-answered-wrong');
                    }
                }
            });
            return;
        }

        // MC and T/F: find the .selected element
        const selectedOption = document.querySelector('.player-option.selected, .tf-option.selected');
        if (!selectedOption) return;

        selectedOption.classList.add('player-answered');
        selectedOption.dataset.playerBadge = badgeText;

        // Determine if the player's selection is wrong
        const playerAnswer = selectedOption.dataset.answer;
        let isWrong = false;

        if (typeof correctAnswer === 'number') {
            isWrong = parseInt(playerAnswer) !== correctAnswer;
        } else if (typeof correctAnswer === 'boolean') {
            isWrong = (playerAnswer !== String(correctAnswer));
        } else if (typeof correctAnswer === 'string') {
            isWrong = playerAnswer !== correctAnswer;
        }

        if (isWrong) {
            selectedOption.classList.add('player-answered-wrong');
        }
    }

    /**
     * Apply correct answer styling to element
     * @param {Element} element - DOM element
     */
    applyCorrectAnswerStyle(element) {
        if (!element) return;
        element.classList.add('correct-answer', 'correct-answer-highlight');
    }

}
