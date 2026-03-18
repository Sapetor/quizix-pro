/**
 * Test Server Harness
 * Starts a minimal Quizix Pro server on a random port for stress testing.
 * Only wires up Socket.IO game logic — skips static files, AI routes, etc.
 */

const http = require('http');
const express = require('express');
const socketIo = require('socket.io');
const { GameSessionService } = require('../../services/game-session-service');
const { PlayerManagementService } = require('../../services/player-management-service');
const { QuestionFlowService } = require('../../services/question-flow-service');
const { ConsensusFlowService } = require('../../services/consensus-flow-service');
const { SocketBatchService } = require('../../services/socket-batch-service');
const { registerSocketHandlers } = require('../../socket');

const CONFIG = {
    TIMING: {
        DEFAULT_QUESTION_TIME: 20,
        LEADERBOARD_DISPLAY_TIME: 3000,
        GAME_START_DELAY: 3000,
        AUTO_ADVANCE_DELAY: 3000
    },
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 },
        DEFAULT_TOLERANCE: 0.1
    },
    LIMITS: {
        MAX_PLAYER_NAME_LENGTH: 20,
        MAX_FILE_SIZE: 5 * 1024 * 1024,
        PIN_LENGTH: 6
    },
    NETWORK: {
        PING_TIMEOUT: 120000,
        PING_INTERVAL: 25000,
        UPGRADE_TIMEOUT: 30000
    }
};

// Silent logger for tests (set TEST_LOG=1 to enable)
const logger = {
    error: (...args) => { if (process.env.TEST_LOG) console.error('[TEST]', ...args); },
    warn: (...args) => { if (process.env.TEST_LOG) console.warn('[TEST]', ...args); },
    info: (...args) => { if (process.env.TEST_LOG) console.log('[TEST]', ...args); },
    debug: (...args) => { if (process.env.TEST_LOG) console.log('[TEST]', ...args); }
};

/**
 * Create and start a test server on a random port.
 * @returns {Promise<{ port: number, io: SocketIO.Server, gameSessionService, playerManagementService, close: () => Promise<void> }>}
 */
async function createTestServer() {
    const app = express();
    app.use(express.json());

    const server = http.createServer(app);

    const io = socketIo(server, {
        cors: { origin: '*' },
        pingTimeout: CONFIG.NETWORK.PING_TIMEOUT,
        pingInterval: CONFIG.NETWORK.PING_INTERVAL,
        upgradeTimeout: CONFIG.NETWORK.UPGRADE_TIMEOUT,
        allowUpgrades: true
    });

    const gameSessionService = new GameSessionService(logger, CONFIG);
    const playerManagementService = new PlayerManagementService(logger, CONFIG);
    const questionFlowService = new QuestionFlowService(logger, gameSessionService);
    const consensusFlowService = new ConsensusFlowService(logger, gameSessionService);

    const socketBatchService = new SocketBatchService(io, logger, {
        batchInterval: 100,  // Faster flush for tests
        maxBatchSize: 50,
        enabled: true
    });

    gameSessionService.setSocketBatchService(socketBatchService);

    // No-op rate limiter — always allows
    const checkRateLimit = () => true;

    io.on('connection', (socket) => {
        registerSocketHandlers(io, socket, {
            gameSessionService,
            playerManagementService,
            questionFlowService,
            consensusFlowService,
            socketBatchService,
            checkRateLimit,
            logger,
            CONFIG
        });
    });

    // Start on random port
    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });

    const port = server.address().port;

    return {
        port,
        io,
        server,
        gameSessionService,
        playerManagementService,
        async close() {
            // Stop batch service
            if (socketBatchService.shutdown) socketBatchService.shutdown();

            // Disconnect all sockets
            const sockets = await io.fetchSockets();
            for (const s of sockets) s.disconnect(true);

            // Clear all game timers
            gameSessionService.getAllGames().forEach(game => {
                if (game.clearTimers) game.clearTimers();
            });

            // Close server
            await new Promise((resolve, reject) => {
                io.close(() => {
                    server.close((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            });
        }
    };
}

module.exports = { createTestServer, CONFIG };
