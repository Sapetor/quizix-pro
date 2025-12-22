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
            SYSTEM: 'system'
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
     */
    safeExecute(operation, errorContext = {}, fallback = null) {
        try {
            const result = operation();
            return Promise.resolve(result);
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