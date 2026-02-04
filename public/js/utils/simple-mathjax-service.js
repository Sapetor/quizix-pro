/**
 * Simple MathJax Service
 * Minimal implementation for reliable LaTeX rendering
 */

import { logger } from '../core/config.js';

export class SimpleMathJaxService {
    constructor() {
        this.isReady = false;
        this.renderingInProgress = false;
        this.initializationAttempted = false;

        // Simple cache for rendered content
        this.renderCache = new Map();

        // Queue for pending render requests (instead of skipping)
        this.pendingRenders = [];

        this.initializeMathJax();
    }

    /**
     * Initialize MathJax
     */
    initializeMathJax() {
        setTimeout(() => {
            try {
                if (this.initializationAttempted) {
                    return;
                }
                this.initializationAttempted = true;

                // Check if MathJax is already ready
                if (window.mathJaxReady && window.MathJax && window.MathJax.typesetPromise) {
                    this.handleMathJaxReady();
                    return;
                }

                // Listen for mathjax-ready event from HTML config
                document.addEventListener('mathjax-ready', () => {
                    if (!this.isReady) {
                        this.handleMathJaxReady();
                    }
                });

                // Simple timeout fallback
                setTimeout(() => {
                    if (!this.isReady && document.body) {
                        document.body.classList.add('mathjax-ready');
                    }
                }, 3000);

            } catch (error) {
                logger.error('MathJax initialization error:', error);
            }
        }, 100);
    }

    /**
     * Handle MathJax ready state
     */
    handleMathJaxReady() {
        this.isReady = true;
        if (document.body) {
            document.body.classList.add('mathjax-ready');
        }

        if (window.MathJax && window.MathJax.typesetPromise) {
            logger.debug('MathJax ready for rendering');
        } else {
            logger.warn('MathJax loaded but typesetPromise not available');
        }
    }

    /**
     * Check if MathJax is available
     */
    isAvailable() {
        return this.isReady && window.MathJax && window.MathJax.typesetPromise;
    }

    /**
     * Check if content contains LaTeX syntax
     */
    containsLaTeX(content) {
        if (!content) return false;
        return /\$.*?\$|\\[a-zA-Z]+|\\[{}[\]()]/.test(content);
    }

    /**
     * Render LaTeX in specified elements
     */
    async render(elements) {
        try {
            if (!elements) {
                return Promise.resolve();
            }

            const elementArray = Array.isArray(elements) ? elements : [elements];
            const validElements = elementArray.filter(el => el && el.nodeType === Node.ELEMENT_NODE);

            if (validElements.length === 0) {
                return Promise.resolve();
            }

            // Queue renders instead of skipping to prevent missing renders
            if (this.renderingInProgress) {
                logger.debug('MathJax rendering in progress, queueing elements');
                this.pendingRenders.push(...validElements);
                return Promise.resolve();
            }

            if (!this.isAvailable()) {
                logger.debug('MathJax not available, content will show without LaTeX rendering');
                return Promise.resolve();
            }

            // CRITICAL: Skip elements that already have rendered MathJax to prevent nested rendering
            // This fixes the double-render bug where mjx-assistive-mml contains mjx-container
            const elementsToRender = validElements.filter(element => {
                const existingContainers = element.querySelectorAll(':scope > mjx-container');
                if (existingContainers.length > 0) {
                    logger.debug(`Skipping element - already has ${existingContainers.length} MathJax containers`);
                    return false; // Skip this element
                }
                return true;
            });

            if (elementsToRender.length === 0) {
                logger.debug('All elements already rendered, skipping MathJax');
                return Promise.resolve();
            }

            // Clear previous typeset data for elements we're going to render
            if (window.MathJax.typesetClear) {
                window.MathJax.typesetClear(elementsToRender);
            }

            this.renderingInProgress = true;

            if (window.MathJax.typesetPromise) {
                logger.debug(`Rendering MathJax for ${elementsToRender.length} elements`);
                await window.MathJax.typesetPromise(elementsToRender);
                logger.debug('MathJax rendering completed');
            }

            return Promise.resolve();

        } catch (error) {
            logger.warn('MathJax rendering error (non-blocking):', error);
            return Promise.resolve();
        } finally {
            this.renderingInProgress = false;
            // Process any queued renders
            this.processQueue();
        }
    }

    /**
     * Process queued render requests
     */
    async processQueue() {
        if (this.pendingRenders.length === 0 || this.renderingInProgress) {
            return;
        }

        // Take all pending elements and clear the queue
        const elementsToProcess = [...this.pendingRenders];
        this.pendingRenders = [];

        logger.debug(`Processing ${elementsToProcess.length} queued MathJax renders`);

        // Render the queued elements
        await this.render(elementsToProcess);
    }

    /**
     * Wait for MathJax to become available
     */
    async waitForMathJax(timeout = 1000) {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const checkReady = () => {
                if (this.isAvailable()) {
                    resolve(true);
                    return;
                }

                if (Date.now() - startTime >= timeout) {
                    resolve(false);
                    return;
                }

                setTimeout(checkReady, 50);
            };

            checkReady();
        });
    }

    /**
     * Render LaTeX in entire document or container
     */
    async renderAll(container = document) {
        try {
            if (!container || !container.querySelectorAll) {
                return Promise.resolve();
            }

            const elements = container.querySelectorAll('.tex2jax_process, [data-latex="true"]');
            if (elements.length > 0) {
                logger.debug(`renderAll: processing ${elements.length} elements`);
                return this.render(Array.from(elements));
            }
            return Promise.resolve();
        } catch (error) {
            logger.warn('renderAll error (non-blocking):', error);
            return Promise.resolve();
        }
    }

    /**
     * Check if text contains LaTeX
     */
    hasLatex(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }
        return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\[a-zA-Z]+/.test(text);
    }

    /**
     * Clear render cache
     */
    clearCache() {
        this.renderCache.clear();
        logger.debug('MathJax render cache cleared');
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            isReady: this.isReady,
            isAvailable: this.isAvailable(),
            renderingInProgress: this.renderingInProgress,
            cacheSize: this.renderCache.size
        };
    }
}

// Create singleton instance
export const simpleMathJaxService = new SimpleMathJaxService();

// Backward compatibility
if (typeof window !== 'undefined') {
    window.simpleMathJaxService = simpleMathJaxService;
}