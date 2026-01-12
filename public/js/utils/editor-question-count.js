/**
 * Editor Question Count Manager
 * Handles updating and tracking the question count indicator in the quiz editor
 */

import { logger } from '../core/config.js';

/**
 * Update the editor question count indicator
 * Called when questions are added, removed, or quiz is loaded
 */
export function updateEditorQuestionCount() {
    const questionsContainer = document.getElementById('questions-container');
    const countElement = document.getElementById('editor-question-count-number');

    if (!questionsContainer || !countElement) {
        return;
    }

    const count = questionsContainer.children.length;
    countElement.textContent = count;
    logger.debug(`Editor question count updated: ${count}`);
}

/**
 * Initialize editor question count listeners
 * Sets up event handlers for dynamic count updates
 */
export function initializeEditorQuestionCount() {
    // Update count on page load
    updateEditorQuestionCount();

    // Listen for question added events
    document.addEventListener('questionAdded', updateEditorQuestionCount);

    // Listen for question removed events
    document.addEventListener('questionRemoved', updateEditorQuestionCount);

    // Listen for quiz loaded events
    document.addEventListener('quizLoaded', updateEditorQuestionCount);

    logger.debug('Editor question count listeners initialized');
}

// Make functions available globally
window.updateEditorQuestionCount = updateEditorQuestionCount;
window.initializeEditorQuestionCount = initializeEditorQuestionCount;
