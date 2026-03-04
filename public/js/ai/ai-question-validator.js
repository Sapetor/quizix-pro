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

            // Strip thinking model output (Qwen 3.x, QwQ, etc. wrap reasoning in <think> tags)
            cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

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

            // Try parsing as-is first — properly escaped JSON (Gemini 3, Claude, OpenAI)
            // will parse cleanly. Only apply fixCommonJsonIssues as fallback, because
            // its LaTeX escape fixer double-escapes already-escaped backslashes.
            let parsed;
            try {
                parsed = JSON.parse(cleanText);
                logger.debug('ParseAIResponse - JSON parsed on first try (no fixes needed)');
            } catch (_firstError) {
                logger.debug('ParseAIResponse - First parse failed, applying JSON fixes');
                cleanText = this.fixCommonJsonIssues(cleanText);
                logger.debug('ParseAIResponse - Clean text for parsing:', cleanText.substring(0, 300) + '...');
                parsed = JSON.parse(cleanText);
            }
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

        // Fix LaTeX commands that collide with JSON escape sequences:
        // \b(ar), \f(rac), \n(eq), \r(ight), \t(ext) — when followed by a letter,
        // these are LaTeX, not JSON control characters. Double-escape them first.
        fixed = fixed.replace(/\\([bfnrt])(?=[a-zA-Z])/g, '\\\\$1');

        // Fix invalid JSON escape sequences (common with LaTeX like \frac, \int, \sqrt)
        // Valid JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
        // Replace invalid \X sequences with \\X (double-escape for JSON)
        fixed = fixed.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

        // Fix missing quotes around property names
        fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

        // Fix incomplete JSON (truncated response from MAX_TOKENS etc.)
        if (fixed.includes('[') && !fixed.endsWith(']')) {
            logger.debug('Detected incomplete JSON, attempting to fix');

            const openBrackets = (fixed.match(/\[/g) || []).length;
            const closeBrackets = (fixed.match(/\]/g) || []).length;
            const openBraces = (fixed.match(/\{/g) || []).length;
            const closeBraces = (fixed.match(/\}/g) || []).length;

            if (openBrackets > closeBrackets || openBraces > closeBraces) {
                // Extract complete question objects using brace-depth tracking
                // (the old regex [^}]* can't handle nested arrays/objects in options)
                const completeObjects = this.extractCompleteObjects(fixed);

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
     * Extract complete top-level JSON objects from a (possibly truncated) string.
     * Uses brace-depth tracking so nested arrays/objects (e.g. options) are handled.
     * Only returns objects that contain both "question" and "type" keys.
     * @param {string} text - Raw JSON text (may be truncated)
     * @returns {string[]} Array of complete JSON object strings
     */
    extractCompleteObjects(text) {
        const objects = [];
        let depth = 0;
        let inString = false;
        let escape = false;
        let start = -1;

        // If text is wrapped in [...], question objects live at depth 1.
        // If text is bare {}{}, they live at depth 0.
        const isArray = text.trimStart()[0] === '[';
        const objectDepth = isArray ? 1 : 0;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (escape) { escape = false; continue; }
            if (ch === '\\' && inString) { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;

            if (ch === '{' || ch === '[') {
                if (ch === '{' && depth === objectDepth && start === -1) {
                    start = i;
                }
                depth++;
            } else if (ch === '}' || ch === ']') {
                depth--;
                if (ch === '}' && depth === objectDepth && start !== -1) {
                    const obj = text.substring(start, i + 1);
                    if (obj.includes('"question"') && obj.includes('"type"')) {
                        objects.push(obj);
                    }
                    start = -1;
                }
            }
        }

        return objects;
    }

    /**
     * Extract questions manually when JSON parsing fails
     * @param {string} responseText - Raw response text
     * @returns {Array} Array of question objects
     */
    extractQuestionsManually(responseText) {
        logger.debug('Manual extraction attempting to find questions in text');

        // Try to extract individual JSON objects using brace-depth tracking
        const jsonObjects = this.extractCompleteObjects(responseText);

        if (jsonObjects.length > 0) {
            logger.debug(`Found ${jsonObjects.length} JSON-like objects, attempting to parse each`);
            const questions = [];

            for (const objText of jsonObjects) {
                errorHandler.safeExecute(
                    () => {
                        let fixedObj = this.fixCommonJsonIssues(objText);
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
     * Consolidated validate-and-fix for a single AI-generated question.
     * Replaces both the inline preview validation and validateGeneratedQuestion().
     * @param {Object} question - Raw question from AI
     * @returns {{ valid: boolean, question: Object, issues: string[] }}
     */
    validateAndFixQuestion(question) {
        const issues = [];

        // 1. Null / missing basic fields
        if (!question) return { valid: false, question, issues: ['question is null/undefined'] };
        if (!question.question) issues.push('missing "question" text');
        if (!question.type) issues.push('missing "type"');
        if (issues.length > 0) return { valid: false, question, issues };

        // 2. Normalize type: lowercase, underscores/spaces → hyphens
        question.type = question.type.toLowerCase().replace(/[\s_]+/g, '-');

        // 3. Type-specific validation & auto-fix
        switch (question.type) {
            case 'multiple-choice': {
                // Letter correctAnswer ("A"-"F") → index
                if (typeof question.correctAnswer === 'string' && /^[A-Fa-f]$/.test(question.correctAnswer)) {
                    question.correctAnswer = question.correctAnswer.toUpperCase().charCodeAt(0) - 65;
                }

                // Ensure options is an array
                if (!Array.isArray(question.options)) {
                    issues.push('missing or invalid "options" array');
                    break;
                }

                // Pad options to 4 with generic distractors if < 4
                if (question.options.length < 4) {
                    const genericDistractors = [
                        'None of the above', 'All of the above', 'Not applicable',
                        'Cannot be determined', 'Not mentioned in the content', 'More information needed'
                    ];
                    while (question.options.length < 4) {
                        const distractor = genericDistractors.find(d => !question.options.includes(d))
                            || `Option ${question.options.length + 1}`;
                        question.options.push(distractor);
                    }
                }

                // Truncate to 4 if > 4
                if (question.options.length > 4) {
                    question.options = question.options.slice(0, 4);
                    if (typeof question.correctAnswer === 'number' && question.correctAnswer >= 4) {
                        question.correctAnswer = 0;
                    }
                }

                // Validate correctAnswer is integer 0-3 and in bounds
                if (typeof question.correctAnswer !== 'number' || !Number.isInteger(question.correctAnswer) ||
                    question.correctAnswer < 0 || question.correctAnswer >= question.options.length) {
                    issues.push('invalid correctAnswer for multiple-choice');
                }
                break;
            }

            case 'true-false': {
                // Ensure options = ["True", "False"]
                question.options = ['True', 'False'];

                // Normalize correctAnswer: boolean/number/letter → string "true"/"false"
                const ca = question.correctAnswer;
                if (ca === true || ca === 1 || ca === '1') {
                    question.correctAnswer = 'true';
                } else if (ca === false || ca === 0 || ca === '0') {
                    question.correctAnswer = 'false';
                } else if (typeof ca === 'string') {
                    const lower = ca.toLowerCase();
                    if (lower === 'a' || lower === 'true') {
                        question.correctAnswer = 'true';
                    } else if (lower === 'b' || lower === 'false') {
                        question.correctAnswer = 'false';
                    }
                }

                if (question.correctAnswer !== 'true' && question.correctAnswer !== 'false') {
                    issues.push('invalid correctAnswer for true-false');
                }
                break;
            }

            case 'multiple-correct': {
                // Convert correctAnswer → correctAnswers if needed
                if (question.correctAnswer !== undefined && !question.correctAnswers) {
                    question.correctAnswers = Array.isArray(question.correctAnswer)
                        ? question.correctAnswer : [question.correctAnswer];
                    delete question.correctAnswer;
                }

                if (!Array.isArray(question.options) || question.options.length === 0) {
                    issues.push('missing or empty options for multiple-correct');
                    break;
                }

                if (!Array.isArray(question.correctAnswers) || question.correctAnswers.length === 0) {
                    issues.push('missing or empty correctAnswers for multiple-correct');
                    break;
                }

                // Letter answers → indices
                if (typeof question.correctAnswers[0] === 'string' && /^[A-Fa-f]$/.test(question.correctAnswers[0])) {
                    question.correctAnswers = question.correctAnswers.map(
                        letter => letter.toUpperCase().charCodeAt(0) - 65
                    );
                }

                // Validate all indices in bounds
                const outOfBounds = question.correctAnswers.filter(
                    idx => typeof idx !== 'number' || idx < 0 || idx >= question.options.length
                );
                if (outOfBounds.length > 0) {
                    issues.push('correctAnswers contains out-of-bounds indices');
                }
                break;
            }

            case 'numeric': {
                // Delete stray options
                if (question.options) delete question.options;

                // String correctAnswer → parseFloat
                if (typeof question.correctAnswer === 'string' && !isNaN(question.correctAnswer)) {
                    question.correctAnswer = parseFloat(question.correctAnswer);
                }

                // Default tolerance
                if (question.tolerance === undefined) question.tolerance = 0;

                // Require finite number
                if (question.correctAnswer === undefined || typeof question.correctAnswer !== 'number' ||
                    !isFinite(question.correctAnswer)) {
                    issues.push('invalid or missing correctAnswer for numeric');
                }
                break;
            }

            case 'ordering': {
                if (!Array.isArray(question.options) || question.options.length < 2) {
                    issues.push('ordering requires at least 2 options');
                    break;
                }

                if (!Array.isArray(question.correctOrder) ||
                    question.correctOrder.length !== question.options.length) {
                    // AI listed options in correct order and omitted correctOrder.
                    // Generate identity mapping — options stay in correct order for the editor.
                    // The player renderer (renderPlayerOptions) shuffles independently.
                    question.correctOrder = question.options.map((_, i) => i);
                    break;
                }

                // Validate existing correctOrder is a valid permutation
                const n = question.options.length;
                const seen = new Set();
                let allValid = true;
                for (const idx of question.correctOrder) {
                    if (typeof idx !== 'number' || idx < 0 || idx >= n || seen.has(idx)) {
                        allValid = false;
                        break;
                    }
                    seen.add(idx);
                }
                if (!allValid) {
                    issues.push('correctOrder must be a valid permutation (unique indices 0 to N-1)');
                }
                break;
            }

            default:
                issues.push(`unknown question type: ${question.type}`);
                break;
        }

        // Defaults for missing metadata
        if (!question.difficulty) question.difficulty = 'medium';
        const validDifficulties = ['easy', 'medium', 'hard'];
        if (!validDifficulties.includes(question.difficulty.toLowerCase())) {
            question.difficulty = 'medium';
        } else {
            question.difficulty = question.difficulty.toLowerCase();
        }
        if (!question.timeLimit) question.timeLimit = 30;

        return { valid: issues.length === 0, question, issues };
    }
    /**
     * Check if a question's text complies with expected formatting.
     * Returns an array of warning strings (empty = compliant).
     * @param {Object} question - Validated question
     * @param {Object|null} contentInfo - Content detection result
     * @returns {string[]} Warning messages
     */
    checkFormattingCompliance(question, contentInfo) {
        if (!contentInfo || !question) return [];

        const warnings = [];
        // Collect all text fields to check
        const textFields = [
            question.question,
            ...(question.options || []),
            question.explanation || ''
        ].join(' ');

        if (contentInfo.needsLatex) {
            const hasLatex = /\$[^$]+\$/.test(textFields);
            if (!hasLatex) {
                warnings.push('Missing LaTeX formatting');
            }
        }

        if (contentInfo.needsCodeBlocks) {
            const hasCode = /```[\s\S]*?```/.test(textFields) || /`[^`]+`/.test(textFields);
            if (!hasCode) {
                warnings.push('Missing code formatting');
            }
        }

        return warnings;
    }
}

// Export singleton instance
export const aiQuestionValidator = new AIQuestionValidator();
