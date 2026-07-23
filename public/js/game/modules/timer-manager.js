/**
 * Timer Manager Module
 * Handles game timer functionality including countdown, display updates, and timer controls
 * Extracted from game-manager.js for better separation of concerns
 */

import { logger, UI } from '../../core/config.js';
import { unifiedErrorHandler as errorBoundary } from '../../utils/unified-error-handler.js';

export class TimerManager {
    /**
     * @param {object|null} soundManager - optional sound manager for countdown ticks
     *   and the timer-expired cue. When present, the timer plays sounds itself so
     *   callers only need to pass their own tick/complete callbacks.
     */
    constructor(soundManager = null) {
        this.timer = null;
        this.trackedTimers = new Set(); // Track timers for cleanup
        this.timerElement = document.getElementById('timer');
        this.playerTimerElement = document.getElementById('player-timer');
        this.totalDuration = 0;
        this.timeRemaining = 0;
        this.soundManager = soundManager;
    }

    /**
     * Start countdown timer
     */
    startTimer(duration, onTick = null, onComplete = null) {
        return errorBoundary.safeExecute(() => {
            logger.debug('Starting timer with duration:', duration, 'ms');

            // Validate duration
            if (!duration || isNaN(duration) || duration <= 0) {
                logger.error('Invalid timer duration:', duration, '- using default');
                duration = UI.DEFAULT_TIMER_SECONDS * 1000; // Convert seconds to ms
            }

            // Clear existing timer
            this.stopTimer();

            this.totalDuration = duration;
            this.timeRemaining = duration;
            this.updateTimerDisplay(this.timeRemaining);

            // Play countdown sound, then call initial tick if provided
            this.playCountdownSound(this.timeRemaining);
            if (onTick) {
                onTick(this.timeRemaining);
            }

            this.timer = setInterval(() => {
                this.timeRemaining -= 1000;
                this.updateTimerDisplay(this.timeRemaining);

                // Play countdown sound, then call tick callback if provided
                this.playCountdownSound(this.timeRemaining);
                if (onTick) {
                    onTick(this.timeRemaining);
                }

                if (this.timeRemaining <= 0) {
                    logger.debug('Timer finished');
                    this.stopTimer();

                    // Play timer-expired sound, then call completion callback
                    if (this.soundManager?.isSoundsEnabled()) {
                        this.soundManager.playTimerExpired();
                    }
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
     * Play the countdown tick sound for the current remaining time, if a sound
     * manager is present and sounds are enabled. The sound manager decides which
     * seconds actually beep (e.g. 5, 3, 2, 1).
     */
    playCountdownSound(timeRemaining) {
        if (this.soundManager?.isSoundsEnabled()) {
            this.soundManager.playCountdownTick(Math.ceil(timeRemaining / 1000));
        }
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
        const seconds = Math.max(0, Math.ceil(timeRemaining / 1000));

        for (const el of [this.timerElement, this.playerTimerElement]) {
            if (!el) continue;
            el.textContent = seconds.toString();

            // Add warning class for last 10 seconds
            if (seconds <= 10 && seconds > 0) {
                el.classList.add('warning');
            } else {
                el.classList.remove('warning');
            }
        }

        // Feed the host-game timer bar (editorial layout) with a 0-100 percentage.
        const hostScreen = document.getElementById('host-game-screen');
        if (hostScreen) {
            const pct = this.totalDuration > 0
                ? Math.max(0, Math.min(100, (Math.max(0, timeRemaining) / this.totalDuration) * 100))
                : 0;
            hostScreen.style.setProperty('--timer-pct', pct.toFixed(2));
        }
    }

    /**
     * Set static timer display when timer fails
     */
    setStaticTimerDisplay(seconds) {
        try {
            for (const el of [this.timerElement, this.playerTimerElement]) {
                if (!el) continue;
                el.textContent = seconds.toString();
                el.classList.add('error-state');
            }
            logger.debug('Static timer display set to:', seconds);
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

        const timerElement = this.timerElement;
        if (timerElement) {
            const seconds = parseInt(timerElement.textContent) || 0;
            return seconds * 1000;
        }

        return 0;
    }

    /**
     * Extend the timer by adding extra seconds
     * Used by the Extend Time power-up
     * @param {number} extraSeconds - Number of seconds to add
     */
    extendTime(extraSeconds) {
        if (!this.timer) {
            logger.debug('Cannot extend time - timer not running');
            return;
        }

        // Extend the authoritative countdown state so the next interval tick
        // keeps the added time instead of overwriting it.
        this.timeRemaining += extraSeconds * 1000;
        // Grow totalDuration too so the host timer-bar percentage stays <= 100.
        this.totalDuration += extraSeconds * 1000;
        this.updateTimerDisplay(this.timeRemaining);

        logger.debug(`Timer extended by ${extraSeconds}s. New time: ${Math.ceil(this.timeRemaining / 1000)}s`);
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