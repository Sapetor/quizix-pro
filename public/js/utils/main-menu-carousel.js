/**
 * Main Menu Carousel - Interactive image carousel for mobile preview showcase
 * Extends BaseCarousel with show/hide active class approach
 */

import { BaseCarousel } from './base-carousel.js';

class MainMenuCarousel extends BaseCarousel {
    constructor() {
        super({ autoPlayDelay: 5000 }); // 5 seconds for preview

        this.init();
    }

    init() {
        const carousel = document.getElementById('preview-carousel');
        if (!carousel) return;

        this.container = carousel;
        this.slides = Array.from(document.querySelectorAll('.preview-phone-frame'));
        this.dots = Array.from(document.querySelectorAll('.preview-carousel-dot'));
        this.prevBtn = document.getElementById('preview-carousel-prev');
        this.nextBtn = document.getElementById('preview-carousel-next');

        if (this.slides.length === 0) return;

        // Initialize base carousel functionality
        if (!this.initBase()) return;

        // Setup arrow navigation
        this.setupArrowNavigation();

        // Start auto-play
        this.startAutoPlay();

        // Initialize first slide
        this.updateActiveStates();
    }

    setupArrowNavigation() {
        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', () => {
                this.pauseAutoPlay();
                this.previousSlide();
                this.scheduleAutoPlayResume();
            });
        }

        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', () => {
                this.pauseAutoPlay();
                this.nextSlide();
                this.scheduleAutoPlayResume();
            });
        }
    }
}

// Initialize carousel when DOM is ready
let mainMenuCarousel = null;

function initMainMenuCarousel() {
    if (!mainMenuCarousel) {
        mainMenuCarousel = new MainMenuCarousel();
    }
}

// Initialize with fallbacks
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainMenuCarousel);
} else {
    initMainMenuCarousel();
}

// Fallback for slower devices
setTimeout(() => {
    if (!mainMenuCarousel) {
        initMainMenuCarousel();
    }
}, 500);

// Reinitialize on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (mainMenuCarousel) {
            mainMenuCarousel.destroy();
            mainMenuCarousel = null;
            initMainMenuCarousel();
        }
    }, 250);
});

export { MainMenuCarousel };
