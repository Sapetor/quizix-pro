// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
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
const { QRService } = require('./services/qr-service');
const { GameSessionService } = require('./services/game-session-service');
const { PlayerManagementService } = require('./services/player-management-service');
const { QuestionFlowService } = require('./services/question-flow-service');

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
        AUTO_ADVANCE_DELAY: 3000,
    },
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { 'easy': 1, 'medium': 2, 'hard': 3 },
        DEFAULT_TOLERANCE: 0.1,
    },
    LIMITS: {
        MAX_PLAYER_NAME_LENGTH: 20,
        MAX_FILE_SIZE: 5 * 1024 * 1024,
        PIN_LENGTH: 6,
    },
    NETWORK: {
        PING_TIMEOUT: 60000,
        PING_INTERVAL: 25000,
        UPGRADE_TIMEOUT: 30000,
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

// Initialize Socket.IO game services
const gameSessionService = new GameSessionService(logger, CONFIG);
const playerManagementService = new PlayerManagementService(logger, CONFIG);
const questionFlowService = new QuestionFlowService(logger, gameSessionService);

const io = socketIo(server, {
  cors: corsValidator.getSocketIOCorsConfig(),
  pingTimeout: CONFIG.NETWORK.PING_TIMEOUT,
  pingInterval: CONFIG.NETWORK.PING_INTERVAL,
  upgradeTimeout: CONFIG.NETWORK.UPGRADE_TIMEOUT,
  allowUpgrades: true
});

app.use(cors(corsValidator.getExpressCorsConfig()));

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
app.use((req, res, next) => {
    // Only disable caching for development, not production
    if (!isProduction) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Expires', '-1');
        res.set('Pragma', 'no-cache');
    }
    next();
});

// Static file serving with mobile-optimized caching headers and proper MIME types
// NOTE: Serve from root - Kubernetes Ingress strips the base path before forwarding
// Only the <base> tag in HTML uses the full path
app.use(express.static('public', {
  index: false,         // Disable automatic index.html serving
  // Balanced caching for mobile and WSL performance
  maxAge: isProduction ? '1y' : '4h', // Increased dev cache for mobile
  etag: true,           // Enable ETags for efficient cache validation
  lastModified: true,   // Include Last-Modified headers
  cacheControl: true,   // Enable Cache-Control headers

  // Mobile-optimized headers with proper MIME types for ES6 modules
  setHeaders: (res, path, stat) => {
    const userAgent = res.req.headers['user-agent'] || '';
    const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    // Critical fix: Proper MIME types for JavaScript modules
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      // Reduced cache time for development to see changes quickly
      const maxAge = isProduction
        ? (isMobile ? 172800 : 86400) // Production: 48 hours mobile, 24 hours desktop
        : (isMobile ? 300 : 300);     // Development: 5 minutes for quick updates
      res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
      res.setHeader('Vary', 'Accept-Encoding, User-Agent');
    }

    // CSS files
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      const maxAge = isProduction
        ? (isMobile ? 172800 : 86400)
        : (isMobile ? 300 : 300);
      res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
      res.setHeader('Vary', 'Accept-Encoding, User-Agent');
    }

    // HTML files
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }

    // JSON files
    if (path.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }

    // Optimize image caching for mobile bandwidth
    if (path.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      const maxAge = isMobile ? 7200 : 3600; // 2 hours mobile, 1 hour desktop
      res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    }

    // Special handling for index.html - shorter cache but with validation
    if (path.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate'); // 5 minutes with validation
      res.setHeader('Vary', 'Accept-Encoding, User-Agent');
    }

    // Enable compression for text-based files
    if (path.match(/\.(js|css|html|json|svg|txt)$/i)) {
      res.setHeader('Vary', 'Accept-Encoding, User-Agent');
    }

    // Mobile-specific optimizations
    if (isMobile) {
      // Add mobile-friendly headers
      res.setHeader('X-Mobile-Optimized', 'true');

      // Enable keep-alive for mobile connections
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Keep-Alive', 'timeout=30, max=100');
    }
  }
}));

// Error handling middleware for static files
app.use((err, req, res, next) => {
  if (err) {
    logger.error('Static file serving error:', err);
    logger.error('Request path:', req.path);
    logger.error('Request method:', req.method);
  }
  next(err);
});

// Special handling for JavaScript files to prevent 500 errors
app.get('/js/*', (req, res, next) => {
  try {
    const filePath = path.join(__dirname, 'public', req.path);
    logger.info(`JS request: ${req.path} -> ${filePath}`);
    
    // Check if file exists before attempting to serve
    if (!fs.existsSync(filePath)) {
      logger.error(`JavaScript file not found: ${req.path} (${filePath})`);
      return res.status(404).json({ 
        error: 'File not found', 
        path: req.path,
        fullPath: filePath,
        exists: false 
      });
    }
    
    // Log file info
    const stats = fs.statSync(filePath);
    logger.info(`JS file found: ${req.path}, size: ${stats.size} bytes`);
    
    // Set proper headers for JavaScript files
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cache-Control', isProduction ? 'public, max-age=86400' : 'no-cache');
    
    // Read and send file directly to avoid express.static issues
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        logger.error(`Error reading JS file ${req.path}:`, err);
        return res.status(500).json({ error: 'Failed to read file', details: err.message });
      }
      res.send(data);
    });
    
  } catch (error) {
    logger.error(`JS file handler error for ${req.path}:`, error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Serve debug tools from debug directory
app.use('/debug', express.static('debug', {
  maxAge: 0, // No caching for debug files
  etag: false,
  cacheControl: false
}));

// Ensure directories exist
if (!fs.existsSync('quizzes')) {
  fs.mkdirSync('quizzes');
}
if (!fs.existsSync('results')) {
  fs.mkdirSync('results');
}
if (!fs.existsSync('public/uploads')) {
  fs.mkdirSync('public/uploads', { recursive: true });
  logger.info('Created uploads directory: public/uploads');
}

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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    res.send(modifiedHtml);
  });
};

// Serve index.html at root (Ingress strips the /quizmaster/ prefix)
app.get('/', serveIndexHtml);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const randomBytes = crypto.randomBytes(16).toString('hex');
    cb(null, Date.now() + '-' + randomBytes + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: CONFIG.LIMITS.MAX_FILE_SIZE,
    files: 1 // Only allow 1 file at a time
  },
  fileFilter: (req, file, cb) => {
    logger.debug(`Upload filter check: ${file.originalname}, ${file.mimetype}, ${file.size || 'unknown size'}`);
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      logger.warn(`Rejected file: ${file.originalname} - invalid type: ${file.mimetype}`);
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      logger.warn('Upload attempt with no file');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Enhanced debugging for Ubuntu binary file issues
    logger.info(`File uploaded successfully: ${req.file.filename}`);
    logger.debug(`Upload details:`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      destination: req.file.destination,
      filename: req.file.filename,
      path: req.file.path
    });

    // Verify the file was actually written correctly
    if (fs.existsSync(req.file.path)) {
      const stats = fs.statSync(req.file.path);
      logger.debug(`File verification: ${stats.size} bytes on disk`);

      if (stats.size === 0) {
        logger.error('WARNING: Uploaded file is empty (0 bytes)!');
        fs.unlinkSync(req.file.path); // Clean up empty file
        return res.status(500).json({ error: 'File upload failed - empty file' });
      }

      if (stats.size !== req.file.size) {
        logger.warn(`File size mismatch: expected ${req.file.size}, got ${stats.size}`);
      }

      // Verify actual file content matches claimed type (magic byte check)
      // Use try/finally to ensure file descriptor is always closed
      let fd = null;
      const buffer = Buffer.alloc(12);
      try {
        fd = fs.openSync(req.file.path, 'r');
        fs.readSync(fd, buffer, 0, 12, 0);
      } finally {
        if (fd !== null) {
          fs.closeSync(fd);
        }
      }

      // Detect image type from magic bytes
      const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      const isGIF = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
      const isWebP = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
                     buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
      const isBMP = buffer[0] === 0x42 && buffer[1] === 0x4D;

      const isValidImage = isJPEG || isPNG || isGIF || isWebP || isBMP;

      if (!isValidImage) {
        logger.warn(`File content doesn't match image signature: ${req.file.filename}`);
        fs.unlinkSync(req.file.path); // Delete suspicious file
        return res.status(400).json({ error: 'Invalid image file content' });
      }

      // Convert to WebP for better compression (skip if already WebP or animated GIF)
      let webpUrl = null;
      let webpFilename = null;
      const originalUrl = `/uploads/${req.file.filename}`;

      // Skip WebP conversion for already-WebP files and GIFs (to preserve animations)
      if (!isWebP && !isGIF) {
        try {
          // Generate WebP filename (replace extension with .webp)
          const baseName = req.file.filename.replace(/\.[^.]+$/, '');
          webpFilename = `${baseName}.webp`;
          const webpPath = path.join(req.file.destination, webpFilename);

          // Convert to WebP with quality setting (80 is a good balance)
          await sharp(req.file.path)
            .webp({ quality: 80 })
            .toFile(webpPath);

          const webpStats = fs.statSync(webpPath);
          const originalSize = stats.size;
          const webpSize = webpStats.size;
          const savings = ((originalSize - webpSize) / originalSize * 100).toFixed(1);

          logger.info(`WebP conversion: ${req.file.filename} -> ${webpFilename} (${savings}% smaller)`);
          webpUrl = `/uploads/${webpFilename}`;
        } catch (conversionError) {
          // Log but don't fail - original file is still valid
          logger.warn(`WebP conversion failed for ${req.file.filename}:`, conversionError.message);
        }
      } else if (isWebP) {
        // File is already WebP, use it directly
        webpUrl = originalUrl;
        webpFilename = req.file.filename;
        logger.debug(`File already WebP: ${req.file.filename}`);
      } else {
        logger.debug(`Skipping WebP conversion for GIF: ${req.file.filename}`);
      }

      // Return both URLs - client can choose which to use
      res.json({
        filename: req.file.filename,
        url: originalUrl,
        webpFilename: webpFilename,
        webpUrl: webpUrl
      });
    } else {
      logger.error(`File not found after upload: ${req.file.path}`);
      return res.status(500).json({ error: 'File upload failed - file not saved' });
    }
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// PDF text extraction endpoint
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for PDFs
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Helper to add timeout to async operations
function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

app.post('/api/extract-pdf', pdfUpload.single('pdf'), async (req, res) => {
  const PDF_PARSE_TIMEOUT_MS = 30000; // 30 second timeout for PDF parsing

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // Reject very large files early (before parsing)
    const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
    if (req.file.size > MAX_PDF_SIZE) {
      return res.status(413).json({
        error: 'PDF too large',
        message: 'PDF file exceeds 10MB limit. Please use a smaller file or copy text manually.'
      });
    }

    // Dynamic import of pdf-parse (optional dependency)
    let pdfParse;
    try {
      pdfParse = require('pdf-parse');
    } catch (err) {
      logger.warn('pdf-parse not installed. Run: npm install pdf-parse');
      return res.status(501).json({
        error: 'PDF extraction not available',
        message: 'Server does not have PDF parsing capability. Please copy and paste the text content manually.'
      });
    }

    // Parse with timeout to prevent hanging on malformed PDFs
    const pdfData = await withTimeout(
      pdfParse(req.file.buffer),
      PDF_PARSE_TIMEOUT_MS,
      'PDF parsing timed out. The file may be too complex or corrupted.'
    );

    logger.info(`PDF extracted: ${req.file.originalname}, ${pdfData.numpages} pages, ${pdfData.text.length} chars`);

    res.json({
      text: pdfData.text,
      pages: pdfData.numpages,
      info: pdfData.info
    });
  } catch (error) {
    logger.error('PDF extraction error:', error);

    // Provide user-friendly error messages
    if (error.message.includes('timed out')) {
      return res.status(408).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to extract text from PDF: ' + error.message });
  }
});

// Save quiz endpoint
app.post('/api/save-quiz', async (req, res) => {
  try {
    const { title, questions } = req.body;
    const result = await quizService.saveQuiz(title, questions);
    res.json(result);
  } catch (error) {
    logger.error('Save quiz error:', error);
    res.status(400).json({ error: error.message || 'Failed to save quiz' });
  }
});

// Load quiz endpoint
app.get('/api/quizzes', async (req, res) => {
  try {
    const quizzes = await quizService.listQuizzes();
    res.json(quizzes);
  } catch (error) {
    logger.error('Load quizzes error:', error);
    res.status(500).json({ error: 'Failed to load quizzes' });
  }
});

// Load specific quiz endpoint
app.get('/api/quiz/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const data = await quizService.loadQuiz(filename);
    res.json(data);
  } catch (error) {
    logger.error('Load quiz error:', error);
    const statusCode = error.message === 'Quiz not found' ? 404 : 400;
    res.status(statusCode).json({ error: error.message || 'Failed to load quiz' });
  }
});

// Save quiz results endpoint
app.post('/api/save-results', async (req, res) => {
  try {
    const { quizTitle, gamePin, results, startTime, endTime, questions } = req.body;
    const result = await resultsService.saveResults(quizTitle, gamePin, results, startTime, endTime, questions);
    res.json(result);
  } catch (error) {
    logger.error('Save results error:', error);
    res.status(400).json({ error: error.message || 'Failed to save results' });
  }
});

// Get list of saved quiz results endpoint
app.get('/api/results', async (req, res) => {
  try {
    const results = await resultsService.listResults();
    res.json(results);
  } catch (error) {
    logger.error('Error listing results:', error);
    res.status(500).json({ error: 'Failed to list results' });
  }
});

// Delete quiz result endpoint (must be before GET route to avoid conflicts)
// Security: Requires same-origin and confirmation parameter
app.delete('/api/results/:filename', async (req, res) => {
  try {
    // Validate origin - must be same host
    const origin = req.get('origin') || req.get('referer');
    const host = req.get('host');
    if (origin && !origin.includes(host)) {
      logger.warn(`Rejected cross-origin delete attempt from ${origin}`);
      return res.status(403).json({ error: 'Cross-origin requests not allowed' });
    }

    // Require confirmation parameter to prevent accidental deletes
    if (req.query.confirm !== 'true') {
      return res.status(400).json({ error: 'Delete requires confirm=true parameter' });
    }

    const filename = req.params.filename;

    // Audit log the deletion
    logger.info(`Result file deletion requested: ${filename} from ${req.ip}`);

    const result = await resultsService.deleteResult(filename);
    res.json(result);
  } catch (error) {
    logger.error('Error deleting result file:', error);
    const statusCode = error.message === 'Result file not found' ? 404 : 400;
    res.status(statusCode).json({ error: error.message || 'Failed to delete result file' });
  }
});

// Get specific quiz result file endpoint
app.get('/api/results/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const data = await resultsService.getResult(filename);
    res.json(data);
  } catch (error) {
    logger.error('Error retrieving result file:', error);
    const statusCode = error.message === 'Result file not found' ? 404 : 400;
    res.status(statusCode).json({ error: error.message || 'Failed to retrieve result file' });
  }
});

// Export quiz results in different formats endpoint
app.get('/api/results/:filename/export/:format', async (req, res) => {
  try {
    const { filename, format } = req.params;
    const exportType = req.query.type || 'analytics';
    
    const exportData = await resultsService.exportResults(filename, format, exportType);
    
    // Set response headers - sanitize filename to prevent header injection
    const sanitizedFilename = exportData.filename.replace(/[\r\n"]/g, '_');
    res.setHeader('Content-Type', exportData.type);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
    
    // Send content (string for CSV, use send(); JSON use json())
    if (exportData.type === 'text/csv') {
      res.send(exportData.content);
    } else {
      res.send(exportData.content);
    }
  } catch (error) {
    logger.error('Error exporting result file:', error);
    const statusCode = error.message === 'Result file not found' ? 404 : 400;
    res.status(statusCode).json({ error: error.message || 'Failed to export result file' });
  }
});


// Get list of active games endpoint
app.get('/api/active-games', (req, res) => {
  try {
    const allGames = Array.from(gameSessionService.getAllGames().values()).map(game => ({
      pin: game.pin,
      title: game.quiz.title || 'Untitled Quiz',
      playerCount: game.players.size,
      questionCount: game.quiz.questions.length,
      gameState: game.gameState,
      created: new Date().toISOString()
    }));

    const activeGames = allGames.filter(game => game.gameState === 'lobby');

    res.json({
      games: activeGames,
      debug: {
        totalGames: allGames.length,
        allGames: allGames
      }
    });
  } catch (error) {
    logger.error('Active games fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch active games' });
  }
});

// Generate QR code endpoint with caching optimization
app.get('/api/qr/:pin', async (req, res) => {
  try {
    const { pin } = req.params;

    // Validate PIN format - must be 6 digits
    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'Invalid PIN format. Must be 6 digits.' });
    }

    const game = gameSessionService.getGame(pin);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Generate QR code with caching
    const responseData = await qrService.generateQRCode(pin, game, req);

    // Apply cache headers
    const headers = qrService.getCacheHeaders(pin);
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    res.json(responseData);
  } catch (error) {
    logger.error(`QR code generation error for PIN ${req.params.pin}:`, error);
    res.status(500).json({ error: error.message || 'Failed to generate QR code' });
  }
});



// Fetch available Ollama models endpoint
// Ollama endpoint is configurable via OLLAMA_URL env var for K8s deployments
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

app.get('/api/ollama/models', async (req, res) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    
    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch Ollama models' });
    }
    
    const data = await response.json();
    const models = data.models || [];
    
    res.json({
      models: models.map(model => ({
        name: model.name,
        size: model.size,
        modified_at: model.modified_at
      }))
    });
  } catch (error) {
    logger.error('Ollama models fetch error:', error);
    res.status(500).json({ error: 'Failed to connect to Ollama' });
  }
});

// BYOK (Bring Your Own Key) rate limiter for Claude API
// Prevents abuse when users provide their own API keys
const byokRateLimits = new Map();
const BYOK_MAX_REQUESTS_PER_MINUTE = 10;
const BYOK_WINDOW_MS = 60 * 1000; // 1 minute

function checkByokRateLimit(ip) {
  const now = Date.now();
  const limit = byokRateLimits.get(ip);

  if (!limit || now > limit.resetTime) {
    byokRateLimits.set(ip, { count: 1, resetTime: now + BYOK_WINDOW_MS });
    return { allowed: true, remaining: BYOK_MAX_REQUESTS_PER_MINUTE - 1 };
  }

  if (limit.count >= BYOK_MAX_REQUESTS_PER_MINUTE) {
    const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
    return { allowed: false, retryAfter, remaining: 0 };
  }

  limit.count++;
  return { allowed: true, remaining: BYOK_MAX_REQUESTS_PER_MINUTE - limit.count };
}

// Cleanup old BYOK rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, limit] of byokRateLimits.entries()) {
    if (now > limit.resetTime + 60000) {
      byokRateLimits.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// Claude API proxy endpoint
// Supports two modes:
// 1. Server-side key: Set CLAUDE_API_KEY env var (recommended for production)
// 2. BYOK (Bring Your Own Key): Client provides key in request body
app.post('/api/claude/generate', async (req, res) => {
  try {
    const { prompt, apiKey: clientApiKey, numQuestions, model } = req.body;

    // More detailed validation
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Use server-side API key if available, otherwise require client key
    const serverApiKey = process.env.CLAUDE_API_KEY;
    const apiKey = serverApiKey || clientApiKey;

    // Apply rate limiting for BYOK mode only (server key has no limit)
    if (!serverApiKey && clientApiKey) {
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      const rateCheck = checkByokRateLimit(clientIP);

      if (!rateCheck.allowed) {
        logger.warn(`BYOK rate limit exceeded for IP: ${clientIP}`);
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Too many requests. Please wait ${rateCheck.retryAfter} seconds.`,
          retryAfter: rateCheck.retryAfter
        });
      }

      // Add rate limit headers
      res.set('X-RateLimit-Remaining', rateCheck.remaining.toString());
    }

    if (!apiKey) {
      return res.status(400).json({
        error: 'API key is required',
        hint: serverApiKey ? undefined : 'Set CLAUDE_API_KEY environment variable or provide key in request'
      });
    }

    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ error: 'Valid API key is required' });
    }

    // Log which mode is being used (without exposing key)
    if (serverApiKey) {
      logger.debug('Using server-side Claude API key');
    } else {
      logger.debug('Using client-provided Claude API key');
    }

    // Import node-fetch for HTTP requests
    const { default: fetchFunction } = await import('node-fetch');

    // Calculate max_tokens based on number of questions
    // ~2000 tokens per question to allow for LaTeX, explanations, and safety margin
    const questionCount = Math.max(1, Math.min(numQuestions || 5, 20));
    const calculatedMaxTokens = Math.max(8192, questionCount * 2000);

    // Use model from request, fall back to env var, then default (using alias for auto-updates)
    const selectedModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
    logger.info(`Using Claude model: ${selectedModel}`);

    const requestBody = {
      model: selectedModel,
      max_tokens: calculatedMaxTokens,
      messages: [
        {
          role: 'user',
          content: prompt
        },
        {
          role: 'assistant',
          content: '['  // Prefill technique: force JSON array output
        }
      ]
    };

    const response = await fetchFunction('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Claude API error:', response.status);
      
      let errorMessage = `Claude API error: ${response.status}`;
      if (response.status === 401) {
        errorMessage = 'Invalid API key. Please check your Claude API key and try again.';
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
      } else if (response.status === 400) {
        errorMessage = 'Invalid request. Please check your input and try again.';
      }
      
      return res.status(response.status).json({
        error: errorMessage,
        details: isProduction ? undefined : errorText // Hide details in production
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('Claude proxy error:', error.message);
    res.status(500).json({
      error: 'Failed to connect to Claude API',
      details: isProduction ? undefined : error.message // Hide details in production
    });
  }
});

// Check if server has configured API keys (for client UI)
app.get('/api/ai/config', (req, res) => {
  res.json({
    claudeKeyConfigured: !!process.env.CLAUDE_API_KEY,
    ollamaAvailable: true, // Ollama doesn't require API key
    // Don't expose actual keys, just whether they're configured
  });
});

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

// Socket.IO rate limiting helper
const socketRateLimits = new Map();

function checkRateLimit(socketId, eventName, maxPerSecond = 10, socket = null) {
  const key = `${socketId}:${eventName}`;
  const now = Date.now();
  const limit = socketRateLimits.get(key);

  if (!limit || now > limit.resetTime) {
    socketRateLimits.set(key, { count: 1, resetTime: now + 1000 });
    return true;
  }

  if (limit.count >= maxPerSecond) {
    logger.warn(`Rate limit exceeded for socket ${socketId} on event ${eventName}`);
    // Notify client about rate limiting
    if (socket) {
      socket.emit('rate-limited', { event: eventName, message: 'Too many requests, please slow down' });
    }
    return false;
  }

  limit.count++;
  return true;
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, limit] of socketRateLimits.entries()) {
    if (now > limit.resetTime + 5000) {
      socketRateLimits.delete(key);
    }
  }
}, 10000);

// Socket.IO event handlers
io.on('connection', (socket) => {

  socket.on('host-join', (data) => {
    if (!checkRateLimit(socket.id, 'host-join', 5, socket)) return;
    try {
      const clientIP = socket.handshake.address;

      logger.debug('host-join event received');
      logger.debug('host-join received data:', JSON.stringify(data, null, 2));
      logger.debug('quiz title from data:', data?.quiz?.title);

      if (!data || !data.quiz || !Array.isArray(data.quiz.questions)) {
        socket.emit('error', { message: 'Invalid quiz data' });
        return;
      }

      const { quiz } = data;
      logger.debug('extracted quiz title:', quiz.title);

      if (quiz.questions.length === 0) {
        socket.emit('error', { message: 'Quiz must have at least one question' });
        return;
      }

      // Check if host already has an existing game
      const existingGame = gameSessionService.findGameByHost(socket.id);
      if (existingGame) {
        existingGame.endQuestion();
        io.to(`game-${existingGame.pin}`).emit('game-ended', { reason: 'Host started new game' });
        gameSessionService.deleteGame(existingGame.pin);
      }

      // Create new game
      const game = gameSessionService.createGame(socket.id, quiz);

      socket.join(`game-${game.pin}`);
      logger.debug('Sending game-created with title:', quiz.title);
      socket.emit('game-created', {
        pin: game.pin,
        gameId: game.id,
        title: quiz.title
      });

      socket.broadcast.emit('game-available', {
        pin: game.pin,
        title: quiz.title,
        questionCount: quiz.questions.length,
        created: game.createdAt
      });
    } catch (error) {
      logger.error('Error in host-join handler:', error);
      socket.emit('error', { message: 'Failed to create game' });
    }
  });

  socket.on('player-join', (data) => {
    if (!checkRateLimit(socket.id, 'player-join', 5, socket)) return;
    try {
      if (!data || typeof data !== 'object') {
        socket.emit('error', { message: 'Invalid request data' });
        return;
      }

      const { pin, name } = data;
      const game = gameSessionService.getGame(pin);

      const result = playerManagementService.handlePlayerJoin(
        socket.id,
        pin,
        name,
        game,
        socket,
        io
      );

      if (!result.success) {
        socket.emit('error', { message: result.error });
      }
    } catch (error) {
      logger.error('Error in player-join handler:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('start-game', () => {
    if (!checkRateLimit(socket.id, 'start-game', 3, socket)) return;
    try {
      const game = gameSessionService.findGameByHost(socket.id);
      if (!game) {
        return;
      }

      gameSessionService.startGame(game, io);
    } catch (error) {
      logger.error('Error in start-game handler:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  socket.on('submit-answer', (data) => {
    if (!checkRateLimit(socket.id, 'submit-answer', 3, socket)) return; // Strict limit: 3 per second
    try {
      if (!data || data.answer === undefined) {
        return;
      }

      const { answer, type } = data;
      const playerData = playerManagementService.getPlayer(socket.id);
      if (!playerData) return;

      const game = gameSessionService.getGame(playerData.gamePin);

      questionFlowService.handleAnswerSubmission(
        socket.id,
        answer,
        type,
        playerData,
        game,
        socket,
        io
      );
    } catch (error) {
      logger.error('Error in submit-answer handler:', error);
    }
  });

  socket.on('next-question', () => {
    if (!checkRateLimit(socket.id, 'next-question', 5, socket)) return;
    try {
      logger.debug('NEXT-QUESTION EVENT RECEIVED');
      const game = gameSessionService.findGameByHost(socket.id);

      if (!game) {
        logger.debug('No game found for host');
        return;
      }

      logger.debug('Game state before next-question:', {
        gameState: game.gameState,
        currentQuestion: game.currentQuestion,
        totalQuestions: game.quiz.questions.length,
        gamePin: game.pin
      });

      gameSessionService.manualAdvanceToNextQuestion(game, io);
    } catch (error) {
      logger.error('SERVER ERROR in next-question handler:', error);
      logger.error('Error stack:', error.stack);
    }
  });

  // Handle intentional leave (player clicks leave button)
  socket.on('leave-game', () => {
    try {
      const playerData = playerManagementService.getPlayer(socket.id);
      if (playerData) {
        const game = gameSessionService.getGame(playerData.gamePin);
        playerManagementService.handlePlayerDisconnect(socket.id, game, io);
        logger.info(`Player ${playerData.name} left game ${playerData.gamePin} intentionally`);
      }
    } catch (error) {
      logger.error('Error handling leave-game:', error);
    }
  });

  socket.on('disconnect', () => {
    try {
      // Handle player disconnect
      const playerData = playerManagementService.getPlayer(socket.id);
      if (playerData) {
        const game = gameSessionService.getGame(playerData.gamePin);
        playerManagementService.handlePlayerDisconnect(socket.id, game, io);
      }

      // Handle host disconnect
      const hostedGame = gameSessionService.findGameByHost(socket.id);
      if (hostedGame) {
        playerManagementService.handleHostDisconnect(hostedGame, io);
        gameSessionService.deleteGame(hostedGame.pin);
      }

      // Clean up orphaned games
      gameSessionService.cleanupOrphanedGames(io);
    } catch (error) {
      logger.error('Error in disconnect handler:', error);
    }
  });
});

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed');

    io.close(() => {
      logger.info('Socket.IO server closed');

      // Clean up all game timers
      gameSessionService.getAllGames().forEach(game => {
        if (game.questionTimer) {
          clearTimeout(game.questionTimer);
        }
        if (game.advanceTimer) {
          clearTimeout(game.advanceTimer);
        }
      });

      logger.info('All timers cleared');
      logger.info('Server shutdown complete');
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.warn('Forcing server shutdown after 10 seconds...');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Handle Windows-specific signals
if (process.platform === 'win32') {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
  });
}

// Health check endpoints for Kubernetes
// Liveness probe - simple check if server is running
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Diagnostic endpoint to check BASE_PATH configuration
app.get('/debug/config', (req, res) => {
  res.status(200).json({
    BASE_PATH: BASE_PATH,
    BASE_PATH_raw: JSON.stringify(BASE_PATH),
    BASE_PATH_length: BASE_PATH.length,
    BASE_PATH_type: typeof BASE_PATH,
    BASE_PATH_equals_slash: BASE_PATH === '/',
    BASE_PATH_not_equals_slash: BASE_PATH !== '/',
    NODE_ENV: process.env.NODE_ENV,
    isProduction: isProduction,
    staticMountedAt: BASE_PATH !== '/' ? BASE_PATH : '/ (root)',
    timestamp: new Date().toISOString()
  });
});

// Readiness probe - check if server is ready to accept traffic
app.get('/ready', (req, res) => {
  try {
    // Check if required directories exist and are accessible
    const checks = {
      quizzes: fs.existsSync('quizzes') && fs.statSync('quizzes').isDirectory(),
      results: fs.existsSync('results') && fs.statSync('results').isDirectory(),
      uploads: fs.existsSync('public/uploads') && fs.statSync('public/uploads').isDirectory()
    };

    const allReady = Object.values(checks).every(check => check === true);

    if (allReady) {
      res.status(200).json({
        status: 'ready',
        checks,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        checks,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Readiness check error:', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

const PORT = process.env.PORT || 3000;
const NETWORK_IP = process.env.NETWORK_IP;

server.listen(PORT, '0.0.0.0', () => {
  let localIP = 'localhost';

  if (NETWORK_IP) {
    localIP = NETWORK_IP;
    logger.info(`Using manual IP: ${localIP}`);
  } else {
    const networkInterfaces = os.networkInterfaces();
    const interfaces = Object.values(networkInterfaces).flat();

    localIP = interfaces.find(iface =>
      iface.family === 'IPv4' &&
      !iface.internal &&
      iface.address.startsWith('192.168.')
    )?.address ||
    interfaces.find(iface =>
      iface.family === 'IPv4' &&
      !iface.internal &&
      iface.address.startsWith('10.')
    )?.address ||
    interfaces.find(iface =>
      iface.family === 'IPv4' &&
      !iface.internal
    )?.address || 'localhost';
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
