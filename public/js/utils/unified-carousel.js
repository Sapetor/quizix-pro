/**
 * Unified Carousel - Consolidated carousel system for all use cases
 * Replaces mobile-carousel.js, main-menu-carousel.js, and mobile-question-carousel.js
 * Supports touch gestures, auto-play, keyboard navigation, and custom behaviors
 */

import { logger } from '../core/config.js';
import { getTranslation } from './translation-manager.js';

export class UnifiedCarousel {
    constructor(config = {}) {
        // Core configuration with defaults
        this.config = {
            containerSelector: config.containerSelector || '.carousel-container',
            slideSelector: config.slideSelector || '.carousel-slide',
            dotSelector: config.dotSelector || '.carousel-dot',
            prevButtonId: config.prevButtonId || null,
            nextButtonId: config.nextButtonId || null,

            // Feature flags
            enableAutoPlay: config.enableAutoPlay ?? true,
            enableTouch: config.enableTouch ?? true,
            enableKeyboard: config.enableKeyboard ?? true,
            enableDots: config.enableDots ?? true,

            // Auto-play settings
            autoPlayDelay: config.autoPlayDelay || 5000,
            resumeDelay: config.resumeDelay || 2000,

            // Animation settings
            animationMethod: config.animationMethod || 'transform', // 'transform' or 'classList'
            transitionDuration: config.transitionDuration || 300,
            minSwipeDistance: config.minSwipeDistance || 50,

            // Mobile-only mode
            mobileOnly: config.mobileOnly ?? false,
            mobileBreakpoint: config.mobileBreakpoint || 768,

            // Callbacks
            onSlideChange: config.onSlideChange || null,
            onInit: config.onInit || null,
            onDestroy: config.onDestroy || null,

            ...config
        };

        // State
        this.currentIndex = 0;
        this.isTransitioning = false;
        this.isAutoPlaying = false;
        this.autoPlayInterval = null;
        this.isDragging = false;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchEndX = 0;

        // DOM references
        this.container = null;
        this.track = null;
        this.slides = [];
        this.dots = [];
        this.prevBtn = null;
        this.nextBtn = null;

        // Event handlers for cleanup
        this.eventHandlers = new Map();
        this.resizeHandler = null;

        this.init();
    }

    /**
     * Initialize carousel
     */
    init() {
        // Check mobile-only restriction
        if (this.config.mobileOnly && window.innerWidth > this.config.mobileBreakpoint) {
            return;
        }

        this.container = document.querySelector(this.config.containerSelector);
        if (!this.container) {
            logger.warn(`Carousel container not found: ${this.config.containerSelector}`);
            return;
        }

        this.setupElements();
        this.setupEventListeners();

        if (this.config.enableAutoPlay && this.slides.length > 1) {
            this.startAutoPlay();
        }

        // Initialize first slide
        this.updateSlide(0, false);

        // Setup responsive behavior for mobile-only mode
        if (this.config.mobileOnly) {
            this.setupResponsiveBehavior();
        }

        // Callback
        if (this.config.onInit) {
            this.config.onInit(this);
        }

        logger.debug(`UnifiedCarousel initialized: ${this.config.containerSelector}`);
    }

    /**
     * Setup DOM element references
     */
    setupElements() {
        // Get track (container for slides with transform)
        this.track = this.container.querySelector('.carousel-track') || this.container;

        // Get slides
        this.slides = Array.from(this.container.querySelectorAll(this.config.slideSelector));

        // Get dots
        if (this.config.enableDots) {
            this.dots = Array.from(this.container.querySelectorAll(this.config.dotSelector));
        }

        // Get navigation buttons
        if (this.config.prevButtonId) {
            this.prevBtn = document.getElementById(this.config.prevButtonId);
        }
        if (this.config.nextButtonId) {
            this.nextBtn = document.getElementById(this.config.nextButtonId);
        }

        logger.debug(`Found ${this.slides.length} slides`);
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Navigation buttons
        if (this.prevBtn) {
            this.addTrackedListener(this.prevBtn, 'click', () => {
                this.pauseAutoPlay();
                this.previousSlide();
                this.scheduleAutoPlayResume();
            });
        }

        if (this.nextBtn) {
            this.addTrackedListener(this.nextBtn, 'click', () => {
                this.pauseAutoPlay();
                this.nextSlide();
                this.scheduleAutoPlayResume();
            });
        }

        // Dot navigation
        if (this.config.enableDots) {
            this.dots.forEach((dot, index) => {
                this.addTrackedListener(dot, 'click', () => {
                    this.pauseAutoPlay();
                    this.goToSlide(index);
                    this.scheduleAutoPlayResume();
                });
            });
        }

        // Touch/swipe events
        if (this.config.enableTouch) {
            this.setupTouchEvents();
        }

        // Keyboard navigation
        if (this.config.enableKeyboard) {
            this.setupKeyboardEvents();
        }

        // Auto-play pause/resume on interaction
        if (this.config.enableAutoPlay) {
            this.setupAutoPlayPauseResume();
        }
    }

    /**
     * Setup touch/swipe event handlers
     */
    setupTouchEvents() {
        // Touch events
        this.addTrackedListener(this.track, 'touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.addTrackedListener(this.track, 'touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.addTrackedListener(this.track, 'touchend', (e) => this.handleTouchEnd(e), { passive: true });

        // Mouse events (for desktop testing)
        this.addTrackedListener(this.track, 'mousedown', (e) => this.handleMouseDown(e));
        this.addTrackedListener(this.track, 'mousemove', (e) => this.handleMouseMove(e));
        this.addTrackedListener(this.track, 'mouseup', (e) => this.handleMouseUp(e));
        this.addTrackedListener(this.track, 'mouseleave', (e) => this.handleMouseUp(e));
    }

    /**
     * Setup keyboard navigation
     */
    setupKeyboardEvents() {
        this.addTrackedListener(this.container, 'keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.previousSlide();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.nextSlide();
            }
        });

        this.container.setAttribute('tabindex', '0');
    }

    /**
     * Setup auto-play pause/resume logic
     */
    setupAutoPlayPauseResume() {
        this.addTrackedListener(this.container, 'mouseenter', () => this.pauseAutoPlay());
        this.addTrackedListener(this.container, 'mouseleave', () => this.resumeAutoPlay());
        this.addTrackedListener(this.container, 'focusin', () => this.pauseAutoPlay());
        this.addTrackedListener(this.container, 'focusout', () => this.resumeAutoPlay());

        // Window blur/focus
        this.addTrackedListener(window, 'blur', () => this.pauseAutoPlay());
        this.addTrackedListener(window, 'focus', () => this.resumeAutoPlay());
    }

    /**
     * Touch event handlers
     */
    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.track.style.cursor = 'grabbing';
        this.pauseAutoPlay();
    }

    handleTouchMove(e) {
        const diffX = Math.abs(e.touches[0].clientX - this.touchStartX);
        const diffY = Math.abs(e.touches[0].clientY - this.touchStartY);

        // Prevent scroll for horizontal swipes
        if (diffX > diffY && diffX > 10) {
            e.preventDefault();
        }
    }

    handleTouchEnd(e) {
        this.touchEndX = e.changedTouches[0].clientX;
        this.handleSwipe();
        this.track.style.cursor = 'grab';
        this.scheduleAutoPlayResume();
    }

    handleMouseDown(e) {
        this.touchStartX = e.clientX;
        this.track.style.cursor = 'grabbing';
        this.isDragging = true;
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
    }

    handleMouseUp(e) {
        if (!this.isDragging) return;
        this.touchEndX = e.clientX;
        this.handleSwipe();
        this.track.style.cursor = 'grab';
        this.isDragging = false;
    }

    handleSwipe() {
        const swipeDistance = this.touchStartX - this.touchEndX;

        if (Math.abs(swipeDistance) < this.config.minSwipeDistance) return;

        if (swipeDistance > 0) {
            this.nextSlide();
        } else {
            this.previousSlide();
        }
    }

    /**
     * Navigation methods
     */
    nextSlide() {
        const nextIndex = (this.currentIndex + 1) % this.slides.length;
        this.goToSlide(nextIndex);
    }

    previousSlide() {
        const prevIndex = (this.currentIndex - 1 + this.slides.length) % this.slides.length;
        this.goToSlide(prevIndex);
    }

    goToSlide(index) {
        if (this.isTransitioning || index === this.currentIndex || index < 0 || index >= this.slides.length) {
            return;
        }

        this.updateSlide(index);
    }

    /**
     * Update slide display
     */
    updateSlide(index, animate = true) {
        this.isTransitioning = true;
        this.currentIndex = index;

        // Apply slide transition based on animation method
        if (this.config.animationMethod === 'transform') {
            const translateX = -index * 100;
            this.track.style.transform = `translateX(${translateX}%)`;
        } else if (this.config.animationMethod === 'classList') {
            this.slides.forEach((slide, i) => {
                slide.classList.toggle('active', i === index);
            });
        }

        // Update active states
        this.updateActiveStates();

        // Reset transition flag
        setTimeout(() => {
            this.isTransitioning = false;
        }, animate ? this.config.transitionDuration : 0);

        // Callback
        if (this.config.onSlideChange) {
            this.config.onSlideChange(index, this.slides[index]);
        }
    }

    /**
     * Update active states for slides and dots
     */
    updateActiveStates() {
        // Update slides (for classList method or additional styling)
        this.slides.forEach((slide, index) => {
            slide.classList.toggle('active', index === this.currentIndex);
        });

        // Update dots
        if (this.config.enableDots) {
            this.dots.forEach((dot, index) => {
                dot.classList.toggle('active', index === this.currentIndex);
            });
        }
    }

    /**
     * Auto-play management
     */
    startAutoPlay() {
        if (this.slides.length <= 1) return;

        this.isAutoPlaying = true;
        this.autoPlayInterval = setInterval(() => {
            this.nextSlide();
        }, this.config.autoPlayDelay);

        logger.debug('Auto-play started');
    }

    pauseAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
        this.isAutoPlaying = false;
    }

    resumeAutoPlay() {
        if (!this.isAutoPlaying && this.slides.length > 1 && this.config.enableAutoPlay) {
            this.startAutoPlay();
        }
    }

    scheduleAutoPlayResume() {
        if (!this.config.enableAutoPlay) return;

        setTimeout(() => {
            this.resumeAutoPlay();
        }, this.config.resumeDelay);
    }

    /**
     * Responsive behavior for mobile-only mode
     */
    setupResponsiveBehavior() {
        this.resizeHandler = () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                const isMobile = window.innerWidth <= this.config.mobileBreakpoint;

                if (!isMobile && this.container) {
                    this.destroy();
                } else if (isMobile && !this.container) {
                    this.init();
                }
            }, 250);
        };

        window.addEventListener('resize', this.resizeHandler);
    }

    /**
     * Track event listener for cleanup
     */
    addTrackedListener(element, event, handler, options = {}) {
        if (!element) return;

        element.addEventListener(event, handler, options);

        if (!this.eventHandlers.has(element)) {
            this.eventHandlers.set(element, []);
        }
        this.eventHandlers.get(element).push({ event, handler, options });
    }

    /**
     * Cleanup and destroy carousel
     */
    destroy() {
        logger.debug(`UnifiedCarousel destroying: ${this.config.containerSelector}`);

        // Stop auto-play
        this.pauseAutoPlay();

        // Remove all tracked event listeners
        this.eventHandlers.forEach((handlers, element) => {
            handlers.forEach(({ event, handler }) => {
                try {
                    element.removeEventListener(event, handler);
                } catch (error) {
                    logger.warn('Error removing listener:', error);
                }
            });
        });
        this.eventHandlers.clear();

        // Remove resize handler
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }

        // Clear resize timeout
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }

        // Clear references
        this.container = null;
        this.track = null;
        this.slides = [];
        this.dots = [];
        this.prevBtn = null;
        this.nextBtn = null;

        // Callback
        if (this.config.onDestroy) {
            this.config.onDestroy();
        }

        logger.debug('UnifiedCarousel destroyed');
    }
}
