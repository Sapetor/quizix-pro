/**
 * @jest-environment jsdom
 *
 * Lobby empty state (GameManager.updatePlayersList).
 *
 * `.player-item.placeholder` has been styled in app-screens.css since the
 * paper/ink pass, but nothing ever rendered it: a lobby with zero players
 * showed a ~500px blank card, which reads as broken rather than as "waiting".
 * socket-manager.js:186 calls updatePlayersList([]) on lobby entry, so the
 * empty path is live.
 *
 * updatePlayersList is pure DOM work, so these run on a bare prototype
 * instance rather than constructing a full GameManager (sockets, timers,
 * MathJax).
 */

import { GameManager } from '../../public/js/game/game-manager.js';
import { dom } from '../../public/js/utils/dom.js';

function buildLobbyDom() {
    // dom.get() caches by id, so a rebuilt body would otherwise hand back a
    // detached node from the previous test.
    dom.clearCache();
    document.body.innerHTML = `
        <div id="game-lobby" class="screen">
            <div class="lobby-card players-list-card">
                <div class="card-heading">
                    <span><em id="lobby-headline-count">0</em> in the room</span>
                </div>
                <div id="players-list" class="players-grid"></div>
            </div>
            <span id="lobby-player-count">0</span>
        </div>
    `;
}

const chips = () => document.querySelectorAll('#players-list .player-item');
const placeholders = () => document.querySelectorAll('#players-list .player-item.placeholder');

describe('GameManager.updatePlayersList — empty state', () => {
    beforeEach(buildLobbyDom);

    test('renders a placeholder chip when the roster is empty', () => {
        const gm = Object.create(GameManager.prototype);
        gm.updatePlayersList([]);

        expect(placeholders()).toHaveLength(1);
        // Must carry a real label, not an empty dashed box.
        expect(placeholders()[0].textContent.trim().length).toBeGreaterThan(0);
    });

    test('the placeholder spans the full grid row rather than sitting in one column', () => {
        const gm = Object.create(GameManager.prototype);
        gm.updatePlayersList([]);

        // .players-grid is repeat(3, 1fr); a 1-column dashed stub reads as a
        // missing player, not as an empty-state message.
        expect(placeholders()[0].classList.contains('placeholder-full')).toBe(true);
    });

    test('renders no placeholder once a player joins', () => {
        const gm = Object.create(GameManager.prototype);
        gm.updatePlayersList([{ name: 'Tester' }]);

        expect(placeholders()).toHaveLength(0);
        expect(chips()).toHaveLength(1);
        expect(chips()[0].querySelector('.player-name').textContent).toBe('Tester');
    });

    test('clears the placeholder on the empty -> occupied transition', () => {
        const gm = Object.create(GameManager.prototype);
        gm.updatePlayersList([]);
        expect(placeholders()).toHaveLength(1);

        gm.updatePlayersList([{ name: 'Tester' }]);
        expect(placeholders()).toHaveLength(0);
        expect(chips()).toHaveLength(1);
    });

    test('restores the placeholder when the last player leaves', () => {
        const gm = Object.create(GameManager.prototype);
        gm.updatePlayersList([{ name: 'Tester' }]);
        gm.updatePlayersList([]);

        expect(placeholders()).toHaveLength(1);
        expect(chips()).toHaveLength(1); // the placeholder itself, no player chips
    });

    test('the placeholder is not counted as a player', () => {
        const gm = Object.create(GameManager.prototype);
        gm.updatePlayersList([]);

        expect(document.getElementById('lobby-headline-count').textContent).toBe('0');
        expect(document.getElementById('lobby-player-count').textContent).toBe('0');
    });
});
