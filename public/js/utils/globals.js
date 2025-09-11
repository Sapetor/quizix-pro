/**
 * Global Functions Module
 * Provides global functions that are called from HTML onclick handlers
 * 
 * IMPORTANT: This file serves as the critical bridge between HTML and modular JS
 * Most functions MUST remain globally accessible due to direct HTML usage:
 * - HTML onclick/onchange handlers require direct window.functionName access
 * - Cross-module communication needs consistent global access points
 * 
 * USAGE PATTERNS:
 * - QM() registry: Centralized function access with error handling
 * - Direct window assignments: Required for HTML onclick handlers
 * - Mixed approach maintains backward compatibility and functionality
 */

import { translationManager } from './translation-manager.js';
import { logger, LIMITS, TIMING, UI, ANIMATION } from '../core/config.js';

/**
 * Update welcome text with proper translation
 * This ensures the mobile header welcome text is always in sync with the selected language
 */
function updateWelcomeText(langCode) {
    const welcomeElement = document.querySelector('.welcome-text[data-translate="welcome_to"]');
    if (welcomeElement) {
        const translations = {
            'en': 'Welcome to',
            'es': 'Bienvenido a', 
            'fr': 'Bienvenue à',
            'de': 'Willkommen bei',
            'it': 'Benvenuto a',
            'pt': 'Bem-vindo ao',
            'pl': 'Witamy w',
            'ja': 'にようこそ',
            'zh': '欢迎来到'
        };
        
        const newText = translations[langCode] || translations['en'];
        welcomeElement.textContent = newText;
        logger.debug(`📱 Updated mobile welcome text to: ${newText} (${langCode})`);
    }
}

// Global functions that need to be accessible from HTML

// Language dropdown functions
export function toggleLanguageDropdown() {
    // For mobile, use the mobile-specific dropdown (now in header)
    if (window.innerWidth <= 768) {
        const mobileHeaderDropdown = document.getElementById('mobile-language-selector-header');
        if (mobileHeaderDropdown) {
            mobileHeaderDropdown.classList.toggle('open');
            return;
        }
        
        // Fallback to old mobile dropdown if header one doesn't exist
        const mobileDropdown = document.getElementById('mobile-language-selector');
        if (mobileDropdown) {
            mobileDropdown.classList.toggle('open');
            return;
        }
    }
    
    // For desktop, use the desktop dropdown
    const dropdown = document.getElementById('language-selector');
    if (dropdown) {
        const isOpening = !dropdown.classList.contains('open');
        dropdown.classList.toggle('open');
        
        // Handle mobile positioning for fixed dropdown (legacy fallback)
        if (isOpening && window.innerWidth <= 768) {
            positionMobileDropdown(dropdown);
        }
    }
}

// Restore dropdown to original position when closing
function restoreDropdownToOriginalPosition(dropdown) {
    const dropdownOptions = dropdown.querySelector('.language-dropdown-options');
    if (!dropdownOptions) {
        // Try to find it in the body if it was moved
        const bodyDropdown = document.body.querySelector('.language-dropdown-options[data-portal-moved="true"]');
        if (bodyDropdown && bodyDropdown.dataset.originalParent === 'language-dropdown') {
            // Move back to original parent
            dropdown.appendChild(bodyDropdown);
            // Clean up portal attributes
            delete bodyDropdown.dataset.portalMoved;
            delete bodyDropdown.dataset.originalParent;
            // Reset positioning
            bodyDropdown.style.position = '';
            bodyDropdown.style.left = '';
            bodyDropdown.style.top = '';
            bodyDropdown.style.width = '';
            bodyDropdown.style.zIndex = '';
            bodyDropdown.style.transform = '';
            bodyDropdown.style.isolation = '';
            bodyDropdown.style.pointerEvents = '';
            bodyDropdown.style.visibility = '';
            bodyDropdown.style.opacity = '';
            
            logger.debug('📱 Restored dropdown from body portal to original position');
        }
    } else if (dropdownOptions.dataset.portalMoved) {
        // It's in the dropdown but was moved before, clean up portal attributes
        delete dropdownOptions.dataset.portalMoved;
        delete dropdownOptions.dataset.originalParent;
        // Reset positioning
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
        
        logger.debug('📱 Reset dropdown positioning attributes');
    }
}

// Position dropdown on mobile using body portal approach
function positionMobileDropdown(dropdown) {
    const dropdownButton = dropdown.querySelector('.language-dropdown-selected');
    const dropdownOptions = dropdown.querySelector('.language-dropdown-options');
    
    if (dropdownButton && dropdownOptions) {
        const rect = dropdownButton.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const dropdownHeight = 300; // max-height from CSS
        const dropdownMinWidth = 200;
        const dropdownMaxWidth = Math.min(300, viewportWidth - 20);
        
        // Calculate optimal position
        let top = rect.bottom + 8; // 8px margin for better spacing
        let left = rect.left;
        
        // Adjust if dropdown would go off-screen vertically
        if (top + dropdownHeight > viewportHeight - 10) {
            top = rect.top - dropdownHeight - 8; // Show above instead
            // If still off-screen, center vertically
            if (top < 10) {
                top = Math.max(10, (viewportHeight - dropdownHeight) / 2);
            }
        }
        
        // Ensure dropdown doesn't go off left/right edges
        if (left + dropdownMaxWidth > viewportWidth - 10) {
            left = viewportWidth - dropdownMaxWidth - 10;
        }
        left = Math.max(10, left);
        
        // For very narrow screens, center horizontally
        if (viewportWidth <= 400) {
            left = (viewportWidth - dropdownMaxWidth) / 2;
        }
        
        // AGGRESSIVE FIX: Move dropdown to body to escape ALL container constraints
        if (!dropdownOptions.dataset.portalMoved) {
            // Mark as moved to avoid moving multiple times
            dropdownOptions.dataset.portalMoved = 'true';
            dropdownOptions.dataset.originalParent = 'language-dropdown';
            
            // Move to body to escape all container bounds
            document.body.appendChild(dropdownOptions);
            
            logger.debug('📱 Moved dropdown to body portal to escape container bounds');
        }
        
        // Apply positioning with maximum priority
        dropdownOptions.style.position = 'fixed';
        dropdownOptions.style.left = `${left}px`;
        dropdownOptions.style.top = `${top}px`;
        dropdownOptions.style.width = `${dropdownMaxWidth}px`;
        dropdownOptions.style.zIndex = '2147483647'; // Maximum z-index
        dropdownOptions.style.transform = 'none'; // Reset any transforms
        dropdownOptions.style.isolation = 'isolate'; // Create new stacking context
        dropdownOptions.style.pointerEvents = 'auto'; // Ensure clickable
        dropdownOptions.style.visibility = 'visible'; // Force visible
        dropdownOptions.style.opacity = '1'; // Force opaque
        
        logger.debug(`📱 Mobile dropdown positioned at: ${Math.round(left)}px, ${Math.round(top)}px (viewport: ${viewportWidth}x${viewportHeight})`);
    }
}

export async function selectLanguage(langCode, event) {
    event.stopPropagation();
    
    logger.debug(`🌐 Switching language to: ${langCode}`);
    
    // Close dropdowns and restore to original position
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
    
    // Update all language selectors (desktop, mobile bottom, mobile header)
    [desktopDropdown, mobileDropdown, mobileHeaderDropdown].forEach(dropdown => {
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
        if (selectedOption) selectedOption.classList.add('selected');
    });
    
    try {
        // Use the setLanguage method which handles change + UI update
        const success = await translationManager.setLanguage(langCode);
        
        if (success) {
            logger.debug(`✅ Language changed successfully to: ${langCode}`);
            logger.debug(`🔄 UI updated for language: ${langCode}`);
            
            // Manual fix for welcome text that might not be updated by translation system
            updateWelcomeText(langCode);
        } else {
            logger.error(`❌ Failed to change language to: ${langCode}`);
        }
    } catch (error) {
        logger.error(`❌ Error changing language to ${langCode}:`, error);
    }
}

// Event delegation for data-onclick attributes and dropdown management
document.addEventListener('click', (event) => {
    // Handle language dropdown close when clicking outside
    const dropdown = document.getElementById('language-selector');
    if (dropdown && !dropdown.contains(event.target)) {
        // Check if clicking on the dropdown options that might be in body portal
        const bodyDropdown = document.body.querySelector('.language-dropdown-options[data-portal-moved="true"]');
        if (bodyDropdown && bodyDropdown.contains(event.target)) {
            // Clicked inside the portal dropdown, don't close
            return;
        }
        
        dropdown.classList.remove('open');
        restoreDropdownToOriginalPosition(dropdown);
    }
    
    // Handle data-onclick attributes
    const target = event.target.closest('[data-onclick]');
    if (target) {
        const functionName = target.getAttribute('data-onclick');
        if (window[functionName] && typeof window[functionName] === 'function') {
            event.preventDefault();
            window[functionName]();
        }
    }
});

// Handle mobile dropdown repositioning on window resize and scroll
window.addEventListener('resize', () => {
    const dropdown = document.getElementById('language-selector');
    if (dropdown && dropdown.classList.contains('open')) {
        if (window.innerWidth <= 768) {
            // Small delay to ensure resize is complete
            setTimeout(() => positionMobileDropdown(dropdown), 100);
        } else {
            // Reset to desktop positioning
            const dropdownOptions = dropdown.querySelector('.language-dropdown-options');
            if (dropdownOptions) {
                dropdownOptions.style.position = '';
                dropdownOptions.style.left = '';
                dropdownOptions.style.top = '';
                dropdownOptions.style.width = '';
                dropdownOptions.style.zIndex = '';
                dropdownOptions.style.transform = '';
                dropdownOptions.style.isolation = '';
            }
        }
    }
});

window.addEventListener('scroll', () => {
    const dropdown = document.getElementById('language-selector');
    if (dropdown && dropdown.classList.contains('open') && window.innerWidth <= 768) {
        // Close dropdown on scroll to prevent positioning issues
        dropdown.classList.remove('open');
        restoreDropdownToOriginalPosition(dropdown);
    }
});

// Handle orientation changes on mobile devices
window.addEventListener('orientationchange', () => {
    const dropdown = document.getElementById('language-selector');
    if (dropdown && dropdown.classList.contains('open')) {
        // Close dropdown on orientation change, let user reopen it
        dropdown.classList.remove('open');
        restoreDropdownToOriginalPosition(dropdown);
    }
});

export function togglePreviewMode() {
    logger.debug('Preview mode toggle function called');
    
    // Check if mobile device
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // Use mobile preview manager if available
        if (window.game && window.game.previewManager && window.game.previewManager.togglePreviewMode) {
            logger.debug('Using mobile preview manager');
            window.game.previewManager.togglePreviewMode();
        } else if (window.game && window.game.togglePreviewMode) {
            // Fallback to game manager
            window.game.togglePreviewMode();
        } else {
            logger.debug('Preview mode not available');
        }
    } else {
        // Desktop - use existing logic
        if (window.game && window.game.previewManager && window.game.previewManager.togglePreviewMode) {
            logger.debug('Using preview manager for desktop');
            window.game.previewManager.togglePreviewMode();
        } else if (window.game && window.game.togglePreviewMode) {
            window.game.togglePreviewMode();
        } else {
            logger.debug('Preview mode not implemented in modular version yet');
        }
    }
}

export async function openAIGeneratorModal() {
    logger.debug('AI Generator modal function called');
    
    if (window.game && window.game.openAIGeneratorModal) {
        logger.debug('Calling game.openAIGeneratorModal() with lazy loading');
        try {
            await window.game.openAIGeneratorModal();
        } catch (error) {
            logger.error('Failed to open AI Generator modal:', error);
            // Fallback: try to open modal directly
            const modal = document.getElementById('ai-generator-modal');
            if (modal) {
                logger.debug('Opening modal directly as fallback');
                modal.style.display = 'flex';
            }
        }
    } else {
        logger.warn('Game not properly initialized, using fallback');
        // Fallback: try to open modal directly
        const modal = document.getElementById('ai-generator-modal');
        if (modal) {
            logger.debug('Opening modal directly as fallback');
            modal.style.display = 'flex';
        } else {
            logger.error('AI Generator modal DOM element not found');
        }
    }
}

export function toggleToolbar() {
    logger.debug('Horizontal toolbar toggle function called');
    // Toggle horizontal toolbar visibility
    const toolbar = document.getElementById('horizontal-toolbar');
    if (toolbar) {
        const isVisible = toolbar.style.display !== 'none' && toolbar.style.display !== '';
        toolbar.style.display = isVisible ? 'none' : 'flex';
    }
}

export function toggleGlobalTime() {
    logger.debug('Global time toggle function called');
    const globalTimeContainer = document.getElementById('global-time-container');
    const useGlobalTime = document.getElementById('use-global-time');
    
    if (globalTimeContainer && useGlobalTime) {
        globalTimeContainer.style.display = useGlobalTime.checked ? 'block' : 'none';
        logger.debug('Global time container display set to:', useGlobalTime.checked ? 'block' : 'none');
        
        // Update individual question time inputs based on global setting
        const questionTimeInputs = document.querySelectorAll('.question-time-limit');
        questionTimeInputs.forEach(input => {
            const container = input.closest('.time-limit-container');
            if (container) {
                container.style.display = useGlobalTime.checked ? 'none' : 'block';
            }
        });
    } else {
        logger.debug('Global time elements not found:', {
            container: !!globalTimeContainer,
            checkbox: !!useGlobalTime
        });
    }
}

export function updateQuestionType(selectElement) {
    logger.debug('Question type update function called');
    if (window.game && window.game.updateQuestionType) {
        window.game.updateQuestionType(selectElement);
    } else {
        // Basic implementation for question type switching
        const questionItem = selectElement.closest('.question-item');
        if (!questionItem) return;

        const questionType = selectElement.value;
        const allOptions = questionItem.querySelectorAll('.answer-options');
        
        // Hide all option types
        allOptions.forEach(opt => opt.style.display = 'none');
        
        // Show the selected type
        const targetOptions = questionItem.querySelector(`.${questionType}-options`);
        if (targetOptions) {
            targetOptions.style.display = 'block';
        }
    }
}

export function updateTimeLimit(inputElement) {
    logger.debug('Time limit update function called');
    // Implementation for time limit updates
    const value = parseInt(inputElement.value);
    if (value < LIMITS.MIN_TIME_LIMIT) inputElement.value = LIMITS.MIN_TIME_LIMIT;
    if (value > LIMITS.MAX_TIME_LIMIT) inputElement.value = LIMITS.MAX_TIME_LIMIT;
}

export function uploadImage(inputElement) {
    logger.debug('Image upload function called');
    if (window.game && window.game.uploadImage) {
        window.game.uploadImage(inputElement);
    } else {
        logger.debug('Image upload not implemented in modular version yet');
    }
}

export function removeImage(buttonElement) {
    logger.debug('Remove image function called');
    const imagePreview = buttonElement.closest('.image-preview');
    if (imagePreview) {
        imagePreview.style.display = 'none';
        const img = imagePreview.querySelector('.question-image');
        if (img) {
            img.src = '';
            img.dataset.url = '';
        }
    }
}

export function removeQuestion(buttonElement) {
    logger.debug('Remove question function called');
    const questionItem = buttonElement.closest('.question-item');
    if (questionItem) {
        questionItem.remove();
        
        // Update questions UI in single operation to prevent visual glitches
        if (window.game && window.game.quizManager && window.game.quizManager.updateQuestionsUI) {
            window.game.quizManager.updateQuestionsUI();
        }
    }
}

export function scrollToCurrentQuestion() {
    logger.debug('Scroll to current question function called');
    if (window.game && window.game.previewManager && window.game.previewManager.scrollToCurrentQuestion) {
        window.game.previewManager.scrollToCurrentQuestion();
    } else {
        // Fallback implementation
        const questions = document.querySelectorAll('.question-item');
        if (questions.length > 0) {
            const targetQuestion = questions[0]; // Default to first question
            targetQuestion.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}


export function scrollToTop() {
    logger.debug('⬆️ Scroll to top function called');
    
    let scrolled = false;
    
    // Try multiple containers to find the scrollable one
    const containers = [
        { element: document.querySelector('.quiz-editor-section'), name: 'editor section' },
        { element: document.querySelector('.host-container'), name: 'host container' },
        { element: document.documentElement, name: 'document' },
        { element: document.body, name: 'body' }
    ];
    
    for (const container of containers) {
        if (container.element) {
            const scrollTop = container.element.scrollTop;
            const scrollHeight = container.element.scrollHeight;
            const clientHeight = container.element.clientHeight;
            
            logger.debug(`Checking ${container.name}:`, { scrollTop, scrollHeight, clientHeight });
            
            // Check if this container is scrollable and has been scrolled
            if (scrollHeight > clientHeight && scrollTop > 0) {
                logger.debug(`Scrolling ${container.name} to top`);
                container.element.scrollTo({ top: 0, behavior: 'smooth' });
                scrolled = true;
                break;
            }
        }
    }
    
    // Fallback: always try window scroll as well
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



// Global font size control - much simpler!
let currentFontScale = 'medium';

export function toggleGlobalFontSize() {
    const scales = ['small', 'medium', 'large', 'xlarge'];
    const currentIndex = scales.indexOf(currentFontScale);
    const nextIndex = (currentIndex + 1) % scales.length;
    currentFontScale = scales[nextIndex];
    
    setGlobalFontSize(currentFontScale);
}

export function setGlobalFontSize(scale) {
    logger.debug('Setting global font size:', scale);
    
    // Use centralized font scale values from config
    const scaleValue = UI.FONT_SCALES[scale] || UI.FONT_SCALES.medium;
    
    // Update CSS custom property for global scaling - CSS utility classes handle the rest
    document.documentElement.style.setProperty('--global-font-scale', scaleValue);
    
    // Update the font size icon in the header
    const fontIcon = document.getElementById('font-size-icon');
    if (fontIcon) {
        const icons = {
            small: 'A⁻',
            medium: 'A', 
            large: 'A⁺',
            xlarge: 'A⁺⁺'
        };
        fontIcon.textContent = icons[scale] || 'A';
    }
    
    // Save preference to localStorage
    localStorage.setItem('globalFontSize', scale);
    currentFontScale = scale;
    
    logger.debug('Global font size updated via CSS custom properties:', { scale, scaleValue });
}


export function toggleTheme() {
    logger.debug('Global theme toggle function called');
    
    // First try to use app's settings manager
    if (window.app && window.app.settingsManager && typeof window.app.settingsManager.toggleTheme === 'function') {
        logger.debug('Using app.settingsManager.toggleTheme');
        window.app.settingsManager.toggleTheme();
    } else if (window.game && window.game.toggleTheme) {
        logger.debug('Using game.toggleTheme');
        window.game.toggleTheme();
    } else {
        // Fallback theme toggle implementation
        logger.debug('Using fallback theme toggle');
        const body = document.body;
        
        const currentTheme = body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        // Apply theme classes properly
        if (newTheme === 'dark') {
            body.classList.add('dark-theme');
            body.classList.remove('light-theme');
        } else {
            body.classList.add('light-theme');
            body.classList.remove('dark-theme');
        }
        
        body.setAttribute('data-theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        
        // Update all theme toggle buttons with correct icon logic
        const themeToggleButtons = [
            document.getElementById('theme-toggle'),
            document.getElementById('theme-toggle-mobile-header'),
            document.getElementById('theme-toggle-mobile'),
            document.getElementById('mobile-theme-toggle')
        ].filter(button => button !== null);
        
        themeToggleButtons.forEach(themeToggle => {
            if (themeToggle) {
                const iconSpan = themeToggle.querySelector('.control-icon');
                if (newTheme === 'dark') {
                    // In dark mode, show sun (indicates "switch to light")
                    if (iconSpan) {
                        iconSpan.textContent = '☀️';
                    } else {
                        themeToggle.textContent = '☀️';
                    }
                } else {
                    // In light mode, show moon (indicates "switch to dark")
                    if (iconSpan) {
                        iconSpan.textContent = '🌙';
                    } else {
                        themeToggle.textContent = '🌙';
                    }
                }
            }
        });
        
        // Save to quizSettings format for consistency with SettingsManager
        try {
            const savedSettings = JSON.parse(localStorage.getItem('quizSettings') || '{}');
            savedSettings.theme = newTheme;
            localStorage.setItem('quizSettings', JSON.stringify(savedSettings));
        } catch (error) {
            logger.warn('Failed to save theme to quizSettings:', error);
        }
        logger.debug('Theme switched to:', newTheme);
    }
}

// Auto-hide header functionality
let autoHideTimeout = null;
let isAutoHideEnabled = false;
let headerElement = null;
let hintElement = null;

export function initializeAutoHideToolbar() {
    logger.debug('Initializing auto-hide header functionality');
    
    headerElement = document.querySelector('header');
    if (!headerElement) {
        logger.warn('Header element not found for auto-hide initialization');
        return;
    }
    
    // Add auto-hide CSS classes - only to header and lobby screen
    headerElement.classList.add('auto-hide-enabled');
    document.body.classList.add('header-auto-hide-mode');
    const lobbyScreen = document.getElementById('game-lobby');
    if (lobbyScreen) {
        lobbyScreen.classList.add('header-auto-hide-active');
        logger.debug('Added header-auto-hide-active class to lobby screen');
    } else {
        logger.warn('Could not find #game-lobby element to add header-auto-hide-active class');
    }
    
    isAutoHideEnabled = true;
    
    // Create and initialize hint element
    createHintElement();
    
    // Initially hide the header and show hint
    hideToolbar();
    
    // Mouse move event listener for showing header
    document.addEventListener('mousemove', handleMouseMove);
    
    // Keyboard escape to show header
    document.addEventListener('keydown', handleKeyDown);
    
    // Prevent header from hiding when hovering over it
    headerElement.addEventListener('mouseenter', () => {
        if (autoHideTimeout) {
            clearTimeout(autoHideTimeout);
            autoHideTimeout = null;
        }
    });
    
    headerElement.addEventListener('mouseleave', (e) => {
        // Check if mouse is still within the safe zone before starting hide timer
        const safeZone = 120;
        
        // Only start hide timer if mouse moves significantly away from header
        if (e.clientY > safeZone) {
            startHideTimer();
        }
        // If mouse is still near the header area, don't hide yet
    });
    
    logger.debug('Auto-hide header initialized successfully');
}

function createHintElement() {
    // Remove existing hint if any
    const existingHint = document.querySelector('.header-hint');
    if (existingHint) {
        existingHint.remove();
    }
    
    // Create hint element
    hintElement = document.createElement('div');
    hintElement.className = 'header-hint';
    hintElement.innerHTML = '<span class="header-hint-icon">▼</span>Menu';
    
    // Add hint to document body
    document.body.appendChild(hintElement);
    
    // Add hover listeners to hint
    hintElement.addEventListener('mouseenter', () => {
        showToolbar();
        if (autoHideTimeout) {
            clearTimeout(autoHideTimeout);
            autoHideTimeout = null;
        }
    });
    
    hintElement.addEventListener('mouseleave', (e) => {
        // Use longer timeout for hint element to be more forgiving
        const safeZone = 120;
        if (e.clientY > safeZone) {
            startHideTimer();
        }
    });
    
    logger.debug('Header hint element created');
}

function handleMouseMove(e) {
    if (!isAutoHideEnabled || !headerElement) return;
    
    // Check if language dropdown is open - don't hide toolbar during dropdown interaction
    const languageDropdown = document.getElementById('language-selector');
    const isDropdownOpen = languageDropdown && languageDropdown.classList.contains('open');
    
    // Expanded trigger zone from 30px to 80px for easier access
    const showTriggerZone = 80;
    // Larger safe zone where toolbar won't hide (120px)
    const safeZone = 120;
    
    if (e.clientY <= showTriggerZone) {
        // Show toolbar when mouse enters trigger zone
        if (autoHideTimeout) {
            clearTimeout(autoHideTimeout);
            autoHideTimeout = null;
        }
        
        // Show immediately if not already visible
        if (!headerElement.classList.contains('visible')) {
            showToolbar();
        }
    } else if (e.clientY > safeZone) {
        // Only start hide timer if mouse moves outside the safe zone
        // AND dropdown is not open
        if (headerElement.classList.contains('visible') && !isDropdownOpen) {
            startHideTimer();
        }
    }
    // If mouse is between showTriggerZone and safeZone, do nothing (keep current state)
}

function handleKeyDown(e) {
    if (!isAutoHideEnabled || !headerElement) return;
    
    // Show header on Escape key
    if (e.key === 'Escape') {
        showToolbar();
        // Keep it visible for a longer time when summoned by keyboard
        if (autoHideTimeout) {
            clearTimeout(autoHideTimeout);
        }
        autoHideTimeout = setTimeout(hideToolbar, 5000); // 5 seconds
    }
}

function showToolbar() {
    if (!headerElement) return;
    
    headerElement.classList.add('visible');
    
    // Hide hint when header is visible
    if (hintElement) {
        hintElement.classList.remove('visible');
    }
    
    logger.debug('Header shown via auto-hide');
}

function hideToolbar() {
    if (!headerElement) return;
    
    headerElement.classList.remove('visible');
    
    // Show hint when header is hidden
    if (hintElement) {
        hintElement.classList.add('visible');
    }
    
    logger.debug('Header hidden via auto-hide');
    
    if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
        autoHideTimeout = null;
    }
}

function startHideTimer() {
    if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
    }
    
    // Check if language dropdown is open - don't hide toolbar during dropdown interaction
    const languageDropdown = document.getElementById('language-selector');
    const isDropdownOpen = languageDropdown && languageDropdown.classList.contains('open');
    
    // Only start hide timer if dropdown is not open
    if (!isDropdownOpen) {
        // Hide after 2 seconds for more comfortable interaction
        autoHideTimeout = setTimeout(hideToolbar, 2000);
    }
}

export function disableAutoHideToolbar() {
    if (!isAutoHideEnabled || !headerElement) return;
    
    logger.debug('Disabling auto-hide header');
    
    // Remove event listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('keydown', handleKeyDown);
    
    // Clear timeout
    if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
        autoHideTimeout = null;
    }
    
    // Remove CSS classes - header visibility will be managed by screen-specific logic
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
    
    logger.debug('Auto-hide header disabled and hidden');
}

export function isAutoHideToolbarActive() {
    return isAutoHideEnabled;
}

// Initialize floating back-to-top button behavior
function initializeBackToTopButton() {
    const backToTopBtn = document.getElementById('back-to-top-float');
    const editorBackToTopBtn = document.getElementById('back-to-top');
    const editorSection = document.querySelector('.quiz-editor-section');
    
    logger.debug('Initializing back-to-top buttons:', {
        floatingButton: !!backToTopBtn,
        editorButton: !!editorBackToTopBtn,
        editor: !!editorSection
    });
    
    if (editorSection) {
        logger.debug('Setting up scroll listener for back-to-top buttons');
        editorSection.addEventListener('scroll', () => {
            const scrollTop = editorSection.scrollTop;
            
            if (scrollTop > TIMING.SCROLL_THRESHOLD) {
                // Show floating button
                if (backToTopBtn && !backToTopBtn.classList.contains('show')) {
                    logger.debug('Showing floating back-to-top button');
                    backToTopBtn.style.display = 'flex';
                    backToTopBtn.classList.add('show');
                }
                // Show editor button
                if (editorBackToTopBtn && editorBackToTopBtn.style.display === 'none') {
                    logger.debug('Showing editor back-to-top button');
                    editorBackToTopBtn.style.display = 'flex';
                }
            } else {
                // Hide floating button
                if (backToTopBtn && backToTopBtn.classList.contains('show')) {
                    logger.debug('Hiding floating back-to-top button');
                    backToTopBtn.classList.remove('show');
                    setTimeout(() => {
                        if (!backToTopBtn.classList.contains('show')) {
                            backToTopBtn.style.display = 'none';
                        }
                    }, TIMING.ANIMATION_FADE_DURATION);
                }
                // Hide editor button
                if (editorBackToTopBtn) {
                    logger.debug('Hiding editor back-to-top button');
                    editorBackToTopBtn.style.display = 'none';
                }
            }
        });
        
        // Also listen to window scroll as fallback for both buttons
        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            // Handle floating button
            if (backToTopBtn) {
                if (scrollTop > TIMING.SCROLL_THRESHOLD) {
                    backToTopBtn.style.display = 'flex';
                    backToTopBtn.classList.add('show');
                } else {
                    backToTopBtn.classList.remove('show');
                    setTimeout(() => {
                        if (!backToTopBtn.classList.contains('show')) {
                            backToTopBtn.style.display = 'none';
                        }
                    }, TIMING.ANIMATION_FADE_DURATION);
                }
            }
            
            // Handle editor button with window scroll fallback
            if (editorBackToTopBtn) {
                if (scrollTop > TIMING.SCROLL_THRESHOLD) {
                    editorBackToTopBtn.style.display = 'flex';
                } else {
                    editorBackToTopBtn.style.display = 'none';
                }
            }
        });
    } else {
        logger.warn('Editor section not found for back-to-top button initialization');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBackToTopButton);
} else {
    initializeBackToTopButton();
}

// Global function registry - consolidated approach to reduce namespace pollution
const globalFunctions = {
    // Language functions
    toggleLanguageDropdown,
    selectLanguage,
    changeLanguage: (langCode) => translationManager.changeLanguage(langCode),
    
    // UI control functions
    togglePreviewMode,
    toggleToolbar,
    toggleTheme,
    
    // Font and spacing functions
    toggleGlobalFontSize,
    setGlobalFontSize,
    
    // Question and content functions
    updateQuestionType,
    updateTimeLimit,
    uploadImage,
    removeImage,
    removeQuestion,
    
    // Navigation functions
    scrollToCurrentQuestion,
    scrollToTop,
    
    
    // Modal functions
    openAIGeneratorModal,
    
    // Time functions
    toggleGlobalTime
};

// Single global dispatcher function - reduces 18 global assignments to 1
window.QM = function(functionName, ...args) {
    if (globalFunctions[functionName]) {
        return globalFunctions[functionName](...args);
    } else {
        logger.error(`Global function '${functionName}' not found`);
    }
};

// Expose the function registry for debugging
window.QM.functions = globalFunctions;

/**
 * Return to main menu from mobile header
 * This function is called from HTML onclick in mobile header
 */
export function returnToMainFromHeader() {
    logger.debug('📱 Mobile header: Return to main menu clicked');
    if (window.game && window.game.uiManager) {
        window.game.uiManager.showScreen('main-menu');
    } else {
        // Fallback: direct navigation
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => screen.style.display = 'none');
        const mainMenu = document.getElementById('main-menu');
        if (mainMenu) {
            mainMenu.style.display = 'block';
        }
    }
}

/**
 * Update mobile and desktop header return button visibility
 * Shows buttons on all screens except main menu
 */
export function updateMobileReturnButtonVisibility(currentScreen) {
    const mobileReturnButton = document.getElementById('mobile-return-to-main');
    const desktopReturnButton = document.getElementById('desktop-return-to-main');
    const shouldShow = currentScreen !== 'main-menu' && currentScreen !== '';
    
    if (mobileReturnButton) {
        mobileReturnButton.style.display = shouldShow ? 'flex' : 'none';
        logger.debug(`📱 Mobile return button: ${shouldShow ? 'shown' : 'hidden'} for screen: ${currentScreen}`);
    }
    
    if (desktopReturnButton) {
        desktopReturnButton.style.display = shouldShow ? 'inline-block' : 'none';
        logger.debug(`💻 Desktop return button: ${shouldShow ? 'shown' : 'hidden'} for screen: ${currentScreen}`);
    }
}

// REQUIRED GLOBAL ASSIGNMENTS: Essential functions with specific usage patterns
// These assignments are required and SHOULD NOT be removed without careful analysis

// === HTML onclick/onchange handlers (CRITICAL) ===
// These functions are called directly from HTML elements and MUST remain global
window.toggleGlobalFontSize = toggleGlobalFontSize;       // HTML onclick
window.toggleTheme = toggleTheme;                         // HTML onclick  
window.scrollToTop = scrollToTop;                         // HTML onclick
window.removeImage = removeImage;                         // HTML onclick
window.togglePreviewMode = togglePreviewMode;             // HTML onclick
window.scrollToCurrentQuestion = scrollToCurrentQuestion; // HTML onclick
window.selectLanguage = selectLanguage;                   // HTML onclick
window.updateQuestionType = updateQuestionType;           // HTML onchange
window.updateTimeLimit = updateTimeLimit;                 // HTML onchange
window.returnToMainFromHeader = returnToMainFromHeader;   // HTML onclick

// === Cross-module communication (REQUIRED) ===
// These functions are accessed by other JS modules and need global availability
window.setGlobalFontSize = setGlobalFontSize;            // Used by main.js, split-layout-manager.js

// === Legacy/Internal functions (MAINTAIN FOR COMPATIBILITY) ===
// These may have internal usage patterns or provide fallback functionality
window.toggleLanguageDropdown = toggleLanguageDropdown;   // Internal/fallback usage
window.openAIGeneratorModal = openAIGeneratorModal;       // Lazy-loaded AI functionality
window.uploadImage = uploadImage;                         // Internal usage
window.removeQuestion = removeQuestion;                   // Internal usage