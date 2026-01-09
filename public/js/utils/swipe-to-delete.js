/**
 * SwipeToDelete - Mobile touch gesture handler for list items
 * Enables swipe-left-to-reveal-delete functionality on touch devices
 */

import { logger } from '../core/config.js';

const DEFAULT_DELETE_THRESHOLD = 100;
const DEFAULT_REVEAL_THRESHOLD = 60;
const DEFAULT_MAX_SWIPE_DISTANCE = 120;
const MOBILE_BREAKPOINT = 768;
const SWIPE_DIRECTION_THRESHOLD = 10;
const TRANSITION_DURATION = 200;

export class SwipeToDelete {
    constructor(options = {}) {
        this.container = null;
        this.itemSelector = null;
        this.onDelete = options.onDelete || null;
        this.deleteThreshold = options.deleteThreshold || DEFAULT_DELETE_THRESHOLD;
        this.revealThreshold = options.revealThreshold || DEFAULT_REVEAL_THRESHOLD;
        this.maxSwipeDistance = options.maxSwipeDistance || DEFAULT_MAX_SWIPE_DISTANCE;
        this.enabled = options.enabled !== false;

        // Touch state
        this.activeItem = null;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.currentTranslateX = 0;
        this.isDragging = false;
        this.isHorizontalSwipe = null;

        // Bound event handlers for cleanup
        this._boundHandlers = {};
        this._outsideClickHandler = null;

        logger.debug('SwipeToDelete initialized');
    }

    /**
     * Initialize swipe handling on a container
     */
    init(containerSelector, itemSelector = '.result-item') {
        if (!this.enabled || !this.isTouchDevice()) {
            logger.debug('SwipeToDelete: Skipping initialization (disabled or non-touch device)');
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
        logger.debug('SwipeToDelete: Initialized on container');
    }

    /**
     * Check if device supports touch
     */
    isTouchDevice() {
        return 'ontouchstart' in window ||
               navigator.maxTouchPoints > 0 ||
               window.innerWidth <= MOBILE_BREAKPOINT;
    }

    /**
     * Setup touch event listeners on the container
     */
    setupEventListeners() {
        if (!this.container) return;

        this._boundHandlers = {
            touchstart: (e) => this.handleTouchStart(e),
            touchmove: (e) => this.handleTouchMove(e),
            touchend: (e) => this.handleTouchEnd(e),
            touchcancel: (e) => this.handleTouchEnd(e)
        };

        this.container.addEventListener('touchstart', this._boundHandlers.touchstart, { passive: true });
        this.container.addEventListener('touchmove', this._boundHandlers.touchmove, { passive: false });
        this.container.addEventListener('touchend', this._boundHandlers.touchend, { passive: true });
        this.container.addEventListener('touchcancel', this._boundHandlers.touchcancel, { passive: true });
    }

    handleTouchStart(e) {
        if (!e.touches?.length) return;

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
        this.currentTranslateX = this.getTranslateX(item);

        item.classList.add('swiping');
    }

    /**
     * Get current translateX value from element's transform
     */
    getTranslateX(element) {
        const transform = getComputedStyle(element).transform;
        if (transform && transform !== 'none') {
            return new DOMMatrix(transform).m41;
        }
        return 0;
    }

    handleTouchMove(e) {
        if (!this.isDragging || !this.activeItem || !e.touches?.length) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - this.touchStartX;
        const diffY = currentY - this.touchStartY;

        // Determine swipe direction on first significant move
        if (this.isHorizontalSwipe === null) {
            const threshold = SWIPE_DIRECTION_THRESHOLD;
            if (Math.abs(diffX) > threshold || Math.abs(diffY) > threshold) {
                this.isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
            }
        }

        if (!this.isHorizontalSwipe) return;

        // Prevent vertical scrolling during horizontal swipe
        e.preventDefault();

        // Calculate new position (only allow left swipe)
        const newTranslateX = Math.max(-this.maxSwipeDistance, Math.min(0, this.currentTranslateX + diffX));
        this.activeItem.style.transform = `translateX(${newTranslateX}px)`;

        // Update delete action opacity based on swipe progress
        const deleteAction = this.activeItem.querySelector('.swipe-delete-action');
        if (deleteAction) {
            const progress = Math.abs(newTranslateX) / this.maxSwipeDistance;
            deleteAction.style.opacity = String(Math.min(1, progress * 1.5));
        }
    }

    handleTouchEnd() {
        if (!this.isDragging || !this.activeItem) return;

        this.isDragging = false;
        this.activeItem.classList.remove('swiping');

        const swipeDistance = Math.abs(this.getTranslateX(this.activeItem));

        if (swipeDistance >= this.deleteThreshold) {
            this.triggerDelete(this.activeItem);
        } else if (swipeDistance >= this.revealThreshold) {
            this.revealDeleteAction(this.activeItem);
        } else {
            this.resetItem(this.activeItem);
        }

        this.isHorizontalSwipe = null;
    }

    /**
     * Reveal delete action by snapping to reveal position
     */
    revealDeleteAction(item) {
        item.classList.add('swipe-revealed');
        this.applyTransition(item, `translateX(-${this.maxSwipeDistance}px)`);

        setTimeout(() => {
            item.style.transition = '';
            this.setupOutsideClickHandler(item);
        }, TRANSITION_DURATION);
    }

    /**
     * Reset item to original position
     */
    resetItem(item) {
        if (!item) return;

        item.classList.remove('swipe-revealed', 'swiping');
        this.applyTransition(item, 'translateX(0)');

        const deleteAction = item.querySelector('.swipe-delete-action');
        if (deleteAction) {
            deleteAction.style.opacity = '0';
        }

        setTimeout(() => {
            item.style.transition = '';
        }, TRANSITION_DURATION);

        this.removeOutsideClickHandler();
    }

    /**
     * Apply transition with transform
     */
    applyTransition(element, transform) {
        element.style.transition = `transform ${TRANSITION_DURATION}ms ease-out`;
        element.style.transform = transform;
    }

    /**
     * Trigger delete animation and callback
     */
    triggerDelete(item) {
        const filename = item.dataset.filename;

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

        // Use capture phase and slight delay to avoid immediate trigger
        setTimeout(() => {
            document.addEventListener('touchstart', this._outsideClickHandler, { capture: true, passive: true });
            document.addEventListener('click', this._outsideClickHandler, { capture: true });
        }, 100);
    }

    removeOutsideClickHandler() {
        if (!this._outsideClickHandler) return;

        document.removeEventListener('touchstart', this._outsideClickHandler, { capture: true });
        document.removeEventListener('click', this._outsideClickHandler, { capture: true });
        this._outsideClickHandler = null;
    }

    resetAllItems() {
        const items = this.container?.querySelectorAll(this.itemSelector);
        items?.forEach(item => this.resetItem(item));
    }

    /**
     * Refresh handler for newly added items (called after list re-render)
     */
    refresh() {
        this.resetAllItems();
        this.activeItem = null;
    }

    destroy() {
        if (this.container) {
            const events = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
            events.forEach(event => {
                if (this._boundHandlers[event]) {
                    this.container.removeEventListener(event, this._boundHandlers[event]);
                }
            });
        }

        this.removeOutsideClickHandler();
        this._boundHandlers = {};
        this.container = null;
        this.activeItem = null;

        logger.debug('SwipeToDelete destroyed');
    }
}

export default SwipeToDelete;
