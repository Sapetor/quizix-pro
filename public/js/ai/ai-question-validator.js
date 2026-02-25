/**
 * AI Question Validator
 * Validates and parses AI-generated question data
 * Extracted from generator.js for modularity and testability
 */

import { logger } from '../core/config.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';

export class AIQuestionValidator {
    constructor() {
        this.requestedQuestionCount = 1;
    }

    /**
     * Set the expected number of questions
     * @param {number} count - Expected question count
     */
    setRequestedCount(count) {
        this.requestedQuestionCount = count || 1;
    }

    /**
     * Parse AI response text and extract questions
     * @param {string} responseText - Raw response from AI
     * @returns {Array} Array of question objects
     */
    parseAIResponse(responseText) {
        logger.debug('ParseAIResponse - Raw response length:', responseText.length);
        logger.debug('ParseAIResponse - Raw response preview:', responseText.substring(0, 200) + '...');

        try {
            let cleanText = responseText.trim();

            // Remove common code comments
            cleanText = cleanText.replace(/^\/\/[^\n]*\n?/gm, ''); // // comments
            cleanText = cleanText.replace(/^\/\*[\s\S]*?\*\/\n?/gm, ''); // /* */ comments
            cleanText = cleanText.replace(/^#[^\n]*\n?/gm, ''); // # comments
            cleanText = cleanText.replace(/^<!--[\s\S]*?-->\n?/gm, ''); // HTML comments

            // Remove explanation text before JSON
            const explanationPatterns = [
                /^Here's?\s+(?:the|a)\s+JSON.*?:\s*/i,
                /^(?:Here\s+is|This\s+is)\s+.*?:\s*/i,
                /^(?:Based\s+on|From)\s+.*?:\s*/i,
                /^(?:The\s+)?(?:JSON|Array)\s+(?:response|output)\s*:?\s*/i,
                /^(?:Generated\s+)?(?:Questions?|Quiz)\s*:?\s*/i
            ];

            for (const pattern of explanationPatterns) {
                cleanText = cleanText.replace(pattern, '');
            }

            cleanText = cleanText.trim();

            // Detect code-only responses (common with code models)
            const codePatterns = /^(from\s+\w+\s+import|import\s+\w+|def\s+\w+|class\s+\w+|function\s+\w+|var\s+\w+|const\s+\w+|let\s+\w+)/m;
            if (codePatterns.test(cleanText) && !cleanText.includes('[') && !cleanText.includes('{')) {
                throw new Error('Code models like CodeLlama are designed for code generation, not quiz creation. Please use a general model like llama3.2 instead.');
            }

            // Extract JSON from markdown code blocks
            const jsonMatch = cleanText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
            if (jsonMatch) {
                cleanText = jsonMatch[1];
                logger.debug('ParseAIResponse - Extracted from code block');
            }

            // Extract JSON array from text
            const arrayMatch = cleanText.match(/\[[\s\S]*\]/);
            if (arrayMatch && !jsonMatch) {
                cleanText = arrayMatch[0];
                logger.debug('ParseAIResponse - Extracted JSON array from text');
            }

            // Get just the JSON array portion
            const startBracket = cleanText.indexOf('[');
            const endBracket = cleanText.lastIndexOf(']');
            if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
                cleanText = cleanText.substring(startBracket, endBracket + 1);
            }

            // Fix common JSON issues
            cleanText = this.fixCommonJsonIssues(cleanText);

            logger.debug('ParseAIResponse - Clean text for parsing:', cleanText.substring(0, 300) + '...');

            // Parse JSON
            const parsed = JSON.parse(cleanText);
            logger.debug('ParseAIResponse - JSON parsed successfully');

            // Handle both single object and array
            let questions = Array.isArray(parsed) ? parsed : [parsed];
            logger.debug('ParseAIResponse - Questions count:', questions.length);

            // Limit to requested count
            if (questions.length > this.requestedQuestionCount) {
                logger.debug('ParseAIResponse - Truncating from', questions.length, 'to', this.requestedQuestionCount);
                questions = questions.slice(0, this.requestedQuestionCount);
            }

            return questions;

        } catch (error) {
            logger.error('ParseAIResponse - JSON parsing failed:', error);

            // Try manual extraction
            try {
                const manualQuestions = this.extractQuestionsManually(responseText);
                logger.debug('ParseAIResponse - Manual extraction succeeded, count:', manualQuestions.length);
                return manualQuestions;
            } catch (manualError) {
                logger.error('ParseAIResponse - Manual extraction also failed:', manualError);
                throw new Error(`Invalid JSON response from AI provider. Response: ${responseText.substring(0, 100)}...`);
            }
        }
    }

    /**
     * Fix common JSON issues in AI responses
     * @param {string} jsonText - Raw JSON text
     * @returns {string} Fixed JSON text
     */
    fixCommonJsonIssues(jsonText) {
        let fixed = jsonText;

        // Fix trailing commas
        fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

        // Check for single-quote delimiters
        const usesSingleQuoteDelimiters = /:\s*'[^']*'|,\s*'[^']*'|\[\s*'[^']*'/.test(fixed) &&
                                           !/"[^"]*'[^"]*"/.test(fixed);

        if (usesSingleQuoteDelimiters) {
            fixed = fixed.replace(/:\s*'/g, ': "');
            fixed = fixed.replace(/'\s*,/g, '",');
            fixed = fixed.replace(/'\s*}/g, '"}');
            fixed = fixed.replace(/'\s*]/g, '"]');
            fixed = fixed.replace(/\[\s*'/g, '["');
            fixed = fixed.replace(/,\s*'/g, ',"');
            logger.debug('Fixed single-quote JSON delimiters');
        }

        // Fix missing quotes around property names
        fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

        // Fix incomplete JSON
        if (fixed.includes('[') && !fixed.endsWith(']')) {
            logger.debug('Detected incomplete JSON, attempting to fix');

            const openBrackets = (fixed.match(/\[/g) || []).length;
            const closeBrackets = (fixed.match(/\]/g) || []).length;
            const openBraces = (fixed.match(/\{/g) || []).length;
            const closeBraces = (fixed.match(/\}/g) || []).length;

            if (openBrackets > closeBrackets || openBraces > closeBraces) {
                // Extract complete question objects
                const completeObjectPattern = /\{[^}]*"question"[^}]*"type"[^}]*\}/g;
                const completeObjects = fixed.match(completeObjectPattern) || [];

                if (completeObjects.length > 0) {
                    fixed = '[' + completeObjects.join(',') + ']';
                    logger.debug(`Extracted ${completeObjects.length} complete question objects from truncated JSON`);
                } else {
                    // Fallback: close unclosed brackets
                    const lastCompleteProperty = Math.max(
                        fixed.lastIndexOf('"}'),
                        fixed.lastIndexOf('"]'),
                        fixed.lastIndexOf('}')
                    );

                    if (lastCompleteProperty !== -1) {
                        const textBeforeEnd = fixed.substring(0, lastCompleteProperty + 2);
                        const unclosedBraces = (textBeforeEnd.match(/\{/g) || []).length -
                                              (textBeforeEnd.match(/\}/g) || []).length;
                        const unclosedBrackets = (textBeforeEnd.match(/\[/g) || []).length -
                                                (textBeforeEnd.match(/\]/g) || []).length;

                        fixed = textBeforeEnd + '}'.repeat(Math.max(0, unclosedBraces)) +
                                               ']'.repeat(Math.max(0, unclosedBrackets));
                        logger.debug('Fixed incomplete JSON by closing unclosed braces and brackets');
                    }
                }
            }
        }

        logger.debug('Applied JSON fixes, length changed from', jsonText.length, 'to', fixed.length);
        return fixed;
    }

    /**
     * Extract questions manually when JSON parsing fails
     * @param {string} responseText - Raw response text
     * @returns {Array} Array of question objects
     */
    extractQuestionsManually(responseText) {
        logger.debug('Manual extraction attempting to find questions in text');

        // Try to extract individual JSON objects
        const jsonObjectPattern = /\{[\s\S]*?"question"\s*:\s*"[^"]*?"[\s\S]*?"type"\s*:\s*"[^"]*?"[\s\S]*?\}/g;
        const jsonObjects = responseText.match(jsonObjectPattern);

        if (jsonObjects && jsonObjects.length > 0) {
            logger.debug(`Found ${jsonObjects.length} JSON-like objects, attempting to parse each`);
            const questions = [];

            for (const objText of jsonObjects) {
                errorHandler.safeExecute(
                    () => {
                        let fixedObj = objText;
                        fixedObj = fixedObj.replace(/,(\s*\})/g, '$1');
                        fixedObj = fixedObj.replace(/'/g, '"');

                        const parsed = JSON.parse(fixedObj);

                        if (parsed.question && parsed.type) {
                            questions.push(parsed);
                            logger.debug('Successfully parsed JSON object:', parsed.question.substring(0, 50) + '...');
                        }
                    },
                    { operation: 'parse-individual-json-object' }
                );
            }

            if (questions.length > 0) {
                const limited = questions.slice(0, this.requestedQuestionCount);
                logger.debug(`Manual extraction successful: found ${limited.length} valid questions`);
                return limited;
            }
        }

        // Fallback: pattern matching for text format
        logger.debug('Attempting text pattern matching fallback');
        const questionPattern = /(?:question|q\d+)[:\s]*(.+?)(?:options?|choices?)[:\s]*(.+?)(?:answer|correct)[:\s]*(.+?)(?=(?:question|q\d+|$))/gis;
        const matches = [...responseText.matchAll(questionPattern)];

        if (matches.length > 0) {
            const questions = matches.map(match => {
                const question = match[1].trim();
                const optionsText = match[2].trim();
                const answerText = match[3].trim();

                // Extract options (A, B, C, D format)
                const optionMatches = optionsText.match(/[A-D][.)]\s*([^A-D]+)/gi) || [];
                const options = optionMatches.map(opt => opt.replace(/^[A-D][.)]\s*/i, '').trim());

                // Determine correct answer
                let correctAnswer = 0;
                const answerMatch = answerText.match(/[A-D]/i);
                if (answerMatch) {
                    correctAnswer = answerMatch[0].toUpperCase().charCodeAt(0) - 65;
                }

                return {
                    question: question,
                    type: 'multiple_choice',
                    options: options.length >= 2 ? options : ['Option A', 'Option B', 'Option C', 'Option D'],
                    correctAnswer: correctAnswer,
                    difficulty: 'medium'
                };
            });

            return questions.slice(0, this.requestedQuestionCount);
        }

        throw new Error('Could not extract questions from AI response');
    }

    /**
     * Validate a generated question object
     * @param {Object} question - Question to validate
     * @returns {Object} Validation result with isValid and errors
     */
    validateQuestion(question) {
        const errors = [];

        // Check required fields
        if (!question.question || typeof question.question !== 'string') {
            errors.push('Missing or invalid question text');
        }

        if (!question.type || typeof question.type !== 'string') {
            errors.push('Missing or invalid question type');
        }

        // Type-specific validation
        const type = question.type;

        if (type === 'multiple_choice' || type === 'multiple_correct') {
            if (!Array.isArray(question.options) || question.options.length < 2) {
                errors.push('Multiple choice questions need at least 2 options');
            }

            if (type === 'multiple_choice') {
                if (typeof question.correctAnswer !== 'number' || question.correctAnswer < 0) {
                    errors.push('Multiple choice needs a valid correctAnswer index');
                } else if (question.options && question.correctAnswer >= question.options.length) {
                    errors.push('correctAnswer index out of bounds');
                }
            }

            if (type === 'multiple_correct') {
                if (!Array.isArray(question.correctAnswers) || question.correctAnswers.length === 0) {
                    errors.push('Multiple correct needs a correctAnswers array');
                }
            }
        }

        if (type === 'true_false') {
            if (typeof question.correctAnswer !== 'boolean' &&
                question.correctAnswer !== 'true' &&
                question.correctAnswer !== 'false' &&
                question.correctAnswer !== 0 &&
                question.correctAnswer !== 1) {
                errors.push('True/false needs a boolean correctAnswer');
            }
        }

        if (type === 'numeric') {
            if (question.correctAnswer === undefined || question.correctAnswer === null) {
                errors.push('Numeric questions need a correctAnswer value');
            }
        }

        if (type === 'ordering') {
            if (!Array.isArray(question.items) || question.items.length < 2) {
                errors.push('Ordering questions need at least 2 items');
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Auto-fix common question issues
     * @param {Object} question - Question to fix
     * @returns {Object} Fixed question
     */
    autoFixQuestion(question) {
        const fixed = { ...question };

        // Normalize type
        if (fixed.type) {
            fixed.type = fixed.type.toLowerCase().replace(/\s+/g, '_');
        }

        // Fix correctAnswer for multiple choice
        if (fixed.type === 'multiple_choice' && typeof fixed.correctAnswer === 'string') {
            // Convert letter to index
            const match = fixed.correctAnswer.match(/[A-D]/i);
            if (match) {
                fixed.correctAnswer = match[0].toUpperCase().charCodeAt(0) - 65;
            }
        }

        // Fix correctAnswer for true/false
        if (fixed.type === 'true_false') {
            if (fixed.correctAnswer === 'true' || fixed.correctAnswer === 1) {
                fixed.correctAnswer = true;
            } else if (fixed.correctAnswer === 'false' || fixed.correctAnswer === 0) {
                fixed.correctAnswer = false;
            }
        }

        // Ensure difficulty exists
        if (!fixed.difficulty) {
            fixed.difficulty = 'medium';
        }

        // Normalize difficulty
        const validDifficulties = ['easy', 'medium', 'hard'];
        if (!validDifficulties.includes(fixed.difficulty.toLowerCase())) {
            fixed.difficulty = 'medium';
        } else {
            fixed.difficulty = fixed.difficulty.toLowerCase();
        }

        return fixed;
    }
}

// Export singleton instance
export const aiQuestionValidator = new AIQuestionValidator();
