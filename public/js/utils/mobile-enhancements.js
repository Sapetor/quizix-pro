/**
 * Mobile Enhancement Utilities for Quizix Pro
 * Simplified to provide only essential touch feedback improvements
 */

import { logger } from '../core/config.js';

class MobileEnhancements {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.isTouch = 'ontouchstart' in window;
        this.initialized = false;
        
        this.init();
    }

    init() {
        if (this.initialized) return;
        
        this.setupTouchFeedback();
        this.setupAccessibilityEnhancements();
        
        this.initialized = true;
        logger.debug('Simplified mobile enhancements initialized');
    }

    /**
     * Essential Touch Feedback for Interactive Elements
     * Adds basic ripple effects and touch handling
     */
    setupTouchFeedback() {
        // Add touch feedback to quiz options and buttons
        const interactiveElements = document.querySelectorAll(
            '.player-option, .checkbox-option, .tf-option, .btn'
        );

        interactiveElements.forEach(element => {
            element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
            element.addEventListener('mousedown', this.handleTouchStart.bind(this), { passive: true });
        });

        // Set up mutation observer for dynamically added elements
        this.observeNewElements();
    }

    handleTouchStart(event) {
        const element = event.currentTarget;
        
        // Remove existing ripple
        const existingRipple = element.querySelector('.ripple-effect');
        if (existingRipple) {
            existingRipple.remove();
        }

        // Create simple ripple effect
        if (this.isMobile) {
            const ripple = document.createElement('span');
            ripple.classList.add('ripple-effect');
            
            // Position ripple at touch point
            const rect = element.getBoundingClientRect();
            const x = (event.clientX || (event.touches && event.touches[0] && event.touches[0].clientX)) - rect.left;
            const y = (event.clientY || (event.touches && event.touches[0] && event.touches[0].clientY)) - rect.top;
            
            if (x !== undefined && y !== undefined) {
                ripple.style.left = `${x}px`;
                ripple.style.top = `${y}px`;
                
                element.appendChild(ripple);
                
                // Remove ripple after animation
                setTimeout(() => {
                    if (ripple.parentElement) {
                        ripple.remove();
                    }
                }, 600);
            }
        }
    }

    observeNewElements() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element node
                        const newElements = node.querySelectorAll && 
                            node.querySelectorAll('.player-option, .checkbox-option, .tf-option, .btn');
                        
                        if (newElements && newElements.length > 0) {
                            newElements.forEach(element => {
                                element.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
                                element.addEventListener('mousedown', this.handleTouchStart.bind(this), { passive: true });
                            });
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Basic Accessibility Enhancements
     */
    setupAccessibilityEnhancements() {
        // Enhanced focus management for mobile
        document.addEventListener('focusin', (event) => {
            if (this.isMobile && event.target.matches('.player-option, .checkbox-option, .tf-option, .btn')) {
                event.target.classList.add('focused-mobile');
            }
        });

        document.addEventListener('focusout', (event) => {
            if (event.target.classList.contains('focused-mobile')) {
                event.target.classList.remove('focused-mobile');
            }
        });

        // Improve keyboard navigation for quiz options
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                const target = event.target;
                if (target.matches('.player-option, .checkbox-option, .tf-option')) {
                    event.preventDefault();
                    this.handleTouchStart(event);
                    // Trigger click after brief delay to show feedback
                    setTimeout(() => {
                        target.click();
                    }, 100);
                }
            }
        });
    }

    /**
     * Utility Methods
     */
    isMobileDevice() {
        return this.isMobile;
    }

    isTouchDevice() {
        return this.isTouch;
    }

    destroy() {
        // Simple cleanup
        this.initialized = false;
    }
}

// Create global instance
window.mobileEnhancements = new MobileEnhancements();

// Export for module use
export { MobileEnhancements };