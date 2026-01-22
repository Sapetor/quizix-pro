/**
 * Power-Up Manager Module
 * Manages power-up logic, state, and UI for game power-ups
 *
 * Power-ups available:
 * - 50-50: Eliminates half the wrong answers (multiple-choice/true-false only)
 * - Extend Time: Adds extra seconds to the timer
 * - Double Points: 2x score on next correct answer
 */

import { logger, POWER_UPS } from '../../core/config.js';

/**
 * @typedef {Object} PowerUpState
 * @property {boolean} available - Whether the power-up can still be used
 * @property {boolean} used - Whether the power-up has been used
 * @property {boolean} [active] - Whether the power-up effect is currently active (for double-points)
 */

/**
 * @typedef {'fifty-fifty'|'extend-time'|'double-points'} PowerUpType
 */

export class PowerUpManager {
    constructor() {
        /** @type {Map<PowerUpType, PowerUpState>} */
        this.powerUps = new Map();

        /** @type {boolean} */
        this.enabled = false;

        /** @type {Function|null} */
        this.onExtendTime = null;

        /** @type {Function|null} */
        this.onFiftyFifty = null;

        /** @type {import('../../events/event-bus-interface.js').IEventBus|null} */
        this.eventBus = null;

        /** @type {Object|null} socket for multiplayer */
        this.socket = null;

        // Bind methods
        this.handlePowerUpClick = this.handlePowerUpClick.bind(this);
    }

    /**
     * Set event bus for local/practice mode
     * @param {import('../../events/event-bus-interface.js').IEventBus} eventBus
     */
    setEventBus(eventBus) {
        this.eventBus = eventBus;
    }

    /**
     * Set socket for multiplayer mode
     * @param {Object} socket
     */
    setSocket(socket) {
        this.socket = socket;
    }

    /**
     * Initialize power-ups for a new game
     * @param {boolean} powerUpsEnabled - Whether power-ups are enabled for this game
     */
    initialize(powerUpsEnabled) {
        this.enabled = powerUpsEnabled;

        if (!powerUpsEnabled) {
            this.hideUI();
            return;
        }

        // Reset power-up states
        this.powerUps.set('fifty-fifty', { available: true, used: false });
        this.powerUps.set('extend-time', { available: true, used: false });
        this.powerUps.set('double-points', { available: true, used: false, active: false });

        this.showUI();
        this.updateAllButtons();

        logger.debug('[PowerUpManager] Initialized with power-ups enabled');
    }

    /**
     * Reset power-ups for a new game
     */
    reset() {
        this.powerUps.clear();
        this.enabled = false;
        this.hideUI();
        logger.debug('[PowerUpManager] Reset');
    }

    /**
     * Handle power-up button click
     * @param {Event} event - Click event
     */
    handlePowerUpClick(event) {
        const button = event.target.closest('.power-up-btn');
        if (!button) return;

        const powerUpType = button.dataset.powerUp;
        if (powerUpType) {
            this.usePowerUp(powerUpType);
        }
    }

    /**
     * Use a power-up
     * @param {PowerUpType} type - Type of power-up to use
     * @returns {boolean} Whether the power-up was successfully used
     */
    usePowerUp(type) {
        if (!this.enabled) {
            logger.debug('[PowerUpManager] Power-ups not enabled');
            return false;
        }

        const state = this.powerUps.get(type);
        if (!state || !state.available || state.used) {
            logger.debug(`[PowerUpManager] Cannot use ${type}: not available or already used`);
            return false;
        }

        logger.debug(`[PowerUpManager] Using power-up: ${type}`);

        // Emit power-up use event to appropriate handler
        if (this.eventBus) {
            // Practice mode - use local event bus
            this.eventBus.emit('use-power-up', { type });
        } else if (this.socket) {
            // Multiplayer mode - use socket
            this.socket.emit('use-power-up', { type });
        }

        // Activate the power-up locally (UI updates)
        switch (type) {
            case 'fifty-fifty':
                return this.activateFiftyFifty();
            case 'extend-time':
                return this.activateExtendTime();
            case 'double-points':
                return this.activateDoublePoints();
            default:
                logger.warn(`[PowerUpManager] Unknown power-up type: ${type}`);
                return false;
        }
    }

    /**
     * Activate 50-50 power-up
     * @returns {boolean}
     */
    activateFiftyFifty() {
        const state = this.powerUps.get('fifty-fifty');
        if (!state || !state.available) return false;

        state.used = true;
        state.available = false;

        if (this.onFiftyFifty) {
            this.onFiftyFifty();
        }

        this.updateButton('fifty-fifty');
        logger.debug('[PowerUpManager] 50-50 activated');
        return true;
    }

    /**
     * Apply 50-50 effect to answer options - hides half of the wrong answers
     * @param {number} correctIndex - Index of the correct answer
     */
    applyFiftyFiftyToOptions(correctIndex) {
        const options = document.querySelectorAll('#player-multiple-choice .player-option');
        if (options.length < 4) {
            logger.debug('[PowerUpManager] Not enough options for 50-50');
            return;
        }

        // Get indices of wrong answers
        const wrongIndices = [];
        options.forEach((_, index) => {
            if (index !== correctIndex) {
                wrongIndices.push(index);
            }
        });

        // Randomly select half of wrong answers to hide
        const numToHide = Math.ceil(wrongIndices.length / 2);
        const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
        const indicesToHide = shuffled.slice(0, numToHide);

        // Hide the selected wrong options using CSS class
        indicesToHide.forEach(index => {
            const option = options[index];
            if (option) {
                option.classList.add('power-up-hidden');
                option.disabled = true;
            }
        });

        logger.debug(`[PowerUpManager] 50-50 applied, hid indices: ${indicesToHide}`);
    }

    /**
     * Activate Extend Time power-up
     * @returns {boolean}
     */
    activateExtendTime() {
        const state = this.powerUps.get('extend-time');
        if (!state || !state.available) return false;

        state.used = true;
        state.available = false;

        if (this.onExtendTime) {
            this.onExtendTime(POWER_UPS.EXTEND_TIME.extraSeconds);
        }

        this.updateButton('extend-time');
        logger.debug(`[PowerUpManager] Extend Time activated (+${POWER_UPS.EXTEND_TIME.extraSeconds}s)`);
        return true;
    }

    /**
     * Activate Double Points power-up
     * @returns {boolean}
     */
    activateDoublePoints() {
        const state = this.powerUps.get('double-points');
        if (!state || !state.available) return false;

        state.used = true;
        state.available = false;
        state.active = true;

        this.updateButton('double-points');
        logger.debug('[PowerUpManager] Double Points activated');
        return true;
    }

    /**
     * Check if double points is currently active
     * @returns {boolean}
     */
    isDoublePointsActive() {
        const state = this.powerUps.get('double-points');
        return state?.active === true;
    }

    /**
     * Consume double points after scoring
     * Called after a player submits an answer (correct or not)
     */
    consumeDoublePoints() {
        const state = this.powerUps.get('double-points');
        if (state) {
            state.active = false;
            this.updateButton('double-points');
            logger.debug('[PowerUpManager] Double Points consumed');
        }
    }

    /**
     * Get the double points multiplier if active
     * @returns {number} Multiplier (1 if not active, 2 if active)
     */
    getPointsMultiplier() {
        return this.isDoublePointsActive() ? POWER_UPS.DOUBLE_POINTS.multiplier : 1;
    }

    /**
     * Show power-up UI
     */
    showUI() {
        const container = document.getElementById('power-ups-container');
        if (container) {
            container.classList.remove('hidden');
        }
    }

    /**
     * Hide power-up UI
     */
    hideUI() {
        const container = document.getElementById('power-ups-container');
        if (container) {
            container.classList.add('hidden');
        }
    }

    /**
     * Update a single power-up button state
     * @param {PowerUpType} type - Power-up type
     */
    updateButton(type) {
        const button = document.querySelector(`[data-power-up="${type}"]`);
        if (!button) return;

        const state = this.powerUps.get(type);
        if (!state) {
            button.disabled = true;
            return;
        }

        button.disabled = state.used || !state.available;
        button.classList.toggle('used', state.used);
        button.classList.toggle('active', state.active === true);

        // Special handling for 50-50: disable if not applicable
        if (type === 'fifty-fifty' && !state.used) {
            const canUse = this.canUseFiftyFifty();
            button.disabled = !canUse;
            button.classList.toggle('unavailable', !canUse);
        }
    }

    /**
     * Update all power-up buttons
     */
    updateAllButtons() {
        this.updateButton('fifty-fifty');
        this.updateButton('extend-time');
        this.updateButton('double-points');
    }

    /**
     * Update 50-50 availability based on current question type
     * Should be called when question changes
     * @param {string} questionType - Current question type
     */
    updateFiftyFiftyAvailability(questionType) {
        const state = this.powerUps.get('fifty-fifty');
        if (!state || state.used) return;

        // 50-50 only available for multiple-choice
        const available = questionType === 'multiple-choice';
        state.available = available && !state.used;

        this.updateButton('fifty-fifty');
    }

    /**
     * Check if 50-50 can be used on current question
     * @returns {boolean} Whether 50-50 is usable
     */
    canUseFiftyFifty() {
        const state = this.powerUps.get('fifty-fifty');
        if (!state || state.used || !state.available) {
            return false;
        }

        // Check if there are enough visible options
        const options = document.querySelectorAll('#player-multiple-choice .player-option:not(.power-up-hidden)');
        return options.length >= 4;
    }

    /**
     * Reset options hidden by 50-50 for new question
     */
    resetFiftyFiftyOptions() {
        document.querySelectorAll('.player-option.power-up-hidden').forEach(option => {
            option.classList.remove('power-up-hidden');
            option.disabled = false;
        });
    }

    /**
     * Set callback for when extend time is activated
     * @param {Function} callback - Callback receiving extra seconds
     */
    setExtendTimeCallback(callback) {
        this.onExtendTime = callback;
    }

    /**
     * Set callback for when 50-50 is activated
     * @param {Function} callback - Callback to trigger 50-50 effect
     */
    setFiftyFiftyCallback(callback) {
        this.onFiftyFifty = callback;
    }

    /**
     * Get power-up state for serialization
     * @returns {Object} Serialized power-up state
     */
    getState() {
        const state = {};
        this.powerUps.forEach((value, key) => {
            state[key] = { ...value };
        });
        return {
            enabled: this.enabled,
            powerUps: state
        };
    }

    /**
     * Restore power-up state from serialization
     * @param {Object} state - Serialized state
     */
    restoreState(state) {
        if (!state) return;

        this.enabled = state.enabled;
        if (state.powerUps) {
            Object.entries(state.powerUps).forEach(([key, value]) => {
                this.powerUps.set(key, { ...value });
            });
        }

        if (this.enabled) {
            this.showUI();
            this.updateAllButtons();
        } else {
            this.hideUI();
        }
    }

    /**
     * Bind event listeners to power-up buttons
     */
    bindEventListeners() {
        const container = document.getElementById('power-ups-container');
        if (container) {
            container.addEventListener('click', this.handlePowerUpClick);
        }
    }

    /**
     * Unbind event listeners
     */
    unbindEventListeners() {
        const container = document.getElementById('power-ups-container');
        if (container) {
            container.removeEventListener('click', this.handlePowerUpClick);
        }
    }

    /**
     * Cleanup
     */
    cleanup() {
        this.unbindEventListeners();
        this.reset();
    }
}
