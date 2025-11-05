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

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      // Allow localhost and local network origins
      if (!origin || 
          origin.includes('localhost') || 
          origin.includes('127.0.0.1') || 
          origin.includes('192.168.') || 
          origin.includes('10.') || 
          origin.includes('172.')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS policy'));
      }
    },
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowUpgrades: true
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure directories exist
if (!fs.existsSync('quizzes')) {
  fs.mkdirSync('quizzes');
}
if (!fs.existsSync('results')) {
  fs.mkdirSync('results');
}

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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ filename: req.file.filename, url: `/uploads/${req.file.filename}` });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Save quiz endpoint
app.post('/api/save-quiz', (req, res) => {
  try {
    const { title, questions } = req.body;
    if (!title || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Invalid quiz data' });
    }
    
    // Sanitize filename more thoroughly to prevent path traversal
    const safeTitle = title.replace(/[^a-z0-9\-_]/gi, '_').toLowerCase().substring(0, 50);
    const filename = `${safeTitle}_${Date.now()}.json`;
    const quizData = {
      title,
      questions,
      created: new Date().toISOString(),
      id: uuidv4()
    };
    
    fs.writeFileSync(path.join('quizzes', filename), JSON.stringify(quizData, null, 2));
    res.json({ success: true, filename, id: quizData.id });
  } catch (error) {
    console.error('Save quiz error:', error);
    res.status(500).json({ error: 'Failed to save quiz' });
  }
});

// Load quiz endpoint
app.get('/api/quizzes', (req, res) => {
  try {
    const files = fs.readdirSync('quizzes').filter(f => f.endsWith('.json'));
    const quizzes = files.map(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join('quizzes', file), 'utf8'));
        return {
          filename: file,
          title: data.title,
          questionCount: data.questions.length,
          created: data.created,
          id: data.id
        };
      } catch (err) {
        console.error('Error reading quiz file:', file, err);
        return null;
      }
    }).filter(Boolean);
    
    res.json(quizzes);
  } catch (error) {
    console.error('Load quizzes error:', error);
    res.status(500).json({ error: 'Failed to load quizzes' });
  }
});

// Load specific quiz endpoint
app.get('/api/quiz/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename.endsWith('.json')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filePath = path.join('quizzes', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (error) {
    console.error('Load quiz error:', error);
    res.status(500).json({ error: 'Failed to load quiz' });
  }
});

// Save quiz results endpoint
app.post('/api/save-results', (req, res) => {
  try {
    const { quizTitle, gamePin, results, startTime, endTime } = req.body;
    if (!quizTitle || !gamePin || !results) {
      return res.status(400).json({ error: 'Invalid results data' });
    }
    
    const filename = `results_${gamePin}_${Date.now()}.json`;
    const resultsData = {
      quizTitle,
      gamePin,
      results,
      startTime,
      endTime,
      saved: new Date().toISOString()
    };
    
    fs.writeFileSync(path.join('results', filename), JSON.stringify(resultsData, null, 2));
    res.json({ success: true, filename });
  } catch (error) {
    console.error('Save results error:', error);
    res.status(500).json({ error: 'Failed to save results' });
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
    
    console.log(`Active games request: Found ${allGames.length} total games, ${activeGames.length} in lobby state`);
    allGames.forEach(game => {
      console.log(`  Game ${game.pin}: ${game.title} (${game.gameState}) - ${game.playerCount} players`);
    });
    
    res.json({ 
      games: activeGames,
      debug: {
        totalGames: allGames.length,
        allGames: allGames
      }
    });
  } catch (error) {
    console.error('Active games fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch active games' });
  }
});

// Generate QR code endpoint
app.get('/api/qr/:pin', async (req, res) => {
  try {
    const { pin } = req.params;
    const game = games.get(pin);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Use the same IP detection logic as server startup
    let localIP = 'localhost';
    const NETWORK_IP = process.env.NETWORK_IP;
    
    if (NETWORK_IP) {
      localIP = NETWORK_IP;
    } else {
      const networkInterfaces = os.networkInterfaces();
      const interfaces = Object.values(networkInterfaces).flat();
      
      // Prefer 192.168.x.x (typical home network) over 172.x.x.x (WSL internal)
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
    
    const port = process.env.PORT || 3000;
    const gameUrl = `http://${localIP}:${port}?pin=${pin}`;
    
    const qrCodeDataUrl = await QRCode.toDataURL(gameUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    res.json({ 
      qrCode: qrCodeDataUrl,
      gameUrl: gameUrl,
      pin: pin
    });
  } catch (error) {
    console.error('QR code generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
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
    console.error('Ollama models fetch error:', error);
    res.status(500).json({ error: 'Failed to connect to Ollama' });
  }
});

// Claude API proxy endpoint
app.post('/api/claude/generate', async (req, res) => {
  try {
    const { prompt, apiKey } = req.body;
    
    if (!prompt || !apiKey) {
      return res.status(400).json({ error: 'Prompt and API key are required' });
    }
    
    const { default: fetch } = await import('node-fetch');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      
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
    console.error('Claude proxy error:', error);
    res.status(500).json({ error: 'Failed to connect to Claude API' });
  }
});

// Health check endpoints for Kubernetes
// Liveness probe - simple check if server is running
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
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

const games = new Map();
const players = new Map();

function generateGamePin() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (games.has(pin));
  return pin;
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
    if (this.isAdvancing) return false;
    this.isAdvancing = true;
    this.currentQuestion++;
    this.gameState = 'question';
    this.questionTimer = null;
    this.advanceTimer = null;
    const hasMore = this.currentQuestion < this.quiz.questions.length;
    this.isAdvancing = false;
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
        endTime: this.endTime
      };
      
      // Save to file via internal API call
      const filename = `results_${this.pin}_${Date.now()}.json`;
      fs.writeFileSync(path.join('results', filename), JSON.stringify(results, null, 2));
      console.log(`Game results saved: ${filename}`);
    } catch (error) {
      console.error('Error saving game results:', error);
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
    let isCorrect = false;

    switch (question.type || 'multiple-choice') {
      case 'multiple-choice':
        isCorrect = answer === question.correctAnswer;
        break;
        
      case 'multiple-correct':
        if (Array.isArray(answer) && Array.isArray(question.correctAnswers)) {
          const sortedAnswer = [...answer].sort();
          const sortedCorrect = [...question.correctAnswers].sort();
          isCorrect = JSON.stringify(sortedAnswer) === JSON.stringify(sortedCorrect);
        }
        break;
        
      case 'true-false':
        isCorrect = answer.toString().toLowerCase() === question.correctAnswer.toString().toLowerCase();
        break;
        
      case 'numeric':
        if (typeof answer === 'number' && typeof question.correctAnswer === 'number') {
          const tolerance = question.tolerance || 0.1;
          isCorrect = Math.abs(answer - question.correctAnswer) <= tolerance;
        }
        break;
    }

    const timeTaken = Date.now() - this.questionStartTime;
    // Extended time bonus window to 10 seconds (10000ms) for more noticeable scoring differences
    const maxBonusTime = 10000;
    const timeBonus = Math.max(0, maxBonusTime - timeTaken);
    const difficultyMultiplier = {
      'easy': 1,
      'medium': 2,
      'hard': 3
    }[question.difficulty] || 2;
    
    const basePoints = 100 * difficultyMultiplier;
    // Scale time bonus more significantly 
    const scaledTimeBonus = Math.floor(timeBonus * difficultyMultiplier / 10);
    const points = isCorrect ? basePoints + scaledTimeBonus : 0;
    
    console.log(`Scoring Debug - Player: ${this.players.get(playerId)?.name || playerId}, Time: ${timeTaken}ms, TimeBonus: ${timeBonus}, ScaledBonus: ${scaledTimeBonus}, BasePoints: ${basePoints}, FinalPoints: ${points}`);

    player.answers[this.currentQuestion] = {
      answer,
      isCorrect,
      points,
      timeMs: Date.now() - this.questionStartTime
    };
    player.score += points;

    return { isCorrect, points };
  }

  updateLeaderboard() {
    this.leaderboard = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  getAnswerStatistics() {
    const question = this.quiz.questions[this.currentQuestion];
    const stats = {
      totalPlayers: this.players.size,
      answeredPlayers: 0,
      answerCounts: {},
      questionType: question.type || 'multiple-choice'
    };

    // Initialize answer counts based on question type
    if (question.type === 'multiple-choice' || question.type === 'multiple-correct') {
      question.options.forEach((_, index) => {
        stats.answerCounts[index] = 0;
      });
    } else if (question.type === 'true-false') {
      stats.answerCounts['true'] = 0;
      stats.answerCounts['false'] = 0;
    } else if (question.type === 'numeric') {
      stats.answerCounts = {}; // For numeric, we'll show distribution
    }

    // Count actual answers
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
          // For numeric answers, group by ranges or exact values
          stats.answerCounts[answer.toString()] = (stats.answerCounts[answer.toString()] || 0) + 1;
        }
      }
    });

    return stats;
  }
}

function advanceToNextQuestion(game, io) {
  // Clear any existing advance timer to prevent duplication
  if (game.advanceTimer) {
    clearTimeout(game.advanceTimer);
    game.advanceTimer = null;
  }
  
  game.advanceTimer = setTimeout(() => {
    game.updateLeaderboard();
    io.to(`game-${game.pin}`).emit('question-end', {
      leaderboard: game.leaderboard.slice(0, 5)
    });
    
    // Check if manual advancement is enabled
    console.log(`Checking advancement for game ${game.pin}: Manual = ${game.manualAdvancement}`);
    if (game.manualAdvancement) {
      // Show next question button for host and wait for manual trigger
      console.log(`Showing next button for manual advancement in game ${game.pin} to host ${game.hostId}`);
      io.to(game.hostId).emit('show-next-button');
    } else {
      // Auto-advance to next question
      console.log(`Auto-advancing game ${game.pin} in 3 seconds`);
      game.advanceTimer = setTimeout(() => {
        if (game.nextQuestion()) {
          startQuestion(game, io);
        } else {
          // No more questions - end the game
          endGame(game, io);
        }
      }, 3000);
    }
  }, 3000);
}

function endGame(game, io) {
  // Prevent multiple game endings
  if (game.gameState === 'finished') return;
  
  console.log(`Ending game ${game.pin}`);
  game.gameState = 'finished';
  game.endTime = new Date().toISOString();
  game.updateLeaderboard();
  game.saveResults();
  
  // Add slight delay to ensure all previous events are processed
  setTimeout(() => {
    io.to(`game-${game.pin}`).emit('game-end', {
      finalLeaderboard: game.leaderboard
    });
  }, 500);
}

function startQuestion(game, io) {
  if (game.currentQuestion >= game.quiz.questions.length) {
    // Game finished
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
    
    io.to(`game-${game.pin}`).emit('question-timeout', {
      correctAnswer: correctAnswer,
      correctOption: correctOption,
      questionType: question.type || 'multiple-choice',
      tolerance: question.tolerance || null
    });

    // Send answer statistics to host after question ends
    const answerStats = game.getAnswerStatistics();
    io.to(game.hostId).emit('answer-statistics', answerStats);

    // Send individual results to each player
    game.players.forEach((player, playerId) => {
      const playerAnswer = player.answers[game.currentQuestion];
      if (playerAnswer) {
        io.to(playerId).emit('player-result', {
          isCorrect: playerAnswer.isCorrect,
          points: playerAnswer.points,
          totalScore: player.score
        });
      }
    });

    advanceToNextQuestion(game, io);
    
  }, timeLimit * 1000);
}

function autoAdvanceGame(game, io) {
  setTimeout(() => {
    if (game.nextQuestion()) {
      startQuestion(game, io);
    } else {
      console.error('Failed to start first question - no questions available');
    }
  }, 3000);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id, 'from:', socket.handshake.address);

  socket.on('host-join', (data) => {
    // Check if request is from local machine or local network (but allow all for now due to NAT/proxy issues)
    const clientIP = socket.handshake.address;
    
    // Allow all local network connections
    
    // Uncomment this line to enable hosting restriction:
    // const isLocalHost = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1';
    // const isLocalNetwork = isLocalHost || clientIP.startsWith('192.168.') || clientIP.startsWith('10.') || clientIP.startsWith('172.') || clientIP.startsWith('::ffff:192.168.');
    // if (!isLocalNetwork) {
    //   socket.emit('error', { message: 'Game hosting is restricted to local network only' });
    //   return;
    // }
    
    if (!data || !data.quiz || !Array.isArray(data.quiz.questions)) {
      socket.emit('error', { message: 'Invalid quiz data' });
      return;
    }
    
    const { quiz } = data;
    
    if (quiz.questions.length === 0) {
      socket.emit('error', { message: 'Quiz must have at least one question' });
      return;
    }
    
    // Clean up any existing games for this host
    const existingGame = Array.from(games.values()).find(g => g.hostId === socket.id);
    if (existingGame) {
      existingGame.endQuestion();
      io.to(`game-${existingGame.pin}`).emit('game-ended', { reason: 'Host started new game' });
      games.delete(existingGame.pin);
    }
    
    const game = new Game(socket.id, quiz);
    games.set(game.pin, game);
    
    console.log(`Game created with PIN: ${game.pin}, Manual Advancement: ${game.manualAdvancement}`);
    
    socket.join(`game-${game.pin}`);
    socket.emit('game-created', {
      pin: game.pin,
      gameId: game.id
    });
    
    console.log(`Game created with PIN: ${game.pin} from IP: ${clientIP}`);
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
    
    if (name.length > 20 || name.trim().length === 0) {
      socket.emit('error', { message: 'Name must be 1-20 characters' });
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
    socket.emit('player-joined', { gamePin: pin, playerName: name });
    
    io.to(`game-${pin}`).emit('player-list-update', {
      players: Array.from(game.players.values()).map(p => ({ id: p.id, name: p.name }))
    });
    
    console.log(`Player ${name} joined game ${pin}`);
  });

  socket.on('start-game', () => {
    const game = Array.from(games.values()).find(g => g.hostId === socket.id);
    if (!game) return;

    game.gameState = 'starting';
    game.startTime = new Date().toISOString();
    io.to(`game-${game.pin}`).emit('game-starting');
    
    // Start the auto-advancing game flow
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
    
    // Check if all players have submitted answers
    const totalPlayers = game.players.size;
    const answeredPlayers = Array.from(game.players.values())
      .filter(player => player.answers[game.currentQuestion]).length;
    
    if (answeredPlayers >= totalPlayers && totalPlayers > 0 && game.gameState === 'question') {
      // All players have answered, end question early
      if (game.questionTimer) {
        clearTimeout(game.questionTimer);
        game.questionTimer = null;
        
        // Clear any pending advance timer to prevent double advancement
        if (game.advanceTimer) {
          clearTimeout(game.advanceTimer);
          game.advanceTimer = null;
        }
        
        // Trigger question end immediately
        setTimeout(() => {
          if (game.gameState !== 'question') return; // Prevent double execution
          
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
          }
          
          io.to(`game-${game.pin}`).emit('question-timeout', {
            correctAnswer: correctAnswer,
            correctOption: correctOption,
            questionType: question.type || 'multiple-choice',
            tolerance: question.tolerance || null,
            earlyEnd: true
          });

          // Send answer statistics to host after question ends
          const answerStats = game.getAnswerStatistics();
          io.to(game.hostId).emit('answer-statistics', answerStats);

          // Send individual results to each player
          game.players.forEach((player, playerId) => {
            const playerAnswer = player.answers[game.currentQuestion];
            if (playerAnswer) {
              io.to(playerId).emit('player-result', {
                isCorrect: playerAnswer.isCorrect,
                points: playerAnswer.points,
                totalScore: player.score
              });
            }
          });

          advanceToNextQuestion(game, io);
        }, 1000); // 1 second delay to show "All players answered!"
      }
    }
  });

  socket.on('next-question', () => {
    const game = Array.from(games.values()).find(g => g.hostId === socket.id);
    if (!game || game.isAdvancing) return;

    // Clear any pending auto-advance timers
    if (game.advanceTimer) {
      clearTimeout(game.advanceTimer);
      game.advanceTimer = null;
    }
    
    // Hide the next question button
    io.to(game.hostId).emit('hide-next-button');
    
    // Move to next question manually
    if (game.nextQuestion()) {
      startQuestion(game, io);
    } else {
      // No more questions - end the game
      endGame(game, io);
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
      // Clean up timers before removing game
      hostedGame.endQuestion();
      // Save results if game was in progress
      if (hostedGame.gameState === 'question' || hostedGame.gameState === 'finished') {
        hostedGame.endTime = new Date().toISOString();
        hostedGame.saveResults();
      }
      io.to(`game-${hostedGame.pin}`).emit('game-ended', { reason: 'Host disconnected' });
      games.delete(hostedGame.pin);
    }
    
    // Clean up games with no players
    games.forEach((game, pin) => {
      if (game.players.size === 0 && game.gameState === 'lobby') {
        games.delete(pin);
      }
    });

    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
const NETWORK_IP = process.env.NETWORK_IP; // Allow manual IP override

server.listen(PORT, '0.0.0.0', () => {
  let localIP = 'localhost';
  
  if (NETWORK_IP) {
    // Use manually specified IP
    localIP = NETWORK_IP;
    console.log(`Using manual IP: ${localIP}`);
  } else {
    // Try to detect network IP, preferring 192.168.x.x for local networks
    const networkInterfaces = os.networkInterfaces();
    const interfaces = Object.values(networkInterfaces).flat();
    
    // Prefer 192.168.x.x (typical home network) over 172.x.x.x (WSL internal)
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
  
  console.log(`Network access: http://${localIP}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Server running on port ${PORT}`);
  
  // WSL specific instructions
  if (localIP.startsWith('172.')) {
    console.log('');
    console.log('🔧 WSL DETECTED: If you can\'t connect from your phone:');
    console.log('1. Find your Windows IP: run "ipconfig" in Windows Command Prompt');
    console.log('2. Look for "Wireless LAN adapter Wi-Fi" or "Ethernet adapter"');
    console.log('3. Use that IP address instead of the one shown above');
    console.log('4. Or restart with: NETWORK_IP=your.windows.ip npm start');
    console.log('');
  }
});

// Graceful shutdown handler for Kubernetes
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');

    // Clean up all active games and timers
    games.forEach((game, pin) => {
      console.log(`Cleaning up game ${pin}...`);
      if (game.questionTimer) {
        clearTimeout(game.questionTimer);
      }
      if (game.advanceTimer) {
        clearTimeout(game.advanceTimer);
      }
    });

    // Close Socket.IO connections
    io.close(() => {
      console.log('Socket.IO connections closed');
      console.log('Graceful shutdown complete');
      process.exit(0);
    });
  });

  // Force shutdown after 30 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Graceful shutdown timeout. Forcing exit...');
    process.exit(1);
  }, 30000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));