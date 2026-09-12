/**
 * @jest-environment jsdom
 *
 * Runtime defects fixed in the player game loop:
 *   - the correct-answer reveal indexed into the editor preview's look-alike
 *     `.player-option` / `.checkbox-option` markup instead of the player's own
 *     buttons (AnswerRevealManager),
 *   - the per-player answer map was never cleared between questions, so a
 *     skipped question showed the previous answer (GameStateManager),
 *   - a server time-sync only wrote the display, which the running countdown
 *     overwrote one tick later (TimerManager),
 *   - two error banners shared one removal timeout, so the first was orphaned
 *     on screen (PlayerInteractionManager),
 *   - nothing closed the answer gate at round end (PlayerInteractionManager).
 */

import { AnswerRevealManager } from '../../public/js/game/modules/answer-reveal-manager.js';
import { GameStateManager } from '../../public/js/game/modules/game-state-manager.js';
import { TimerManager } from '../../public/js/game/modules/timer-manager.js';
import { PlayerInteractionManager } from '../../public/js/game/modules/player-interaction-manager.js';
import { GameDisplayManager } from '../../public/js/game/modules/game-display-manager.js';

/**
 * The editor preview tiles come FIRST in index.html, exactly as in the real page.
 */
function buildDomWithEditorPreview() {
    document.body.innerHTML = `
        <div id="question-editor">
            <div class="player-options">
                <div class="player-option preview-option" data-option="0">preview A</div>
                <div class="player-option preview-option" data-option="1">preview B</div>
                <div class="player-option preview-option" data-option="2">preview C</div>
                <div class="player-option preview-option" data-option="3">preview D</div>
            </div>
            <div class="player-checkbox-options">
                <label class="checkbox-option preview-checkbox" data-option="0"><input type="checkbox" checked></label>
                <label class="checkbox-option preview-checkbox" data-option="1"><input type="checkbox"></label>
                <label class="checkbox-option preview-checkbox" data-option="2"><input type="checkbox"></label>
                <label class="checkbox-option preview-checkbox" data-option="3"><input type="checkbox"></label>
            </div>
        </div>

        <div id="player-game-screen">
            <div id="player-multiple-choice" class="player-answer-type">
                <div class="player-options">
                    <button class="player-option" data-answer="0" data-option="0">A</button>
                    <button class="player-option" data-answer="1" data-option="1">B</button>
                    <button class="player-option" data-answer="2" data-option="2">C</button>
                    <button class="player-option" data-answer="3" data-option="3">D</button>
                </div>
            </div>
            <div id="player-multiple-correct" class="player-answer-type hidden">
                <div class="player-checkbox-options">
                    <label class="checkbox-option" data-option="0"><input type="checkbox"></label>
                    <label class="checkbox-option" data-option="1"><input type="checkbox"></label>
                    <label class="checkbox-option" data-option="2"><input type="checkbox"></label>
                    <label class="checkbox-option" data-option="3"><input type="checkbox"></label>
                </div>
                <button id="submit-multiple">Submit</button>
            </div>
            <div id="player-true-false" class="player-answer-type hidden">
                <button class="tf-option" data-answer="true">TRUE</button>
                <button class="tf-option" data-answer="false">FALSE</button>
            </div>
            <div id="player-numeric" class="player-answer-type hidden">
                <input type="number" id="numeric-answer-input">
                <button id="submit-numeric">Submit</button>
            </div>
        </div>
    `;
}

const playerOptions = () => document.querySelectorAll('#player-multiple-choice .player-option');
const previewOptions = () => document.querySelectorAll('#question-editor .player-option');

describe('AnswerRevealManager reveals on the player buttons, not the editor preview', () => {
    beforeEach(() => buildDomWithEditorPreview());

    test('multiple-choice: the highlight lands on the player button at that index', () => {
        const reveal = new AnswerRevealManager({ getGameState: () => ({}) }, {});
        reveal.showCorrectAnswerOnClient(2, 'multiple-choice');

        expect(playerOptions()[2].classList.contains('correct-answer')).toBe(true);
        expect([...previewOptions()].some(el => el.classList.contains('correct-answer'))).toBe(false);
    });

    test('multiple-correct: reads the player checkboxes, not the preview ones', () => {
        const reveal = new AnswerRevealManager({ getGameState: () => ({}) }, {});
        // Player ticked option 1; the preview has option 0 ticked.
        document.querySelectorAll('#player-multiple-correct input')[1].checked = true;

        reveal.showCorrectAnswerOnClient([0, 1], 'multiple-correct');

        const playerBoxes = document.querySelectorAll('#player-multiple-correct .checkbox-option');
        expect(playerBoxes[0].classList.contains('correct-answer')).toBe(true);
        expect(playerBoxes[1].classList.contains('player-answered')).toBe(true);
        expect(playerBoxes[0].classList.contains('player-answered')).toBe(false);

        const previewBoxes = document.querySelectorAll('#question-editor .checkbox-option');
        expect([...previewBoxes].some(el => el.classList.contains('correct-answer'))).toBe(false);
        expect([...previewBoxes].some(el => el.classList.contains('player-answered'))).toBe(false);
    });

    test('true/false: the highlight lands on the player tile', () => {
        const reveal = new AnswerRevealManager({ getGameState: () => ({}) }, {});
        reveal.showCorrectAnswerOnClient(true, 'true-false');

        const tile = document.querySelector('#player-true-false .tf-option[data-answer="true"]');
        expect(tile.classList.contains('correct-answer')).toBe(true);
    });
});

describe('GameStateManager clears the answer map per question', () => {
    test('the previous question\'s answer does not survive into the next one', () => {
        const state = new GameStateManager();
        state.setPlayerName('Alice');

        state.initializeQuestionState({ type: 'multiple-choice', questionNumber: 1 });
        state.storePlayerAnswer('Alice', 2);
        expect(state.getPlayerAnswers().get('Alice')).toBe(2);

        // Question 2: the player answers nothing.
        state.initializeQuestionState({ type: 'numeric', questionNumber: 2 });
        expect(state.getPlayerAnswers().get('Alice')).toBeUndefined();
    });
});

describe('TimerManager.syncRemaining', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="timer"></div><div id="player-timer"></div>';
        jest.useFakeTimers();
    });
    afterEach(() => jest.useRealTimers());

    test('the synced value survives the next tick', () => {
        const timer = new TimerManager(null);
        timer.startTimer(30000);

        timer.syncRemaining(12000);
        expect(document.getElementById('timer').textContent).toBe('12');

        jest.advanceTimersByTime(1000);
        expect(timer.timeRemaining).toBe(11000);
        expect(document.getElementById('timer').textContent).toBe('11');

        timer.stopTimer();
    });

    test('pause stops the countdown and resume restarts it with the same callbacks', () => {
        const timer = new TimerManager(null);
        const onComplete = jest.fn();
        timer.startTimer(5000, null, onComplete);

        timer.pause();
        jest.advanceTimersByTime(3000);
        expect(timer.timeRemaining).toBe(5000);

        timer.resume();
        jest.advanceTimersByTime(5000);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    test('resume does nothing when the question ended while hidden', () => {
        const timer = new TimerManager(null);
        timer.startTimer(5000);

        timer.pause();
        timer.stopTimer();      // question-end arrived
        timer.resume();

        expect(timer.isRunning()).toBe(false);
    });
});

function makeInteractionManager() {
    const stateManager = new GameStateManager();
    const displayManager = new GameDisplayManager({});
    const pim = new PlayerInteractionManager(stateManager, displayManager, null, null);
    pim.eventBus = { emit: jest.fn() };
    stateManager.setPlayerName('Alice');
    stateManager.setHostMode(false);
    stateManager.initializeQuestionState({ type: 'multiple-choice', questionNumber: 1 });
    return { pim, stateManager };
}

describe('PlayerInteractionManager error banners', () => {
    beforeEach(() => {
        buildDomWithEditorPreview();
        jest.useFakeTimers();
    });
    afterEach(() => jest.useRealTimers());

    test('two banners both disappear instead of one orphaning the other', () => {
        const { pim } = makeInteractionManager();

        pim.showError('first');
        jest.advanceTimersByTime(500);
        pim.showError('second');

        expect(document.querySelectorAll('.player-error-message')).toHaveLength(2);

        jest.advanceTimersByTime(3000);
        expect(document.querySelectorAll('.player-error-message')).toHaveLength(0);
        expect(pim._errorBanners).toHaveLength(0);
    });

    test('cleanup removes banners still on screen', () => {
        const { pim } = makeInteractionManager();
        pim.showError('boom');
        pim.cleanup();
        expect(document.querySelectorAll('.player-error-message')).toHaveLength(0);
    });
});

describe('PlayerInteractionManager.lockAnswers', () => {
    beforeEach(() => buildDomWithEditorPreview());

    test('a tap after the round ends no longer reaches the server', () => {
        const { pim, stateManager } = makeInteractionManager();

        pim.lockAnswers();

        expect(stateManager.getGameState().answerSubmitted).toBe(true);
        expect(playerOptions()[0].disabled).toBe(true);
        expect(document.getElementById('submit-multiple').disabled).toBe(true);
        expect(previewOptions()[0].disabled).toBeUndefined();

        pim.selectAnswer(0);
        expect(pim.eventBus.emit).not.toHaveBeenCalled();
    });

    test('the host is unaffected', () => {
        const { pim, stateManager } = makeInteractionManager();
        stateManager.setHostMode(true);

        pim.lockAnswers();

        expect(playerOptions()[0].disabled).toBe(false);
    });
});
