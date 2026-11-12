/**
 * @jest-environment jsdom
 *
 * A 401 on the quiz download (server restarted, cached token rejected) must
 * prompt for the password and retry once, not report a malformed file.
 */

import { QuizManager } from '../../public/js/quiz/quiz-manager.js';
import { APIHelper } from '../../public/js/utils/api-helper.js';
import { translationManager } from '../../public/js/utils/translation-manager.js';

const res = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('loadQuiz after a rejected unlock token', () => {
    let manager;

    beforeEach(() => {
        manager = Object.create(QuizManager.prototype);
        manager.errorHandler = {
            errorTypes: {},
            wrapAsyncOperation: (fn) => fn(),
            safeExecute: (fn) => fn()
        };
        manager.cleanQuizData = (d) => d;
        manager.populateQuizBuilder = jest.fn();
        manager.hideLoadQuizModal = jest.fn();
        manager.fileManager = { ensureUnlocked: jest.fn() };
    });

    afterEach(() => jest.restoreAllMocks());

    test('401 then a correct password loads the quiz', async () => {
        manager.fileManager.ensureUnlocked.mockResolvedValue(true);
        const alert = jest.spyOn(translationManager, 'showAlert').mockImplementation(() => {});
        let calls = 0;
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async () =>
            ++calls === 1 ? res(401) : res(200, { title: 'T', questions: [{}] }));

        await manager.loadQuiz('L.json');

        expect(manager.fileManager.ensureUnlocked).toHaveBeenCalledWith('quiz', 'L.json', 'L');
        expect(manager.populateQuizBuilder).toHaveBeenCalledTimes(1);
        expect(alert).not.toHaveBeenCalledWith('error', expect.stringContaining('Invalid quiz file'));
    });

    test('401 and a cancelled prompt ends quietly', async () => {
        manager.fileManager.ensureUnlocked.mockResolvedValue(false);
        const alert = jest.spyOn(translationManager, 'showAlert').mockImplementation(() => {});
        jest.spyOn(APIHelper, 'fetchAPI').mockResolvedValue(res(401));

        await manager.loadQuiz('L.json');

        expect(manager.populateQuizBuilder).not.toHaveBeenCalled();
        expect(alert).not.toHaveBeenCalled();
    });
});
