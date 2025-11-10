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
const compression = require('compression');
const { CORSValidationService } = require('./services/cors-validation-service');
const { QuestionTypeService } = require('./services/question-type-service');
const { QuizService } = require('./services/quiz-service');
const { ResultsService } = require('./services/results-service');
const { QRService } = require('./services/qr-service');

// Detect production environment (Railway sets NODE_ENV automatically)
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';

// Base path configuration for Kubernetes/path-based routing
// Auto-detect: production uses /quizmaster/, development uses /
const BASE_PATH = process.env.BASE_PATH || (isProduction ? '/quizmaster/' : '/');

// Server-side logging utility - temporarily verbose for debugging
const DEBUG = {
    ENABLED: true, // Always enabled for debugging
    LEVELS: { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 },
    CURRENT_LEVEL: 4 // Show all logs for debugging Railway issues
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
// NOTE: index.html is disabled from static serving so it can be handled by custom route
// Mount static files at BASE_PATH to support Kubernetes path-based routing
const staticMiddleware = express.static('public', {
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
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
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

app.post('/upload', upload.single('image'), (req, res) => {
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
        return res.status(500).json({ error: 'File upload failed - empty file' });
      }
      
      if (stats.size !== req.file.size) {
        logger.warn(`File size mismatch: expected ${req.file.size}, got ${stats.size}`);
      }
    } else {
      logger.error(`File not found after upload: ${req.file.path}`);
      return res.status(500).json({ error: 'File upload failed - file not saved' });
    }
    
    res.json({ filename: req.file.filename, url: `/uploads/${req.file.filename}` });
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
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
app.delete('/api/results/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
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
    
    // Set response headers
    res.setHeader('Content-Type', exportData.type);
    res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
    
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
    const allGames = Array.from(games.values()).map(game => ({
      pin: game.pin,
      title: game.quiz.title || 'Untitled Quiz',
      playerCount: game.players.size,
      questionCount: game.quiz.questions.length,
      gameState: game.gameState,
      created: new Date().toISOString()
    }));
    
    const activeGames = allGames.filter(game => game.gameState === 'lobby');
    
    allGames.forEach(game => {
    });
    
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
    const game = games.get(pin);
    
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
app.get('/api/ollama/models', async (req, res) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch('http://localhost:11434/api/tags');
    
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

// Claude API proxy endpoint
app.post('/api/claude/generate', async (req, res) => {
  try {
    const { prompt, apiKey } = req.body;
    
    // More detailed validation
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ error: 'Valid API key is required' });
    }
    
    // Import node-fetch for HTTP requests
    const { default: fetchFunction } = await import('node-fetch');
    
    const requestBody = {
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
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
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('Claude proxy error:', error.message);
    res.status(500).json({ 
      error: 'Failed to connect to Claude API',
      details: error.message
    });
  }
});


// Debug endpoint to check file existence
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

// Game state management
const games = new Map();
const players = new Map();

function generateGamePin() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (games.has(pin));
  return pin;
}

// Security: Validate filenames to prevent path traversal attacks
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return false;
  }
  
  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  
  // Check for absolute paths
  if (path.isAbsolute(filename)) {
    return false;
  }
  
  // Allow only alphanumeric characters, dots, hyphens, and underscores
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return false;
  }
  
  return true;
}

class Game {
  constructor(hostId, quiz) {
    this.id = uuidv4();
    this.pin = generateGamePin();
    this.hostId = hostId;
    this.quiz = quiz;
    this.players = new Map();
    this.currentQuestion = -1;
    this.gameState = 'lobby';
    this.questionStartTime = null;
    this.leaderboard = [];
    this.questionTimer = null;
    this.advanceTimer = null;
    this.isAdvancing = false;
    this.startTime = null;
    this.endTime = null;
    this.manualAdvancement = quiz.manualAdvancement || false;
  }

  addPlayer(playerId, playerName) {
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      score: 0,
      answers: []
    });
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  nextQuestion() {
    // Check if we can advance before incrementing
    const nextQuestionIndex = this.currentQuestion + 1;
    const hasMore = nextQuestionIndex < this.quiz.questions.length;
    
    logger.debug('nextQuestion() DEBUG:', {
      currentQuestion: this.currentQuestion,
      nextQuestionIndex: nextQuestionIndex,
      totalQuestions: this.quiz.questions.length,
      hasMore: hasMore,
      gamePin: this.pin
    });
    
    if (hasMore) {
      this.currentQuestion = nextQuestionIndex;
      this.gameState = 'question';
      this.questionTimer = null;
      this.advanceTimer = null;
      logger.debug('Advanced to question', this.currentQuestion + 1);
    } else {
      logger.debug('NO MORE QUESTIONS - should end game');
    }
    
    return hasMore;
  }
  
  saveResults() {
    try {
      const results = {
        quizTitle: this.quiz.title || 'Untitled Quiz',
        gamePin: this.pin,
        results: Array.from(this.players.values()).map(player => ({
          name: player.name,
          score: player.score,
          answers: player.answers
        })),
        startTime: this.startTime,
        endTime: this.endTime,
        // Simple addition: question info for formative assessment
        questions: this.quiz.questions.map((q, index) => ({
          questionNumber: index + 1,
          text: q.question || q.text,
          type: q.type || 'multiple-choice',
          correctAnswer: q.correctAnswer || q.correctAnswers,
          difficulty: q.difficulty || 'medium'
        }))
      };
      
      // Save to file via internal API call
      const filename = `results_${this.pin}_${Date.now()}.json`;
      fs.writeFileSync(path.join('results', filename), JSON.stringify(results, null, 2));
    } catch (error) {
      logger.error('Error saving game results:', error);
    }
  }

  endQuestion() {
    this.gameState = 'revealing';
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  submitAnswer(playerId, answer, answerType) {
    const player = this.players.get(playerId);
    if (!player) return false;

    const question = this.quiz.questions[this.currentQuestion];
    const questionType = question.type || 'multiple-choice';

    // Use QuestionTypeService for centralized scoring logic
    const correctAnswerKey = this.getCorrectAnswerKey(question);
    const options = questionType === 'numeric' ? { tolerance: question.tolerance || 0.1 } : {};

    let isCorrect = QuestionTypeService.scoreAnswer(
      questionType,
      answer,
      correctAnswerKey,
      options
    );

    const timeTaken = Date.now() - this.questionStartTime;
    const maxBonusTime = 10000;
    const timeBonus = Math.max(0, maxBonusTime - timeTaken);
    const difficultyMultiplier = {
      'easy': 1,
      'medium': 2,
      'hard': 3
    }[question.difficulty] || 2;

    const basePoints = 100 * difficultyMultiplier;
    const scaledTimeBonus = Math.floor(timeBonus * difficultyMultiplier / 10);

    // Handle partial credit for ordering questions
    let points = 0;
    if (question.type === 'ordering' && typeof isCorrect === 'number') {
      // isCorrect is a decimal (0-1) representing percentage correct
      points = Math.floor((basePoints + scaledTimeBonus) * isCorrect);
      // Convert to boolean for storage (consider >0.5 as correct for statistics)
      const wasCorrect = isCorrect >= 0.5;
      isCorrect = wasCorrect;
    } else {
      points = isCorrect ? basePoints + scaledTimeBonus : 0;
    }

    player.answers[this.currentQuestion] = {
      answer,
      isCorrect,
      points,
      timeMs: Date.now() - this.questionStartTime
    };
    player.score += points;

    return { isCorrect, points };
  }

  /**
   * Get the correct answer key for a question based on its type
   * Helper method to normalize different answer key formats
   */
  getCorrectAnswerKey(question) {
    const type = question.type || 'multiple-choice';

    switch (type) {
      case 'multiple-choice':
        // Registry uses "correctIndex" not "correctAnswer"
        return question.correctIndex !== undefined ? question.correctIndex : question.correctAnswer;

      case 'multiple-correct':
        // Registry uses "correctIndices" not "correctAnswers"
        return question.correctIndices || question.correctAnswers || [];

      case 'true-false':
      case 'numeric':
        return question.correctAnswer;

      case 'ordering':
        return question.correctOrder || [];

      default:
        return question.correctAnswer;
    }
  }

  updateLeaderboard() {
    this.leaderboard = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  getAnswerStatistics() {
    const question = this.quiz.questions[this.currentQuestion];
    
    if (!question) {
      return {
        totalPlayers: this.players.size,
        answeredPlayers: 0,
        answerCounts: {},
        questionType: 'multiple-choice'
      };
    }
    
    const stats = {
      totalPlayers: this.players.size,
      answeredPlayers: 0,
      answerCounts: {},
      questionType: question.type || 'multiple-choice'
    };

    if (question.type === 'multiple-choice' || question.type === 'multiple-correct') {
      question.options.forEach((_, index) => {
        stats.answerCounts[index] = 0;
      });
    } else if (question.type === 'true-false') {
      stats.answerCounts['true'] = 0;
      stats.answerCounts['false'] = 0;
    } else if (question.type === 'numeric') {
      stats.answerCounts = {};
    }

    Array.from(this.players.values()).forEach(player => {
      const playerAnswer = player.answers[this.currentQuestion];
      if (playerAnswer) {
        stats.answeredPlayers++;
        const answer = playerAnswer.answer;
        
        if (question.type === 'multiple-choice') {
          if (stats.answerCounts[answer] !== undefined) {
            stats.answerCounts[answer]++;
          }
        } else if (question.type === 'multiple-correct') {
          if (Array.isArray(answer)) {
            answer.forEach(a => {
              if (stats.answerCounts[a] !== undefined) {
                stats.answerCounts[a]++;
              }
            });
          }
        } else if (question.type === 'true-false') {
          const normalizedAnswer = answer.toString().toLowerCase();
          if (stats.answerCounts[normalizedAnswer] !== undefined) {
            stats.answerCounts[normalizedAnswer]++;
          }
        } else if (question.type === 'numeric') {
          stats.answerCounts[answer.toString()] = (stats.answerCounts[answer.toString()] || 0) + 1;
        }
      }
    });

    return stats;
  }

  /**
   * Clean up game resources and remove stale player references
   * Called when a game is being deleted to prevent memory leaks
   */
  cleanup() {
    logger.debug(`🧹 Cleaning up game ${this.pin} with ${this.players.size} players`);
    
    // Clear all timers to prevent memory leaks
    if (this.questionTimer) {
      clearTimeout(this.questionTimer);
      this.questionTimer = null;
    }
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
    
    // Remove all player references from global players map
    // This fixes the "play again" bug where stale players appear in new lobbies
    const playersToRemove = [];
    this.players.forEach((player, playerId) => {
      playersToRemove.push(playerId);
    });
    
    // Remove from global players map
    playersToRemove.forEach(playerId => {
      players.delete(playerId);
      logger.debug(`🧹 Removed stale player ${playerId} from global players map`);
    });
    
    // Clear internal player references
    this.players.clear();
    
    // Clear other game state
    this.leaderboard = [];
    this.gameState = 'ended';
    
    logger.debug(`🧹 Game ${this.pin} cleanup completed - removed ${playersToRemove.length} player references`);
  }
}

function advanceToNextQuestion(game, io) {
  
  if (game.gameState === 'finished' || game.isAdvancing) {
    return;
  }
  
  game.isAdvancing = true;
  
  if (game.advanceTimer) {
    clearTimeout(game.advanceTimer);
    game.advanceTimer = null;
  }
  
  game.advanceTimer = setTimeout(() => {
    if (game.gameState === 'finished') {
      game.isAdvancing = false;
      return;
    }
    
    game.updateLeaderboard();
    
    io.to(`game-${game.pin}`).emit('question-end', {
      showStatistics: true
    });
    
    const hasMoreQuestions = (game.currentQuestion + 1) < game.quiz.questions.length;
    
    if (game.manualAdvancement) {
      io.to(game.hostId).emit('show-next-button', {
        isLastQuestion: !hasMoreQuestions
      });
      game.isAdvancing = false;
    } else {
      io.to(`game-${game.pin}`).emit('show-leaderboard', {
        leaderboard: game.leaderboard.slice(0, 5)
      });
      
      game.advanceTimer = setTimeout(() => {
        if (game.gameState === 'finished') {
          game.isAdvancing = false;
          return;
        }
        
        if (game.nextQuestion()) {
          startQuestion(game, io);
        } else {
          endGame(game, io);
        }
        game.isAdvancing = false;
      }, 3000);
    }
  }, CONFIG.TIMING.LEADERBOARD_DISPLAY_TIME);
}

function endGame(game, io) {
  logger.debug('endGame() called for game:', game.pin);
  
  if (game.gameState === 'finished') {
    logger.debug('Game already finished, skipping endGame');
    return;
  }
  
  logger.debug('Setting game state to finished');
  game.gameState = 'finished';
  game.endTime = new Date().toISOString();
  
  game.isAdvancing = false;
  
  if (game.questionTimer) {
    clearTimeout(game.questionTimer);
    game.questionTimer = null;
  }
  if (game.advanceTimer) {
    clearTimeout(game.advanceTimer);
    game.advanceTimer = null;
  }
  
  io.to(game.hostId).emit('hide-next-button');
  logger.debug('Hid next button for host');
  
  logger.debug('Updating leaderboard and saving results...');
  game.updateLeaderboard();
  game.saveResults();
  
  logger.debug('Final leaderboard:', game.leaderboard);
  
  setTimeout(() => {
    logger.debug('1 second passed, about to emit game-end event');
    if (game.gameState === 'finished') {
      logger.debug('EMITTING game-end event to all players in game-' + game.pin);
      io.to(`game-${game.pin}`).emit('game-end', {
        finalLeaderboard: game.leaderboard
      });
      logger.debug('game-end event emitted successfully!');
      logger.debug('Players in room game-' + game.pin + ':', io.sockets.adapter.rooms.get(`game-${game.pin}`)?.size || 0);
    } else {
      logger.debug('Game state changed, not emitting game-end event');
    }
  }, 1000);
}

function startQuestion(game, io) {
  if (game.currentQuestion >= game.quiz.questions.length) {
    endGame(game, io);
    return;
  }

  const question = game.quiz.questions[game.currentQuestion];
  const timeLimit = question.timeLimit || 20;
  
  game.gameState = 'question';
  game.questionStartTime = Date.now();
  
  const questionData = {
    questionNumber: game.currentQuestion + 1,
    totalQuestions: game.quiz.questions.length,
    question: question.question,
    options: question.options,
    type: question.type || 'multiple-choice',
    image: question.image || '',
    timeLimit: timeLimit
  };
  io.to(`game-${game.pin}`).emit('question-start', questionData);

  game.questionTimer = setTimeout(() => {
    game.endQuestion();
    const correctAnswer = question.correctAnswer;
    let correctOption = '';
    
    switch (question.type || 'multiple-choice') {
      case 'multiple-choice':
        correctOption = question.options && question.options[correctAnswer] ? question.options[correctAnswer] : '';
        break;
      case 'multiple-correct':
        const correctAnswers = question.correctAnswers || [];
        correctOption = correctAnswers.map(idx => question.options[idx]).join(', ');
        break;
      case 'true-false':
        correctOption = correctAnswer;
        break;
      case 'numeric':
        correctOption = correctAnswer.toString();
        break;
    }
    
    const timeoutData = {
      correctAnswer: correctAnswer,
      correctOption: correctOption,
      questionType: question.type || 'multiple-choice',
      tolerance: question.tolerance || null
    };
    
    // For multiple-correct questions, also send the correctAnswers array
    if (question.type === 'multiple-correct') {
      timeoutData.correctAnswers = question.correctAnswers || [];
    }
    
    io.to(`game-${game.pin}`).emit('question-timeout', timeoutData);

    const answerStats = game.getAnswerStatistics();
    io.to(game.hostId).emit('answer-statistics', answerStats);

    game.players.forEach((player, playerId) => {
      const playerAnswer = player.answers[game.currentQuestion];
      if (playerAnswer) {
        io.to(playerId).emit('player-result', {
          isCorrect: playerAnswer.isCorrect,
          points: playerAnswer.points,
          totalScore: player.score
        });
      } else {
        io.to(playerId).emit('player-result', {
          isCorrect: false,
          points: 0,
          totalScore: player.score
        });
      }
    });

    advanceToNextQuestion(game, io);
    
  }, timeLimit * 1000);
}

function autoAdvanceGame(game, io) {
  setTimeout(() => {
    if (game.gameState === 'finished') {
      return;
    }
    
    if (game.nextQuestion()) {
      startQuestion(game, io);
    } else {
      endGame(game, io);
    }
  }, CONFIG.TIMING.GAME_START_DELAY);
}

io.on('connection', (socket) => {

  socket.on('host-join', (data) => {
    const clientIP = socket.handshake.address;
    
    console.log('🔧 [SERVER] DEBUG: host-join event received!');
    console.log('🔧 [SERVER] DEBUG: host-join received data:', JSON.stringify(data, null, 2));
    console.log('🔧 [SERVER] DEBUG: quiz title from data:', data?.quiz?.title);
    
    if (!data || !data.quiz || !Array.isArray(data.quiz.questions)) {
      socket.emit('error', { message: 'Invalid quiz data' });
      return;
    }
    
    const { quiz } = data;
    console.log('🔧 [SERVER] DEBUG: extracted quiz title:', quiz.title);
    
    if (quiz.questions.length === 0) {
      socket.emit('error', { message: 'Quiz must have at least one question' });
      return;
    }
    
    const existingGame = Array.from(games.values()).find(g => g.hostId === socket.id);
    if (existingGame) {
      existingGame.endQuestion();
      io.to(`game-${existingGame.pin}`).emit('game-ended', { reason: 'Host started new game' });
      
      // 🔧 FIX: Use proper cleanup to remove stale player references
      // This prevents the "play again" bug where players from previous game appear in new lobby
      existingGame.cleanup();
      games.delete(existingGame.pin);
    }
    
    const game = new Game(socket.id, quiz);
    games.set(game.pin, game);
    
    socket.join(`game-${game.pin}`);
    console.log('🔧 [SERVER] DEBUG: Sending game-created with title:', quiz.title);
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
  });

  socket.on('player-join', (data) => {
    if (!data || typeof data !== 'object') {
      socket.emit('error', { message: 'Invalid request data' });
      return;
    }
    
    const { pin, name } = data;
    
    if (!pin || !name || typeof pin !== 'string' || typeof name !== 'string') {
      socket.emit('error', { message: 'PIN and name are required' });
      return;
    }
    
    if (name.length > CONFIG.LIMITS.MAX_PLAYER_NAME_LENGTH || name.trim().length === 0) {
      socket.emit('error', { message: `Name must be 1-${CONFIG.LIMITS.MAX_PLAYER_NAME_LENGTH} characters` });
      return;
    }
    
    const game = games.get(pin);
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (game.gameState !== 'lobby') {
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    game.addPlayer(socket.id, name);
    players.set(socket.id, { gamePin: pin, name });
    
    socket.join(`game-${pin}`);
    
    const currentPlayers = Array.from(game.players.values()).map(p => ({ id: p.id, name: p.name }));
    
    socket.emit('player-joined', { 
      gamePin: pin, 
      playerName: name,
      players: currentPlayers
    });
    
    io.to(`game-${pin}`).emit('player-list-update', {
      players: currentPlayers
    });
    
  });

  socket.on('start-game', () => {
    const game = Array.from(games.values()).find(g => g.hostId === socket.id);
    if (!game) {
      return;
    }
    
    game.gameState = 'starting';
    game.startTime = new Date().toISOString();
    
    io.to(`game-${game.pin}`).emit('game-started', {
      gamePin: game.pin,
      questionCount: game.quiz.questions.length,
      manualAdvancement: game.manualAdvancement
    });
    
    autoAdvanceGame(game, io);
  });

  socket.on('submit-answer', (data) => {
    if (!data || data.answer === undefined) {
      return;
    }
    
    const { answer, type } = data;
    const playerData = players.get(socket.id);
    if (!playerData) return;

    const game = games.get(playerData.gamePin);
    if (!game || game.gameState !== 'question') return;

    game.submitAnswer(socket.id, answer, type);
    socket.emit('answer-submitted', { answer: answer });
    
    const totalPlayers = game.players.size;
    const answeredPlayers = Array.from(game.players.values())
      .filter(player => player.answers[game.currentQuestion]).length;
    
    if (answeredPlayers >= totalPlayers && totalPlayers > 0 && game.gameState === 'question') {
      if (game.questionTimer) {
        clearTimeout(game.questionTimer);
        game.questionTimer = null;
        
        if (game.advanceTimer) {
          clearTimeout(game.advanceTimer);
          game.advanceTimer = null;
        }
        
        setTimeout(() => {
          if (game.gameState !== 'question') return;
          
          game.endQuestion();
          const question = game.quiz.questions[game.currentQuestion];
          const correctAnswer = question.correctAnswer;
          let correctOption = '';
          
          switch (question.type || 'multiple-choice') {
            case 'multiple-choice':
              correctOption = question.options && question.options[correctAnswer] ? question.options[correctAnswer] : '';
              break;
            case 'multiple-correct':
              const correctAnswers = question.correctAnswers || [];
              correctOption = correctAnswers.map(idx => question.options[idx]).join(', ');
              break;
            case 'true-false':
              correctOption = correctAnswer;
              break;
            case 'numeric':
              correctOption = correctAnswer.toString();
              break;
            case 'ordering':
              const correctOrder = question.correctOrder || [];
              correctOption = correctOrder.map(idx => question.options[idx]).join(' → ');
              break;
          }
          
          const timeoutData = {
            correctAnswer: correctAnswer,
            correctOption: correctOption,
            questionType: question.type || 'multiple-choice',
            tolerance: question.tolerance || null,
            earlyEnd: true
          };
          
          // For multiple-correct questions, also send the correctAnswers array
          if (question.type === 'multiple-correct') {
            timeoutData.correctAnswers = question.correctAnswers || [];
          }
          
          io.to(`game-${game.pin}`).emit('question-timeout', timeoutData);

          const answerStats = game.getAnswerStatistics();
          io.to(game.hostId).emit('answer-statistics', answerStats);

          game.players.forEach((player, playerId) => {
            const playerAnswer = player.answers[game.currentQuestion];
            if (playerAnswer) {
              io.to(playerId).emit('player-result', {
                isCorrect: playerAnswer.isCorrect,
                points: playerAnswer.points,
                totalScore: player.score
              });
            } else {
              io.to(playerId).emit('player-result', {
                isCorrect: false,
                points: 0,
                totalScore: player.score
              });
            }
          });

          advanceToNextQuestion(game, io);
        }, 1000);
      }
    }
  });

  socket.on('next-question', () => {
    try {
      logger.debug('SERVER: NEXT-QUESTION EVENT RECEIVED');
      logger.debug('NEXT-QUESTION event received from host');
      const game = Array.from(games.values()).find(g => g.hostId === socket.id);
    
    if (!game) {
      logger.debug('No game found for host');
      return;
    }
    
    if (game.isAdvancing) {
      logger.debug('Game already advancing, ignoring');
      return;
    }
    
    logger.debug('Game state before next-question:', {
      gameState: game.gameState,
      currentQuestion: game.currentQuestion,
      totalQuestions: game.quiz.questions.length,
      gamePin: game.pin
    });
    
    if (game.gameState === 'finished') {
      logger.debug('Game already finished, hiding next button');
      io.to(game.hostId).emit('hide-next-button');
      return;
    }

    game.isAdvancing = true;
    logger.debug('Set advancing flag to true');

    if (game.advanceTimer) {
      clearTimeout(game.advanceTimer);
      game.advanceTimer = null;
    }
    
    io.to(game.hostId).emit('hide-next-button');
    logger.debug('Hid next question button');
    
    io.to(`game-${game.pin}`).emit('show-leaderboard', {
      leaderboard: game.leaderboard.slice(0, 5)
    });
    logger.debug('Showed leaderboard, waiting 3 seconds...');
    
    setTimeout(() => {
      logger.debug('3 seconds passed, calling game.nextQuestion()...');
      const hasMoreQuestions = game.nextQuestion();
      logger.debug('game.nextQuestion() returned:', hasMoreQuestions);
      
      if (hasMoreQuestions) {
        logger.debug('Starting next question...');
        startQuestion(game, io);
      } else {
        logger.debug('NO MORE QUESTIONS - calling endGame()...');
        endGame(game, io);
      }
      
      game.isAdvancing = false;
      logger.debug('Reset advancing flag to false');
    }, 3000);
    
    } catch (error) {
      logger.error('SERVER ERROR in next-question handler:', error);
      logger.error('Error stack:', error.stack);
    }
  });

  socket.on('disconnect', () => {
    const playerData = players.get(socket.id);
    if (playerData) {
      const game = games.get(playerData.gamePin);
      if (game) {
        game.removePlayer(socket.id);
        io.to(`game-${playerData.gamePin}`).emit('player-list-update', {
          players: Array.from(game.players.values()).map(p => ({ id: p.id, name: p.name }))
        });
      }
      players.delete(socket.id);
    }

    const hostedGame = Array.from(games.values()).find(g => g.hostId === socket.id);
    if (hostedGame) {
      hostedGame.endQuestion();
      if (hostedGame.gameState === 'question' || hostedGame.gameState === 'finished') {
        hostedGame.endTime = new Date().toISOString();
        hostedGame.saveResults();
      }
      io.to(`game-${hostedGame.pin}`).emit('game-ended', { reason: 'Host disconnected' });
      
      // Use proper cleanup to remove stale player references  
      hostedGame.cleanup();
      games.delete(hostedGame.pin);
    }
    
    games.forEach((game, pin) => {
      if (game.players.size === 0 && game.gameState === 'lobby') {
        const hostSocket = io.sockets.sockets.get(game.hostId);
        if (!hostSocket) {
          // Use proper cleanup for orphaned games
          game.cleanup();
          games.delete(pin);
        }
      }
    });
  });
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

const gracefulShutdown = (signal) => {
  logger.info(`
Received ${signal}. Shutting down gracefully...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    io.close(() => {
      logger.info('Socket.IO server closed');
      
      games.forEach(game => {
        if (game.timer) {
          clearTimeout(game.timer);
        }
        if (game.leaderboardTimer) {
          clearTimeout(game.leaderboardTimer);
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
