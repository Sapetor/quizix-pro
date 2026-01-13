/**
 * Unit Tests for QuestionTypeService
 * Tests validation and scoring logic for all question types
 */

const { QuestionTypeService } = require('../../services/question-type-service.js');

describe('QuestionTypeService', () => {

    describe('getTypeIds', () => {
        it('should return all supported question types', () => {
            const types = QuestionTypeService.getTypeIds();

            expect(types).toContain('multiple-choice');
            expect(types).toContain('multiple-correct');
            expect(types).toContain('true-false');
            expect(types).toContain('numeric');
            expect(types).toContain('ordering');
            expect(types).toHaveLength(5);
        });
    });

    describe('isValidType', () => {
        it('should return true for valid types', () => {
            expect(QuestionTypeService.isValidType('multiple-choice')).toBe(true);
            expect(QuestionTypeService.isValidType('true-false')).toBe(true);
            expect(QuestionTypeService.isValidType('numeric')).toBe(true);
        });

        it('should return false for invalid types', () => {
            expect(QuestionTypeService.isValidType('invalid')).toBe(false);
            expect(QuestionTypeService.isValidType('')).toBe(false);
            expect(QuestionTypeService.isValidType(null)).toBe(false);
        });
    });

    describe('Multiple Choice Questions', () => {
        describe('validation', () => {
            it('should validate correct multiple choice question', () => {
                const result = QuestionTypeService.validate('multiple-choice', {
                    options: ['A', 'B', 'C', 'D'],
                    correctIndex: 1
                });

                expect(result.valid).toBe(true);
            });

            it('should reject missing options', () => {
                const result = QuestionTypeService.validate('multiple-choice', {
                    correctIndex: 0
                });

                expect(result.valid).toBe(false);
                expect(result.error).toContain('Options');
            });

            it('should reject fewer than 2 options', () => {
                const result = QuestionTypeService.validate('multiple-choice', {
                    options: ['A'],
                    correctIndex: 0
                });

                expect(result.valid).toBe(false);
                expect(result.error).toContain('2 options');
            });

            it('should reject invalid correctIndex', () => {
                const result = QuestionTypeService.validate('multiple-choice', {
                    options: ['A', 'B'],
                    correctIndex: 5
                });

                expect(result.valid).toBe(false);
            });
        });

        describe('scoring', () => {
            it('should return true for correct answer', () => {
                expect(QuestionTypeService.scoreAnswer('multiple-choice', 1, 1)).toBe(true);
                expect(QuestionTypeService.scoreAnswer('multiple-choice', 0, 0)).toBe(true);
            });

            it('should return false for incorrect answer', () => {
                expect(QuestionTypeService.scoreAnswer('multiple-choice', 1, 2)).toBe(false);
                expect(QuestionTypeService.scoreAnswer('multiple-choice', 0, 3)).toBe(false);
            });
        });
    });

    describe('Multiple Correct Questions', () => {
        describe('validation', () => {
            it('should validate correct multiple-correct question', () => {
                const result = QuestionTypeService.validate('multiple-correct', {
                    options: ['A', 'B', 'C', 'D'],
                    correctIndices: [0, 2]
                });

                expect(result.valid).toBe(true);
            });

            it('should reject empty correctIndices', () => {
                const result = QuestionTypeService.validate('multiple-correct', {
                    options: ['A', 'B'],
                    correctIndices: []
                });

                expect(result.valid).toBe(false);
            });

            it('should reject invalid indices', () => {
                const result = QuestionTypeService.validate('multiple-correct', {
                    options: ['A', 'B'],
                    correctIndices: [0, 5]
                });

                expect(result.valid).toBe(false);
            });
        });

        describe('scoring', () => {
            it('should return true when all correct answers selected', () => {
                expect(QuestionTypeService.scoreAnswer('multiple-correct', [0, 2], [0, 2])).toBe(true);
                expect(QuestionTypeService.scoreAnswer('multiple-correct', [2, 0], [0, 2])).toBe(true); // Order doesn't matter
            });

            it('should return false for partial answers', () => {
                expect(QuestionTypeService.scoreAnswer('multiple-correct', [0], [0, 2])).toBe(false);
                expect(QuestionTypeService.scoreAnswer('multiple-correct', [0, 1, 2], [0, 2])).toBe(false);
            });

            it('should return false for completely wrong answers', () => {
                expect(QuestionTypeService.scoreAnswer('multiple-correct', [1, 3], [0, 2])).toBe(false);
            });
        });
    });

    describe('True/False Questions', () => {
        describe('validation', () => {
            it('should validate correct true/false question', () => {
                expect(QuestionTypeService.validate('true-false', { correctAnswer: true }).valid).toBe(true);
                expect(QuestionTypeService.validate('true-false', { correctAnswer: false }).valid).toBe(true);
            });

            it('should reject missing correctAnswer', () => {
                const result = QuestionTypeService.validate('true-false', {});

                expect(result.valid).toBe(false);
            });

            it('should reject non-boolean correctAnswer', () => {
                const result = QuestionTypeService.validate('true-false', { correctAnswer: 'yes' });

                expect(result.valid).toBe(false);
            });
        });

        describe('scoring', () => {
            it('should handle boolean answers', () => {
                expect(QuestionTypeService.scoreAnswer('true-false', true, true)).toBe(true);
                expect(QuestionTypeService.scoreAnswer('true-false', false, false)).toBe(true);
                expect(QuestionTypeService.scoreAnswer('true-false', true, false)).toBe(false);
            });

            it('should normalize string answers', () => {
                expect(QuestionTypeService.scoreAnswer('true-false', 'true', true)).toBe(true);
                expect(QuestionTypeService.scoreAnswer('true-false', 'TRUE', true)).toBe(true);
                expect(QuestionTypeService.scoreAnswer('true-false', 'false', false)).toBe(true);
            });
        });
    });

    describe('Numeric Questions', () => {
        describe('validation', () => {
            it('should validate correct numeric question', () => {
                expect(QuestionTypeService.validate('numeric', { correctAnswer: 42 }).valid).toBe(true);
                expect(QuestionTypeService.validate('numeric', { correctAnswer: 3.14 }).valid).toBe(true);
                expect(QuestionTypeService.validate('numeric', { correctAnswer: 0 }).valid).toBe(true);
            });

            it('should validate numeric question with tolerance', () => {
                const result = QuestionTypeService.validate('numeric', {
                    correctAnswer: 42,
                    tolerance: 0.5
                });

                expect(result.valid).toBe(true);
            });

            it('should reject missing correctAnswer', () => {
                const result = QuestionTypeService.validate('numeric', {});

                expect(result.valid).toBe(false);
            });

            it('should reject negative tolerance', () => {
                const result = QuestionTypeService.validate('numeric', {
                    correctAnswer: 42,
                    tolerance: -1
                });

                expect(result.valid).toBe(false);
            });
        });

        describe('scoring', () => {
            it('should accept exact answers', () => {
                expect(QuestionTypeService.scoreAnswer('numeric', 42, 42)).toBe(true);
                expect(QuestionTypeService.scoreAnswer('numeric', 3.14, 3.14)).toBe(true);
            });

            it('should accept answers within default tolerance', () => {
                // Default tolerance is 0.1
                expect(QuestionTypeService.scoreAnswer('numeric', 42.05, 42)).toBe(true);
                expect(QuestionTypeService.scoreAnswer('numeric', 41.95, 42)).toBe(true);
            });

            it('should reject answers outside tolerance', () => {
                expect(QuestionTypeService.scoreAnswer('numeric', 43, 42)).toBe(false);
                expect(QuestionTypeService.scoreAnswer('numeric', 41, 42)).toBe(false);
            });

            it('should use custom tolerance when provided', () => {
                expect(QuestionTypeService.scoreAnswer('numeric', 43, 42, { tolerance: 1.5 })).toBe(true);
                expect(QuestionTypeService.scoreAnswer('numeric', 44, 42, { tolerance: 1.5 })).toBe(false);
            });

            it('should handle string inputs', () => {
                expect(QuestionTypeService.scoreAnswer('numeric', '42', 42)).toBe(true);
                expect(QuestionTypeService.scoreAnswer('numeric', '42.0', 42)).toBe(true);
            });

            it('should reject non-numeric inputs', () => {
                expect(QuestionTypeService.scoreAnswer('numeric', 'abc', 42)).toBe(false);
                expect(QuestionTypeService.scoreAnswer('numeric', null, 42)).toBe(false);
            });
        });
    });

    describe('Ordering Questions', () => {
        describe('validation', () => {
            it('should validate correct ordering question', () => {
                const result = QuestionTypeService.validate('ordering', {
                    options: ['First', 'Second', 'Third'],
                    correctOrder: [0, 1, 2]
                });

                expect(result.valid).toBe(true);
            });

            it('should reject missing correctOrder', () => {
                const result = QuestionTypeService.validate('ordering', {
                    options: ['A', 'B', 'C']
                });

                expect(result.valid).toBe(false);
            });

            it('should reject mismatched lengths', () => {
                const result = QuestionTypeService.validate('ordering', {
                    options: ['A', 'B', 'C'],
                    correctOrder: [0, 1]
                });

                expect(result.valid).toBe(false);
            });

            it('should reject fewer than 2 options', () => {
                const result = QuestionTypeService.validate('ordering', {
                    options: ['A'],
                    correctOrder: [0]
                });

                expect(result.valid).toBe(false);
            });
        });

        describe('scoring (partial credit)', () => {
            it('should return 1 for perfect order', () => {
                const score = QuestionTypeService.scoreAnswer('ordering', [0, 1, 2], [0, 1, 2]);
                expect(score).toBe(1);
            });

            it('should return partial credit for partially correct', () => {
                // Only middle element is correct (reversed array)
                const score = QuestionTypeService.scoreAnswer('ordering', [2, 1, 0], [0, 1, 2]);
                expect(score).toBeCloseTo(1/3, 2);
            });

            it('should calculate partial credit correctly', () => {
                // 2 out of 4 correct positions
                const score = QuestionTypeService.scoreAnswer('ordering', [0, 2, 1, 3], [0, 1, 2, 3]);
                expect(score).toBe(0.5);
            });

            it('should return 0 for mismatched lengths', () => {
                expect(QuestionTypeService.scoreAnswer('ordering', [0, 1], [0, 1, 2])).toBe(0);
                expect(QuestionTypeService.scoreAnswer('ordering', [0, 1, 2, 3], [0, 1, 2])).toBe(0);
            });

            it('should return 0 for invalid inputs', () => {
                expect(QuestionTypeService.scoreAnswer('ordering', null, [0, 1, 2])).toBe(0);
                expect(QuestionTypeService.scoreAnswer('ordering', [0, 1, 2], null)).toBe(0);
            });
        });
    });

    describe('Error Handling', () => {
        it('should fall back to multiple-choice for unknown types', () => {
            // Should not throw, should use fallback
            const result = QuestionTypeService.validate('unknown-type', {
                options: ['A', 'B'],
                correctIndex: 0
            });

            expect(result.valid).toBe(true);
        });

        it('should handle scoring errors gracefully', () => {
            // Should return false instead of throwing
            const result = QuestionTypeService.scoreAnswer('multiple-choice', undefined, 0);
            expect(result).toBe(false);
        });
    });
});
