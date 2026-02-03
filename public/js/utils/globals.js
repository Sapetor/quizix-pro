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
import { updateEditorQuestionCount } from './editor-question-count.js';
import { openModal } from './modal-utils.js';
import { dom } from './dom.js';

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
    const modal = dom.get(modalId);
    if (modal) {
        logger.debug(`Opening ${modalId} directly as fallback`);
        openModal(modal);
    } else {
        logger.error(`${modalId} DOM element not found`);
    }
}

// ============================================================================
// Toolbar and Time Functions
// ============================================================================

export function toggleToolbar() {
    logger.debug('Horizontal toolbar toggle function called');
    const toolbar = dom.get('horizontal-toolbar');
    if (toolbar) {
        const isVisible = toolbar.style.display !== 'none' && toolbar.style.display !== '';
        toolbar.style.display = isVisible ? 'none' : 'flex';
    }
}

export function toggleGlobalTime() {
    logger.debug('Global time toggle function called');
    const globalTimeContainer = dom.get('global-time-container');
    const useGlobalTime = dom.get('use-global-time');
    const globalTimeLimit = dom.get('global-time-limit');

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

        // If enabling global time, sync all question times to the global value
        if (isEnabled && globalTimeLimit) {
            const globalValue = parseInt(globalTimeLimit.value);
            // Validate bounds before applying to all questions
            if (!isNaN(globalValue) && globalValue >= LIMITS.MIN_TIME_LIMIT && globalValue <= LIMITS.MAX_TIME_LIMIT) {
                input.value = globalValue;
            }
        }
    });

    logger.debug('Global time enabled:', isEnabled, 'Value:', globalTimeLimit?.value);
}

export function updateGlobalTime(inputElement) {
    logger.debug('Global time value changed:', inputElement.value);
    const value = parseInt(inputElement.value);

    // Enforce limits
    if (value < LIMITS.MIN_TIME_LIMIT) inputElement.value = LIMITS.MIN_TIME_LIMIT;
    if (value > LIMITS.MAX_TIME_LIMIT) inputElement.value = LIMITS.MAX_TIME_LIMIT;

    const useGlobalTime = dom.get('use-global-time');

    // If global time is enabled, update all question time inputs to match
    if (useGlobalTime?.checked) {
        const finalValue = parseInt(inputElement.value);
        // Only update if value is valid and within bounds
        if (!isNaN(finalValue) && finalValue >= LIMITS.MIN_TIME_LIMIT && finalValue <= LIMITS.MAX_TIME_LIMIT) {
            document.querySelectorAll('.question-time-limit').forEach(input => {
                input.value = finalValue;
            });
            logger.debug('Updated all question times to:', finalValue);
        }
    }
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
// Question Collapse/Expand
// ============================================================================

export function toggleQuestionCollapse(questionItem) {
    // Disable collapse in always-preview mode (desktop) - questions are paginated instead
    const hostContainer = dom.get('host-container');
    if (hostContainer?.classList.contains('always-preview')) {
        return; // No collapse in pagination mode
    }

    questionItem.classList.toggle('collapsed');
    updateCollapsedMeta(questionItem);
}

function updateCollapsedMeta(questionItem) {
    const typeSelect = questionItem.querySelector('.question-type');
    const diffSelect = questionItem.querySelector('.question-difficulty');
    const typeBadge = questionItem.querySelector('.collapsed-type-badge');
    const diffBadge = questionItem.querySelector('.collapsed-difficulty-badge');

    if (typeBadge && typeSelect) {
        const typeText = typeSelect.options[typeSelect.selectedIndex]?.text || '';
        // Abbreviate: "Multiple Choice" -> "Multiple", "True/False" -> "T/F"
        const abbrev = typeText.includes('/') ? 'T/F' : typeText.split(' ')[0].substring(0, 8);
        typeBadge.textContent = abbrev;
    }
    if (diffBadge && diffSelect) {
        // Show first letter: Easy->E, Medium->M, Hard->H
        diffBadge.textContent = diffSelect.value?.charAt(0).toUpperCase() || 'M';
    }
}

// ============================================================================
// Question Pagination (Desktop Editor)
// ============================================================================

let currentEditingQuestion = 0;

export function goToPreviousQuestion() {
    const questionsContainer = dom.get('questions-container');
    if (!questionsContainer) return;

    if (currentEditingQuestion > 0) {
        currentEditingQuestion--;
        showQuestion(currentEditingQuestion);
    }
}

export function goToNextQuestion() {
    const questionsContainer = dom.get('questions-container');
    if (!questionsContainer) return;

    const questionItems = questionsContainer.querySelectorAll('.question-item');
    const total = questionItems.length;
    if (currentEditingQuestion < total - 1) {
        currentEditingQuestion++;
        showQuestion(currentEditingQuestion);
    }
}

export function showQuestion(index) {
    const questionsContainer = dom.get('questions-container');
    if (!questionsContainer) return;

    const questionItems = questionsContainer.querySelectorAll('.question-item');
    const total = questionItems.length;

    // Clamp index to valid range
    index = Math.max(0, Math.min(index, total - 1));
    currentEditingQuestion = index;

    // Hide all questions, show only current
    questionItems.forEach((q, i) => {
        if (i === index) {
            q.classList.add('active-question');
        } else {
            q.classList.remove('active-question');
        }
    });

    // Update pagination UI
    updatePaginationUI(index, total);

    // Sync preview to same question
    if (window.game?.previewManager) {
        window.game.previewManager.currentPreviewQuestion = index;
        window.game.previewManager.updateSplitPreview?.();
    }

    logger.debug(`Showing question ${index + 1} of ${total}`);
}

export function updatePaginationUI(index, total) {
    const prevBtn = dom.get('prev-question-btn');
    const nextBtn = dom.get('next-question-btn');
    const currentNum = dom.get('current-question-num');
    const totalNum = dom.get('total-question-num');

    if (prevBtn) prevBtn.disabled = index <= 0;
    if (nextBtn) nextBtn.disabled = index >= total - 1;
    if (currentNum) currentNum.textContent = index + 1;
    if (totalNum) totalNum.textContent = total;
}

/**
 * Navigate to newly added question
 */
export function navigateToNewQuestion() {
    const questionsContainer = dom.get('questions-container');
    if (!questionsContainer) return;

    const questionItems = questionsContainer.querySelectorAll('.question-item');
    const newIndex = questionItems.length - 1;
    if (newIndex >= 0) {
        showQuestion(newIndex);
    }
}

/**
 * Handle question removal - adjust pagination
 */
export function handleQuestionRemoved() {
    const questionsContainer = dom.get('questions-container');
    if (!questionsContainer) return;

    const questionItems = questionsContainer.querySelectorAll('.question-item');
    const total = questionItems.length;

    // If current question was removed, adjust index
    if (currentEditingQuestion >= total) {
        currentEditingQuestion = Math.max(0, total - 1);
    }

    // Show the adjusted question
    if (total > 0) {
        showQuestion(currentEditingQuestion);
    } else {
        updatePaginationUI(0, 0);
    }
}

/**
 * Get current editing question index
 */
export function getCurrentEditingQuestion() {
    return currentEditingQuestion;
}

/**
 * Initialize pagination on host screen (desktop only)
 */
export function initializeQuestionPagination() {
    const hostContainer = dom.get('host-container');
    const questionsContainer = dom.get('questions-container');

    if (!hostContainer || !questionsContainer) return;

    // Check if desktop (min-width: 769px)
    if (window.innerWidth < 769) return;

    const questionItems = questionsContainer.querySelectorAll('.question-item');
    const total = questionItems.length;

    if (total > 0) {
        // Show first question
        showQuestion(0);
    }

    // Add keyboard navigation (arrow keys)
    setupPaginationKeyboardNav();

    logger.debug('Question pagination initialized');
}

/**
 * Setup keyboard navigation for question pagination
 */
function setupPaginationKeyboardNav() {
    document.addEventListener('keydown', handlePaginationKeyNav);
}

function handlePaginationKeyNav(e) {
    // Only handle when on host screen and not in an input/textarea
    const hostScreen = dom.get('host-screen');
    if (!hostScreen?.classList.contains('active')) return;

    const activeElement = document.activeElement;
    const isTyping = activeElement?.tagName === 'INPUT' ||
                     activeElement?.tagName === 'TEXTAREA' ||
                     activeElement?.isContentEditable;

    if (isTyping) return;

    // Check for settings modal open
    const settingsModal = dom.get('quiz-settings-modal');
    if (settingsModal?.classList.contains('visible')) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPreviousQuestion();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToNextQuestion();
    }
}

// ============================================================================
// Quiz Settings Modal Functions
// ============================================================================

export function openQuizSettingsModal() {
    const modal = dom.get('quiz-settings-modal');
    if (!modal) return;

    // Sync modal values from inline settings
    syncSettingsToModal();

    modal.classList.add('visible');

    // Close on Escape key
    document.addEventListener('keydown', handleSettingsModalEscape);

    // Close on overlay click
    modal.addEventListener('click', handleSettingsModalOverlayClick);
}

export function closeQuizSettingsModal() {
    const modal = dom.get('quiz-settings-modal');
    if (!modal) return;

    // Sync modal values back to inline settings
    syncSettingsFromModal();

    modal.classList.remove('visible');

    // Remove event listeners
    document.removeEventListener('keydown', handleSettingsModalEscape);
    modal.removeEventListener('click', handleSettingsModalOverlayClick);
}

function handleSettingsModalEscape(e) {
    if (e.key === 'Escape') {
        closeQuizSettingsModal();
    }
}

function handleSettingsModalOverlayClick(e) {
    if (e.target.id === 'quiz-settings-modal') {
        closeQuizSettingsModal();
    }
}

export function toggleConsensusModeModal() {
    const consensusMode = dom.get('modal-consensus-mode');
    const consensusSettings = dom.get('modal-consensus-settings');

    if (!consensusMode || !consensusSettings) return;

    consensusSettings.classList.toggle('hidden', !consensusMode.checked);
}

export function toggleGlobalTimeModal() {
    const useGlobalTime = dom.get('modal-use-global-time');
    const globalTimeContainer = dom.get('modal-global-time-container');

    if (!useGlobalTime || !globalTimeContainer) return;

    globalTimeContainer.style.display = useGlobalTime.checked ? 'block' : 'none';
}

function syncSettingsToModal() {
    // General options
    syncCheckbox('randomize-questions', 'modal-randomize-questions');
    syncCheckbox('randomize-answers', 'modal-randomize-answers');
    syncCheckbox('use-global-time', 'modal-use-global-time');
    syncInput('global-time-limit', 'modal-global-time-limit');

    // Update global time container visibility
    const useGlobalTime = dom.get('modal-use-global-time');
    const globalTimeContainer = dom.get('modal-global-time-container');
    if (useGlobalTime && globalTimeContainer) {
        globalTimeContainer.style.display = useGlobalTime.checked ? 'block' : 'none';
    }

    // Advanced options
    syncCheckbox('manual-advancement', 'modal-manual-advancement');
    syncCheckbox('enable-power-ups', 'modal-enable-power-ups');
    syncCheckbox('consensus-mode', 'modal-consensus-mode');
    syncInput('consensus-threshold', 'modal-consensus-threshold');
    syncInput('discussion-time', 'modal-discussion-time');
    syncCheckbox('allow-chat', 'modal-allow-chat');

    // Update consensus settings visibility
    const consensusMode = dom.get('modal-consensus-mode');
    const consensusSettings = dom.get('modal-consensus-settings');
    if (consensusMode && consensusSettings) {
        consensusSettings.classList.toggle('hidden', !consensusMode.checked);
    }

    // Scoring options
    syncCheckbox('time-bonus-enabled', 'modal-time-bonus-enabled');
    syncCheckbox('show-score-breakdown', 'modal-show-score-breakdown');
    syncInput('easy-multiplier', 'modal-easy-multiplier');
    syncInput('medium-multiplier', 'modal-medium-multiplier');
    syncInput('hard-multiplier', 'modal-hard-multiplier');
}

function syncSettingsFromModal() {
    // General options
    syncCheckbox('modal-randomize-questions', 'randomize-questions');
    syncCheckbox('modal-randomize-answers', 'randomize-answers');
    syncCheckbox('modal-use-global-time', 'use-global-time');
    syncInput('modal-global-time-limit', 'global-time-limit');

    // Trigger global time toggle on inline settings
    const useGlobalTime = dom.get('use-global-time');
    if (useGlobalTime) {
        const event = new Event('change');
        useGlobalTime.dispatchEvent(event);
    }

    // Advanced options
    syncCheckbox('modal-manual-advancement', 'manual-advancement');
    syncCheckbox('modal-enable-power-ups', 'enable-power-ups');
    syncCheckbox('modal-consensus-mode', 'consensus-mode');
    syncInput('modal-consensus-threshold', 'consensus-threshold');
    syncInput('modal-discussion-time', 'discussion-time');
    syncCheckbox('modal-allow-chat', 'allow-chat');

    // Scoring options
    syncCheckbox('modal-time-bonus-enabled', 'time-bonus-enabled');
    syncCheckbox('modal-show-score-breakdown', 'show-score-breakdown');
    syncInput('modal-easy-multiplier', 'easy-multiplier');
    syncInput('modal-medium-multiplier', 'medium-multiplier');
    syncInput('modal-hard-multiplier', 'hard-multiplier');
}

function syncCheckbox(fromId, toId) {
    const from = dom.get(fromId);
    const to = dom.get(toId);
    if (from && to) {
        to.checked = from.checked;
    }
}

function syncInput(fromId, toId) {
    const from = dom.get(fromId);
    const to = dom.get(toId);
    if (from && to) {
        to.value = from.value;
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
    const questionsContainer = dom.get('questions-container');
    const newCount = questionsContainer ? questionsContainer.children.length : 0;
    document.dispatchEvent(new CustomEvent('questionRemoved', {
        detail: { questionCount: newCount }
    }));

    // Handle pagination after removal (desktop only)
    if (window.innerWidth >= 769) {
        handleQuestionRemoved();
    }
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
    const fontIcon = dom.get('font-size-icon');
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
        const button = dom.get(id);
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
    const mainMenu = dom.get('main-menu');
    if (mainMenu) {
        mainMenu.style.display = 'block';
    }
}

/**
 * Update mobile and desktop header return button visibility
 */
export function updateMobileReturnButtonVisibility(currentScreen) {
    const mobileReturnButton = dom.get('mobile-return-to-main');
    const desktopReturnButton = dom.get('desktop-return-to-main');
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
    selectLanguage: (langCode) => import('./language-dropdown-manager.js').then(m => m.selectLanguage(langCode, window.event)),
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
    toggleQuestionCollapse,
    updateEditorQuestionCount,
    initializeEditorQuestionCount,

    // Question pagination (desktop editor)
    goToPreviousQuestion,
    goToNextQuestion,
    showQuestion,
    initializeQuestionPagination,
    navigateToNewQuestion,
    handleQuestionRemoved,

    // Navigation functions
    scrollToCurrentQuestion,
    scrollToTop: () => import('./back-to-top-manager.js').then(m => m.scrollToTop()),

    // Modal functions
    openAIGeneratorModal,
    openQuizSettingsModal,
    closeQuizSettingsModal,

    // Time functions
    toggleGlobalTime,
    updateGlobalTime,
    toggleGlobalTimeModal
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
window.updateGlobalTime = updateGlobalTime;
window.returnToMainFromHeader = returnToMainFromHeader;

// Question pagination (desktop editor)
window.goToPreviousQuestion = goToPreviousQuestion;
window.goToNextQuestion = goToNextQuestion;
window.showQuestion = showQuestion;
window.initializeQuestionPagination = initializeQuestionPagination;
window.navigateToNewQuestion = navigateToNewQuestion;
window.handleQuestionRemoved = handleQuestionRemoved;

// Quiz settings modal
window.openQuizSettingsModal = openQuizSettingsModal;
window.closeQuizSettingsModal = closeQuizSettingsModal;
window.toggleGlobalTimeModal = toggleGlobalTimeModal;
window.toggleConsensusModeModal = toggleConsensusModeModal;

// Cross-module communication
window.setGlobalFontSize = setGlobalFontSize;

// Legacy/internal functions
window.openAIGeneratorModal = openAIGeneratorModal;
window.uploadImage = uploadImage;
window.removeQuestion = removeQuestion;
window.toggleQuestionCollapse = toggleQuestionCollapse;
