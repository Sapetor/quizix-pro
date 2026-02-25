/**
 * Unit Tests for Validation Schemas
 * Tests Zod schemas for API and Socket event validation
 */

const {
    questionSchema,
    saveQuizSchema,
    joinGameSchema,
    submitAnswerSchema,
    validateSocketEvent,
    hostJoinSchema,
    playerJoinSchema,
    socketSubmitAnswerSchema
} = require('../../services/validation-schemas.js');

describe('Validation Schemas', () => {

    describe('Question Schema', () => {
        describe('multiple-choice', () => {
            it('should validate a correct multiple-choice question', () => {
                const question = {
                    type: 'multiple-choice',
                    question: 'What is 2 + 2?',
                    options: ['3', '4', '5', '6'],
                    correctIndex: 1
                };

                const result = questionSchema.safeParse(question);
                expect(result.success).toBe(true);
            });

            it('should reject missing question text', () => {
                const question = {
                    type: 'multiple-choice',
                    options: ['A', 'B'],
                    correctIndex: 0
                };

                const result = questionSchema.safeParse(question);
                expect(result.success).toBe(false);
            });

            it('should reject fewer than 2 options', () => {
                const question = {
                    type: 'multiple-choice',
                    question: 'Test?',
                    options: ['Only one'],
                    correctIndex: 0
                };

                const result = questionSchema.safeParse(question);
                expect(result.success).toBe(false);
            });
        });

        describe('true-false', () => {
            it('should validate true answer', () => {
                const question = {
                    type: 'true-false',
                    question: 'Is the sky blue?',
                    correctAnswer: true
                };

                const result = questionSchema.safeParse(question);
                expect(result.success).toBe(true);
            });

            it('should validate false answer', () => {
                const question = {
                    type: 'true-false',
                    question: 'Is the sky green?',
                    correctAnswer: false
                };

                const result = questionSchema.safeParse(question);
                expect(result.success).toBe(true);
            });
        });

        describe('numeric', () => {
            it('should validate numeric question with tolerance', () => {
                const question = {
                    type: 'numeric',
                    question: 'What is pi (to 2 decimal places)?',
                    correctAnswer: 3.14,
                    tolerance: 0.01
                };

                const result = questionSchema.safeParse(question);
                expect(result.success).toBe(true);
            });

            it('should use default tolerance when not specified', () => {
                const question = {
                    type: 'numeric',
                    question: 'What is 10 * 10?',
                    correctAnswer: 100
                };

                const result = questionSchema.safeParse(question);
                expect(result.success).toBe(true);
                expect(result.data.tolerance).toBeDefined();
            });
        });

        describe('ordering', () => {
            it('should validate ordering question', () => {
                const question = {
                    type: 'ordering',
                    question: 'Order from smallest to largest',
                    options: ['Small', 'Medium', 'Large'],
                    correctOrder: [0, 1, 2]
                };

                const result = questionSchema.safeParse(question);
                expect(result.success).toBe(true);
            });
        });
    });

    describe('Save Quiz Schema', () => {
        it('should validate a complete quiz', () => {
            const quiz = {
                title: 'Test Quiz',
                questions: [
                    {
                        type: 'multiple-choice',
                        question: 'What is 1 + 1?',
                        options: ['1', '2', '3'],
                        correctIndex: 1
                    }
                ]
            };

            const result = saveQuizSchema.safeParse(quiz);
            expect(result.success).toBe(true);
        });

        it('should reject empty title', () => {
            const quiz = {
                title: '',
                questions: [
                    {
                        type: 'multiple-choice',
                        question: 'Test?',
                        options: ['A', 'B'],
                        correctIndex: 0
                    }
                ]
            };

            const result = saveQuizSchema.safeParse(quiz);
            expect(result.success).toBe(false);
        });

        it('should reject quiz with no questions', () => {
            const quiz = {
                title: 'Empty Quiz',
                questions: []
            };

            const result = saveQuizSchema.safeParse(quiz);
            expect(result.success).toBe(false);
        });
    });

    describe('Join Game Schema', () => {
        it('should validate valid join data', () => {
            const data = {
                pin: '123456',
                playerName: 'TestPlayer'
            };

            const result = joinGameSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('should reject invalid PIN format', () => {
            const invalidPins = ['12345', '1234567', 'abcdef', ''];

            invalidPins.forEach(pin => {
                const result = joinGameSchema.safeParse({ pin, playerName: 'Test' });
                expect(result.success).toBe(false);
            });
        });

        it('should reject empty player name', () => {
            const result = joinGameSchema.safeParse({ pin: '123456', playerName: '' });
            expect(result.success).toBe(false);
        });

        it('should reject overly long player names', () => {
            const result = joinGameSchema.safeParse({
                pin: '123456',
                playerName: 'A'.repeat(100)
            });
            expect(result.success).toBe(false);
        });
    });

    describe('Submit Answer Schema', () => {
        it('should validate numeric answer', () => {
            const result = submitAnswerSchema.safeParse({ answer: 42 });
            expect(result.success).toBe(true);
        });

        it('should validate boolean answer', () => {
            const result = submitAnswerSchema.safeParse({ answer: true });
            expect(result.success).toBe(true);
        });

        it('should validate string answer', () => {
            const result = submitAnswerSchema.safeParse({ answer: 'Option A' });
            expect(result.success).toBe(true);
        });

        it('should validate array answer (for ordering)', () => {
            const result = submitAnswerSchema.safeParse({ answer: [0, 2, 1, 3] });
            expect(result.success).toBe(true);
        });
    });
});

describe('Socket Event Validation', () => {

    describe('validateSocketEvent', () => {
        describe('host-join event', () => {
            it('should validate valid host-join data', () => {
                const data = {
                    quiz: {
                        title: 'Test Quiz',
                        questions: [
                            {
                                type: 'multiple-choice',
                                question: 'Test?',
                                options: ['A', 'B'],
                                correctIndex: 0
                            }
                        ]
                    }
                };

                const result = validateSocketEvent('host-join', data);
                expect(result.valid).toBe(true);
            });

            it('should reject host-join without quiz title', () => {
                const data = {
                    quiz: {
                        title: '',
                        questions: []
                    }
                };

                const result = validateSocketEvent('host-join', data);
                expect(result.valid).toBe(false);
            });
        });

        describe('player-join event', () => {
            it('should validate valid player-join data', () => {
                const data = {
                    pin: '123456',
                    playerName: 'TestPlayer'
                };

                const result = validateSocketEvent('player-join', data);
                expect(result.valid).toBe(true);
            });

            it('should reject invalid PIN', () => {
                const result = validateSocketEvent('player-join', {
                    pin: 'invalid',
                    playerName: 'Test'
                });
                expect(result.valid).toBe(false);
            });
        });

        describe('submit-answer event', () => {
            it('should validate numeric answer submission', () => {
                const result = validateSocketEvent('submit-answer', {
                    pin: '123456',
                    answer: 1
                });
                expect(result.valid).toBe(true);
            });

            it('should validate array answer submission', () => {
                const result = validateSocketEvent('submit-answer', {
                    pin: '123456',
                    answer: [0, 2, 1]
                });
                expect(result.valid).toBe(true);
            });

            it('should validate boolean answer submission', () => {
                const result = validateSocketEvent('submit-answer', {
                    pin: '123456',
                    answer: true
                });
                expect(result.valid).toBe(true);
            });
        });

        describe('unknown events', () => {
            it('should pass through unknown events', () => {
                const result = validateSocketEvent('unknown-event', { any: 'data' });
                expect(result.valid).toBe(true);
                expect(result.data).toEqual({ any: 'data' });
            });
        });
    });
});
