/**
 * Health Check Routes
 * Provides endpoints for Kubernetes probes, metrics, and debugging
 */

const express = require('express');
const fs = require('fs');

/**
 * Create health check router
 * @param {object} options - Configuration options
 * @param {object} options.metricsService - Metrics service instance
 * @param {string} options.basePath - Base path configuration
 * @param {boolean} options.isProduction - Production environment flag
 * @param {boolean} options.enableDebugRoutes - Opt-in flag for /metrics and /debug/config
 * @returns {express.Router}
 */
function createHealthCheckRoutes(options) {
    const {
        metricsService,
        basePath,
        isProduction,
        enableDebugRoutes = false
    } = options;

    const router = express.Router();

    // Liveness probe - simple check if server is running.
    // Never gated: the container healthcheck and the k8s liveness probe use it.
    router.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Prometheus metrics and the BASE_PATH diagnostic are opt-in (ENABLE_DEBUG_ROUTES).
    // They were registered unconditionally and unauthenticated, and `npm start`
    // does not set NODE_ENV, so a plain LAN run exposed full process metrics and
    // the environment dump to anyone who could reach the port.
    if (enableDebugRoutes) {
        // Prometheus metrics endpoint
        router.get('/metrics', async (req, res) => {
            try {
                res.set('Content-Type', metricsService.register.contentType);
                res.end(await metricsService.register.metrics());
            } catch (error) {
                res.status(500).end(error.message);
            }
        });

        // Diagnostic endpoint to check BASE_PATH configuration
        router.get('/debug/config', (req, res) => {
            res.status(200).json({
                BASE_PATH: basePath,
                BASE_PATH_raw: JSON.stringify(basePath),
                BASE_PATH_length: basePath.length,
                BASE_PATH_type: typeof basePath,
                BASE_PATH_equals_slash: basePath === '/',
                BASE_PATH_not_equals_slash: basePath !== '/',
                NODE_ENV: process.env.NODE_ENV,
                isProduction: isProduction,
                staticMountedAt: basePath !== '/' ? basePath : '/ (root)',
                timestamp: new Date().toISOString()
            });
        });
    }

    // Readiness probe - check if server is ready to accept traffic.
    // Never gated: the k8s readiness probe uses it.
    router.get('/ready', async (req, res) => {
        try {
            // Async directory check helper
            const checkDirectory = async (dir) => {
                try {
                    const stat = await fs.promises.stat(dir);
                    return stat.isDirectory();
                } catch {
                    return false;
                }
            };

            // Check all directories in parallel
            const [quizzesOk, resultsOk, uploadsOk] = await Promise.all([
                checkDirectory('quizzes'),
                checkDirectory('results'),
                checkDirectory('public/uploads')
            ]);

            const checks = {
                quizzes: quizzesOk,
                results: resultsOk,
                uploads: uploadsOk
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
                error: 'Readiness check failed',
                details: isProduction ? undefined : error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    return router;
}

module.exports = { createHealthCheckRoutes };
