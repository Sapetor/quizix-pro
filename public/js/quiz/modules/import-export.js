/**
 * Quiz import / export
 *
 * File-based import (JSON upload) and export (JSON download) of quizzes.
 * Extracted from quiz-manager.js as a move-and-delegate refactor: QuizManager
 * keeps thin `importQuiz`/`handleFileImport`/`exportQuiz` methods that call
 * these functions, passing the manager instance for shared state and helpers.
 */

import { translationManager, showErrorAlert, showSuccessAlert } from '../../utils/translation-manager.js';
import { dom } from '../../utils/dom.js';
import { collectSettings } from './settings-persistence.js';

/**
 * Import quiz from file (opens the hidden file input)
 */
export async function importQuiz() {
    const fileInput = dom.get('import-file-input');
    if (fileInput) {
        fileInput.click();
    }
}

/**
 * Handle file import
 */
export async function handleFileImport(manager, event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
        showErrorAlert('invalid_file_format');
        return;
    }

    await manager.errorHandler.wrapAsyncOperation(async () => {
        const text = await file.text();
        const quizData = JSON.parse(text);

        // Validate quiz data structure
        if (!quizData.title || !quizData.questions || !Array.isArray(quizData.questions)) {
            showErrorAlert('invalid_quiz_format');
            return;
        }

        // Validate questions
        const validationErrors = manager.validateQuestions(quizData.questions);
        if (validationErrors.length > 0) {
            translationManager.showAlert('error', translationManager.getTranslationSync('invalid_quiz_questions') + '\n' + validationErrors.join('\n'));
            return;
        }

        // Load the quiz — imported quizzes are new, clear loaded state
        await manager.populateQuizBuilder(quizData);
        manager._loadedFilename = null;
        manager._loadedTitle = null;
        showSuccessAlert('quiz_imported_successfully');
    }, {
        context: { operation: 'importQuiz', filename: file.name },
        fallback: () => showErrorAlert('failed_import_quiz')
    });

    // Clear file input
    event.target.value = '';
}

/**
 * Export quiz to file
 */
export async function exportQuiz(manager) {
    const title = dom.get('quiz-title')?.value?.trim();
    if (!title) {
        showErrorAlert('please_enter_quiz_title');
        return;
    }

    const questions = manager.collectQuestions();
    if (questions.length === 0) {
        showErrorAlert('please_add_one_question');
        return;
    }

    const quizData = {
        title: title,
        questions: questions,
        // Settings ride along with the quiz: an export without them is imported
        // against whatever the host UI last held and baked in on the next save.
        settings: collectSettings(),
        createdAt: new Date().toISOString()
    };

    await manager.errorHandler.wrapAsyncOperation(async () => {
        const dataStr = JSON.stringify(quizData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        const objectUrl = URL.createObjectURL(dataBlob);
        link.href = objectUrl;
        // Unicode letters/digits survive the slug, so accented and non-Latin
        // titles stay readable instead of collapsing into underscores.
        link.download = `${title.replace(/[^\p{L}\p{N}]+/gu, '_').toLowerCase()}.json`;
        link.click();
        // Revoked after the click has been dispatched, not during it: some
        // browsers abort a download whose blob URL is revoked synchronously.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

        showSuccessAlert('quiz_exported_successfully');
    }, {
        context: { operation: 'exportQuiz', title },
        fallback: () => showErrorAlert('failed_export_quiz')
    });
}
