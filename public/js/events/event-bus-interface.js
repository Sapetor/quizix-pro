/**
 * IEventBus Interface
 * Abstract interface for event bus implementations (Socket.IO or Local)
 * Enables swapping between multiplayer and practice mode
 */

/**
 * @typedef {Object} EventBusOptions
 * @property {boolean} [async=true] - Whether to dispatch events asynchronously
 */

/**
 * Interface for event bus implementations
 * @abstract
 */
export class IEventBus {
    /**
     * Emit an event with data
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @returns {void}
     */
    emit(event, data) {
        throw new Error('IEventBus.emit() must be implemented');
    }

    /**
     * Register an event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     * @returns {void}
     */
    on(event, callback) {
        throw new Error('IEventBus.on() must be implemented');
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {Function} callback - Event handler to remove
     * @returns {void}
     */
    off(event, callback) {
        throw new Error('IEventBus.off() must be implemented');
    }

    /**
     * Remove all listeners for an event (or all events if no event specified)
     * @param {string} [event] - Event name (optional)
     * @returns {void}
     */
    removeAllListeners(event) {
        throw new Error('IEventBus.removeAllListeners() must be implemented');
    }

    /**
     * Check if the event bus is connected/ready
     * @returns {boolean}
     */
    isConnected() {
        throw new Error('IEventBus.isConnected() must be implemented');
    }

    /**
     * Get the mode of this event bus
     * @returns {'socket'|'local'}
     */
    getMode() {
        throw new Error('IEventBus.getMode() must be implemented');
    }

    /**
     * Cleanup and disconnect
     * @returns {void}
     */
    disconnect() {
        throw new Error('IEventBus.disconnect() must be implemented');
    }
}

export default IEventBus;
