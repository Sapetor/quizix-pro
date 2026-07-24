'use strict';

/**
 * Per-IP fixed-window rate limiter for POST /api/save-quiz.
 *
 * Same in-memory fixed-window idiom as uploadRateLimit in routes/file-uploads.js.
 * Anonymous quiz saving is a supported flow and each save is a disk write plus a
 * metadata mutation, so cap per-IP request rate to stop a client flooding disk.
 * checkLimit is a pure function of (ip, now) over an internal store so the logic
 * is unit-testable without booting server.js (which calls server.listen() on
 * require).
 *
 * getClientIp is injectable: if a sibling change introduces a shared
 * getClientIp(req) helper (trust-proxy / CF-Connecting-IP aware), pass it in;
 * otherwise the limiter falls back to the same idiom the other limiters use.
 */

const DEFAULT_MAX_REQUESTS = 30;
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute

function createSaveQuizRateLimiter({
    logger,
    maxRequests = DEFAULT_MAX_REQUESTS,
    windowMs = DEFAULT_WINDOW_MS,
    getClientIp
} = {}) {
    const store = new Map();

    // Pure over (ip, now): { allowed, remaining, retryAfter? }.
    function checkLimit(ip, now = Date.now()) {
        const entry = store.get(ip);

        if (!entry || now > entry.resetTime) {
            store.set(ip, { count: 1, resetTime: now + windowMs });
            return { allowed: true, remaining: maxRequests - 1 };
        }

        if (entry.count >= maxRequests) {
            const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
            return { allowed: false, retryAfter, remaining: 0 };
        }

        entry.count++;
        return { allowed: true, remaining: maxRequests - entry.count };
    }

    // Drop stale buckets every 5 minutes (same sweep as file-uploads.js).
    // unref() so the timer never keeps the process (or Jest) alive.
    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of store.entries()) {
            if (now > entry.resetTime + windowMs) {
                store.delete(ip);
            }
        }
    }, 5 * 60 * 1000);
    if (sweep.unref) sweep.unref();

    function resolveIp(req) {
        if (typeof getClientIp === 'function') return getClientIp(req);
        return req.ip || req.socket?.remoteAddress || 'unknown';
    }

    function middleware(req, res, next) {
        const ip = resolveIp(req);
        const result = checkLimit(ip);
        if (!result.allowed) {
            if (logger) logger.warn(`save-quiz rate limit exceeded for IP: ${ip}`);
            return res.status(429).json({
                error: 'Rate limit exceeded',
                messageKey: 'error_rate_limited',
                retryAfter: result.retryAfter
            });
        }
        return next();
    }

    return { middleware, checkLimit, _store: store, _sweep: sweep };
}

module.exports = { createSaveQuizRateLimiter, DEFAULT_MAX_REQUESTS, DEFAULT_WINDOW_MS };
