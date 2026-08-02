/**
 * Answer Format - Reading saved quiz answers
 *
 * Saved results store answers as option *indices* for option-based question
 * types, and put the correct answer in a different field per type. Everything
 * that displays a saved answer goes through here.
 *
 * MIRRORS the server-side formatting in `services/results-service.js`
 * (`_formatAnswerValue` / `_formatCorrectAnswer`), which produces the same
 * strings for CSV export. If you change the rules here, change them there too —
 * and vice versa. The split exists because this is an ES module and the server
 * is CommonJS; `tests/unit/results-analytics.dom.test.js` pins the pair.
 */

import { getTranslation, getTrueFalseText } from '../translation-manager.js';

// Ordering answers read as a sequence; every other multi-value answer is a set.
const ORDER_SEPARATOR = ' → ';

/**
 * Render a single answer component, resolving an option index to its text.
 * @param {*} value - Raw answer component
 * @param {Array} [options] - Question option list
 * @returns {string} Display string
 */
function formatAnswerComponent(value, options) {
    if (Number.isInteger(value) && Array.isArray(options) && value >= 0 && value < options.length) {
        return String(options[value]);
    }
    return String(value);
}

/**
 * Format a saved answer value for display, resolving option indices to text.
 * @param {*} value - Raw answer value (index, boolean, array of indices, or literal)
 * @param {Object} [question] - Question the answer belongs to
 * @returns {string} Human-readable answer label
 */
export function formatAnswerLabel(value, question) {
    if (value === undefined || value === null || value === '') {
        return getTranslation('no_answer');
    }

    const options = question?.options;

    if (Array.isArray(value)) {
        if (value.length === 0) return getTranslation('no_answer');
        const separator = question?.type === 'ordering' ? ORDER_SEPARATOR : ', ';
        return value.map(item => formatAnswerComponent(item, options)).join(separator);
    }

    if (typeof value === 'boolean') {
        const tf = getTrueFalseText();
        return value ? tf.true : tf.false;
    }

    return formatAnswerComponent(value, options);
}

/**
 * Get the raw correct answer for a question, whichever field the type uses.
 * Ordering stores `correctOrder`, multiple-correct stores `correctAnswers`;
 * reading only `correctAnswer` leaves both types with no correct answer at all.
 * Mirrors `ScoringService.getCorrectAnswerKey()` (services/scoring-service.js).
 * @param {Object} question - Question data
 * @returns {*} Raw correct answer, or undefined when unknown
 */
export function getCorrectAnswerValue(question) {
    if (!question) return undefined;

    switch (question.type) {
        case 'multiple-correct':
            return question.correctIndices || question.correctAnswers;
        case 'ordering':
            return question.correctOrder;
        case 'multiple-choice':
            return question.correctIndex !== undefined ? question.correctIndex : question.correctAnswer;
        default:
            return question.correctAnswer;
    }
}

/**
 * Get the display label for a question's correct answer.
 * @param {Object} question - Question data
 * @returns {string} Correct answer label, or the translated "unknown" placeholder
 */
export function resolveCorrectAnswerLabel(question) {
    const value = getCorrectAnswerValue(question);
    if (value === undefined || value === null) {
        return getTranslation('unknown');
    }
    return formatAnswerLabel(value, question);
}

/**
 * Normalize one saved answer slot.
 *
 * A slot holds either a graded record ({ answer, isCorrect, points, timeMs }) or
 * nothing at all — players who never reached a question leave a `null`. The
 * verdict is whatever the server recorded during the game; nothing here re-grades
 * an answer (that is `QuestionTypeRegistry.scoreAnswer`'s job, at play time).
 * @param {*} raw - Raw entry from player.answers
 * @returns {Object|null} Normalized record, or null when the slot holds no response
 */
export function normalizeAnswerRecord(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }

    return {
        value: raw.answer,
        isCorrect: Boolean(raw.isCorrect),
        points: raw.points || 0,
        timeMs: typeof raw.timeMs === 'number' ? raw.timeMs : null
    };
}
