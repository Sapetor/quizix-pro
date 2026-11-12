/**
 * @jest-environment jsdom
 *
 * Quick Start with password-protected quizzes: a 401 on the settings fetch must
 * not leave the panel and the selected file out of sync, and a cached unlock
 * token must not trigger a second password prompt.
 */

import { QuizGame } from '../../public/js/core/app.js';
import { APIHelper } from '../../public/js/utils/api-helper.js';
import { dom } from '../../public/js/utils/dom.js';

const res = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('Quick Start with protected quizzes', () => {
    let game;
    let prompt;

    beforeEach(() => {
        dom.clearCache();
        APIHelper.quizUnlockTokens.clear();
        window.matchMedia = window.matchMedia || (() => ({ matches: false }));
        document.body.innerHTML = '<div id="quick-start-settings"></div>';
        prompt = jest.fn();
        game = {
            _quickStartSelectedFile: null,
            _passwordModal: { promptPassword: prompt },
            hideQuickStartModal: jest.fn(),
            socketManager: { createGame: jest.fn() },
            _hideQuickStartSettings: QuizGame.prototype._hideQuickStartSettings,
            _ensureQuizUnlocked: QuizGame.prototype._ensureQuizUnlocked,
            _collectQuickStartSettings: QuizGame.prototype._collectQuickStartSettings,
            _positionQuickStartSettings: jest.fn()
        };
    });

    afterEach(() => jest.restoreAllMocks());

    test('a cancelled password prompt hides the panel and clears the selection', async () => {
        document.getElementById('quick-start-settings').classList.remove('hidden');
        prompt.mockRejectedValue(new Error('Cancelled'));
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async (url) => {
            if (url.startsWith('api/requires-auth')) return res(200, { requiresAuth: true });
            return res(401);
        });

        await QuizGame.prototype._onQuickStartQuizSelected.call(game, 'B.json');

        expect(document.getElementById('quick-start-settings').classList.contains('hidden')).toBe(true);
        expect(game._quickStartSelectedFile).toBeNull();
    });

    test('a 401 then a correct password loads the settings panel', async () => {
        document.getElementById('quick-start-settings').classList.add('hidden');
        prompt.mockResolvedValue('pw');
        let unlocked = false;
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async (url) => {
            if (url.startsWith('api/requires-auth')) return res(200, { requiresAuth: true });
            if (url === 'api/unlock') { unlocked = true; return res(200, { token: 't' }); }
            return unlocked ? res(200, { questions: [{}], settings: {} }) : res(401);
        });

        await QuizGame.prototype._onQuickStartQuizSelected.call(game, 'B.json');

        expect(document.getElementById('quick-start-settings').classList.contains('hidden')).toBe(false);
        expect(game._quickStartSelectedFile).toBe('B.json');
    });

    test('a cached unlock token skips the password prompt', async () => {
        APIHelper.quizUnlockTokens.set('B.json', { token: 't', expiresAt: Date.now() + 60000 });
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async (url) => {
            if (url.startsWith('api/requires-auth')) return res(200, { requiresAuth: true });
            return res(200, { title: 'B', questions: [{ type: 'true-false', question: 'q', correctAnswer: true }] });
        });

        await QuizGame.prototype.quickStartQuiz.call(game, 'B.json');

        expect(prompt).not.toHaveBeenCalled();
        expect(game.socketManager.createGame).toHaveBeenCalledTimes(1);
    });

    test('an unprotected quiz still starts without a prompt', async () => {
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async (url) => {
            if (url.startsWith('api/requires-auth')) return res(200, { requiresAuth: false });
            return res(200, { title: 'A', questions: [{ type: 'true-false', question: 'q', correctAnswer: true }] });
        });

        await QuizGame.prototype.quickStartQuiz.call(game, 'A.json');

        expect(prompt).not.toHaveBeenCalled();
        expect(game.socketManager.createGame).toHaveBeenCalledTimes(1);
    });
});
