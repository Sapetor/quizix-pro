/**
 * BaseCarousel - Shared carousel functionality
 * Provides common touch handling, navigation, auto-play, and keyboard support
 */

import { logger } from '../core/config.js';

export class BaseCarousel {
    constructor(options = {}) {
        this.currentIndex = 0;
        this.slides = [];
        this.dots = [];
        this.isTransitioning = false;
        this.autoPlayInterval = null;
        this.isAutoPlaying = false;
        this.autoPlayDelay = options.autoPlayDelay || 5000;
        this.minSwipeDistance = options.minSwipeDistance || 50;

        // Touch/mouse state
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isDragging = false;

        // Container reference (set by subclass)
        this.container = null;

        // Store bound event handlers for cleanup
        this._boundHandlers = {
            keydown: null,
            touchstart: null,
            touchmove: null,
            touchend: null,
            mousedown: null,
            mousemove: null,
            mouseup: null,
            mouseleave: null,
            mouseenter: null,
            containerMouseleave: null,
            focusin: null,
            focusout: null,
            windowBlur: null,
            windowFocus: null,
            dotClicks: []
        };
    }

    /**
     * Initialize carousel - called by subclass after setting up container/slides
     */
    initBase() {
        if (!this.container || this.slides.length === 0) {
            logger.debug('BaseCarousel: No container or slides, skipping init');
            return false;
        }

        this.setupDotNavigation();
        this.setupKeyboardEvents();
        this.setupTouchEvents();
        this.setupAutoPlayListeners();

        return true;
    }

    /**
     * Setup dot navigation click handlers
     */
    setupDotNavigation() {
        this._boundHandlers.dotClicks = [];
        this.dots.forEach((dot, index) => {
            const handler = () => {
                this.pauseAutoPlay();
                this.goToSlide(index);
                this.scheduleAutoPlayResume();
            };
            this._boundHandlers.dotClicks.push({ dot, handler });
            dot.addEventListener('click', handler);
        });
    }

    /**
     * Setup keyboard navigation (arrow keys)
     */
    setupKeyboardEvents() {
        if (!this.container) return;

        this._boundHandlers.keydown = (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.previousSlide();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.nextSlide();
            }
        };
        this.container.addEventListener('keydown', this._boundHandlers.keydown);

        // Make container focusable
        this.container.setAttribute('tabindex', '0');
    }

    /**
     * Setup touch and mouse events for swiping
     */
    setupTouchEvents() {
        if (!this.container) return;

        // Bind handlers for cleanup
        this._boundHandlers.touchstart = (e) => this.handleTouchStart(e);
        this._boundHandlers.touchmove = (e) => this.handleTouchMove(e);
        this._boundHandlers.touchend = (e) => this.handleTouchEnd(e);
        this._boundHandlers.mousedown = (e) => this.handleMouseDown(e);
        this._boundHandlers.mousemove = (e) => this.handleMouseMove(e);
        this._boundHandlers.mouseup = (e) => this.handleMouseUp(e);
        this._boundHandlers.mouseleave = (e) => this.handleMouseUp(e);

        // Touch events
        this.container.addEventListener('touchstart', this._boundHandlers.touchstart, { passive: true });
        this.container.addEventListener('touchmove', this._boundHandlers.touchmove, { passive: false });
        this.container.addEventListener('touchend', this._boundHandlers.touchend, { passive: true });

        // Mouse events for desktop
        this.container.addEventListener('mousedown', this._boundHandlers.mousedown);
        this.container.addEventListener('mousemove', this._boundHandlers.mousemove);
        this.container.addEventListener('mouseup', this._boundHandlers.mouseup);
        this.container.addEventListener('mouseleave', this._boundHandlers.mouseleave);
    }

    /**
     * Setup auto-play pause/resume listeners
     */
    setupAutoPlayListeners() {
        if (!this.container) return;

        // Bind handlers for cleanup
        this._boundHandlers.mouseenter = () => this.pauseAutoPlay();
        this._boundHandlers.containerMouseleave = () => this.resumeAutoPlay();
        this._boundHandlers.focusin = () => this.pauseAutoPlay();
        this._boundHandlers.focusout = () => this.resumeAutoPlay();
        this._boundHandlers.windowBlur = () => this.pauseAutoPlay();
        this._boundHandlers.windowFocus = () => this.resumeAutoPlay();

        this.container.addEventListener('mouseenter', this._boundHandlers.mouseenter);
        this.container.addEventListener('mouseleave', this._boundHandlers.containerMouseleave);
        this.container.addEventListener('focusin', this._boundHandlers.focusin);
        this.container.addEventListener('focusout', this._boundHandlers.focusout);

        window.addEventListener('blur', this._boundHandlers.windowBlur);
        window.addEventListener('focus', this._boundHandlers.windowFocus);
    }

    // Touch event handlers
    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.isDragging = true;
        this.pauseAutoPlay();
    }

    handleTouchMove(e) {
        if (!this.isDragging) return;

        const diffX = Math.abs(e.touches[0].clientX - this.touchStartX);
        const diffY = Math.abs(e.touches[0].clientY - this.touchStartY);

        // Prevent scroll if horizontal swipe
        if (diffX > diffY && diffX > 10) {
            e.preventDefault();
        }
    }

    handleTouchEnd(e) {
        if (!this.isDragging) return;

        const endX = e.changedTouches[0].clientX;
        const diffX = this.touchStartX - endX;

        if (Math.abs(diffX) > this.minSwipeDistance) {
            if (diffX > 0) {
                this.nextSlide();
            } else {
                this.previousSlide();
            }
        }

        this.isDragging = false;
        this.scheduleAutoPlayResume();
    }

    // Mouse event handlers
    handleMouseDown(e) {
        this.touchStartX = e.clientX;
        this.isDragging = true;
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
    }

    handleMouseUp(e) {
        if (!this.isDragging) return;

        const diffX = this.touchStartX - e.clientX;

        if (Math.abs(diffX) > this.minSwipeDistance) {
            if (diffX > 0) {
                this.nextSlide();
            } else {
                this.previousSlide();
            }
        }

        this.isDragging = false;
    }

    // Navigation methods
    nextSlide() {
        const nextIndex = (this.currentIndex + 1) % this.slides.length;
        this.goToSlide(nextIndex);
    }

    previousSlide() {
        const prevIndex = (this.currentIndex - 1 + this.slides.length) % this.slides.length;
        this.goToSlide(prevIndex);
    }

    goToSlide(index) {
        if (this.isTransitioning || index === this.currentIndex) return;
        if (index < 0 || index >= this.slides.length) return;

        this.isTransitioning = true;
        this.currentIndex = index;

        // Call subclass-specific slide update
        this.updateSlideDisplay();
        this.updateActiveStates();

        // Reset transition flag
        setTimeout(() => {
            this.isTransitioning = false;
        }, 300);
    }

    /**
     * Update active states on slides and dots
     */
    updateActiveStates() {
        this.slides.forEach((slide, index) => {
            slide.classList.toggle('active', index === this.currentIndex);
        });

        this.dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentIndex);
        });
    }

    /**
     * Override in subclass for specific slide display logic
     */
    updateSlideDisplay() {
        // Default: just update active states (show/hide approach)
        // Subclasses can override for transform-based sliding
    }

    // Auto-play methods
    startAutoPlay() {
        if (this.slides.length <= 1) return;

        this.isAutoPlaying = true;
        this.autoPlayInterval = setInterval(() => {
            this.nextSlide();
        }, this.autoPlayDelay);
    }

    pauseAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
        this.isAutoPlaying = false;
    }

    resumeAutoPlay() {
        if (!this.isAutoPlaying && this.slides.length > 1) {
            this.startAutoPlay();
        }
    }

    scheduleAutoPlayResume(delay = 2000) {
        setTimeout(() => this.resumeAutoPlay(), delay);
    }

    destroy() {
        this.pauseAutoPlay();

        // Remove container event listeners
        if (this.container) {
            if (this._boundHandlers.keydown) {
                this.container.removeEventListener('keydown', this._boundHandlers.keydown);
            }
            if (this._boundHandlers.touchstart) {
                this.container.removeEventListener('touchstart', this._boundHandlers.touchstart);
            }
            if (this._boundHandlers.touchmove) {
                this.container.removeEventListener('touchmove', this._boundHandlers.touchmove);
            }
            if (this._boundHandlers.touchend) {
                this.container.removeEventListener('touchend', this._boundHandlers.touchend);
            }
            if (this._boundHandlers.mousedown) {
                this.container.removeEventListener('mousedown', this._boundHandlers.mousedown);
            }
            if (this._boundHandlers.mousemove) {
                this.container.removeEventListener('mousemove', this._boundHandlers.mousemove);
            }
            if (this._boundHandlers.mouseup) {
                this.container.removeEventListener('mouseup', this._boundHandlers.mouseup);
            }
            if (this._boundHandlers.mouseleave) {
                this.container.removeEventListener('mouseleave', this._boundHandlers.mouseleave);
            }
            if (this._boundHandlers.mouseenter) {
                this.container.removeEventListener('mouseenter', this._boundHandlers.mouseenter);
            }
            if (this._boundHandlers.containerMouseleave) {
                this.container.removeEventListener('mouseleave', this._boundHandlers.containerMouseleave);
            }
            if (this._boundHandlers.focusin) {
                this.container.removeEventListener('focusin', this._boundHandlers.focusin);
            }
            if (this._boundHandlers.focusout) {
                this.container.removeEventListener('focusout', this._boundHandlers.focusout);
            }
        }

        // Remove window event listeners
        if (this._boundHandlers.windowBlur) {
            window.removeEventListener('blur', this._boundHandlers.windowBlur);
        }
        if (this._boundHandlers.windowFocus) {
            window.removeEventListener('focus', this._boundHandlers.windowFocus);
        }

        // Remove dot click listeners
        if (this._boundHandlers.dotClicks) {
            this._boundHandlers.dotClicks.forEach(({ dot, handler }) => {
                dot.removeEventListener('click', handler);
            });
        }

        // Clear references
        this._boundHandlers = {
            keydown: null, touchstart: null, touchmove: null, touchend: null,
            mousedown: null, mousemove: null, mouseup: null, mouseleave: null,
            mouseenter: null, containerMouseleave: null, focusin: null, focusout: null,
            windowBlur: null, windowFocus: null, dotClicks: []
        };

        logger.debug('BaseCarousel destroyed and event listeners cleaned up');
    }
}

export default BaseCarousel;
