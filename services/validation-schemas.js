/**
 * API Validation Schemas
 * Zod schemas for request validation on API endpoints
 */

const { z } = require('zod');

// ============================================================================
// Coercion helpers — quiz files may store strings for booleans/numbers
// ============================================================================

/** Accepts boolean, "true"/"false" strings, or null (poll questions have no answer) */
const coerceNullableBool = z.preprocess(
    val => val === 'true' ? true : val === 'false' ? false : val,
    z.boolean().nullable()
);

/** Accepts number or numeric strings */
const coerceNum = z.preprocess(
    val => typeof val === 'string' && val.trim() !== '' ? Number(val) : val,
    z.number()
);

// ============================================================================
// Question Schemas
// ============================================================================

// Shared video/Manim fields for all question types
const videoFields = {
    video: z.string().optional(),
    videoManimCode: z.string().optional(),
    explanationVideo: z.string().optional(),
    explanationVideoManimCode: z.string().optional()
};

const multipleChoiceQuestionSchema = z.object({
    type: z.literal('multiple-choice'),
    question: z.string().min(1, 'Question text is required'),
    options: z.array(z.string()).min(2, 'At least 2 options required').max(6),
    correctIndex: z.number().int().min(0).optional(),
    correctAnswer: z.number().int().min(0).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional(),
    concepts: z.array(z.string()).max(5).optional().default([]),
    ...videoFields
});

const multipleCorrectQuestionSchema = z.object({
    type: z.literal('multiple-correct'),
    question: z.string().min(1, 'Question text is required'),
    options: z.array(z.string()).min(2).max(6),
    correctIndices: z.array(z.number().int().min(0)).min(1).optional(),
    correctAnswers: z.array(z.number().int().min(0)).min(1).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional(),
    concepts: z.array(z.string()).max(5).optional().default([]),
    ...videoFields
});

const trueFalseQuestionSchema = z.object({
    type: z.literal('true-false'),
    question: z.string().min(1, 'Question text is required'),
    // Optional at the field level because poll questions have no correct answer;
    // the refine below still requires it for every non-poll question.
    correctAnswer: coerceNullableBool.optional(),
    // Poll mode: students answer True/False but nobody is right or wrong and no
    // points are awarded. Absent on quizzes saved before poll mode existed.
    isPoll: z.boolean().optional().default(false),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional(),
    concepts: z.array(z.string()).max(5).optional().default([]),
    ...videoFields
}).refine(
    data => data.isPoll === true || typeof data.correctAnswer === 'boolean',
    {
        message: 'Correct answer (True or False) must be selected',
        path: ['correctAnswer']
    }
);

const numericQuestionSchema = z.object({
    type: z.literal('numeric'),
    question: z.string().min(1, 'Question text is required'),
    correctAnswer: coerceNum,
    tolerance: z.number().min(0).optional().default(0.01),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional(),
    concepts: z.array(z.string()).max(5).optional().default([]),
    ...videoFields
});

const orderingQuestionSchema = z.object({
    type: z.literal('ordering'),
    question: z.string().min(1, 'Question text is required'),
    options: z.array(z.string()).min(2).max(8),
    correctOrder: z.array(z.number().int().min(0)),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    timeLimit: z.number().int().min(5).max(300).optional().default(20),
    explanation: z.string().optional(),
    image: z.string().optional(),
    concepts: z.array(z.string()).max(5).optional().default([]),
    ...videoFields
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

// Per-quiz scoring setup. Shape mirrors readScoringConfigFromDOM() in
// public/js/utils/scoring-config.js and what services/scoring-service.js reads.
// Shared by the saved-quiz settings and the host-join socket payload; note the
// threshold is seconds when saved to a file and milliseconds over the socket.
// Every key stays optional with no default so a quiz without a scoring config
// does not gain a spurious one.
const scoringConfigSchema = z.object({
    timeBonusEnabled: z.boolean().optional(),
    timeBonusThreshold: z.number().min(0).optional(),
    difficultyMultipliers: z.object({
        easy: z.number().optional(),
        medium: z.number().optional(),
        hard: z.number().optional()
    }).optional()
}).optional();

const quizSettingsSchema = z.object({
    randomizeQuestions: z.boolean().optional().default(false),
    randomizeAnswers: z.boolean().optional().default(false),
    useGlobalTime: z.boolean().optional().default(false),
    globalTimeLimit: z.number().int().min(5).max(300).optional().default(20),
    manualAdvance: z.boolean().optional().default(true),
    showLeaderboardBetweenQuestions: z.boolean().optional().default(true),
    // Consensus mode settings
    consensusMode: z.boolean().optional().default(false),
    consensusThreshold: z.enum(['50', '66', '75', '100']).optional().default('66'),
    discussionTime: z.number().int().min(10).max(300).optional().default(30),
    allowChat: z.boolean().optional().default(false),
    scoringConfig: scoringConfigSchema
}).optional();

const saveQuizSchema = z.object({
    title: z.string().min(1, 'Quiz title is required').max(200),
    questions: z.array(questionSchema).min(1, 'At least one question is required'),
    settings: quizSettingsSchema,
    password: z.string().min(4).max(100).nullable().optional(),
    filename: z.string().regex(/^[a-zA-Z0-9._-]+\.json$/).optional()
});

// ============================================================================
// AI Generation Schemas
// ============================================================================

const contentFlagsSchema = z.object({
    needsLatex: z.boolean().optional().default(false),
    needsCodeBlocks: z.boolean().optional().default(false),
    language: z.string().nullable().optional().default(null)
}).optional().nullable();

// Model ids are interpolated into the provider request URL (Gemini) — keep them
// to a plain id so a crafted value can't traverse to another API path.
const modelIdSchema = z.string().regex(/^[A-Za-z0-9._-]+$/, 'Invalid model id');

const claudeGenerateSchema = z.object({
    prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
    apiKey: z.string().optional(),
    numQuestions: z.number().int().min(1).max(50).optional().default(5),
    model: modelIdSchema.optional().default('claude-sonnet-4-5'),
    contentFlags: contentFlagsSchema
});

const geminiGenerateSchema = z.object({
    prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
    apiKey: z.string().optional(),
    numQuestions: z.number().int().min(1).max(50).optional().default(5),
    model: modelIdSchema.optional().default('gemini-2.5-flash'),
    contentFlags: contentFlagsSchema
});

// URL extraction schema
const extractUrlSchema = z.object({
    url: z.string()
        .url('Invalid URL format')
        .refine(url => {
            // Only allow http and https protocols
            return url.startsWith('http://') || url.startsWith('https://');
        }, 'Only HTTP and HTTPS URLs are allowed')
});

const aiCompleteSchema = z.object({
    provider: z.enum(['claude', 'gemini']),
    prompt: z.string().min(1, 'Prompt is required'),
    system: z.string().min(1, 'System prompt is required'),
    model: modelIdSchema.optional(),
    apiKey: z.string().optional(),
    maxTokens: z.number().int().min(100).max(32000).optional().default(4096)
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
                const errors = result.error.issues.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return res.status(400).json({
                    error: 'Validation failed',
                    messageKey: 'error_validation_failed',
                    details: errors
                });
            }
            req.validatedBody = result.data;
            next();
        } catch (error) {
            return res.status(500).json({
                error: 'Validation error',
                messageKey: 'error_validation_error',
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
                const errors = result.error.issues.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return res.status(400).json({
                    error: 'Invalid parameters',
                    messageKey: 'error_invalid_parameters',
                    details: errors
                });
            }
            req.validatedParams = result.data;
            next();
        } catch (error) {
            return res.status(500).json({
                error: 'Validation error',
                messageKey: 'error_validation_error',
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
    folderId: z.string().uuid().nullable().optional(),
    visibility: z.enum(['public', 'private']).optional()
});

// ============================================================================
// Auth Schemas
// ============================================================================

const signupSchema = z.object({
    username: z.string()
        .min(3, 'Username must be at least 3 characters')
        .max(32, 'Username must be at most 32 characters')
        .regex(/^[a-zA-Z0-9_]+$/, 'Username may contain only letters, digits, and underscore'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(200, 'Password must be at most 200 characters')
});

const loginSchema = z.object({
    username: z.string().min(1, 'Username is required').max(64),
    password: z.string().min(1, 'Password is required').max(200)
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
// Socket Event Schemas
// ============================================================================

// Host events (from client to server)
const hostJoinSchema = z.object({
    quiz: z.object({
        title: z.string().min(1),
        questions: z.array(questionSchema).min(1),
        manualAdvancement: z.boolean().optional(),
        powerUpsEnabled: z.boolean().optional().default(false),
        showLeaderboardBetweenQuestions: z.boolean().optional().default(true),
        randomizeQuestions: z.boolean().optional(),
        randomizeAnswers: z.boolean().optional(),
        sameTimeForAll: z.boolean().optional(),
        questionTime: z.number().int().min(5).max(300).optional(),
        scoringConfig: scoringConfigSchema,
        // Consensus mode settings
        consensusMode: z.boolean().optional().default(false),
        consensusThreshold: z.enum(['50', '66', '75', '100']).optional().default('66'),
        discussionTime: z.number().int().min(10).max(300).optional().default(30),
        allowChat: z.boolean().optional().default(false)
    }),
    previousPin: z.string().regex(/^\d{6}$/).optional(),
    migrationToken: z.string().uuid().optional(),
    hostSessionId: z.string().uuid().optional()
});

const playerJoinSchema = z.object({
    pin: z.string().regex(/^\d{6}$/),
    name: z.string().min(1).max(50),
    deviceId: z.string().uuid().optional()
});

// Same name constraints as playerJoinSchema (names render on host/player screens)
const playerChangeNameSchema = z.object({
    newName: z.string().min(1).max(50)
});

const nextQuestionSchema = z.object({
    pin: z.string().regex(/^\d{6}$/)
});

const endQuestionEarlySchema = z.object({
    pin: z.string().regex(/^\d{6}$/)
});

// Bounded on both branches: the answer is serialized into the results file at
// game end, so an unbounded array or a huge number is a disk-size problem as
// well as a parsing one. 1000 is far above any real option/ordering index.
const socketSubmitAnswerSchema = z.object({
    answer: z.union([
        z.number().int().min(0).max(1000),
        z.boolean(),
        z.string().max(200),
        z.array(z.number().int().min(0).max(1000)).max(100)
    ]),
    type: z.string().max(50).optional()
});

// The type is used as a property key on player.powerUps — an enum, never a free
// string, or "__proto__" reaches Object.prototype.
const usePowerUpSchema = z.object({
    type: z.enum(['fifty-fifty', 'extend-time', 'double-points'])
});

// Tokens are compared against the stored value, so the format is not the
// security boundary; these bounds only stop an oversized payload.
const playerRejoinSchema = z.object({
    pin: z.string().regex(/^\d{6}$/),
    sessionToken: z.string().min(1).max(200)
});

const hostRejoinSchema = z.object({
    pin: z.string().regex(/^\d{6}$/),
    token: z.string().min(1).max(200)
});

const kickPlayerSchema = z.object({
    pin: z.string().regex(/^\d{6}$/),
    playerId: z.string().min(1)
});

// Consensus mode socket event schemas
const proposeAnswerSchema = z.object({
    answer: z.number().int().min(0)
});

const sendQuickResponseSchema = z.object({
    type: z.enum(['propose', 'agree', 'unsure', 'discuss', 'ready']),
    targetPlayer: z.string().optional()
});

const sendChatMessageSchema = z.object({
    text: z.string().min(1).max(200)
});

// Session event schemas
const sessionCheckSchema = z.object({
    deviceId: z.string().uuid(),
    hostSessionId: z.string().uuid()
});

const leaveSessionSchema = z.object({
    deviceId: z.string().uuid(),
    hostSessionId: z.string().uuid()
});

const releaseSessionSchema = z.object({
    hostSessionId: z.string().uuid()
});

// Server to client event data schemas
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
        'player-change-name': playerChangeNameSchema,
        // 'start-game' sends no data — validated by handler logic
        'next-question': nextQuestionSchema,
        'end-question-early': endQuestionEarlySchema,
        'submit-answer': socketSubmitAnswerSchema,
        'use-power-up': usePowerUpSchema,
        'player-rejoin': playerRejoinSchema,
        'host-rejoin': hostRejoinSchema,
        'kick-player': kickPlayerSchema,
        // Consensus mode events
        'propose-answer': proposeAnswerSchema,
        'send-quick-response': sendQuickResponseSchema,
        'send-chat-message': sendChatMessageSchema,
        // Session events
        'session-check': sessionCheckSchema,
        'leave-session': leaveSessionSchema,
        'release-session': releaseSessionSchema,
        // Server to client
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

/**
 * Validates socket event data and emits an error if invalid.
 * Returns the validated data on success, or null on failure.
 * @param {Object} socket - Socket.IO socket instance
 * @param {string} eventName - Name of the socket event
 * @param {Object} data - Event data to validate
 * @param {Object} logger - Logger instance
 * @returns {Object|null} Validated data or null if invalid
 */
function validateAndHandle(socket, eventName, data, logger) {
    const result = validateSocketEvent(eventName, data);
    if (!result.valid) {
        logger.warn(`Invalid ${eventName} data:`, result.errors);
        socket.emit('error', {
            message: `Invalid ${eventName} data: ${result.errors.map(e => `${e.field}: ${e.message}`).join('; ')}`,
            messageKey: 'error_validation_failed'
        });
        return null;
    }
    return result.data;
}

module.exports = {
    // Schemas
    questionSchema,
    saveQuizSchema,
    claudeGenerateSchema,
    geminiGenerateSchema,
    extractUrlSchema,
    aiCompleteSchema,
    joinGameSchema,
    submitAnswerSchema,

    // File management schemas
    createFolderSchema,
    renameFolderSchema,
    moveFolderSchema,
    setPasswordSchema,
    updateQuizMetadataSchema,
    unlockSchema,
    folderIdParamSchema,

    // Auth schemas
    signupSchema,
    loginSchema,

    // Socket event schemas
    hostJoinSchema,
    playerJoinSchema,
    playerChangeNameSchema,
    nextQuestionSchema,
    endQuestionEarlySchema,
    socketSubmitAnswerSchema,
    usePowerUpSchema,
    playerRejoinSchema,
    hostRejoinSchema,
    kickPlayerSchema,
    // Consensus mode schemas
    proposeAnswerSchema,
    sendQuickResponseSchema,
    sendChatMessageSchema,
    // Session event schemas
    sessionCheckSchema,
    leaveSessionSchema,
    releaseSessionSchema,
    errorEventSchema,

    // Middleware factories
    validateBody,
    validateParams,

    // Socket validation
    validateSocketEvent,
    validateAndHandle
};
