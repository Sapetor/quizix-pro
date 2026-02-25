/**
 * Prometheus Metrics Service
 * Provides application metrics for monitoring
 */

const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// ============================================================================
// Custom Metrics
// ============================================================================

// HTTP Request metrics
const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDuration);

const httpRequestTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpRequestTotal);

// Game metrics
const activeGamesGauge = new client.Gauge({
    name: 'quizix_active_games',
    help: 'Number of currently active games'
});
register.registerMetric(activeGamesGauge);

const totalGamesCounter = new client.Counter({
    name: 'quizix_games_total',
    help: 'Total number of games created'
});
register.registerMetric(totalGamesCounter);

const activePlayersGauge = new client.Gauge({
    name: 'quizix_active_players',
    help: 'Number of currently connected players'
});
register.registerMetric(activePlayersGauge);

// Quiz metrics
const quizzesSavedCounter = new client.Counter({
    name: 'quizix_quizzes_saved_total',
    help: 'Total number of quizzes saved'
});
register.registerMetric(quizzesSavedCounter);

const quizzesLoadedCounter = new client.Counter({
    name: 'quizix_quizzes_loaded_total',
    help: 'Total number of quizzes loaded'
});
register.registerMetric(quizzesLoadedCounter);

// Socket.IO metrics
const socketConnectionsGauge = new client.Gauge({
    name: 'quizix_socket_connections',
    help: 'Number of active Socket.IO connections'
});
register.registerMetric(socketConnectionsGauge);

const socketEventsCounter = new client.Counter({
    name: 'quizix_socket_events_total',
    help: 'Total number of Socket.IO events',
    labelNames: ['event']
});
register.registerMetric(socketEventsCounter);

// AI Generation metrics
const aiGenerationsCounter = new client.Counter({
    name: 'quizix_ai_generations_total',
    help: 'Total number of AI question generations',
    labelNames: ['provider', 'status']
});
register.registerMetric(aiGenerationsCounter);

const aiGenerationDuration = new client.Histogram({
    name: 'quizix_ai_generation_duration_seconds',
    help: 'Duration of AI generation requests in seconds',
    labelNames: ['provider'],
    buckets: [1, 2, 5, 10, 30, 60]
});
register.registerMetric(aiGenerationDuration);

// Error metrics
const errorsCounter = new client.Counter({
    name: 'quizix_errors_total',
    help: 'Total number of errors',
    labelNames: ['type']
});
register.registerMetric(errorsCounter);

// ============================================================================
// Middleware
// ============================================================================

/**
 * Express middleware to track HTTP request metrics
 */
function metricsMiddleware(req, res, next) {
    const start = process.hrtime();

    res.on('finish', () => {
        const duration = process.hrtime(start);
        const durationSeconds = duration[0] + duration[1] / 1e9;

        // Normalize route for metrics (avoid high cardinality)
        let route = req.route?.path || req.path;
        // Replace dynamic segments with placeholders
        route = route.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
        route = route.replace(/\/\d{6}/g, '/:pin');
        route = route.replace(/\/[\w\-]+\.json/g, '/:filename');

        const labels = {
            method: req.method,
            route: route,
            status_code: res.statusCode
        };

        httpRequestDuration.observe(labels, durationSeconds);
        httpRequestTotal.inc(labels);
    });

    next();
}

// ============================================================================
// Metrics API
// ============================================================================

const metricsService = {
    register,
    metricsMiddleware,

    // Game tracking
    gameCreated: () => {
        totalGamesCounter.inc();
        activeGamesGauge.inc();
    },
    gameEnded: () => {
        activeGamesGauge.dec();
    },
    setActiveGames: (count) => {
        activeGamesGauge.set(count);
    },

    // Player tracking
    playerJoined: () => {
        activePlayersGauge.inc();
    },
    playerLeft: () => {
        activePlayersGauge.dec();
    },
    setActivePlayers: (count) => {
        activePlayersGauge.set(count);
    },

    // Quiz tracking
    quizSaved: () => {
        quizzesSavedCounter.inc();
    },
    quizLoaded: () => {
        quizzesLoadedCounter.inc();
    },

    // Socket tracking
    socketConnected: () => {
        socketConnectionsGauge.inc();
    },
    socketDisconnected: () => {
        socketConnectionsGauge.dec();
    },
    socketEvent: (eventName) => {
        socketEventsCounter.inc({ event: eventName });
    },

    // AI tracking
    aiGenerationStarted: (provider) => {
        return process.hrtime();
    },
    aiGenerationCompleted: (provider, startTime, success = true) => {
        const duration = process.hrtime(startTime);
        const durationSeconds = duration[0] + duration[1] / 1e9;
        aiGenerationDuration.observe({ provider }, durationSeconds);
        aiGenerationsCounter.inc({ provider, status: success ? 'success' : 'error' });
    },

    // Error tracking
    recordError: (type) => {
        errorsCounter.inc({ type });
    }
};

module.exports = { metricsService };
