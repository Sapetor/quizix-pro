/**
 * Unit tests for socket/game-events.js
 *
 * Exercises the game-lifecycle handlers (host-join, start-game, stop-quiz,
 * host-leave-game, rematch-game, host-starting-new-game) through the fake
 * socket/io. Validation is REAL (validateAndHandle -> zod schemas); the
 * game/player/question services are jest mocks.
 */

const { registerGameEvents } = require('../../socket/game-events');
const { createFakeSocket, createFakeIo, createOptions } = require('./helpers/socket-fakes');

const validQuestion = { type: 'multiple-choice', question: 'Q1', options: ['a', 'b'], correctIndex: 0 };
const validQuiz = { title: 'My Quiz', questions: [validQuestion] };

function setup(overrides = {}) {
    const socket = createFakeSocket('host-sock');
    const io = createFakeIo();
    const options = createOptions(overrides);
    registerGameEvents(io, socket, options);
    return { socket, io, options, h: socket.handlers };
}

function findEmit(list, event) {
    return list.find(e => e.event === event);
}

describe('game-events: host-join', () => {
    function newGame() {
        return { pin: '123456', id: 'game-1', hostToken: 'ht', createdAt: 111, endQuestion: jest.fn() };
    }

    it('creates a game and notifies host + broadcasts availability on valid payload', () => {
        const game = newGame();
        const { socket, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        options.gameSessionService.createGame.mockReturnValue(game);
        options.playerManagementService.createOrGetSession.mockReturnValue({ hostSessionId: 'hs', currentGamePin: null });

        h['host-join']({ quiz: validQuiz });

        expect(options.gameSessionService.createGame).toHaveBeenCalledWith('host-sock', expect.objectContaining({ title: 'My Quiz' }));
        const created = findEmit(socket.emits, 'game-created');
        expect(created).toBeTruthy();
        expect(created.data).toMatchObject({ pin: '123456', gameId: 'game-1', hostToken: 'ht', hostSessionId: 'hs' });
        expect(findEmit(socket.broadcastEmits, 'game-available')).toBeTruthy();
        expect(socket.joinedRooms).toContain('game-123456');
    });

    it('rejects an invalid payload via validateAndHandle without creating a game', () => {
        const { socket, options, h } = setup();
        h['host-join']({ quiz: { title: '', questions: [] } });

        expect(options.gameSessionService.createGame).not.toHaveBeenCalled();
        expect(findEmit(socket.emits, 'error')).toBeTruthy();
    });

    it('does nothing when rate limited', () => {
        const { socket, options, h } = setup({ checkRateLimit: jest.fn(() => false) });
        h['host-join']({ quiz: validQuiz });

        expect(options.gameSessionService.createGame).not.toHaveBeenCalled();
        expect(socket.emits).toHaveLength(0);
    });

    it('ends and deletes an existing hosted game before creating the new one', () => {
        const existing = { pin: '999999', endQuestion: jest.fn() };
        const game = newGame();
        const { io, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(existing);
        options.gameSessionService.createGame.mockReturnValue(game);
        options.playerManagementService.createOrGetSession.mockReturnValue({ hostSessionId: 'hs', currentGamePin: null });

        h['host-join']({ quiz: validQuiz });

        expect(existing.endQuestion).toHaveBeenCalled();
        expect(findEmit(io.toEmits, 'game-ended')).toBeTruthy();
        expect(options.gameSessionService.deleteGame).toHaveBeenCalledWith('999999');
    });

    it('cancels a pending session grace timer for the returning host', () => {
        const game = newGame();
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        options.gameSessionService.createGame.mockReturnValue(game);
        options.playerManagementService.createOrGetSession.mockReturnValue({ hostSessionId: 'hs', currentGamePin: null });
        options.playerManagementService.sessionGraceTimers.set('hs', 4242);

        h['host-join']({ quiz: validQuiz });

        expect(options.playerManagementService.sessionGraceTimers.has('hs')).toBe(false);
    });

    it('emits an error and does not throw when createGame throws', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        options.gameSessionService.createGame.mockImplementation(() => { throw new Error('boom'); });

        h['host-join']({ quiz: validQuiz });

        const err = findEmit(socket.emits, 'error');
        expect(err.data.messageKey).toBe('error_failed_create_game');
        expect(options.logger.error).toHaveBeenCalled();
    });
});

describe('game-events: start-game', () => {
    it('starts the hosted game', () => {
        const game = { pin: '123456' };
        const { io, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['start-game']();

        expect(options.gameSessionService.startGame).toHaveBeenCalledWith(game, io);
    });

    it('does nothing when the host owns no game', () => {
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);

        h['start-game']();

        expect(options.gameSessionService.startGame).not.toHaveBeenCalled();
    });

    it('emits an error when startGame throws', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue({ pin: '1' });
        options.gameSessionService.startGame.mockImplementation(() => { throw new Error('x'); });

        h['start-game']();

        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('error_failed_start_game');
    });
});

describe('game-events: stop-quiz', () => {
    it('ends an active question then ends the game', () => {
        const game = {
            pin: '123456', gameState: 'question', hostId: 'host-sock', currentQuestion: 0,
            quiz: { questions: [validQuestion] },
            endQuestion: jest.fn(), getAnswerStatistics: jest.fn(() => ({})),
            earlyEndTimer: null, advanceTimer: null, leaderboardTimer: null
        };
        const { io, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['stop-quiz']();

        expect(game.endQuestion).toHaveBeenCalled();
        expect(findEmit(io.toEmits, 'question-timeout')).toBeTruthy();
        expect(options.questionFlowService.emitPlayerResults).toHaveBeenCalledWith(game, io);
        expect(options.gameSessionService.endGame).toHaveBeenCalledWith(game, io);
    });

    it('returns early when the game is already finished', () => {
        const game = { pin: '1', gameState: 'finished' };
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['stop-quiz']();

        expect(options.gameSessionService.endGame).not.toHaveBeenCalled();
    });

    it('does nothing when no game is hosted', () => {
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        h['stop-quiz']();
        expect(options.gameSessionService.endGame).not.toHaveBeenCalled();
    });
});

describe('game-events: host-leave-game', () => {
    it('disconnects players and deletes the game', () => {
        const game = { pin: '123456' };
        const { io, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['host-leave-game']();

        expect(options.playerManagementService.handleHostDisconnect).toHaveBeenCalledWith(game, io);
        expect(options.gameSessionService.deleteGame).toHaveBeenCalledWith('123456');
    });

    it('does nothing when no game is hosted', () => {
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        h['host-leave-game']();
        expect(options.playerManagementService.handleHostDisconnect).not.toHaveBeenCalled();
    });
});

describe('game-events: rematch-game', () => {
    it('resets a finished game and emits game-reset to the room', () => {
        const game = {
            pin: '123456', gameState: 'finished', reset: jest.fn(),
            players: new Map([['p1', { id: 'p1', name: 'Al' }]]),
            quiz: { title: 'My Quiz', questions: [validQuestion] }
        };
        const { io, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);

        h['rematch-game']();

        expect(game.reset).toHaveBeenCalled();
        const reset = findEmit(io.toEmits, 'game-reset');
        expect(reset.room).toBe('game-123456');
        expect(reset.data.players).toEqual([{ id: 'p1', name: 'Al' }]);
    });

    it('errors when no game is found', () => {
        const { socket, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        h['rematch-game']();
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('error_game_not_found');
    });

    it('errors when the game has not finished', () => {
        const game = { pin: '1', gameState: 'question', reset: jest.fn() };
        const { socket, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);
        h['rematch-game']();
        expect(findEmit(socket.emits, 'error').data.messageKey).toBe('error_can_only_rematch');
        expect(game.reset).not.toHaveBeenCalled();
    });
});

describe('game-events: host-starting-new-game', () => {
    it('transitions to pending-migration, notifies players, tokens the host, and leaves the room', () => {
        const game = { pin: '123456' };
        const { socket, options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(game);
        options.gameSessionService.setPendingMigration.mockReturnValue({ pin: '123456', migrationToken: 'mtok' });

        h['host-starting-new-game']();

        expect(options.gameSessionService.setPendingMigration).toHaveBeenCalled();
        const notify = findEmit(socket.toEmits, 'host-preparing-new-game');
        expect(notify.room).toBe('game-123456');
        const token = findEmit(socket.emits, 'migration-token');
        expect(token.data).toEqual({ pin: '123456', migrationToken: 'mtok' });
        expect(socket.leftRooms).toContain('game-123456');
    });

    it('does nothing when no game is hosted', () => {
        const { options, h } = setup();
        options.gameSessionService.findGameByHost.mockReturnValue(null);
        h['host-starting-new-game']();
        expect(options.gameSessionService.setPendingMigration).not.toHaveBeenCalled();
    });
});
