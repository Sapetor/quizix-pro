/**
 * @jest-environment jsdom
 *
 * Host correct-answer reveal (GameManager.highlightCorrectAnswers).
 *
 * Two defects are covered:
 *   - ordering questions got no host reveal at all (no branch existed), and
 *   - the `.option-display` lookup was unscoped, so it could index into
 *     look-alike tiles rendered elsewhere in the DOM.
 *
 * The methods are pure DOM work, so the tests run them on a bare prototype
 * instance with a stubbed stateManager rather than constructing a full
 * GameManager (which would wire up sockets, timers and MathJax).
 */

import { GameManager } from '../../public/js/game/game-manager.js';

function makeHostManager(isHost = true) {
    const gm = Object.create(GameManager.prototype);
    gm.stateManager = { getGameState: () => ({ isHost }) };
    return gm;
}

function buildOrderingHostDom() {
    // Host tiles are rendered in a random order by renderHostOptions, each
    // carrying its canonical index in data-original-index.
    document.body.innerHTML = `
        <div id="host-game-screen" class="screen">
            <div id="answer-options" class="player-options">
                <div class="ordering-display">
                    <div class="ordering-display-item" data-original-index="1" data-order-index="0">
                        <div class="ordering-item-number">1</div>
                        <div class="ordering-item-content">Second</div>
                    </div>
                    <div class="ordering-display-item" data-original-index="2" data-order-index="1">
                        <div class="ordering-item-number">2</div>
                        <div class="ordering-item-content">Third</div>
                    </div>
                    <div class="ordering-display-item" data-original-index="0" data-order-index="2">
                        <div class="ordering-item-number">3</div>
                        <div class="ordering-item-content">First</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

const renderedOrder = () =>
    Array.from(document.querySelectorAll('#host-game-screen .ordering-display-item'))
        .map(item => item.querySelector('.ordering-item-content').textContent);

const renderedNumbers = () =>
    Array.from(document.querySelectorAll('#host-game-screen .ordering-item-number'))
        .map(el => el.textContent);

describe('GameManager.highlightCorrectAnswers — ordering', () => {
    test('reorders the host tiles into the correct sequence and renumbers them', () => {
        buildOrderingHostDom();
        const gm = makeHostManager();

        // Canonical options are ['First', 'Second', 'Third']; correct sequence
        // is Third -> First -> Second.
        gm.highlightCorrectAnswers({ questionType: 'ordering', correctOrder: [2, 0, 1] });

        expect(renderedOrder()).toEqual(['Third', 'First', 'Second']);
        expect(renderedNumbers()).toEqual(['1', '2', '3']);
    });

    test('marks every tile so the reveal is visible, not just reordered', () => {
        buildOrderingHostDom();
        const gm = makeHostManager();

        gm.highlightCorrectAnswers({ questionType: 'ordering', correctOrder: [2, 0, 1] });

        const marked = document.querySelectorAll('.ordering-display-item.host-correct-order');
        expect(marked).toHaveLength(3);
    });

    test('leaves the tiles untouched when the payload carries no correctOrder', () => {
        buildOrderingHostDom();
        const gm = makeHostManager();

        gm.highlightCorrectAnswers({ questionType: 'ordering' });

        expect(renderedOrder()).toEqual(['Second', 'Third', 'First']);
        expect(document.querySelectorAll('.host-correct-order')).toHaveLength(0);
    });

    test('does nothing on a player client', () => {
        buildOrderingHostDom();
        const gm = makeHostManager(false);

        gm.highlightCorrectAnswers({ questionType: 'ordering', correctOrder: [2, 0, 1] });

        expect(document.querySelectorAll('.host-correct-order')).toHaveLength(0);
    });
});

describe('GameManager.highlightCorrectAnswers — option-display scoping', () => {
    test('ignores look-alike .option-display tiles outside the host screen', () => {
        // The preview/player DOM is present at the same time and its tiles come
        // first in document order — an unscoped querySelectorAll would mark one
        // of these instead of the host tile.
        document.body.innerHTML = `
            <div id="preview-container">
                <div class="option-display" id="decoy-0">A</div>
                <div class="option-display" id="decoy-1">B</div>
            </div>
            <div id="host-game-screen" class="screen">
                <div id="answer-options" class="player-options">
                    <div class="option-display" id="host-0">A</div>
                    <div class="option-display" id="host-1">B</div>
                </div>
            </div>
        `;
        const gm = makeHostManager();

        gm.highlightCorrectAnswers({ questionType: 'multiple-choice', correctAnswer: 1 });

        expect(document.getElementById('host-1').classList).toContain('host-correct-answer');
        expect(document.getElementById('decoy-1').classList).not.toContain('host-correct-answer');
        expect(document.getElementById('decoy-0').classList).not.toContain('host-correct-answer');
    });
});
