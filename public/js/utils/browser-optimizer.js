/**
 * Simple Browser Optimizer
 * Basic browser detection and essential optimizations for Quizix Pro
 */

import { logger } from '../core/config.js';

export class BrowserOptimizer {
    constructor() {
        this.browserInfo = this.detectBrowser();
        this.initializeBasicOptimizations();

        logger.debug('🚀 Browser Optimizer initialized:', this.browserInfo.browser);
    }

    /**
     * Detect browser type
     */
    detectBrowser() {
        const ua = navigator.userAgent;

        let browser = 'unknown';
        if (/Chrome/.test(ua) && /Google Inc/.test(navigator.vendor)) {
            browser = 'chrome';
        } else if (/Edg/.test(ua)) {
            browser = 'edge';
        } else if (/Firefox/.test(ua)) {
            browser = 'firefox';
        } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
            browser = 'safari';
        }

        return {
            browser,
            platform: navigator.platform,
            mobile: /Mobi|Android/i.test(ua)
        };
    }

    /**
     * Initialize basic optimizations
     */
    initializeBasicOptimizations() {
        try {
            // Basic passive event listeners for better scroll performance
            const passiveEvents = ['scroll', 'touchstart', 'touchmove'];
            passiveEvents.forEach(event => {
                document.addEventListener(event, function() {}, { passive: true });
            });

            // Simple memory cleanup on page unload
            window.addEventListener('beforeunload', () => {
                if (window.mathJaxCache) {
                    window.mathJaxCache.clear();
                }
            });

            logger.debug('✅ Basic browser optimizations applied');

        } catch (error) {
            logger.error('Browser optimization failed:', error);
        }
    }

    /**
     * Get basic optimization status
     */
    getOptimizationStatus() {
        return {
            browserInfo: this.browserInfo,
            optimizationsApplied: ['passive-events', 'memory-cleanup']
        };
    }

    /**
     * Cleanup
     */
    cleanup() {
        logger.debug('🧹 Browser Optimizer cleaned up');
    }
}

// Create singleton instance
export const browserOptimizer = new BrowserOptimizer();

// Global cleanup on page unload
window.addEventListener('beforeunload', () => {
    browserOptimizer.cleanup();
});

export default browserOptimizer;