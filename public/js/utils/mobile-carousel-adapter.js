/**
 * Mobile Carousel Adapter - Airbnb-style quick-start guide
 * Uses UnifiedCarousel with mobile-specific configuration
 * Replaces mobile-carousel.js (260 lines → 30 lines)
 */

import { UnifiedCarousel } from './unified-carousel.js';

export class MobileCarousel extends UnifiedCarousel {
    constructor(containerSelector = '.carousel-container') {
        super({
            containerSelector,
            slideSelector: '.carousel-slide',
            dotSelector: '.carousel-dot',
            prevButtonId: 'quickstart-carousel-prev',
            nextButtonId: 'quickstart-carousel-next',

            enableAutoPlay: true,
            enableTouch: true,
            enableKeyboard: true,
            enableDots: true,

            autoPlayDelay: 6000, // 6 seconds
            animationMethod: 'transform',

            mobileOnly: true,
            mobileBreakpoint: 768
        });
    }
}

// Initialize carousel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (window.innerWidth <= 768) {
        window.mobileCarousel = new MobileCarousel('.carousel-container');
    }
});

// Re-initialize on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (window.innerWidth <= 768 && !window.mobileCarousel) {
            window.mobileCarousel = new MobileCarousel('.carousel-container');
        } else if (window.innerWidth > 768 && window.mobileCarousel) {
            window.mobileCarousel.destroy();
            window.mobileCarousel = null;
        }
    }, 250);
});
