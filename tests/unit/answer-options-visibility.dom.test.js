/**
 * @jest-environment jsdom
 *
 * Regression test for GOTCHAS #6 on #answer-options.
 *
 * `hidden` and `visible-block` both use `!important`, so an element carrying
 * both is resolved by CSS source order, not intent. The host options container
 * is shown with `show(el, 'visible-block')` while a question is on screen; the
 * between-questions / rematch cleanup then hid it. If that cleanup adds
 * `hidden` without dropping `visible-block`, the container ends up with both.
 */

import { GameDisplayManager } from '../../public/js/game/modules/game-display-manager.js';
import { show } from '../../public/js/utils/dom.js';

describe('#answer-options never carries hidden and visible-block together', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <h3 id="current-question"></h3>
            <h3 id="player-question-text"></h3>
            <div id="host-multiple-choice"><div id="answer-options"></div></div>`;
    });

    test('clearHostQuestionContent drops visible-block when it hides the container', () => {
        const options = document.getElementById('answer-options');
        show(options, 'visible-block');
        expect(options.classList.contains('visible-block')).toBe(true);

        new GameDisplayManager({}).clearHostQuestionContent(false);

        expect(options.classList.contains('hidden')).toBe(true);
        expect(options.classList.contains('visible-block')).toBe(false);
    });
});
