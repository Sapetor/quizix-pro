/**
 * Language Dropdown Manager
 * Handles language dropdown positioning, selection, and mobile portal behavior
 */

import { translationManager } from './translation-manager.js';
import { logger, LANGUAGES } from '../core/config.js';
import { isMobile } from './dom.js';

/**
 * Update welcome text with proper translation for the selected language
 */
function updateWelcomeText(langCode) {
    const welcomeElement = document.querySelector('.welcome-text[data-translate="welcome_to"]');
    if (!welcomeElement) return;

    const newText = LANGUAGES.getWelcomeText(langCode);
    welcomeElement.textContent = newText;
    logger.debug(`Updated mobile welcome text to: ${newText} (${langCode})`);
}

/**
 * Reset dropdown styling to default state
 */
function resetDropdownStyles(dropdownOptions) {
    if (!dropdownOptions) return;

    dropdownOptions.style.position = '';
    dropdownOptions.style.left = '';
    dropdownOptions.style.top = '';
    dropdownOptions.style.width = '';
    dropdownOptions.style.zIndex = '';
    dropdownOptions.style.transform = '';
    dropdownOptions.style.isolation = '';
    dropdownOptions.style.pointerEvents = '';
    dropdownOptions.style.visibility = '';
    dropdownOptions.style.opacity = '';
}

/**
 * Restore dropdown from body portal to original position
 */
function restoreDropdownToOriginalPosition(dropdown) {
    const dropdownOptions = dropdown.querySelector('.language-dropdown-options');

    if (!dropdownOptions) {
        // Check if dropdown was moved to body portal
        const bodyDropdown = document.body.querySelector('.language-dropdown-options[data-portal-moved="true"]');
        if (bodyDropdown && bodyDropdown.dataset.originalParent === 'language-dropdown') {
            dropdown.appendChild(bodyDropdown);
            delete bodyDropdown.dataset.portalMoved;
            delete bodyDropdown.dataset.originalParent;
            resetDropdownStyles(bodyDropdown);
            logger.debug('Restored dropdown from body portal to original position');
        }
        return;
    }

    if (dropdownOptions.dataset.portalMoved) {
        delete dropdownOptions.dataset.portalMoved;
        delete dropdownOptions.dataset.originalParent;
        resetDropdownStyles(dropdownOptions);
        logger.debug('Reset dropdown positioning attributes');
    }
}

/**
 * Position dropdown on mobile using body portal approach
 * Moves dropdown to document body to escape container constraints
 */
function positionMobileDropdown(dropdown) {
    const dropdownButton = dropdown.querySelector('.language-dropdown-selected');
    const dropdownOptions = dropdown.querySelector('.language-dropdown-options');

    if (!dropdownButton || !dropdownOptions) return;

    const rect = dropdownButton.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const dropdownHeight = 300; // max-height from CSS
    const dropdownMaxWidth = Math.min(300, viewportWidth - 20);

    // Calculate optimal position
    let top = rect.bottom + 8;
    let left = rect.left;

    // Adjust if dropdown would go off-screen vertically
    if (top + dropdownHeight > viewportHeight - 10) {
        top = rect.top - dropdownHeight - 8;
        if (top < 10) {
            top = Math.max(10, (viewportHeight - dropdownHeight) / 2);
        }
    }

    // Ensure dropdown stays within horizontal bounds
    if (left + dropdownMaxWidth > viewportWidth - 10) {
        left = viewportWidth - dropdownMaxWidth - 10;
    }
    left = Math.max(10, left);

    // Center horizontally on narrow screens
    if (viewportWidth <= 400) {
        left = (viewportWidth - dropdownMaxWidth) / 2;
    }

    // Move dropdown to body to escape container constraints
    if (!dropdownOptions.dataset.portalMoved) {
        dropdownOptions.dataset.portalMoved = 'true';
        dropdownOptions.dataset.originalParent = 'language-dropdown';
        document.body.appendChild(dropdownOptions);
        logger.debug('Moved dropdown to body portal to escape container bounds');
    }

    // Apply fixed positioning with maximum z-index
    Object.assign(dropdownOptions.style, {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${dropdownMaxWidth}px`,
        zIndex: '2147483647',
        transform: 'none',
        isolation: 'isolate',
        pointerEvents: 'auto',
        visibility: 'visible',
        opacity: '1'
    });

    logger.debug(`Mobile dropdown positioned at: ${Math.round(left)}px, ${Math.round(top)}px`);
}

/**
 * Toggle language dropdown visibility
 */
export function toggleLanguageDropdown() {
    // Handle mobile-specific dropdowns
    if (isMobile()) {
        const mobileHeaderDropdown = document.getElementById('mobile-language-selector-header');
        if (mobileHeaderDropdown) {
            mobileHeaderDropdown.classList.toggle('open');
            return;
        }

        const mobileDropdown = document.getElementById('mobile-language-selector');
        if (mobileDropdown) {
            mobileDropdown.classList.toggle('open');
            return;
        }
    }

    // Handle desktop dropdown
    const dropdown = document.getElementById('language-selector');
    if (!dropdown) return;

    const isOpening = !dropdown.classList.contains('open');
    dropdown.classList.toggle('open');

    // Position for mobile if needed
    if (isOpening && isMobile()) {
        positionMobileDropdown(dropdown);
    }
}

/**
 * Update dropdown UI to reflect selected language
 */
function updateDropdownSelection(dropdown, langCode) {
    if (!dropdown) return;

    const selectedFlag = dropdown.querySelector('.language-dropdown-selected .language-flag');
    const selectedName = dropdown.querySelector('.language-dropdown-selected .language-name');
    const selectedOption = dropdown.querySelector(`[data-value="${langCode}"]`);

    if (selectedFlag && selectedName && selectedOption) {
        selectedFlag.textContent = selectedOption.querySelector('.language-flag').textContent;
        selectedName.textContent = selectedOption.querySelector('.language-name').textContent;
        selectedName.setAttribute('data-translate', selectedOption.querySelector('.language-name').getAttribute('data-translate'));
    }

    // Update selected state
    dropdown.querySelectorAll('.language-option').forEach(option => {
        option.classList.remove('selected');
    });
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }
}

/**
 * Select a language and update all dropdowns
 */
export async function selectLanguage(langCode, event) {
    event.stopPropagation();

    logger.debug(`Switching language to: ${langCode}`);

    // Close all dropdowns
    const desktopDropdown = document.getElementById('language-selector');
    const mobileDropdown = document.getElementById('mobile-language-selector');
    const mobileHeaderDropdown = document.getElementById('mobile-language-selector-header');

    if (desktopDropdown) {
        desktopDropdown.classList.remove('open');
        restoreDropdownToOriginalPosition(desktopDropdown);
    }
    if (mobileDropdown) {
        mobileDropdown.classList.remove('open');
    }
    if (mobileHeaderDropdown) {
        mobileHeaderDropdown.classList.remove('open');
    }

    // Update all dropdown UIs
    [desktopDropdown, mobileDropdown, mobileHeaderDropdown].forEach(dropdown => {
        updateDropdownSelection(dropdown, langCode);
    });

    try {
        const success = await translationManager.setLanguage(langCode);

        if (success) {
            logger.debug(`Language changed successfully to: ${langCode}`);
            updateWelcomeText(langCode);
        } else {
            logger.error(`Failed to change language to: ${langCode}`);
        }
    } catch (error) {
        logger.error(`Error changing language to ${langCode}:`, error);
    }
}

/**
 * Initialize dropdown event listeners
 */
export function initializeDropdownListeners() {
    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('language-selector');
        if (!dropdown || dropdown.contains(event.target)) return;

        // Check if clicking on body portal dropdown
        const bodyDropdown = document.body.querySelector('.language-dropdown-options[data-portal-moved="true"]');
        if (bodyDropdown && bodyDropdown.contains(event.target)) return;

        dropdown.classList.remove('open');
        restoreDropdownToOriginalPosition(dropdown);
    });

    // Reposition on window resize
    window.addEventListener('resize', () => {
        const dropdown = document.getElementById('language-selector');
        if (!dropdown || !dropdown.classList.contains('open')) return;

        if (isMobile()) {
            setTimeout(() => positionMobileDropdown(dropdown), 100);
        } else {
            const dropdownOptions = dropdown.querySelector('.language-dropdown-options');
            if (dropdownOptions) {
                resetDropdownStyles(dropdownOptions);
            }
        }
    });

    // Close on scroll (mobile)
    window.addEventListener('scroll', () => {
        const dropdown = document.getElementById('language-selector');
        if (dropdown && dropdown.classList.contains('open') && isMobile()) {
            dropdown.classList.remove('open');
            restoreDropdownToOriginalPosition(dropdown);
        }
    });

    // Close on orientation change
    window.addEventListener('orientationchange', () => {
        const dropdown = document.getElementById('language-selector');
        if (dropdown && dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
            restoreDropdownToOriginalPosition(dropdown);
        }
    });

    logger.debug('Dropdown event listeners initialized');
}

// Make functions available globally for HTML onclick handlers
window.toggleLanguageDropdown = toggleLanguageDropdown;
window.selectLanguage = selectLanguage;
