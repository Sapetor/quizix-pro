/**
 * LocalEventBus
 * In-memory event bus for single-player practice mode
 * Implements IEventBus interface for code compatibility with multiplayer mode
 */

import { IEventBus } from './event-bus-interface.js';
import { logger } from '../core/config.js';

export class LocalEventBus extends IEventBus {
    /**
     * Create a LocalEventBus
     * @param {Object} options - Configuration options
     * @param {boolean} [options.async=true] - Dispatch events asynchronously
     * @param {boolean} [options.debug=false] - Enable debug logging
     */
    constructor(options = {}) {
        super();
        this.options = {
            async: true,
            debug: false,
            ...options
        };

        /** @type {Map<string, Set<Function>>} */
        this.listeners = new Map();

        this.connected = true;
    }

    /**
     * Emit an event with data
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.options.debug) {
            logger.debug(`[LocalEventBus] emit: ${event}`, data);
        }

        const callbacks = this.listeners.get(event);
        if (!callbacks || callbacks.size === 0) {
            if (this.options.debug) {
                logger.debug(`[LocalEventBus] No listeners for: ${event}`);
            }
            return;
        }

        // Dispatch to all listeners
        callbacks.forEach(callback => {
            if (this.options.async) {
                // Use queueMicrotask for async dispatch (faster than setTimeout)
                queueMicrotask(() => {
                    try {
                        callback(data);
                    } catch (error) {
                        logger.error(`[LocalEventBus] Error in handler for ${event}:`, error);
                    }
                });
            } else {
                // Synchronous dispatch
                try {
                    callback(data);
                } catch (error) {
                    logger.error(`[LocalEventBus] Error in handler for ${event}:`, error);
                }
            }
        });
    }

    /**
     * Register an event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     */
    on(event, callback) {
        if (typeof callback !== 'function') {
            logger.warn(`[LocalEventBus] Invalid callback for event: ${event}`);
            return;
        }

        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        this.listeners.get(event).add(callback);

        if (this.options.debug) {
            logger.debug(`[LocalEventBus] Registered listener for: ${event}`);
        }
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event handler to remove
     */
    off(event, callback) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    /**
     * Remove all listeners for an event (or all events)
     * @param {string} [event] - Event name (optional)
     */
    removeAllListeners(event) {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }

    /**
     * Check if connected (always true for local bus)
     * @returns {boolean}
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Get the mode of this event bus
     * @returns {'local'}
     */
    getMode() {
        return 'local';
    }

    /**
     * Cleanup and disconnect
     */
    disconnect() {
        this.connected = false;
        this.listeners.clear();
        if (this.options.debug) {
            logger.debug('[LocalEventBus] Disconnected');
        }
    }

    /**
     * Get listener count for an event (useful for debugging)
     * @param {string} event - Event name
     * @returns {number}
     */
    listenerCount(event) {
        const callbacks = this.listeners.get(event);
        return callbacks ? callbacks.size : 0;
    }

    /**
     * Get all registered event names (useful for debugging)
     * @returns {string[]}
     */
    eventNames() {
        return Array.from(this.listeners.keys());
    }
}

export default LocalEventBus;
