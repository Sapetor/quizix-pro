/**
 * Service Locator
 * Centralized service registry to replace window.* globals
 * Enables dependency injection and easier testing
 */

import { logger } from './config.js';

/**
 * @typedef {Object} ServiceRegistration
 * @property {*} instance - The service instance
 * @property {boolean} initialized - Whether the service has been initialized
 */

class ServiceLocatorClass {
    constructor() {
        /** @type {Map<string, ServiceRegistration>} */
        this.services = new Map();

        /** @type {Set<string>} */
        this.requiredServices = new Set([
            'game',
            'uiManager',
            'socketManager',
            'settingsManager',
            'translationManager'
        ]);
    }

    /**
     * Register a service
     * @param {string} name - Service name
     * @param {*} instance - Service instance
     * @returns {void}
     */
    register(name, instance) {
        if (this.services.has(name)) {
            logger.warn(`ServiceLocator: Overwriting existing service '${name}'`);
        }

        this.services.set(name, {
            instance,
            initialized: true
        });

        logger.debug(`ServiceLocator: Registered '${name}'`);
    }

    /**
     * Get a service by name
     * @param {string} name - Service name
     * @returns {*} Service instance or undefined
     */
    get(name) {
        const registration = this.services.get(name);

        if (!registration) {
            logger.warn(`ServiceLocator: Service '${name}' not found`);
            return undefined;
        }

        return registration.instance;
    }

    /**
     * Check if a service is registered
     * @param {string} name - Service name
     * @returns {boolean}
     */
    has(name) {
        return this.services.has(name);
    }

    /**
     * Unregister a service
     * @param {string} name - Service name
     * @returns {boolean} True if service was removed
     */
    unregister(name) {
        if (this.services.has(name)) {
            this.services.delete(name);
            logger.debug(`ServiceLocator: Unregistered '${name}'`);
            return true;
        }
        return false;
    }

    /**
     * Get all registered service names
     * @returns {string[]}
     */
    getRegisteredServices() {
        return Array.from(this.services.keys());
    }

    /**
     * Check if all required services are registered
     * @returns {{ready: boolean, missing: string[]}}
     */
    checkReadiness() {
        const missing = [];
        for (const name of this.requiredServices) {
            if (!this.services.has(name)) {
                missing.push(name);
            }
        }
        return {
            ready: missing.length === 0,
            missing
        };
    }

    /**
     * Clear all services (useful for testing)
     */
    clear() {
        this.services.clear();
        logger.debug('ServiceLocator: All services cleared');
    }

    /**
     * Get service statistics
     * @returns {{total: number, services: string[]}}
     */
    getStats() {
        return {
            total: this.services.size,
            services: this.getRegisteredServices()
        };
    }
}

// Export singleton instance
export const ServiceLocator = new ServiceLocatorClass();

// Also export for backward compatibility during migration
// This allows gradual migration from window.* to ServiceLocator
export function registerGlobalService(name, instance) {
    ServiceLocator.register(name, instance);

    // During migration, also set on window for backward compatibility
    if (typeof window !== 'undefined') {
        window[name] = instance;
    }
}

export function getService(name) {
    // First try ServiceLocator
    if (ServiceLocator.has(name)) {
        return ServiceLocator.get(name);
    }

    // Fallback to window for backward compatibility
    if (typeof window !== 'undefined' && window[name]) {
        logger.debug(`ServiceLocator: Falling back to window.${name}`);
        return window[name];
    }

    return undefined;
}
