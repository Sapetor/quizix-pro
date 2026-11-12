/**
 * @jest-environment jsdom
 *
 * Quizzes in a password-protected folder need the unlock token on rename,
 * move and visibility changes (PATCH /api/quiz-metadata), and a delete that
 * the server rejects with a stale token must prompt again and retry once.
 */

import { FileManager } from '../../public/js/ui/file-manager.js';
import { APIHelper } from '../../public/js/utils/api-helper.js';

const res = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const tick = () => new Promise((r) => setTimeout(r, 0));

async function answerPrompt(value) {
    await tick();
    const input = document.querySelector('.modal input');
    input.value = value;
    document.querySelector('.modal .btn.primary').click();
}

describe('FileManager writes on protected quizzes', () => {
    let fm;
    let calls;

    beforeEach(() => {
        document.body.innerHTML = '';
        fm = Object.create(FileManager.prototype);
        fm.sessionTokens = new Map();
        fm.treeData = { folders: [], quizzes: [{ type: 'quiz', filename: 'q.json', protected: true }] };
        fm.showToast = jest.fn();
        fm.loadTree = jest.fn();
        fm.getFolderList = () => [{ id: 'f1', name: 'F', path: 'F' }];
        fm.ensureUnlocked = jest.fn(async (type, id) => {
            fm.sessionTokens.set(id, { token: 'tok', expiresAt: Date.now() + 60000 });
            return true;
        });
        calls = [];
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async (url, opts) => {
            calls.push({ url, opts });
            return res(200);
        });
        global.fetch = jest.fn(async (url, opts) => { calls.push({ url, opts }); return res(200); });
        jest.spyOn(APIHelper, 'getApiUrl').mockImplementation((u) => u);
    });

    afterEach(() => { jest.restoreAllMocks(); delete global.fetch; });

    const patch = () => calls.find((c) => c.opts?.method === 'PATCH');

    test('rename sends the unlock token', async () => {
        const p = fm.renameItem('quiz', 'q.json', { displayName: 'Old', protected: true });
        await answerPrompt('New');
        await p;
        expect(fm.ensureUnlocked).toHaveBeenCalledWith('quiz', 'q.json', 'Old');
        expect(new Headers(patch().opts.headers).get('Authorization')).toBe('Bearer tok');
    });

    test('rename of an unprotected quiz does not prompt or send a token', async () => {
        const p = fm.renameItem('quiz', 'q.json', { displayName: 'Old', protected: false });
        await answerPrompt('New');
        await p;
        expect(fm.ensureUnlocked).not.toHaveBeenCalled();
        expect(new Headers(patch().opts.headers).get('Authorization')).toBeNull();
    });

    test('move sends the unlock token', async () => {
        const p = fm.moveItem('quiz', 'q.json', { displayName: 'Old', protected: true });
        await answerPrompt('1');
        await p;
        expect(new Headers(patch().opts.headers).get('Authorization')).toBe('Bearer tok');
    });

    test('visibility toggle sends the unlock token for a protected quiz', async () => {
        await fm.toggleQuizVisibility('q.json', 'public');
        expect(fm.ensureUnlocked).toHaveBeenCalled();
        expect(new Headers(patch().opts.headers).get('Authorization')).toBe('Bearer tok');
    });

    test('delete rejected with a stale token prompts again and retries once', async () => {
        fm.sessionTokens.set('q.json', { token: 'stale', expiresAt: Date.now() + 60000 });
        APIHelper.quizUnlockTokens.set('q.json', { token: 'stale', expiresAt: Date.now() + 60000 });
        // confirmModal is a DOM modal: accept it
        const confirm = tick().then(() => document.querySelector('.modal .btn.danger, .modal .btn.primary, .modal button:last-child').click());
        let deletes = 0;
        APIHelper.fetchAPI.mockImplementation(async (url, opts) => {
            if (opts?.method === 'DELETE') {
                deletes++;
                calls.push({ url, opts });
                return deletes === 1 ? res(403, { messageKey: 'error_invalid_token', error: 'bad token' }) : res(200);
            }
            return res(200);
        });
        fm.ensureUnlocked = jest.fn(async (type, id) => {
            fm.sessionTokens.set(id, { token: 'fresh', expiresAt: Date.now() + 60000 });
            return true;
        });

        await fm.deleteItem('quiz', 'q.json', { displayName: 'Q', protected: true });
        await confirm;

        const dels = calls.filter((c) => c.opts?.method === 'DELETE');
        expect(dels).toHaveLength(2);
        expect(dels[1].opts.headers.Authorization).toBe('Bearer fresh');
        expect(APIHelper.quizUnlockTokens.has('q.json')).toBe(false);
    });
});
