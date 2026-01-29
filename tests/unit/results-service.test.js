/**
 * Results Service Tests
 */

const { ResultsService } = require('../../services/results-service');
const fs = require('fs').promises;
const path = require('path');

// Mock fs module
jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
        readFile: jest.fn(),
        readdir: jest.fn(),
        access: jest.fn(),
        unlink: jest.fn(),
        stat: jest.fn()
    }
}));

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('ResultsService', () => {
    let resultsService;

    beforeEach(() => {
        jest.clearAllMocks();
        resultsService = new ResultsService(mockLogger, 'results');
    });

    describe('validateFilename', () => {
        test('should accept valid results filenames', () => {
            expect(resultsService.validateFilename('results_123456_1704067200000.json')).toBeTruthy();
        });

        test('should reject invalid filenames', () => {
            expect(resultsService.validateFilename('quiz.json')).toBeFalsy();
            expect(resultsService.validateFilename('results_abc_123.json')).toBeFalsy();
            expect(resultsService.validateFilename('../results_123_456.json')).toBeFalsy();
            expect(resultsService.validateFilename(null)).toBeFalsy();
        });
    });

    describe('validatePath', () => {
        test('should return resolved path for valid filename', () => {
            const result = resultsService.validatePath('results_123456_1704067200000.json');
            expect(result).toContain('results');
        });

        test('should throw error for path traversal attempt', () => {
            expect(() => resultsService.validatePath('../secret.json'))
                .toThrow('Invalid path: attempted directory traversal');
        });
    });

    describe('saveResults', () => {
        test('should save valid results', async () => {
            fs.writeFile.mockResolvedValue();

            const result = await resultsService.saveResults(
                'Test Quiz',
                '123456',
                [{ name: 'Player1', score: 100 }],
                '2024-01-01T10:00:00Z',
                '2024-01-01T10:30:00Z'
            );

            expect(result.success).toBe(true);
            expect(result.filename).toMatch(/^results_123456_\d+\.json$/);
            expect(fs.writeFile).toHaveBeenCalled();
        });

        test('should include questions data if provided', async () => {
            fs.writeFile.mockResolvedValue();
            const questions = [{ question: 'Q1?', correctAnswer: 0 }];

            await resultsService.saveResults(
                'Test Quiz',
                '123456',
                [{ name: 'Player1', score: 100 }],
                '2024-01-01T10:00:00Z',
                '2024-01-01T10:30:00Z',
                questions
            );

            const savedData = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(savedData.questions).toEqual(questions);
        });

        test('should reject missing required data', async () => {
            await expect(resultsService.saveResults(null, '123456', []))
                .rejects.toThrow('Invalid results data');
            await expect(resultsService.saveResults('Test', null, []))
                .rejects.toThrow('Invalid results data');
            await expect(resultsService.saveResults('Test', '123456', null))
                .rejects.toThrow('Invalid results data');
        });
    });

    describe('listResults', () => {
        test('should list all results files', async () => {
            fs.access.mockResolvedValue();
            fs.readdir.mockResolvedValue(['results_123_456.json', 'results_789_012.json', 'other.txt']);
            fs.stat.mockResolvedValue({ size: 1024, mtime: new Date() });
            fs.readFile.mockResolvedValue(JSON.stringify({
                quizTitle: 'Test',
                gamePin: '123456',
                results: [{ name: 'Player1' }],
                saved: '2024-01-01'
            }));

            const results = await resultsService.listResults();

            expect(results).toHaveLength(2);
            expect(results[0].quizTitle).toBe('Test');
        });

        test('should return empty array if results directory does not exist', async () => {
            fs.access.mockRejectedValue(new Error('ENOENT'));

            const results = await resultsService.listResults();

            expect(results).toEqual([]);
        });

        test('should filter out corrupted files', async () => {
            fs.access.mockResolvedValue();
            fs.readdir.mockResolvedValue(['results_123_456.json', 'results_789_012.json']);
            fs.stat.mockResolvedValue({ size: 1024, mtime: new Date() });
            fs.readFile.mockImplementation((filePath) => {
                if (filePath.includes('789')) {
                    return Promise.reject(new Error('Parse error'));
                }
                return Promise.resolve(JSON.stringify({
                    quizTitle: 'Test',
                    gamePin: '123456',
                    results: [],
                    saved: '2024-01-01'
                }));
            });

            const results = await resultsService.listResults();

            expect(results).toHaveLength(1);
        });
    });

    describe('deleteResult', () => {
        test('should delete existing result file', async () => {
            fs.access.mockResolvedValue();
            fs.unlink.mockResolvedValue();

            const result = await resultsService.deleteResult('results_123456_1704067200000.json');

            expect(result.success).toBe(true);
            expect(fs.unlink).toHaveBeenCalled();
        });

        test('should reject invalid filename format', async () => {
            await expect(resultsService.deleteResult('invalid.json'))
                .rejects.toThrow('Invalid filename format');
        });

        test('should throw error for non-existent file', async () => {
            fs.access.mockRejectedValue(new Error('ENOENT'));

            await expect(resultsService.deleteResult('results_123456_1704067200000.json'))
                .rejects.toThrow('Result file not found');
        });
    });

    describe('getResult', () => {
        test('should return result data for valid file', async () => {
            const resultData = { quizTitle: 'Test', results: [] };
            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue(JSON.stringify(resultData));

            const result = await resultsService.getResult('results_123456_1704067200000.json');

            expect(result).toEqual(resultData);
        });

        test('should reject invalid filename format', async () => {
            await expect(resultsService.getResult('invalid.json'))
                .rejects.toThrow('Invalid filename format');
        });

        test('should throw error for corrupted file', async () => {
            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue('invalid json');

            await expect(resultsService.getResult('results_123456_1704067200000.json'))
                .rejects.toThrow('Result file is corrupted or invalid JSON');
        });
    });

    describe('exportResults', () => {
        const mockResultData = {
            quizTitle: 'Test Quiz',
            gamePin: '123456',
            results: [
                {
                    name: 'Player1',
                    score: 100,
                    answers: [
                        { answer: 0, isCorrect: true, timeMs: 5000, points: 100 }
                    ]
                }
            ],
            questions: [
                { text: 'Q1?', correctAnswer: 0, options: ['A', 'B'], difficulty: 'easy' }
            ]
        };

        beforeEach(() => {
            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue(JSON.stringify(mockResultData));
        });

        test('should export as JSON', async () => {
            const result = await resultsService.exportResults(
                'results_123456_1704067200000.json',
                'json'
            );

            expect(result.type).toBe('application/json');
            expect(result.filename).toContain('json');
        });

        test('should export as simple CSV', async () => {
            const result = await resultsService.exportResults(
                'results_123456_1704067200000.json',
                'csv',
                'simple'
            );

            expect(result.type).toBe('text/csv');
            expect(result.filename).toContain('simple');
            expect(result.content).toContain('Player Name');
        });

        test('should export as analytics CSV', async () => {
            const result = await resultsService.exportResults(
                'results_123456_1704067200000.json',
                'csv',
                'analytics'
            );

            expect(result.type).toBe('text/csv');
            expect(result.filename).toContain('analytics');
            expect(result.content).toContain('Success Rate');
        });

        test('should reject invalid format', async () => {
            await expect(resultsService.exportResults(
                'results_123456_1704067200000.json',
                'xml'
            )).rejects.toThrow('Unsupported export format');
        });

        test('should reject invalid export type', async () => {
            await expect(resultsService.exportResults(
                'results_123456_1704067200000.json',
                'csv',
                'invalid'
            )).rejects.toThrow('Invalid export type');
        });
    });

    describe('CSV sanitization', () => {
        test('should sanitize values with formula characters', () => {
            expect(resultsService._sanitizeCsvValue('=FORMULA')).toBe('"\'=FORMULA"');
            expect(resultsService._sanitizeCsvValue('+FORMULA')).toBe('"\'+FORMULA"');
            expect(resultsService._sanitizeCsvValue('-FORMULA')).toBe('"\'-FORMULA"');
            expect(resultsService._sanitizeCsvValue('@FORMULA')).toBe('"\'@FORMULA"');
        });

        test('should escape double quotes', () => {
            expect(resultsService._sanitizeCsvValue('Test "Quote"')).toBe('"Test ""Quote"""');
        });

        test('should remove newlines', () => {
            expect(resultsService._sanitizeCsvValue('Line1\nLine2')).toBe('"Line1 Line2"');
            expect(resultsService._sanitizeCsvValue('Line1\r\nLine2')).toBe('"Line1 Line2"');
        });

        test('should handle null and undefined', () => {
            expect(resultsService._sanitizeCsvValue(null)).toBe('""');
            expect(resultsService._sanitizeCsvValue(undefined)).toBe('""');
        });
    });

    describe('Header name sanitization', () => {
        test('should sanitize formula-like names', () => {
            expect(resultsService._sanitizeHeaderName('=Player')).toBe("'=Player");
            expect(resultsService._sanitizeHeaderName('+Player')).toBe("'+Player");
        });

        test('should escape double quotes in names', () => {
            expect(resultsService._sanitizeHeaderName('Player "1"')).toBe("Player '1'");
        });

        test('should return Anonymous for null/undefined', () => {
            expect(resultsService._sanitizeHeaderName(null)).toBe('Anonymous');
            expect(resultsService._sanitizeHeaderName(undefined)).toBe('Anonymous');
        });
    });
});
