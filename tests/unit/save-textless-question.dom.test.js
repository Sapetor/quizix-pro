/**
 * @jest-environment jsdom
 *
 * A question with options or an image but no text is dropped by
 * extractQuestionData. Saving or hosting must refuse and name the question
 * instead of reporting success with fewer questions.
 */

import { QuizManager } from '../../public/js/quiz/quiz-manager.js';
import { APIHelper } from '../../public/js/utils/api-helper.js';
import { dom } from '../../public/js/utils/dom.js';
import { translationManager } from '../../public/js/utils/translation-manager.js';
import { toastNotifications } from '../../public/js/utils/toast-notifications.js';

function item({ text = '', options = [], image = '' }) {
    return `
        <div class="question-item">
            <textarea class="question-text">${text}</textarea>
            <select class="question-type"><option value="multiple-choice" selected>mc</option></select>
            <img class="question-image" data-url="${image}">
            ${options.map(o => `<input class="option" value="${o}">`).join('')}
        </div>`;
}

describe('textless questions on save', () => {
    let manager;
    let errors;
    let translate;

    beforeEach(() => {
        dom.clearCache();
        document.body.innerHTML = `<input id="quiz-title" value="T">${item({ text: 'Q1', options: ['a', 'b'] })}`;
        errors = jest.spyOn(toastNotifications, 'error').mockImplementation(() => {});
        translate = jest.spyOn(translationManager, 'getTranslationSync');
        jest.spyOn(APIHelper, 'fetchAPI').mockResolvedValue({ ok: true, json: async () => ({}) });
        manager = Object.create(QuizManager.prototype);
        manager.pendingSave = null;
        manager.showSaveQuizModal = jest.fn();
        manager.collectSettings = jest.fn(() => ({}));
        manager.extractQuestionData = jest.fn(el => {
            const text = el.querySelector('.question-text').value.trim();
            return text ? { question: text, type: 'multiple-choice', options: ['a', 'b'], correctIndex: 0 } : null;
        });
        manager.validateQuestions = jest.fn(() => []);
    });

    afterEach(() => jest.restoreAllMocks());

    test('a question with an image and no text blocks the save and is named', async () => {
        document.body.insertAdjacentHTML('beforeend', item({ image: 'img/a.png' }));

        await manager.saveQuiz();

        expect(errors).toHaveBeenCalledTimes(1);
        expect(translate).toHaveBeenCalledWith('question_missing_text', ['2']);
        expect(manager.pendingSave).toBeNull();
        expect(manager.showSaveQuizModal).not.toHaveBeenCalled();
        expect(APIHelper.fetchAPI).not.toHaveBeenCalled();
    });

    test('a question with options and no text blocks the save', async () => {
        document.body.insertAdjacentHTML('beforeend', item({ options: ['x', 'y'] }));

        await manager.saveQuiz();

        expect(manager.pendingSave).toBeNull();
        expect(errors).toHaveBeenCalledTimes(1);
    });

    test('a completely blank placeholder question does not block the save', async () => {
        document.body.insertAdjacentHTML('beforeend', item({ options: ['', ''] }));

        await manager.saveQuiz();

        expect(errors).not.toHaveBeenCalled();
        expect(manager.pendingSave.questions).toHaveLength(1);
        expect(manager.showSaveQuizModal).toHaveBeenCalled();
    });
});
