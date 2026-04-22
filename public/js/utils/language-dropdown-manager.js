/**
 * Language Dropdown Manager
 * Handles language dropdown positioning, selection, and mobile portal behavior
 */

import { translationManager } from './translation-manager.js';
import { logger, LANGUAGES } from '../core/config.js';
import { isMobile, debounce } from './dom.js';

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
    dropdownOptions.removeAttribute('style');
}

/**
 * Restore dropdown from body portal to original position
 */
function restoreDropdownToOriginalPosition(dropdown) {
    const dropdownOptions = dropdown.querySelector('.language-dropdown-options');

    if (!dropdownOptions) {
        // Check if dropdown was moved to body portal
        const bodyDropdown = document.body.querySelector('.language-dropdown-options[data-portal-moved="true"]');
        if (bodyDropdown && bodyDropdown.dataset.originalParent === dropdown.id) {
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
    // Options may already be portaled to body
    let dropdownOptions = dropdown.querySelector('.language-dropdown-options')
        || document.body.querySelector('.language-dropdown-options[data-portal-moved="true"]');

    if (!dropdownButton || !dropdownOptions) return;

    const rect = dropdownButton.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const dropdownHeight = 300; // max-height from CSS
    const dropdownMaxWidth = Math.min(280, viewportWidth - 40);

    // Position below button, fall back to above if near viewport bottom
    const left = Math.round((viewportWidth - dropdownMaxWidth) / 2);
    let top = rect.bottom + 8;
    if (top + dropdownHeight > viewportHeight - 10) {
        top = rect.top - dropdownHeight - 8;
        if (top < 10) {
            top = Math.max(10, (viewportHeight - dropdownHeight) / 2);
        }
    }

    // Move dropdown to body to escape container constraints
    if (!dropdownOptions.dataset.portalMoved) {
        dropdownOptions.dataset.portalMoved = 'true';
        dropdownOptions.dataset.originalParent = dropdown.id;
        document.body.appendChild(dropdownOptions);
        logger.debug('Moved dropdown to body portal to escape container bounds');
    }

    // Inline visual styles as fallback (CSS portal rule may not match with stale bundles)
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    Object.assign(dropdownOptions.style, {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${dropdownMaxWidth}px`,
        zIndex: '2147483647',
        transform: 'none',
        pointerEvents: 'auto',
        visibility: 'visible',
        opacity: '1',
        background: isLight ? 'rgba(248, 250, 252, 0.98)' : 'rgba(30, 41, 59, 0.98)',
        color: isLight ? '#1e293b' : '#f8fafc',
        border: isLight ? '1px solid rgba(0, 0, 0, 0.12)' : '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        maxHeight: `${dropdownHeight}px`
    });

    logger.debug(`Mobile dropdown positioned at: ${Math.round(left)}px, ${Math.round(top)}px`);
}

/**
 * Toggle language dropdown visibility
 */
export function toggleLanguageDropdown() {
    // Handle mobile-specific dropdowns — use body portal to escape header stacking context
    if (isMobile()) {
        const mobileDropdown = document.getElementById('mobile-language-selector');
        if (mobileDropdown) {
            const isOpening = !mobileDropdown.classList.contains('open');
            mobileDropdown.classList.toggle('open');
            if (isOpening) {
                positionMobileDropdown(mobileDropdown);
            } else {
                restoreDropdownToOriginalPosition(mobileDropdown);
            }
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

    if (desktopDropdown) {
        desktopDropdown.classList.remove('open');
        restoreDropdownToOriginalPosition(desktopDropdown);
    }
    if (mobileDropdown) {
        mobileDropdown.classList.remove('open');
        restoreDropdownToOriginalPosition(mobileDropdown);
    }

    // Update all dropdown UIs
    [desktopDropdown, mobileDropdown].forEach(dropdown => {
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
    const allDropdownIds = ['language-selector', 'mobile-language-selector'];

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        const openDropdown = allDropdownIds.map(id => document.getElementById(id)).find(el => el?.classList.contains('open'));
        if (!openDropdown) return;

        // Check if clicking on body portal dropdown
        const bodyDropdown = document.body.querySelector('.language-dropdown-options[data-portal-moved="true"]');
        if (bodyDropdown && bodyDropdown.contains(event.target)) return;

        if (!openDropdown.contains(event.target)) {
            openDropdown.classList.remove('open');
            restoreDropdownToOriginalPosition(openDropdown);
        }
    });

    // Reposition on window resize
    window.addEventListener('resize', debounce(() => {
        for (const id of allDropdownIds) {
            const dropdown = document.getElementById(id);
            if (!dropdown || !dropdown.classList.contains('open')) continue;

            if (isMobile()) {
                positionMobileDropdown(dropdown);
            } else {
                const dropdownOptions = dropdown.querySelector('.language-dropdown-options');
                if (dropdownOptions) {
                    resetDropdownStyles(dropdownOptions);
                }
            }
        }
    }, 200));

    // Close on scroll (mobile)
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
        if (!scrollTicking) {
            requestAnimationFrame(() => {
                if (isMobile()) {
                    for (const id of allDropdownIds) {
                        const dropdown = document.getElementById(id);
                        if (dropdown && dropdown.classList.contains('open')) {
                            dropdown.classList.remove('open');
                            restoreDropdownToOriginalPosition(dropdown);
                        }
                    }
                }
                scrollTicking = false;
            });
            scrollTicking = true;
        }
    });

    // Close on orientation change
    window.addEventListener('orientationchange', () => {
        for (const id of allDropdownIds) {
            const dropdown = document.getElementById(id);
            if (dropdown && dropdown.classList.contains('open')) {
                dropdown.classList.remove('open');
                restoreDropdownToOriginalPosition(dropdown);
            }
        }
    });

    logger.debug('Dropdown event listeners initialized');
}

// Make functions available globally for HTML onclick handlers
window.toggleLanguageDropdown = toggleLanguageDropdown;
window.selectLanguage = selectLanguage;
