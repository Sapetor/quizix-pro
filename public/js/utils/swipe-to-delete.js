/**
 * Swipe-to-Delete - Mobile touch gesture handler for list items
 * Provides swipe-left-to-reveal-delete functionality for mobile devices
 */

import { logger } from '../core/config.js';

export class SwipeToDelete {
    constructor(options = {}) {
        this.container = null;
        this.items = [];
        this.onDelete = options.onDelete || null;
        this.deleteThreshold = options.deleteThreshold || 100; // px to trigger delete
        this.revealThreshold = options.revealThreshold || 60; // px to reveal delete button
        this.maxSwipeDistance = options.maxSwipeDistance || 120; // max swipe distance
        this.enabled = options.enabled !== false; // enabled by default

        // Touch state
        this.activeItem = null;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.currentTranslateX = 0;
        this.isDragging = false;
        this.isHorizontalSwipe = null; // null until determined

        // Bound event handlers for cleanup
        this._boundHandlers = {
            touchstart: null,
            touchmove: null,
            touchend: null,
            touchcancel: null
        };

        logger.debug('SwipeToDelete initialized');
    }

    /**
     * Initialize swipe handling on a container
     * @param {string|HTMLElement} containerSelector - Container selector or element
     * @param {string} itemSelector - Selector for swipeable items within container
     */
    init(containerSelector, itemSelector = '.result-item') {
        if (!this.enabled) return;

        // Only enable on mobile/touch devices
        if (!this.isTouchDevice()) {
            logger.debug('SwipeToDelete: Not a touch device, skipping initialization');
            return;
        }

        this.container = typeof containerSelector === 'string'
            ? document.querySelector(containerSelector)
            : containerSelector;

        if (!this.container) {
            logger.debug('SwipeToDelete: Container not found');
            return;
        }

        this.itemSelector = itemSelector;
        this.setupEventListeners();

        logger.debug('SwipeToDelete: Initialized on container', this.container);
    }

    /**
     * Check if device supports touch
     */
    isTouchDevice() {
        return ('ontouchstart' in window) ||
               (navigator.maxTouchPoints > 0) ||
               (window.innerWidth <= 768);
    }

    /**
     * Setup touch event listeners on the container
     */
    setupEventListeners() {
        if (!this.container) return;

        this._boundHandlers.touchstart = (e) => this.handleTouchStart(e);
        this._boundHandlers.touchmove = (e) => this.handleTouchMove(e);
        this._boundHandlers.touchend = (e) => this.handleTouchEnd(e);
        this._boundHandlers.touchcancel = (e) => this.handleTouchEnd(e);

        this.container.addEventListener('touchstart', this._boundHandlers.touchstart, { passive: true });
        this.container.addEventListener('touchmove', this._boundHandlers.touchmove, { passive: false });
        this.container.addEventListener('touchend', this._boundHandlers.touchend, { passive: true });
        this.container.addEventListener('touchcancel', this._boundHandlers.touchcancel, { passive: true });
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        if (!e.touches || e.touches.length === 0) return;

        // Find the swipeable item
        const item = e.target.closest(this.itemSelector);
        if (!item) return;

        // Don't interfere with action buttons
        if (e.target.closest('.result-actions') || e.target.closest('.swipe-delete-action')) {
            return;
        }

        // Reset any previously open item
        if (this.activeItem && this.activeItem !== item) {
            this.resetItem(this.activeItem);
        }

        this.activeItem = item;
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.isDragging = true;
        this.isHorizontalSwipe = null;

        // Get current translate if item is already swiped
        const transform = getComputedStyle(item).transform;
        if (transform && transform !== 'none') {
            const matrix = new DOMMatrix(transform);
            this.currentTranslateX = matrix.m41;
        } else {
            this.currentTranslateX = 0;
        }

        // Add swiping class for visual feedback
        item.classList.add('swiping');
    }

    /**
     * Handle touch move
     */
    handleTouchMove(e) {
        if (!this.isDragging || !this.activeItem) return;
        if (!e.touches || e.touches.length === 0) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - this.touchStartX;
        const diffY = currentY - this.touchStartY;

        // Determine swipe direction on first move
        if (this.isHorizontalSwipe === null) {
            if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
                this.isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
            }
        }

        // Only handle horizontal swipes
        if (!this.isHorizontalSwipe) {
            return;
        }

        // Prevent vertical scrolling during horizontal swipe
        e.preventDefault();

        // Calculate new position (only allow left swipe, negative values)
        let newTranslateX = this.currentTranslateX + diffX;

        // Limit swipe distance
        newTranslateX = Math.max(-this.maxSwipeDistance, Math.min(0, newTranslateX));

        // Apply transform
        this.activeItem.style.transform = `translateX(${newTranslateX}px)`;

        // Show/hide delete action based on swipe distance
        const deleteAction = this.activeItem.querySelector('.swipe-delete-action');
        if (deleteAction) {
            const progress = Math.abs(newTranslateX) / this.maxSwipeDistance;
            deleteAction.style.opacity = Math.min(1, progress * 1.5);
        }
    }

    /**
     * Handle touch end
     */
    handleTouchEnd(e) {
        if (!this.isDragging || !this.activeItem) return;

        this.isDragging = false;
        this.activeItem.classList.remove('swiping');

        // Get final position
        const transform = getComputedStyle(this.activeItem).transform;
        let finalX = 0;
        if (transform && transform !== 'none') {
            const matrix = new DOMMatrix(transform);
            finalX = matrix.m41;
        }

        const swipeDistance = Math.abs(finalX);

        if (swipeDistance >= this.deleteThreshold) {
            // Trigger delete
            this.triggerDelete(this.activeItem);
        } else if (swipeDistance >= this.revealThreshold) {
            // Snap to reveal position
            this.revealDeleteAction(this.activeItem);
        } else {
            // Snap back to original position
            this.resetItem(this.activeItem);
        }

        this.isHorizontalSwipe = null;
    }

    /**
     * Reveal delete action for an item
     */
    revealDeleteAction(item) {
        item.classList.add('swipe-revealed');
        item.style.transition = 'transform 0.2s ease-out';
        item.style.transform = `translateX(-${this.maxSwipeDistance}px)`;

        // Setup tap-outside-to-close
        setTimeout(() => {
            item.style.transition = '';
            this.setupOutsideClickHandler(item);
        }, 200);
    }

    /**
     * Reset item to original position
     */
    resetItem(item) {
        if (!item) return;

        item.classList.remove('swipe-revealed', 'swiping');
        item.style.transition = 'transform 0.2s ease-out';
        item.style.transform = 'translateX(0)';

        const deleteAction = item.querySelector('.swipe-delete-action');
        if (deleteAction) {
            deleteAction.style.opacity = '0';
        }

        setTimeout(() => {
            item.style.transition = '';
        }, 200);

        // Remove outside click handler
        this.removeOutsideClickHandler();
    }

    /**
     * Trigger delete action
     */
    triggerDelete(item) {
        const filename = item.dataset.filename;

        // Animate out
        item.classList.add('swipe-deleting');
        item.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
        item.style.transform = 'translateX(-100%)';
        item.style.opacity = '0';

        setTimeout(() => {
            if (this.onDelete && filename) {
                this.onDelete(filename);
            }
        }, 300);
    }

    /**
     * Setup handler to close revealed item when clicking outside
     */
    setupOutsideClickHandler(item) {
        this._outsideClickHandler = (e) => {
            if (!item.contains(e.target)) {
                this.resetItem(item);
            }
        };

        // Use capture phase to catch clicks before they bubble
        setTimeout(() => {
            document.addEventListener('touchstart', this._outsideClickHandler, { capture: true, passive: true });
            document.addEventListener('click', this._outsideClickHandler, { capture: true });
        }, 100);
    }

    /**
     * Remove outside click handler
     */
    removeOutsideClickHandler() {
        if (this._outsideClickHandler) {
            document.removeEventListener('touchstart', this._outsideClickHandler, { capture: true });
            document.removeEventListener('click', this._outsideClickHandler, { capture: true });
            this._outsideClickHandler = null;
        }
    }

    /**
     * Reset all items
     */
    resetAllItems() {
        const items = this.container?.querySelectorAll(this.itemSelector);
        if (items) {
            items.forEach(item => this.resetItem(item));
        }
    }

    /**
     * Refresh to handle newly added items
     * Called after results list is re-rendered
     */
    refresh() {
        // Reset any open items
        this.resetAllItems();
        this.activeItem = null;
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        if (this.container) {
            if (this._boundHandlers.touchstart) {
                this.container.removeEventListener('touchstart', this._boundHandlers.touchstart);
            }
            if (this._boundHandlers.touchmove) {
                this.container.removeEventListener('touchmove', this._boundHandlers.touchmove);
            }
            if (this._boundHandlers.touchend) {
                this.container.removeEventListener('touchend', this._boundHandlers.touchend);
            }
            if (this._boundHandlers.touchcancel) {
                this.container.removeEventListener('touchcancel', this._boundHandlers.touchcancel);
            }
        }

        this.removeOutsideClickHandler();

        this._boundHandlers = {
            touchstart: null,
            touchmove: null,
            touchend: null,
            touchcancel: null
        };

        this.container = null;
        this.activeItem = null;

        logger.debug('SwipeToDelete destroyed');
    }
}

export default SwipeToDelete;
