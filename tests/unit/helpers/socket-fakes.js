/**
 * Shared fakes for socket event-handler unit tests.
 *
 * These are plain-object fakes (no socket.io-mock dependency). Each handler
 * module registers listeners via socket.on(); the fake socket captures those
 * handlers into socket.handlers[event] so tests can invoke them directly and
 * assert on the resulting service calls and emits.
 *
 * Emit sinks:
 *   socket.emits            -> socket.emit(event, data)
 *   socket.broadcastEmits   -> socket.broadcast.emit(event, data)
 *   socket.toEmits          -> socket.to(room).emit(event, data)
 *   io.toEmits              -> io.to(room).emit(event, data)
 *   io.emits                -> io.emit(event, data)
 */

function createFakeSocket(id = 'socket-1') {
    const socket = {
        id,
        handlers: {},
        emits: [],
        broadcastEmits: [],
        toEmits: [],
        joinedRooms: [],
        leftRooms: [],
        on(event, handler) {
            this.handlers[event] = handler;
        },
        emit(event, data) {
            this.emits.push({ event, data });
        },
        join(room) {
            this.joinedRooms.push(room);
        },
        leave(room) {
            this.leftRooms.push(room);
        },
        broadcast: {
            emit(event, data) {
                socket.broadcastEmits.push({ event, data });
            }
        },
        to(room) {
            return {
                emit: (event, data) => socket.toEmits.push({ room, event, data })
            };
        }
    };
    return socket;
}

function createFakeIo() {
    const io = {
        toEmits: [],
        emits: [],
        to(room) {
            return {
                emit: (event, data) => io.toEmits.push({ room, event, data })
            };
        },
        emit(event, data) {
            io.emits.push({ event, data });
        },
        sockets: {
            adapter: { rooms: new Map() },
            sockets: new Map()
        }
    };
    return io;
}

function createFakeLogger() {
    return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

/**
 * Builds an options object with jest-mock services. Pass overrides to replace
 * any service or the individual jest.fn()s. checkRateLimit defaults to allow.
 */
function createOptions(overrides = {}) {
    const options = {
        gameSessionService: {
            findGameByHost: jest.fn(),
            getGame: jest.fn(),
            createGame: jest.fn(),
            deleteGame: jest.fn(),
            startGame: jest.fn(),
            endGame: jest.fn(),
            setPendingMigration: jest.fn(() => ({ pin: '123456', migrationToken: 'tok' })),
            clearMigrationTimer: jest.fn(),
            manualAdvanceToNextQuestion: jest.fn(),
            extendQuestionTimer: jest.fn(),
            clearHostDisconnectTimer: jest.fn(),
            setHostDisconnectTimer: jest.fn(),
            updateHostId: jest.fn(),
            cleanupOrphanedGames: jest.fn()
        },
        playerManagementService: {
            getPlayer: jest.fn(),
            createOrGetSession: jest.fn(),
            handlePlayerJoin: jest.fn(() => ({ success: true })),
            handlePlayerNameChange: jest.fn(() => ({ success: true })),
            handlePlayerRejoin: jest.fn(() => ({ success: true })),
            handlePlayerDisconnect: jest.fn(),
            handleHostDisconnect: jest.fn(),
            migratePlayersToGame: jest.fn(() => 0),
            getSessionByHostSocket: jest.fn(),
            unregisterDevice: jest.fn(),
            destroySession: jest.fn(),
            hostSessions: new Map(),
            sessionGraceTimers: new Map()
        },
        questionFlowService: {
            handleAnswerSubmission: jest.fn(),
            buildCorrectAnswerData: jest.fn(() => ({ correctAnswer: 0 })),
            emitPlayerResults: jest.fn(),
            endQuestionEarly: jest.fn()
        },
        consensusFlowService: {
            handleProposalSubmission: jest.fn(() => ({ success: true })),
            handleQuickResponse: jest.fn(() => ({ success: true })),
            handleChatMessage: jest.fn(() => ({ success: true })),
            lockConsensus: jest.fn(() => ({ success: true }))
        },
        checkRateLimit: jest.fn(() => true),
        logger: createFakeLogger(),
        CONFIG: {}
    };
    return { ...options, ...overrides };
}

module.exports = { createFakeSocket, createFakeIo, createFakeLogger, createOptions };
