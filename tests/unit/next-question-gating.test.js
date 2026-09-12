/**
 * next-question gating + startTimer clearing.
 *
 * The handler rejected only gameState === 'question', so a host click (or a
 * replayed/queued event) in 'lobby' or 'starting' was accepted. Game.nextQuestion()
 * cleared every timer except startTimer, so the pending game-start timer fired
 * afterwards and advanced the game a second time — cutting question 1 short and
 * stranding the answers submitted to it.
 */

const { Game } = require('../../services/game');
const { registerGameplayEvents } = require('../../socket/gameplay-events');
const { createFakeSocket, createFakeIo, createOptions } = require('./helpers/socket-fakes');

const CONFIG = {
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 },
        DEFAULT_TOLERANCE: 0.1
    },
    TIMING: { DEFAULT_QUESTION_TIME: 20 }
};

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function setup() {
    const socket = createFakeSocket('host-sock');
    const io = createFakeIo();
    const options = createOptions();
    registerGameplayEvents(io, socket, options);
    return { socket, io, options, h: socket.handlers };
}

describe('gameplay-events: next-question state gate', () => {
    it.each(['lobby', 'starting', 'finished', 'pending-migration'])(
        'ignores next-question while the game is in %s',
        (gameState) => {
            const { options, h } = setup();
            options.gameSessionService.findGameByHost.mockReturnValue({
                pin: '123456', gameState, currentQuestion: 0, quiz: { questions: [{}, {}] }
            });

            h['next-question']();

            expect(options.gameSessionService.manualAdvanceToNextQuestion).not.toHaveBeenCalled();
        }
    );

    it('still ignores next-question while a question is running', () => {
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue({
            pin: '123456', gameState: 'question', currentQuestion: 0, quiz: { questions: [{}, {}] }
        });

        h['next-question']();

        expect(options.gameSessionService.manualAdvanceToNextQuestion).not.toHaveBeenCalled();
    });

    it('accepts next-question during the reveal', () => {
        const { io, options, h } = setup();
        const game = { pin: '123456', gameState: 'revealing', currentQuestion: 0, quiz: { questions: [{}, {}] } };
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['next-question']();

        expect(options.gameSessionService.manualAdvanceToNextQuestion).toHaveBeenCalledWith(game, io);
    });
});

describe('Game.nextQuestion timer clearing', () => {
    it('clears a pending startTimer so the game-start delay cannot advance again', () => {
        const game = new Game('host-1', {
            title: 'T',
            questions: [{ type: 'multiple-choice', question: 'q', options: ['A', 'B'], correctAnswer: 0 }, { type: 'true-false', question: 'q2', correctAnswer: true }]
        }, mockLogger, CONFIG, { MAX_PLAYERS_PER_GAME: 200 });

        const fired = jest.fn();
        game.startTimer = setTimeout(fired, 10_000);

        game.nextQuestion();

        expect(game.startTimer).toBeNull();
        clearTimeout(game.startTimer);
    });
});
