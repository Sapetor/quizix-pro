/**
 * Ordering Drag-and-Drop Utility
 * Handles reordering for ordering questions.
 *
 * Two input paths, deliberately not the same on every device:
 *   - mouse drag (HTML5 drag events) everywhere,
 *   - per-item up/down buttons everywhere.
 * Touch drag is attached only when the primary pointer is NOT a phone's:
 * it has to preventDefault() every touchmove to drag, which makes a list
 * taller than the viewport unscrollable. Phones reorder with the buttons.
 */

import { logger } from '../core/config.js';
import { isPhone } from './dom.js';

export class OrderingDragDrop {
    static SWAP_ANIMATION_MS = 300;

    constructor(containerSelector, options = {}) {
        this.container = typeof containerSelector === 'string'
            ? document.querySelector(containerSelector)
            : containerSelector;

        if (!this.container) {
            logger.error('OrderingDragDrop: Container not found');
            return;
        }

        this.options = {
            itemSelector: '.ordering-display-item',
            handleSelector: null, // If null, entire item is draggable
            onOrderChange: null, // Callback when order changes
            enabled: true,
            ...options
        };

        this.draggedElement = null;
        this.draggedIndex = null;
        this.touchStartY = 0;
        this.items = [];

        this.init();
    }

    init() {
        if (!this.options.enabled) return;

        this.setupDragAndDrop();
        this.container.addEventListener('click', this.handleMoveClick.bind(this));
        this.updateMoveButtons();
        logger.debug('OrderingDragDrop initialized');
    }

    getItems() {
        return Array.from(this.container.querySelectorAll(this.options.itemSelector));
    }

    setupDragAndDrop() {
        const items = this.container.querySelectorAll(this.options.itemSelector);
        const touchDragEnabled = !isPhone();

        items.forEach((item, index) => {
            // Set draggable attribute
            item.setAttribute('draggable', 'true');
            item.dataset.orderIndex = index;

            // Desktop drag events
            item.addEventListener('dragstart', this.handleDragStart.bind(this));
            item.addEventListener('dragend', this.handleDragEnd.bind(this));
            item.addEventListener('dragover', this.handleDragOver.bind(this));
            item.addEventListener('drop', this.handleDrop.bind(this));
            item.addEventListener('dragenter', this.handleDragEnter.bind(this));
            item.addEventListener('dragleave', this.handleDragLeave.bind(this));

            // Touch drag: everything except phones (see the file header)
            if (touchDragEnabled) {
                item.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
                item.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
                item.addEventListener('touchend', this.handleTouchEnd.bind(this));
            }
        });
    }

    /**
     * Up/down buttons — the reorder path that always works, on any pointer.
     */
    handleMoveClick(e) {
        const button = e.target.closest('.ordering-move-btn');
        if (!button) return;

        const item = button.closest(this.options.itemSelector);
        if (!item) return;

        const items = this.getItems();
        const from = items.indexOf(item);
        const to = button.dataset.move === 'up' ? from - 1 : from + 1;

        if (from < 0 || to < 0 || to >= items.length) return;

        this.swapItems(from, to);

        // Keep the keyboard on the item the user just moved; the pressed
        // button is disabled when the item lands on a boundary.
        const focusTarget = button.disabled
            ? item.querySelector('.ordering-move-btn:not([disabled])')
            : button;
        focusTarget?.focus();
    }

    // Desktop drag handlers
    handleDragStart(e) {
        this.draggedElement = e.currentTarget;
        this.draggedIndex = parseInt(this.draggedElement.dataset.orderIndex);

        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);

        logger.debug('Drag started:', this.draggedIndex);
    }

    handleDragEnd(e) {
        e.currentTarget.classList.remove('dragging');

        // Remove drag-over class from all items
        const items = this.container.querySelectorAll(this.options.itemSelector);
        items.forEach(item => item.classList.remove('drag-over'));

        this.draggedElement = null;
        this.draggedIndex = null;

        logger.debug('Drag ended');
    }

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleDragEnter(e) {
        if (e.currentTarget !== this.draggedElement) {
            e.currentTarget.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        e.preventDefault();

        const dropTarget = e.currentTarget;
        dropTarget.classList.remove('drag-over');

        if (this.draggedElement !== dropTarget) {
            const dropIndex = parseInt(dropTarget.dataset.orderIndex);
            this.swapItems(this.draggedIndex, dropIndex);
        }

        return false;
    }

    // Mobile touch handlers
    handleTouchStart(e) {
        const touch = e.touches[0];
        this.touchStartY = touch.clientY;

        this.draggedElement = e.currentTarget;
        this.draggedIndex = parseInt(this.draggedElement.dataset.orderIndex);

        e.currentTarget.classList.add('dragging');

        logger.debug('Touch drag started:', this.draggedIndex);
    }

    handleTouchMove(e) {
        if (!this.draggedElement) return;

        e.preventDefault(); // Prevent scrolling while dragging

        const touch = e.touches[0];
        const currentY = touch.clientY;

        // Get the element at touch position
        const elementBelow = document.elementFromPoint(touch.clientX, currentY);

        // Find the ordering item
        const dropTarget = elementBelow?.closest(this.options.itemSelector);

        // Remove drag-over from all items
        const items = this.container.querySelectorAll(this.options.itemSelector);
        items.forEach(item => {
            if (item !== this.draggedElement) {
                item.classList.remove('drag-over');
            }
        });

        // Add drag-over to current target
        if (dropTarget && dropTarget !== this.draggedElement) {
            dropTarget.classList.add('drag-over');
        }
    }

    handleTouchEnd(e) {
        if (!this.draggedElement) return;

        const touch = e.changedTouches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const dropTarget = elementBelow?.closest(this.options.itemSelector);

        // Remove dragging class
        this.draggedElement.classList.remove('dragging');

        // Remove drag-over from all items
        const items = this.container.querySelectorAll(this.options.itemSelector);
        items.forEach(item => item.classList.remove('drag-over'));

        // Perform swap if dropped on another item
        if (dropTarget && dropTarget !== this.draggedElement) {
            const dropIndex = parseInt(dropTarget.dataset.orderIndex);
            this.swapItems(this.draggedIndex, dropIndex);
        }

        this.draggedElement = null;
        this.draggedIndex = null;

        logger.debug('Touch drag ended');
    }

    swapItems(fromIndex, toIndex) {
        logger.debug(`Swapping items: ${fromIndex} <-> ${toIndex}`);

        const items = this.getItems();

        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
            fromIndex >= items.length || toIndex >= items.length) {
            return;
        }

        const fromItem = items[fromIndex];
        const toItem = items[toIndex];

        // Add swap animation classes
        const movingDown = fromIndex < toIndex;
        fromItem.classList.add(movingDown ? 'swap-down' : 'swap-up');
        toItem.classList.add(movingDown ? 'swap-up' : 'swap-down');

        // Swap in DOM
        if (fromIndex < toIndex) {
            toItem.parentNode.insertBefore(fromItem, toItem.nextSibling);
        } else {
            toItem.parentNode.insertBefore(fromItem, toItem);
        }

        // Re-read the DOM: `items` is the pre-move order and renumbering from
        // it desynchronises the badges and data-order-index from the list.
        this.updateIndices();
        this.updatePositionNumbers();
        this.updateMoveButtons();

        // Remove animation classes after animation completes
        setTimeout(() => {
            fromItem.classList.remove('swap-up', 'swap-down');
            toItem.classList.remove('swap-up', 'swap-down');
        }, OrderingDragDrop.SWAP_ANIMATION_MS);

        // Call callback if provided
        if (typeof this.options.onOrderChange === 'function') {
            const currentOrder = this.getCurrentOrder();
            this.options.onOrderChange(currentOrder);
        }
    }

    updateIndices() {
        this.getItems().forEach((item, index) => {
            item.dataset.orderIndex = index;
        });
    }

    updatePositionNumbers() {
        this.getItems().forEach((item, index) => {
            const numberEl = item.querySelector('.ordering-item-number');
            if (numberEl) {
                numberEl.textContent = index + 1;
            }
        });
    }

    /**
     * Grey out the moves that would fall off the ends of the list.
     */
    updateMoveButtons() {
        const items = this.getItems();
        items.forEach((item, index) => {
            const up = item.querySelector('.ordering-move-btn[data-move="up"]');
            const down = item.querySelector('.ordering-move-btn[data-move="down"]');
            if (up) up.disabled = index === 0;
            if (down) down.disabled = index === items.length - 1;
        });
    }

    getCurrentOrder() {
        const items = this.container.querySelectorAll(this.options.itemSelector);
        return Array.from(items).map(item => {
            return {
                index: parseInt(item.dataset.orderIndex),
                originalIndex: parseInt(item.dataset.originalIndex || item.dataset.orderIndex),
                content: item.querySelector('.ordering-item-content')?.textContent || item.textContent.trim()
            };
        });
    }

}
