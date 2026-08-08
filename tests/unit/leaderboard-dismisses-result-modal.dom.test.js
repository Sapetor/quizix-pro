/**
 * @jest-environment jsdom
 *
 * LeaderboardManager — the between-questions leaderboard must own the screen.
 *
 * The result modal is a full-screen overlay (#feedback-modal-overlay) that
 * survives screen changes. When a question carries an explanation,
 * GameManager.showPlayerResult passes displayDuration 0 so the explanation
 * stays readable for the whole reveal window — but nothing then took the
 * overlay down, so it sat on top of the leaderboard until the next question.
 *
 * Invariant under test: showing the leaderboard dismisses the result modal,
 * with or without an explanation.
 */

import { dom } from '../../public/js/utils/dom.js';
import { modalFeedback } from '../../public/js/utils/modal-feedback.js';
import { LeaderboardManager } from '../../public/js/game/modules/leaderboard-manager.js';

function buildDom() {
    document.body.innerHTML = `
        <div id="feedback-modal-overlay">
            <div id="feedback-modal" class="feedback-modal">
                <div id="feedback-icon"></div>
                <div id="modal-feedback-text"></div>
                <div id="modal-score-display"></div>
                <div id="modal-explanation"></div>
                <div id="modal-player-answer"></div>
            </div>
        </div>
        <div id="leaderboard-list"></div>
    `;
    // Both caches were populated against a DOM that no longer exists: the
    // modal singleton grabs its elements at import time, dom.get memoises.
    dom.clearCache();
    modalFeedback.initializeElements();
}

const isOverlayOpen = () => document.getElementById('feedback-modal-overlay').classList.contains('active');

function makeManager(isHost) {
    const uiManager = { showScreen: jest.fn() };
    const stateManager = { getGameState: () => ({ isHost }) };
    const manager = new LeaderboardManager(stateManager, uiManager, null);
    return { manager, uiManager };
}

beforeEach(() => {
    jest.useFakeTimers();
    buildDom();
});

afterEach(() => {
    modalFeedback.hide();
    jest.clearAllTimers();
    jest.useRealTimers();
});

describe('LeaderboardManager.showLeaderboard — result modal hand-off', () => {
    test('dismisses a result modal that has no auto-dismiss (explanation present)', () => {
        // displayDuration 0 = "stay up until the next question"
        modalFeedback.showIncorrect('Incorrect!', 0, 0, 'Because the derivative is 2x.');
        expect(isOverlayOpen()).toBe(true);

        const { manager, uiManager } = makeManager(true);
        manager.showLeaderboard([{ name: 'Ana', score: 100 }]);

        expect(isOverlayOpen()).toBe(false);
        expect(uiManager.showScreen).toHaveBeenCalledWith('leaderboard-screen');
    });

    test('dismisses the modal on the player side too', () => {
        modalFeedback.showIncorrect('Incorrect!', 0, 0, 'Explanation text.');
        expect(isOverlayOpen()).toBe(true);

        const { manager, uiManager } = makeManager(false);
        manager.showLeaderboard([{ name: 'Ana', score: 100 }]);

        expect(isOverlayOpen()).toBe(false);
        expect(uiManager.showScreen).toHaveBeenCalledWith('player-game-screen');
    });

    test('a result still waiting on the submission modal cannot pop over the leaderboard', () => {
        // Confirmation rendered, then a result arrives inside its minimum
        // visible window — the result render is queued on a timer.
        modalFeedback.showSubmission('Answer submitted: B');
        jest.advanceTimersByTime(1200);
        expect(isOverlayOpen()).toBe(true);
        modalFeedback.showIncorrect('Incorrect!', 0, 0, 'Explanation text.');

        const { manager } = makeManager(true);
        manager.showLeaderboard([{ name: 'Ana', score: 100 }]);
        expect(isOverlayOpen()).toBe(false);

        jest.advanceTimersByTime(5000);
        expect(isOverlayOpen()).toBe(false);
    });

    test('game-end path dismisses the modal too (leaderboard-between-questions disabled)', () => {
        // With "show leaderboard between questions" off, the server skips
        // show-leaderboard and goes straight to game-end — showLeaderboard is
        // never called, so showFinalResults must do its own dismissal.
        modalFeedback.showIncorrect('Incorrect!', 0, 0, 'Explanation text.');
        expect(isOverlayOpen()).toBe(true);

        const uiManager = { showScreen: jest.fn() };
        const stateManager = { getGameState: () => ({ isHost: true }), endGame: jest.fn() };
        const manager = new LeaderboardManager(stateManager, uiManager, null);
        manager.showHostFinalResults = jest.fn();

        manager.showFinalResults([{ name: 'Ana', score: 100 }], null, jest.fn());

        expect(isOverlayOpen()).toBe(false);
        expect(manager.showHostFinalResults).toHaveBeenCalled();
    });

    test('leaves the leaderboard list rendered', () => {
        const { manager } = makeManager(true);
        manager.showLeaderboard([{ name: 'Ana', score: 100 }, { name: 'Bo', score: 50 }]);

        expect(document.querySelectorAll('#leaderboard-list .leaderboard-item')).toHaveLength(2);
    });
});
