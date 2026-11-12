/**
 * @jest-environment jsdom
 *
 * After a server restart a cached quiz unlock token is rejected with 401. The
 * client must drop it so the next load prompts for the password again, and the
 * file manager must not trust its own cached copy once APIHelper dropped it.
 */

import { APIHelper } from '../../public/js/utils/api-helper.js';
import { FileManager } from '../../public/js/ui/file-manager.js';

describe('stale quiz unlock token', () => {
    beforeEach(() => {
        APIHelper.quizUnlockTokens.clear();
        APIHelper.quizUnlockTokens.set('locked.json', { token: 'old', expiresAt: Date.now() + 60000 });
    });

    afterEach(() => {
        APIHelper.quizUnlockTokens.clear();
        delete global.fetch;
    });

    test('a 401 on a quiz download drops the token that was sent', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

        await APIHelper.fetchAPI('api/quiz/locked.json');

        expect(global.fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer old');
        expect(APIHelper.quizUnlockTokens.has('locked.json')).toBe(false);
    });

    test('a 401 without a sent token leaves other tokens alone', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });

        await APIHelper.fetchAPI('api/quiz/other.json');

        expect(APIHelper.quizUnlockTokens.has('locked.json')).toBe(true);
    });

    test('a 200 keeps the token', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

        await APIHelper.fetchAPI('api/quiz/locked.json');

        expect(APIHelper.quizUnlockTokens.has('locked.json')).toBe(true);
    });

    test('FileManager prompts again once APIHelper dropped the quiz token', async () => {
        const fm = Object.create(FileManager.prototype);
        fm.sessionTokens = new Map([['locked.json', { token: 'old', expiresAt: Date.now() + 60000 }]]);
        fm.showToast = jest.fn();
        fm.passwordModal = { promptPassword: jest.fn().mockRejectedValue(new Error('Cancelled')) };
        jest.spyOn(APIHelper, 'fetchAPI').mockResolvedValue({ ok: true, json: async () => ({ requiresAuth: true }) });

        expect(await fm.ensureUnlocked('quiz', 'locked.json', 'locked')).toBe(true);
        expect(fm.passwordModal.promptPassword).not.toHaveBeenCalled();

        APIHelper.quizUnlockTokens.delete('locked.json');
        expect(await fm.ensureUnlocked('quiz', 'locked.json', 'locked')).toBe(false);
        expect(fm.passwordModal.promptPassword).toHaveBeenCalledTimes(1);
        jest.restoreAllMocks();
    });
});
