/**
 * Question Flow Service Tests
 */

const { QuestionFlowService } = require('../../services/question-flow-service');

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

const mockGameSessionService = {
    advanceToNextQuestion: jest.fn()
};

// Mock socket
const createMockSocket = (id = 'player-socket') => ({
    id,
    emit: jest.fn()
});

// Mock IO
const createMockIO = () => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
});

// Mock game
const createMockGame = (options = {}) => {
    const players = new Map();
    if (options.players) {
        options.players.forEach(p => {
            players.set(p.id, { ...p, answers: p.answers || {} });
        });
    }

    return {
        pin: options.pin || '123456',
        gameState: options.gameState || 'question',
        hostId: options.hostId || 'host-socket',
        currentQuestion: options.currentQuestion || 0,
        players,
        quiz: {
            questions: options.questions || [
                {
                    type: 'multiple-choice',
                    question: 'Test question?',
                    options: ['A', 'B', 'C', 'D'],
                    correctAnswer: 0,
                    explanation: 'A is correct'
                }
            ]
        },
        endingQuestionEarly: false,
        questionTimer: null,
        advanceTimer: null,
        earlyEndTimer: null,
        answerCountTimer: null,
        answerCountArmEpoch: 0,
        disconnectEpoch: options.disconnectEpoch || 0,
        submitAnswer: jest.fn(function(socketId, answer, type) {
            const player = this.players.get(socketId);
            if (!player) return { accepted: false, reason: 'unknown-player' };
            if (player.answers[this.currentQuestion]) {
                return {
                    accepted: false,
                    reason: 'duplicate',
                    result: player.answers[this.currentQuestion]
                };
            }
            const points = answer === 0 ? 100 : 0;
            player.answers[this.currentQuestion] = {
                answer,
                isCorrect: answer === 0,
                points,
                timeMs: 5000
            };
            player.score = (player.score || 0) + points;
            return { accepted: true, isCorrect: answer === 0, points };
        }),
        endQuestion: jest.fn(),
        getAnswerStatistics: jest.fn().mockReturnValue({
            totalAnswers: 1,
            answerDistribution: { '0': 1 }
        })
    };
};

describe('QuestionFlowService', () => {
    let questionFlowService;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        questionFlowService = new QuestionFlowService(mockLogger, mockGameSessionService);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('handleAnswerSubmission', () => {
        test('should submit answer for valid player', () => {
            const socket = createMockSocket('player-1');
            const io = createMockIO();
            const game = createMockGame({
                players: [{ id: 'player-1', name: 'Player1', score: 0 }]
            });
            const playerData = { gamePin: '123456', name: 'Player1' };

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, game, socket, io
            );

            expect(game.submitAnswer).toHaveBeenCalledWith('player-1', 0, 'multiple-choice');
            expect(socket.emit).toHaveBeenCalledWith('answer-submitted', { answer: 0 });
        });

        test('should reject answer from unknown player', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame();

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', null, game, socket, io
            );

            expect(game.submitAnswer).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('unknown player')
            );
        });

        test('should reject answer when game not in question state', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const game = createMockGame({ gameState: 'lobby' });
            const playerData = { gamePin: '123456', name: 'Player1' };

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, game, socket, io
            );

            expect(game.submitAnswer).not.toHaveBeenCalled();
            expect(socket.emit).toHaveBeenCalledWith('answer-rejected', expect.any(Object));
        });

        test('should reject answer when game not found', () => {
            const socket = createMockSocket();
            const io = createMockIO();
            const playerData = { gamePin: '123456', name: 'Player1' };

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, null, socket, io
            );

            expect(socket.emit).toHaveBeenCalledWith('answer-rejected', expect.objectContaining({
                reason: 'game_not_found'
            }));
        });

        test('should emit answer count update to host', () => {
            const socket = createMockSocket('player-1');
            const io = createMockIO();
            const game = createMockGame({
                players: [{ id: 'player-1', name: 'Player1', score: 0 }]
            });
            const playerData = { gamePin: '123456', name: 'Player1' };

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, game, socket, io
            );
            jest.advanceTimersByTime(100);

            expect(io.to).toHaveBeenCalledWith('host-socket');
            expect(io.emit).toHaveBeenCalledWith('answer-count-update', expect.objectContaining({
                answeredPlayers: expect.any(Number),
                totalPlayers: expect.any(Number)
            }));
        });

        test('should trigger early end when all players answered', () => {
            const socket = createMockSocket('player-1');
            const io = createMockIO();
            const game = createMockGame({
                players: [{ id: 'player-1', name: 'Player1', score: 0 }]
            });
            const playerData = { gamePin: '123456', name: 'Player1' };

            // Spy on endQuestionEarly
            const spy = jest.spyOn(questionFlowService, 'endQuestionEarly');

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, game, socket, io
            );
            jest.advanceTimersByTime(100);

            expect(spy).toHaveBeenCalledWith(game, io);
        });
    });

    describe('coalesced answer-count-update', () => {
        const countUpdates = (io) =>
            io.emit.mock.calls.filter(call => call[0] === 'answer-count-update');

        // T1
        test('coalesces 10 answers in one window into exactly one host emit with final counts', () => {
            const io = createMockIO();
            const players = [];
            for (let i = 1; i <= 12; i++) {
                players.push({ id: `player-${i}`, name: `Player${i}`, score: 0 });
            }
            const game = createMockGame({ players });
            const playerData = { gamePin: '123456', name: 'P' };

            // 10 of the 12 players answer inside the same 100ms window
            for (let i = 1; i <= 10; i++) {
                const socket = createMockSocket(`player-${i}`);
                questionFlowService.handleAnswerSubmission(
                    socket.id, 0, 'multiple-choice', playerData, game, socket, io
                );
            }

            expect(countUpdates(io)).toHaveLength(0);

            jest.advanceTimersByTime(100);

            const updates = countUpdates(io);
            expect(updates).toHaveLength(1);
            expect(updates[0][1]).toEqual({
                answeredPlayers: 10,
                connectedPlayers: 12,
                totalPlayers: 12
            });
        });

        // T2
        test('still ends the question early once every active player has answered', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [
                    { id: 'player-1', name: 'Player1', score: 0 },
                    { id: 'player-2', name: 'Player2', score: 0, disconnected: true }
                ]
            });
            const playerData = { gamePin: '123456', name: 'Player1' };
            const spy = jest.spyOn(questionFlowService, 'endQuestionEarly');
            const socket = createMockSocket('player-1');

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, game, socket, io
            );

            expect(spy).not.toHaveBeenCalled();

            jest.advanceTimersByTime(100);

            expect(spy).toHaveBeenCalledWith(game, io);
            expect(countUpdates(io)[0][1]).toEqual({
                answeredPlayers: 1,
                connectedPlayers: 1,
                totalPlayers: 2
            });
        });

        // T3
        test('does not emit a stale count update when the question ended before the flush', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [
                    { id: 'player-1', name: 'Player1', score: 0 },
                    { id: 'player-2', name: 'Player2', score: 0 }
                ]
            });
            const playerData = { gamePin: '123456', name: 'Player1' };
            const socket = createMockSocket('player-1');

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, game, socket, io
            );

            // Question ends (timeout / host advance) before the 100ms flush fires
            game.gameState = 'revealing';
            jest.advanceTimersByTime(100);

            expect(countUpdates(io)).toHaveLength(0);
        });

        // T4
        test('rejects a duplicate submission without re-confirming or re-counting', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [
                    { id: 'player-1', name: 'Player1', score: 0 },
                    { id: 'player-2', name: 'Player2', score: 0 }
                ]
            });
            const playerData = { gamePin: '123456', name: 'Player1' };
            const socket = createMockSocket('player-1');

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, game, socket, io
            );
            jest.advanceTimersByTime(100);

            const scoreAfterFirst = game.players.get('player-1').score;
            expect(countUpdates(io)).toHaveLength(1);
            socket.emit.mockClear();

            // Same player submits again for the same question
            questionFlowService.handleAnswerSubmission(
                socket.id, 1, 'multiple-choice', playerData, game, socket, io
            );
            jest.advanceTimersByTime(100);

            expect(socket.emit).toHaveBeenCalledWith(
                'answer-already-submitted',
                expect.objectContaining({ reason: 'duplicate' })
            );
            expect(socket.emit).not.toHaveBeenCalledWith('answer-submitted', expect.anything());
            expect(game.players.get('player-1').score).toBe(scoreAfterFirst);
            expect(countUpdates(io)).toHaveLength(1);
        });

        // T5 — a disconnect must never be what ends a question early.
        // The host still gets an accurate count; only the early-end decision is suppressed.
        test('does not end the question early when a disconnect closed the gap mid-window', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [
                    { id: 'player-1', name: 'Player1', score: 0 },
                    { id: 'player-2', name: 'Player2', score: 0 }
                ]
            });
            const playerData = { gamePin: '123456', name: 'Player1' };
            const spy = jest.spyOn(questionFlowService, 'endQuestionEarly');
            const socket = createMockSocket('player-1');

            // Player 1 answers, arming the flush. 1 of 2 answered — not enough to end early.
            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, game, socket, io
            );

            // Player 2 drops off Wi-Fi before the flush fires. This is what
            // handlePlayerDisconnect does: mark disconnected and bump the epoch.
            game.players.get('player-2').disconnected = true;
            game.disconnectEpoch++;

            jest.advanceTimersByTime(100);

            // The gap closed only because the roster shrank, so the question must survive.
            expect(spy).not.toHaveBeenCalled();
            // ...but the host still sees the truthful 1/1 count.
            expect(countUpdates(io)[0][1]).toEqual({
                answeredPlayers: 1,
                connectedPlayers: 1,
                totalPlayers: 2
            });
        });

        test('the duplicate rejection carries the previously stored answer', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [{ id: 'player-1', name: 'Player1', score: 0 }]
            });
            const playerData = { gamePin: '123456', name: 'Player1' };
            const socket = createMockSocket('player-1');

            // First submission stores answer 2
            questionFlowService.handleAnswerSubmission(
                socket.id, 2, 'multiple-choice', playerData, game, socket, io
            );
            socket.emit.mockClear();

            // Retry sends a different value; the client must be told what is
            // actually on record, not what it just re-sent.
            questionFlowService.handleAnswerSubmission(
                socket.id, 3, 'multiple-choice', playerData, game, socket, io
            );

            expect(socket.emit).toHaveBeenCalledWith(
                'answer-already-submitted',
                { reason: 'duplicate', answer: 2 }
            );
        });

        test('an unregistered player gets answer-rejected, not answer-already-submitted', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [{ id: 'player-1', name: 'Player1', score: 0 }]
            });
            // playerData is non-null (global registry) but the player is not in this game
            const playerData = { gamePin: '123456', name: 'Ghost' };
            const socket = createMockSocket('ghost-socket');

            questionFlowService.handleAnswerSubmission(
                socket.id, 0, 'multiple-choice', playerData, game, socket, io
            );

            expect(socket.emit).toHaveBeenCalledWith(
                'answer-rejected',
                expect.objectContaining({ reason: 'unknown-player' })
            );
            expect(socket.emit).not.toHaveBeenCalledWith(
                'answer-already-submitted',
                expect.anything()
            );
        });
    });

    describe('endQuestionEarly', () => {
        test('should set flag to prevent duplicate calls', () => {
            const io = createMockIO();
            const game = createMockGame();

            questionFlowService.endQuestionEarly(game, io);

            expect(game.endingQuestionEarly).toBe(true);
        });

        test('should ignore if already ending', () => {
            const io = createMockIO();
            const game = createMockGame();
            game.endingQuestionEarly = true;

            questionFlowService.endQuestionEarly(game, io);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Already ending')
            );
        });

        test('should clear existing timers', () => {
            const io = createMockIO();
            const game = createMockGame();
            game.questionTimer = setTimeout(() => {}, 10000);
            game.advanceTimer = setTimeout(() => {}, 10000);

            questionFlowService.endQuestionEarly(game, io);

            expect(game.questionTimer).toBeNull();
            expect(game.advanceTimer).toBeNull();
        });

        test('should emit question-timeout after delay', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [{ id: 'player-1', name: 'Player1', score: 0 }]
            });

            questionFlowService.endQuestionEarly(game, io);

            // Fast-forward 1 second
            jest.advanceTimersByTime(1000);

            expect(game.endQuestion).toHaveBeenCalled();
            expect(io.emit).toHaveBeenCalledWith('question-timeout', expect.objectContaining({
                earlyEnd: true
            }));
        });
    });

    describe('buildCorrectAnswerData', () => {
        test('should build data for multiple-choice question', () => {
            const question = {
                type: 'multiple-choice',
                options: ['A', 'B', 'C', 'D'],
                correctAnswer: 1,
                tolerance: null,
                explanation: 'B is correct'
            };

            const result = questionFlowService.buildCorrectAnswerData(question);

            expect(result.correctAnswer).toBe(1);
            expect(result.correctOption).toBe('B');
            expect(result.questionType).toBe('multiple-choice');
            expect(result.explanation).toBe('B is correct');
        });

        test('should build data for multiple-correct question', () => {
            const question = {
                type: 'multiple-correct',
                options: ['A', 'B', 'C', 'D'],
                correctAnswers: [0, 2]
            };

            const result = questionFlowService.buildCorrectAnswerData(question);

            expect(result.correctAnswers).toEqual([0, 2]);
            expect(result.correctOption).toBe('A, C');
        });

        test('should build data for true-false question', () => {
            const question = {
                type: 'true-false',
                correctAnswer: true
            };

            const result = questionFlowService.buildCorrectAnswerData(question);

            expect(result.correctAnswer).toBe(true);
            expect(result.correctOption).toBe(true);
        });

        test('should build data for numeric question', () => {
            const question = {
                type: 'numeric',
                correctAnswer: 42,
                tolerance: 0.1
            };

            const result = questionFlowService.buildCorrectAnswerData(question);

            expect(result.correctAnswer).toBe(42);
            expect(result.correctOption).toBe('42');
            expect(result.tolerance).toBe(0.1);
        });

        test('should build data for ordering question', () => {
            const question = {
                type: 'ordering',
                options: ['First', 'Second', 'Third'],
                correctOrder: [0, 1, 2]
            };

            const result = questionFlowService.buildCorrectAnswerData(question);

            expect(result.correctOption).toBe('First → Second → Third');
        });

        test('should handle invalid indices in correctOrder', () => {
            const question = {
                type: 'ordering',
                options: ['A', 'B'],
                correctOrder: [0, 5, 1] // 5 is invalid
            };

            const result = questionFlowService.buildCorrectAnswerData(question);

            expect(result.correctOption).toBe('A → B');
        });
    });

    describe('emitPlayerResults', () => {
        test('should emit results to all players', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [
                    { id: 'player-1', name: 'Player1', score: 100, answers: { 0: { isCorrect: true, points: 100 } } },
                    { id: 'player-2', name: 'Player2', score: 0, answers: { 0: { isCorrect: false, points: 0 } } }
                ]
            });

            questionFlowService.emitPlayerResults(game, io);

            expect(io.to).toHaveBeenCalledWith('player-1');
            expect(io.to).toHaveBeenCalledWith('player-2');
            expect(io.emit).toHaveBeenCalledWith('player-result', expect.any(Object));
        });

        test('should send result with isCorrect false for players without answers', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [
                    { id: 'player-1', name: 'Player1', score: 0, answers: {} }
                ]
            });

            questionFlowService.emitPlayerResults(game, io);

            expect(io.emit).toHaveBeenCalledWith('player-result', expect.objectContaining({
                isCorrect: false,
                points: 0
            }));
        });

        test('should inverse-map correctAnswer into the player shuffled space', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [
                    { id: 'player-1', name: 'Player1', score: 100, answers: { 0: { isCorrect: true, points: 100 } } }
                ]
            });
            // canonical correctAnswer is 0; player's shuffle shows it at position 1
            // mapping[shuffledIndex] = originalIndex → [2, 0, 1] means indexOf(0) === 1
            game.answerMappings = new Map([['player-1', [2, 0, 1]]]);

            questionFlowService.emitPlayerResults(game, io);

            expect(io.emit).toHaveBeenCalledWith('player-result', expect.objectContaining({
                correctAnswer: 1
            }));
        });

        test('should include partialScore from the stored answer', () => {
            const io = createMockIO();
            const game = createMockGame({
                players: [
                    { id: 'player-1', name: 'Player1', score: 75, answers: { 0: { isCorrect: false, points: 75, partialScore: 0.75 } } }
                ]
            });

            questionFlowService.emitPlayerResults(game, io);

            expect(io.emit).toHaveBeenCalledWith('player-result', expect.objectContaining({
                partialScore: 0.75
            }));
        });
    });

    describe('getAnswerStatistics', () => {
        test('should delegate to game.getAnswerStatistics', () => {
            const game = createMockGame();

            questionFlowService.getAnswerStatistics(game);

            expect(game.getAnswerStatistics).toHaveBeenCalled();
        });
    });
});
