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
        submitAnswer: jest.fn(function(socketId, answer, type) {
            const player = this.players.get(socketId);
            if (player) {
                player.answers[this.currentQuestion] = {
                    answer,
                    isCorrect: answer === 0,
                    points: answer === 0 ? 100 : 0,
                    timeMs: 5000
                };
            }
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

            expect(spy).toHaveBeenCalledWith(game, io);
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
    });

    describe('getAnswerStatistics', () => {
        test('should delegate to game.getAnswerStatistics', () => {
            const game = createMockGame();

            questionFlowService.getAnswerStatistics(game);

            expect(game.getAnswerStatistics).toHaveBeenCalled();
        });
    });
});
