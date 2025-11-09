/**
 * Main Menu Carousel Adapter - Preview showcase carousel
 * Uses UnifiedCarousel with preview-specific configuration
 * Replaces main-menu-carousel.js (245 lines → 40 lines)
 */

import { UnifiedCarousel } from './unified-carousel.js';

export class MainMenuCarousel extends UnifiedCarousel {
    constructor() {
        const carousel = document.getElementById('preview-carousel');
        if (!carousel) return;

        super({
            containerSelector: '#preview-carousel',
            slideSelector: '.preview-phone-frame',
            dotSelector: '.preview-carousel-dot',
            prevButtonId: 'preview-carousel-prev',
            nextButtonId: 'preview-carousel-next',

            enableAutoPlay: true,
            enableTouch: true,
            enableKeyboard: false, // Not needed for preview
            enableDots: true,

            autoPlayDelay: 5000, // 5 seconds
            resumeDelay: 2000,
            animationMethod: 'classList', // Uses .active class toggle

            mobileOnly: false // Works on all screen sizes
        });
    }
}

// Initialize carousel when DOM is ready
let mainMenuCarousel = null;

function initMainMenuCarousel() {
    if (!mainMenuCarousel && document.getElementById('preview-carousel')) {
        mainMenuCarousel = new MainMenuCarousel();
    }
}

// Initialize with multiple fallbacks
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainMenuCarousel);
} else {
    initMainMenuCarousel();
}

// Additional fallback for slower devices
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

export { mainMenuCarousel };
