/**
 * @jest-environment jsdom
 *
 * Tests for PlayerInteractionManager
 * (public/js/game/modules/player-interaction-manager.js).
 *
 * Documented gotcha: setupEventListeners() must be wired up (GameManager calls
 * it in its constructor) or answer clicks never reach the server. These tests
 * drive the real GameStateManager plus light stubs for the display/sound/socket
 * collaborators, and assert:
 *   - setupEventListeners installs a document-level click handler that turns an
 *     option click into a submitted answer,
 *   - the selection guards (host / result shown / already submitted) hold,
 *   - removeEventListeners tears the handler down.
 */

import { PlayerInteractionManager } from '../../public/js/game/modules/player-interaction-manager.js';
import { GameStateManager } from '../../public/js/game/modules/game-state-manager.js';

function buildPlayerDom() {
    document.body.innerHTML = `
        <div id="player-timer"></div>
        <div class="player-options">
            <button class="player-option" data-answer="0">A</button>
            <button class="player-option" data-answer="1">B</button>
        </div>
    `;
}

function makeManager() {
    const stateManager = new GameStateManager();
    const displayManager = { clearClientSelections: jest.fn() };
    const soundManager = { isSoundsEnabled: () => false, playEnhancedSound: jest.fn() };
    const emitted = [];
    const eventBus = { emit: (event, payload) => emitted.push({ event, payload }) };

    const pim = new PlayerInteractionManager(stateManager, displayManager, soundManager, null);
    pim.eventBus = eventBus;

    // Player is answering a multiple-choice question.
    stateManager.setPlayerName('Alice');
    stateManager.setHostMode(false);
    stateManager.initializeQuestionState({ type: 'multiple-choice', questionNumber: 1 });

    return { pim, stateManager, displayManager, emitted };
}

describe('PlayerInteractionManager selectAnswer / submitAnswer', () => {
    beforeEach(() => buildPlayerDom());

    test('selecting a multiple-choice option records and auto-submits it', () => {
        const { pim, stateManager, emitted } = makeManager();
        pim.selectAnswer(1);

        expect(stateManager.getGameState().selectedAnswer).toBe(1);
        expect(stateManager.getGameState().answerSubmitted).toBe(true);
        expect(emitted).toEqual([{ event: 'submit-answer', payload: { answer: 1 } }]);
        expect(document.querySelector('[data-answer="1"]').classList.contains('selected')).toBe(true);
    });

    test('a host never submits an answer', () => {
        const { pim, stateManager, emitted } = makeManager();
        stateManager.setHostMode(true);
        pim.selectAnswer(1);
        expect(emitted).toEqual([]);
        expect(stateManager.getGameState().answerSubmitted).toBe(false);
    });

    test('no submission after the result has been shown', () => {
        const { pim, stateManager, emitted } = makeManager();
        stateManager.markResultShown();
        pim.selectAnswer(1);
        expect(emitted).toEqual([]);
    });

    test('the second selection is ignored (no double submission)', () => {
        const { pim, emitted } = makeManager();
        pim.selectAnswer(0);
        pim.selectAnswer(1);
        expect(emitted).toEqual([{ event: 'submit-answer', payload: { answer: 0 } }]);
    });

    test('submitting hides the player timer', () => {
        const { pim } = makeManager();
        pim.selectAnswer(0);
        expect(document.getElementById('player-timer').classList.contains('hidden')).toBe(true);
    });

    test('submitAnswer with no eventBus and no socket does not throw or mark submitted', () => {
        const stateManager = new GameStateManager();
        stateManager.initializeQuestionState({ type: 'multiple-choice' });
        const pim = new PlayerInteractionManager(
            stateManager,
            { clearClientSelections: jest.fn() },
            { isSoundsEnabled: () => false },
            null
        );
        expect(() => pim.submitAnswer(0)).not.toThrow();
        expect(stateManager.getGameState().answerSubmitted).toBe(false);
    });
});

describe('PlayerInteractionManager event listener wiring (the gotcha)', () => {
    beforeEach(() => buildPlayerDom());

    test('setupEventListeners makes a raw option click submit the answer', () => {
        const { pim, stateManager, emitted } = makeManager();
        pim.setupEventListeners();

        document.querySelector('[data-answer="1"]').click();

        expect(stateManager.getGameState().answerSubmitted).toBe(true);
        expect(emitted).toEqual([{ event: 'submit-answer', payload: { answer: 1 } }]);

        pim.removeEventListeners();
    });

    test('without setupEventListeners a click does nothing (proves the wiring matters)', () => {
        const { emitted } = makeManager();
        // no setupEventListeners()
        document.querySelector('[data-answer="1"]').click();
        expect(emitted).toEqual([]);
    });

    test('removeEventListeners detaches the handler so later clicks are inert', () => {
        const { pim, emitted } = makeManager();
        pim.setupEventListeners();
        pim.removeEventListeners();

        document.querySelector('[data-answer="0"]').click();
        expect(emitted).toEqual([]);
    });
});
