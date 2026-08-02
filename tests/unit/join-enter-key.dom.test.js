/**
 * @jest-environment jsdom
 *
 * Enter key on the join form. The markup promises enterkeyhint="next" on the
 * PIN field and enterkeyhint="go" on the name field, so the handlers must
 * differ: PIN advances focus (setDefaultPlayerName() prefills a random
 * "PlayerN", and advancing is what lets a student replace it), name submits.
 */

import { QuizGame } from '../../public/js/core/app.js';
import { dom } from '../../public/js/utils/dom.js';

function pressKey(id, key) {
    const el = document.getElementById(id);
    const evt = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    el.dispatchEvent(evt);
    return evt;
}

describe('join form Enter handling', () => {
    let game;

    beforeEach(() => {
        dom.clearCache();
        document.body.innerHTML = `
            <input type="text" id="game-pin-input" enterkeyhint="next">
            <input type="text" id="player-name" enterkeyhint="go" value="Player7">
        `;
        // initializeEventListeners() only binds; every handler is a lazy arrow,
        // so a stub with the two members used at bind time is enough.
        game = { joinGame: jest.fn(), abortController: new AbortController() };
        QuizGame.prototype.initializeEventListeners.call(game);
    });

    afterEach(() => {
        game.abortController.abort();
    });

    test('Enter on the PIN field advances to the name field without joining', () => {
        document.getElementById('game-pin-input').focus();
        const evt = pressKey('game-pin-input', 'Enter');

        expect(game.joinGame).not.toHaveBeenCalled();
        expect(document.activeElement.id).toBe('player-name');
        expect(evt.defaultPrevented).toBe(true);
    });

    test('the prefilled name is selected so typing replaces it', () => {
        pressKey('game-pin-input', 'Enter');
        const name = document.getElementById('player-name');

        expect(name.selectionStart).toBe(0);
        expect(name.selectionEnd).toBe('Player7'.length);
    });

    test('Enter on the name field joins the game', () => {
        const evt = pressKey('player-name', 'Enter');

        expect(game.joinGame).toHaveBeenCalledTimes(1);
        expect(evt.defaultPrevented).toBe(true);
    });

    test('a non-Enter key on the PIN field is left alone', () => {
        document.getElementById('game-pin-input').focus();
        const evt = pressKey('game-pin-input', '4');

        expect(game.joinGame).not.toHaveBeenCalled();
        expect(document.activeElement.id).toBe('game-pin-input');
        expect(evt.defaultPrevented).toBe(false);
    });
});
