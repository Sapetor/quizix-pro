/**
 * GameContext - Dependency injection container for game managers
 * Reduces coupling on window.game global
 */
export class GameContext {
    constructor() {
        this.managers = new Map();
        this.initialized = false;
    }

    /**
     * Register a manager instance
     * @param {string} name - Manager name (e.g., 'previewManager', 'quizManager')
     * @param {Object} manager - Manager instance
     */
    register(name, manager) {
        if (this.managers.has(name)) {
            console.warn(`GameContext: Overwriting existing manager '${name}'`);
        }
        this.managers.set(name, manager);
    }

    /**
     * Get a registered manager
     * @param {string} name - Manager name
     * @returns {Object|undefined} Manager instance
     */
    get(name) {
        const manager = this.managers.get(name);
        if (!manager) {
            console.warn(`GameContext: Manager '${name}' not found`);
        }
        return manager;
    }

    /**
     * Check if a manager is registered
     * @param {string} name - Manager name
     * @returns {boolean}
     */
    has(name) {
        return this.managers.has(name);
    }

    /**
     * Get all registered manager names
     * @returns {string[]}
     */
    getRegisteredManagers() {
        return Array.from(this.managers.keys());
    }

    /**
     * Mark context as initialized
     */
    markInitialized() {
        this.initialized = true;
    }

    /**
     * Check if context is initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Clear all managers (for testing/cleanup)
     */
    clear() {
        this.managers.clear();
        this.initialized = false;
    }
}

// Singleton instance for gradual migration
export const gameContext = new GameContext();
