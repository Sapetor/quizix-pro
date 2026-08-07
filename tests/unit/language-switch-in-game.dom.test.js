/**
 * @jest-environment jsdom
 *
 * Regression tests for changing the UI language while a question is on screen.
 *
 * Two defects are pinned here:
 *  1. The question elements carry data-translate="question_will_appear_here" as an
 *     idle placeholder. The translation sweep set textContent on every
 *     [data-translate] element, so switching language mid-question replaced the
 *     rendered question with the placeholder.
 *  2. Host true/false option labels were rendered as plain text, so the sweep had
 *     nothing to update and they kept the old language.
 */

import { translationManager } from '../../public/js/utils/translation-manager.js';
import { QuestionTypeRegistry } from '../../public/js/utils/question-type-registry.js';
import { GameDisplayManager } from '../../public/js/game/modules/game-display-manager.js';

const EN = {
    question_will_appear_here: 'Question will appear here',
    true: 'TRUE',
    false: 'FALSE'
};
const ES = {
    question_will_appear_here: 'La pregunta aparecerá aquí',
    true: 'VERDADERO',
    false: 'FALSO'
};

function useLanguage(code, table) {
    translationManager.loadedTranslations.set(code, table);
    translationManager.currentLanguage = code;
    translationManager.defaultLanguage = code;
}

/** GameDisplayManager only needs a uiManager stub for question-text rendering. */
function displayManager() {
    return new GameDisplayManager({});
}

describe('language switch while a question is displayed', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <h3 id="current-question" data-translate="question_will_appear_here">Question will appear here</h3>
            <h3 id="player-question-text" data-translate="question_will_appear_here">Question will appear here</h3>
            <div id="answer-options"></div>`;
        useLanguage('en', EN);
    });

    test('the rendered question survives a language switch', () => {
        const element = document.getElementById('current-question');
        displayManager().displayQuestionText(element, 'What is the capital of Chile?');

        useLanguage('es', ES);
        translationManager.translatePage();

        expect(element.textContent).toBe('What is the capital of Chile?');
    });

    test('the idle placeholder still retranslates once the question is cleared', () => {
        const element = document.getElementById('current-question');
        const manager = displayManager();
        manager.displayQuestionText(element, 'What is the capital of Chile?');
        manager.clearQuestionDisplay();

        useLanguage('es', ES);
        translationManager.translatePage();

        expect(element.textContent).toBe('La pregunta aparecerá aquí');
    });

    test('host true/false labels follow the new language', () => {
        const container = document.getElementById('answer-options');
        QuestionTypeRegistry.renderHostOptions('true-false', {}, container, { translationManager });
        expect(container.querySelector('.true-btn').textContent.trim()).toBe('TRUE');

        useLanguage('es', ES);
        translationManager.translatePage();

        expect(container.querySelector('.true-btn').textContent.trim()).toBe('VERDADERO');
        expect(container.querySelector('.false-btn').textContent.trim()).toBe('FALSO');
    });
});
