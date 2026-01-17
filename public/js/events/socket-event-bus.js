/**
 * SocketEventBus
 * Adapter wrapping SocketManager to implement IEventBus interface
 * Used for multiplayer mode - routes events through Socket.IO
 */

import { IEventBus } from './event-bus-interface.js';
import { logger } from '../core/config.js';

export class SocketEventBus extends IEventBus {
    /**
     * Create a SocketEventBus
     * @param {Object} socketManager - SocketManager instance
     * @param {Object} socket - Socket.IO socket instance
     */
    constructor(socketManager, socket) {
        super();
        this.socketManager = socketManager;
        this.socket = socket;

        /** @type {Map<string, Set<Function>>} */
        this.localListeners = new Map();
    }

    /**
     * Emit an event
     * Maps high-level game events to SocketManager methods
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        logger.debug(`[SocketEventBus] emit: ${event}`, data);

        // Route to appropriate SocketManager method
        switch (event) {
            case 'host-join':
            case 'create-game':
                this.socketManager.createGame(data);
                break;

            case 'player-join':
            case 'join-game':
                this.socketManager.joinGame(data.pin, data.playerName);
                break;

            case 'start-game':
                this.socketManager.startGame();
                break;

            case 'submit-answer':
                this.socketManager.submitAnswer(data.answer);
                break;

            case 'next-question':
                this.socketManager.nextQuestion();
                break;

            case 'leave-game':
                this.socketManager.leaveGame();
                break;

            default:
                // For unknown events, emit directly to socket
                logger.debug(`[SocketEventBus] Direct emit: ${event}`);
                this.socket.emit(event, data);
        }
    }

    /**
     * Register an event listener
     * Delegates to the underlying socket
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     */
    on(event, callback) {
        if (typeof callback !== 'function') {
            logger.warn(`[SocketEventBus] Invalid callback for event: ${event}`);
            return;
        }

        // Track local listeners for potential cleanup
        if (!this.localListeners.has(event)) {
            this.localListeners.set(event, new Set());
        }
        this.localListeners.get(event).add(callback);

        // Register with socket
        this.socket.on(event, callback);
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event handler to remove
     */
    off(event, callback) {
        this.socket.off(event, callback);

        // Clean up local tracking
        const callbacks = this.localListeners.get(event);
        if (callbacks) {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                this.localListeners.delete(event);
            }
        }
    }

    /**
     * Remove all listeners for an event
     * @param {string} [event] - Event name (optional)
     */
    removeAllListeners(event) {
        if (event) {
            const callbacks = this.localListeners.get(event);
            if (callbacks) {
                callbacks.forEach(cb => this.socket.off(event, cb));
                this.localListeners.delete(event);
            }
        } else {
            // Remove all tracked listeners
            this.localListeners.forEach((callbacks, evt) => {
                callbacks.forEach(cb => this.socket.off(evt, cb));
            });
            this.localListeners.clear();
        }
    }

    /**
     * Check if connected to server
     * @returns {boolean}
     */
    isConnected() {
        return this.socket.connected;
    }

    /**
     * Get the mode of this event bus
     * @returns {'socket'}
     */
    getMode() {
        return 'socket';
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.removeAllListeners();
        // Don't actually disconnect the socket - let SocketManager handle that
    }

    /**
     * Get the underlying socket (for compatibility)
     * @returns {Object}
     */
    getSocket() {
        return this.socket;
    }

    /**
     * Get the underlying socket manager (for compatibility)
     * @returns {Object}
     */
    getSocketManager() {
        return this.socketManager;
    }
}

export default SocketEventBus;
