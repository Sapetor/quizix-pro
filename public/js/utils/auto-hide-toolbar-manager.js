/**
 * Auto-Hide Toolbar Manager
 * Handles automatic hiding/showing of the header toolbar during gameplay
 */

import { logger } from '../core/config.js';
import { getTranslation } from './translation-manager.js';

let autoHideTimeout = null;
let isAutoHideEnabled = false;
let headerElement = null;
let hintElement = null;

const HIDE_DELAY_KEYBOARD = 5000; // 5 seconds when summoned by keyboard
const HIDE_DELAY_MOUSE = 2000;    // 2 seconds after mouse leaves

/**
 * Create the hint tab element that appears when header is hidden
 */
function createHintElement() {
    // Remove existing hint if present
    const existingHint = document.querySelector('.header-hint');
    if (existingHint) {
        existingHint.remove();
    }

    hintElement = document.createElement('div');
    hintElement.className = 'header-hint';
    hintElement.innerHTML = `<span class="header-hint-icon">\u25bc</span>${getTranslation('menu')}`;
    document.body.appendChild(hintElement);

    // Show header when hovering over hint
    hintElement.addEventListener('mouseenter', () => {
        showToolbar();
        clearHideTimeout();
    });

    hintElement.addEventListener('mouseleave', () => {
        startHideTimer();
    });

    logger.debug('Header hint element created');
}

/**
 * Handle keyboard events for auto-hide
 */
function handleKeyDown(e) {
    if (!isAutoHideEnabled || !headerElement) return;

    // Show header on Escape key
    if (e.key === 'Escape') {
        showToolbar();
        clearHideTimeout();
        autoHideTimeout = setTimeout(hideToolbar, HIDE_DELAY_KEYBOARD);
    }
}

/**
 * Clear the hide timeout
 */
function clearHideTimeout() {
    if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
        autoHideTimeout = null;
    }
}

/**
 * Show the toolbar/header
 */
function showToolbar() {
    if (!headerElement) return;

    headerElement.classList.add('visible');

    if (hintElement) {
        hintElement.classList.remove('visible');
    }

    logger.debug('Header shown via auto-hide');
}

/**
 * Hide the toolbar/header
 */
function hideToolbar() {
    if (!headerElement) return;

    headerElement.classList.remove('visible');

    if (hintElement) {
        hintElement.classList.add('visible');
    }

    logger.debug('Header hidden via auto-hide');
    clearHideTimeout();
}

/**
 * Start the timer to hide the toolbar
 */
function startHideTimer() {
    clearHideTimeout();

    // Check if language dropdown is open - don't hide during interaction
    const languageDropdown = document.getElementById('language-selector');
    const isDropdownOpen = languageDropdown && languageDropdown.classList.contains('open');

    if (!isDropdownOpen) {
        autoHideTimeout = setTimeout(hideToolbar, HIDE_DELAY_MOUSE);
    }
}

/**
 * Initialize auto-hide toolbar functionality
 */
export function initializeAutoHideToolbar() {
    logger.debug('Initializing auto-hide header functionality');

    headerElement = document.querySelector('header');
    if (!headerElement) {
        logger.warn('Header element not found for auto-hide initialization');
        return;
    }

    // Add auto-hide CSS classes
    headerElement.classList.add('auto-hide-enabled');
    document.body.classList.add('header-auto-hide-mode');

    const lobbyScreen = document.getElementById('game-lobby');
    if (lobbyScreen) {
        lobbyScreen.classList.add('header-auto-hide-active');
        logger.debug('Added header-auto-hide-active class to lobby screen');
    } else {
        logger.warn('Could not find #game-lobby element');
    }

    isAutoHideEnabled = true;

    createHintElement();
    hideToolbar();

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown);

    headerElement.addEventListener('mouseenter', () => {
        clearHideTimeout();
    });

    headerElement.addEventListener('mouseleave', () => {
        startHideTimer();
    });

    logger.debug('Auto-hide header initialized successfully');
}

/**
 * Disable auto-hide toolbar functionality
 */
export function disableAutoHideToolbar() {
    if (!isAutoHideEnabled || !headerElement) return;

    logger.debug('Disabling auto-hide header');

    document.removeEventListener('keydown', handleKeyDown);
    clearHideTimeout();

    // Remove CSS classes
    headerElement.classList.remove('auto-hide-enabled', 'visible');
    document.body.classList.remove('header-auto-hide-mode');

    const lobbyScreen = document.getElementById('game-lobby');
    if (lobbyScreen) {
        lobbyScreen.classList.remove('header-auto-hide-active');
    }

    // Remove hint element
    if (hintElement) {
        hintElement.remove();
        hintElement = null;
    }

    isAutoHideEnabled = false;

    logger.debug('Auto-hide header disabled');
}

/**
 * Check if auto-hide is currently active
 */
export function isAutoHideToolbarActive() {
    return isAutoHideEnabled;
}
