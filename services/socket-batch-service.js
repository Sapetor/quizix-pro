/**
 * Socket Event Batching Service
 *
 * Batches frequent Socket.IO events to reduce network traffic.
 * Particularly useful for high-frequency events like answer statistics.
 *
 * Features:
 * - Configurable batch interval (default 500ms)
 * - Event-type specific batching
 * - Automatic flush on game state changes
 * - Memory-efficient with max batch size limits
 */

class SocketBatchService {
    constructor(io, logger, options = {}) {
        this.io = io;
        this.logger = logger;

        // Configuration
        this.batchInterval = options.batchInterval || 500; // ms
        this.maxBatchSize = options.maxBatchSize || 100;
        this.enabled = options.enabled !== false;

        // Batch queues per room and event type
        this.batches = new Map(); // Map<roomId, Map<eventType, Array<payload>>>

        // Batch timers per room
        this.timers = new Map(); // Map<roomId, timeoutId>

        // Events that should be batched (high-frequency events)
        this.batchableEvents = new Set([
            'answer-statistics',
            'player-answered',
            'leaderboard-update'
        ]);

        // Events that should trigger immediate flush
        this.flushTriggers = new Set([
            'question-ended',
            'game-ended',
            'next-question',
            'time-up'
        ]);
    }

    /**
     * Emit an event, potentially batching it for efficiency
     * @param {string} roomId - The room to emit to
     * @param {string} eventType - The event type
     * @param {*} payload - The event payload
     * @param {boolean} forceBatch - Force batching even for non-batchable events
     */
    emit(roomId, eventType, payload, forceBatch = false) {
        // If batching is disabled or event shouldn't be batched, emit immediately
        if (!this.enabled || (!forceBatch && !this.batchableEvents.has(eventType))) {
            this.io.to(roomId).emit(eventType, payload);
            return;
        }

        // Initialize room batch if needed
        if (!this.batches.has(roomId)) {
            this.batches.set(roomId, new Map());
        }

        const roomBatches = this.batches.get(roomId);

        // Initialize event type batch if needed
        if (!roomBatches.has(eventType)) {
            roomBatches.set(eventType, []);
        }

        const eventBatch = roomBatches.get(eventType);

        // For certain events, we only keep the latest value (delta updates)
        if (eventType === 'answer-statistics' || eventType === 'leaderboard-update') {
            // Replace with latest - only the most recent state matters
            roomBatches.set(eventType, [payload]);
        } else {
            // Add to batch
            eventBatch.push(payload);

            // Enforce max batch size
            if (eventBatch.length >= this.maxBatchSize) {
                this.flushRoom(roomId);
                return;
            }
        }

        // Schedule flush if not already scheduled
        if (!this.timers.has(roomId)) {
            const timerId = setTimeout(() => {
                this.flushRoom(roomId);
            }, this.batchInterval);
            this.timers.set(roomId, timerId);
        }
    }

    /**
     * Emit directly without batching (for critical events)
     * @param {string} roomId - The room to emit to
     * @param {string} eventType - The event type
     * @param {*} payload - The event payload
     */
    emitImmediate(roomId, eventType, payload) {
        // Check if this should trigger a flush of pending batches
        if (this.flushTriggers.has(eventType)) {
            this.flushRoom(roomId);
        }

        this.io.to(roomId).emit(eventType, payload);
    }

    /**
     * Flush all batched events for a room
     * @param {string} roomId - The room to flush
     */
    flushRoom(roomId) {
        // Clear timer
        if (this.timers.has(roomId)) {
            clearTimeout(this.timers.get(roomId));
            this.timers.delete(roomId);
        }

        // Get room batches
        const roomBatches = this.batches.get(roomId);
        if (!roomBatches || roomBatches.size === 0) {
            return;
        }

        // Emit all batched events
        for (const [eventType, payloads] of roomBatches.entries()) {
            if (payloads.length === 0) continue;

            if (payloads.length === 1) {
                // Single item, emit directly
                this.io.to(roomId).emit(eventType, payloads[0]);
            } else {
                // Multiple items, emit as batch
                this.io.to(roomId).emit(`${eventType}-batch`, payloads);
            }

            this.logger.debug(`Flushed ${payloads.length} ${eventType} events to room ${roomId}`);
        }

        // Clear room batches
        this.batches.delete(roomId);
    }

    /**
     * Flush all batched events for all rooms
     */
    flushAll() {
        for (const roomId of this.batches.keys()) {
            this.flushRoom(roomId);
        }
    }

    /**
     * Clean up a room (call when game ends)
     * @param {string} roomId - The room to clean up
     */
    cleanupRoom(roomId) {
        this.flushRoom(roomId);
        this.batches.delete(roomId);

        if (this.timers.has(roomId)) {
            clearTimeout(this.timers.get(roomId));
            this.timers.delete(roomId);
        }
    }

    /**
     * Stop all batching and clean up
     */
    shutdown() {
        this.flushAll();

        for (const timerId of this.timers.values()) {
            clearTimeout(timerId);
        }
        this.timers.clear();
        this.batches.clear();
    }

    /**
     * Get batching statistics
     * @returns {Object} - Batching statistics
     */
    getStats() {
        let totalBatched = 0;
        for (const roomBatches of this.batches.values()) {
            for (const payloads of roomBatches.values()) {
                totalBatched += payloads.length;
            }
        }

        return {
            enabled: this.enabled,
            activeRooms: this.batches.size,
            pendingEvents: totalBatched,
            batchInterval: this.batchInterval,
            maxBatchSize: this.maxBatchSize
        };
    }
}

module.exports = { SocketBatchService };
