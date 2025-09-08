/**
 * Main Menu Carousel - Interactive image carousel for mobile preview showcase
 * Handles navigation, auto-play, and touch gestures for the preview section
 */

class MainMenuCarousel {
    constructor() {
        this.currentIndex = 0;
        this.slides = [];
        this.dots = [];
        this.autoPlayInterval = null;
        this.isAutoPlaying = false;
        this.autoPlayDelay = 4000; // 4 seconds
        
        this.init();
    }
    
    init() {
        // Initialize if the carousel exists (removed mobile-only restriction)
        const carousel = document.getElementById('preview-carousel');
        if (!carousel) {
            console.log('MainMenuCarousel: preview-carousel element not found');
            return;
        }
        
        console.log('MainMenuCarousel: Initializing carousel', {
            screenWidth: window.innerWidth,
            userAgent: navigator.userAgent
        });
        
        this.setupElements();
        this.setupEventListeners();
        this.startAutoPlay();
    }
    
    setupElements() {
        this.slides = document.querySelectorAll('.preview-phone-frame');
        this.dots = document.querySelectorAll('.preview-carousel-dot');
        this.prevBtn = document.getElementById('preview-carousel-prev');
        this.nextBtn = document.getElementById('preview-carousel-next');
        
        // Ensure first slide is active
        this.showSlide(0);
    }
    
    setupEventListeners() {
        // Navigation buttons
        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', () => this.prevSlide());
        }
        
        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', () => this.nextSlide());
        }
        
        // Dots navigation
        this.dots.forEach((dot, index) => {
            dot.addEventListener('click', () => this.goToSlide(index));
        });
        
        // Touch/swipe support
        this.setupTouchEvents();
        
        // Pause autoplay on hover/focus
        const carousel = document.getElementById('preview-carousel');
        if (carousel) {
            carousel.addEventListener('mouseenter', () => this.pauseAutoPlay());
            carousel.addEventListener('mouseleave', () => this.resumeAutoPlay());
            carousel.addEventListener('focusin', () => this.pauseAutoPlay());
            carousel.addEventListener('focusout', () => this.resumeAutoPlay());
        }
        
        // Pause on window blur/focus
        window.addEventListener('blur', () => this.pauseAutoPlay());
        window.addEventListener('focus', () => this.resumeAutoPlay());
    }
    
    setupTouchEvents() {
        const carousel = document.getElementById('preview-carousel');
        if (!carousel) return;
        
        let startX = 0;
        let startY = 0;
        let isDragging = false;
        
        carousel.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = true;
            this.pauseAutoPlay();
        }, { passive: true });
        
        carousel.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = startX - currentX;
            const diffY = startY - currentY;
            
            // Only handle horizontal swipes (ignore vertical scrolling)
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
                e.preventDefault(); // Prevent scrolling
            }
        }, { passive: false });
        
        carousel.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            
            const endX = e.changedTouches[0].clientX;
            const diffX = startX - endX;
            
            // Minimum swipe distance
            if (Math.abs(diffX) > 50) {
                if (diffX > 0) {
                    this.nextSlide(); // Swipe left = next
                } else {
                    this.prevSlide(); // Swipe right = previous
                }
            }
            
            isDragging = false;
            this.resumeAutoPlay();
        }, { passive: true });
    }
    
    showSlide(index) {
        // Remove active class from all slides and dots
        this.slides.forEach(slide => slide.classList.remove('active'));
        this.dots.forEach(dot => dot.classList.remove('active'));
        
        // Add active class to current slide and dot
        if (this.slides[index]) {
            this.slides[index].classList.add('active');
        }
        
        if (this.dots[index]) {
            this.dots[index].classList.add('active');
        }
        
        this.currentIndex = index;
    }
    
    nextSlide() {
        const nextIndex = (this.currentIndex + 1) % this.slides.length;
        this.showSlide(nextIndex);
    }
    
    prevSlide() {
        const prevIndex = (this.currentIndex - 1 + this.slides.length) % this.slides.length;
        this.showSlide(prevIndex);
    }
    
    goToSlide(index) {
        if (index >= 0 && index < this.slides.length) {
            this.showSlide(index);
        }
    }
    
    startAutoPlay() {
        if (this.slides.length <= 1) return; // Don't autoplay if only one slide
        
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
    
    // Clean up on destroy
    destroy() {
        this.pauseAutoPlay();
        // Remove event listeners would go here if needed
    }
}

// Initialize carousel when DOM is ready
let mainMenuCarousel = null;

function initMainMenuCarousel() {
    // Initialize carousel regardless of screen size (the CSS handles mobile-only display)
    if (!mainMenuCarousel) {
        mainMenuCarousel = new MainMenuCarousel();
    }
}

// Initialize on DOM ready with multiple fallbacks
function ensureInitialization() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMainMenuCarousel);
    } else {
        // DOM is already ready, init immediately
        initMainMenuCarousel();
    }
    
    // Additional fallback with delay for slower mobile devices
    setTimeout(() => {
        if (!mainMenuCarousel) {
            initMainMenuCarousel();
        }
    }, 500);
}

// Start initialization
ensureInitialization();

// Reinitialize on window resize (less aggressive)
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

// Export for potential external use
export { MainMenuCarousel };