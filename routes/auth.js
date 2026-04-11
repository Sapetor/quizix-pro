/**
 * Auth Routes
 *
 * POST /api/auth/signup  — create account, issue session cookie
 * POST /api/auth/login   — authenticate, issue session cookie
 * POST /api/auth/logout  — clear session cookie
 * GET  /api/auth/me      — return { user } or { user: null }
 */

const express = require('express');
const { isSecureRequest } = require('../services/session-service');

function createAuthRoutes({
    userService,
    sessionService,
    logger,
    validateBody,
    signupSchema,
    loginSchema
}) {
    const router = express.Router();

    function setSessionCookie(req, res, userId) {
        const token = sessionService.signSession(userId);
        const cookie = sessionService.buildSetCookie(token, { secure: isSecureRequest(req) });
        res.setHeader('Set-Cookie', cookie);
    }

    function clearSessionCookie(req, res) {
        const cookie = sessionService.buildClearCookie({ secure: isSecureRequest(req) });
        res.setHeader('Set-Cookie', cookie);
    }

    function clientIp(req) {
        return req.ip || req.socket?.remoteAddress || 'unknown';
    }

    router.post('/signup', validateBody(signupSchema), async (req, res) => {
        const ip = clientIp(req);
        if (userService.isRateLimited(ip)) {
            return res.status(429).json({
                error: 'Too many attempts. Please try again in a minute.',
                messageKey: 'error_rate_limited'
            });
        }

        try {
            const { username, password } = req.validatedBody;
            const user = await userService.createUser(username, password);
            setSessionCookie(req, res, user.id);
            logger.info(`User signed up: ${user.username}`);
            return res.json({ user });
        } catch (err) {
            userService.recordAuthAttempt(ip);
            const status = err.status || 400;
            logger.debug(`Signup rejected: ${err.message}`);
            return res.status(status).json({
                error: err.message || 'Signup failed',
                messageKey: err.messageKey || 'error_signup_failed'
            });
        }
    });

    router.post('/login', validateBody(loginSchema), async (req, res) => {
        const ip = clientIp(req);
        if (userService.isRateLimited(ip)) {
            return res.status(429).json({
                error: 'Too many attempts. Please try again in a minute.',
                messageKey: 'error_rate_limited'
            });
        }

        try {
            const { username, password } = req.validatedBody;
            const user = await userService.authenticate(username, password);
            if (!user) {
                userService.recordAuthAttempt(ip);
                return res.status(401).json({
                    error: 'Invalid username or password',
                    messageKey: 'error_invalid_credentials'
                });
            }
            setSessionCookie(req, res, user.id);
            logger.info(`User logged in: ${user.username}`);
            return res.json({ user });
        } catch (err) {
            logger.error('Login error:', err);
            return res.status(500).json({
                error: 'Login failed',
                messageKey: 'error_login_failed'
            });
        }
    });

    router.post('/logout', (req, res) => {
        clearSessionCookie(req, res);
        return res.json({ success: true });
    });

    router.get('/me', (req, res) => {
        return res.json({ user: req.user || null });
    });

    return router;
}

module.exports = { createAuthRoutes };
