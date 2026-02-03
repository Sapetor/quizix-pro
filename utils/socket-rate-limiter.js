/**
 * Socket.IO Rate Limiting Utility
 * Prevents abuse by limiting event frequency per socket
 */

class SocketRateLimiter {
    constructor(logger) {
        this.logger = logger;
        this.rateLimits = new Map();
        this.cleanupInterval = null;
    }

    /**
     * Check if a socket event should be rate-limited
     * @param {string} socketId - The socket ID
     * @param {string} eventName - The event name
     * @param {number} maxPerSecond - Maximum events per second (default: 10)
     * @param {object} socket - Optional socket for sending rate-limit notification
     * @returns {boolean} - True if event is allowed, false if rate-limited
     */
    checkRateLimit(socketId, eventName, maxPerSecond = 10, socket = null) {
        const key = `${socketId}:${eventName}`;
        const now = Date.now();
        const limit = this.rateLimits.get(key);

        if (!limit || now > limit.resetTime) {
            this.rateLimits.set(key, { count: 1, resetTime: now + 1000 });
            return true;
        }

        if (limit.count >= maxPerSecond) {
            this.logger.warn(`Rate limit exceeded for socket ${socketId} on event ${eventName}`);
            // Notify client about rate limiting
            if (socket) {
                socket.emit('rate-limited', { event: eventName, message: 'Too many requests, please slow down' });
            }
            return false;
        }

        limit.count++;
        return true;
    }

    /**
     * Start periodic cleanup of stale rate limit entries
     * @param {number} intervalMs - Cleanup interval in milliseconds (default: 10000)
     */
    startCleanup(intervalMs = 10000) {
        if (this.cleanupInterval) {
            return; // Already running
        }

        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, limit] of this.rateLimits.entries()) {
                if (now > limit.resetTime + 5000) {
                    this.rateLimits.delete(key);
                }
            }
        }, intervalMs);
    }

    /**
     * Stop periodic cleanup
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Clear all rate limit entries (for testing or shutdown)
     */
    clear() {
        this.rateLimits.clear();
    }

    /**
     * Get current stats for monitoring
     * @returns {object} - Rate limiter statistics
     */
    getStats() {
        return {
            activeEntries: this.rateLimits.size,
            cleanupRunning: this.cleanupInterval !== null
        };
    }
}

module.exports = { SocketRateLimiter };
