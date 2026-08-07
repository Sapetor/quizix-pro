/**
 * @jest-environment jsdom
 *
 * Characterization tests for the quiz-manager decomposition modules.
 * These pin the most breakable behaviours before/after the move-and-delegate
 * refactor: settings round-trip, add/remove question DOM+count updates, and
 * export producing loadable JSON.
 */

import { dom } from '../../public/js/utils/dom.js';
import { collectSettings, restoreSettings } from '../../public/js/quiz/modules/settings-persistence.js';
import { updateQuestionsUI } from '../../public/js/quiz/modules/question-editing.js';
import { exportQuiz } from '../../public/js/quiz/modules/import-export.js';

beforeEach(() => {
    // dom.get caches elements by id; the DOM is rebuilt each test, so clear it.
    dom.clearCache();
    document.body.innerHTML = '';
});

describe('settings-persistence round-trip', () => {
    function buildSettingsDom() {
        document.body.innerHTML = `
            <input type="checkbox" id="randomize-questions">
            <input type="checkbox" id="randomize-answers">
            <input type="checkbox" id="same-time-all">
            <input type="text" id="default-time" value="20">
            <input type="checkbox" id="manual-advancement">
            <input type="checkbox" id="show-leaderboard-between">
            <input type="checkbox" id="consensus-mode">
            <input type="text" id="consensus-threshold" value="66">
            <input type="text" id="discussion-time" value="30">
            <input type="checkbox" id="allow-chat">
            <input type="checkbox" id="time-bonus-enabled">
            <input type="text" id="time-bonus-threshold" value="0">
            <input type="text" id="easy-multiplier" value="1">
            <input type="text" id="medium-multiplier" value="2">
            <input type="text" id="hard-multiplier" value="3">
        `;
    }

    test('restoreSettings then collectSettings reproduces the saved settings', () => {
        const saved = {
            randomizeQuestions: true,
            randomizeAnswers: false,
            useGlobalTime: true,
            globalTimeLimit: 45,
            manualAdvance: true,
            showLeaderboardBetweenQuestions: false,
            consensusMode: true,
            consensusThreshold: '75',
            discussionTime: 50,
            allowChat: true,
            scoringConfig: {
                timeBonusEnabled: false,
                timeBonusThreshold: 7,
                difficultyMultipliers: { easy: 1, medium: 4, hard: 6 }
            }
        };

        buildSettingsDom();
        restoreSettings(saved);
        const collected = collectSettings();

        expect(collected).toEqual(saved);
    });

    test('collectSettings reads current DOM values', () => {
        buildSettingsDom();
        document.getElementById('randomize-questions').checked = true;
        document.getElementById('default-time').value = '99';
        document.getElementById('consensus-threshold').value = '80';

        const collected = collectSettings();
        expect(collected.randomizeQuestions).toBe(true);
        expect(collected.globalTimeLimit).toBe(99);
        expect(collected.consensusThreshold).toBe('80');
        // threshold kept in raw seconds for round-trip (thresholdToMs: false)
        expect(collected.scoringConfig.timeBonusThreshold).toBe(0);
    });

    test('restoreSettings is a no-op for null/undefined', () => {
        buildSettingsDom();
        document.getElementById('default-time').value = '33';
        restoreSettings(null);
        expect(document.getElementById('default-time').value).toBe('33');
    });
});

describe('question-editing updateQuestionsUI', () => {
    const fakeManager = {}; // updateQuestionsUI only needs it as an opaque token

    function addQuestion(container, index) {
        const item = document.createElement('div');
        item.className = 'question-item';
        item.innerHTML = `<div class="question-header">
                              <h3><span data-translate="question">Question</span> ${index + 1}</h3>
                              <div class="question-header-actions">
                                  <button type="button" class="btn-icon btn-remove">✕</button>
                              </div>
                          </div>
                          <div class="question-meta"></div>`;
        container.appendChild(item);
        return item;
    }

    function buildContainer(count) {
        document.body.innerHTML = '<div id="questions-container"></div>';
        const container = document.getElementById('questions-container');
        for (let i = 0; i < count; i++) addQuestion(container, i);
        return container;
    }

    test('single question: header remove button is hidden and numbering set', () => {
        const container = buildContainer(1);
        updateQuestionsUI(fakeManager);

        const items = container.querySelectorAll('.question-item');
        expect(items).toHaveLength(1);
        const removeBtn = items[0].querySelector('.btn-remove');
        expect(removeBtn).not.toBeNull();
        expect(removeBtn.classList.contains('hidden')).toBe(true);
        expect(items[0].getAttribute('data-question')).toBe('0');
    });

    test('multiple questions: every header remove button is shown', () => {
        const container = buildContainer(3);
        updateQuestionsUI(fakeManager);

        const items = container.querySelectorAll('.question-item');
        expect(items).toHaveLength(3);
        items.forEach((item, i) => {
            const removeBtn = item.querySelector('.btn-remove');
            expect(removeBtn.classList.contains('hidden')).toBe(false);
            expect(item.getAttribute('data-question')).toBe(String(i));
        });
    });

    test('no bottom remove bar is created', () => {
        const container = buildContainer(2);
        updateQuestionsUI(fakeManager);
        expect(container.querySelector('.remove-question')).toBeNull();
    });

    test('removing a question below the multi-threshold hides the remaining button', () => {
        const container = buildContainer(2);
        updateQuestionsUI(fakeManager);
        // Remove one, then re-run the UI update
        container.querySelector('.question-item').remove();
        updateQuestionsUI(fakeManager);

        const items = container.querySelectorAll('.question-item');
        expect(items).toHaveLength(1);
        expect(items[0].querySelector('.btn-remove').classList.contains('hidden')).toBe(true);
    });
});

describe('import-export exportQuiz', () => {
    // jsdom exposes URL/Blob on the window (document.defaultView), which is the
    // same global the modules see. Reach them via document to satisfy the
    // restricted eslint globals for *.dom.test.js files.
    const win = document.defaultView;

    function makeManager(questions) {
        return {
            collectQuestions: () => questions,
            errorHandler: {
                // Faithful enough: run the operation, swallow into fallback on throw.
                wrapAsyncOperation: async (fn, opts) => {
                    try {
                        return await fn();
                    } catch {
                        opts?.fallback?.();
                    }
                }
            }
        };
    }

    test('produces a JSON blob that parses back into the quiz', async () => {
        document.body.innerHTML = '<input id="quiz-title" value="My Quiz">';

        const questions = [
            { question: 'Q1', type: 'multiple-choice', options: ['a', 'b'], correctIndex: 0 }
        ];

        // jsdom's Blob has no .text(); capture the raw parts/type via a stub.
        let blobText = null;
        let blobType = null;
        const realBlob = win.Blob;
        const realCreate = win.URL.createObjectURL;
        win.Blob = function (parts, opts) {
            blobText = (parts || []).join('');
            blobType = opts?.type;
            return { type: opts?.type };
        };
        win.URL.createObjectURL = () => 'blob:mock';
        try {
            await exportQuiz(makeManager(questions));
        } finally {
            win.Blob = realBlob;
            win.URL.createObjectURL = realCreate;
        }

        expect(blobType).toBe('application/json');
        const parsed = JSON.parse(blobText);
        expect(parsed.title).toBe('My Quiz');
        expect(parsed.questions).toEqual(questions);
        expect(typeof parsed.createdAt).toBe('string');
    });

    test('does nothing (no blob) when there are no questions', async () => {
        document.body.innerHTML = '<input id="quiz-title" value="Empty">';

        let called = false;
        const realCreate = win.URL.createObjectURL;
        win.URL.createObjectURL = () => { called = true; return 'blob:mock'; };
        try {
            await exportQuiz(makeManager([]));
        } finally {
            win.URL.createObjectURL = realCreate;
        }

        expect(called).toBe(false);
    });
});
