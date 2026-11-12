/**
 * @jest-environment jsdom
 *
 * Overwriting a quiz in a password-protected folder needs the unlock token on
 * POST /api/save-quiz. A rejected token prompts once and retries. A rename in
 * the file browser updates the open editor's title.
 */

import { QuizManager } from '../../public/js/quiz/quiz-manager.js';
import { APIHelper } from '../../public/js/utils/api-helper.js';

const res = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('saving a loaded protected quiz', () => {
    let manager;
    let posts;

    beforeEach(() => {
        document.body.innerHTML = '<input id="quiz-title" value="Old">';
        APIHelper.quizUnlockTokens.clear();
        manager = Object.create(QuizManager.prototype);
        manager.pendingSave = { title: 'Old', questions: [{}], settings: {}, filename: 'q.json' };
        manager.autoSaveQuiz = jest.fn();
        manager.fileManager = { ensureUnlocked: jest.fn(), registerNewQuiz: jest.fn() };
        posts = [];
    });

    afterEach(() => { jest.restoreAllMocks(); APIHelper.quizUnlockTokens.clear(); });

    test('sends the cached unlock token for the loaded filename', async () => {
        APIHelper.quizUnlockTokens.set('q.json', { token: 'tok', expiresAt: Date.now() + 60000 });
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async (url, opts) => {
            posts.push(opts);
            return res(200, { filename: 'q.json', title: 'Old' });
        });

        await manager.confirmSave('');

        expect(new Headers(posts[0].headers).get('Authorization')).toBe('Bearer tok');
    });

    test('a 401 prompts once and retries with the fresh token', async () => {
        manager.fileManager.ensureUnlocked.mockImplementation(async () => {
            APIHelper.quizUnlockTokens.set('q.json', { token: 'fresh', expiresAt: Date.now() + 60000 });
            return true;
        });
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async (url, opts) => {
            posts.push(opts);
            return posts.length === 1 ? res(401, { error: 'locked' }) : res(200, { filename: 'q.json', title: 'Old' });
        });

        await manager.confirmSave('');

        expect(manager.fileManager.ensureUnlocked).toHaveBeenCalledTimes(1);
        expect(posts).toHaveLength(2);
        expect(new Headers(posts[1].headers).get('Authorization')).toBe('Bearer fresh');
    });

    test('a new quiz (no filename) sends no token', async () => {
        manager.pendingSave.filename = null;
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async (url, opts) => {
            posts.push(opts);
            return res(200, { filename: 'n.json', title: 'Old' });
        });

        await manager.confirmSave('');

        expect(new Headers(posts[0].headers).get('Authorization')).toBeNull();
    });
});

describe('rename in the file browser while the quiz is open', () => {
    test('updates the title field and the tracked title', () => {
        document.body.innerHTML = '<input id="quiz-title" value="Old">';
        const manager = Object.create(QuizManager.prototype);
        manager._loadedFilename = 'q.json';
        manager._loadedTitle = 'Old';

        manager.handleQuizRenamed({ filename: 'q.json', displayName: 'New' });

        expect(document.getElementById('quiz-title').value).toBe('New');
        expect(manager._loadedTitle).toBe('New');
    });

    test('ignores a rename of another file', () => {
        document.body.innerHTML = '<input id="quiz-title" value="Old">';
        const manager = Object.create(QuizManager.prototype);
        manager._loadedFilename = 'q.json';
        manager._loadedTitle = 'Old';

        manager.handleQuizRenamed({ filename: 'other.json', displayName: 'New' });

        expect(document.getElementById('quiz-title').value).toBe('Old');
        expect(manager._loadedTitle).toBe('Old');
    });
});
