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
        this.autoPlayResumeTimer = null; // Track resume timer to prevent race conditions
        this.isAutoPlaying = false;
        this.autoPlayDelay = options.autoPlayDelay || 5000;
        this.minSwipeDistance = options.minSwipeDistance || 50;

        // Arrow button references (set by subclass)
        this.prevBtn = null;
        this.nextBtn = null;

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
            dotClicks: [],
            prevClick: null,
            nextClick: null
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
        this.setupArrowNavigation();

        return true;
    }

    /**
     * Setup arrow button navigation (prev/next buttons)
     * Subclasses should set this.prevBtn and this.nextBtn before calling initBase()
     */
    setupArrowNavigation() {
        if (this.prevBtn) {
            this._boundHandlers.prevClick = () => {
                this.pauseAutoPlay();
                this.previousSlide();
                this.scheduleAutoPlayResume();
            };
            this.prevBtn.addEventListener('click', this._boundHandlers.prevClick);
        }

        if (this.nextBtn) {
            this._boundHandlers.nextClick = () => {
                this.pauseAutoPlay();
                this.nextSlide();
                this.scheduleAutoPlayResume();
            };
            this.nextBtn.addEventListener('click', this._boundHandlers.nextClick);
        }
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
        // Safety check for touch array bounds
        if (!e.touches || e.touches.length === 0) return;
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.isDragging = true;
        this.pauseAutoPlay();
    }

    handleTouchMove(e) {
        if (!this.isDragging) return;
        // Safety check for touch array bounds
        if (!e.touches || e.touches.length === 0) return;

        const diffX = Math.abs(e.touches[0].clientX - this.touchStartX);
        const diffY = Math.abs(e.touches[0].clientY - this.touchStartY);

        // Prevent scroll if horizontal swipe
        if (diffX > diffY && diffX > 10) {
            e.preventDefault();
        }
    }

    handleTouchEnd(e) {
        if (!this.isDragging) return;
        // Safety check for changedTouches array bounds
        if (!e.changedTouches || e.changedTouches.length === 0) return;

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
        // Clear any existing resume timer to prevent race conditions
        if (this.autoPlayResumeTimer) {
            clearTimeout(this.autoPlayResumeTimer);
        }
        this.autoPlayResumeTimer = setTimeout(() => {
            this.autoPlayResumeTimer = null;
            this.resumeAutoPlay();
        }, delay);
    }

    destroy() {
        this.pauseAutoPlay();

        // Clear resume timer to prevent callbacks after destroy
        if (this.autoPlayResumeTimer) {
            clearTimeout(this.autoPlayResumeTimer);
            this.autoPlayResumeTimer = null;
        }

        // Container event types to remove
        const containerEvents = [
            'keydown', 'touchstart', 'touchmove', 'touchend',
            'mousedown', 'mousemove', 'mouseup', 'mouseleave',
            'mouseenter', 'focusin', 'focusout'
        ];

        // Remove container event listeners
        if (this.container) {
            containerEvents.forEach(event => {
                if (this._boundHandlers[event]) {
                    this.container.removeEventListener(event, this._boundHandlers[event]);
                }
            });
            // Handle containerMouseleave separately (also bound to 'mouseleave')
            if (this._boundHandlers.containerMouseleave) {
                this.container.removeEventListener('mouseleave', this._boundHandlers.containerMouseleave);
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

        // Remove arrow button click listeners
        if (this.prevBtn && this._boundHandlers.prevClick) {
            this.prevBtn.removeEventListener('click', this._boundHandlers.prevClick);
        }
        if (this.nextBtn && this._boundHandlers.nextClick) {
            this.nextBtn.removeEventListener('click', this._boundHandlers.nextClick);
        }

        // Clear references
        this._boundHandlers = {
            keydown: null, touchstart: null, touchmove: null, touchend: null,
            mousedown: null, mousemove: null, mouseup: null, mouseleave: null,
            mouseenter: null, containerMouseleave: null, focusin: null, focusout: null,
            windowBlur: null, windowFocus: null, dotClicks: [],
            prevClick: null, nextClick: null
        };

        logger.debug('BaseCarousel destroyed and event listeners cleaned up');
    }
}

export default BaseCarousel;
