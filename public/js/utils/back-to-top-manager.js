/**
 * Back-to-Top Manager
 * Handles scroll-based visibility of back-to-top buttons
 */

import { logger, TIMING } from '../core/config.js';

/**
 * Scroll the page/container to the top
 */
export function scrollToTop() {
    logger.debug('Scroll to top function called');

    let scrolled = false;

    // Try multiple containers to find the scrollable one
    const containers = [
        { element: document.querySelector('.quiz-editor-section'), name: 'editor section' },
        { element: document.querySelector('.host-container'), name: 'host container' },
        { element: document.documentElement, name: 'document' },
        { element: document.body, name: 'body' }
    ];

    for (const container of containers) {
        if (!container.element) continue;

        const { scrollTop, scrollHeight, clientHeight } = container.element;

        logger.debug(`Checking ${container.name}:`, { scrollTop, scrollHeight, clientHeight });

        // Check if this container is scrollable and has been scrolled
        if (scrollHeight > clientHeight && scrollTop > 0) {
            logger.debug(`Scrolling ${container.name} to top`);
            container.element.scrollTo({ top: 0, behavior: 'smooth' });
            scrolled = true;
            break;
        }
    }

    // Fallback: try window scroll
    const windowScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    if (windowScrollTop > 0) {
        logger.debug('Scrolling window to top');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        scrolled = true;
    }

    if (!scrolled) {
        logger.debug('No scrollable container found or already at top');
    }
}

/**
 * Show the back-to-top buttons
 */
function showBackToTopButtons(floatingBtn, editorBtn) {
    if (floatingBtn && !floatingBtn.classList.contains('show')) {
        logger.debug('Showing floating back-to-top button');
        floatingBtn.style.display = 'flex';
        floatingBtn.classList.add('show');
    }
    if (editorBtn && editorBtn.style.display === 'none') {
        logger.debug('Showing editor back-to-top button');
        editorBtn.style.display = 'flex';
    }
}

/**
 * Hide the back-to-top buttons
 */
function hideBackToTopButtons(floatingBtn, editorBtn) {
    if (floatingBtn && floatingBtn.classList.contains('show')) {
        logger.debug('Hiding floating back-to-top button');
        floatingBtn.classList.remove('show');
        setTimeout(() => {
            if (!floatingBtn.classList.contains('show')) {
                floatingBtn.style.display = 'none';
            }
        }, TIMING.ANIMATION_FADE_DURATION);
    }
    if (editorBtn) {
        logger.debug('Hiding editor back-to-top button');
        editorBtn.style.display = 'none';
    }
}

/**
 * Initialize back-to-top button behavior
 */
export function initializeBackToTopButton() {
    const floatingBtn = document.getElementById('back-to-top-float');
    const editorBtn = document.getElementById('back-to-top');
    const editorSection = document.querySelector('.quiz-editor-section');

    logger.debug('Initializing back-to-top buttons:', {
        floatingButton: !!floatingBtn,
        editorButton: !!editorBtn,
        editor: !!editorSection
    });

    if (!editorSection) {
        logger.warn('Editor section not found for back-to-top button initialization');
        return;
    }

    // Listen for editor section scroll
    editorSection.addEventListener('scroll', () => {
        const scrollTop = editorSection.scrollTop;

        if (scrollTop > TIMING.SCROLL_THRESHOLD) {
            showBackToTopButtons(floatingBtn, editorBtn);
        } else {
            hideBackToTopButtons(floatingBtn, editorBtn);
        }
    });

    // Listen for window scroll as fallback
    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop > TIMING.SCROLL_THRESHOLD) {
            showBackToTopButtons(floatingBtn, editorBtn);
        } else {
            hideBackToTopButtons(floatingBtn, editorBtn);
        }
    });

    logger.debug('Back-to-top button listeners initialized');
}

// Make scrollToTop available globally for HTML onclick handlers
window.scrollToTop = scrollToTop;
