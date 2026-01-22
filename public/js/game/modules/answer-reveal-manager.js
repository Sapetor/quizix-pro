/**
 * Answer Reveal Manager Module
 * Handles displaying correct/incorrect answer feedback
 * Extracted from game-manager.js for modularity
 */

import { getTranslation } from '../../utils/translation-manager.js';
import { logger } from '../../core/config.js';
import { modalFeedback } from '../../utils/modal-feedback.js';
import { simpleMathJaxService } from '../../utils/simple-mathjax-service.js';
import { dom, escapeHtmlPreservingLatex } from '../../utils/dom.js';

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
    showCorrectAnswerOnClient(correctAnswer, questionType) {
        logger.debug('Showing correct answer on client:', correctAnswer, 'type:', questionType);

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
        if (typeof correctAnswer === 'boolean') {
            const index = correctAnswer ? 0 : 1;
            const correctTFOption = document.querySelector(`[data-answer="${index}"]`);
            if (correctTFOption?.classList.contains('tf-option')) {
                this.applyCorrectAnswerStyle(correctTFOption);
                logger.debug('Highlighted correct T/F option:', correctAnswer, 'at index:', index);
            }
        } else {
            const correctTFOption = document.querySelector(`[data-answer="${correctAnswer}"]`);
            if (correctTFOption?.classList.contains('true-btn') || correctTFOption?.classList.contains('false-btn')) {
                this.applyCorrectAnswerStyle(correctTFOption);
                logger.debug('Highlighted correct T/F option:', correctAnswer);
            }
        }
    }

    /**
     * Show correct answer on host screen
     * @param {Object} data - Answer data
     */
    showCorrectAnswer(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;

        const questionType = data.questionType || data.type;

        if (questionType === 'numeric') {
            this.showNumericCorrectAnswer(data.correctAnswer, data.tolerance);
        } else {
            this.highlightCorrectAnswers(data);
        }

        if (data.explanation) {
            this.showExplanation(data.explanation);
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

    /**
     * Show numeric correct answer
     * @param {number} correctAnswer - The correct answer
     * @param {number} tolerance - Acceptable tolerance
     */
    showNumericCorrectAnswer(correctAnswer, tolerance) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;

        const existingAnswer = document.querySelector('.numeric-correct-answer-display');
        if (existingAnswer) {
            existingAnswer.remove();
        }

        const questionDisplay = document.getElementById('host-question-display');
        if (questionDisplay) {
            let answerText = `${getTranslation('correct_answer')}: ${correctAnswer}`;
            if (tolerance) {
                answerText += ` (±${tolerance})`;
            }

            const correctAnswerDiv = document.createElement('div');
            correctAnswerDiv.className = 'numeric-correct-answer-display';
            correctAnswerDiv.innerHTML = `
                <div class="numeric-correct-answer-content">
                    <div class="correct-icon">✅</div>
                    <div class="correct-text">${answerText}</div>
                </div>
            `;

            questionDisplay.appendChild(correctAnswerDiv);
        }

        const optionsContainer = document.getElementById('answer-options');
        if (optionsContainer) {
            optionsContainer.classList.add('hidden');
        }

        const hostMultipleChoice = document.getElementById('host-multiple-choice');
        if (hostMultipleChoice) {
            hostMultipleChoice.classList.add('numeric-question-type');
        }
    }

    /**
     * Highlight correct answers in the options grid
     * @param {Object} data - Answer data with correctAnswer(s)
     */
    highlightCorrectAnswers(data) {
        const questionType = data.questionType || data.type;

        if (questionType === 'multiple_correct' || questionType === 'multiple-correct') {
            const correctIndices = data.correctAnswers || [];
            const options = document.querySelectorAll('.host-option');
            correctIndices.forEach(index => {
                if (options[index]) {
                    this.applyCorrectAnswerStyle(options[index]);
                }
            });
        } else if (questionType === 'true_false') {
            const correctIndex = data.correctAnswer === true ? 0 : 1;
            const options = document.querySelectorAll('.host-option');
            if (options[correctIndex]) {
                this.applyCorrectAnswerStyle(options[correctIndex]);
            }
        } else if (questionType === 'ordering') {
            // For ordering, highlight all items in correct order
            const orderItems = document.querySelectorAll('.ordering-item');
            orderItems.forEach(item => {
                this.applyCorrectAnswerStyle(item);
            });
        } else {
            // Multiple choice
            const correctIndex = data.correctAnswer;
            const options = document.querySelectorAll('.host-option');
            if (typeof correctIndex === 'number' && options[correctIndex]) {
                this.applyCorrectAnswerStyle(options[correctIndex]);
            }
        }
    }

    /**
     * Show explanation for the correct answer
     * @param {string} explanation - Explanation text
     */
    showExplanation(explanation) {
        const existingExplanation = document.querySelector('.question-explanation-display');
        if (existingExplanation) {
            existingExplanation.remove();
        }

        const questionDisplay = document.getElementById('host-question-display');
        if (questionDisplay && explanation) {
            const explanationDiv = document.createElement('div');
            explanationDiv.className = 'question-explanation-display';

            const content = document.createElement('div');
            content.className = 'explanation-content';

            const icon = document.createElement('div');
            icon.className = 'explanation-icon';
            icon.textContent = '💡';

            const textDiv = document.createElement('div');
            textDiv.className = 'explanation-text';
            textDiv.innerHTML = escapeHtmlPreservingLatex(explanation);

            content.appendChild(icon);
            content.appendChild(textDiv);
            explanationDiv.appendChild(content);
            questionDisplay.appendChild(explanationDiv);

            simpleMathJaxService.render([textDiv]).catch(err => {
                logger.warn('MathJax render error in explanation (non-blocking):', err);
            });
        }
    }

}
