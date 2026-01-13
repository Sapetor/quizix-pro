/**
 * Timer Manager Module
 * Handles game timer functionality including countdown, display updates, and timer controls
 * Extracted from game-manager.js for better separation of concerns
 */

import { logger } from '../../core/config.js';
import { unifiedErrorHandler as errorBoundary } from '../../utils/unified-error-handler.js';

export class TimerManager {
    constructor() {
        this.timer = null;
        this.trackedTimers = new Set(); // Track timers for cleanup
    }

    /**
     * Start countdown timer
     */
    startTimer(duration, onTick = null, onComplete = null) {
        return errorBoundary.safeExecute(() => {
            logger.debug('Starting timer with duration:', duration, 'ms');

            // Validate duration
            if (!duration || isNaN(duration) || duration <= 0) {
                logger.error('Invalid timer duration:', duration, '- using 30 second default');
                duration = 30000; // Default to 30 seconds
            }

            // Clear existing timer
            this.stopTimer();

            let timeRemaining = duration;
            this.updateTimerDisplay(timeRemaining);

            // Call initial tick if provided
            if (onTick) {
                onTick(timeRemaining);
            }

            this.timer = setInterval(() => {
                timeRemaining -= 1000;
                logger.debug('Timer tick - timeRemaining:', timeRemaining);

                this.updateTimerDisplay(timeRemaining);

                // Call tick callback if provided
                if (onTick) {
                    onTick(timeRemaining);
                }

                if (timeRemaining <= 0) {
                    logger.debug('Timer finished');
                    this.stopTimer();

                    // Call completion callback if provided
                    if (onComplete) {
                        onComplete();
                    }
                }
            }, 1000);

            // Track timer for cleanup
            if (this.timer) {
                this.trackedTimers.add(this.timer);
            }

        }, {
            type: 'timer_management',
            operation: 'start_timer'
        }, () => {
            // Fallback: set static timer display
            logger.error('Failed to start timer, using static display');
            this.setStaticTimerDisplay(Math.ceil(duration / 1000));
        });
    }

    /**
     * Stop the current timer
     */
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.trackedTimers.delete(this.timer);
            this.timer = null;
            logger.debug('Timer stopped');
        }
    }

    /**
     * Update timer display in the UI
     */
    updateTimerDisplay(timeRemaining) {
        const timerElement = document.getElementById('timer');
        // logger.debug('updateTimerDisplay - element found:', !!timerElement, 'timeRemaining:', timeRemaining);

        if (timerElement) {
            const seconds = Math.max(0, Math.ceil(timeRemaining / 1000));
            timerElement.textContent = seconds.toString();
            // logger.debug('Timer updated to:', seconds);

            // Add warning class for last 10 seconds
            if (seconds <= 10 && seconds > 0) {
                timerElement.classList.add('warning');
            } else {
                timerElement.classList.remove('warning');
            }
        } else {
            // Fallback: set to 0 if element not found
            // logger.debug('Timer set to 0 (fallback)');
        }

        if (!timerElement) {
            // logger.debug('Timer element not found!');
        }
    }

    /**
     * Set static timer display when timer fails
     */
    setStaticTimerDisplay(seconds) {
        try {
            const timerElement = document.getElementById('timer');
            if (timerElement) {
                timerElement.textContent = seconds.toString();
                timerElement.classList.add('error-state');
                logger.debug('Static timer display set to:', seconds);
            }
        } catch (error) {
            logger.error('Failed to set static timer display:', error);
        }
    }

    /**
     * Check if timer is currently running
     */
    isRunning() {
        return !!this.timer;
    }

    /**
     * Get remaining time (approximation)
     */
    getRemainingTime() {
        if (!this.timer) return 0;

        const timerElement = document.getElementById('timer');
        if (timerElement) {
            const seconds = parseInt(timerElement.textContent) || 0;
            return seconds * 1000;
        }

        return 0;
    }

    /**
     * Clean up all timers
     */
    cleanup() {
        this.stopTimer();

        // Clear any remaining tracked timers
        this.trackedTimers.forEach(timer => {
            try {
                clearInterval(timer);
                clearTimeout(timer);
            } catch (error) {
                logger.warn('Error clearing timer:', error);
            }
        });

        this.trackedTimers.clear();
        logger.debug('TimerManager cleanup completed');
    }
}