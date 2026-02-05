/**
 * Question Renderer Module
 * Handles all question content rendering, answer options setup, and DOM manipulation
 * Extracted from GameManager for better separation of concerns
 */

import { translationManager, getTranslation, getTrueFalseText } from '../../utils/translation-manager.js';
import { logger, TIMING, COLORS } from '../../core/config.js';
import { escapeHtmlPreservingLatex, escapeHtml, formatCodeBlocks } from '../../utils/dom.js';
import { QuestionTypeRegistry } from '../../utils/question-type-registry.js';

export class QuestionRenderer {
    constructor(displayManager, stateManager, uiManager, gameManager) {
        this.displayManager = displayManager;
        this.stateManager = stateManager;
        this.uiManager = uiManager;
        this.gameManager = gameManager; // For access to tracked event listeners
    }

    /**
     * Update host display with question content
     */
    updateHostDisplay(data, elements) {
        logger.debug('Host mode - updating display');

        // Clear previous question content to prevent flash during transition
        this.displayManager.clearHostQuestionContent(false); // false = no loading message during update

        // Switch to host game screen when new question starts
        this.uiManager.showScreen('host-game-screen');

        // Hide answer statistics during question
        this.hideAnswerStatistics();

        // Update counters using display manager
        this.displayManager.updateQuestionCounter(data.questionNumber, data.totalQuestions);

        // Add delay to ensure screen transition completes before MathJax rendering
        setTimeout(() => {
            // Update question content
            this.updateHostQuestionContent(data, elements.hostQuestionElement);

            // Update options/answers display
            this.updateHostOptionsContent(data, elements.hostOptionsContainer);

            // Update question image
            this.displayManager.updateQuestionImage(data, 'question-image-display');
        }, TIMING.RENDER_DELAY);
    }

    /**
     * Update host question content with LaTeX support
     */
    updateHostQuestionContent(data, hostQuestionElement) {
        if (!hostQuestionElement) {
            logger.warn('Host question element not found');
            return;
        }

        logger.debug('Updating host question content');

        // Add question type indicator for styling BEFORE displayQuestionText
        // (displayQuestionText adds tex2jax_process class for FOUC prevention)
        hostQuestionElement.className = `question-display ${data.type}-question`;

        // Format and display question text using display manager
        this.displayManager.displayQuestionText(hostQuestionElement, data.question);

        // Set data attributes for debugging and styling
        hostQuestionElement.setAttribute('data-question-type', data.type);
        hostQuestionElement.setAttribute('data-question-number', data.questionNumber);

        logger.debug('Host question content updated successfully');
    }

    /**
     * Update host options content based on question type
     */
    updateHostOptionsContent(data, hostOptionsContainer) {
        if (!hostOptionsContainer) {
            logger.warn('Host options container not found');
            return;
        }

        logger.debug('Updating host options content for type:', data.type);

        // Always clear previous content to prevent leaking between question types
        hostOptionsContainer.innerHTML = '';

        const hostMultipleChoice = document.getElementById('host-multiple-choice');

        if (data.type === 'numeric') {
            hostOptionsContainer.style.display = 'none';
            // Hide the entire "Question Alternatives" frame for numeric questions
            if (hostMultipleChoice) {
                hostMultipleChoice.classList.add('numeric-question-type');
            }
        } else {
            hostOptionsContainer.style.display = 'block';
            // Remove the numeric-question-type class for non-numeric questions
            if (hostMultipleChoice) {
                hostMultipleChoice.classList.remove('numeric-question-type');
            }

            // Use registry to render host options
            const helpers = {
                escapeHtml,
                escapeHtmlPreservingLatex,
                formatCodeBlocks,
                translationManager,
                COLORS
            };
            QuestionTypeRegistry.renderHostOptions(data.type, data, hostOptionsContainer, helpers);
        }

        // Translate any dynamic content in the options container
        translationManager.translateContainer(hostOptionsContainer);

        // Use GameDisplayManager for MathJax rendering (no delay - SimpleMathJaxService handles queuing)
        this.displayManager.renderQuestionMath(hostOptionsContainer);
    }


    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Reset button styles for options
     */
    resetButtonStyles(options) {
        options.forEach(option => {
            option.classList.remove('correct', 'incorrect', 'selected');
            option.style.background = '';
            option.style.border = '';
            option.style.transform = '';
        });
    }


    /**
     * Hide answer statistics during question display
     */
    hideAnswerStatistics() {
        const statisticsContainer = document.getElementById('answer-statistics');
        if (statisticsContainer) {
            statisticsContainer.style.display = 'none';
        }
    }

    /**
     * Update player display with question content
     */
    updatePlayerDisplay(data, elements, optionsContainer) {
        logger.debug('Player mode - updating display');

        // Switch to player game screen when new question starts
        this.uiManager.showScreen('player-game-screen');

        // Add delay to ensure screen transition completes before content update
        setTimeout(() => {
            // Use centralized client question display update
            this.displayManager.updateClientQuestionDisplay(data);

            // Update answer options (still specific to question renderer)
            this.updatePlayerOptions(data, optionsContainer);
        }, TIMING.RENDER_DELAY);
    }

    /**
     * Update player question content with LaTeX support
     */
    updatePlayerQuestionContent(data, questionElement) {
        if (!questionElement) {
            logger.warn('Player question element not found');
            return;
        }

        logger.debug('Updating player question content');

        // Add question type indicator for styling BEFORE displayQuestionText
        // (displayQuestionText adds tex2jax_process class for FOUC prevention)
        questionElement.className = `question-display player-question ${data.type}-question`;

        // Format and display question text using display manager
        this.displayManager.displayQuestionText(questionElement, data.question);

        // Add subtle instruction for multiple correct questions
        if (data.type === 'multiple-correct') {
            const instruction = document.createElement('div');
            instruction.className = 'multiple-correct-instruction';
            instruction.innerHTML = `<small>💡 ${translationManager.getTranslationSync('multiple_correct_instruction')}</small>`;
            questionElement.appendChild(instruction);
        }

        // Set data attributes
        questionElement.setAttribute('data-question-type', data.type);
        questionElement.setAttribute('data-question-number', data.questionNumber);

        logger.debug('Player question content updated successfully');
    }

    /**
     * Update player answer options based on question type
     */
    updatePlayerOptions(data, optionsContainer) {
        if (!optionsContainer) {
            logger.error('Player options container not found - critical DOM issue');
            return;
        }

        logger.debug('Setting up player options for type:', data.type);
        logger.debug('Options container element:', optionsContainer.tagName, optionsContainer.id, optionsContainer.className);

        // Use registry to render player options
        const helpers = {
            escapeHtml,
            escapeHtmlPreservingLatex,
            formatCodeBlocks,
            translationManager,
            COLORS
        };
        QuestionTypeRegistry.renderPlayerOptions(data.type, data, optionsContainer, helpers);

        // Special handling for ordering after rendering
        if (data.type === 'ordering') {
            // Initialize drag-and-drop after a short delay to ensure DOM is ready
            setTimeout(() => {
                this.initializePlayerOrderingDragDrop();
            }, 100);
        }

        // Use GameDisplayManager for MathJax rendering after options are set up
        this.displayManager.renderQuestionMath(optionsContainer);
    }


    /**
     * Initialize drag-and-drop for player ordering
     */
    initializePlayerOrderingDragDrop() {
        // Dynamically import and initialize the ordering drag-drop component
        import('../../utils/ordering-drag-drop.js').then(module => {
            const OrderingDragDrop = module.OrderingDragDrop;
            const container = document.getElementById('player-ordering-container');

            if (!container) {
                logger.warn('Player ordering container not found');
                return;
            }

            // Initialize drag-drop
            this.orderingDragDrop = new OrderingDragDrop(container, {
                itemSelector: '.ordering-display-item',
                onOrderChange: (order) => {
                    logger.debug('Order changed:', order);
                }
            });

            logger.debug('Player ordering drag-drop initialized');
        }).catch(err => {
            logger.error('Failed to load ordering drag-drop module:', err);
        });
    }

    /**
     * Clear all question content and reset display state
     */
    clearQuestionContent() {
        logger.debug('Clearing question content');

        // Use display manager to clear question display
        this.displayManager.clearQuestionDisplay();

        // Clear any multiple correct instructions
        document.querySelectorAll('.multiple-correct-instruction').forEach(instruction => {
            instruction.remove();
        });

        // Clear any additional question-specific content
        this.clearAnswerSelections();
        this.resetOptionStyles();

        logger.debug('Question content cleared');
    }

    /**
     * Clear any selected answers and reset selection state
     */
    clearAnswerSelections() {
        // Clear multiple choice selections
        document.querySelectorAll('.player-option.selected').forEach(option => {
            option.classList.remove('selected');
        });

        // Clear checkbox selections
        document.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
            checkbox.checked = false;
        });

        // Clear numeric input
        const numericInput = document.querySelector('input[type="number"]');
        if (numericInput) {
            numericInput.value = '';
        }

        // Clear true/false selections
        document.querySelectorAll('.tf-option.selected').forEach(option => {
            option.classList.remove('selected');
        });
    }

    /**
     * Reset all option styles to default state
     */
    resetOptionStyles() {
        // Reset all player options
        document.querySelectorAll('.player-option').forEach(option => {
            option.classList.remove('selected', 'correct', 'incorrect');
            option.style.background = '';
            option.style.border = '';
            option.style.transform = '';
        });

        // Reset checkbox options
        document.querySelectorAll('.checkbox-option').forEach(option => {
            option.classList.remove('selected', 'correct', 'incorrect');
        });

        // Reset true/false options
        document.querySelectorAll('.tf-option').forEach(option => {
            option.classList.remove('selected', 'correct', 'incorrect');
            option.style.background = '';
            option.style.border = '';
        });

        // Reset host option displays
        document.querySelectorAll('.option-display').forEach(option => {
            option.classList.remove('correct', 'incorrect');
            option.style.display = 'block';
        });
    }
}