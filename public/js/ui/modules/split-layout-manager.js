/**
 * Split Layout Manager Module
 * Handles split view layout, drag functionality, and resize operations
 * Extracted from PreviewManager for better separation of concerns
 */

import { logger, UI } from '../../core/config.js';
import { getItem, setItem } from '../../utils/storage-utils.js';

// Mobile breakpoint - matches CSS media query in responsive.css
const MOBILE_BREAKPOINT = 1000;

// Expanded ratio limits for better flexibility (was 25-75)
const MIN_RATIO = 20;
const MAX_RATIO = 85;
const RATIO_STEP = 5; // Keyboard resize step

// Fixed widths for the new 4-column grid layout
const TOOLBAR_WIDTH = 48; // Vertical toolbar width in pixels
const HANDLE_WIDTH = 16;  // Resize handle width in pixels

export class SplitLayoutManager {
    constructor() {
        // Drag functionality state
        this.isDragging = false;
        this.dragStartX = 0;
        this.initialSplitRatio = UI.INITIAL_SPLIT_RATIO;
        this.dragTooltip = null;
        this.dragFunctionalityInitialized = false;

        // Store listener references for proper cleanup
        this.listeners = {
            dragStart: null,
            dragMove: null,
            dragEnd: null,
            resize: null
        };
    }

    /**
     * Check if viewport is mobile/tablet (≤1000px)
     * Matches the CSS media query in responsive.css that hides the resize handle
     */
    isMobileViewport() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    /**
     * Initialize split layout mode
     */
    initializeSplitLayout() {
        // On mobile viewports, skip resize handle and drag functionality
        // CSS already handles single-column layout at ≤1000px
        if (!this.isMobileViewport()) {
            this.showResizeHandle();
            this.initializeDragFunctionality();
        } else {
            logger.debug('Mobile viewport detected, skipping resize handle initialization');
        }

        // Load saved ratio first, fall back to default only if none exists
        // This prevents visual "jump" when loading a quiz
        if (!this.loadSavedSplitRatio()) {
            this.setDefaultSplitRatio();
        }
        this.loadSavedFontSize();
        this.initializeResizeListener();
    }

    /**
     * Initialize viewport resize listener to enable/disable drag functionality
     */
    initializeResizeListener() {
        // Clean up existing resize listener if any
        if (this.listeners.resize) {
            window.removeEventListener('resize', this.listeners.resize);
        }

        this.listeners.resize = () => {
            const isMobile = this.isMobileViewport();

            if (isMobile && this.dragFunctionalityInitialized) {
                // Switched to mobile - disable drag functionality
                this.cleanupDragFunctionality();
                this.hideResizeHandle();
                logger.debug('Viewport resized to mobile, disabled resize handle');
            } else if (!isMobile && !this.dragFunctionalityInitialized) {
                // Switched to desktop - enable drag functionality
                this.showResizeHandle();
                this.initializeDragFunctionality();
                logger.debug('Viewport resized to desktop, enabled resize handle');
            }
        };

        window.addEventListener('resize', this.listeners.resize);
    }

    /**
     * Cleanup split layout mode
     */
    cleanupSplitLayout() {
        this.hideResizeHandle();
        this.cleanupDragFunctionality();
        this.cleanupResizeListener();
    }

    /**
     * Cleanup viewport resize listener
     */
    cleanupResizeListener() {
        if (this.listeners.resize) {
            window.removeEventListener('resize', this.listeners.resize);
            this.listeners.resize = null;
        }
    }

    /**
     * Show the resize handle
     */
    showResizeHandle() {
        const resizeHandle = document.getElementById('split-resize-handle');
        if (resizeHandle) {
            resizeHandle.style.display = 'flex';
        }
    }

    /**
     * Hide the resize handle
     */
    hideResizeHandle() {
        const resizeHandle = document.getElementById('split-resize-handle');
        if (resizeHandle) {
            resizeHandle.style.display = 'none';
        }
    }

    /**
     * Set default 70/30 split ratio (editor/preview)
     */
    setDefaultSplitRatio() {
        const hostContainer = document.querySelector('.host-container');
        if (hostContainer) {
            hostContainer.style.setProperty('--split-left', '70fr');
            hostContainer.style.setProperty('--split-right', '30fr');
            logger.debug('Set default 70/30 split ratio on preview activation');
        }
    }

    /**
     * Initialize drag functionality for the split divider
     */
    initializeDragFunctionality() {
        const resizeHandle = document.getElementById('split-resize-handle');
        if (!resizeHandle) {
            logger.warn('Resize handle not found, drag functionality not initialized');
            return;
        }

        // Mouse down on resize handle
        this.listeners.dragStart = (e) => {
            e.preventDefault();
            this.isDragging = true;
            this.dragStartX = e.clientX;

            // Get current split ratio
            const hostContainer = document.querySelector('.host-container');
            const computedStyle = getComputedStyle(hostContainer);
            const leftValue = computedStyle.getPropertyValue('--split-left').trim();

            if (leftValue.endsWith('fr')) {
                this.initialSplitRatio = parseFloat(leftValue.slice(0, -2));
            } else {
                this.initialSplitRatio = 70; // Default fallback
            }

            resizeHandle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            // Create and show tooltip
            this.createDragTooltip();

            logger.debug('Drag started', { initialRatio: this.initialSplitRatio, startX: this.dragStartX });
        };

        // Mouse move during drag
        this.listeners.dragMove = (e) => {
            if (!this.isDragging) return;

            e.preventDefault();
            const hostContainer = document.querySelector('.host-container');
            const containerRect = hostContainer.getBoundingClientRect();
            const containerWidth = containerRect.width;

            // Calculate mouse position relative to the editor start (after toolbar)
            const mouseX = e.clientX - containerRect.left - TOOLBAR_WIDTH;

            // Available width for editor + preview (excluding toolbar and handle)
            const availableWidth = containerWidth - TOOLBAR_WIDTH - HANDLE_WIDTH;

            // Calculate new ratio based on available space
            let newRatio = (mouseX / availableWidth) * 100;
            newRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, newRatio));

            // Update CSS custom properties (these control the fr units in grid)
            hostContainer.style.setProperty('--split-left', `${newRatio}fr`);
            hostContainer.style.setProperty('--split-right', `${100 - newRatio}fr`);

            // Update tooltip position and content
            this.updateDragTooltip(e.clientX, newRatio);

            logger.debug('Dragging', { newRatio, mouseX, availableWidth });
        };

        // Mouse up - end drag
        this.listeners.dragEnd = (_e) => {
            if (!this.isDragging) return;

            this.isDragging = false;
            resizeHandle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Hide and remove tooltip
            this.hideDragTooltip();

            // Save the new ratio to localStorage
            const hostContainer = document.querySelector('.host-container');
            const computedStyle = getComputedStyle(hostContainer);
            const leftValue = computedStyle.getPropertyValue('--split-left').trim();
            const ratio = parseFloat(leftValue.slice(0, -2));

            if (!isNaN(ratio)) {
                setItem('splitRatio', ratio.toString());
                logger.debug('Saved split ratio to localStorage', { ratio });
            }

            logger.debug('Drag ended');
        };

        // Add event listeners
        resizeHandle.addEventListener('mousedown', this.listeners.dragStart);
        document.addEventListener('mousemove', this.listeners.dragMove);
        document.addEventListener('mouseup', this.listeners.dragEnd);

        // Keyboard resize support - make handle focusable and listen for arrow keys
        resizeHandle.setAttribute('tabindex', '0');
        resizeHandle.setAttribute('role', 'separator');
        resizeHandle.setAttribute('aria-valuenow', '70');
        resizeHandle.setAttribute('aria-valuemin', String(MIN_RATIO));
        resizeHandle.setAttribute('aria-valuemax', String(MAX_RATIO));
        resizeHandle.setAttribute('aria-label', 'Resize split view. Use left and right arrow keys to adjust.');

        this.listeners.keyboardResize = (e) => this.handleKeyboardResize(e);
        resizeHandle.addEventListener('keydown', this.listeners.keyboardResize);

        // Mark as initialized for viewport resize tracking
        this.dragFunctionalityInitialized = true;
    }

    /**
     * Update the drag handle position based on the split ratio
     * Note: In the new 4-column grid layout, the handle is in a fixed grid column,
     * so this method is now a no-op. The ratio is controlled via --split-left/--split-right CSS vars.
     */
    updateDragHandlePosition(_ratio) {
        // No-op: Handle is now in a fixed grid column (column 3)
        // The split ratio is controlled by CSS custom properties
    }

    /**
     * Load saved split ratio from localStorage
     * @returns {boolean} True if a valid saved ratio was loaded, false otherwise
     */
    loadSavedSplitRatio() {
        const savedRatio = getItem('splitRatio');
        if (savedRatio) {
            const ratio = parseFloat(savedRatio);
            if (!isNaN(ratio) && ratio >= MIN_RATIO && ratio <= MAX_RATIO) {
                const hostContainer = document.querySelector('.host-container');
                if (hostContainer) {
                    hostContainer.style.setProperty('--split-left', `${ratio}fr`);
                    hostContainer.style.setProperty('--split-right', `${100 - ratio}fr`);
                    this.updateDragHandlePosition(ratio);
                    logger.debug('Loaded saved split ratio', { ratio });
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Handle keyboard resize (arrow keys)
     * @param {KeyboardEvent} e - The keyboard event
     */
    handleKeyboardResize(e) {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;

        const hostContainer = document.querySelector('.host-container');
        if (!hostContainer) return;

        const computedStyle = getComputedStyle(hostContainer);
        const leftValue = computedStyle.getPropertyValue('--split-left').trim();
        let currentRatio = parseFloat(leftValue.slice(0, -2)) || 70;

        if (e.key === 'ArrowLeft') {
            currentRatio = Math.max(MIN_RATIO, currentRatio - RATIO_STEP);
        } else if (e.key === 'ArrowRight') {
            currentRatio = Math.min(MAX_RATIO, currentRatio + RATIO_STEP);
        }

        hostContainer.style.setProperty('--split-left', `${currentRatio}fr`);
        hostContainer.style.setProperty('--split-right', `${100 - currentRatio}fr`);
        this.updateDragHandlePosition(currentRatio);

        // Save the new ratio
        setItem('splitRatio', currentRatio.toString());
        logger.debug('Keyboard resize', { newRatio: currentRatio });
    }

    /**
     * Create drag tooltip
     */
    createDragTooltip() {
        if (this.dragTooltip) {
            this.dragTooltip.remove();
        }

        this.dragTooltip = document.createElement('div');
        this.dragTooltip.className = 'drag-tooltip';
        this.dragTooltip.textContent = '50% / 50%';
        document.body.appendChild(this.dragTooltip);

        // Show tooltip after a brief delay
        setTimeout(() => {
            if (this.dragTooltip) {
                this.dragTooltip.classList.add('visible');
            }
        }, 100);
    }

    /**
     * Update drag tooltip position and content
     */
    updateDragTooltip(mouseX, ratio) {
        if (!this.dragTooltip) return;

        this.dragTooltip.style.left = `${mouseX}px`;
        this.dragTooltip.style.top = `${window.scrollY + 100}px`;
        this.dragTooltip.textContent = `${Math.round(ratio)}% / ${Math.round(100 - ratio)}%`;
    }

    /**
     * Hide and remove drag tooltip
     */
    hideDragTooltip() {
        if (this.dragTooltip) {
            this.dragTooltip.classList.remove('visible');
            setTimeout(() => {
                if (this.dragTooltip) {
                    this.dragTooltip.remove();
                    this.dragTooltip = null;
                }
            }, 200);
        }
    }

    /**
     * Clean up drag functionality
     */
    cleanupDragFunctionality() {
        const resizeHandle = document.getElementById('split-resize-handle');

        if (resizeHandle && this.listeners.dragStart) {
            resizeHandle.removeEventListener('mousedown', this.listeners.dragStart);
        }

        if (this.listeners.dragMove) {
            document.removeEventListener('mousemove', this.listeners.dragMove);
        }

        if (this.listeners.dragEnd) {
            document.removeEventListener('mouseup', this.listeners.dragEnd);
        }

        // Clean up keyboard resize listener
        if (resizeHandle && this.listeners.keyboardResize) {
            resizeHandle.removeEventListener('keydown', this.listeners.keyboardResize);
        }

        // Reset drag state
        this.isDragging = false;
        this.dragFunctionalityInitialized = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Clean up tooltip
        this.hideDragTooltip();
    }

    /**
     * Load saved font size preference
     */
    loadSavedFontSize() {
        const savedSize = getItem('fontSize');
        if (savedSize && ['small', 'medium', 'large', 'xlarge'].includes(savedSize)) {
            setTimeout(() => {
                if (window.setGlobalFontSize) {
                    window.setGlobalFontSize(savedSize);
                    logger.debug('Loaded saved font size:', savedSize);
                }
            }, 100);
        } else {
            setTimeout(() => {
                if (window.setGlobalFontSize) {
                    window.setGlobalFontSize('medium');
                }
            }, 100);
        }
    }
}