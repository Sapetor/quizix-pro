/**
 * AI Generator HTML Templates Module
 * Contains all HTML template functions for the AI question generator preview
 *
 * Extracted from generator.js as part of SIMP-2 refactoring
 */

import { escapeHtml } from '../utils/dom.js';
import { translationManager } from '../utils/translation-manager.js';
import { COLORS } from '../core/config.js';

// ============================================================================
// OPTION TEMPLATES
// ============================================================================

/**
 * Build HTML for a single option in the preview
 * @param {string} text - Option text
 * @param {number} index - Option index
 * @param {boolean} isCorrect - Whether this is the correct answer
 * @returns {string} - HTML string for the option
 */
export function buildOptionHtml(text, index, isCorrect) {
    const color = COLORS.OPTION_COLORS[index % COLORS.OPTION_COLORS.length];
    return `
        <div class="ai-preview-option ${isCorrect ? 'correct' : ''}"
             style="background: ${color.bg}; border-left: 4px solid ${color.border};">
            <span class="ai-option-letter" style="color: ${color.text}; font-weight: 700;">${String.fromCharCode(65 + index)}</span>
            <span class="ai-option-text">${escapeHtml(text)}</span>
            ${isCorrect ? '<span class="ai-correct-badge">\u2713</span>' : ''}
        </div>`;
}

/**
 * Build options HTML based on question type
 * @param {Object} question - Question data
 * @returns {string} - HTML string for all options
 */
export function buildOptionsHtml(question) {
    const type = question.type;

    if (type === 'multiple-choice' || type === 'true-false') {
        const options = question.options || [];
        const correctIndex = question.correctAnswer ?? 0;
        return options.map((opt, i) => buildOptionHtml(opt, i, i === correctIndex)).join('');
    }

    if (type === 'multiple-correct') {
        const options = question.options || [];
        const correctAnswers = question.correctAnswers || [];
        return options.map((opt, i) => buildOptionHtml(opt, i, correctAnswers.includes(i))).join('');
    }

    if (type === 'numeric') {
        const answerLabel = translationManager.getTranslationSync('correct_answer') || 'Correct Answer';
        const color = COLORS.OPTION_COLORS[0];
        return `
            <div class="ai-preview-option correct" style="background: ${color.bg}; border-left: 4px solid ${color.border};">
                <span class="ai-option-letter" style="color: ${color.text}; font-weight: 700;">${answerLabel}:</span>
                <span class="ai-option-text">${escapeHtml(String(question.correctAnswer))}</span>
                <span class="ai-correct-badge">\u2713</span>
            </div>`;
    }

    if (type === 'ordering') {
        const items = question.options || question.items || [];
        return items.map((item, i) => {
            const color = COLORS.OPTION_COLORS[i % COLORS.OPTION_COLORS.length];
            return `
                <div class="ai-preview-option" style="background: ${color.bg}; border-left: 4px solid ${color.border};">
                    <span class="ai-option-letter" style="color: ${color.text}; font-weight: 700;">${i + 1}</span>
                    <span class="ai-option-text">${escapeHtml(item)}</span>
                </div>`;
        }).join('');
    }

    return '';
}

// ============================================================================
// QUESTION CARD TEMPLATE
// ============================================================================

/**
 * Build the main question preview card HTML
 * @param {Object} question - Question data
 * @param {number} index - Question index
 * @param {string} optionsHtml - Pre-rendered options HTML
 * @returns {string} - HTML string for the question card
 */
export function buildQuestionCardHtml(question, index, optionsHtml) {
    // Get translated question type
    const typeKey = `question_type_${question.type?.replace('-', '_')}`;
    const typeLabel = translationManager.getTranslationSync(typeKey) || question.type || 'Unknown';

    // Explanation section if available
    const explanationHtml = question.explanation
        ? `<div class="ai-preview-explanation"><span class="explanation-icon">\u{1F4A1}</span> ${escapeHtml(question.explanation)}</div>`
        : '';

    // Difficulty badge with color
    const difficulty = question.difficulty || 'medium';
    const diffColor = COLORS.DIFFICULTY_COLORS[difficulty] || COLORS.DIFFICULTY_COLORS.medium;
    const difficultyLabel = translationManager.getTranslationSync(difficulty) || difficulty;

    // Time limit display
    const timeLimit = question.timeLimit || 30;

    return `
        <div class="ai-preview-header">
            <label class="ai-preview-checkbox">
                <input type="checkbox" ${question.selected ? 'checked' : ''} />
                <span class="checkmark"></span>
            </label>
            <div class="ai-preview-badges">
                <span class="ai-type-badge">${typeLabel}</span>
                <span class="ai-difficulty-badge" style="background: ${diffColor.bg}; color: ${diffColor.text};">${difficultyLabel}</span>
                <span class="ai-time-badge">⏱️ ${timeLimit}s</span>
            </div>
            <div class="ai-preview-actions">
                <button class="ai-edit-btn" title="Edit question" data-index="${index}">✏️</button>
                <button class="ai-regenerate-btn" title="Regenerate this question" data-index="${index}">🔄</button>
            </div>
        </div>
        <div class="ai-preview-question-text" data-field="question">${escapeHtml(question.question)}</div>
        <div class="ai-preview-options" data-field="options">${optionsHtml}</div>
        ${explanationHtml}
    `;
}

// ============================================================================
// EDIT MODE TEMPLATES
// ============================================================================

/**
 * Build the question text edit field HTML
 * @param {string} questionText - Current question text
 * @returns {string} - HTML string for the edit textarea
 */
export function buildQuestionEditHtml(questionText) {
    return `<textarea class="ai-edit-field ai-edit-question" rows="3">${escapeHtml(questionText)}</textarea>`;
}

/**
 * Build ordering edit options HTML
 * @param {Object} question - Question data with options and correctOrder
 * @returns {string} - HTML string for ordering edit fields
 */
export function buildOrderingEditHtml(question) {
    return question.options.map((opt, i) => {
        // Find position of this item in correctOrder (1-based for display)
        const position = question.correctOrder ? question.correctOrder.indexOf(i) + 1 : i + 1;
        return `
            <div class="ai-edit-option-row">
                <input type="number" class="ai-edit-order" value="${position}" min="1" max="${question.options.length}" data-index="${i}" style="width: 50px;">
                <input type="text" class="ai-edit-field ai-edit-option" value="${escapeHtml(opt)}" data-index="${i}">
            </div>
        `;
    }).join('');
}

/**
 * Build choice-based edit options HTML (multiple-choice, multiple-correct, true-false)
 * @param {Object} question - Question data with options
 * @param {number} questionIndex - Question index for radio group naming
 * @returns {string} - HTML string for choice edit fields
 */
export function buildChoiceEditHtml(question, questionIndex) {
    return question.options.map((opt, i) => {
        let isCorrect = false;
        if (question.type === 'true-false') {
            // True-false uses "true"/"false" string, map to index
            isCorrect = (question.correctAnswer === 'true' && i === 0) ||
                       (question.correctAnswer === 'false' && i === 1);
        } else if (question.type === 'multiple-choice') {
            isCorrect = i === question.correctAnswer;
        } else if (question.type === 'multiple-correct') {
            isCorrect = question.correctAnswers?.includes(i);
        }
        return `
            <div class="ai-edit-option-row">
                <input type="${question.type === 'multiple-correct' ? 'checkbox' : 'radio'}"
                       name="correct-${questionIndex}" value="${i}"
                       ${isCorrect ? 'checked' : ''}
                       class="ai-edit-correct">
                <input type="text" class="ai-edit-field ai-edit-option" value="${escapeHtml(opt)}" data-index="${i}">
            </div>
        `;
    }).join('');
}

/**
 * Build numeric answer edit HTML
 * @param {Object} question - Question data with correctAnswer and tolerance
 * @returns {string} - HTML string for numeric edit fields
 */
export function buildNumericEditHtml(question) {
    return `
        <div class="ai-edit-option-row">
            <label>Answer:</label>
            <input type="number" class="ai-edit-field ai-edit-numeric" value="${escapeHtml(String(question.correctAnswer))}" step="any">
            <label>Tolerance:</label>
            <input type="number" class="ai-edit-field ai-edit-tolerance" value="${escapeHtml(String(question.tolerance || 0))}" step="any">
        </div>
    `;
}

/**
 * Build edit mode action buttons HTML
 * @param {number} index - Question index
 * @returns {string} - HTML string for save/cancel buttons
 */
export function buildEditActionsHtml(index) {
    return `
        <button class="ai-save-btn" title="Save changes" data-index="${index}">💾</button>
        <button class="ai-cancel-btn" title="Cancel editing" data-index="${index}">❌</button>
    `;
}

/**
 * Build view mode action buttons HTML
 * @param {number} index - Question index
 * @returns {string} - HTML string for edit/regenerate buttons
 */
export function buildViewActionsHtml(index) {
    return `
        <button class="ai-edit-btn" title="Edit question" data-index="${index}">✏️</button>
        <button class="ai-regenerate-btn" title="Regenerate this question" data-index="${index}">🔄</button>
    `;
}
