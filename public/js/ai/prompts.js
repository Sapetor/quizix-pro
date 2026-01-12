/**
 * AI Prompt Templates Module
 * Centralized prompt templates for AI question generation
 *
 * Extracted from generator.js for maintainability
 */

import { translationManager } from '../utils/translation-manager.js';
import { LANGUAGES } from '../core/config.js';

// ============================================================================
// Constants
// ============================================================================

// Language name mappings (using centralized config from core/config.js)
export const LANGUAGE_NAMES = Object.fromEntries(
    LANGUAGES.SUPPORTED_CODES.map(code => [code, LANGUAGES.getEnglishName(code)])
);

export const LANGUAGE_NATIVE_NAMES = Object.fromEntries(
    LANGUAGES.SUPPORTED_CODES.map(code => [code, LANGUAGES.getNativeName(code)])
);

/**
 * JSON structure examples for each question type
 */
export const TYPE_EXAMPLES = {
    'multiple-choice': '{"question": "Question text?", "type": "multiple-choice", "options": ["A", "B", "C", "D"], "correctAnswer": 0, "timeLimit": 30, "explanation": "Why A is correct", "difficulty": "medium"}',
    'true-false': '{"question": "Statement to verify.", "type": "true-false", "options": ["True", "False"], "correctAnswer": "true", "timeLimit": 20, "explanation": "Why true", "difficulty": "easy"}',
    'multiple-correct': '{"question": "Select all that apply:", "type": "multiple-correct", "options": ["A", "B", "C", "D"], "correctAnswers": [0, 2], "timeLimit": 35, "explanation": "A and C are correct", "difficulty": "medium"}',
    'numeric': '{"question": "Calculate the value:", "type": "numeric", "correctAnswer": 42, "tolerance": 0, "timeLimit": 25, "explanation": "The answer is 42", "difficulty": "medium"}',
    'ordering': '{"question": "Arrange in order:", "type": "ordering", "options": ["First", "Second", "Third"], "correctOrder": [0, 1, 2], "timeLimit": 40, "explanation": "Correct sequence", "difficulty": "medium"}'
};

/**
 * Minimal type examples for retry prompts
 */
export const MINIMAL_TYPE_EXAMPLES = {
    'multiple-choice': '{"question":"Q?","type":"multiple-choice","options":["A","B","C","D"],"correctAnswer":0,"timeLimit":30,"difficulty":"medium"}',
    'true-false': '{"question":"Statement.","type":"true-false","options":["True","False"],"correctAnswer":"true","timeLimit":20,"difficulty":"easy"}',
    'multiple-correct': '{"question":"Select all.","type":"multiple-correct","options":["A","B","C","D"],"correctAnswers":[0,2],"timeLimit":35,"difficulty":"medium"}',
    'numeric': '{"question":"Calculate.","type":"numeric","correctAnswer":42,"tolerance":0,"timeLimit":25,"difficulty":"medium"}',
    'ordering': '{"question":"Order these.","type":"ordering","options":["B","A","C"],"correctOrder":[1,0,2],"timeLimit":40,"difficulty":"medium"}'
};

/**
 * Bloom's Taxonomy cognitive level descriptions
 */
export const BLOOM_DESCRIPTIONS = {
    'remember': {
        verbs: ['define', 'list', 'name', 'recall', 'identify', 'recognize', 'state'],
        description: 'Focus on RECALL and RECOGNITION of facts',
        example: 'What is the capital of France?'
    },
    'understand': {
        verbs: ['explain', 'describe', 'summarize', 'interpret', 'classify', 'compare'],
        description: 'Focus on EXPLAINING and INTERPRETING concepts',
        example: 'Why does water boil at 100°C at sea level?'
    },
    'apply': {
        verbs: ['apply', 'demonstrate', 'solve', 'use', 'implement', 'execute'],
        description: 'Focus on USING knowledge in new situations',
        example: 'Calculate the area of a triangle with base 5 and height 8.'
    },
    'analyze': {
        verbs: ['analyze', 'compare', 'contrast', 'differentiate', 'examine', 'investigate'],
        description: 'Focus on BREAKING DOWN information and finding relationships',
        example: 'Compare and contrast mitosis and meiosis.'
    },
    'evaluate': {
        verbs: ['evaluate', 'judge', 'critique', 'justify', 'argue', 'defend'],
        description: 'Focus on MAKING JUDGMENTS based on criteria',
        example: 'Which solution is most effective for reducing carbon emissions and why?'
    },
    'create': {
        verbs: ['create', 'design', 'construct', 'develop', 'formulate', 'propose'],
        description: 'Focus on CREATING new ideas or products',
        example: 'Design an experiment to test plant growth under different light conditions.'
    }
};

// ============================================================================
// Prompt Building Functions
// ============================================================================

/**
 * Build a prompt for regenerating a single question
 * @param {string} type - Question type
 * @param {string} content - Source content
 * @param {string} difficulty - Difficulty level
 * @returns {string} Prompt for single question
 */
export function buildSingleQuestionPrompt(type, content, difficulty) {
    return `Generate exactly ONE ${type} question about this content. Difficulty: ${difficulty}.

CONTENT:
${content.substring(0, 2000)}

OUTPUT FORMAT - Return ONLY valid JSON (no markdown, no explanation):
${TYPE_EXAMPLES[type] || TYPE_EXAMPLES['multiple-choice']}

RULES:
1. Output ONLY the JSON object - start with { and end with }
2. Base the question on the content provided
3. Include all required fields: question, type, options (if applicable), correctAnswer/correctAnswers, timeLimit, explanation, difficulty`;
}

/**
 * Build Bloom's taxonomy instructions based on selected cognitive level
 * @param {string} cognitiveLevel - Cognitive level or 'mixed'
 * @returns {string} Instructions for the prompt
 */
export function buildBloomInstructions(cognitiveLevel) {
    if (cognitiveLevel === 'mixed') {
        return `
COGNITIVE LEVELS (Bloom's Taxonomy):
- Mix questions across different cognitive levels for variety
- Include some recall questions (Remember)
- Include some understanding questions (Understand)
- Include some application questions (Apply)
`;
    }

    const level = BLOOM_DESCRIPTIONS[cognitiveLevel];
    if (!level) return '';

    return `
COGNITIVE LEVEL (Bloom's Taxonomy - ${cognitiveLevel.toUpperCase()}):
- ${level.description}
- Use action verbs like: ${level.verbs.join(', ')}
- Example question style: "${level.example}"
- All questions should target THIS cognitive level
`;
}

/**
 * Build formatting instructions based on content type
 * @param {Object} contentInfo - Content analysis info
 * @returns {string} Formatting instructions
 */
export function buildFormattingInstructions(contentInfo) {
    let instructions = '';

    if (contentInfo.needsLatex) {
        instructions += `
LATEX FORMATTING (IMPORTANT):
- Use LaTeX syntax for ALL mathematical expressions, formulas, and equations
- Inline math: Use $...$ (e.g., "The formula $E = mc^2$ shows..." or "Calculate $\\frac{x+1}{2}$")
- Display math: Use $$...$$ for standalone equations (e.g., "$$\\int_0^\\infty e^{-x} dx = 1$$")
- Common symbols: $\\alpha$, $\\beta$, $\\gamma$, $\\theta$, $\\pi$, $\\sigma$, $\\Delta$, $\\infty$
- Fractions: $\\frac{numerator}{denominator}$
- Square roots: $\\sqrt{x}$ or $\\sqrt[n]{x}$
- Subscripts/superscripts: $x_1$, $x^2$, $x_1^2$
- Summation: $\\sum_{i=1}^{n} x_i$
- Integrals: $\\int_a^b f(x) dx$
- Chemical formulas: $H_2O$, $CO_2$, $C_6H_{12}O_6$
- Use LaTeX in BOTH questions AND answer options where appropriate
`;
    }

    if (contentInfo.needsCodeBlocks) {
        const langHint = contentInfo.language ? `Use \`\`\`${contentInfo.language}\` for code blocks.` : '';
        instructions += `
CODE FORMATTING (IMPORTANT):
- Wrap ALL code snippets in markdown code blocks with language specification
- Format: \`\`\`language
code here
\`\`\`
${langHint}
- Use inline code \`like this\` for short references (variable names, function names, keywords)
- Ensure code is properly indented and formatted
- Include necessary context (imports, function signatures) when relevant
- For code output questions, show both code and expected output
`;
    }

    // Add explanation and wrong answer feedback instructions
    instructions += `
QUESTION QUALITY & FEEDBACK:
- Add an "explanation" field with a BRIEF explanation (1-2 sentences max) of why the correct answer is right
- Add a "difficulty" field with value "easy", "medium", or "hard" based on content complexity
- Add an "optionFeedback" array with SHORT feedback (max 15 words each) for wrong answers explaining WHY incorrect
- For multiple-choice: optionFeedback should have feedback for indices that are NOT the correct answer
- Example: "optionFeedback": [{"index": 1, "feedback": "Incorrect - this describes X not Y"}, {"index": 2, "feedback": "Common misconception"}]
- Keep ALL text concise to ensure complete JSON output
- Ensure questions test understanding, not just memorization
`;

    return instructions;
}

/**
 * Build structure examples based on selected types and content info
 * @param {Array} selectedTypes - Selected question types
 * @param {Object} contentInfo - Content analysis info
 * @returns {Array} Structure examples
 */
export function buildStructureExamples(selectedTypes, contentInfo) {
    const structureExamples = [];

    if (selectedTypes.includes('multiple-choice')) {
        if (contentInfo.needsLatex) {
            structureExamples.push('{"question": "What is the derivative of $f(x) = x^2 + 3x$?", "type": "multiple-choice", "options": ["$2x + 3$", "$x^2 + 3$", "$2x$", "$3x + 2$"], "correctAnswer": 0, "timeLimit": 30, "explanation": "Using power rule: derivative of $x^2$ is $2x$, derivative of $3x$ is $3$", "difficulty": "medium"}');
        } else if (contentInfo.needsCodeBlocks) {
            const lang = contentInfo.language || 'python';
            structureExamples.push(`{"question": "What will this code output?\\n\`\`\`${lang}\\nprint(2 + 3 * 4)\\n\`\`\`", "type": "multiple-choice", "options": ["14", "20", "24", "Error"], "correctAnswer": 0, "timeLimit": 30, "explanation": "Multiplication has higher precedence than addition: 3*4=12, then 2+12=14", "difficulty": "easy"}`);
        } else {
            structureExamples.push('{"question": "Question text here?", "type": "multiple-choice", "options": ["Option A", "Option B", "Option C", "Option D"], "correctAnswer": 0, "timeLimit": 30, "explanation": "Brief explanation of why this answer is correct", "difficulty": "medium"}');
        }
    }

    if (selectedTypes.includes('true-false')) {
        if (contentInfo.needsLatex) {
            structureExamples.push('{"question": "The integral $\\\\int x^2 dx = \\\\frac{x^3}{3} + C$", "type": "true-false", "options": ["True", "False"], "correctAnswer": "true", "timeLimit": 20, "explanation": "This is the correct antiderivative of $x^2$", "difficulty": "medium"}');
        } else {
            structureExamples.push('{"question": "Statement about the content.", "type": "true-false", "options": ["True", "False"], "correctAnswer": "true", "timeLimit": 20, "explanation": "Explanation of the correct answer", "difficulty": "easy"}');
        }
    }

    if (selectedTypes.includes('multiple-correct')) {
        structureExamples.push('{"question": "Which of the following are TRUE? (Select all)", "type": "multiple-correct", "options": ["Correct A", "Wrong B", "Correct C", "Correct D"], "correctAnswers": [0, 2, 3], "timeLimit": 35, "explanation": "Options A, C, and D are correct because...", "difficulty": "hard"}');
    }

    if (selectedTypes.includes('numeric')) {
        if (contentInfo.needsLatex) {
            structureExamples.push('{"question": "Solve for $x$: $2x + 6 = 14$", "type": "numeric", "correctAnswer": 4, "tolerance": 0, "timeLimit": 25, "explanation": "$2x = 8$, so $x = 4$", "difficulty": "easy"}');
        } else {
            structureExamples.push('{"question": "Numeric question from content?", "type": "numeric", "correctAnswer": 1991, "tolerance": 0, "timeLimit": 25, "explanation": "Explanation of the answer", "difficulty": "medium"}');
        }
    }

    if (selectedTypes.includes('ordering')) {
        structureExamples.push('{"question": "Arrange the following steps in the correct order:", "type": "ordering", "options": ["Step B", "Step D", "Step A", "Step C"], "correctOrder": [2, 0, 3, 1], "timeLimit": 40, "explanation": "The correct sequence is Step A, Step B, Step C, Step D", "difficulty": "medium"}');
    }

    return structureExamples;
}

/**
 * Build the main prompt for question generation
 * @param {Object} params - Prompt parameters
 * @returns {string} Complete prompt
 */
export function buildMainPrompt(params) {
    const {
        content,
        questionCount,
        difficulty,
        selectedTypes,
        contentInfo,
        isFormattingExistingQuestions,
        cognitiveLevel
    } = params;

    const language = translationManager.getCurrentLanguage() || 'en';
    const targetLanguage = LANGUAGE_NAMES[language] || 'English';
    const contentType = contentInfo.type || 'general';

    // Build Bloom's taxonomy instructions
    const bloomInstructions = buildBloomInstructions(cognitiveLevel);

    // Build question type description
    let typeDescription = isFormattingExistingQuestions
        ? `Format and convert the following ${questionCount} existing question${questionCount === 1 ? '' : 's'} into proper quiz format.`
        : `Create EXACTLY ${questionCount} question${questionCount === 1 ? '' : 's'} about the following content. Difficulty: ${difficulty}. Content type detected: ${contentType}.`;

    // Add type-specific instructions
    if (selectedTypes.includes('multiple-choice')) {
        typeDescription += '\n- Some questions should be multiple choice (4 options, one correct)';
    }
    if (selectedTypes.includes('true-false')) {
        typeDescription += '\n- Some questions should be true/false (single factual statements)';
    }
    if (selectedTypes.includes('multiple-correct')) {
        typeDescription += '\n- Some questions should allow multiple correct answers (use "correctAnswers" array)';
    }
    if (selectedTypes.includes('numeric')) {
        typeDescription += '\n- Some questions should have numeric answers';
    }
    if (selectedTypes.includes('ordering')) {
        typeDescription += '\n- Some questions should ask to arrange items in correct order (use "correctOrder" array with indices)';
    }

    // Build structure examples
    const structureExamples = buildStructureExamples(selectedTypes, contentInfo);
    const structureExample = `Return ONLY a valid JSON array with structures like these:\n[${structureExamples.join(',\n')}]`;

    // Build formatting instructions
    const formattingInstructions = buildFormattingInstructions(contentInfo);

    // Build the main prompt
    return `You are a quiz question generator. Output ONLY valid JSON - no markdown, no explanations, no extra text.

${typeDescription}
${bloomInstructions}

CONTENT TO USE:
${content}

OUTPUT FORMAT - Return a JSON array with EXACTLY ${questionCount} question${questionCount === 1 ? '' : 's'}:
${structureExample}

${formattingInstructions}

STRICT RULES:
1. Output ONLY the JSON array - start with [ and end with ]
2. Generate ALL ${questionCount} questions - do not stop early
3. All questions in ${targetLanguage} language
4. Each question MUST have: question, type, options (except numeric), correctAnswer/correctAnswers, timeLimit, explanation, difficulty
5. JSON structures by type:
   - multiple-choice: "correctAnswer": 0-3 (integer index), "options": [4 items]
   - true-false: "options": ["True", "False"], "correctAnswer": "true" or "false" (string)
   - multiple-correct: "correctAnswers": [0, 2, 3] (array of indices), "options": [array]
   - numeric: "correctAnswer": number, "tolerance": number, NO options field
   - ordering: "options": [items], "correctOrder": [indices for correct sequence]
6. Escape special characters in strings (quotes, backslashes, newlines)
7. No trailing commas in JSON
8. Complete EVERY question object before starting the next

${isFormattingExistingQuestions ? 'PRESERVE original question text and answers.' : 'Base questions on the provided content.'}

IMPORTANT: You MUST output all ${questionCount} complete questions. Do not truncate or stop early.`;
}

/**
 * Build a simplified prompt for retry attempts after JSON parsing failures
 * @param {Object} params - Prompt parameters
 * @returns {string} Retry prompt
 */
export function buildRetryPrompt(params) {
    const { content, questionCount, difficulty, selectedTypes, attemptNumber, truncateAtWordBoundary } = params;

    const language = translationManager.getCurrentLanguage() || 'en';
    const targetLanguage = LANGUAGE_NAMES[language] || 'English';

    // On second retry, reduce question count if more than 1
    const adjustedCount = attemptNumber >= 3 && questionCount > 1 ? Math.ceil(questionCount / 2) : questionCount;

    // Build minimal type examples
    const typeExamples = [];
    for (const type of selectedTypes) {
        if (MINIMAL_TYPE_EXAMPLES[type]) {
            typeExamples.push(MINIMAL_TYPE_EXAMPLES[type]);
        }
    }

    // Truncate content at word boundary for cleaner context
    const truncatedContent = truncateAtWordBoundary ? truncateAtWordBoundary(content, 2000) : content.substring(0, 2000);

    return `Generate ${adjustedCount} quiz question${adjustedCount === 1 ? '' : 's'} in ${targetLanguage} about:
${truncatedContent}

CRITICAL: Output ONLY a valid JSON array. No markdown, no explanation.

Example format:
[${typeExamples.join(',')}]

Rules:
- Start with [ end with ]
- ${adjustedCount} questions exactly
- Difficulty: ${difficulty}
- Escape quotes with \\
- No trailing commas

JSON array only:`;
}

/**
 * Build prompt for converting Excel questions to JSON
 * @param {string} content - Excel content
 * @param {Array} selectedTypes - Selected question types (unused but kept for API consistency)
 * @returns {string} Excel conversion prompt
 */
export function buildExcelConversionPrompt(content, selectedTypes) {
    return `CONVERT EXCEL QUESTIONS TO JSON - DO NOT MAKE UP NEW QUESTIONS

You must convert ONLY the questions that are in this Excel data. Do not create any new questions.

${content}

STEP BY STEP INSTRUCTIONS:
1. Find each "Question X:" section in the Excel data above
2. For each question, copy the exact text and answers from the Excel
3. Convert to JSON format shown below
4. Do NOT translate or change any text
5. Do NOT create questions not in the Excel

JSON TEMPLATE - Use exactly this format:
{"question": "EXACT_TEXT_FROM_EXCEL_COLUMN_A", "type": "multiple-choice", "options": ["EXACT_TEXT_FROM_COLUMN_B", "EXACT_TEXT_FROM_COLUMN_C", "EXACT_TEXT_FROM_COLUMN_D", "EXACT_TEXT_FROM_COLUMN_E"], "correctAnswer": 0, "timeLimit": 30}

CRITICAL RULES:
- Use ONLY questions that appear in the Excel data above
- COPY TEXT EXACTLY AS WRITTEN - do NOT change, rephrase, translate, or modify ANY words
- DO NOT fix grammar, spelling, or punctuation - use the exact text from Excel
- DO NOT add punctuation marks if they're not in the original text
- DO NOT change question marks, periods, or any formatting
- CRITICAL: Use the CORRECT_ANSWER_INDEX provided for each question:
  * Look for "CORRECT_ANSWER_INDEX: [number]" in the data
  * Use that exact number as the correctAnswer field
  * Do NOT try to figure out the correct answer yourself
  * The correctAnswer field must be 0, 1, 2, or 3 (not A, B, C, D)
- Return valid JSON array format: [{"question": ...}, {"question": ...}]
- NO explanations, NO extra text, ONLY the JSON array
- PRESERVE EXACT TEXT: Copy every word, space, and character exactly as it appears in the Excel

Start converting now. Return only the JSON array.`;
}

/**
 * Build Ollama-specific enhanced prompt
 * @param {string} basePrompt - The base prompt
 * @returns {string} Enhanced prompt for Ollama
 */
export function buildOllamaEnhancedPrompt(basePrompt) {
    const timestamp = Date.now();
    const randomSeed = Math.floor(Math.random() * 10000);

    return `[Session: ${timestamp}-${randomSeed}] ${basePrompt}

OLLAMA SPECIFIC REQUIREMENTS:
- For multiple-choice questions: You MUST provide exactly 4 options in the "options" array
- NEVER generate multiple-choice questions with 3 or fewer options
- If you cannot think of 4 good options, create plausible distractors related to the content
- Example: "options": ["Correct answer", "Related but wrong", "Plausible distractor", "Another distractor"]

Please respond with only valid JSON. Do not include explanations or additional text.`;
}
