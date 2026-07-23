/**
 * @jest-environment jsdom
 *
 * Tests for GameStateManager (public/js/game/modules/game-state-manager.js).
 *
 * This is the single source of truth for per-game client state (host flag,
 * selected/submitted answer, result-shown flag, player answers). Related gotcha:
 * screen transitions do NOT clear DOM on their own — reset() must fully wipe
 * state so a stale flag (e.g. answerSubmitted) can't leak into the next game.
 */

import { GameStateManager } from '../../public/js/game/modules/game-state-manager.js';

describe('GameStateManager initial state', () => {
    test('constructs with a clean, non-host, nothing-submitted state', () => {
        const s = new GameStateManager();
        expect(s.getGameState()).toEqual({
            isHost: false,
            playerName: '',
            currentQuestion: null,
            selectedAnswer: null,
            gameEnded: false,
            resultShown: false,
            answerSubmitted: false
        });
        expect(s.getPlayerAnswers().size).toBe(0);
    });
});

describe('GameStateManager transitions', () => {
    let s;
    beforeEach(() => { s = new GameStateManager(); });

    test('setSelectedAnswer records the answer', () => {
        s.setSelectedAnswer(2);
        expect(s.getGameState().selectedAnswer).toBe(2);
    });

    test('markAnswerSubmitted and markResultShown flip their flags', () => {
        s.markAnswerSubmitted();
        s.markResultShown();
        const state = s.getGameState();
        expect(state.answerSubmitted).toBe(true);
        expect(state.resultShown).toBe(true);
    });

    test('setHostMode toggles host flag (defaults to true)', () => {
        s.setHostMode();
        expect(s.getGameState().isHost).toBe(true);
        s.setHostMode(false);
        expect(s.getGameState().isHost).toBe(false);
    });

    test('endGame sets gameEnded', () => {
        s.endGame();
        expect(s.getGameState().gameEnded).toBe(true);
    });

    test('initializeQuestionState stores the question and clears per-question flags', () => {
        s.markAnswerSubmitted();
        s.markResultShown();
        s.setSelectedAnswer(3);
        s.initializeQuestionState({ questionNumber: 1, type: 'multiple-choice' });
        const state = s.getGameState();
        expect(state.currentQuestion).toEqual({ questionNumber: 1, type: 'multiple-choice' });
        expect(state.selectedAnswer).toBeNull();
        expect(state.answerSubmitted).toBe(false);
        expect(state.resultShown).toBe(false);
    });

    test('initializeQuestionState demotes a named player out of host mode', () => {
        s.setPlayerName('Alice');
        s.setHostMode(true);
        s.initializeQuestionState({ questionNumber: 1 });
        expect(s.getGameState().isHost).toBe(false);
    });

    test('initializeQuestionState leaves the literal "Host" player as host', () => {
        s.setPlayerName('Host');
        s.setHostMode(true);
        s.initializeQuestionState({ questionNumber: 1 });
        expect(s.getGameState().isHost).toBe(true);
    });
});

describe('GameStateManager player answers', () => {
    let s;
    beforeEach(() => { s = new GameStateManager(); });

    test('storePlayerAnswer keeps answers keyed by player id', () => {
        s.storePlayerAnswer('Alice', 1);
        s.storePlayerAnswer('Bob', [0, 2]);
        const answers = s.getPlayerAnswers();
        expect(answers.get('Alice')).toBe(1);
        expect(answers.get('Bob')).toEqual([0, 2]);
    });

    test('getPlayerAnswers returns a copy — mutating it does not corrupt state', () => {
        s.storePlayerAnswer('Alice', 1);
        const copy = s.getPlayerAnswers();
        copy.set('Mallory', 99);
        expect(s.getPlayerAnswers().has('Mallory')).toBe(false);
    });

    test('clearPlayerAnswers empties the map', () => {
        s.storePlayerAnswer('Alice', 1);
        s.clearPlayerAnswers();
        expect(s.getPlayerAnswers().size).toBe(0);
    });
});

describe('GameStateManager.reset — the anti-stale-state invariant', () => {
    test('reset returns every field to its initial value and empties answers', () => {
        const s = new GameStateManager();
        // Dirty every field.
        s.setHostMode(true);
        s.setPlayerName('Alice');
        s.setGamePin('123456');
        s.initializeQuestionState({ questionNumber: 5, type: 'numeric' });
        s.setSelectedAnswer(42);
        s.markAnswerSubmitted();
        s.markResultShown();
        s.endGame();
        s.storePlayerAnswer('Alice', 42);

        s.reset();

        expect(s.getGameState()).toEqual({
            isHost: false,
            playerName: '',
            currentQuestion: null,
            selectedAnswer: null,
            gameEnded: false,
            resultShown: false,
            answerSubmitted: false
        });
        expect(s.gamePin).toBeNull();
        expect(s.getPlayerAnswers().size).toBe(0);
    });
});
