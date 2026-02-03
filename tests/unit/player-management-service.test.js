/**
 * Player Management Service Tests
 */

const { PlayerManagementService } = require('../../services/player-management-service');

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

const mockConfig = {
    LIMITS: {
        MAX_PLAYER_NAME_LENGTH: 20
    }
};

// Mock socket
const createMockSocket = (id = 'socket-123') => ({
    id,
    join: jest.fn(),
    emit: jest.fn()
});

// Mock IO
const createMockIO = () => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
});

// Mock game
const createMockGame = (state = 'lobby') => ({
    pin: '123456',
    gameState: state,
    hostId: 'host-socket',
    currentQuestion: 0,
    players: new Map(),
    addPlayer: jest.fn(function(id, name) {
        this.players.set(id, { id, name, score: 0, answers: {} });
        return { success: true, player: { id, name, score: 0, answers: {} } };
    }),
    removePlayer: jest.fn(function(id) {
        this.players.delete(id);
    }),
    endQuestion: jest.fn(),
    saveResults: jest.fn(),
    cleanup: jest.fn()
});

describe('PlayerManagementService', () => {
    let playerService;

    beforeEach(() => {
        jest.clearAllMocks();
        playerService = new PlayerManagementService(mockLogger, mockConfig);
    });

    describe('handlePlayerJoin', () => {
        test('should allow valid player to join', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            const result = playerService.handlePlayerJoin(
                socket.id, '123456', 'Player1', game, socket, io
            );

            expect(result.success).toBe(true);
            expect(result.playerCount).toBe(1);
            expect(socket.join).toHaveBeenCalledWith('game-123456');
            expect(socket.emit).toHaveBeenCalledWith('player-joined', expect.any(Object));
        });

        test('should reject missing PIN', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            const result = playerService.handlePlayerJoin(
                socket.id, null, 'Player1', game, socket, io
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        test('should reject missing name', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            const result = playerService.handlePlayerJoin(
                socket.id, '123456', '', game, socket, io
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        test('should reject name exceeding max length', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();
            const longName = 'a'.repeat(21);

            const result = playerService.handlePlayerJoin(
                socket.id, '123456', longName, game, socket, io
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('characters');
        });

        test('should reject name with invalid characters', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            // Use a short name with invalid chars (< >) to test validation
            const result = playerService.handlePlayerJoin(
                socket.id, '123456', '<hacker>', game, socket, io
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('invalid characters');
        });

        test('should accept names with unicode characters', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            const result = playerService.handlePlayerJoin(
                socket.id, '123456', '日本語プレイヤー', game, socket, io
            );

            expect(result.success).toBe(true);
        });

        test('should reject if game not found', () => {
            const socket = createMockSocket();
            const io = createMockIO();

            const result = playerService.handlePlayerJoin(
                socket.id, '123456', 'Player1', null, socket, io
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Game not found');
        });

        test('should reject if game already started', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame('question');

            const result = playerService.handlePlayerJoin(
                socket.id, '123456', 'Player1', game, socket, io
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Game already started');
        });

        test('should broadcast player list update', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            playerService.handlePlayerJoin(
                socket.id, '123456', 'Player1', game, socket, io
            );

            expect(io.to).toHaveBeenCalledWith('game-123456');
            expect(io.emit).toHaveBeenCalledWith('player-list-update', expect.any(Object));
        });
    });

    describe('handlePlayerDisconnect', () => {
        test('should remove player from game and registry', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            // First join
            playerService.handlePlayerJoin(socket.id, '123456', 'Player1', game, socket, io);

            // Then disconnect
            playerService.handlePlayerDisconnect(socket.id, game, io);

            expect(game.removePlayer).toHaveBeenCalledWith(socket.id);
            expect(playerService.getPlayer(socket.id)).toBeUndefined();
        });

        test('should broadcast player-disconnected event', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            playerService.handlePlayerJoin(socket.id, '123456', 'Player1', game, socket, io);
            playerService.handlePlayerDisconnect(socket.id, game, io);

            expect(io.emit).toHaveBeenCalledWith('player-disconnected', expect.any(Object));
        });

        test('should update answer count if game in question state', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            // Start in lobby to allow join
            const game = createMockGame('lobby');

            playerService.handlePlayerJoin(socket.id, '123456', 'Player1', game, socket, io);

            // Switch to question state after join
            game.gameState = 'question';

            playerService.handlePlayerDisconnect(socket.id, game, io);

            // Should emit to host for answer count update
            expect(io.to).toHaveBeenCalledWith('host-socket');
        });
    });

    describe('handleHostDisconnect', () => {
        test('should end game and notify players', () => {
            const io = createMockIO();
            const game = createMockGame('question');
            game.endTime = null;

            playerService.handleHostDisconnect(game, io);

            expect(game.endQuestion).toHaveBeenCalled();
            expect(game.cleanup).toHaveBeenCalled();
            expect(io.emit).toHaveBeenCalledWith('game-ended', expect.objectContaining({
                reason: 'Host disconnected'
            }));
        });

        test('should save results if game was in progress', () => {
            const io = createMockIO();
            const game = createMockGame('question');

            playerService.handleHostDisconnect(game, io);

            expect(game.saveResults).toHaveBeenCalled();
        });
    });

    describe('handlePlayerNameChange', () => {
        test('should allow valid name change in lobby', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            playerService.handlePlayerJoin(socket.id, '123456', 'OldName', game, socket, io);

            const result = playerService.handlePlayerNameChange(
                socket.id, 'NewName', game, socket, io
            );

            expect(result.success).toBe(true);
            expect(result.oldName).toBe('OldName');
            expect(result.newName).toBe('NewName');
        });

        test('should reject empty name', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            playerService.handlePlayerJoin(socket.id, '123456', 'Player1', game, socket, io);

            const result = playerService.handlePlayerNameChange(
                socket.id, '', game, socket, io
            );

            expect(result.success).toBe(false);
        });

        test('should reject name change after game started', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame('question');

            // Manually set player data since join won't work with started game
            playerService.players.set(socket.id, { gamePin: '123456', name: 'Player1' });
            game.players.set(socket.id, { id: socket.id, name: 'Player1' });

            const result = playerService.handlePlayerNameChange(
                socket.id, 'NewName', game, socket, io
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('started');
        });

        test('should reject duplicate names', () => {
            const socket1 = createMockSocket('socket-1');
            const socket2 = createMockSocket('socket-2');
            const io = createMockIO();
            const game = createMockGame();

            playerService.handlePlayerJoin(socket1.id, '123456', 'Player1', game, socket1, io);
            playerService.handlePlayerJoin(socket2.id, '123456', 'Player2', game, socket2, io);

            const result = playerService.handlePlayerNameChange(
                socket2.id, 'Player1', game, socket2, io
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('already taken');
        });

        test('should return success for same name', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            playerService.handlePlayerJoin(socket.id, '123456', 'Player1', game, socket, io);

            const result = playerService.handlePlayerNameChange(
                socket.id, 'Player1', game, socket, io
            );

            expect(result.success).toBe(true);
        });
    });

    describe('getPlayer', () => {
        test('should return player data for existing player', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            playerService.handlePlayerJoin(socket.id, '123456', 'Player1', game, socket, io);

            const player = playerService.getPlayer(socket.id);

            expect(player).toBeDefined();
            expect(player.name).toBe('Player1');
            expect(player.gamePin).toBe('123456');
        });

        test('should return undefined for non-existent player', () => {
            expect(playerService.getPlayer('non-existent')).toBeUndefined();
        });
    });

    describe('getAllPlayers', () => {
        test('should return all registered players', () => {
            const socket1 = createMockSocket('socket-1');
            const socket2 = createMockSocket('socket-2');
            const io = createMockIO();
            const game = createMockGame();

            playerService.handlePlayerJoin(socket1.id, '123456', 'Player1', game, socket1, io);
            playerService.handlePlayerJoin(socket2.id, '123456', 'Player2', game, socket2, io);

            const players = playerService.getAllPlayers();

            expect(players.size).toBe(2);
        });
    });

    describe('removePlayer', () => {
        test('should remove player from registry', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            playerService.handlePlayerJoin(socket.id, '123456', 'Player1', game, socket, io);
            playerService.removePlayer(socket.id);

            expect(playerService.getPlayer(socket.id)).toBeUndefined();
        });
    });

    describe('getPlayerCount', () => {
        test('should return correct player count', () => {
            const game = createMockGame();
            game.players.set('p1', { name: 'Player1' });
            game.players.set('p2', { name: 'Player2' });

            expect(playerService.getPlayerCount(game)).toBe(2);
        });
    });

    describe('getPlayerList', () => {
        test('should return formatted player list', () => {
            const game = createMockGame();
            game.players.set('p1', { id: 'p1', name: 'Player1', score: 100 });
            game.players.set('p2', { id: 'p2', name: 'Player2', score: 200 });

            const list = playerService.getPlayerList(game);

            expect(list).toHaveLength(2);
            expect(list[0]).toEqual({ id: 'p1', name: 'Player1', score: 100 });
        });
    });
});
