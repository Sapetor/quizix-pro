/**
 * Mobile Carousel - Airbnb-style swipeable quick-start guide
 * Handles touch gestures, dot navigation, and smooth transitions
 */

class MobileCarousel {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        if (!this.container) return;
        
        this.track = this.container.querySelector('.carousel-track');
        this.slides = this.container.querySelectorAll('.carousel-slide');
        this.dots = this.container.querySelectorAll('.carousel-dot');
        
        this.currentIndex = 0;
        this.isTransitioning = false;
        this.touchStartX = 0;
        this.touchEndX = 0;
        this.minSwipeDistance = 50;
        
        this.init();
    }
    
    init() {
        if (!this.track || this.slides.length === 0) return;
        
        // Set up dot navigation
        this.setupDotNavigation();
        
        // Set up touch events for mobile swiping
        this.setupTouchEvents();
        
        // Set up keyboard navigation
        this.setupKeyboardEvents();
        
        // Auto-play (optional - can be enabled if desired)
        // this.setupAutoPlay();
        
        // Initialize first slide
        this.updateSlide(0, false);
    }
    
    setupDotNavigation() {
        this.dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                this.goToSlide(index);
            });
        });
    }
    
    setupTouchEvents() {
        // Use passive event listeners for better performance
        this.track.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.track.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.track.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
        
        // Mouse events for desktop testing
        this.track.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.track.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.track.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.track.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
    }
    
    setupKeyboardEvents() {
        // Add keyboard navigation for accessibility
        this.container.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.previousSlide();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.nextSlide();
            }
        });
        
        // Make container focusable for keyboard navigation
        this.container.setAttribute('tabindex', '0');
    }
    
    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.track.style.cursor = 'grabbing';
    }
    
    handleTouchMove(e) {
        // Prevent scroll while swiping horizontally
        if (Math.abs(e.touches[0].clientX - this.touchStartX) > 10) {
            e.preventDefault();
        }
    }
    
    handleTouchEnd(e) {
        this.touchEndX = e.changedTouches[0].clientX;
        this.handleSwipe();
        this.track.style.cursor = 'grab';
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
        
        if (Math.abs(swipeDistance) < this.minSwipeDistance) return;
        
        if (swipeDistance > 0) {
            // Swiped left - next slide
            this.nextSlide();
        } else {
            // Swiped right - previous slide
            this.previousSlide();
        }
    }
    
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
        
        this.updateSlide(index);
    }
    
    updateSlide(index, animate = true) {
        this.isTransitioning = true;
        this.currentIndex = index;
        
        // Update transform with smooth transition
        const translateX = -index * 100;
        this.track.style.transform = `translateX(${translateX}%)`;
        
        // Update active states
        this.updateActiveStates();
        
        // Reset transition flag after animation
        setTimeout(() => {
            this.isTransitioning = false;
        }, animate ? 300 : 0);
    }
    
    updateActiveStates() {
        // Update slide active states
        this.slides.forEach((slide, index) => {
            slide.classList.toggle('active', index === this.currentIndex);
        });
        
        // Update dot active states
        this.dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentIndex);
        });
    }
    
    setupAutoPlay(interval = 5000) {
        this.autoPlayInterval = setInterval(() => {
            this.nextSlide();
        }, interval);
        
        // Pause auto-play on user interaction
        this.container.addEventListener('touchstart', () => this.pauseAutoPlay());
        this.container.addEventListener('mouseenter', () => this.pauseAutoPlay());
        this.container.addEventListener('mouseleave', () => this.resumeAutoPlay());
    }
    
    pauseAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }
    
    resumeAutoPlay() {
        if (!this.autoPlayInterval) {
            this.setupAutoPlay();
        }
    }
    
    destroy() {
        this.pauseAutoPlay();
        // Remove event listeners if needed
    }
}

// Initialize carousel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize on mobile devices
    if (window.innerWidth <= 768) {
        window.mobileCarousel = new MobileCarousel('.carousel-container');
    }
});

// Re-initialize on window resize if switching between mobile and desktop
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

export { MobileCarousel };