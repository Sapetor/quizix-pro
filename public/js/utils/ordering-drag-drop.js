/**
 * Ordering Drag-and-Drop Utility
 * Handles drag-and-drop functionality for ordering questions
 * Supports both desktop (mouse) and mobile (touch) interactions
 */

import { logger } from '../core/config.js';

export class OrderingDragDrop {
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
        logger.debug('OrderingDragDrop initialized');
    }

    setupDragAndDrop() {
        const items = this.container.querySelectorAll(this.options.itemSelector);

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

            // Mobile touch events
            item.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
            item.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
            item.addEventListener('touchend', this.handleTouchEnd.bind(this));
        });
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

        const items = Array.from(this.container.querySelectorAll(this.options.itemSelector));

        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
            fromIndex >= items.length || toIndex >= items.length) {
            return;
        }

        // Swap in DOM
        const fromItem = items[fromIndex];
        const toItem = items[toIndex];

        if (fromIndex < toIndex) {
            toItem.parentNode.insertBefore(fromItem, toItem.nextSibling);
        } else {
            toItem.parentNode.insertBefore(fromItem, toItem);
        }

        // Update indices
        this.updateIndices();

        // Call callback if provided
        if (typeof this.options.onOrderChange === 'function') {
            const currentOrder = this.getCurrentOrder();
            this.options.onOrderChange(currentOrder);
        }
    }

    updateIndices() {
        const items = this.container.querySelectorAll(this.options.itemSelector);
        items.forEach((item, index) => {
            item.dataset.orderIndex = index;
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

    setOrder(indices) {
        const items = Array.from(this.container.querySelectorAll(this.options.itemSelector));
        const fragment = document.createDocumentFragment();

        indices.forEach(index => {
            if (index >= 0 && index < items.length) {
                fragment.appendChild(items[index]);
            }
        });

        this.container.innerHTML = '';
        this.container.appendChild(fragment);
        this.updateIndices();
        this.setupDragAndDrop(); // Re-attach event listeners
    }

    shuffleOrder() {
        const items = Array.from(this.container.querySelectorAll(this.options.itemSelector));
        const indices = items.map((_, i) => i);

        // Fisher-Yates shuffle
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        this.setOrder(indices);

        logger.debug('Order shuffled:', indices);
    }

    disable() {
        this.options.enabled = false;
        const items = this.container.querySelectorAll(this.options.itemSelector);
        items.forEach(item => {
            item.setAttribute('draggable', 'false');
            item.style.cursor = 'default';
        });
    }

    enable() {
        this.options.enabled = true;
        const items = this.container.querySelectorAll(this.options.itemSelector);
        items.forEach(item => {
            item.setAttribute('draggable', 'true');
            item.style.cursor = 'grab';
        });
    }

    destroy() {
        const items = this.container.querySelectorAll(this.options.itemSelector);
        items.forEach(item => {
            // Remove all event listeners by cloning the node
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
        });

        logger.debug('OrderingDragDrop destroyed');
    }
}
