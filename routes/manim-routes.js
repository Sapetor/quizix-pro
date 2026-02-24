const express = require('express');

/**
 * Manim Animation Routes
 * Handles Manim animation rendering and status endpoints
 *
 * Factory function to create Manim routes with dependencies
 * @param {Object} options - Configuration options
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.manimRenderService - Manim render service instance
 * @returns {express.Router} Configured router
 */
function createManimRoutes({ logger, manimRenderService }) {
    if (!logger) {
        throw new Error('logger is required for Manim routes');
    }
    if (!manimRenderService) {
        throw new Error('manimRenderService is required for Manim routes');
    }

    const router = express.Router();

    // ==================== RATE LIMITING ====================

    const renderRateLimits = new Map();
    const RENDER_MAX_REQUESTS_PER_MINUTE = 2;
    const RENDER_WINDOW_MS = 60 * 1000; // 1 minute

    function checkRenderRateLimit(ip) {
        const now = Date.now();
        const limit = renderRateLimits.get(ip);

        if (!limit || now > limit.resetTime) {
            renderRateLimits.set(ip, { count: 1, resetTime: now + RENDER_WINDOW_MS });
            return { allowed: true, remaining: RENDER_MAX_REQUESTS_PER_MINUTE - 1 };
        }

        if (limit.count >= RENDER_MAX_REQUESTS_PER_MINUTE) {
            const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
            return { allowed: false, retryAfter, remaining: 0 };
        }

        limit.count++;
        return { allowed: true, remaining: RENDER_MAX_REQUESTS_PER_MINUTE - limit.count };
    }

    // Cleanup stale rate limit entries every 5 minutes
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ip, limit] of renderRateLimits.entries()) {
            if (now > limit.resetTime + 60000) {
                renderRateLimits.delete(ip);
            }
        }
    }, 5 * 60 * 1000);

    // ==================== HELPERS ====================

    const VALID_QUALITIES = ['low', 'medium', 'high'];

    /**
     * Strip file paths and stack traces from error messages before sending to client.
     * Paths look like /abs/path/to/file or C:\path\to\file.
     */
    function sanitizeErrorMessage(message) {
        if (typeof message !== 'string') {
            return 'An unexpected error occurred';
        }
        return message
            .replace(/([A-Za-z]:)?[\\/][\w\s.\-/\\]+\.\w+/g, '[file]') // file paths
            .replace(/\s+at\s+\S+\s+\([^)]+\)/g, '')                    // stack frames
            .trim() || 'An unexpected error occurred';
    }

    // ==================== RENDER ROUTE ====================

    router.post('/manim/render', async (req, res) => {
        try {
            const { code, quality = 'low' } = req.body;

            // Validate code
            if (!code || typeof code !== 'string' || code.trim().length === 0) {
                return res.status(400).json({ error: 'code is required and must be a non-empty string', messageKey: 'error_manim_code_required' });
            }

            // Validate quality
            if (!VALID_QUALITIES.includes(quality)) {
                return res.status(400).json({
                    error: `quality must be one of: ${VALID_QUALITIES.join(', ')}`,
                    messageKey: 'error_manim_invalid_quality'
                });
            }

            // Rate limit check
            const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
            const rateCheck = checkRenderRateLimit(clientIP);

            if (!rateCheck.allowed) {
                logger.warn(`Manim render rate limit exceeded for IP: ${clientIP}`);
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    messageKey: 'error_rate_limited',
                    retryAfter: rateCheck.retryAfter
                });
            }

            logger.info(`Manim render request from ${clientIP} (quality: ${quality})`);

            const result = await manimRenderService.renderAnimation(code, { quality });

            return res.status(200).json({
                videoPath: result.videoPath,
                duration: result.duration
            });

        } catch (error) {
            // Validation errors from the service (bad code, syntax issues, etc.)
            if (error.name === 'ValidationError' || error.code === 'VALIDATION_ERROR') {
                logger.warn('Manim render validation error:', error.message);
                return res.status(400).json({ error: error.message, messageKey: error.messageKey || 'error_manim_invalid_code' });
            }

            // Timeout errors
            if (
                error.name === 'TimeoutError' ||
                error.code === 'TIMEOUT' ||
                /timeout/i.test(error.message)
            ) {
                logger.warn('Manim render timed out');
                return res.status(408).json({
                    error: 'Animation render timed out. Try simplifying the animation.',
                    messageKey: error.messageKey || 'error_manim_timeout'
                });
            }

            // All other errors — sanitize before returning
            logger.error('Manim render error:', error.message);
            return res.status(500).json({
                error: 'Render failed',
                messageKey: error.messageKey || 'error_manim_render_failed',
                details: sanitizeErrorMessage(error.message)
            });
        }
    });

    // ==================== STATUS ROUTE ====================

    router.get('/manim/status', async (req, res) => {
        try {
            const availability = await manimRenderService.checkAvailability();
            return res.status(200).json({
                available: availability.available,
                version: availability.version,
                enabled: manimRenderService.enabled
            });
        } catch (error) {
            logger.error('Manim status check failed:', error.message);
            return res.status(200).json({
                available: false,
                version: null,
                enabled: false,
                error: 'Status check failed'
            });
        }
    });

    // Expose cleanup for router teardown (prevents memory leaks in tests)
    router._cleanupIntervals = [cleanupInterval];

    return router;
}

module.exports = { createManimRoutes };
