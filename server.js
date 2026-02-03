// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
// uuid removed - not currently used (GameSessionService generates PINs)
const cors = require('cors');
const multer = require('multer');
const QRCode = require('qrcode');
const os = require('os');
const crypto = require('crypto');
const compression = require('compression');
const sharp = require('sharp');
const { CORSValidationService } = require('./services/cors-validation-service');
const { QuestionTypeService } = require('./services/question-type-service');
const { QuizService } = require('./services/quiz-service');
const { ResultsService } = require('./services/results-service');
const { MetadataService } = require('./services/metadata-service');
const { QRService } = require('./services/qr-service');
const { GameSessionService } = require('./services/game-session-service');
const { PlayerManagementService } = require('./services/player-management-service');
const { QuestionFlowService } = require('./services/question-flow-service');
const { ConsensusFlowService } = require('./services/consensus-flow-service');
const { SocketBatchService } = require('./services/socket-batch-service');
const {
    validateBody,
    validateParams,
    saveQuizSchema,
    claudeGenerateSchema,
    geminiGenerateSchema,
    extractUrlSchema,
    createFolderSchema,
    renameFolderSchema,
    moveFolderSchema,
    setPasswordSchema,
    updateQuizMetadataSchema,
    unlockSchema,
    folderIdParamSchema
} = require('./services/validation-schemas');
const { metricsService } = require('./services/metrics-service');
const { SocketRateLimiter } = require('./utils/socket-rate-limiter');
const { GracefulShutdown } = require('./utils/graceful-shutdown');
const { createCacheControlMiddleware } = require('./middleware/cache-control');
const { createStaticFilesConfig, createStaticErrorHandler, createJsFileHandler, createDebugStaticConfig } = require('./middleware/static-files');
const { createHealthCheckRoutes } = require('./routes/health-checks');
const { createQuizManagementRoutes } = require('./routes/quiz-management');
const { createFileUploadRoutes } = require('./routes/file-uploads');
const { createAIGenerationRoutes } = require('./routes/ai-generation');
const { registerSocketHandlers } = require('./socket');

// Detect production environment (Railway sets NODE_ENV automatically)
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';

// Base path configuration for Kubernetes/path-based routing
// Auto-detect: production uses /quizmaster/, development uses /
const BASE_PATH = process.env.BASE_PATH || (isProduction ? '/quizmaster/' : '/');

// Server-side logging utility
const DEBUG = {
    ENABLED: !isProduction, // Disabled in production, enabled in development
    LEVELS: { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 },
    CURRENT_LEVEL: isProduction ? 2 : 4 // WARN level in production, DEBUG in development
};

const logger = {
    error: (message, ...args) => {
        if (DEBUG.ENABLED && DEBUG.CURRENT_LEVEL >= DEBUG.LEVELS.ERROR) {
            console.error(`❌ [SERVER] ${message}`, ...args);
        }
    },
    warn: (message, ...args) => {
        if (DEBUG.ENABLED && DEBUG.CURRENT_LEVEL >= DEBUG.LEVELS.WARN) {
            console.warn(`⚠️ [SERVER] ${message}`, ...args);
        }
    },
    info: (message, ...args) => {
        if (DEBUG.ENABLED && DEBUG.CURRENT_LEVEL >= DEBUG.LEVELS.INFO) {
            console.log(`ℹ️ [SERVER] ${message}`, ...args);
        }
    },
    debug: (message, ...args) => {
        if (DEBUG.ENABLED && DEBUG.CURRENT_LEVEL >= DEBUG.LEVELS.DEBUG) {
            console.log(`🔧 [SERVER] ${message}`, ...args);
        }
    }
};

// Log base path configuration on startup
logger.info(`Base path configured: ${BASE_PATH}`);

// ==================== ENVIRONMENT VALIDATION ====================
// Validate environment configuration at startup (fail fast for K8s)

function validateEnvironment() {
    const errors = [];
    const warnings = [];

    // Validate PORT
    const port = process.env.PORT || 3000;
    if (isNaN(parseInt(port)) || parseInt(port) < 1 || parseInt(port) > 65535) {
        errors.push(`Invalid PORT value: ${port}. Must be a number between 1 and 65535.`);
    }

    // Check optional environment variables and warn if missing
    if (!process.env.CLAUDE_API_KEY) {
        warnings.push('CLAUDE_API_KEY not set - AI generation will require client-provided keys');
    }

    if (!process.env.GEMINI_API_KEY) {
        warnings.push('GEMINI_API_KEY not set - Gemini generation will require client-provided keys');
    }

    if (process.env.BASE_PATH && !process.env.BASE_PATH.startsWith('/')) {
        errors.push(`Invalid BASE_PATH: ${process.env.BASE_PATH}. Must start with '/'.`);
    }

    // Log warnings
    warnings.forEach(warning => logger.warn(`⚠️ ${warning}`));

    // Fail fast on errors
    if (errors.length > 0) {
        errors.forEach(error => logger.error(`❌ ${error}`));
        console.error('\n❌ FATAL: Environment validation failed. Exiting.');
        process.exit(1);
    }

    logger.info('✅ Environment validation passed');
}

// Run validation immediately
validateEnvironment();

// WSL Performance monitoring utility
const WSLMonitor = {
    // Track slow file operations (>100ms indicates WSL filesystem issues)
    trackFileOperation: async (operation, operationName) => {
        const startTime = Date.now();
        try {
            const result = await operation();
            const duration = Date.now() - startTime;

            if (duration > 100) {
                logger.warn(`⚠️ Slow file operation detected: ${operationName} took ${duration}ms (WSL filesystem delay)`);
            } else if (duration > 50) {
                logger.debug(`📊 File operation: ${operationName} took ${duration}ms`);
            }

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`❌ File operation failed: ${operationName} after ${duration}ms:`, error.message);
            throw error;
        }
    }
};

// Import configuration constants
const CONFIG = {
    TIMING: {
        DEFAULT_QUESTION_TIME: 20,
        LEADERBOARD_DISPLAY_TIME: 3000,
        GAME_START_DELAY: 3000,
        AUTO_ADVANCE_DELAY: 3000
    },
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { 'easy': 1, 'medium': 2, 'hard': 3 },
        DEFAULT_TOLERANCE: 0.1
    },
    LIMITS: {
        MAX_PLAYER_NAME_LENGTH: 20,
        MAX_FILE_SIZE: 5 * 1024 * 1024,
        PIN_LENGTH: 6
    },
    NETWORK: {
        PING_TIMEOUT: 60000,
        PING_INTERVAL: 25000,
        UPGRADE_TIMEOUT: 30000
    }
};

const app = express();
const server = http.createServer(app);

// Initialize CORS validation service
const corsValidator = new CORSValidationService();
corsValidator.logConfiguration();

// Initialize business services
const quizService = new QuizService(logger, WSLMonitor, 'quizzes');
const resultsService = new ResultsService(logger, 'results');
const qrService = new QRService(logger, BASE_PATH);
const metadataService = new MetadataService(logger, WSLMonitor, 'quizzes');

// Initialize Socket.IO game services
const gameSessionService = new GameSessionService(logger, CONFIG);
const playerManagementService = new PlayerManagementService(logger, CONFIG);
const questionFlowService = new QuestionFlowService(logger, gameSessionService);
const consensusFlowService = new ConsensusFlowService(logger, gameSessionService);

const io = socketIo(server, {
    cors: corsValidator.getSocketIOCorsConfig(),
    pingTimeout: CONFIG.NETWORK.PING_TIMEOUT,
    pingInterval: CONFIG.NETWORK.PING_INTERVAL,
    upgradeTimeout: CONFIG.NETWORK.UPGRADE_TIMEOUT,
    allowUpgrades: true
});

// Initialize Socket.IO event batching service for high-frequency events
// Batches answer-statistics, player-answered, and leaderboard-update events
const socketBatchService = new SocketBatchService(io, logger, {
    batchInterval: 500,  // Flush every 500ms
    maxBatchSize: 50,    // Or when 50 events are queued
    enabled: true        // Enable batching in production
});

// Inject SocketBatchService into GameSessionService for room cleanup
gameSessionService.setSocketBatchService(socketBatchService);

// Initialize socket rate limiter
const socketRateLimiter = new SocketRateLimiter(logger);
socketRateLimiter.startCleanup();

// Helper function for socket event rate limiting
function checkRateLimit(socketId, eventName, maxPerSecond = 10, socket = null) {
    return socketRateLimiter.checkRateLimit(socketId, eventName, maxPerSecond, socket);
}

// Initialize graceful shutdown handler
const gracefulShutdownHandler = new GracefulShutdown(logger, { forceTimeout: 10000 });

app.use(cors(corsValidator.getExpressCorsConfig()));

// Add metrics middleware for Prometheus monitoring
app.use(metricsService.metricsMiddleware);

// Rate limiting removed - not needed for local classroom deployment

// Add compression middleware for better mobile performance
app.use(compression({
    // Enable compression for all requests
    filter: (req, res) => {
    // Don't compress responses if the request includes a cache-busting parameter
    // (This helps avoid compressing already optimized content)
        if (req.headers['x-no-compression']) {
            return false;
        }

        // Use the default compression filter for everything else
        return compression.filter(req, res);
    },
    // Optimize compression for mobile devices
    level: 6, // Good balance between compression and CPU usage (1-9, 6 is default)
    threshold: 1024, // Only compress if larger than 1KB
    // Add response headers to help with caching
    chunkSize: 16 * 1024, // 16KB chunks
    windowBits: 15,
    memLevel: 8
}));

// Body parsing middleware - configure properly for file uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Conditional caching based on environment
app.use(createCacheControlMiddleware(isProduction));

// Static file serving with mobile-optimized caching headers and proper MIME types
// NOTE: Serve from root - Kubernetes Ingress strips the base path before forwarding
// Only the <base> tag in HTML uses the full path
app.use(express.static('public', createStaticFilesConfig(isProduction)));

// Error handling middleware for static files
app.use(createStaticErrorHandler(logger));

// Special handling for JavaScript files to prevent 500 errors
app.get('/js/*', createJsFileHandler(logger, isProduction, __dirname));

// Serve debug tools from debug directory
app.use('/debug', express.static('debug', createDebugStaticConfig()));

// Ensure directories exist (async startup)
(async () => {
    const dirsToCreate = ['quizzes', 'results', 'public/uploads'];
    for (const dir of dirsToCreate) {
        try {
            await fs.promises.mkdir(dir, { recursive: true });
        } catch (err) {
            // Ignore EEXIST errors (directory already exists)
            if (err.code !== 'EEXIST') {
                logger.error(`Failed to create directory ${dir}:`, err.message);
            }
        }
    }
    logger.debug('Required directories verified');
})();

// Dynamic index.html serving with environment-specific base path
// This route serves index.html with the correct <base> tag for the environment
const serveIndexHtml = (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');

    fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) {
            logger.error('Error reading index.html:', err);
            return res.status(500).send('Error loading application');
        }

        // Replace the base href with the environment-specific value
        const modifiedHtml = data.replace(
            /<base href="[^"]*">/,
            `<base href="${BASE_PATH}">`
        );

        logger.debug(`Serving index.html with base path: ${BASE_PATH}`);

        // Never cache index.html - always fetch fresh for new deployments
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(modifiedHtml);
    });
};

// Serve index.html at root (Ingress strips the /quizmaster/ prefix)
app.get('/', serveIndexHtml);

// ============================================================================
// File Upload Routes (images, PDF, DOCX, PPTX)
// ============================================================================
app.use(createFileUploadRoutes({ logger, CONFIG }));

// ============================================================================
// AI Generation Routes (Ollama, Claude, Gemini, URL extraction)
// ============================================================================
app.use('/api', createAIGenerationRoutes({
    logger,
    validateBody,
    claudeGenerateSchema,
    geminiGenerateSchema,
    extractUrlSchema,
    isProduction
}));

// Save quiz endpoint
app.post('/api/save-quiz', validateBody(saveQuizSchema), async (req, res) => {
    try {
        const { title, questions, password } = req.validatedBody;
        const result = await quizService.saveQuiz(title, questions);

        // Register quiz in metadata and optionally set password
        if (result.filename) {
            await metadataService.registerQuiz(result.filename, title);
            if (password) {
                await metadataService.setQuizPassword(result.filename, password);
            }
        }

        res.json(result);
    } catch (error) {
        logger.error('Save quiz error:', error);
        res.status(400).json({ error: error.message || 'Failed to save quiz' });
    }
});

// ============================================================================
// Quiz Management Routes
// ============================================================================
app.use(createQuizManagementRoutes({
    quizService,
    resultsService,
    metadataService,
    gameSessionService,
    qrService,
    logger,
    validateBody,
    validateParams,
    schemas: {
        createFolderSchema,
        renameFolderSchema,
        moveFolderSchema,
        setPasswordSchema,
        updateQuizMetadataSchema,
        unlockSchema,
        folderIdParamSchema
    }
}));


// Debug endpoint to check file existence (disabled in production)
if (!isProduction) {
    app.get('/api/debug/files', (req, res) => {
        const checkFiles = [
            'js/main.js',
            'js/core/app.js',
            'js/utils/translation-manager.js',
            'css/main.css',
            'index.html'
        ];

        const fileStatus = {};
        checkFiles.forEach(file => {
            const fullPath = path.join(__dirname, 'public', file);
            fileStatus[file] = {
                exists: fs.existsSync(fullPath),
                path: fullPath,
                stats: fs.existsSync(fullPath) ? fs.statSync(fullPath) : null
            };
        });

        res.json({
            environment: process.env.NODE_ENV,
            railway_env: process.env.RAILWAY_ENVIRONMENT,
            isProduction: isProduction,
            cwd: process.cwd(),
            __dirname: __dirname,
            publicPath: path.join(__dirname, 'public'),
            files: fileStatus
        });
    });

    // Debug endpoint to list public directory contents
    app.get('/api/debug/directory', (req, res) => {
        const listDirectory = (dir, maxDepth = 2, currentDepth = 0) => {
            if (currentDepth > maxDepth) return {};

            try {
                const items = fs.readdirSync(dir);
                const result = {};

                items.forEach(item => {
                    const itemPath = path.join(dir, item);
                    const stat = fs.statSync(itemPath);

                    if (stat.isDirectory() && currentDepth < maxDepth) {
                        result[item] = listDirectory(itemPath, maxDepth, currentDepth + 1);
                    } else {
                        result[item] = {
                            type: stat.isDirectory() ? 'directory' : 'file',
                            size: stat.size,
                            modified: stat.mtime
                        };
                    }
                });

                return result;
            } catch (error) {
                return { error: error.message };
            }
        };

        const publicDir = path.join(__dirname, 'public');
        res.json({
            publicDirectory: publicDir,
            exists: fs.existsSync(publicDir),
            contents: fs.existsSync(publicDir) ? listDirectory(publicDir) : null
        });
    });
} // End of !isProduction debug endpoints block

// Simple ping endpoint for connection status monitoring
app.get('/api/ping', (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: 'Quizix Pro',
        clientType: isMobile ? 'mobile' : 'desktop'
    });
});

// Game state management is now handled by GameSessionService and PlayerManagementService

// Socket.IO event handlers
io.on('connection', (socket) => {
    registerSocketHandlers(io, socket, {
        gameSessionService,
        playerManagementService,
        questionFlowService,
        consensusFlowService,
        socketBatchService,
        checkRateLimit,
        logger,
        CONFIG
    });
});

// Configure graceful shutdown with all services
gracefulShutdownHandler.setServer(server);
gracefulShutdownHandler.setSocketIO(io);
gracefulShutdownHandler.registerService(gameSessionService, 'GameSessionService');
gracefulShutdownHandler.registerService(socketBatchService, 'SocketBatchService');
gracefulShutdownHandler.registerService(socketRateLimiter, 'SocketRateLimiter');

// Register a custom service for game timer cleanup
gracefulShutdownHandler.registerService({
    shutdown: () => {
        gameSessionService.getAllGames().forEach(game => {
            game.clearTimers();
        });
        logger.info('All game timers cleared');
    }
}, 'GameTimers');

// Register all signal handlers
gracefulShutdownHandler.registerSignalHandlers();

// Health check endpoints for Kubernetes (extracted to routes/health-checks.js)
app.use(createHealthCheckRoutes({
    metricsService,
    gameSessionService,
    socketBatchService,
    basePath: BASE_PATH,
    isProduction
}));

const PORT = process.env.PORT || 3000;
const NETWORK_IP = process.env.NETWORK_IP;

/**
 * Detect local network IP address
 * Prioritizes 192.168.x.x (home networks), then 10.x.x.x (corporate), then any non-internal IPv4
 */
function detectLocalIP() {
    const interfaces = Object.values(os.networkInterfaces()).flat();
    const isIPv4External = (iface) => iface.family === 'IPv4' && !iface.internal;

    // Priority order: 192.168.x.x > 10.x.x.x > any external IPv4
    const prefixes = ['192.168.', '10.', ''];
    for (const prefix of prefixes) {
        const match = interfaces.find(iface =>
            isIPv4External(iface) && (prefix === '' || iface.address.startsWith(prefix))
        );
        if (match) return match.address;
    }
    return 'localhost';
}

// Initialize services before starting server
async function startServer() {
    // Initialize metadata service BEFORE accepting requests
    try {
        await metadataService.initialize();
        logger.info('Metadata service initialized');
    } catch (error) {
        logger.error('Failed to initialize metadata service:', error);
        // Continue anyway - basic functionality should still work
    }

    server.listen(PORT, '0.0.0.0', () => {
        let localIP = 'localhost';

        if (NETWORK_IP) {
            localIP = NETWORK_IP;
            logger.info(`Using manual IP: ${localIP}`);
        } else {
            localIP = detectLocalIP();
        }

        logger.info(`Network access: http://${localIP}:${PORT}`);
        logger.info(`Local access: http://localhost:${PORT}`);
        logger.info(`Server running on port ${PORT}`);

        if (localIP.startsWith('172.')) {
            logger.info('');
            logger.info('WSL DETECTED: If you can\'t connect from your phone:');
            logger.info('1. Find your Windows IP: run "ipconfig" in Windows Command Prompt');
            logger.info('2. Look for "Wireless LAN adapter Wi-Fi" or "Ethernet adapter"');
            logger.info('3. Use that IP address instead of the one shown above');
            logger.info('4. Or restart with: NETWORK_IP=your.windows.ip npm start');
            logger.info('');
        }
    });
}

// Start the server
startServer().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
});
