/**
 * @jest-environment jsdom
 *
 * Regression tests for the "translation sweep wipes JS-owned content" bug class,
 * on the siblings of the in-game question text (see
 * language-switch-in-game.dom.test.js for the original pair).
 *
 * Elements here carry a data-translate value that is only an IDLE placeholder:
 *  - #preview-question-text-split ("select_question_preview") holds the editor's
 *    live question preview.
 *  - #editor-breadcrumb-title ("header_untitled_quiz") and #lobby-breadcrumb-title
 *    ("quiz_title") hold the real quiz title.
 * Switching language used to reset all three to their placeholder.
 */

import { translationManager } from '../../public/js/utils/translation-manager.js';
import { PreviewRenderer } from '../../public/js/ui/modules/preview-renderer.js';
import { PreviewManager } from '../../public/js/ui/preview-manager.js';
import { syncEditorBreadcrumbTitle } from '../../public/js/ui/header-controller.js';
import { UIManager } from '../../public/js/ui/ui-manager.js';

const EN = {
    select_question_preview: 'Select a question to preview',
    no_questions_to_preview: 'No questions to preview',
    header_untitled_quiz: 'Untitled quiz',
    quiz_title: 'Quiz Title',
    question: 'Question',
    of: 'of'
};
const ES = {
    select_question_preview: 'Selecciona una pregunta para previsualizar',
    no_questions_to_preview: 'No hay preguntas para previsualizar',
    header_untitled_quiz: 'Cuestionario sin título',
    quiz_title: 'Título del cuestionario',
    question: 'Pregunta',
    of: 'de'
};

function useLanguage(code, table) {
    translationManager.loadedTranslations.set(code, table);
    translationManager.currentLanguage = code;
    translationManager.defaultLanguage = code;
}

describe('language switch while the editor preview shows a question', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="preview-question-counter-display-split"><span data-translate="question">Question</span> 1 <span data-translate="of">of</span> 1</div>
            <div id="preview-question-counter-split">Question 1 of 1</div>
            <div id="preview-question-text-split" data-translate="select_question_preview">Select a question to preview</div>
            <div id="preview-answer-area-split"></div>`;
        useLanguage('en', EN);
    });

    test('the rendered preview question survives a language switch', () => {
        const element = document.getElementById('preview-question-text-split');
        new PreviewRenderer().renderSplitQuestionText('What is the capital of Chile?');

        useLanguage('es', ES);
        translationManager.translatePage();

        expect(element.textContent).toBe('What is the capital of Chile?');
    });

    test('the empty-preview message retranslates after the preview is reset', () => {
        const element = document.getElementById('preview-question-text-split');
        const manager = new PreviewManager();
        new PreviewRenderer().renderSplitQuestionText('What is the capital of Chile?');
        manager.showEmptySplitPreview();

        useLanguage('es', ES);
        translationManager.translatePage();

        expect(element.textContent).toBe('No hay preguntas para previsualizar');
    });
});

describe('language switch while a quiz title is displayed', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <input id="quiz-title" value="">
            <span id="editor-breadcrumb-title" data-translate="header_untitled_quiz">Untitled quiz</span>
            <span id="lobby-breadcrumb-title" data-translate="quiz_title">Quiz Title</span>`;
        useLanguage('en', EN);
    });

    test('the editor breadcrumb keeps the real title across a language switch', () => {
        const titleEl = document.getElementById('editor-breadcrumb-title');
        document.getElementById('quiz-title').value = 'Chemistry 101';
        syncEditorBreadcrumbTitle();

        useLanguage('es', ES);
        translationManager.translatePage();

        expect(titleEl.textContent).toBe('Chemistry 101');
    });

    test('an untitled editor breadcrumb still retranslates', () => {
        const titleEl = document.getElementById('editor-breadcrumb-title');
        const input = document.getElementById('quiz-title');
        input.value = 'Chemistry 101';
        syncEditorBreadcrumbTitle();
        input.value = '';
        syncEditorBreadcrumbTitle();

        useLanguage('es', ES);
        translationManager.translatePage();

        expect(titleEl.textContent).toBe('Cuestionario sin título');
    });

    test('the lobby breadcrumb keeps the real title across a language switch', () => {
        const titleEl = document.getElementById('lobby-breadcrumb-title');
        new UIManager().updateQuizTitle('Chemistry 101');

        useLanguage('es', ES);
        translationManager.translatePage();

        expect(titleEl.textContent).toBe('Chemistry 101');
    });
});
