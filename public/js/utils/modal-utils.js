/**
 * Modal Utilities
 * Shared helpers for modal handling patterns across the application
 *
 * Consolidates common modal patterns:
 * - Opening/closing modals
 * - Overlay click to dismiss
 * - Escape key to dismiss
 * - Body scroll locking
 */

import { logger } from '../core/config.js';

/**
 * Modal display modes
 */
export const MODAL_MODES = {
    DISPLAY: 'display',     // Uses style.display = 'flex'/'none'
    CLASS: 'class'          // Uses classList.add/remove('active')
};

/**
 * Open a modal element
 * @param {HTMLElement} modal - The modal element to show
 * @param {Object} options - Configuration options
 * @param {string} options.mode - Display mode: 'display' or 'class' (default: 'display')
 * @param {string} options.activeClass - Class name for active state (default: 'active')
 * @param {boolean} options.lockScroll - Whether to prevent body scrolling (default: true)
 */
export function openModal(modal, options = {}) {
    if (!modal) {
        logger.warn('openModal called with null/undefined modal');
        return;
    }

    const {
        mode = MODAL_MODES.DISPLAY,
        activeClass = 'active',
        lockScroll = true
    } = options;

    if (mode === MODAL_MODES.CLASS) {
        modal.classList.add(activeClass);
    } else {
        modal.style.display = 'flex';
    }

    if (lockScroll) {
        document.body.style.overflow = 'hidden';
    }

    logger.debug('Modal opened:', modal.id || 'unnamed');
}

/**
 * Close a modal element
 * @param {HTMLElement} modal - The modal element to hide
 * @param {Object} options - Configuration options
 * @param {string} options.mode - Display mode: 'display' or 'class' (default: 'display')
 * @param {string} options.activeClass - Class name for active state (default: 'active')
 * @param {boolean} options.unlockScroll - Whether to restore body scrolling (default: true)
 */
export function closeModal(modal, options = {}) {
    if (!modal) {
        logger.warn('closeModal called with null/undefined modal');
        return;
    }

    const {
        mode = MODAL_MODES.DISPLAY,
        activeClass = 'active',
        unlockScroll = true
    } = options;

    if (mode === MODAL_MODES.CLASS) {
        modal.classList.remove(activeClass);
    } else {
        modal.style.display = 'none';
    }

    if (unlockScroll) {
        document.body.style.overflow = '';
    }

    logger.debug('Modal closed:', modal.id || 'unnamed');
}

/**
 * Check if a modal is currently visible
 * @param {HTMLElement} modal - The modal element to check
 * @param {Object} options - Configuration options
 * @param {string} options.mode - Display mode: 'display' or 'class' (default: 'display')
 * @param {string} options.activeClass - Class name for active state (default: 'active')
 * @returns {boolean} Whether the modal is visible
 */
export function isModalOpen(modal, options = {}) {
    if (!modal) return false;

    const {
        mode = MODAL_MODES.DISPLAY,
        activeClass = 'active'
    } = options;

    if (mode === MODAL_MODES.CLASS) {
        return modal.classList.contains(activeClass);
    }

    // Check inline style first, then computed style as fallback
    if (modal.style.display) {
        return modal.style.display !== 'none';
    }
    // Fallback to computed style for CSS-based visibility
    const computedStyle = window.getComputedStyle(modal);
    return computedStyle.display !== 'none';
}

/**
 * Bind overlay click handler to close modal
 * Closes modal when clicking on the overlay (outside the modal content)
 * @param {HTMLElement} modal - The modal/overlay element
 * @param {Function} closeHandler - Function to call when overlay is clicked
 * @returns {Function} The event handler (for cleanup)
 */
export function bindOverlayClose(modal, closeHandler) {
    if (!modal || typeof closeHandler !== 'function') {
        logger.warn('bindOverlayClose: invalid modal or handler');
        return null;
    }

    const handler = (e) => {
        if (e.target === modal) {
            closeHandler();
        }
    };

    modal.addEventListener('click', handler);
    return handler;
}

/**
 * Unbind overlay click handler
 * @param {HTMLElement} modal - The modal/overlay element
 * @param {Function} handler - The handler to remove
 */
export function unbindOverlayClose(modal, handler) {
    if (modal && handler) {
        modal.removeEventListener('click', handler);
    }
}

/**
 * Bind escape key handler to close modal
 * @param {HTMLElement} modal - The modal element (used to check visibility)
 * @param {Function} closeHandler - Function to call when escape is pressed
 * @param {Object} options - Configuration options
 * @param {string} options.mode - Display mode for visibility check (default: 'display')
 * @param {string} options.activeClass - Class name for active state (default: 'active')
 * @returns {Function} The event handler (for cleanup)
 */
export function bindEscapeClose(modal, closeHandler, options = {}) {
    if (!modal || typeof closeHandler !== 'function') {
        logger.warn('bindEscapeClose: invalid modal or handler');
        return null;
    }

    const handler = (e) => {
        if (e.key === 'Escape' && isModalOpen(modal, options)) {
            closeHandler();
        }
    };

    document.addEventListener('keydown', handler);
    return handler;
}

/**
 * Unbind escape key handler
 * @param {Function} handler - The handler to remove
 */
export function unbindEscapeClose(handler) {
    if (handler) {
        document.removeEventListener('keydown', handler);
    }
}

/**
 * Create all modal bindings at once
 * Binds both overlay click and escape key handlers
 * @param {HTMLElement} modal - The modal element
 * @param {Function} closeHandler - Function to call to close the modal
 * @param {Object} options - Configuration options
 * @param {boolean} options.overlay - Bind overlay click (default: true)
 * @param {boolean} options.escape - Bind escape key (default: true)
 * @param {string} options.mode - Display mode (default: 'display')
 * @param {string} options.activeClass - Class name for active state (default: 'active')
 * @returns {Object} Object containing handler references for cleanup
 */
export function createModalBindings(modal, closeHandler, options = {}) {
    const {
        overlay = true,
        escape = true,
        ...visibilityOptions
    } = options;

    const bindings = {
        overlayHandler: null,
        escapeHandler: null,
        cleanup: null
    };

    if (overlay) {
        bindings.overlayHandler = bindOverlayClose(modal, closeHandler);
    }

    if (escape) {
        bindings.escapeHandler = bindEscapeClose(modal, closeHandler, visibilityOptions);
    }

    // Provide cleanup function for convenience
    bindings.cleanup = () => {
        if (bindings.overlayHandler) {
            unbindOverlayClose(modal, bindings.overlayHandler);
        }
        if (bindings.escapeHandler) {
            unbindEscapeClose(bindings.escapeHandler);
        }
    };

    return bindings;
}

/**
 * Prevent clicks inside modal content from closing the modal
 * Add this to the inner modal content element
 * @param {HTMLElement} contentElement - The modal content element
 * @returns {Function} The event handler (for cleanup)
 */
export function preventContentClose(contentElement) {
    if (!contentElement) return null;

    const handler = (e) => {
        e.stopPropagation();
    };

    contentElement.addEventListener('click', handler);
    return handler;
}

/**
 * Get modal by ID with error handling
 * @param {string} modalId - The ID of the modal element
 * @returns {HTMLElement|null} The modal element or null
 */
export function getModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        logger.warn(`Modal not found: ${modalId}`);
    }
    return modal;
}

export default {
    MODAL_MODES,
    openModal,
    closeModal,
    isModalOpen,
    bindOverlayClose,
    unbindOverlayClose,
    bindEscapeClose,
    unbindEscapeClose,
    createModalBindings,
    preventContentClose,
    getModal
};
