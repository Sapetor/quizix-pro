/**
 * Mobile Carousel - Airbnb-style swipeable quick-start guide
 * Extends BaseCarousel with transform-based sliding
 */

import { BaseCarousel } from './base-carousel.js';
import { isMobile } from './dom.js';

class MobileCarousel extends BaseCarousel {
    constructor(containerSelector) {
        super({ autoPlayDelay: 6000 }); // 6 seconds for quickstart

        this.container = document.querySelector(containerSelector);
        if (!this.container) return;

        this.track = this.container.querySelector('.carousel-track');
        this.slides = Array.from(this.container.querySelectorAll('.carousel-slide'));
        this.dots = Array.from(this.container.querySelectorAll('.carousel-dot'));
        this.prevBtn = this.container.querySelector('#quickstart-carousel-prev');
        this.nextBtn = this.container.querySelector('#quickstart-carousel-next');

        this.init();
    }

    init() {
        if (!this.track || this.slides.length === 0) return;

        // Initialize base carousel functionality (includes arrow navigation)
        if (!this.initBase()) return;

        // Start auto-play
        this.startAutoPlay();

        // Initialize first slide
        this.updateSlideDisplay();
        this.updateActiveStates();
    }

    /**
     * Override: Use transform-based sliding
     */
    updateSlideDisplay() {
        if (!this.track) return;
        const translateX = -this.currentIndex * 100;
        this.track.style.transform = `translateX(${translateX}%)`;
    }
}

// Initialize carousel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (isMobile()) {
        window.mobileCarousel = new MobileCarousel('.carousel-container');
    }
});

// Re-initialize on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (isMobile() && !window.mobileCarousel) {
            window.mobileCarousel = new MobileCarousel('.carousel-container');
        } else if (!isMobile() && window.mobileCarousel) {
            window.mobileCarousel.destroy();
            window.mobileCarousel = null;
        }
    }, 250);
});

export { MobileCarousel };
