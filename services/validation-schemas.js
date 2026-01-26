/**
 * API Validation Schemas
 * Zod schemas for request validation on API endpoints
 */

const { z } = require('zod');

// ============================================================================
// Question Schemas
// ============================================================================

const multipleChoiceQuestionSchema = z.object({
    type: z.literal('multiple-choice'),
    question: z.string().min(1, 'Question text is required'),
    options: z.array(z.string()).min(2, 'At least 2 options required').max(6),
    correctIndex: z.number().int().min(0),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional()
});

const multipleCorrectQuestionSchema = z.object({
    type: z.literal('multiple-correct'),
    question: z.string().min(1, 'Question text is required'),
    options: z.array(z.string()).min(2).max(6),
    correctIndices: z.array(z.number().int().min(0)).min(1),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional()
});

const trueFalseQuestionSchema = z.object({
    type: z.literal('true-false'),
    question: z.string().min(1, 'Question text is required'),
    correctAnswer: z.boolean(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional()
});

const numericQuestionSchema = z.object({
    type: z.literal('numeric'),
    question: z.string().min(1, 'Question text is required'),
    correctAnswer: z.number(),
    tolerance: z.number().min(0).optional().default(0.01),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional()
});

const orderingQuestionSchema = z.object({
    type: z.literal('ordering'),
    question: z.string().min(1, 'Question text is required'),
    options: z.array(z.string()).min(2).max(8),
    correctOrder: z.array(z.number().int().min(0)),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional()
});

// Union of all question types
const questionSchema = z.discriminatedUnion('type', [
    multipleChoiceQuestionSchema,
    multipleCorrectQuestionSchema,
    trueFalseQuestionSchema,
    numericQuestionSchema,
    orderingQuestionSchema
]);

// ============================================================================
// Quiz Schemas
// ============================================================================

const quizSettingsSchema = z.object({
    randomizeQuestions: z.boolean().optional().default(false),
    randomizeAnswers: z.boolean().optional().default(false),
    useGlobalTime: z.boolean().optional().default(false),
    globalTimeLimit: z.number().int().min(5).max(300).optional().default(20),
    manualAdvance: z.boolean().optional().default(true)
}).optional();

const saveQuizSchema = z.object({
    title: z.string().min(1, 'Quiz title is required').max(200),
    questions: z.array(questionSchema).min(1, 'At least one question is required'),
    settings: quizSettingsSchema,
    password: z.string().min(4).max(100).nullable().optional()
});

// ============================================================================
// AI Generation Schemas
// ============================================================================

const claudeGenerateSchema = z.object({
    prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
    apiKey: z.string().optional(),
    numQuestions: z.number().int().min(1).max(50).optional().default(5),
    model: z.string().optional().default('claude-sonnet-4-5')
});

const geminiGenerateSchema = z.object({
    prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
    apiKey: z.string().optional(),
    numQuestions: z.number().int().min(1).max(50).optional().default(5),
    model: z.string().optional().default('gemini-2.5-flash')
});

// ============================================================================
// Game Schemas
// ============================================================================

const joinGameSchema = z.object({
    pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
    playerName: z.string().min(1, 'Player name is required').max(50)
});

const submitAnswerSchema = z.object({
    answer: z.union([
        z.number(),
        z.boolean(),
        z.string(),
        z.array(z.number())
    ]),
    type: z.string().optional()
});

// ============================================================================
// Validation Middleware Factory
// ============================================================================

/**
 * Creates an Express middleware that validates request body against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
function validateBody(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.body);
            if (!result.success) {
                const errors = result.error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors
                });
            }
            req.validatedBody = result.data;
            next();
        } catch (error) {
            return res.status(500).json({
                error: 'Validation error',
                message: error.message
            });
        }
    };
}

/**
 * Creates an Express middleware that validates request params against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
function validateParams(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.params);
            if (!result.success) {
                const errors = result.error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return res.status(400).json({
                    error: 'Invalid parameters',
                    details: errors
                });
            }
            req.validatedParams = result.data;
            next();
        } catch (error) {
            return res.status(500).json({
                error: 'Validation error',
                message: error.message
            });
        }
    };
}

/**
 * Creates an Express middleware that validates request query against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 */
function validateQuery(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.query);
            if (!result.success) {
                const errors = result.error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return res.status(400).json({
                    error: 'Invalid query parameters',
                    details: errors
                });
            }
            req.validatedQuery = result.data;
            next();
        } catch (error) {
            return res.status(500).json({
                error: 'Validation error',
                message: error.message
            });
        }
    };
}

// ============================================================================
// File Management Schemas
// ============================================================================

const createFolderSchema = z.object({
    name: z.string().min(1, 'Folder name is required').max(100, 'Folder name must be less than 100 characters'),
    parentId: z.string().uuid().nullable().optional().default(null)
});

const renameFolderSchema = z.object({
    name: z.string().min(1, 'Folder name is required').max(100, 'Folder name must be less than 100 characters')
});

const moveFolderSchema = z.object({
    parentId: z.string().uuid().nullable()
});

const setPasswordSchema = z.object({
    password: z.string().min(4, 'Password must be at least 4 characters').max(100).nullable()
});

const updateQuizMetadataSchema = z.object({
    displayName: z.string().min(1).max(200).optional(),
    folderId: z.string().uuid().nullable().optional()
});

const unlockSchema = z.object({
    itemId: z.string().min(1),
    itemType: z.enum(['folder', 'quiz']),
    password: z.string().min(1, 'Password is required')
});

const folderIdParamSchema = z.object({
    id: z.string().uuid('Invalid folder ID')
});

// ============================================================================
// Param Schemas
// ============================================================================

const quizFilenameSchema = z.object({
    filename: z.string().regex(/^[\w\-]+\.json$/, 'Invalid filename format')
});

const resultFilenameSchema = z.object({
    filename: z.string().regex(/^results_\d+_\d+\.json$/, 'Invalid result filename format')
});

const pinSchema = z.object({
    pin: z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits')
});

const exportFormatSchema = z.object({
    filename: z.string(),
    format: z.enum(['csv', 'json'])
});

// ============================================================================
// Socket Event Schemas
// ============================================================================

// Host events (from client to server)
const hostJoinSchema = z.object({
    quiz: z.object({
        title: z.string().min(1),
        questions: z.array(questionSchema).min(1),
        manualAdvancement: z.boolean().optional(),
        randomizeQuestions: z.boolean().optional(),
        randomizeAnswers: z.boolean().optional(),
        questionTime: z.number().int().min(5).max(300).optional()
    })
});

const playerJoinSchema = z.object({
    pin: z.string().regex(/^\d{6}$/),
    playerName: z.string().min(1).max(50)
});

const startGameSchema = z.object({
    pin: z.string().regex(/^\d{6}$/)
});

const nextQuestionSchema = z.object({
    pin: z.string().regex(/^\d{6}$/)
});

const endQuestionEarlySchema = z.object({
    pin: z.string().regex(/^\d{6}$/)
});

const socketSubmitAnswerSchema = z.object({
    pin: z.string().regex(/^\d{6}$/),
    answer: z.union([
        z.number(),
        z.boolean(),
        z.string(),
        z.array(z.number())
    ]),
    questionIndex: z.number().int().min(0).optional()
});

const kickPlayerSchema = z.object({
    pin: z.string().regex(/^\d{6}$/),
    playerId: z.string().min(1)
});

// Server to client event data schemas
const gameCreatedEventSchema = z.object({
    pin: z.string(),
    title: z.string(),
    qrCodeDataUrl: z.string().optional(),
    networkUrl: z.string().optional()
});

const playerJoinedEventSchema = z.object({
    playerId: z.string(),
    playerName: z.string(),
    playerNumber: z.number().int(),
    players: z.array(z.object({
        id: z.string(),
        name: z.string(),
        score: z.number()
    }))
});

const questionStartEventSchema = z.object({
    questionIndex: z.number().int().min(0),
    totalQuestions: z.number().int().min(1),
    question: z.object({
        question: z.string(),
        type: z.string(),
        options: z.array(z.string()).optional(),
        time: z.number().optional()
    }),
    timeLimit: z.number().int()
});

const answerResultEventSchema = z.object({
    correct: z.boolean(),
    points: z.number().int(),
    totalScore: z.number().int(),
    streak: z.number().int().optional(),
    correctAnswer: z.union([
        z.number(),
        z.boolean(),
        z.string(),
        z.array(z.number())
    ]).optional()
});

const questionEndEventSchema = z.object({
    leaderboard: z.array(z.object({
        name: z.string(),
        score: z.number()
    })),
    statistics: z.object({}).passthrough().optional(),
    correctAnswer: z.union([
        z.number(),
        z.boolean(),
        z.string(),
        z.array(z.number())
    ])
});

const gameEndEventSchema = z.object({
    leaderboard: z.array(z.object({
        name: z.string(),
        score: z.number()
    })),
    statistics: z.object({}).passthrough().optional()
});

const errorEventSchema = z.object({
    message: z.string(),
    code: z.string().optional()
});

/**
 * Validates socket event data against its schema
 * @param {string} eventName - Name of the socket event
 * @param {Object} data - Event data to validate
 * @returns {{valid: boolean, data?: Object, errors?: Array}} Validation result
 */
function validateSocketEvent(eventName, data) {
    const schemas = {
        // Client to server
        'host-join': hostJoinSchema,
        'player-join': playerJoinSchema,
        'start-game': startGameSchema,
        'next-question': nextQuestionSchema,
        'end-question-early': endQuestionEarlySchema,
        'submit-answer': socketSubmitAnswerSchema,
        'kick-player': kickPlayerSchema,
        // Server to client
        'game-created': gameCreatedEventSchema,
        'player-joined': playerJoinedEventSchema,
        'question-start': questionStartEventSchema,
        'answer-result': answerResultEventSchema,
        'question-end': questionEndEventSchema,
        'game-end': gameEndEventSchema,
        'error': errorEventSchema
    };

    const schema = schemas[eventName];
    if (!schema) {
        return { valid: true, data }; // Unknown events pass through
    }

    const result = schema.safeParse(data);
    if (result.success) {
        return { valid: true, data: result.data };
    }

    return {
        valid: false,
        errors: result.error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message
        }))
    };
}

module.exports = {
    // Schemas
    questionSchema,
    saveQuizSchema,
    claudeGenerateSchema,
    geminiGenerateSchema,
    joinGameSchema,
    submitAnswerSchema,
    quizFilenameSchema,
    resultFilenameSchema,
    pinSchema,
    exportFormatSchema,

    // File management schemas
    createFolderSchema,
    renameFolderSchema,
    moveFolderSchema,
    setPasswordSchema,
    updateQuizMetadataSchema,
    unlockSchema,
    folderIdParamSchema,

    // Socket event schemas
    hostJoinSchema,
    playerJoinSchema,
    startGameSchema,
    nextQuestionSchema,
    endQuestionEarlySchema,
    socketSubmitAnswerSchema,
    kickPlayerSchema,
    gameCreatedEventSchema,
    playerJoinedEventSchema,
    questionStartEventSchema,
    answerResultEventSchema,
    questionEndEventSchema,
    gameEndEventSchema,
    errorEventSchema,

    // Middleware factories
    validateBody,
    validateParams,
    validateQuery,

    // Socket validation
    validateSocketEvent
};
