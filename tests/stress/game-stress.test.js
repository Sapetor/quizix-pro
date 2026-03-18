/**
 * Game Server Stress Tests
 *
 * Integration tests exercising the full Socket.IO game flow with many
 * concurrent players. Each scenario spins up a real test server, connects
 * real socket.io-client instances, and asserts against the actual events
 * emitted by the production socket handlers.
 *
 * Run with (from project root):
 *   node_modules/.bin/jest --testMatch '<rootDir>/tests/stress/*.test.js' --testTimeout 120000 --forceExit
 */

const { createTestServer } = require('../helpers/test-server');
const { io: ioClient } = require('socket.io-client');

// ---------------------------------------------------------------------------
// Test Quiz — inline, no file I/O
// ---------------------------------------------------------------------------

const TEST_QUIZ = {
    title: 'Stress Test Quiz',
    randomizeAnswers: false,
    powerUpsEnabled: true,
    questions: [
        {
            question: 'What is 2+2?',
            type: 'multiple-choice',
            options: ['3', '4', '5', '6'],
            correctAnswer: 1,
            timeLimit: 30
        },
        {
            question: 'The sky is blue.',
            type: 'true-false',
            options: ['True', 'False'],
            correctAnswer: true,
            timeLimit: 30
        },
        {
            question: 'Select primes:',
            type: 'multiple-correct',
            options: ['2', '4', '7', '9'],
            correctIndices: [0, 2],
            correctAnswers: [0, 2],
            timeLimit: 30
        },
        {
            question: 'Value of pi?',
            type: 'numeric',
            correctAnswer: 3.14,
            tolerance: 0.01,
            timeLimit: 30
        },
        {
            question: 'Order smallest to largest:',
            type: 'ordering',
            options: ['Hundred', 'One', 'Ten', 'Thousand'],
            correctOrder: [1, 2, 0, 3],
            timeLimit: 30
        }
    ]
};

// Correct answers keyed by question index
const CORRECT_ANSWERS = [
    { answer: 1, type: 'multiple-choice' },
    { answer: true, type: 'true-false' },
    { answer: [0, 2], type: 'multiple-correct' },
    { answer: 3.14, type: 'numeric' },
    { answer: [1, 2, 0, 3], type: 'ordering' }
];

const WRONG_ANSWERS = [
    { answer: 0, type: 'multiple-choice' },
    { answer: false, type: 'true-false' },
    { answer: [1, 3], type: 'multiple-correct' },
    { answer: 99, type: 'numeric' },
    { answer: [0, 1, 2, 3], type: 'ordering' }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a socket event, rejecting on timeout.
 * @param {Socket} socket - socket.io-client instance
 * @param {string} eventName - event to listen for
 * @param {number} timeout - ms before rejection (default 15 s)
 * @returns {Promise<*>} event payload
 */
function waitForEvent(socket, eventName, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, handler);
            reject(new Error(`Timeout waiting for "${eventName}" after ${timeout}ms`));
        }, timeout);

        function handler(data) {
            clearTimeout(timer);
            resolve(data);
        }

        socket.once(eventName, handler);
    });
}

/**
 * Create N connected player sockets.
 * Resolves once every socket's `connect` event has fired.
 * @param {number} port - server port
 * @param {number} count - number of sockets
 * @returns {Promise<Socket[]>}
 */
function createPlayers(port, count) {
    const sockets = [];
    const connectPromises = [];

    for (let i = 0; i < count; i++) {
        const socket = ioClient(`http://127.0.0.1:${port}`, {
            forceNew: true,
            transports: ['websocket']
        });
        sockets.push(socket);
        connectPromises.push(
            new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(`Socket ${i} failed to connect within 10s`));
                }, 10000);
                socket.once('connect', () => {
                    clearTimeout(timer);
                    resolve();
                });
                socket.once('connect_error', (err) => {
                    clearTimeout(timer);
                    reject(err);
                });
            })
        );
    }

    return Promise.all(connectPromises).then(() => sockets);
}

/**
 * Disconnect an array of sockets and wait briefly for cleanup.
 * Safe to call with already-disconnected sockets.
 * @param {Socket[]} sockets
 */
async function disconnectAll(sockets) {
    for (const s of sockets) {
        if (s && s.connected) {
            s.disconnect();
        }
    }
    // Brief pause so the server processes disconnect events
    await new Promise((r) => setTimeout(r, 200));
}

/**
 * Create a host socket, emit host-join, and return { hostSocket, pin, gameId }.
 */
async function createHostAndGame(port, quiz = TEST_QUIZ) {
    const [hostSocket] = await createPlayers(port, 1);
    hostSocket.emit('host-join', { quiz });
    const gameCreated = await waitForEvent(hostSocket, 'game-created');
    return { hostSocket, pin: gameCreated.pin, gameId: gameCreated.gameId };
}

/**
 * Join players to a game and collect their sessionTokens.
 * @returns {{ sockets: Socket[], tokens: string[] }}
 */
async function joinPlayers(port, pin, count, namePrefix = 'Player') {
    const sockets = await createPlayers(port, count);
    const tokens = [];

    const joinPromises = sockets.map((socket, i) => {
        const joinedPromise = waitForEvent(socket, 'player-joined');
        socket.emit('player-join', { pin, name: `${namePrefix}-${i}` });
        return joinedPromise;
    });

    const results = await Promise.all(joinPromises);
    for (const r of results) {
        tokens.push(r.sessionToken);
    }

    return { sockets, tokens };
}

/**
 * Wait for game-started on the host, then wait for the first question-start
 * on a reference socket (accounts for the GAME_START_DELAY).
 * @param {Socket} hostSocket
 * @param {Socket} refSocket - any player socket to wait on for question-start
 */
async function startGameAndWaitForQ1(hostSocket, refSocket) {
    const gameStartedPromise = waitForEvent(hostSocket, 'game-started');
    hostSocket.emit('start-game');
    await gameStartedPromise;
    // Wait for the first question-start (after GAME_START_DELAY)
    await waitForEvent(refSocket, 'question-start');
}

/**
 * Have all player sockets submit an answer and wait for every player-result.
 * @param {Socket[]} playerSockets
 * @param {{ answer: *, type: string }} answerData
 */
async function allPlayersAnswer(playerSockets, answerData) {
    const resultPromises = playerSockets.map((s) => waitForEvent(s, 'player-result'));
    for (const s of playerSockets) {
        s.emit('submit-answer', answerData);
    }
    return Promise.all(resultPromises);
}

/**
 * Play through a full question cycle: wait for question-start on a reference
 * socket, have all player sockets answer, wait for all player-result events.
 * Returns the array of player-result payloads.
 * @param {Socket} refSocket - socket to wait for question-start on
 * @param {Socket[]} playerSockets - all sockets that will answer
 * @param {{ answer: *, type: string }} answerData
 */
async function playQuestion(refSocket, playerSockets, answerData) {
    await waitForEvent(refSocket, 'question-start');
    return allPlayersAnswer(playerSockets, answerData);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Socket Stress Tests', () => {
    let testServer;
    let port;

    beforeAll(async () => {
        testServer = await createTestServer();
        port = testServer.port;
    });

    afterAll(async () => {
        if (testServer) {
            // Stop periodic cleanup interval that prevents Jest from exiting
            if (testServer.gameSessionService.stopPeriodicCleanup) {
                testServer.gameSessionService.stopPeriodicCleanup();
            }
            try {
                await testServer.close();
            } catch {
                // Ignore "Server is not running" — happens when io.close()
                // already shut down the HTTP server before server.close() runs.
            }
        }
    });

    // -----------------------------------------------------------------------
    // 1. Full game with 50 players, all answering correctly
    // -----------------------------------------------------------------------
    it('should handle a full game with 50 players, all answering correctly', async () => {
        const PLAYER_COUNT = 50;
        let hostSocket;
        let playerSockets = [];

        try {
            // Create game
            const host = await createHostAndGame(port);
            hostSocket = host.hostSocket;
            const { pin } = host;

            // Join 50 players
            const joined = await joinPlayers(port, pin, PLAYER_COUNT);
            playerSockets = joined.sockets;

            // Start game and wait for Q1
            await startGameAndWaitForQ1(hostSocket, playerSockets[0]);

            // Track results per question
            const allResults = [];

            // Answer Q1 (MC) — all correct
            const q1Results = await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[0]);
            allResults.push(q1Results);
            expect(q1Results).toHaveLength(PLAYER_COUNT);

            // Questions 2-5: wait for question-start then answer
            for (let q = 1; q < 5; q++) {
                const results = await playQuestion(
                    playerSockets[0],
                    playerSockets,
                    CORRECT_ANSWERS[q]
                );
                allResults.push(results);
                expect(results).toHaveLength(PLAYER_COUNT);
            }

            // Wait for game-end on host
            const gameEnd = await waitForEvent(hostSocket, 'game-end', 30000);

            // Assertions
            expect(gameEnd.finalLeaderboard).toBeDefined();
            expect(gameEnd.finalLeaderboard.length).toBe(PLAYER_COUNT);

            // All players answered every question, all got results
            expect(allResults).toHaveLength(5);
            for (const qResults of allResults) {
                expect(qResults).toHaveLength(PLAYER_COUNT);
            }

            // All Q1 results should be correct (MC)
            for (const r of allResults[0]) {
                expect(r.isCorrect).toBe(true);
            }

            // All final scores should be equal (everyone answered correctly every time)
            const scores = gameEnd.finalLeaderboard.map((p) => p.score);
            // Scores may differ very slightly due to timing, but all should be > 0
            for (const s of scores) {
                expect(s).toBeGreaterThan(0);
            }
            // With near-simultaneous answers, scores should be very close
            const maxScore = Math.max(...scores);
            const minScore = Math.min(...scores);
            // Allow up to 20% variance from timing differences
            expect(minScore).toBeGreaterThan(maxScore * 0.8);
        } finally {
            await disconnectAll([hostSocket, ...playerSockets]);
        }
    }, 120000);

    // -----------------------------------------------------------------------
    // 2. Mixed correct/incorrect answers
    // -----------------------------------------------------------------------
    it('should score correctly with mixed correct/incorrect answers', async () => {
        const PLAYER_COUNT = 20;
        const CORRECT_GROUP_SIZE = 10;
        let hostSocket;
        let playerSockets = [];

        try {
            const host = await createHostAndGame(port);
            hostSocket = host.hostSocket;

            const joined = await joinPlayers(port, host.pin, PLAYER_COUNT);
            playerSockets = joined.sockets;

            const correctGroup = playerSockets.slice(0, CORRECT_GROUP_SIZE);
            const incorrectGroup = playerSockets.slice(CORRECT_GROUP_SIZE);

            // Start game
            await startGameAndWaitForQ1(hostSocket, playerSockets[0]);

            // Track per-question results for both groups
            const correctGroupResults = [];
            const incorrectGroupResults = [];

            // Q1 — submit answers for both groups simultaneously
            const q1CorrectPromises = correctGroup.map((s) => waitForEvent(s, 'player-result'));
            const q1IncorrectPromises = incorrectGroup.map((s) => waitForEvent(s, 'player-result'));
            for (const s of correctGroup) s.emit('submit-answer', CORRECT_ANSWERS[0]);
            for (const s of incorrectGroup) s.emit('submit-answer', WRONG_ANSWERS[0]);
            correctGroupResults.push(await Promise.all(q1CorrectPromises));
            incorrectGroupResults.push(await Promise.all(q1IncorrectPromises));

            // Q2-Q5
            for (let q = 1; q < 5; q++) {
                // Wait for next question on a reference socket
                await waitForEvent(playerSockets[0], 'question-start');

                const cPromises = correctGroup.map((s) => waitForEvent(s, 'player-result'));
                const iPromises = incorrectGroup.map((s) => waitForEvent(s, 'player-result'));
                for (const s of correctGroup) s.emit('submit-answer', CORRECT_ANSWERS[q]);
                for (const s of incorrectGroup) s.emit('submit-answer', WRONG_ANSWERS[q]);
                correctGroupResults.push(await Promise.all(cPromises));
                incorrectGroupResults.push(await Promise.all(iPromises));
            }

            // Wait for game-end
            const gameEnd = await waitForEvent(hostSocket, 'game-end', 30000);

            // Assertions: correct players have higher totalScore
            const lastCorrectResults = correctGroupResults[4]; // Q5 results
            const lastIncorrectResults = incorrectGroupResults[4];

            const minCorrectScore = Math.min(...lastCorrectResults.map((r) => r.totalScore));
            const maxIncorrectScore = Math.max(...lastIncorrectResults.map((r) => r.totalScore));
            expect(minCorrectScore).toBeGreaterThan(maxIncorrectScore);

            // Verify incorrect players got isCorrect=false for MC/TF/numeric questions
            // (ordering may give partial credit, so skip index 4)
            for (let q = 0; q < 4; q++) {
                for (const r of incorrectGroupResults[q]) {
                    expect(r.isCorrect).toBe(false);
                }
            }

            expect(gameEnd.finalLeaderboard).toBeDefined();
            expect(gameEnd.finalLeaderboard.length).toBe(PLAYER_COUNT);
        } finally {
            await disconnectAll([hostSocket, ...playerSockets]);
        }
    }, 120000);

    // -----------------------------------------------------------------------
    // 3. Disconnect/reconnect during questions
    // -----------------------------------------------------------------------
    it('should handle disconnect/reconnect during questions', async () => {
        const PLAYER_COUNT = 20;
        const DISCONNECT_COUNT = 5;
        const RECONNECT_COUNT = 4;
        let hostSocket;
        let playerSockets = [];
        let reconnectedSockets = [];

        try {
            const host = await createHostAndGame(port);
            hostSocket = host.hostSocket;

            const joined = await joinPlayers(port, host.pin, PLAYER_COUNT);
            playerSockets = joined.sockets;
            const tokens = joined.tokens;

            // Start game and play Q1 with all players
            await startGameAndWaitForQ1(hostSocket, playerSockets[0]);
            await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[0]);

            // Wait for Q2 to start
            await waitForEvent(playerSockets[0], 'question-start');

            // Disconnect 5 players (indices 15-19)
            const disconnectIndices = [];
            for (let i = PLAYER_COUNT - DISCONNECT_COUNT; i < PLAYER_COUNT; i++) {
                disconnectIndices.push(i);
            }
            for (const idx of disconnectIndices) {
                playerSockets[idx].disconnect();
            }
            // Brief pause for server to process disconnects
            await new Promise((r) => setTimeout(r, 500));

            // Remaining 15 answer Q2
            const activeSockets = playerSockets.filter((_, i) => !disconnectIndices.includes(i));
            await allPlayersAnswer(activeSockets, CORRECT_ANSWERS[1]);

            // Wait for Q3 to start on an active socket
            await waitForEvent(activeSockets[0], 'question-start');

            // Reconnect 4 of the 5 disconnected players
            reconnectedSockets = [];
            const reconnectPromises = [];
            for (let r = 0; r < RECONNECT_COUNT; r++) {
                const idx = disconnectIndices[r];
                const token = tokens[idx];
                const [newSocket] = await createPlayers(port, 1);
                reconnectedSockets.push(newSocket);

                const rejoinPromise = waitForEvent(newSocket, 'rejoin-success');
                newSocket.emit('player-rejoin', { pin: host.pin, sessionToken: token });
                reconnectPromises.push(rejoinPromise);
            }
            const rejoinResults = await Promise.all(reconnectPromises);

            // Verify rejoin succeeded
            for (const result of rejoinResults) {
                expect(result.playerName).toBeDefined();
                expect(result.score).toBeGreaterThanOrEqual(0);
            }

            // All active + reconnected players answer Q3
            const allActiveSockets = [...activeSockets, ...reconnectedSockets];
            await allPlayersAnswer(allActiveSockets, CORRECT_ANSWERS[2]);

            // Q4 and Q5
            for (let q = 3; q < 5; q++) {
                await waitForEvent(allActiveSockets[0], 'question-start');
                await allPlayersAnswer(allActiveSockets, CORRECT_ANSWERS[q]);
            }

            // Wait for game-end
            const gameEnd = await waitForEvent(hostSocket, 'game-end', 30000);

            // Reconnected players should appear in leaderboard
            expect(gameEnd.finalLeaderboard).toBeDefined();

            // Reconnected players should have scores from Q1 (they answered before disconnecting)
            const reconnectedNames = rejoinResults.map((r) => r.playerName);
            for (const name of reconnectedNames) {
                const entry = gameEnd.finalLeaderboard.find((p) => p.name === name);
                expect(entry).toBeDefined();
                expect(entry.score).toBeGreaterThan(0);
            }
        } finally {
            await disconnectAll([hostSocket, ...playerSockets, ...reconnectedSockets]);
        }
    }, 120000);

    // -----------------------------------------------------------------------
    // 4. All players answering simultaneously (race condition)
    // -----------------------------------------------------------------------
    it('should handle all players answering simultaneously (race condition)', async () => {
        const PLAYER_COUNT = 50;
        let hostSocket;
        let playerSockets = [];

        try {
            const host = await createHostAndGame(port);
            hostSocket = host.hostSocket;

            const joined = await joinPlayers(port, host.pin, PLAYER_COUNT);
            playerSockets = joined.sockets;

            // Start game
            await startGameAndWaitForQ1(hostSocket, playerSockets[0]);

            // All 50 submit simultaneously via Promise.all
            const resultPromises = playerSockets.map((s) => waitForEvent(s, 'player-result'));
            // Fire all emits as close together as possible
            Promise.all(
                playerSockets.map((s) => {
                    s.emit('submit-answer', CORRECT_ANSWERS[0]);
                    return Promise.resolve();
                })
            );
            const results = await Promise.all(resultPromises);

            // All 50 should have received results
            expect(results).toHaveLength(PLAYER_COUNT);
            for (const r of results) {
                expect(r.isCorrect).toBe(true);
                expect(r.points).toBeGreaterThan(0);
            }

            // No errors should have been emitted
            // (If there were errors, the waitForEvent on player-result would have timed out
            //  or the results would show isCorrect: false spuriously)

            // Continue through remaining questions to cleanly end the game
            for (let q = 1; q < 5; q++) {
                const qResults = await playQuestion(
                    playerSockets[0],
                    playerSockets,
                    CORRECT_ANSWERS[q]
                );
                expect(qResults).toHaveLength(PLAYER_COUNT);
            }

            const gameEnd = await waitForEvent(hostSocket, 'game-end', 30000);
            expect(gameEnd.finalLeaderboard.length).toBe(PLAYER_COUNT);
        } finally {
            await disconnectAll([hostSocket, ...playerSockets]);
        }
    }, 120000);

    // -----------------------------------------------------------------------
    // 5. Host disconnect and reconnect
    // -----------------------------------------------------------------------
    it('should handle host disconnect and reconnect', async () => {
        const PLAYER_COUNT = 10;
        let hostSocket;
        let playerSockets = [];
        let newHostSocket;

        try {
            const host = await createHostAndGame(port);
            hostSocket = host.hostSocket;

            const joined = await joinPlayers(port, host.pin, PLAYER_COUNT);
            playerSockets = joined.sockets;

            // Start game and play Q1
            await startGameAndWaitForQ1(hostSocket, playerSockets[0]);
            await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[0]);

            // Wait for Q2
            await waitForEvent(playerSockets[0], 'question-start');

            // Set up listener for host-disconnected on a player BEFORE host disconnects
            const hostDisconnectedPromise = waitForEvent(playerSockets[0], 'host-disconnected');

            // Host disconnects
            hostSocket.disconnect();

            // Player should receive host-disconnected
            const hostDisconnectedData = await hostDisconnectedPromise;
            expect(hostDisconnectedData).toBeDefined();

            // Host reconnects with a new socket
            const [reconnectedHost] = await createPlayers(port, 1);
            newHostSocket = reconnectedHost;

            const hostRejoinPromise = waitForEvent(newHostSocket, 'host-rejoin-success');
            const playerReconnectedPromise = waitForEvent(playerSockets[0], 'host-reconnected');

            newHostSocket.emit('host-rejoin', { pin: host.pin });

            const [rejoinData] = await Promise.all([hostRejoinPromise, playerReconnectedPromise]);

            // Verify host-rejoin-success payload
            expect(rejoinData.pin).toBe(host.pin);
            expect(rejoinData.gameState).toBeDefined();
            expect(rejoinData.currentQuestion).toBeGreaterThanOrEqual(0);
            expect(rejoinData.players).toBeDefined();
            expect(rejoinData.players.length).toBe(PLAYER_COUNT);
            expect(rejoinData.quizTitle).toBe(TEST_QUIZ.title);

            // Players answer Q2 using the reconnected host's game
            await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[1]);

            // Continue through remaining questions to end the game
            for (let q = 2; q < 5; q++) {
                await waitForEvent(playerSockets[0], 'question-start');
                await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[q]);
            }

            const gameEnd = await waitForEvent(newHostSocket, 'game-end', 30000);
            expect(gameEnd.finalLeaderboard.length).toBe(PLAYER_COUNT);
        } finally {
            await disconnectAll([hostSocket, newHostSocket, ...playerSockets]);
        }
    }, 120000);

    // -----------------------------------------------------------------------
    // 6. Power-ups
    // -----------------------------------------------------------------------
    it('should handle power-ups correctly', async () => {
        const PLAYER_COUNT = 10;
        let hostSocket;
        let playerSockets = [];

        try {
            const host = await createHostAndGame(port);
            hostSocket = host.hostSocket;

            const joined = await joinPlayers(port, host.pin, PLAYER_COUNT);
            playerSockets = joined.sockets;

            // Start game (Q1 is MC — needed for fifty-fifty)
            await startGameAndWaitForQ1(hostSocket, playerSockets[0]);

            // Player 0: fifty-fifty
            const fiftyFiftyPromise = waitForEvent(playerSockets[0], 'power-up-result');
            playerSockets[0].emit('use-power-up', { type: 'fifty-fifty' });
            const fiftyFiftyResult = await fiftyFiftyPromise;

            expect(fiftyFiftyResult.success).toBe(true);
            expect(fiftyFiftyResult.type).toBe('fifty-fifty');
            expect(fiftyFiftyResult.hiddenOptions).toBeDefined();
            // Should hide 1 or 2 wrong options (out of 3 wrong options)
            expect(fiftyFiftyResult.hiddenOptions.length).toBeGreaterThanOrEqual(1);
            // The correct answer (index 1) should NOT be hidden
            expect(fiftyFiftyResult.hiddenOptions).not.toContain(1);

            // Player 1: double-points
            const doublePointsPromise = waitForEvent(playerSockets[1], 'power-up-result');
            playerSockets[1].emit('use-power-up', { type: 'double-points' });
            const doublePointsResult = await doublePointsPromise;

            expect(doublePointsResult.success).toBe(true);
            expect(doublePointsResult.type).toBe('double-points');

            // Player 2: extend-time
            const extendTimePromise = waitForEvent(playerSockets[2], 'power-up-result');
            playerSockets[2].emit('use-power-up', { type: 'extend-time' });
            const extendTimeResult = await extendTimePromise;

            expect(extendTimeResult.success).toBe(true);
            expect(extendTimeResult.type).toBe('extend-time');
            expect(extendTimeResult.extraSeconds).toBe(10);

            // Player 0 tries fifty-fifty again — should fail (already used)
            const duplicatePromise = waitForEvent(playerSockets[0], 'power-up-result');
            playerSockets[0].emit('use-power-up', { type: 'fifty-fifty' });
            const duplicateResult = await duplicatePromise;
            expect(duplicateResult.success).toBe(false);

            // All players answer Q1 correctly
            const q1Results = await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[0]);

            // Player 1 (double-points) should have more points than a normal player
            const player1Result = q1Results[1];
            // Find a "normal" player (no power-up used) — e.g., Player 3
            const normalResult = q1Results[3];

            expect(player1Result.points).toBeGreaterThan(normalResult.points);
            // Double-points should give exactly 2x (or very close given timing)
            // Check that the ratio is approximately 2
            const ratio = player1Result.points / normalResult.points;
            expect(ratio).toBeGreaterThanOrEqual(1.8);
            expect(ratio).toBeLessThanOrEqual(2.2);

            // Finish the game cleanly
            for (let q = 1; q < 5; q++) {
                await waitForEvent(playerSockets[0], 'question-start');
                await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[q]);
            }

            await waitForEvent(hostSocket, 'game-end', 30000);
        } finally {
            await disconnectAll([hostSocket, ...playerSockets]);
        }
    }, 120000);

    // -----------------------------------------------------------------------
    // 7. Manual advancement mode
    // -----------------------------------------------------------------------
    it('should wait for host next-question in manual advancement mode', async () => {
        const PLAYER_COUNT = 5;
        let hostSocket;
        let playerSockets = [];

        try {
            // Create quiz with manual advancement enabled
            const manualQuiz = {
                ...TEST_QUIZ,
                manualAdvancement: true
            };

            const host = await createHostAndGame(port, manualQuiz);
            hostSocket = host.hostSocket;

            const joined = await joinPlayers(port, host.pin, PLAYER_COUNT);
            playerSockets = joined.sockets;

            // Start game and play Q1
            await startGameAndWaitForQ1(hostSocket, playerSockets[0]);

            // Set up show-next-button listener BEFORE answering, since the
            // server emits it ~4s after all answers (1s early-end + 3s advance
            // timer). We capture it to prove the game paused for the host.
            const showNextBtnPromise = waitForEvent(hostSocket, 'show-next-button', 15000);

            // Track whether question-start fires prematurely (it should NOT in
            // manual mode). Install listener before answering so it covers the
            // full window.
            let prematureQuestionStart = false;
            const earlyListener = () => {
                prematureQuestionStart = true;
            };
            playerSockets[0].on('question-start', earlyListener);

            await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[0]);

            // Wait for show-next-button (host should receive it after leaderboard delay)
            await showNextBtnPromise;

            // Wait an additional 3 seconds after show-next-button to confirm
            // no auto-advance happens
            await new Promise((r) => setTimeout(r, 3000));
            playerSockets[0].off('question-start', earlyListener);

            expect(prematureQuestionStart).toBe(false);

            // Now host clicks next
            const q2Promise = waitForEvent(playerSockets[0], 'question-start');
            hostSocket.emit('next-question');
            const q2Data = await q2Promise;

            // Should be Q2 (question number 2)
            expect(q2Data.questionNumber).toBe(2);

            // Answer remaining questions (Q2-Q5) with manual advancement each time
            await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[1]);
            for (let q = 2; q < 5; q++) {
                await waitForEvent(hostSocket, 'show-next-button', 15000);
                const nextQPromise = waitForEvent(playerSockets[0], 'question-start');
                hostSocket.emit('next-question');
                await nextQPromise;
                await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[q]);
            }

            // After Q5 (the last question), the server emits show-next-button
            // with isLastQuestion: true. Host must emit next-question one more
            // time to trigger endGame.
            await waitForEvent(hostSocket, 'show-next-button', 15000);
            hostSocket.emit('next-question');

            const gameEnd = await waitForEvent(hostSocket, 'game-end', 30000);
            expect(gameEnd.finalLeaderboard.length).toBe(PLAYER_COUNT);
        } finally {
            await disconnectAll([hostSocket, ...playerSockets]);
        }
    }, 120000);

    // -----------------------------------------------------------------------
    // 8. Mid-game player join
    // -----------------------------------------------------------------------
    it('should handle mid-game player join', async () => {
        const INITIAL_PLAYER_COUNT = 10;
        const LATE_JOINER_COUNT = 5;
        let hostSocket;
        let playerSockets = [];
        let lateJoinSockets = [];

        try {
            const host = await createHostAndGame(port);
            hostSocket = host.hostSocket;

            const joined = await joinPlayers(port, host.pin, INITIAL_PLAYER_COUNT);
            playerSockets = joined.sockets;

            // Start game and play Q1
            await startGameAndWaitForQ1(hostSocket, playerSockets[0]);
            await allPlayersAnswer(playerSockets, CORRECT_ANSWERS[0]);

            // Wait for Q2 on an initial player
            await waitForEvent(playerSockets[0], 'question-start');

            // 5 new players join mid-game
            lateJoinSockets = await createPlayers(port, LATE_JOINER_COUNT);
            const lateJoinPromises = lateJoinSockets.map((socket, i) => {
                // Late joiners should receive player-joined, then game-started, then
                // question-start for the current question (all sent by handlePlayerJoin)
                const joinedPromise = waitForEvent(socket, 'player-joined');
                socket.emit('player-join', { pin: host.pin, name: `LatePlayer-${i}` });
                return joinedPromise;
            });
            const lateJoinResults = await Promise.all(lateJoinPromises);

            // Verify late joiners received player-joined
            for (const r of lateJoinResults) {
                expect(r.gamePin).toBe(host.pin);
                expect(r.sessionToken).toBeDefined();
            }

            // Late joiners should have received game-started (since the game is active)
            // They should be able to answer Q2
            const allSockets = [...playerSockets, ...lateJoinSockets];
            await allPlayersAnswer(allSockets, CORRECT_ANSWERS[1]);

            // Q3-Q5
            for (let q = 2; q < 5; q++) {
                await waitForEvent(allSockets[0], 'question-start');
                await allPlayersAnswer(allSockets, CORRECT_ANSWERS[q]);
            }

            // Wait for game-end
            const gameEnd = await waitForEvent(hostSocket, 'game-end', 30000);

            // Late joiners should appear in the final leaderboard
            expect(gameEnd.finalLeaderboard).toBeDefined();
            const totalExpected = INITIAL_PLAYER_COUNT + LATE_JOINER_COUNT;
            expect(gameEnd.finalLeaderboard.length).toBe(totalExpected);

            // Late joiners should have scores from the questions they answered (Q2-Q5)
            for (let i = 0; i < LATE_JOINER_COUNT; i++) {
                const entry = gameEnd.finalLeaderboard.find((p) => p.name === `LatePlayer-${i}`);
                expect(entry).toBeDefined();
                expect(entry.score).toBeGreaterThan(0);
            }

            // Initial players should have higher scores (they answered Q1 too)
            const initialPlayerScores = gameEnd.finalLeaderboard
                .filter((p) => p.name.startsWith('Player-'))
                .map((p) => p.score);
            const latePlayerScores = gameEnd.finalLeaderboard
                .filter((p) => p.name.startsWith('LatePlayer-'))
                .map((p) => p.score);

            const minInitialScore = Math.min(...initialPlayerScores);
            const maxLateScore = Math.max(...latePlayerScores);
            expect(minInitialScore).toBeGreaterThan(maxLateScore);
        } finally {
            await disconnectAll([hostSocket, ...playerSockets, ...lateJoinSockets]);
        }
    }, 120000);
});
