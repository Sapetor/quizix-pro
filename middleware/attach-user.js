/**
 * attach-user middleware
 *
 * Reads the session cookie, verifies its signature, and attaches
 * `req.user = { id, username }` (or null) to every downstream handler.
 *
 * Never errors — if anything about the cookie is malformed or the user
 * record no longer exists, `req.user` is simply null and the request
 * proceeds as anonymous.
 */

function createAttachUser({ sessionService, userService, logger }) {
    return function attachUser(req, res, next) {
        req.user = null;
        try {
            const cookieHeader = req.headers.cookie;
            const raw = sessionService.readCookieFromHeader(cookieHeader);
            if (!raw) return next();

            const session = sessionService.verifySession(raw);
            if (!session) return next();

            const user = userService.getUser(session.uid);
            if (!user) return next();

            req.user = user;
        } catch (err) {
            logger.warn('attach-user middleware error:', err.message);
            req.user = null;
        }
        return next();
    };
}

/**
 * Gate that requires an authenticated user. Returns 401 otherwise.
 */
function requireUser(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: 'Authentication required',
            messageKey: 'error_auth_required'
        });
    }
    return next();
}

module.exports = { createAttachUser, requireUser };
