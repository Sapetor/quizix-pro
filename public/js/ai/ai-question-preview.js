/**
 * AI Question Preview Module
 * Handles preview modal logic for AI-generated questions
 *
 * Extracted from generator.js for better maintainability
 */

import { logger } from '../core/config.js';
import { translationManager } from '../utils/translation-manager.js';
import { secureStorage } from '../services/secure-storage-service.js';
import { APIHelper } from '../utils/api-helper.js';
import { toastNotifications } from '../utils/toast-notifications.js';
import { openModal, closeModal } from '../utils/modal-utils.js';
import { dom } from '../utils/dom.js';

// Import prompt templates
import { buildSingleQuestionPrompt } from './prompts.js';

// Import HTML templates
import {
    buildOptionsHtml,
    buildQuestionCardHtml,
    buildQuestionEditHtml,
    buildOrderingEditHtml,
    buildChoiceEditHtml,
    buildNumericEditHtml,
    buildEditActionsHtml
} from './generator-templates.js';

/**
 * AIQuestionPreview class handles all preview modal functionality
 * for reviewing and editing AI-generated questions before adding them to quiz
 */
export class AIQuestionPreview {
    /**
     * @param {Object} generator - Reference to the main AIQuestionGenerator instance
     */
    constructor(generator) {
        this.generator = generator;
        this.previewQuestions = [];
        this.previewEventHandlers = {};
        this.previewListenersInitialized = false;
    }

    /**
     * Initialize preview modal event listeners
     */
    initializePreviewModalListeners() {
        const previewModal = dom.get('question-preview-modal');
        const closeBtn = dom.get('close-question-preview');
        const cancelBtn = dom.get('cancel-question-preview');
        const confirmBtn = dom.get('confirm-add-questions');
        const selectAllBtn = dom.get('select-all-questions');
        const deselectAllBtn = dom.get('deselect-all-questions');

        // Store handler references for cleanup
        this.previewEventHandlers.closeClick = () => this.closePreviewModal();
        this.previewEventHandlers.cancelClick = () => this.closePreviewModal();
        this.previewEventHandlers.confirmClick = () => this.confirmAddSelectedQuestions();
        this.previewEventHandlers.selectAllClick = () => this.selectAllQuestions(true);
        this.previewEventHandlers.deselectAllClick = () => this.selectAllQuestions(false);
        this.previewEventHandlers.modalClick = (e) => {
            if (e.target === previewModal) {
                this.closePreviewModal();
            }
        };

        if (closeBtn) {
            closeBtn.addEventListener('click', this.previewEventHandlers.closeClick);
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', this.previewEventHandlers.cancelClick);
        }
        if (confirmBtn) {
            confirmBtn.addEventListener('click', this.previewEventHandlers.confirmClick);
        }
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', this.previewEventHandlers.selectAllClick);
        }
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', this.previewEventHandlers.deselectAllClick);
        }
        if (previewModal) {
            previewModal.addEventListener('click', this.previewEventHandlers.modalClick);
        }
    }

    /**
     * Clean up preview modal event listeners
     */
    cleanup() {
        const previewModal = dom.get('question-preview-modal');
        const previewCloseBtn = dom.get('close-question-preview');
        const previewCancelBtn = dom.get('cancel-question-preview');
        const confirmBtn = dom.get('confirm-add-questions');
        const selectAllBtn = dom.get('select-all-questions');
        const deselectAllBtn = dom.get('deselect-all-questions');

        if (previewCloseBtn && this.previewEventHandlers.closeClick) {
            previewCloseBtn.removeEventListener('click', this.previewEventHandlers.closeClick);
        }
        if (previewCancelBtn && this.previewEventHandlers.cancelClick) {
            previewCancelBtn.removeEventListener('click', this.previewEventHandlers.cancelClick);
        }
        if (confirmBtn && this.previewEventHandlers.confirmClick) {
            confirmBtn.removeEventListener('click', this.previewEventHandlers.confirmClick);
        }
        if (selectAllBtn && this.previewEventHandlers.selectAllClick) {
            selectAllBtn.removeEventListener('click', this.previewEventHandlers.selectAllClick);
        }
        if (deselectAllBtn && this.previewEventHandlers.deselectAllClick) {
            deselectAllBtn.removeEventListener('click', this.previewEventHandlers.deselectAllClick);
        }
        if (previewModal && this.previewEventHandlers.modalClick) {
            previewModal.removeEventListener('click', this.previewEventHandlers.modalClick);
        }

        this.previewEventHandlers = {};
        this.previewListenersInitialized = false;
    }

    /**
     * Show the question preview modal with generated questions
     * @param {Array} questions - Array of generated question objects
     */
    showQuestionPreview(questions) {
        // Filter out malformed questions (missing required fields) with detailed logging
        const validQuestions = [];
        const malformedQuestions = [];

        questions.forEach((q, i) => {
            const issues = [];
            if (!q) issues.push('question is null/undefined');
            else {
                if (!q.question) issues.push('missing "question" text');
                if (!q.type) issues.push('missing "type"');

                // Only check for options on question types that require them
                const typesRequiringOptions = ['multiple-choice', 'multiple-correct', 'true-false', 'ordering'];
                if (typesRequiringOptions.includes(q.type)) {
                    if (!Array.isArray(q.options)) issues.push('missing or invalid "options" array');
                    else if (q.options.length === 0) issues.push('"options" array is empty');
                }

                // Auto-fix: multiple-correct with correctAnswer instead of correctAnswers
                if (q.type === 'multiple-correct' && q.correctAnswer !== undefined && !q.correctAnswers) {
                    logger.debug(`Auto-fixing question ${i + 1}: converting correctAnswer to correctAnswers array`);
                    q.correctAnswers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
                    delete q.correctAnswer;
                }

                // Auto-fix: correctAnswers might be letters ["A", "C"] instead of indices [0, 2]
                if (q.type === 'multiple-correct' && Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0) {
                    const firstAnswer = q.correctAnswers[0];
                    if (typeof firstAnswer === 'string' && /^[A-Fa-f]$/.test(firstAnswer)) {
                        logger.debug(`Auto-fixing question ${i + 1}: converting letter answers to indices`);
                        q.correctAnswers = q.correctAnswers.map(letter =>
                            letter.toUpperCase().charCodeAt(0) - 65
                        );
                    }
                }

                // Auto-fix: multiple-choice correctAnswer might be letter "A" instead of index 0
                if ((q.type === 'multiple-choice' || q.type === 'true-false') &&
                    typeof q.correctAnswer === 'string' && /^[A-Fa-f]$/.test(q.correctAnswer)) {
                    logger.debug(`Auto-fixing question ${i + 1}: converting letter answer "${q.correctAnswer}" to index`);
                    q.correctAnswer = q.correctAnswer.toUpperCase().charCodeAt(0) - 65;
                }

                // Validate correct answer based on question type
                if (q.type === 'multiple-choice') {
                    if (q.correctAnswer === undefined) {
                        issues.push('missing "correctAnswer" for multiple-choice');
                    }
                } else if (q.type === 'true-false') {
                    // true-false can have correctAnswer as number (0/1) or string ("true"/"false")
                    if (q.correctAnswer === undefined) {
                        issues.push('missing "correctAnswer" for true-false');
                    }
                } else if (q.type === 'multiple-correct') {
                    if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
                        issues.push('missing or empty "correctAnswers" array for multiple-correct');
                    }
                } else if (q.type === 'numeric') {
                    if (q.correctAnswer === undefined) {
                        issues.push('missing "correctAnswer" for numeric');
                    }
                }
            }

            if (issues.length === 0) {
                validQuestions.push(q);
            } else {
                malformedQuestions.push({ index: i, issues, data: q });
            }
        });

        if (validQuestions.length === 0) {
            toastNotifications.error(translationManager.getTranslationSync('error_generating') || 'Error generating questions');
            return;
        }

        if (malformedQuestions.length > 0) {
            logger.warn(`Filtered out ${malformedQuestions.length} malformed questions:`);
            malformedQuestions.forEach(({ index, issues, data }) => {
                logger.warn(`  Question ${index + 1}: ${issues.join(', ')}`);
                logger.warn('  Raw data:', JSON.stringify(data, null, 2));
            });
        }

        this.previewQuestions = validQuestions.map((q, index) => ({
            ...q,
            selected: true,  // All selected by default
            index: index
        }));

        const previewModal = dom.get('question-preview-modal');
        const previewList = dom.get('question-preview-list');

        if (!previewModal || !previewList) {
            logger.warn('Preview modal elements not found, falling back to direct processing');
            this.generator.processGeneratedQuestions(questions, false);
            return;
        }

        // Clear and render questions
        previewList.innerHTML = '';
        this.previewQuestions.forEach((question, index) => {
            const questionEl = this.renderPreviewQuestion(question, index);
            previewList.appendChild(questionEl);
        });

        // Update summary
        this.updatePreviewSummary();

        // Show the modal
        openModal(previewModal);

        // Initialize listeners if not already done
        if (!this.previewListenersInitialized) {
            this.initializePreviewModalListeners();
            this.previewListenersInitialized = true;
        }
    }

    /**
     * Render a single question for preview
     * @param {Object} question - Question data
     * @param {number} index - Question index
     * @returns {HTMLElement} - The question preview element
     */
    renderPreviewQuestion(question, index) {
        const div = document.createElement('div');
        div.className = `preview-question-item ${question.selected ? 'selected' : 'rejected'}`;
        div.dataset.index = index;

        // Build options HTML and full card using template functions
        const optionsHtml = buildOptionsHtml(question);
        div.innerHTML = buildQuestionCardHtml(question, index, optionsHtml);

        // Add click handler for checkbox
        const checkbox = div.querySelector('input[type="checkbox"]');
        checkbox?.addEventListener('change', (e) => {
            e.stopPropagation();
            this.toggleQuestionSelection(index, e.target.checked);
        });

        // Toggle selection on card click (but not on checkbox or buttons)
        div.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox' &&
                !e.target.classList.contains('ai-edit-btn') &&
                !e.target.classList.contains('ai-regenerate-btn') &&
                !e.target.classList.contains('ai-save-btn') &&
                !e.target.classList.contains('ai-cancel-btn') &&
                !e.target.closest('.ai-edit-field')) {
                const newState = !this.previewQuestions[index].selected;
                this.toggleQuestionSelection(index, newState);
                if (checkbox) checkbox.checked = newState;
            }
        });

        // Add edit button handler
        const editBtn = div.querySelector('.ai-edit-btn');
        editBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.enterEditMode(index);
        });

        // Add regenerate button handler
        const regenerateBtn = div.querySelector('.ai-regenerate-btn');
        regenerateBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.regenerateSingleQuestion(index);
        });

        return div;
    }

    /**
     * Toggle selection state of a question
     * @param {number} index - Question index
     * @param {boolean} selected - New selection state
     */
    toggleQuestionSelection(index, selected) {
        if (!this.previewQuestions[index]) return;

        this.previewQuestions[index].selected = selected;

        // Update visual state
        const item = document.querySelector(`.preview-question-item[data-index="${index}"]`);
        if (item) {
            item.classList.toggle('selected', selected);
            item.classList.toggle('rejected', !selected);
        }

        this.updatePreviewSummary();
    }

    /**
     * Select or deselect all questions
     * @param {boolean} select - True to select all, false to deselect all
     */
    selectAllQuestions(select) {
        this.previewQuestions.forEach((q, index) => {
            q.selected = select;
            const item = document.querySelector(`.preview-question-item[data-index="${index}"]`);
            if (item) {
                item.classList.toggle('selected', select);
                item.classList.toggle('rejected', !select);
            }
        });
        this.updatePreviewSummary();
    }

    /**
     * Update the preview summary with selected count
     */
    updatePreviewSummary() {
        const selectedCount = this.previewQuestions.filter(q => q.selected).length;
        const totalCount = this.previewQuestions.length;

        const selectedCountEl = dom.get('selected-count');
        const totalCountEl = dom.get('total-generated-count');
        const confirmBtn = dom.get('confirm-add-questions');

        if (selectedCountEl) selectedCountEl.textContent = selectedCount;
        if (totalCountEl) totalCountEl.textContent = totalCount;
        if (confirmBtn) confirmBtn.disabled = selectedCount === 0;
    }

    /**
     * Close the preview modal
     */
    closePreviewModal() {
        const previewModal = dom.get('question-preview-modal');
        if (previewModal) {
            closeModal(previewModal);
        }
        this.previewQuestions = [];
    }

    /**
     * Enter edit mode for a specific question
     * @param {number} index - Question index
     */
    enterEditMode(index) {
        const question = this.previewQuestions[index];
        if (!question) return;

        const item = document.querySelector(`.preview-question-item[data-index="${index}"]`);
        if (!item) return;

        item.classList.add('editing');

        // Replace question text with editable field
        const questionTextEl = item.querySelector('.ai-preview-question-text');
        if (questionTextEl) {
            questionTextEl.innerHTML = buildQuestionEditHtml(question.question);
        }

        // Replace options with editable fields (for types that have options)
        const optionsEl = item.querySelector('.ai-preview-options');
        if (optionsEl && question.options) {
            if (question.type === 'ordering') {
                optionsEl.innerHTML = buildOrderingEditHtml(question);
            } else {
                optionsEl.innerHTML = buildChoiceEditHtml(question, index);
            }
        } else if (optionsEl && question.type === 'numeric') {
            optionsEl.innerHTML = buildNumericEditHtml(question);
        }

        // Replace action buttons with save/cancel
        const actionsEl = item.querySelector('.ai-preview-actions');
        if (actionsEl) {
            actionsEl.innerHTML = buildEditActionsHtml(index);

            // Add handlers
            actionsEl.querySelector('.ai-save-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.saveQuestionEdits(index);
            });
            actionsEl.querySelector('.ai-cancel-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cancelEditMode(index);
            });
        }
    }

    /**
     * Save edits to a question
     * @param {number} index - Question index
     */
    saveQuestionEdits(index) {
        const question = this.previewQuestions[index];
        if (!question) return;

        const item = document.querySelector(`.preview-question-item[data-index="${index}"]`);
        if (!item) return;

        // Get edited question text
        const questionInput = item.querySelector('.ai-edit-question');
        if (questionInput) {
            question.question = questionInput.value.trim();
        }

        // Get edited options
        const optionInputs = item.querySelectorAll('.ai-edit-option');
        if (optionInputs.length > 0) {
            question.options = Array.from(optionInputs).map(input => input.value.trim());

            // Get correct answer(s)
            if (question.type === 'multiple-correct') {
                const checkedInputs = item.querySelectorAll('.ai-edit-correct:checked');
                question.correctAnswers = Array.from(checkedInputs).map(input => parseInt(input.value));
            } else if (question.type === 'true-false') {
                // True-false needs "true"/"false" string, not index
                const checkedInput = item.querySelector('.ai-edit-correct:checked');
                if (checkedInput) {
                    question.correctAnswer = parseInt(checkedInput.value) === 0 ? 'true' : 'false';
                }
            } else if (question.type === 'ordering') {
                // Ordering uses number inputs for position - build correctOrder array
                const orderInputs = item.querySelectorAll('.ai-edit-order');
                const positions = Array.from(orderInputs).map(input => ({
                    itemIndex: parseInt(input.dataset.index),
                    position: parseInt(input.value)
                }));
                // Sort by position and extract item indices to get correctOrder
                positions.sort((a, b) => a.position - b.position);
                question.correctOrder = positions.map(p => p.itemIndex);
            } else {
                const checkedInput = item.querySelector('.ai-edit-correct:checked');
                if (checkedInput) {
                    question.correctAnswer = parseInt(checkedInput.value);
                }
            }
        }

        // Get numeric answer
        const numericInput = item.querySelector('.ai-edit-numeric');
        if (numericInput) {
            question.correctAnswer = parseFloat(numericInput.value);
        }
        const toleranceInput = item.querySelector('.ai-edit-tolerance');
        if (toleranceInput) {
            question.tolerance = parseFloat(toleranceInput.value) || 0;
        }

        // Re-render the question
        this.cancelEditMode(index);
        toastNotifications.success('Question updated');
    }

    /**
     * Cancel edit mode and restore original view
     * @param {number} index - Question index
     */
    cancelEditMode(index) {
        const item = document.querySelector(`.preview-question-item[data-index="${index}"]`);
        if (!item) return;

        // Re-render the question item
        const newItem = this.renderPreviewQuestion(this.previewQuestions[index], index);
        item.replaceWith(newItem);
    }

    /**
     * Regenerate a single question
     * @param {number} index - Question index
     */
    async regenerateSingleQuestion(index) {
        const question = this.previewQuestions[index];
        if (!question) return;

        const item = document.querySelector(`.preview-question-item[data-index="${index}"]`);
        if (!item) return;

        // Show loading state
        const regenerateBtn = item.querySelector('.ai-regenerate-btn');
        if (regenerateBtn) {
            regenerateBtn.disabled = true;
            regenerateBtn.textContent = '\u23F3';
        }

        try {
            // Get current settings
            const provider = dom.get('ai-provider')?.value || 'ollama';
            const content = dom.get('source-content')?.value?.trim() || '';
            const difficulty = dom.get('difficulty-level')?.value || 'medium';

            // Build a prompt for a single question of the same type
            const singlePrompt = buildSingleQuestionPrompt(question.type, content, difficulty);

            // Generate one question
            let newQuestion;
            switch (provider) {
                case 'claude':
                    newQuestion = await this.regenerateWithClaude(singlePrompt, question.type);
                    break;
                case 'openai':
                    newQuestion = await this.regenerateWithProvider('openai', singlePrompt, question.type);
                    break;
                case 'gemini':
                    newQuestion = await this.regenerateWithProvider('gemini', singlePrompt, question.type);
                    break;
                default:
                    newQuestion = await this.regenerateWithProvider('ollama', singlePrompt, question.type);
            }

            if (newQuestion) {
                // Preserve selection state
                newQuestion.selected = question.selected;
                this.previewQuestions[index] = newQuestion;

                // Re-render
                const newItem = this.renderPreviewQuestion(newQuestion, index);
                item.replaceWith(newItem);

                toastNotifications.success('Question regenerated');
            } else {
                throw new Error('Failed to generate replacement question');
            }
        } catch (error) {
            logger.error('Regenerate single question failed:', error);
            toastNotifications.error('Failed to regenerate: ' + error.message);

            // Restore button
            if (regenerateBtn) {
                regenerateBtn.disabled = false;
                regenerateBtn.textContent = '\uD83D\uDD04';
            }
        }
    }

    /**
     * Regenerate with Claude specifically (uses prefill)
     * @param {string} prompt - The prompt
     * @param {string} _type - Question type (unused but kept for consistency)
     * @returns {Object} Generated question
     */
    async regenerateWithClaude(prompt, _type) {
        const apiKey = await secureStorage.getSecureItem('api_key_claude');
        const modelSelect = dom.get('claude-model');
        const selectedModel = modelSelect?.value || 'claude-sonnet-4-5';

        const response = await fetch(APIHelper.getApiUrl('api/claude/generate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                apiKey: apiKey,
                numQuestions: 1,
                model: selectedModel
            })
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data = await response.json();
        let content = data.content?.[0]?.text || data.content || '';

        // Prepend { for single question (prefill uses {)
        if (!content.trim().startsWith('{') && !content.trim().startsWith('[')) {
            content = '{' + content;
        }

        // Extract JSON object
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed;
        }

        throw new Error('Could not parse response');
    }

    /**
     * Regenerate with other providers
     * @param {string} provider - Provider name
     * @param {string} prompt - The prompt
     * @param {string} _type - Question type (unused but kept for consistency)
     * @returns {Object} Generated question
     */
    async regenerateWithProvider(provider, prompt, _type) {
        // Store original count and set to 1
        const originalCount = this.generator.requestedQuestionCount;
        this.generator.requestedQuestionCount = 1;

        try {
            let questions;
            switch (provider) {
                case 'openai':
                    questions = await this.generator.generateWithOpenAI(prompt);
                    break;
                case 'gemini':
                    questions = await this.generator.generateWithGemini(prompt);
                    break;
                default:
                    questions = await this.generator.generateWithOllama(prompt);
            }

            if (questions && questions.length > 0) {
                return questions[0];
            }
            throw new Error('No question generated');
        } finally {
            this.generator.requestedQuestionCount = originalCount;
        }
    }

    /**
     * Confirm and add selected questions to the quiz
     */
    async confirmAddSelectedQuestions() {
        const selectedQuestions = this.previewQuestions
            .filter(q => q.selected)
            .map(({ selected: _selected, index: _index, ...q }) => q); // Remove selection metadata

        if (selectedQuestions.length === 0) {
            toastNotifications.warning(translationManager.getTranslationSync('no_questions_selected') || 'No questions selected');
            return;
        }

        // Close preview modal
        this.closePreviewModal();

        // Close AI generator modal
        this.generator.closeModalMethod();

        // Process the selected questions
        await this.generator.processGeneratedQuestions(selectedQuestions, false);
        this.generator.batchProcessor.playCompletionChime();

        // Show success message using the imported showAlert
        const { showAlert } = await import('../utils/translation-manager.js');
        setTimeout(() => {
            showAlert('successfully_generated_questions', [selectedQuestions.length]);
        }, 100);
    }
}
