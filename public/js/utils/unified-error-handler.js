/**
 * Unified Error Handler
 * Consolidates error-handler.js, error-boundary.js, and error-handling-service.js
 * Provides simple, consistent error handling across the application
 */

import { logger } from '../core/config.js';
import { translationManager } from './translation-manager.js';

export class UnifiedErrorHandler {
    constructor() {
        // Simple error tracking
        this.errors = [];
        this.maxStoredErrors = 50;
        this.maxRetries = 3;
        this.retryDelay = 1000;

        // Error type categories
        this.errorTypes = {
            NETWORK: 'network',
            DOM: 'dom',
            GAME_LOGIC: 'game_logic',
            USER_INPUT: 'user_input',
            SYSTEM: 'system',
            VALIDATION: 'validation',
            SOCKET: 'socket',
            AI: 'ai'
        };

        // User-friendly error messages by error code/type
        this.errorMessages = {
            // Network errors
            'NETWORK_TIMEOUT': 'connectionTimeout',
            'NETWORK_OFFLINE': 'noConnection',
            'NETWORK_ERROR': 'networkError',
            'FETCH_FAILED': 'networkError',
            // Socket errors
            'SOCKET_DISCONNECTED': 'connectionLost',
            'SOCKET_TIMEOUT': 'connectionTimeout',
            // Game errors
            'GAME_NOT_FOUND': 'gameNotFound',
            'GAME_ALREADY_STARTED': 'gameAlreadyStarted',
            'INVALID_PIN': 'invalidPin',
            // AI errors
            'AI_GENERATION_FAILED': 'aiGenerationFailed',
            'AI_RATE_LIMITED': 'aiRateLimited',
            // Validation errors
            'INVALID_INPUT': 'invalidInput',
            'REQUIRED_FIELD': 'requiredField'
        };

        this.setupGlobalErrorHandlers();
    }

    /**
     * Simple error logging - replaces error-handler.js
     */
    log(error, context = {}, severity = 'error') {
        if (!error) error = new Error('Unknown error');
        if (typeof error === 'string') error = new Error(error);

        const errorInfo = {
            timestamp: new Date().toISOString(),
            message: error.message || 'Unknown error',
            stack: error.stack,
            context,
            severity
        };

        // Use logger if available
        if (logger && logger[severity]) {
            logger[severity](errorInfo.message, errorInfo);
        } else {
            console[severity](errorInfo.message, errorInfo);
        }

        // Store for debugging
        this.errors.push(errorInfo);
        if (this.errors.length > this.maxStoredErrors) {
            this.errors.shift();
        }
    }

    /**
     * Safe execution wrapper - replaces error-boundary.js safeExecute
     * Handles both sync and async operations
     */
    safeExecute(operation, errorContext = {}, fallback = null) {
        try {
            const result = operation();

            // If result is a Promise, handle async errors
            if (result && typeof result.then === 'function') {
                return result.catch(error => {
                    this.log(error, errorContext, 'error');

                    if (fallback && typeof fallback === 'function') {
                        try {
                            const fallbackResult = fallback();
                            // Handle async fallback
                            if (fallbackResult && typeof fallbackResult.then === 'function') {
                                return fallbackResult.catch(fallbackError => {
                                    this.log(fallbackError, { ...errorContext, isFallback: true }, 'warn');
                                    return null;
                                });
                            }
                            return fallbackResult;
                        } catch (fallbackError) {
                            this.log(fallbackError, { ...errorContext, isFallback: true }, 'warn');
                            return null;
                        }
                    }

                    return null;
                });
            }

            // Sync operation
            return result;
        } catch (error) {
            this.log(error, errorContext, 'error');

            if (fallback && typeof fallback === 'function') {
                try {
                    return fallback();
                } catch (fallbackError) {
                    this.log(fallbackError, { ...errorContext, isFallback: true }, 'warn');
                    return null;
                }
            }

            return null;
        }
    }

    /**
     * Async operation wrapper with retry - replaces error-handling-service.js
     */
    async wrapAsyncOperation(operation, options = {}) {
        const {
            retryable = false,
            maxRetries = this.maxRetries,
            errorType = this.errorTypes.SYSTEM,
            fallback = null,
            context = {},
            silent = false
        } = options;

        let lastError = null;
        let attempts = 0;

        while (attempts <= maxRetries) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                attempts++;

                // Only log if not silent
                if (!silent) {
                    this.log(error, {
                        ...context,
                        attempt: attempts,
                        errorType,
                        retryable
                    }, 'error');
                }

                if (retryable && attempts <= maxRetries) {
                    await this.delay(this.retryDelay * attempts);
                    continue;
                }

                break;
            }
        }

        // All retries failed, try fallback
        if (fallback && typeof fallback === 'function') {
            try {
                return await fallback();
            } catch (fallbackError) {
                this.log(fallbackError, { ...context, isFallback: true }, 'warn');
            }
        }

        throw lastError;
    }

    /**
     * Safe DOM operation - simplified from error-boundary.js
     */
    safeDOMOperation(operation, fallback = null) {
        return this.safeExecute(operation, { type: this.errorTypes.DOM }, fallback);
    }

    /**
     * Safe network operation - simplified from error-boundary.js
     */
    async safeNetworkOperation(operation, operationType = 'api_call', fallback = null) {
        try {
            return await operation();
        } catch (error) {
            this.log(error, {
                type: this.errorTypes.NETWORK,
                operation: operationType
            }, 'error');

            if (fallback && typeof fallback === 'function') {
                try {
                    return await fallback();
                } catch (fallbackError) {
                    this.log(fallbackError, { isFallback: true }, 'warn');
                }
            }

            return fallback;
        }
    }

    /**
     * Safe socket handler - simplified from error-boundary.js
     */
    safeSocketHandler(handler, eventName) {
        return (data) => {
            this.safeExecute(
                () => handler(data),
                { type: 'socket_event', eventName },
                () => logger.warn(`Socket handler failed for ${eventName}`)
            );
        };
    }

    /**
     * Setup global error handlers
     */
    setupGlobalErrorHandlers() {
        if (typeof window !== 'undefined') {
            window.addEventListener('error', (event) => {
                this.log(event.error || new Error(event.message), {
                    type: 'global_error',
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                });
            });

            window.addEventListener('unhandledrejection', (event) => {
                this.log(event.reason, { type: 'unhandled_promise_rejection' });
            });
        }
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get recent errors for debugging
     */
    getRecentErrors(count = 10) {
        return this.errors.slice(-count);
    }

    /**
     * Clear error history
     */
    clearErrors() {
        this.errors = [];
    }

    /**
     * Get user-friendly error message from error code
     * @param {string} errorCode - Error code (e.g., 'NETWORK_TIMEOUT')
     * @param {Object} params - Optional parameters for message formatting
     * @returns {string} Translated user-friendly message
     */
    getUserMessage(errorCode, params = {}) {
        const translationKey = this.errorMessages[errorCode];
        if (translationKey && translationManager) {
            return translationManager.get(translationKey, params);
        }
        // Fallback to generic message
        return translationManager?.get('error') || 'An error occurred';
    }

    /**
     * Handle error with optional user notification
     * @param {Error|string} error - The error to handle
     * @param {Object} options - Handling options
     * @param {string} options.errorCode - Error code for user message
     * @param {boolean} options.showToast - Whether to show toast notification
     * @param {string} options.toastType - Toast type ('error', 'warning', 'info')
     * @param {Object} options.context - Additional context for logging
     * @returns {void}
     */
    handleError(error, options = {}) {
        const {
            errorCode = null,
            showToast = false,
            toastType = 'error',
            context = {}
        } = options;

        // Log the error
        this.log(error, context, 'error');

        // Show toast notification if requested
        if (showToast && typeof window !== 'undefined' && window.showToast) {
            const message = errorCode
                ? this.getUserMessage(errorCode)
                : (typeof error === 'string' ? error : error.message);
            window.showToast(message, toastType);
        }
    }

    /**
     * Create a standardized error with code
     * @param {string} code - Error code
     * @param {string} message - Technical error message
     * @param {Object} details - Additional error details
     * @returns {Error} Error object with code property
     */
    createError(code, message, details = {}) {
        const error = new Error(message);
        error.code = code;
        error.details = details;
        return error;
    }

    /**
     * Check if error is of a specific type
     * @param {Error} error - Error to check
     * @param {string} type - Error type from errorTypes
     * @returns {boolean}
     */
    isErrorType(error, type) {
        return error?.code?.startsWith(type.toUpperCase()) || false;
    }

    /**
     * Check if error is recoverable (can retry)
     * @param {Error} error - Error to check
     * @returns {boolean}
     */
    isRecoverable(error) {
        const recoverableCodes = [
            'NETWORK_TIMEOUT',
            'NETWORK_ERROR',
            'SOCKET_DISCONNECTED',
            'AI_RATE_LIMITED'
        ];
        return recoverableCodes.includes(error?.code);
    }
}

// Create and export singleton
export const unifiedErrorHandler = new UnifiedErrorHandler();

// For backward compatibility, export as multiple names
export const errorHandler = unifiedErrorHandler;
export const errorBoundary = unifiedErrorHandler;

// Make available globally for debugging
if (typeof window !== 'undefined') {
    window.errorHandler = unifiedErrorHandler;
    window.errorBoundary = unifiedErrorHandler;
}

export default unifiedErrorHandler;