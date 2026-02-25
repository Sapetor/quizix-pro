/**
 * Quiz Service Tests
 */

const { QuizService } = require('../../services/quiz-service');
const fs = require('fs').promises;
const path = require('path');

// Mock dependencies
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

const mockWslMonitor = {
    trackFileOperation: jest.fn((fn) => fn())
};

// Mock fs module
jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
        readFile: jest.fn(),
        readdir: jest.fn(),
        access: jest.fn(),
        unlink: jest.fn()
    }
}));

describe('QuizService', () => {
    let quizService;

    beforeEach(() => {
        jest.clearAllMocks();
        quizService = new QuizService(mockLogger, mockWslMonitor, 'quizzes');
    });

    describe('validateFilename', () => {
        test('should return true for valid filenames', () => {
            expect(quizService.validateFilename('quiz_123.json')).toBe(true);
            expect(quizService.validateFilename('my-quiz.json')).toBe(true);
            expect(quizService.validateFilename('Quiz_Test_123.json')).toBe(true);
        });

        test('should return false for null or undefined', () => {
            expect(quizService.validateFilename(null)).toBe(false);
            expect(quizService.validateFilename(undefined)).toBe(false);
        });

        test('should return false for non-string values', () => {
            expect(quizService.validateFilename(123)).toBe(false);
            expect(quizService.validateFilename({})).toBe(false);
        });

        test('should reject path traversal attempts', () => {
            expect(quizService.validateFilename('../quiz.json')).toBe(false);
            expect(quizService.validateFilename('..\\quiz.json')).toBe(false);
            expect(quizService.validateFilename('folder/quiz.json')).toBe(false);
            expect(quizService.validateFilename('folder\\quiz.json')).toBe(false);
        });

        test('should reject special characters', () => {
            expect(quizService.validateFilename('quiz<>.json')).toBe(false);
            expect(quizService.validateFilename('quiz|test.json')).toBe(false);
            expect(quizService.validateFilename('quiz:test.json')).toBe(false);
        });
    });

    describe('saveQuiz', () => {
        test('should save a valid quiz successfully', async () => {
            const title = 'Test Quiz';
            const questions = [
                { question: 'Q1?', options: ['A', 'B'], correctAnswer: 0 }
            ];

            const result = await quizService.saveQuiz(title, questions);

            expect(result.success).toBe(true);
            expect(result.filename).toMatch(/^test_quiz_\d+\.json$/);
            expect(result.id).toBeDefined();
            expect(mockWslMonitor.trackFileOperation).toHaveBeenCalled();
        });

        test('should reject empty title', async () => {
            await expect(quizService.saveQuiz('', [{ question: 'Q1?' }]))
                .rejects.toThrow('Invalid quiz data');
        });

        test('should reject null questions', async () => {
            await expect(quizService.saveQuiz('Test', null))
                .rejects.toThrow('Invalid quiz data');
        });

        test('should reject non-array questions', async () => {
            await expect(quizService.saveQuiz('Test', 'not an array'))
                .rejects.toThrow('Invalid quiz data');
        });

        test('should reject title exceeding 200 characters', async () => {
            const longTitle = 'a'.repeat(201);
            await expect(quizService.saveQuiz(longTitle, [{ question: 'Q1?' }]))
                .rejects.toThrow('Quiz title must be less than 200 characters');
        });

        test('should reject more than 100 questions', async () => {
            const questions = Array(101).fill({ question: 'Q?' });
            await expect(quizService.saveQuiz('Test', questions))
                .rejects.toThrow('Maximum 100 questions allowed per quiz');
        });

        test('should reject question text exceeding 5000 characters', async () => {
            const questions = [{ question: 'a'.repeat(5001) }];
            await expect(quizService.saveQuiz('Test', questions))
                .rejects.toThrow('Question 1 text exceeds 5000 characters');
        });

        test('should reject explanation exceeding 2000 characters', async () => {
            const questions = [{ question: 'Q?', explanation: 'a'.repeat(2001) }];
            await expect(quizService.saveQuiz('Test', questions))
                .rejects.toThrow('Question 1 explanation exceeds 2000 characters');
        });

        test('should reject option exceeding 1000 characters', async () => {
            const questions = [{ question: 'Q?', options: ['a'.repeat(1001)] }];
            await expect(quizService.saveQuiz('Test', questions))
                .rejects.toThrow('Question 1, option 1 exceeds 1000 characters');
        });

        test('should sanitize title for filename', async () => {
            const title = 'Test Quiz!@#$%^&*()';
            const questions = [{ question: 'Q1?' }];

            const result = await quizService.saveQuiz(title, questions);

            // Title sanitized: spaces, special chars become underscores
            expect(result.filename).toMatch(/^test_quiz_+\d+\.json$/);
        });
    });

    describe('listQuizzes', () => {
        test('should list all quiz files', async () => {
            fs.readdir.mockResolvedValue(['quiz1.json', 'quiz2.json', 'readme.txt']);
            fs.readFile.mockImplementation((filePath) => {
                if (filePath.includes('quiz1')) {
                    return Promise.resolve(JSON.stringify({
                        title: 'Quiz 1',
                        questions: [{ q: 1 }],
                        created: '2024-01-01',
                        id: 'id1'
                    }));
                }
                return Promise.resolve(JSON.stringify({
                    title: 'Quiz 2',
                    questions: [{ q: 1 }, { q: 2 }],
                    created: '2024-01-02',
                    id: 'id2'
                }));
            });

            const quizzes = await quizService.listQuizzes();

            expect(quizzes).toHaveLength(2);
            expect(quizzes[0].title).toBe('Quiz 1');
            expect(quizzes[0].questionCount).toBe(1);
            expect(quizzes[1].title).toBe('Quiz 2');
            expect(quizzes[1].questionCount).toBe(2);
        });

        test('should filter out invalid quiz files', async () => {
            fs.readdir.mockResolvedValue(['quiz1.json', 'invalid.json']);
            fs.readFile.mockImplementation((filePath) => {
                if (filePath.includes('invalid')) {
                    return Promise.reject(new Error('Parse error'));
                }
                return Promise.resolve(JSON.stringify({
                    title: 'Quiz 1',
                    questions: [],
                    created: '2024-01-01',
                    id: 'id1'
                }));
            });

            const quizzes = await quizService.listQuizzes();

            expect(quizzes).toHaveLength(1);
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('loadQuiz', () => {
        test('should load a valid quiz', async () => {
            const quizData = { title: 'Test', questions: [] };
            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue(JSON.stringify(quizData));

            const result = await quizService.loadQuiz('test_quiz.json');

            expect(result).toEqual(quizData);
        });

        test('should reject invalid filename', async () => {
            await expect(quizService.loadQuiz('../evil.json'))
                .rejects.toThrow('Invalid filename');
        });

        test('should reject non-json files', async () => {
            await expect(quizService.loadQuiz('test.txt'))
                .rejects.toThrow('Invalid filename');
        });

        test('should throw error for non-existent quiz', async () => {
            fs.access.mockRejectedValue(new Error('ENOENT'));

            await expect(quizService.loadQuiz('nonexistent.json'))
                .rejects.toThrow('Quiz not found');
        });
    });

    describe('deleteQuiz', () => {
        test('should delete an existing quiz', async () => {
            fs.access.mockResolvedValue();
            fs.unlink.mockResolvedValue();

            const result = await quizService.deleteQuiz('test_quiz.json');

            expect(result.success).toBe(true);
            expect(result.filename).toBe('test_quiz.json');
        });

        test('should reject invalid filename', async () => {
            await expect(quizService.deleteQuiz('../evil.json'))
                .rejects.toThrow('Invalid filename');
        });

        test('should reject non-json files', async () => {
            await expect(quizService.deleteQuiz('test.txt'))
                .rejects.toThrow('Invalid filename');
        });

        test('should throw error for non-existent quiz', async () => {
            fs.access.mockRejectedValue(new Error('ENOENT'));

            await expect(quizService.deleteQuiz('nonexistent.json'))
                .rejects.toThrow('Quiz not found');
        });
    });
});
