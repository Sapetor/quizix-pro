/**
 * Event Listener Manager Utility
 * Centralized tracking and cleanup of event listeners and timers
 * Prevents memory leaks by enabling proper cleanup
 */

import { logger } from '../core/config.js';

export class EventListenerManager {
    /**
     * Create an EventListenerManager instance
     * @param {string} context - Context name for logging (e.g., 'GameManager')
     */
    constructor(context = 'unnamed') {
        this.context = context;
        this.elementListeners = new Map(); // Map<Element, Array<{event, handler, options}>>
        this.documentListeners = []; // Array<{event, handler, options}>
        this.timers = new Set(); // Set<timerId>
        this.intervals = new Set(); // Set<intervalId>
        this.namedTimers = new Map(); // Map<string, timerId> - for named/replaceable timers
        this.animationFrames = new Set(); // Set<requestId> - for requestAnimationFrame
    }

    /**
     * Add event listener with automatic tracking
     * @param {Element} element - DOM element
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - addEventListener options
     */
    addEventListenerTracked(element, event, handler, options = {}) {
        if (!element || typeof element.addEventListener !== 'function') {
            logger.warn(`${this.context}: Invalid element passed to addEventListenerTracked`);
            return;
        }

        element.addEventListener(event, handler, options);

        if (!this.elementListeners.has(element)) {
            this.elementListeners.set(element, []);
        }
        this.elementListeners.get(element).push({ event, handler, options });

        logger.debug(`${this.context}: Tracked event listener: ${event}`);
    }

    /**
     * Add document-level event listener with tracking
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - addEventListener options
     */
    addDocumentListener(event, handler, options = {}) {
        document.addEventListener(event, handler, options);
        this.documentListeners.push({ event, handler, options });
        logger.debug(`${this.context}: Tracked document listener: ${event}`);
    }

    /**
     * Remove tracked event listener
     * @param {Element} element - DOM element
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    removeEventListenerTracked(element, event, handler) {
        if (!element) return;

        element.removeEventListener(event, handler);

        const listeners = this.elementListeners.get(element);
        if (listeners) {
            const index = listeners.findIndex(l => l.event === event && l.handler === handler);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this.elementListeners.delete(element);
                }
            }
        }
    }

    /**
     * Create setTimeout with automatic tracking
     * @param {Function} callback - Callback function
     * @param {number} delay - Delay in milliseconds
     * @returns {number} Timer ID
     */
    createTimeout(callback, delay) {
        const timerId = setTimeout(() => {
            this.timers.delete(timerId);
            callback();
        }, delay);
        this.timers.add(timerId);
        return timerId;
    }

    /**
     * Create setInterval with automatic tracking
     * @param {Function} callback - Callback function
     * @param {number} interval - Interval in milliseconds
     * @returns {number} Interval ID
     */
    createInterval(callback, interval) {
        const intervalId = setInterval(callback, interval);
        this.intervals.add(intervalId);
        return intervalId;
    }

    /**
     * Clear a tracked timeout
     * @param {number} timerId - Timer ID
     */
    clearTimeout(timerId) {
        if (timerId !== undefined && timerId !== null) {
            clearTimeout(timerId);
            this.timers.delete(timerId);
        }
    }

    /**
     * Clear a tracked interval
     * @param {number} intervalId - Interval ID
     */
    clearInterval(intervalId) {
        if (intervalId !== undefined && intervalId !== null) {
            clearInterval(intervalId);
            this.intervals.delete(intervalId);
        }
    }

    /**
     * Clear a timer (works for both setTimeout and setInterval)
     * @param {number} timer - Timer/Interval ID
     */
    clearTimerTracked(timer) {
        if (timer !== undefined && timer !== null) {
            clearTimeout(timer);
            clearInterval(timer);
            this.timers.delete(timer);
            this.intervals.delete(timer);
        }
    }

    /**
     * Create a named timeout - automatically cancels previous timer with same name
     * Useful for debouncing or game timers that need to be replaced
     * @param {string} name - Unique timer name
     * @param {Function} callback - Callback function
     * @param {number} delay - Delay in milliseconds
     * @returns {number} Timer ID
     */
    setNamedTimeout(name, callback, delay) {
        // Cancel existing timer with this name
        if (this.namedTimers.has(name)) {
            clearTimeout(this.namedTimers.get(name));
            this.timers.delete(this.namedTimers.get(name));
        }

        const timerId = setTimeout(() => {
            this.timers.delete(timerId);
            this.namedTimers.delete(name);
            callback();
        }, delay);

        this.timers.add(timerId);
        this.namedTimers.set(name, timerId);
        return timerId;
    }

    /**
     * Clear a named timeout
     * @param {string} name - Timer name
     */
    clearNamedTimeout(name) {
        if (this.namedTimers.has(name)) {
            const timerId = this.namedTimers.get(name);
            clearTimeout(timerId);
            this.timers.delete(timerId);
            this.namedTimers.delete(name);
        }
    }

    /**
     * Check if a named timer exists
     * @param {string} name - Timer name
     * @returns {boolean}
     */
    hasNamedTimer(name) {
        return this.namedTimers.has(name);
    }

    /**
     * Request animation frame with tracking
     * @param {Function} callback - Animation callback
     * @returns {number} Request ID
     */
    requestAnimationFrame(callback) {
        const requestId = window.requestAnimationFrame((timestamp) => {
            this.animationFrames.delete(requestId);
            callback(timestamp);
        });
        this.animationFrames.add(requestId);
        return requestId;
    }

    /**
     * Cancel a tracked animation frame
     * @param {number} requestId - Animation frame request ID
     */
    cancelAnimationFrame(requestId) {
        if (requestId !== undefined && requestId !== null) {
            window.cancelAnimationFrame(requestId);
            this.animationFrames.delete(requestId);
        }
    }

    /**
     * Cleanup all tracked resources
     */
    cleanup() {
        logger.debug(`${this.context}: Cleanup started`);

        // Clear element event listeners
        let listenerCount = 0;
        this.elementListeners.forEach((listeners, element) => {
            listeners.forEach(({ event, handler }) => {
                try {
                    element.removeEventListener(event, handler);
                    listenerCount++;
                } catch (error) {
                    logger.warn(`${this.context}: Error removing event listener:`, error);
                }
            });
        });
        this.elementListeners.clear();
        logger.debug(`${this.context}: Cleaned up ${listenerCount} element listeners`);

        // Clear document listeners
        let docListenerCount = 0;
        this.documentListeners.forEach(({ event, handler }) => {
            try {
                document.removeEventListener(event, handler);
                docListenerCount++;
            } catch (error) {
                logger.warn(`${this.context}: Error removing document listener:`, error);
            }
        });
        this.documentListeners = [];
        logger.debug(`${this.context}: Cleaned up ${docListenerCount} document listeners`);

        // Clear timers
        this.timers.forEach(timerId => {
            try {
                clearTimeout(timerId);
            } catch (error) {
                logger.warn(`${this.context}: Error clearing timer:`, error);
            }
        });
        const timerCount = this.timers.size;
        this.timers.clear();
        logger.debug(`${this.context}: Cleaned up ${timerCount} timers`);

        // Clear intervals
        this.intervals.forEach(intervalId => {
            try {
                clearInterval(intervalId);
            } catch (error) {
                logger.warn(`${this.context}: Error clearing interval:`, error);
            }
        });
        const intervalCount = this.intervals.size;
        this.intervals.clear();
        logger.debug(`${this.context}: Cleaned up ${intervalCount} intervals`);

        // Clear named timers (already counted in timers, but clear the map)
        const namedTimerCount = this.namedTimers.size;
        this.namedTimers.clear();
        logger.debug(`${this.context}: Cleaned up ${namedTimerCount} named timers`);

        // Clear animation frames
        this.animationFrames.forEach(requestId => {
            try {
                window.cancelAnimationFrame(requestId);
            } catch (error) {
                logger.warn(`${this.context}: Error clearing animation frame:`, error);
            }
        });
        const animationFrameCount = this.animationFrames.size;
        this.animationFrames.clear();
        logger.debug(`${this.context}: Cleaned up ${animationFrameCount} animation frames`);

        logger.debug(`${this.context}: Cleanup completed`);
    }

    /**
     * Get statistics for debugging
     * @returns {Object} Stats object with counts
     */
    getStats() {
        return {
            elementListenerCount: this.elementListeners.size,
            documentListenerCount: this.documentListeners.length,
            timerCount: this.timers.size,
            intervalCount: this.intervals.size,
            namedTimerCount: this.namedTimers.size,
            animationFrameCount: this.animationFrames.size
        };
    }

    /**
     * Get list of active named timers (for debugging)
     * @returns {string[]}
     */
    getActiveNamedTimers() {
        return Array.from(this.namedTimers.keys());
    }
}
