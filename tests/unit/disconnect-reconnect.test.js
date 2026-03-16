/**
 * Disconnect & Reconnect Logic Tests
 *
 * Covers handlePlayerRejoin, grace period timers, answerMapping migration,
 * race conditions, and multi-player disconnect scenarios.
 */

jest.mock('../../services/game', () => ({
    shuffleWithMapping: jest.fn((arr) => ({
        shuffled: [...arr].reverse(),
        mapping: arr.map((_, i) => arr.length - 1 - i)
    }))
}));

const { PlayerManagementService } = require('../../services/player-management-service');
const { shuffleWithMapping } = require('../../services/game');

// --- Shared mocks ---

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockConfig = { LIMITS: { MAX_PLAYER_NAME_LENGTH: 20 } };

function createMockSocket(id = 'new-socket') {
    return { id, join: jest.fn(), emit: jest.fn(), disconnect: jest.fn() };
}

function createMockIO() {
    return {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
        sockets: { sockets: new Map() }
    };
}

function createMockQFS() {
    return {
        buildCorrectAnswerData: jest.fn((q) => ({
            correctAnswer: q.correctAnswer,
            correctOption: q.options ? q.options[q.correctAnswer] : '',
            questionType: q.type || 'multiple-choice',
            tolerance: null,
            explanation: q.explanation || null,
            correctAnswers: q.correctAnswers
        }))
    };
}

function createGameWithQuiz(state = 'question', opts = {}) {
    return {
        pin: '123456',
        gameState: state,
        hostId: 'host-socket',
        currentQuestion: 0,
        questionStartTime: Date.now() - 5000,
        players: new Map(),
        removedPlayers: [],
        answerMappings: new Map(),
        leaderboard: [{ name: 'Alice', score: 100 }],
        quiz: {
            title: 'Test Quiz',
            randomizeAnswers: opts.randomizeAnswers || false,
            questions: [
                {
                    question: 'What is 1+1?',
                    type: 'multiple-choice',
                    options: ['1', '2', '3', '4'],
                    correctAnswer: 1,
                    timeLimit: 10,
                    explanation: 'Basic math',
                },
                {
                    question: 'What is 2+2?',
                    type: 'multiple-choice',
                    options: ['3', '4', '5', '6'],
                    correctAnswer: 1,
                    timeLimit: 10,
                }
            ]
        },
        addPlayer: jest.fn(function (id, name) {
            this.players.set(id, { id, name, score: 0, answers: [] });
            return { success: true };
        }),
        removePlayer: jest.fn(function (id) { this.players.delete(id); }),
        calculatePlayerConceptMastery: jest.fn(() => ({
            concepts: [{ name: 'Math', mastery: 50 }], hasConcepts: true
        })),
        endQuestion: jest.fn(),
        saveResults: jest.fn(),
        cleanup: jest.fn(),
    };
}

/** Add a disconnected player to the game's player map */
function addDisconnectedPlayer(game, socketId, overrides = {}) {
    const data = {
        id: socketId,
        name: 'Bob',
        sessionToken: 'token-bob',
        score: 150,
        answers: { 0: { answer: 1, isCorrect: true, points: 150, timeMs: 2000 } },
        disconnected: true,
        disconnectedAt: Date.now() - 1000,
        oldSocketId: socketId,
        ...overrides,
    };
    game.players.set(socketId, data);
    return data;
}

// =============================================================================

describe('Disconnect & Reconnect Logic', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        service = new PlayerManagementService(mockLogger, mockConfig);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // =========================================================================
    // handlePlayerRejoin — normal cases
    // =========================================================================
    describe('handlePlayerRejoin — normal cases', () => {
        test('restores player state (score, answers, name)', () => {
            const game = createGameWithQuiz();
            addDisconnectedPlayer(game, 'old-socket', { score: 250, name: 'RejoinerBob' });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            const result = service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(result.success).toBe(true);
            expect(result.playerName).toBe('RejoinerBob');
            const player = game.players.get('new-socket');
            expect(player.score).toBe(250);
            expect(player.name).toBe('RejoinerBob');
            expect(player.answers[0]).toBeDefined();
        });

        test('clears grace period timer on rejoin', () => {
            const game = createGameWithQuiz();
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            // Simulate an existing grace period timer
            const timerId = setTimeout(() => {}, 120000);
            service.disconnectTimers.set('token-bob', timerId);

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(service.disconnectTimers.has('token-bob')).toBe(false);
        });

        test('migrates player from old socket ID to new socket ID', () => {
            const game = createGameWithQuiz();
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(game.players.has('old-socket')).toBe(false);
            expect(game.players.has('new-socket')).toBe(true);
            expect(game.players.get('new-socket').id).toBe('new-socket');
        });

        test('updates global player registry with new socket ID', () => {
            const game = createGameWithQuiz();
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(service.getPlayer('new-socket')).toBeDefined();
            expect(service.getPlayer('new-socket').name).toBe('Bob');
        });

        test('new socket joins game room', () => {
            const game = createGameWithQuiz();
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(socket.join).toHaveBeenCalledWith('game-123456');
        });

        test('emits rejoin-success with correct game state', () => {
            const game = createGameWithQuiz();
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(socket.emit).toHaveBeenCalledWith('rejoin-success', expect.objectContaining({
                playerName: 'Bob',
                score: 150,
                currentQuestion: 0,
                gameStatus: 'question',
                sessionToken: 'token-bob',
                gamePin: '123456'
            }));
        });

        test('clears disconnected flag and oldSocketId', () => {
            const game = createGameWithQuiz();
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            const player = game.players.get('new-socket');
            expect(player.disconnected).toBe(false);
            expect(player.disconnectedAt).toBeNull();
            expect(player.oldSocketId).toBeUndefined();
        });

        test('broadcasts updated player list after rejoin', () => {
            const game = createGameWithQuiz();
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(io.to).toHaveBeenCalledWith('game-123456');
            expect(io.emit).toHaveBeenCalledWith('player-list-update', expect.objectContaining({
                players: expect.any(Array)
            }));
        });
    });

    // =========================================================================
    // handlePlayerRejoin — during question state
    // =========================================================================
    describe('handlePlayerRejoin — during question state', () => {
        test('sends question-start with remaining time', () => {
            const game = createGameWithQuiz('question');
            addDisconnectedPlayer(game, 'old-socket', { answers: {} });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(socket.emit).toHaveBeenCalledWith('question-start', expect.objectContaining({
                questionNumber: 1,
                totalQuestions: 2,
                question: 'What is 1+1?',
                type: 'multiple-choice',
                remainingTimeMs: expect.any(Number),
                options: expect.any(Array)
            }));
        });

        test('sets alreadyAnswered=true if player answered current question', () => {
            const game = createGameWithQuiz('question');
            addDisconnectedPlayer(game, 'old-socket', {
                answers: { 0: { answer: 1, isCorrect: true, points: 100, timeMs: 1000 } }
            });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            const questionStartCall = socket.emit.mock.calls.find(c => c[0] === 'question-start');
            expect(questionStartCall[1].alreadyAnswered).toBe(true);
        });

        test('sets alreadyAnswered=false if player hasn\'t answered', () => {
            const game = createGameWithQuiz('question');
            addDisconnectedPlayer(game, 'old-socket', { answers: {} });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            const questionStartCall = socket.emit.mock.calls.find(c => c[0] === 'question-start');
            expect(questionStartCall[1].alreadyAnswered).toBe(false);
        });
    });

    // =========================================================================
    // handlePlayerRejoin — during revealing state
    // =========================================================================
    describe('handlePlayerRejoin — during revealing state', () => {
        test('sends question-timeout and player-result', () => {
            const game = createGameWithQuiz('revealing');
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();
            const qfs = createMockQFS();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io, qfs);

            expect(socket.emit).toHaveBeenCalledWith('question-timeout', expect.any(Object));
            expect(socket.emit).toHaveBeenCalledWith('player-result', expect.any(Object));
        });

        test('sends isCorrect=false, points=0 if player missed question', () => {
            const game = createGameWithQuiz('revealing');
            addDisconnectedPlayer(game, 'old-socket', { answers: {} });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();
            const qfs = createMockQFS();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io, qfs);

            const resultCall = socket.emit.mock.calls.find(c => c[0] === 'player-result');
            expect(resultCall[1].isCorrect).toBe(false);
            expect(resultCall[1].points).toBe(0);
        });

        test('sends actual points if player answered before disconnecting', () => {
            const game = createGameWithQuiz('revealing');
            addDisconnectedPlayer(game, 'old-socket', {
                score: 200,
                answers: { 0: { answer: 1, isCorrect: true, points: 200, timeMs: 1500 } }
            });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();
            const qfs = createMockQFS();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io, qfs);

            const resultCall = socket.emit.mock.calls.find(c => c[0] === 'player-result');
            expect(resultCall[1].isCorrect).toBe(true);
            expect(resultCall[1].points).toBe(200);
            expect(resultCall[1].totalScore).toBe(200);
        });
    });

    // =========================================================================
    // handlePlayerRejoin — finished game
    // =========================================================================
    describe('handlePlayerRejoin — finished game', () => {
        test('sends game-end with finalLeaderboard and conceptMastery', () => {
            const game = createGameWithQuiz('finished');
            game.leaderboard = [{ name: 'Alice', score: 300 }, { name: 'Bob', score: 150 }];
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(socket.emit).toHaveBeenCalledWith('game-end', expect.objectContaining({
                finalLeaderboard: game.leaderboard,
                conceptMastery: expect.objectContaining({ hasConcepts: true })
            }));
        });

        test('calls calculatePlayerConceptMastery with new socket ID', () => {
            const game = createGameWithQuiz('finished');
            game.leaderboard = [];
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(game.calculatePlayerConceptMastery).toHaveBeenCalledWith('new-socket');
        });
    });

    // =========================================================================
    // handlePlayerRejoin — race condition
    // =========================================================================
    describe('handlePlayerRejoin — race condition (client reconnects before server detects disconnect)', () => {
        test('finds player by sessionToken even though disconnected=false', () => {
            const game = createGameWithQuiz('question');
            // Player is still "connected" (disconnected=false) — server hasn't detected drop yet
            game.players.set('old-socket', {
                id: 'old-socket', name: 'Bob', sessionToken: 'token-bob',
                score: 100, answers: {}, disconnected: false,
            });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            const result = service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(result.success).toBe(true);
            expect(game.players.has('new-socket')).toBe(true);
            expect(game.players.has('old-socket')).toBe(false);
        });

        test('force-disconnects the stale socket', () => {
            const game = createGameWithQuiz('question');
            game.players.set('old-socket', {
                id: 'old-socket', name: 'Bob', sessionToken: 'token-bob',
                score: 100, answers: {}, disconnected: false,
            });
            const oldSocket = createMockSocket('old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();
            io.sockets.sockets.set('old-socket', oldSocket);

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(oldSocket.disconnect).toHaveBeenCalledWith(true);
        });

        test('deletes old socket from global registry before force-disconnect', () => {
            const game = createGameWithQuiz('question');
            game.players.set('old-socket', {
                id: 'old-socket', name: 'Bob', sessionToken: 'token-bob',
                score: 100, answers: {}, disconnected: false,
            });
            service.players.set('old-socket', { gamePin: '123456', name: 'Bob' });

            const oldSocket = createMockSocket('old-socket');
            // Track when disconnect is called, verify registry was already cleared
            oldSocket.disconnect = jest.fn(() => {
                // At the time of disconnect, old socket should NOT be in the global registry
                expect(service.players.has('old-socket')).toBe(false);
            });

            const socket = createMockSocket('new-socket');
            const io = createMockIO();
            io.sockets.sockets.set('old-socket', oldSocket);

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(oldSocket.disconnect).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // handlePlayerRejoin — error cases
    // =========================================================================
    describe('handlePlayerRejoin — error cases', () => {
        test('fails with missing session token', () => {
            const game = createGameWithQuiz();
            const socket = createMockSocket();
            const io = createMockIO();

            const result = service.handlePlayerRejoin('new-socket', '123456', null, game, socket, io);

            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        test('fails with missing PIN', () => {
            const game = createGameWithQuiz();
            const socket = createMockSocket();
            const io = createMockIO();

            const result = service.handlePlayerRejoin('new-socket', null, 'token-bob', game, socket, io);

            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        test('fails when game not found', () => {
            const socket = createMockSocket();
            const io = createMockIO();

            const result = service.handlePlayerRejoin('new-socket', '123456', 'token-bob', null, socket, io);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Game not found');
        });

        test('fails when session token doesn\'t match any player', () => {
            const game = createGameWithQuiz();
            addDisconnectedPlayer(game, 'old-socket', { sessionToken: 'different-token' });
            const socket = createMockSocket();
            const io = createMockIO();

            const result = service.handlePlayerRejoin('new-socket', '123456', 'no-match', game, socket, io);

            expect(result.success).toBe(false);
            expect(result.error).toContain('expired');
        });
    });

    // =========================================================================
    // answerMapping migration
    // =========================================================================
    describe('answerMapping migration', () => {
        test('migrates mappings from old to new socket ID', () => {
            const game = createGameWithQuiz('question', { randomizeAnswers: true });
            const mapping = [2, 0, 3, 1];
            game.answerMappings.set('old-socket', mapping);
            addDisconnectedPlayer(game, 'old-socket');
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(game.answerMappings.has('old-socket')).toBe(false);
            expect(game.answerMappings.get('new-socket')).toEqual(mapping);
        });

        test('reconstructs shuffled options from migrated mapping', () => {
            const game = createGameWithQuiz('question', { randomizeAnswers: true });
            // mapping[shuffledIdx] = originalIdx: [2, 0, 3, 1]
            // So shuffled[0] = options[2] = '3', shuffled[1] = options[0] = '1', etc.
            const mapping = [2, 0, 3, 1];
            game.answerMappings.set('old-socket', mapping);
            addDisconnectedPlayer(game, 'old-socket', { answers: {} });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            const qsCall = socket.emit.mock.calls.find(c => c[0] === 'question-start');
            // Options reconstructed: mapping.map(idx => originalOptions[idx])
            expect(qsCall[1].options).toEqual(['3', '1', '4', '2']);
        });

        test('creates fresh shuffle when no mapping exists', () => {
            const game = createGameWithQuiz('question', { randomizeAnswers: true });
            // No mapping for old-socket in answerMappings
            addDisconnectedPlayer(game, 'old-socket', { answers: {} });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(shuffleWithMapping).toHaveBeenCalled();
            expect(game.answerMappings.has('new-socket')).toBe(true);
        });

        test('no mapping created when randomizeAnswers=false', () => {
            const game = createGameWithQuiz('question'); // randomizeAnswers defaults to false
            addDisconnectedPlayer(game, 'old-socket', { answers: {} });
            const socket = createMockSocket('new-socket');
            const io = createMockIO();

            service.handlePlayerRejoin('new-socket', '123456', 'token-bob', game, socket, io);

            expect(shuffleWithMapping).not.toHaveBeenCalled();
            // Options sent are the original unshuffled options
            const qsCall = socket.emit.mock.calls.find(c => c[0] === 'question-start');
            expect(qsCall[1].options).toEqual(['1', '2', '3', '4']);
        });
    });

    // =========================================================================
    // Grace period timer
    // =========================================================================
    describe('Grace period timer', () => {
        test('timer set on non-intentional disconnect during active game', () => {
            const game = createGameWithQuiz('question');
            const socket = createMockSocket('player-1');
            const io = createMockIO();

            // Join player first (to populate global registry & game.players with sessionToken)
            service.handlePlayerJoin(socket.id, '123456', 'Bob', game, socket, io);
            // Ensure player has sessionToken set by handlePlayerJoin
            const player = game.players.get('player-1');
            expect(player.sessionToken).toBeDefined();

            // Non-intentional disconnect
            service.handlePlayerDisconnect('player-1', game, io, false);

            expect(service.disconnectTimers.has(player.sessionToken)).toBe(true);
            expect(player.disconnected).toBe(true);
        });

        test('timer NOT set on intentional disconnect', () => {
            const game = createGameWithQuiz('question');
            const socket = createMockSocket('player-1');
            const io = createMockIO();

            service.handlePlayerJoin(socket.id, '123456', 'Bob', game, socket, io);

            service.handlePlayerDisconnect('player-1', game, io, true);

            // Intentional disconnect removes player immediately, no timer
            expect(service.disconnectTimers.size).toBe(0);
            expect(game.removePlayer).toHaveBeenCalledWith('player-1');
        });

        test('timer NOT set on lobby disconnect', () => {
            const game = createGameWithQuiz('lobby');
            const socket = createMockSocket('player-1');
            const io = createMockIO();

            service.handlePlayerJoin(socket.id, '123456', 'Bob', game, socket, io);

            service.handlePlayerDisconnect('player-1', game, io, false);

            // Lobby disconnects remove player immediately
            expect(service.disconnectTimers.size).toBe(0);
            expect(game.removePlayer).toHaveBeenCalledWith('player-1');
        });

        test('_finalizePlayerRemoval called after 2 minutes', () => {
            const game = createGameWithQuiz('question');
            const socket = createMockSocket('player-1');
            const io = createMockIO();

            service.handlePlayerJoin(socket.id, '123456', 'Bob', game, socket, io);
            const sessionToken = game.players.get('player-1').sessionToken;

            service.handlePlayerDisconnect('player-1', game, io, false);

            // Player still in game before timer fires
            expect(game.players.has('player-1')).toBe(true);

            // Advance 2 minutes
            jest.advanceTimersByTime(2 * 60 * 1000);

            // After timer fires, player should be removed
            expect(game.removePlayer).toHaveBeenCalledWith('player-1');
            expect(service.disconnectTimers.has(sessionToken)).toBe(false);
        });

        test('_finalizePlayerRemoval skips if game is finished', () => {
            const game = createGameWithQuiz('question');
            const socket = createMockSocket('player-1');
            const io = createMockIO();

            service.handlePlayerJoin(socket.id, '123456', 'Bob', game, socket, io);

            service.handlePlayerDisconnect('player-1', game, io, false);

            // Game finishes before timer
            game.gameState = 'finished';

            jest.advanceTimersByTime(2 * 60 * 1000);

            // removePlayer should NOT be called (beyond the initial call check)
            expect(game.removePlayer).not.toHaveBeenCalled();
        });

        test('_finalizePlayerRemoval skips if game is ended', () => {
            const game = createGameWithQuiz('question');
            const socket = createMockSocket('player-1');
            const io = createMockIO();

            service.handlePlayerJoin(socket.id, '123456', 'Bob', game, socket, io);

            service.handlePlayerDisconnect('player-1', game, io, false);

            game.gameState = 'ended';

            jest.advanceTimersByTime(2 * 60 * 1000);

            expect(game.removePlayer).not.toHaveBeenCalled();
        });

        test('_finalizePlayerRemoval removes player and broadcasts update', () => {
            const game = createGameWithQuiz('question');
            const socket = createMockSocket('player-1');
            const io = createMockIO();

            service.handlePlayerJoin(socket.id, '123456', 'Bob', game, socket, io);

            service.handlePlayerDisconnect('player-1', game, io, false);

            // Clear mocks so we only see calls from _finalizePlayerRemoval
            io.to.mockClear();
            io.emit.mockClear();

            jest.advanceTimersByTime(2 * 60 * 1000);

            expect(game.removePlayer).toHaveBeenCalledWith('player-1');
            expect(io.to).toHaveBeenCalledWith('game-123456');
            expect(io.emit).toHaveBeenCalledWith('player-list-update', expect.any(Object));
        });

        test('timer cleared on rejoin', () => {
            const game = createGameWithQuiz('question');
            const socket = createMockSocket('player-1');
            const io = createMockIO();

            service.handlePlayerJoin(socket.id, '123456', 'Bob', game, socket, io);
            const sessionToken = game.players.get('player-1').sessionToken;

            service.handlePlayerDisconnect('player-1', game, io, false);
            expect(service.disconnectTimers.has(sessionToken)).toBe(true);

            // Rejoin
            const newSocket = createMockSocket('player-1-new');
            service.handlePlayerRejoin('player-1-new', '123456', sessionToken, game, newSocket, io);

            expect(service.disconnectTimers.has(sessionToken)).toBe(false);

            // Advance timer — _finalizePlayerRemoval should NOT fire
            jest.advanceTimersByTime(2 * 60 * 1000);
            expect(game.removePlayer).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // Multiple player disconnects
    // =========================================================================
    describe('Multiple player disconnects', () => {
        test('3 players disconnect simultaneously, each gets own timer', () => {
            const game = createGameWithQuiz('question');
            const io = createMockIO();
            const tokens = [];

            for (let i = 1; i <= 3; i++) {
                const socket = createMockSocket(`p${i}`);
                service.handlePlayerJoin(socket.id, '123456', `Player${i}`, game, socket, io);
                tokens.push(game.players.get(`p${i}`).sessionToken);
            }

            // All 3 disconnect
            for (let i = 1; i <= 3; i++) {
                service.handlePlayerDisconnect(`p${i}`, game, io, false);
            }

            expect(service.disconnectTimers.size).toBe(3);
            tokens.forEach(token => {
                expect(service.disconnectTimers.has(token)).toBe(true);
            });
        });

        test('2 of 3 reconnect while 1 stays disconnected — independent tracking', () => {
            const game = createGameWithQuiz('question');
            const io = createMockIO();
            const tokens = [];

            for (let i = 1; i <= 3; i++) {
                const socket = createMockSocket(`p${i}`);
                service.handlePlayerJoin(socket.id, '123456', `Player${i}`, game, socket, io);
                tokens.push(game.players.get(`p${i}`).sessionToken);
            }

            // All 3 disconnect
            for (let i = 1; i <= 3; i++) {
                service.handlePlayerDisconnect(`p${i}`, game, io, false);
            }

            // Players 1 and 2 reconnect
            const newSocket1 = createMockSocket('p1-new');
            const newSocket2 = createMockSocket('p2-new');
            service.handlePlayerRejoin('p1-new', '123456', tokens[0], game, newSocket1, io);
            service.handlePlayerRejoin('p2-new', '123456', tokens[1], game, newSocket2, io);

            // Only player 3's timer remains
            expect(service.disconnectTimers.size).toBe(1);
            expect(service.disconnectTimers.has(tokens[2])).toBe(true);

            // Players 1 and 2 are back, player 3 still disconnected
            expect(game.players.get('p1-new').disconnected).toBe(false);
            expect(game.players.get('p2-new').disconnected).toBe(false);
            expect(game.players.get('p3').disconnected).toBe(true);

            // After 2 minutes, only player 3 gets removed
            jest.advanceTimersByTime(2 * 60 * 1000);
            expect(game.removePlayer).toHaveBeenCalledWith('p3');
            expect(game.removePlayer).toHaveBeenCalledTimes(1);
        });
    });

    // =========================================================================
    // Answer count updates on disconnect
    // =========================================================================
    describe('Answer count updates on disconnect', () => {
        test('host receives correct connectedPlayers vs totalPlayers', () => {
            const game = createGameWithQuiz('question');
            const io = createMockIO();

            // Add 3 players
            for (let i = 1; i <= 3; i++) {
                const socket = createMockSocket(`p${i}`);
                service.handlePlayerJoin(socket.id, '123456', `Player${i}`, game, socket, io);
            }

            // Player 1 disconnects
            service.handlePlayerDisconnect('p1', game, io, false);

            // Find the answer-count-update emission after disconnect
            const answerCountCalls = io.emit.mock.calls.filter(c => c[0] === 'answer-count-update');
            const lastCall = answerCountCalls[answerCountCalls.length - 1];

            expect(lastCall).toBeDefined();
            expect(lastCall[1].connectedPlayers).toBe(2); // excludes disconnected
            expect(lastCall[1].totalPlayers).toBe(3);     // includes all
        });
    });
});
