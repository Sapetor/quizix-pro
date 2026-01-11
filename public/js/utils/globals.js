/**
 * Global Functions Module
 * Provides global functions that are called from HTML onclick handlers
 *
 * This module serves as the critical bridge between HTML and modular JS.
 * Functions here MUST remain globally accessible due to direct HTML usage.
 *
 * Specialized functionality has been extracted to dedicated managers:
 * - language-dropdown-manager.js: Language selection and dropdown positioning
 * - auto-hide-toolbar-manager.js: Header auto-hide during gameplay
 * - back-to-top-manager.js: Scroll-based button visibility
 * - editor-question-count.js: Question count tracking
 */

import { logger, LIMITS, UI } from '../core/config.js';
import { translationManager } from './translation-manager.js';
import { setItem, getJSON, setJSON } from './storage-utils.js';

// Re-export from specialized managers for backward compatibility
export {
    toggleLanguageDropdown,
    selectLanguage,
    initializeDropdownListeners
} from './language-dropdown-manager.js';

export {
    initializeAutoHideToolbar,
    disableAutoHideToolbar,
    isAutoHideToolbarActive
} from './auto-hide-toolbar-manager.js';

export {
    scrollToTop,
    initializeBackToTopButton
} from './back-to-top-manager.js';

export {
    updateEditorQuestionCount,
    initializeEditorQuestionCount
} from './editor-question-count.js';

// ============================================================================
// Preview and Modal Functions
// ============================================================================

export function togglePreviewMode() {
    logger.debug('Preview mode toggle function called');

    const previewManager = window.game?.previewManager;
    if (previewManager?.togglePreviewMode) {
        previewManager.togglePreviewMode();
    } else if (window.game?.togglePreviewMode) {
        window.game.togglePreviewMode();
    } else {
        logger.debug('Preview mode not available');
    }
}

export async function openAIGeneratorModal() {
    logger.debug('AI Generator modal function called');

    if (window.game?.openAIGeneratorModal) {
        try {
            await window.game.openAIGeneratorModal();
        } catch (error) {
            logger.error('Failed to open AI Generator modal:', error);
            openModalFallback('ai-generator-modal');
        }
    } else {
        logger.warn('Game not properly initialized, using fallback');
        openModalFallback('ai-generator-modal');
    }
}

function openModalFallback(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        logger.debug(`Opening ${modalId} directly as fallback`);
        modal.style.display = 'flex';
    } else {
        logger.error(`${modalId} DOM element not found`);
    }
}

// ============================================================================
// Toolbar and Time Functions
// ============================================================================

export function toggleToolbar() {
    logger.debug('Horizontal toolbar toggle function called');
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

    if (!globalTimeContainer || !useGlobalTime) {
        logger.debug('Global time elements not found');
        return;
    }

    const isEnabled = useGlobalTime.checked;
    globalTimeContainer.style.display = isEnabled ? 'block' : 'none';
    logger.debug('Global time container display set to:', isEnabled ? 'block' : 'none');

    // Update individual question time inputs
    document.querySelectorAll('.question-time-limit').forEach(input => {
        const container = input.closest('.time-limit-container');
        if (container) {
            container.style.display = isEnabled ? 'none' : 'block';
        }
    });
}

// ============================================================================
// Question Type and Editor Functions
// ============================================================================

export function updateQuestionType(selectElement) {
    logger.debug('Question type update function called');

    if (window.game?.updateQuestionType) {
        window.game.updateQuestionType(selectElement);
        return;
    }

    // Fallback implementation
    const questionItem = selectElement.closest('.question-item');
    if (!questionItem) {
        logger.warn('updateQuestionType: Could not find parent question-item');
        return;
    }

    const questionType = selectElement.value;
    if (!questionType) {
        logger.warn('updateQuestionType: No question type selected');
        return;
    }

    // Hide all option types, show selected
    questionItem.querySelectorAll('.answer-options').forEach(opt => {
        opt.style.display = 'none';
    });

    const targetOptions = questionItem.querySelector(`.${questionType}-options`);
    if (targetOptions) {
        targetOptions.style.display = 'block';
    } else {
        logger.warn(`updateQuestionType: Could not find options for type '${questionType}'`);
    }
}

export function updateTimeLimit(inputElement) {
    logger.debug('Time limit update function called');
    const value = parseInt(inputElement.value);
    if (value < LIMITS.MIN_TIME_LIMIT) inputElement.value = LIMITS.MIN_TIME_LIMIT;
    if (value > LIMITS.MAX_TIME_LIMIT) inputElement.value = LIMITS.MAX_TIME_LIMIT;
}

export function scrollToCurrentQuestion() {
    logger.debug('Scroll to current question function called');

    if (window.game?.previewManager?.scrollToCurrentQuestion) {
        window.game.previewManager.scrollToCurrentQuestion();
        return;
    }

    // Fallback: scroll to first question
    const firstQuestion = document.querySelector('.question-item');
    if (firstQuestion) {
        firstQuestion.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ============================================================================
// Image and Question Management
// ============================================================================

export function uploadImage(inputElement) {
    logger.debug('Image upload function called');
    if (window.game?.uploadImage) {
        window.game.uploadImage(inputElement);
    } else {
        logger.debug('Image upload not implemented');
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
    if (!questionItem) return;

    questionItem.remove();

    // Update questions UI
    if (window.game?.quizManager?.updateQuestionsUI) {
        window.game.quizManager.updateQuestionsUI();
    }

    // Dispatch event for question count update
    const questionsContainer = document.getElementById('questions-container');
    const newCount = questionsContainer ? questionsContainer.children.length : 0;
    document.dispatchEvent(new CustomEvent('questionRemoved', {
        detail: { questionCount: newCount }
    }));
}

// ============================================================================
// Font Size Functions
// ============================================================================

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

    const scaleValue = UI.FONT_SCALES[scale] || UI.FONT_SCALES.medium;
    document.documentElement.style.setProperty('--global-font-scale', scaleValue);

    // Update font size icon
    const fontIcon = document.getElementById('font-size-icon');
    if (fontIcon) {
        const icons = { small: 'A\u207b', medium: 'A', large: 'A\u207a', xlarge: 'A\u207a\u207a' };
        fontIcon.textContent = icons[scale] || 'A';
    }

    // Save preference
    setItem('globalFontSize', scale);
    currentFontScale = scale;

    logger.debug('Global font size updated:', { scale, scaleValue });
}

// ============================================================================
// Theme Functions
// ============================================================================

export function toggleTheme() {
    logger.debug('Global theme toggle function called');

    // Try settings manager first
    if (window.app?.settingsManager?.toggleTheme) {
        window.app.settingsManager.toggleTheme();
        return;
    }

    if (window.game?.toggleTheme) {
        window.game.toggleTheme();
        return;
    }

    // Fallback implementation
    applyThemeFallback();
}

function applyThemeFallback() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    // Apply theme classes
    body.classList.toggle('dark-theme', newTheme === 'dark');
    body.classList.toggle('light-theme', newTheme === 'light');
    body.setAttribute('data-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);

    // Update all theme toggle buttons
    const themeIcon = newTheme === 'dark' ? '\ud83c\udf19' : '\u2600\ufe0f';
    const themeButtons = [
        'theme-toggle',
        'theme-toggle-mobile-header',
        'theme-toggle-mobile',
        'mobile-theme-toggle'
    ];

    themeButtons.forEach(id => {
        const button = document.getElementById(id);
        if (!button) return;

        const iconSpan = button.querySelector('.control-icon');
        if (iconSpan) {
            iconSpan.textContent = themeIcon;
        } else {
            button.textContent = themeIcon;
        }
    });

    // Save to localStorage
    const savedSettings = getJSON('quizSettings', {});
    savedSettings.theme = newTheme;
    setJSON('quizSettings', savedSettings);

    logger.debug('Theme switched to:', newTheme);
}

// ============================================================================
// Navigation Functions
// ============================================================================

/**
 * Return to main menu from mobile header
 */
export function returnToMainFromHeader() {
    logger.debug('Mobile header: Return to main menu clicked');

    if (window.game?.uiManager) {
        window.game.uiManager.showScreen('main-menu');
        return;
    }

    // Fallback: direct navigation
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    const mainMenu = document.getElementById('main-menu');
    if (mainMenu) {
        mainMenu.style.display = 'block';
    }
}

/**
 * Update mobile and desktop header return button visibility
 */
export function updateMobileReturnButtonVisibility(currentScreen) {
    const mobileReturnButton = document.getElementById('mobile-return-to-main');
    const desktopReturnButton = document.getElementById('desktop-return-to-main');
    const shouldShow = currentScreen !== 'main-menu' && currentScreen !== '';

    if (mobileReturnButton) {
        mobileReturnButton.style.display = shouldShow ? 'flex' : 'none';
        logger.debug(`Mobile return button: ${shouldShow ? 'shown' : 'hidden'} for screen: ${currentScreen}`);
    }

    if (desktopReturnButton) {
        desktopReturnButton.style.display = shouldShow ? 'inline-block' : 'none';
        logger.debug(`Desktop return button: ${shouldShow ? 'shown' : 'hidden'} for screen: ${currentScreen}`);
    }
}

// ============================================================================
// Data-onclick Event Delegation
// ============================================================================

document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-onclick]');
    if (target) {
        const functionName = target.getAttribute('data-onclick');
        if (window[functionName] && typeof window[functionName] === 'function') {
            event.preventDefault();
            window[functionName]();
        }
    }
});

// ============================================================================
// Initialization
// ============================================================================

// Import initializers from specialized modules
import { initializeDropdownListeners } from './language-dropdown-manager.js';
import { initializeBackToTopButton } from './back-to-top-manager.js';
import { initializeEditorQuestionCount } from './editor-question-count.js';

function initializeGlobals() {
    initializeDropdownListeners();
    initializeBackToTopButton();
    initializeEditorQuestionCount();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGlobals);
} else {
    initializeGlobals();
}

// ============================================================================
// Global Function Registry
// ============================================================================

const globalFunctions = {
    // Language functions (from language-dropdown-manager)
    toggleLanguageDropdown: () => import('./language-dropdown-manager.js').then(m => m.toggleLanguageDropdown()),
    selectLanguage: (langCode) => import('./language-dropdown-manager.js').then(m => m.selectLanguage(langCode, event)),
    changeLanguage: (langCode) => translationManager.changeLanguage(langCode),

    // UI control functions
    togglePreviewMode,
    toggleToolbar,
    toggleTheme,

    // Font functions
    toggleGlobalFontSize,
    setGlobalFontSize,

    // Question functions
    updateQuestionType,
    updateTimeLimit,
    uploadImage,
    removeImage,
    removeQuestion,
    updateEditorQuestionCount,
    initializeEditorQuestionCount,

    // Navigation functions
    scrollToCurrentQuestion,
    scrollToTop: () => import('./back-to-top-manager.js').then(m => m.scrollToTop()),

    // Modal functions
    openAIGeneratorModal,

    // Time functions
    toggleGlobalTime
};

// Single global dispatcher function
window.QM = function(functionName, ...args) {
    if (globalFunctions[functionName]) {
        return globalFunctions[functionName](...args);
    } else {
        logger.error(`Global function '${functionName}' not found`);
    }
};
window.QM.functions = globalFunctions;

// ============================================================================
// Window Global Assignments (Required for HTML onclick handlers)
// ============================================================================

// HTML onclick/onchange handlers
window.toggleGlobalFontSize = toggleGlobalFontSize;
window.toggleTheme = toggleTheme;
window.removeImage = removeImage;
window.togglePreviewMode = togglePreviewMode;
window.scrollToCurrentQuestion = scrollToCurrentQuestion;
window.updateQuestionType = updateQuestionType;
window.updateTimeLimit = updateTimeLimit;
window.returnToMainFromHeader = returnToMainFromHeader;

// Cross-module communication
window.setGlobalFontSize = setGlobalFontSize;

// Legacy/internal functions
window.openAIGeneratorModal = openAIGeneratorModal;
window.uploadImage = uploadImage;
window.removeQuestion = removeQuestion;
