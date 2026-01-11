/**
 * Storage Utilities
 *
 * Safe wrappers for localStorage operations with consistent error handling.
 * All methods handle QuotaExceededError, private browsing mode, and other storage failures gracefully.
 */

import { logger } from '../core/config.js';

/**
 * Get item from localStorage with fallback default value
 * @param {string} key - Storage key
 * @param {*} defaultValue - Value to return if key doesn't exist or operation fails
 * @returns {string|null} Retrieved value or defaultValue
 */
export function getItem(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    } catch (error) {
        logger.warn(`Failed to get localStorage item "${key}":`, error.message);
        return defaultValue;
    }
}

/**
 * Set item in localStorage
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} True if successful, false otherwise
 */
export function setItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            logger.error(`localStorage quota exceeded when saving "${key}"`);
        } else {
            logger.warn(`Failed to set localStorage item "${key}":`, error.message);
        }
        return false;
    }
}

/**
 * Remove item from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} True if successful, false otherwise
 */
export function removeItem(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        logger.warn(`Failed to remove localStorage item "${key}":`, error.message);
        return false;
    }
}

/**
 * Get and parse JSON from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Value to return if key doesn't exist or parsing fails
 * @returns {*} Parsed JSON object or defaultValue
 */
export function getJSON(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        if (value === null) {
            return defaultValue;
        }
        return JSON.parse(value);
    } catch (error) {
        if (error instanceof SyntaxError) {
            logger.warn(`Failed to parse JSON from localStorage "${key}":`, error.message);
        } else {
            logger.warn(`Failed to get localStorage item "${key}":`, error.message);
        }
        return defaultValue;
    }
}

/**
 * Stringify and save JSON to localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to stringify and store
 * @returns {boolean} True if successful, false otherwise
 */
export function setJSON(key, value) {
    try {
        const jsonString = JSON.stringify(value);
        localStorage.setItem(key, jsonString);
        return true;
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            logger.error(`localStorage quota exceeded when saving "${key}"`);
        } else if (error instanceof TypeError) {
            logger.error(`Failed to stringify value for "${key}":`, error.message);
        } else {
            logger.warn(`Failed to set localStorage item "${key}":`, error.message);
        }
        return false;
    }
}

/**
 * Check if key exists in localStorage
 * @param {string} key - Storage key
 * @returns {boolean} True if key exists, false otherwise
 */
export function hasItem(key) {
    try {
        return localStorage.getItem(key) !== null;
    } catch (error) {
        logger.warn(`Failed to check localStorage item "${key}":`, error.message);
        return false;
    }
}

/**
 * Clear all localStorage
 * @returns {boolean} True if successful, false otherwise
 */
export function clear() {
    try {
        localStorage.clear();
        return true;
    } catch (error) {
        logger.error('Failed to clear localStorage:', error.message);
        return false;
    }
}

/**
 * Get all keys matching a prefix
 * @param {string} prefix - Key prefix to match
 * @returns {string[]} Array of matching keys
 */
export function getKeys(prefix = '') {
    try {
        return Object.keys(localStorage).filter(key => key.startsWith(prefix));
    } catch (error) {
        logger.warn('Failed to get localStorage keys:', error.message);
        return [];
    }
}

/**
 * Remove all keys matching a prefix
 * @param {string} prefix - Key prefix to match
 * @returns {number} Number of keys removed
 */
export function removeByPrefix(prefix) {
    try {
        const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
        keys.forEach(key => localStorage.removeItem(key));
        return keys.length;
    } catch (error) {
        logger.warn(`Failed to remove localStorage items with prefix "${prefix}":`, error.message);
        return 0;
    }
}
