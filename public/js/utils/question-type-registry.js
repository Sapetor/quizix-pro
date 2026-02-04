/**
 * Question Type Registry
 *
 * Single source of truth for all question type definitions.
 * Eliminates scattered logic across 40+ code locations in 13+ files.
 *
 * This centralizes:
 * - Container IDs for different contexts (player, host, preview)
 * - DOM selectors for options, answers, inputs
 * - Data extraction from quiz editor
 * - Question population into editor
 * - Validation rules
 * - Answer scoring logic
 * - Rendering methods for host/player/preview contexts (NEW)
 * - Answer extraction from player input (NEW)
 *
 * Benefits:
 * - Adding new question type: 8 hours → 30 minutes
 * - Single place to update question logic
 * - Eliminates ~500 lines of duplicate code
 * - Consistent behavior across all contexts
 */

import { logger } from '../core/config.js';

/**
 * Fisher-Yates shuffle algorithm for randomizing arrays
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Question type definitions
 */
const QUESTION_TYPES = {
    'multiple-choice': {
        id: 'multiple-choice',
        label: 'Multiple Choice',

        // Container IDs for different rendering contexts
        containerIds: {
            player: 'player-multiple-choice',
            host: 'host-multiple-choice',
            preview: 'preview-multiple-choice'
        },

        // DOM selectors for quiz editor context
        selectors: {
            optionsContainer: '.multiple-choice-options',
            options: '.multiple-choice-options .option',
            correctMarker: '.correct',
            answerRadio: 'input[name="answer"]'
        },

        // DOM selectors for player gameplay context
        playerSelectors: {
            optionsContainer: '.player-options'
        },

        /**
         * Extract question data from quiz editor DOM
         * Used by: QuizManager, PreviewManager
         */
        extractData: (questionElement) => {
            const optionsContainer = questionElement.querySelector('.multiple-choice-options');
            if (!optionsContainer) {
                return { options: [], correctIndex: 0 };
            }

            // Get all options including empty ones to track original positions
            const allOptionInputs = Array.from(optionsContainer.querySelectorAll('.option'));
            const allOptions = allOptionInputs.map(opt => opt.value.trim());

            // Filter to non-empty options and track index mapping
            const indexMap = []; // Maps new index to original index
            const options = [];
            allOptions.forEach((opt, originalIndex) => {
                if (opt) {
                    indexMap.push(originalIndex);
                    options.push(opt);
                }
            });

            // Get correct answer from <select class="correct-answer">
            const correctAnswerElement = optionsContainer.querySelector('.correct-answer');
            const originalCorrectIndex = correctAnswerElement ? parseInt(correctAnswerElement.value) : 0;

            // Remap correct index to filtered array position
            let correctIndex = indexMap.indexOf(originalCorrectIndex);
            if (correctIndex === -1) {
                // Original correct answer was empty/removed, default to first option
                correctIndex = 0;
            }

            return {
                options,
                correctIndex: isNaN(correctIndex) ? 0 : correctIndex
            };
        },

        /**
         * Populate question into quiz editor DOM
         * Used by: QuizManager when loading quiz
         */
        populateQuestion: (questionElement, data) => {
            const optionsContainer = questionElement.querySelector('.multiple-choice-options');
            if (!optionsContainer) return;

            const optionInputs = optionsContainer.querySelectorAll('.option');
            const correctAnswerSelect = optionsContainer.querySelector('.correct-answer');

            data.options.forEach((optionText, index) => {
                if (optionInputs[index]) {
                    optionInputs[index].value = optionText;

                    // Mark correct answer
                    if (index === data.correctIndex) {
                        optionInputs[index].classList.add('correct');
                    } else {
                        optionInputs[index].classList.remove('correct');
                    }
                }
            });

            // Set the correct-answer select dropdown to the correct index
            if (correctAnswerSelect && data.correctIndex !== undefined) {
                correctAnswerSelect.value = String(data.correctIndex);
                logger.debug('Set correct-answer select to index:', data.correctIndex);
            }
        },

        /**
         * Validate question data
         * Used by: QuizManager, server.js
         */
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

        /**
         * Score player answer
         * Used by: server.js Game class
         */
        scoreAnswer: (playerAnswer, correctAnswer) => {
            return playerAnswer === correctAnswer;
        },

        /**
         * Render options for host display
         * @param {Object} data - Question data with options array
         * @param {HTMLElement} container - Container element to render into
         * @param {Object} helpers - Helper functions { escapeHtml, formatCodeBlocks, translationManager, COLORS }
         */
        renderHostOptions: (data, container, helpers) => {
            const { escapeHtmlPreservingLatex, formatCodeBlocks, translationManager } = helpers;
            container.innerHTML = `
                <div class="option-display" data-option="0"></div>
                <div class="option-display" data-option="1"></div>
                <div class="option-display" data-option="2"></div>
                <div class="option-display" data-option="3"></div>
            `;
            container.classList.remove('hidden');
            const options = container.querySelectorAll('.option-display');

            if (data.options) {
                data.options.forEach((option, index) => {
                    if (options[index]) {
                        const optionText = option != null ? option : '';
                        const safeOptionText = escapeHtmlPreservingLatex(optionText);
                        options[index].innerHTML = `${translationManager.getOptionLetter(index)}: ${formatCodeBlocks(safeOptionText)}`;
                        options[index].classList.add('tex2jax_process');
                        options[index].classList.remove('hidden');
                    }
                });
                // Hide unused options
                for (let i = data.options.length; i < 4; i++) {
                    if (options[i]) options[i].classList.add('hidden');
                }
            }
        },

        /**
         * Render options for player interaction
         * @param {Object} data - Question data with options array
         * @param {HTMLElement} container - Container element to render into
         * @param {Object} helpers - Helper functions
         */
        renderPlayerOptions: (data, container, helpers) => {
            const { escapeHtmlPreservingLatex, formatCodeBlocks, translationManager } = helpers;
            let existingButtons = container.querySelectorAll('.player-option');

            // If no existing buttons found, create them dynamically (fixes mobile DOM issues)
            if (existingButtons.length === 0 && data.options) {
                container.innerHTML = '';
                for (let i = 0; i < Math.max(data.options.length, 4); i++) {
                    const button = document.createElement('button');
                    button.className = 'player-option';
                    button.setAttribute('data-option', i.toString());
                    if (i >= data.options.length) button.classList.add('hidden');
                    container.appendChild(button);
                }
                existingButtons = container.querySelectorAll('.player-option');
            }

            if (data.options) {
                existingButtons.forEach((button, index) => {
                    if (index < data.options.length) {
                        const safeOption = escapeHtmlPreservingLatex(data.options[index] || '');
                        button.innerHTML = `<span class="option-letter">${translationManager.getOptionLetter(index)}:</span> ${formatCodeBlocks(safeOption)}`;
                        button.setAttribute('data-answer', index.toString());
                        button.classList.remove('selected', 'disabled', 'hidden');
                        button.classList.add('tex2jax_process');
                    } else {
                        button.classList.add('hidden');
                    }
                });
            }
        },

        /**
         * Extract player's answer from the container
         * @param {HTMLElement} container - Container with player's selection
         * @returns {number|null} Selected answer index or null
         */
        extractAnswer: (container) => {
            const selected = container.querySelector('.player-option.selected');
            return selected ? parseInt(selected.dataset.answer) : null;
        }
    },

    'multiple-correct': {
        id: 'multiple-correct',
        label: 'Multiple Correct',

        containerIds: {
            player: 'player-multiple-correct',
            host: 'host-multiple-correct',
            preview: 'preview-multiple-correct'
        },

        selectors: {
            optionsContainer: '.multiple-correct-options',
            options: '.multiple-correct-options .option',
            correctMarker: '.correct',
            answerCheckbox: 'input[type="checkbox"]'
        },

        playerSelectors: {
            optionsContainer: '.player-checkbox-options'
        },

        extractData: (questionElement) => {
            const optionsContainer = questionElement.querySelector('.multiple-correct-options');
            if (!optionsContainer) {
                return { options: [], correctIndices: [] };
            }

            // Get all options including empty ones to track original positions
            const allOptionInputs = Array.from(optionsContainer.querySelectorAll('.option'));
            const allOptions = allOptionInputs.map(opt => opt.value.trim());

            // Filter to non-empty options and track index mapping
            const indexMap = []; // Maps new index to original index
            const options = [];
            allOptions.forEach((opt, originalIndex) => {
                if (opt) {
                    indexMap.push(originalIndex);
                    options.push(opt);
                }
            });

            // Get correct answers from checked checkboxes and remap to filtered positions
            const correctIndices = [];
            const correctCheckboxes = optionsContainer.querySelectorAll('.correct-option:checked');
            correctCheckboxes.forEach(checkbox => {
                const originalIndex = parseInt(checkbox.dataset.option);
                const newIndex = indexMap.indexOf(originalIndex);
                // Only include if the original index maps to a non-empty option
                if (newIndex !== -1) {
                    correctIndices.push(newIndex);
                }
            });

            return { options, correctIndices };
        },

        populateQuestion: (questionElement, data) => {
            const optionsContainer = questionElement.querySelector('.multiple-correct-options');
            if (!optionsContainer) return;

            const optionInputs = optionsContainer.querySelectorAll('.option');
            const correctCheckboxes = optionsContainer.querySelectorAll('.correct-option');

            data.options.forEach((optionText, index) => {
                if (optionInputs[index]) {
                    optionInputs[index].value = optionText;
                }
            });

            // Uncheck all checkboxes first
            correctCheckboxes.forEach(cb => cb.checked = false);

            // Check the correct ones
            if (data.correctIndices && Array.isArray(data.correctIndices)) {
                data.correctIndices.forEach(correctIndex => {
                    if (correctCheckboxes[correctIndex]) {
                        correctCheckboxes[correctIndex].checked = true;
                    }
                });
            }
        },

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

            // Validate all indices are within bounds
            const allValid = data.correctIndices.every(idx => idx >= 0 && idx < data.options.length);
            if (!allValid) {
                return { valid: false, error: 'Invalid correct answer indices' };
            }

            return { valid: true };
        },

        scoreAnswer: (playerAnswer, correctAnswer) => {
            // playerAnswer and correctAnswer are arrays of indices
            if (!Array.isArray(playerAnswer) || !Array.isArray(correctAnswer)) {
                return false;
            }

            // Sort both arrays for comparison
            const sortedPlayer = [...playerAnswer].sort((a, b) => a - b);
            const sortedCorrect = [...correctAnswer].sort((a, b) => a - b);

            // Check if arrays are equal
            if (sortedPlayer.length !== sortedCorrect.length) {
                return false;
            }

            return sortedPlayer.every((val, index) => val === sortedCorrect[index]);
        },

        renderHostOptions: (data, container, helpers) => {
            const { escapeHtmlPreservingLatex, formatCodeBlocks, translationManager } = helpers;
            container.innerHTML = `
                <div class="option-display" data-option="0" data-multiple="true"></div>
                <div class="option-display" data-option="1" data-multiple="true"></div>
                <div class="option-display" data-option="2" data-multiple="true"></div>
                <div class="option-display" data-option="3" data-multiple="true"></div>
            `;
            container.classList.remove('hidden');
            const options = container.querySelectorAll('.option-display');

            if (data.options) {
                data.options.forEach((option, index) => {
                    if (options[index]) {
                        const optionText = option != null ? option : '';
                        const safeOptionText = escapeHtmlPreservingLatex(optionText);
                        options[index].innerHTML = `${translationManager.getOptionLetter(index)}: ${formatCodeBlocks(safeOptionText)}`;
                        options[index].classList.add('tex2jax_process');
                        options[index].classList.remove('hidden');
                    }
                });
                for (let i = data.options.length; i < 4; i++) {
                    if (options[i]) options[i].classList.add('hidden');
                }
            }
        },

        renderPlayerOptions: (data, container, helpers) => {
            const { escapeHtmlPreservingLatex, formatCodeBlocks, translationManager } = helpers;
            const checkboxLabels = container.querySelectorAll('.checkbox-option');

            checkboxLabels.forEach((label, index) => {
                if (data.options && data.options[index]) {
                    const safeOption = escapeHtmlPreservingLatex(data.options[index]);
                    const formattedOption = formatCodeBlocks(safeOption);
                    label.innerHTML = `<input type="checkbox" class="option-checkbox"> ${translationManager.getOptionLetter(index)}: ${formattedOption}`;
                    label.setAttribute('data-option', index);
                    label.classList.remove('hidden');
                } else {
                    label.classList.add('hidden');
                }
            });
        },

        extractAnswer: (container) => {
            const selectedCheckboxes = container.querySelectorAll('.option-checkbox:checked');
            return Array.from(selectedCheckboxes).map(cb => {
                const parentLabel = cb.closest('.checkbox-option');
                return parseInt(parentLabel.getAttribute('data-option'));
            });
        }
    },

    'true-false': {
        id: 'true-false',
        label: 'True/False',

        containerIds: {
            player: 'player-true-false',
            host: 'host-true-false',
            preview: 'preview-true-false'
        },

        selectors: {
            optionsContainer: '.true-false-options',
            trueButton: '.tf-option[data-value="true"]',
            falseButton: '.tf-option[data-value="false"]',
            correctMarker: '.correct'
        },

        playerSelectors: {
            optionsContainer: '.true-false-options'
        },

        extractData: (questionElement) => {
            // Get correct answer from <select class="correct-answer">
            const correctAnswerElement = questionElement.querySelector('.true-false-options .correct-answer');
            const correctAnswer = correctAnswerElement ? correctAnswerElement.value === 'true' : false;

            return { correctAnswer };
        },

        populateQuestion: (questionElement, data) => {
            // Set value in <select class="correct-answer">
            const correctAnswerElement = questionElement.querySelector('.true-false-options .correct-answer');
            if (correctAnswerElement && data.correctAnswer !== undefined) {
                correctAnswerElement.value = data.correctAnswer ? 'true' : 'false';
            }
        },

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
            return playerAnswer === correctAnswer;
        },

        renderHostOptions: (data, container, helpers) => {
            const { translationManager } = helpers;
            // Use getTrueFalseText if available, otherwise fall back to sync method
            const tfText = typeof translationManager.getTrueFalseText === 'function'
                ? translationManager.getTrueFalseText()
                : { true: translationManager.getTranslationSync?.('true') || 'True', false: translationManager.getTranslationSync?.('false') || 'False' };
            container.innerHTML = `
                <div class="true-false-options">
                    <div class="tf-option true-btn" data-answer="true">${tfText.true}</div>
                    <div class="tf-option false-btn" data-answer="false">${tfText.false}</div>
                </div>
            `;
            container.classList.remove('hidden');
        },

        renderPlayerOptions: (data, container, helpers) => {
            // True/false uses existing DOM structure, just reset states
            const buttons = container.querySelectorAll('.tf-option');
            buttons.forEach(button => {
                button.classList.remove('selected', 'disabled');
            });
        },

        extractAnswer: (container) => {
            const selected = container.querySelector('.tf-option.selected');
            if (!selected) return null;
            return selected.dataset.answer === 'true';
        }
    },

    'numeric': {
        id: 'numeric',
        label: 'Numeric',

        containerIds: {
            player: 'player-numeric',
            host: 'host-numeric',
            preview: 'preview-numeric'
        },

        selectors: {
            answerInput: '.numeric-answer-input',
            toleranceInput: '.numeric-tolerance-input',
            numericContainer: '.numeric-question-container'
        },

        playerSelectors: {
            optionsContainer: '.numeric-input-container'
        },

        extractData: (questionElement) => {
            // Use correct selectors matching HTML structure
            const answerInput = questionElement.querySelector('.numeric-answer');
            const toleranceInput = questionElement.querySelector('.numeric-tolerance');

            const correctAnswer = answerInput ? parseFloat(answerInput.value) : 0;
            const tolerance = toleranceInput ? parseFloat(toleranceInput.value) : 0.1;

            return {
                correctAnswer: isNaN(correctAnswer) ? 0 : correctAnswer,
                tolerance: isNaN(tolerance) ? 0.1 : tolerance
            };
        },

        populateQuestion: (questionElement, data) => {
            // Use correct selectors matching HTML structure
            const answerInput = questionElement.querySelector('.numeric-answer');
            const toleranceInput = questionElement.querySelector('.numeric-tolerance');

            if (answerInput && data.correctAnswer !== undefined && data.correctAnswer !== null) {
                answerInput.value = data.correctAnswer;
            }

            if (toleranceInput && data.tolerance !== undefined) {
                toleranceInput.value = data.tolerance;
            }
        },

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

        renderHostOptions: (data, container, _helpers) => {
            // Numeric questions have no host options to display
            container.classList.add('hidden');
        },

        renderPlayerOptions: (data, container, helpers) => {
            const { translationManager } = helpers;
            const input = container.querySelector('#numeric-answer-input');
            const submitButton = container.querySelector('#submit-numeric');

            if (input) {
                input.value = '';
                input.disabled = false;
                const translation = translationManager.getTranslationSync
                    ? translationManager.getTranslationSync('enter_numeric_answer')
                    : 'Enter your answer';
                input.placeholder = translation || 'Enter your answer';
            }

            if (submitButton) {
                submitButton.disabled = false;
            }
        },

        extractAnswer: (container) => {
            const input = container.querySelector('#numeric-answer-input');
            if (!input) return null;
            const value = parseFloat(input.value);
            return isNaN(value) ? null : value;
        }
    },

    'ordering': {
        id: 'ordering',
        label: 'Ordering',

        containerIds: {
            player: 'player-ordering',
            host: 'host-ordering',
            preview: 'preview-ordering'
        },

        selectors: {
            optionsContainer: '.ordering-options',
            options: '.ordering-options .ordering-option',
            orderingContainer: '.ordering-container'
        },

        playerSelectors: {
            optionsContainer: '.ordering-container'
        },

        extractData: (questionElement) => {
            const optionsContainer = questionElement.querySelector('.ordering-options');
            if (!optionsContainer) {
                return { options: [], correctOrder: [] };
            }

            const options = Array.from(optionsContainer.querySelectorAll('.ordering-option'))
                .map(opt => opt.value.trim())
                .filter(opt => opt);

            // Correct order is the original order (indices)
            const correctOrder = options.map((_, index) => index);

            return { options, correctOrder };
        },

        populateQuestion: (questionElement, data) => {
            const optionsContainer = questionElement.querySelector('.ordering-options');
            if (!optionsContainer) return;

            const optionInputs = optionsContainer.querySelectorAll('.ordering-option');

            data.options.forEach((optionText, index) => {
                if (optionInputs[index]) {
                    optionInputs[index].value = optionText;
                }
            });
        },

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

        scoreAnswer: (playerOrder, correctOrder) => {
            // Both are arrays of indices
            if (!Array.isArray(playerOrder) || !Array.isArray(correctOrder)) {
                return false;
            }

            if (playerOrder.length !== correctOrder.length) {
                return false;
            }

            return playerOrder.every((val, index) => val === correctOrder[index]);
        },

        renderHostOptions: (data, container, helpers) => {
            const { escapeHtmlPreservingLatex, formatCodeBlocks, COLORS } = helpers;
            if (!data.options || data.options.length === 0) {
                container.classList.add('hidden');
                return;
            }

            // Shuffle indices for display
            const shuffledIndices = shuffleArray(data.options.map((_, i) => i));
            const itemColors = COLORS?.ORDERING_ITEM_COLORS || [
                'rgba(59, 130, 246, 0.15)',
                'rgba(16, 185, 129, 0.15)',
                'rgba(245, 158, 11, 0.15)',
                'rgba(239, 68, 68, 0.15)',
                'rgba(139, 92, 246, 0.15)',
                'rgba(236, 72, 153, 0.15)'
            ];

            let html = '<div class="ordering-display">';
            shuffledIndices.forEach((originalIndex, displayIndex) => {
                const option = data.options[originalIndex];
                const safeOption = escapeHtmlPreservingLatex(option || '');
                const bgColor = itemColors[originalIndex % itemColors.length];
                html += `
                    <div class="ordering-display-item" data-original-index="${originalIndex}" data-order-index="${displayIndex}" style="background: ${bgColor};">
                        <div class="ordering-item-number">${displayIndex + 1}</div>
                        <div class="ordering-item-content">${formatCodeBlocks(safeOption)}</div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
            container.classList.remove('hidden');
        },

        renderPlayerOptions: (data, container, helpers) => {
            const { escapeHtmlPreservingLatex, formatCodeBlocks, translationManager, COLORS } = helpers;
            if (!data.options || data.options.length === 0) {
                return;
            }

            const shuffledIndices = shuffleArray(data.options.map((_, i) => i));
            const itemColors = COLORS?.ORDERING_ITEM_COLORS || [
                'rgba(59, 130, 246, 0.15)',
                'rgba(16, 185, 129, 0.15)',
                'rgba(245, 158, 11, 0.15)',
                'rgba(239, 68, 68, 0.15)',
                'rgba(139, 92, 246, 0.15)',
                'rgba(236, 72, 153, 0.15)'
            ];

            let html = `
                <div class="ordering-player-instruction" data-translate="ordering_player_instruction"></div>
                <div class="ordering-display" id="player-ordering-container">
            `;

            shuffledIndices.forEach((originalIndex, displayIndex) => {
                const option = data.options[originalIndex];
                const safeOption = escapeHtmlPreservingLatex(option || '');
                const bgColor = itemColors[originalIndex % itemColors.length];
                html += `
                    <div class="ordering-display-item" data-original-index="${originalIndex}" data-order-index="${displayIndex}" style="background: ${bgColor};">
                        <div class="ordering-item-number">${displayIndex + 1}</div>
                        <div class="ordering-item-content">${formatCodeBlocks(safeOption)}</div>
                    </div>
                `;
            });

            html += `
                </div>
                <button class="ordering-submit-button btn primary" id="submit-ordering" data-translate="submit_answer"></button>
            `;

            container.innerHTML = html;
            container.classList.add('visible-flex');

            // Translate dynamic content
            if (translationManager?.translateContainer) {
                translationManager.translateContainer(container);
            }
        },

        extractAnswer: (container) => {
            const orderingContainer = container.querySelector('#player-ordering-container');
            if (!orderingContainer) return null;
            const items = orderingContainer.querySelectorAll('.ordering-display-item');
            return Array.from(items).map(item => parseInt(item.dataset.originalIndex));
        }
    }
};

/**
 * QuestionTypeRegistry - Public API
 *
 * Use this class to interact with question type definitions.
 * Never access QUESTION_TYPES directly.
 */
export class QuestionTypeRegistry {

    /**
     * Get question type definition by ID
     * @param {string} typeId - Question type ID
     * @returns {Object} Question type definition
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
     * Get all question type definitions
     * @returns {Array} Array of question type definitions
     */
    static getAllTypes() {
        return Object.values(QUESTION_TYPES);
    }

    /**
     * Get all question type IDs
     * @returns {Array} Array of question type ID strings
     */
    static getTypeIds() {
        return Object.keys(QUESTION_TYPES);
    }

    /**
     * Check if question type exists
     * @param {string} typeId - Question type ID
     * @returns {boolean} True if type exists
     */
    static isValidType(typeId) {
        return typeId in QUESTION_TYPES;
    }

    /**
     * Get container ID for specific context
     * @param {string} typeId - Question type ID
     * @param {string} context - Context: 'player', 'host', or 'preview'
     * @returns {string} Container ID
     */
    static getContainerId(typeId, context = 'player') {
        const type = this.getType(typeId);
        return type.containerIds[context] || type.containerIds.player;
    }

    /**
     * Get selectors for question type
     * @param {string} typeId - Question type ID
     * @returns {Object} Selectors object
     */
    static getSelectors(typeId) {
        return this.getType(typeId).selectors;
    }

    /**
     * Extract question data from DOM element
     * @param {string} typeId - Question type ID
     * @param {HTMLElement} element - Question DOM element
     * @returns {Object} Extracted question data
     */
    static extractData(typeId, element) {
        try {
            return this.getType(typeId).extractData(element);
        } catch (error) {
            logger.error(`Error extracting data for type ${typeId}:`, error);
            return {};
        }
    }

    /**
     * Populate question into DOM element
     * @param {string} typeId - Question type ID
     * @param {HTMLElement} element - Question DOM element
     * @param {Object} data - Question data
     */
    static populateQuestion(typeId, element, data) {
        try {
            this.getType(typeId).populateQuestion(element, data);
        } catch (error) {
            logger.error(`Error populating question for type ${typeId}:`, error);
        }
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
     * @returns {boolean} True if answer is correct
     */
    static scoreAnswer(typeId, playerAnswer, correctAnswer, options = {}) {
        try {
            const type = this.getType(typeId);

            // For numeric questions, pass tolerance
            if (typeId === 'numeric' && options.tolerance !== undefined) {
                return type.scoreAnswer(playerAnswer, correctAnswer, options.tolerance);
            }

            return type.scoreAnswer(playerAnswer, correctAnswer);
        } catch (error) {
            logger.error(`Error scoring answer for type ${typeId}:`, error);
            return false;
        }
    }

    /**
     * Get label for question type (for UI display)
     * @param {string} typeId - Question type ID
     * @returns {string} Human-readable label
     */
    static getLabel(typeId) {
        return this.getType(typeId).label;
    }

    /**
     * Get player container configuration for gameplay
     * Returns { containerId, optionsSelector } for setting up player UI
     * @param {string} typeId - Question type ID
     * @returns {Object} Container configuration
     */
    static getPlayerContainerConfig(typeId) {
        try {
            const type = this.getType(typeId);
            return {
                containerId: type.containerIds.player,
                optionsSelector: type.playerSelectors.optionsContainer
            };
        } catch (error) {
            logger.error(`Error getting player container config for type ${typeId}:`, error);
            return null;
        }
    }

    /**
     * Render host options using the registry
     * @param {string} typeId - Question type ID
     * @param {Object} data - Question data
     * @param {HTMLElement} container - Container to render into
     * @param {Object} helpers - Helper functions { escapeHtml, formatCodeBlocks, translationManager, COLORS }
     */
    static renderHostOptions(typeId, data, container, helpers) {
        try {
            const type = this.getType(typeId);
            if (type.renderHostOptions) {
                type.renderHostOptions(data, container, helpers);
            } else {
                logger.warn(`No renderHostOptions defined for type ${typeId}`);
            }
        } catch (error) {
            logger.error(`Error rendering host options for type ${typeId}:`, error);
        }
    }

    /**
     * Render player options using the registry
     * @param {string} typeId - Question type ID
     * @param {Object} data - Question data
     * @param {HTMLElement} container - Container to render into
     * @param {Object} helpers - Helper functions { escapeHtml, formatCodeBlocks, translationManager, COLORS }
     */
    static renderPlayerOptions(typeId, data, container, helpers) {
        try {
            const type = this.getType(typeId);
            if (type.renderPlayerOptions) {
                type.renderPlayerOptions(data, container, helpers);
            } else {
                logger.warn(`No renderPlayerOptions defined for type ${typeId}`);
            }
        } catch (error) {
            logger.error(`Error rendering player options for type ${typeId}:`, error);
        }
    }

    /**
     * Extract player's answer from container using the registry
     * @param {string} typeId - Question type ID
     * @param {HTMLElement} container - Container with player's selection
     * @returns {*} Extracted answer (type depends on question type)
     */
    static extractAnswer(typeId, container) {
        try {
            const type = this.getType(typeId);
            if (type.extractAnswer) {
                return type.extractAnswer(container);
            } else {
                logger.warn(`No extractAnswer defined for type ${typeId}`);
                return null;
            }
        } catch (error) {
            logger.error(`Error extracting answer for type ${typeId}:`, error);
            return null;
        }
    }

    /**
     * Get rendering methods for a question type
     * @param {string} typeId - Question type ID
     * @returns {Object} { renderHostOptions, renderPlayerOptions, extractAnswer }
     */
    static getRenderingMethods(typeId) {
        const type = this.getType(typeId);
        return {
            renderHostOptions: type.renderHostOptions,
            renderPlayerOptions: type.renderPlayerOptions,
            extractAnswer: type.extractAnswer
        };
    }
}

// Export both the class and the raw definitions (for advanced use cases)
export default QuestionTypeRegistry;
