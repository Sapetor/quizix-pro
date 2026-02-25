/**
 * Resource Limits Configuration
 *
 * Environment-based limits for mobile vs desktop deployments.
 * Mobile mode is optimized for resource-constrained devices.
 *
 * Set MOBILE_MODE=true in environment for mobile limits.
 */

const LIMITS = {
    desktop: {
        MAX_CONCURRENT_GAMES: 100,
        MAX_PLAYERS_PER_GAME: 200,
        MAX_UPLOAD_SIZE: 5 * 1024 * 1024  // 5MB
    },
    mobile: {
        MAX_CONCURRENT_GAMES: 5,
        MAX_PLAYERS_PER_GAME: 50,
        MAX_UPLOAD_SIZE: 1 * 1024 * 1024  // 1MB
    }
};

/**
 * Get limits based on environment
 * @returns {Object} Limits configuration for current environment
 */
function getLimits() {
    const isMobileMode = process.env.MOBILE_MODE === 'true';
    return isMobileMode ? LIMITS.mobile : LIMITS.desktop;
}

/**
 * Check if running in mobile mode
 * @returns {boolean} True if MOBILE_MODE=true
 */
function isMobileMode() {
    return process.env.MOBILE_MODE === 'true';
}

module.exports = {
    LIMITS,
    getLimits,
    isMobileMode
};
