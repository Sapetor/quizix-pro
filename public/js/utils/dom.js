/**
 * Unified DOM Utility
 * Consolidates functionality from dom-utils.js, dom-manager.js, and dom-service.js
 * Provides efficient DOM operations with element caching and error handling
 */

import { logger } from '../core/config.js';

export class DOMManager {
    constructor() {
        this.elementCache = new Map();
        this.eventListeners = new Map();
        this.initialized = false;
    }

    /**
     * Get element by ID with caching
     */
    get(id) {
        // Fast path: return cached element without expensive DOM validation
        if (this.elementCache.has(id)) {
            return this.elementCache.get(id);
        }

        const element = document.getElementById(id);
        if (element) {
            this.elementCache.set(id, element);
        }
        return element;
    }

    /**
     * Query selector with optional caching
     */
    query(selector, context = document, cache = false) {
        const cacheKey = cache ? `${selector}:${context === document ? 'document' : context.id || 'element'}` : null;
        
        // Fast path: return cached element without expensive DOM validation
        if (cache && cacheKey && this.elementCache.has(cacheKey)) {
            return this.elementCache.get(cacheKey);
        }

        const element = context.querySelector(selector);
        if (cache && cacheKey && element) {
            this.elementCache.set(cacheKey, element);
        }
        return element;
    }

    /**
     * Query all elements matching selector
     */
    queryAll(selector, context = document) {
        return context.querySelectorAll(selector);
    }

    /**
     * Update element content safely
     */
    setContent(elementId, content, isHTML = false) {
        const element = this.get(elementId);
        if (element) {
            if (isHTML) {
                element.innerHTML = content;
            } else {
                element.textContent = content;
            }
            logger.debug(`Updated content for ${elementId}`);
            return true;
        }
        logger.warn(`Element not found: ${elementId}`);
        return false;
    }

    /**
     * Clear element content
     */
    clearContent(elementId) {
        const element = this.get(elementId);
        if (element) {
            element.innerHTML = '';
            return true;
        }
        return false;
    }

    /**
     * Show/hide element
     */
    setVisibility(elementId, visible) {
        const element = this.get(elementId);
        if (element) {
            element.style.display = visible ? 'block' : 'none';
            return true;
        }
        return false;
    }

    /**
     * Add class to element
     */
    addClass(elementId, className) {
        const element = this.get(elementId);
        if (element) {
            element.classList.add(className);
            return true;
        }
        return false;
    }

    /**
     * Remove class from element
     */
    removeClass(elementId, className) {
        const element = this.get(elementId);
        if (element) {
            element.classList.remove(className);
            return true;
        }
        return false;
    }

    /**
     * Toggle class on element
     */
    toggleClass(elementId, className) {
        const element = this.get(elementId);
        if (element) {
            element.classList.toggle(className);
            return true;
        }
        return false;
    }

    /**
     * Set element style property
     */
    setStyle(elementId, property, value) {
        const element = this.get(elementId);
        if (element) {
            element.style[property] = value;
            return true;
        }
        return false;
    }

    /**
     * Set element attribute
     */
    setAttribute(elementId, attribute, value) {
        const element = this.get(elementId);
        if (element) {
            element.setAttribute(attribute, value);
            return true;
        }
        return false;
    }

    /**
     * Get element attribute
     */
    getAttribute(elementId, attribute) {
        const element = this.get(elementId);
        if (element) {
            return element.getAttribute(attribute);
        }
        return null;
    }

    /**
     * Add event listener with automatic cleanup tracking
     */
    addEventListener(elementId, event, handler, options = {}) {
        const element = this.get(elementId);
        if (element) {
            element.addEventListener(event, handler, options);
            
            // Track for cleanup
            const key = `${elementId}:${event}`;
            if (!this.eventListeners.has(key)) {
                this.eventListeners.set(key, []);
            }
            this.eventListeners.get(key).push({ handler, options });
            return true;
        }
        return false;
    }

    /**
     * Remove event listener
     */
    removeEventListener(elementId, event, handler) {
        const element = this.get(elementId);
        if (element) {
            element.removeEventListener(event, handler);
            
            // Remove from tracking
            const key = `${elementId}:${event}`;
            if (this.eventListeners.has(key)) {
                const listeners = this.eventListeners.get(key);
                const index = listeners.findIndex(l => l.handler === handler);
                if (index > -1) {
                    listeners.splice(index, 1);
                    if (listeners.length === 0) {
                        this.eventListeners.delete(key);
                    }
                }
            }
            return true;
        }
        return false;
    }

    /**
     * Initialize common game elements for better performance
     */
    initializeGameElements() {
        const commonIds = [
            'player-question-text',
            'current-question',
            'answer-options',
            'game-pin',
            'question-counter',
            'player-question-counter',
            'answer-feedback',
            'result-display',
            'players-list',
            'host-game-screen',
            'player-game-screen',
            'lobby-screen'
        ];

        // Pre-cache common elements
        commonIds.forEach(id => this.get(id));
        this.initialized = true;
        logger.debug('DOM Manager initialized with common game elements');
    }

    /**
     * Clear element cache
     */
    clearCache() {
        this.elementCache.clear();
        logger.debug('DOM cache cleared');
    }

    /**
     * Clear cache for specific element
     */
    clearElement(id) {
        this.elementCache.delete(id);
    }

    /**
     * Check if element exists in DOM
     */
    exists(elementId) {
        return !!this.get(elementId);
    }

    /**
     * Clean up event listeners and cache
     */
    cleanup() {
        // Remove all tracked event listeners
        this.eventListeners.forEach((listeners, key) => {
            const [elementId, event] = key.split(':');
            const element = document.getElementById(elementId);
            if (element) {
                listeners.forEach(({ handler }) => {
                    element.removeEventListener(event, handler);
                });
            }
        });

        this.eventListeners.clear();
        this.clearCache();
        this.initialized = false;
        logger.debug('DOM Manager cleanup completed');
    }

    /**
     * Get cache statistics for debugging
     */
    getStats() {
        return {
            cacheSize: this.elementCache.size,
            eventListenersCount: this.eventListeners.size,
            cachedElements: Array.from(this.elementCache.keys()),
            initialized: this.initialized
        };
    }
}

// Create singleton instance
export const dom = new DOMManager();

/**
 * Escape HTML entities to prevent XSS attacks
 * This is a shared utility function that can be imported directly
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text safe for innerHTML
 */
export function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Escape HTML but preserve LaTeX delimiters for MathJax rendering
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text with LaTeX delimiters preserved
 */
export function escapeHtmlPreservingLatex(text) {
    if (!text) return '';
    // Escape HTML entities but keep $ and \ for LaTeX
    const escaped = escapeHtml(text);
    // Restore LaTeX delimiters that were escaped
    return escaped
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\\(.)/g, '\\$1'); // Preserve backslash escapes for LaTeX
}

/**
 * Bind an event listener to an element by ID (safe - no error if element doesn't exist)
 * This is a convenience function for the common pattern of getElementById + addEventListener
 * @param {string} elementId - The ID of the element
 * @param {string} event - The event type (e.g., 'click', 'input', 'change')
 * @param {Function} handler - The event handler function
 * @param {Object} [options] - Optional addEventListener options
 * @returns {boolean} - True if element was found and listener attached
 */
export function bindElement(elementId, event, handler, options) {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(event, handler, options);
        return true;
    }
    return false;
}

// Export for direct use
export default dom;