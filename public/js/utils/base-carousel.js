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
        this.dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                this.pauseAutoPlay();
                this.goToSlide(index);
                this.scheduleAutoPlayResume();
            });
        });
    }

    /**
     * Setup keyboard navigation (arrow keys)
     */
    setupKeyboardEvents() {
        if (!this.container) return;

        this.container.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.previousSlide();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.nextSlide();
            }
        });

        // Make container focusable
        this.container.setAttribute('tabindex', '0');
    }

    /**
     * Setup touch and mouse events for swiping
     */
    setupTouchEvents() {
        if (!this.container) return;

        // Touch events
        this.container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.container.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });

        // Mouse events for desktop
        this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.container.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.container.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
    }

    /**
     * Setup auto-play pause/resume listeners
     */
    setupAutoPlayListeners() {
        if (!this.container) return;

        this.container.addEventListener('mouseenter', () => this.pauseAutoPlay());
        this.container.addEventListener('mouseleave', () => this.resumeAutoPlay());
        this.container.addEventListener('focusin', () => this.pauseAutoPlay());
        this.container.addEventListener('focusout', () => this.resumeAutoPlay());

        window.addEventListener('blur', () => this.pauseAutoPlay());
        window.addEventListener('focus', () => this.resumeAutoPlay());
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
    }
}

export default BaseCarousel;
