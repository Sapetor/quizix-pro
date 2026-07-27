/**
 * Unit tests for socket/gameplay-events.js
 *
 * Exercises submit-answer, use-power-up, force-end-question, next-question.
 * Validation is REAL; game/player/question services are jest mocks.
 */

const { registerGameplayEvents } = require('../../socket/gameplay-events');
const { createFakeSocket, createFakeIo, createOptions } = require('./helpers/socket-fakes');

function setup(overrides = {}) {
    const socket = createFakeSocket('player-sock');
    const io = createFakeIo();
    const options = createOptions(overrides);
    registerGameplayEvents(io, socket, options);
    return { socket, io, options, h: socket.handlers };
}

const findEmit = (list, event) => list.find(e => e.event === event);

describe('gameplay-events: submit-answer', () => {
    it('records a valid answer via questionFlowService', () => {
        const player = { name: 'Al', gamePin: '123456' };
        const game = { pin: '123456' };
        const { socket, io, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(player);
        options.gameSessionService.getGame.mockReturnValue(game);

        h['submit-answer']({ answer: 2, type: 'multiple-choice' });

        expect(options.questionFlowService.handleAnswerSubmission).toHaveBeenCalledWith(
            'player-sock', 2, 'multiple-choice', player, game, socket, io
        );
    });

    it('rejects an invalid payload via validateAndHandle', () => {
        const { socket, options, h } = setup();
        // answer must be number|boolean|string|number[]; an object fails
        h['submit-answer']({ answer: { bad: true } });

        expect(findEmit(socket.emits, 'error')).toBeTruthy();
        expect(options.questionFlowService.handleAnswerSubmission).not.toHaveBeenCalled();
    });

    it('emits answer-rejected when the player session is missing', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(null);

        h['submit-answer']({ answer: 1 });

        expect(findEmit(socket.emits, 'answer-rejected').data.messageKey).toBe('error_session_not_found');
        expect(options.questionFlowService.handleAnswerSubmission).not.toHaveBeenCalled();
    });

    it('emits answer-rejected when the game is missing', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue({ gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue(null);

        h['submit-answer']({ answer: 1 });

        expect(findEmit(socket.emits, 'answer-rejected').data.messageKey).toBe('error_game_not_found');
    });

    it('does nothing when rate limited', () => {
        const { options, h } = setup({ checkRateLimit: jest.fn(() => false) });
        h['submit-answer']({ answer: 1 });
        expect(options.playerManagementService.getPlayer).not.toHaveBeenCalled();
    });
});

describe('gameplay-events: use-power-up', () => {
    it('applies a power-up and emits the result', () => {
        const player = { name: 'Al', gamePin: '123456' };
        const game = { pin: '123456', usePowerUp: jest.fn(() => ({ success: true })) };
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(player);
        options.gameSessionService.getGame.mockReturnValue(game);

        h['use-power-up']({ type: 'fifty-fifty' });

        expect(game.usePowerUp).toHaveBeenCalledWith('player-sock', 'fifty-fifty');
        expect(findEmit(socket.emits, 'power-up-result').data).toEqual({ success: true });
        expect(options.gameSessionService.extendQuestionTimer).not.toHaveBeenCalled();
    });

    it('extends the room timer for a successful extend-time power-up', () => {
        const game = { pin: '123456', usePowerUp: jest.fn(() => ({ success: true, extraSeconds: 10 })) };
        const { io, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue({ name: 'Al', gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue(game);

        h['use-power-up']({ type: 'extend-time' });

        expect(options.gameSessionService.extendQuestionTimer).toHaveBeenCalledWith(game, io, 10);
    });

    it('rejects missing power-up data', () => {
        const { socket, options, h } = setup();
        h['use-power-up']({});
        expect(findEmit(socket.emits, 'power-up-result').data).toMatchObject({ success: false, messageKey: 'error_invalid_powerup' });
        expect(options.playerManagementService.getPlayer).not.toHaveBeenCalled();
    });

    it('emits failure when the player is not found', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue(null);
        h['use-power-up']({ type: 'fifty-fifty' });
        expect(findEmit(socket.emits, 'power-up-result').data.messageKey).toBe('error_player_not_found');
    });

    it('emits failure when the game is not found', () => {
        const { socket, options, h } = setup();
        options.playerManagementService.getPlayer.mockReturnValue({ gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue(null);
        h['use-power-up']({ type: 'fifty-fifty' });
        expect(findEmit(socket.emits, 'power-up-result').data.messageKey).toBe('error_game_not_found');
    });
});

describe('gameplay-events: force-end-question', () => {
    it('ends the question early when a question is active', () => {
        const game = { pin: '123456', gameState: 'question', currentQuestion: 0 };
        const { io, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['force-end-question']();

        // The 'host' trigger keeps the service log truthful — this path is not
        // "all players answered".
        expect(options.questionFlowService.endQuestionEarly).toHaveBeenCalledWith(game, io, 'host');
    });

    it('does nothing when the game is not in question state', () => {
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue({ pin: '1', gameState: 'revealing' });
        h['force-end-question']();
        expect(options.questionFlowService.endQuestionEarly).not.toHaveBeenCalled();
    });

    it('does nothing when the host owns no game', () => {
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        h['force-end-question']();
        expect(options.questionFlowService.endQuestionEarly).not.toHaveBeenCalled();
    });
});

describe('gameplay-events: next-question', () => {
    it('advances from a non-question state', () => {
        const game = { pin: '123456', gameState: 'revealing', currentQuestion: 0, quiz: { questions: [{}, {}] } };
        const { io, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['next-question']();

        expect(options.gameSessionService.manualAdvanceToNextQuestion).toHaveBeenCalledWith(game, io);
    });

    it('refuses to advance while a question is actively running', () => {
        const game = { pin: '123456', gameState: 'question', currentQuestion: 0, quiz: { questions: [{}] } };
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['next-question']();

        expect(options.gameSessionService.manualAdvanceToNextQuestion).not.toHaveBeenCalled();
    });

    it('does nothing when the host owns no game', () => {
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        h['next-question']();
        expect(options.gameSessionService.manualAdvanceToNextQuestion).not.toHaveBeenCalled();
    });
});
