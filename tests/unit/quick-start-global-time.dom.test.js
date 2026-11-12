/**
 * @jest-environment jsdom
 *
 * Quick Start "same time for all questions": the host-join schema reads
 * `timeLimit` and strips `time`, so the value must be written to `timeLimit`.
 */

import { QuizGame } from '../../public/js/core/app.js';
import { APIHelper } from '../../public/js/utils/api-helper.js';
import { dom } from '../../public/js/utils/dom.js';

const { hostJoinSchema } = require('../../services/validation-schemas.js');

const quiz = {
    title: 'T',
    questions: [
        { type: 'multiple-choice', question: 'Q1', options: ['a', 'b'], correctIndex: 0, timeLimit: 30 },
        { type: 'multiple-choice', question: 'Q2', options: ['a', 'b'], correctIndex: 1, time: 45 }
    ]
};

function jsonResponse(body) {
    return { ok: true, status: 200, json: async () => body };
}

describe('Quick Start same time for all', () => {
    let game;

    beforeEach(() => {
        dom.clearCache();
        window.matchMedia = window.matchMedia || (() => ({ matches: false }));
        document.body.innerHTML = `
            <input type="checkbox" id="qs-use-global-time" checked>
            <input type="number" id="qs-global-time" value="10">
        `;
        jest.spyOn(APIHelper, 'fetchAPI').mockImplementation(async (url) => {
            if (url.startsWith('api/requires-auth')) return jsonResponse({ requiresAuth: false });
            return jsonResponse(JSON.parse(JSON.stringify(quiz)));
        });
        game = {
            hideQuickStartModal: jest.fn(),
            socketManager: { createGame: jest.fn() },
            _ensureQuizUnlocked: QuizGame.prototype._ensureQuizUnlocked,
            _collectQuickStartSettings: QuizGame.prototype._collectQuickStartSettings
        };
    });

    afterEach(() => jest.restoreAllMocks());

    test('every question reaches the server with the chosen timeLimit', async () => {
        await QuizGame.prototype.quickStartQuiz.call(game, 'quiz.json');

        expect(game.socketManager.createGame).toHaveBeenCalledTimes(1);
        const payload = game.socketManager.createGame.mock.calls[0][0];
        const parsed = hostJoinSchema.parse(payload);
        expect(parsed.quiz.questions.map(q => q.timeLimit)).toEqual([10, 10]);
    });
});
