/**
 * Cache Control Middleware
 * Handles conditional caching based on environment
 */

/**
 * Create cache control middleware
 * @param {boolean} isProduction - Whether running in production mode
 * @returns {Function} Express middleware function
 */
function createCacheControlMiddleware(isProduction) {
    return (req, res, next) => {
        // Only disable caching for development, not production
        if (!isProduction) {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.set('Expires', '-1');
            res.set('Pragma', 'no-cache');
        }
        next();
    };
}

module.exports = { createCacheControlMiddleware };
