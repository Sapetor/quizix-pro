/**
 * Quizix Pro Application Entry Point
 * Initializes the modular application
 */

import { QuizGame } from './core/app.js';
import { translationManager } from './utils/translation-manager.js';
import { unifiedErrorHandler as errorBoundary } from './utils/unified-error-handler.js';
import { logger } from './core/config.js';
import { getItem } from './utils/storage-utils.js';
import { isMobile } from './utils/dom.js';
import './utils/globals.js'; // Import globals to make them available
import { browserOptimizer } from './utils/browser-optimizer.js'; // Browser-specific optimizations
import { contentDensityManager } from './utils/content-density-manager.js'; // Smart content spacing and sizing
import { mobileLayoutManager } from './utils/mobile-layout-manager.js'; // Smart mobile layout for different content types
import './utils/mobile-enhancements.js'; // Mobile UX enhancements and touch interactions
import './utils/mobile-carousel.js'; // Airbnb-style mobile carousel for main menu
import './utils/main-menu-carousel.js'; // Main menu preview carousel
import './utils/mobile-quiz-controls.js'; // Mobile quiz management controls (FAB and bottom sheet)
import './utils/mobile-question-carousel.js'; // Mobile question carousel for quiz editor
import { onboardingTutorial } from './utils/onboarding-tutorial.js'; // First-time user onboarding

/**
 * Update language dropdown display to show the currently selected language
 * @param {string} languageCode - Current language code (e.g., 'en', 'es', 'fr')
 */
function updateLanguageDropdownDisplay(languageCode) {
    try {
        // Update all language selectors (desktop, mobile bottom, mobile header)
        const desktopDropdown = document.getElementById('language-selector');
        const mobileDropdown = document.getElementById('mobile-language-selector');
        const mobileHeaderDropdown = document.getElementById('mobile-language-selector-header');

        const dropdowns = [desktopDropdown, mobileDropdown, mobileHeaderDropdown].filter(d => d);

        if (dropdowns.length === 0) {
            logger.debug('No language dropdowns found during initialization');
            return;
        }

        dropdowns.forEach(dropdown => {
            const selectedFlag = dropdown.querySelector('.language-dropdown-selected .language-flag');
            const selectedName = dropdown.querySelector('.language-dropdown-selected .language-name');
            const optionElement = dropdown.querySelector(`[data-value="${languageCode}"]`);

            if (selectedFlag && selectedName && optionElement) {
                const optionFlag = optionElement.querySelector('.language-flag');
                const optionName = optionElement.querySelector('.language-name');

                if (optionFlag && optionName) {
                    // Update displayed flag and name
                    selectedFlag.textContent = optionFlag.textContent;
                    selectedName.textContent = optionName.textContent;

                    // Update translation key if present
                    const translateKey = optionName.getAttribute('data-translate');
                    if (translateKey) {
                        selectedName.setAttribute('data-translate', translateKey);
                    }

                    // Update selected state in options
                    dropdown.querySelectorAll('.language-option').forEach(option => {
                        option.classList.remove('selected');
                    });
                    optionElement.classList.add('selected');
                }
            }
        });

        logger.debug(`Updated all language dropdown displays to: ${languageCode}`);
    } catch (error) {
        logger.error('Error updating language dropdown display:', error);
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    logger.debug('Quizix Pro - Initializing modular application...');

    // FOUC Prevention: Apply saved font size immediately (should already be done in HTML head)
    const savedFontSize = getItem('globalFontSize', 'medium');
    if (window.setGlobalFontSize) {
        window.setGlobalFontSize(savedFontSize);
    }

    await errorBoundary.safeNetworkOperation(async () => {
        // Initialize translation manager first
        const savedLanguage = getItem('language', 'es');
        logger.debug('Initializing translation manager with language:', savedLanguage);

        const success = await translationManager.initialize(savedLanguage);
        if (success) {
            logger.debug('Translation manager initialized successfully');

            // Translate the page after initialization
            translationManager.translatePage();
            logger.debug('Page translated with language:', savedLanguage);

            // Ensure main menu is translated and language dropdown is updated after DOM renders
            setTimeout(() => {
                const mainMenuScreen = document.getElementById('main-menu');
                if (mainMenuScreen) {
                    translationManager.translateContainer(mainMenuScreen);
                }
                updateLanguageDropdownDisplay(savedLanguage);
            }, 100);

            // Log memory savings
            const memoryInfo = translationManager.getMemoryInfo();
            logger.debug('Translation memory info:', memoryInfo);
        } else {
            logger.error('Failed to initialize translation manager');
        }

        // Initialize the main application
        window.game = new QuizGame();
        logger.debug('QuizGame instance created successfully');

        // Ensure UI state is synced on page load (fixes cache bug after F5)
        // This shows the Create Lobby button on main-menu and prepares UI state
        window.game.uiManager.showScreen('main-menu');

        // Check for QR code URL parameters and auto-fill PIN
        const urlParams = new URLSearchParams(window.location.search);
        const pinFromURL = urlParams.get('pin');
        if (pinFromURL) {
            logger.debug('PIN found in URL:', pinFromURL);
            // Navigate to join screen and pre-fill the PIN
            setTimeout(() => {
                const pinInput = document.getElementById('game-pin-input');
                if (pinInput) {
                    pinInput.value = pinFromURL;
                    logger.debug('PIN pre-filled from QR code URL');

                    // Show the join screen
                    if (window.game && window.game.showScreen) {
                        window.game.showScreen('join-screen');
                        logger.debug('Switched to join screen for QR code PIN');
                    }
                }
            }, 100); // Small delay to ensure DOM is ready
        }

        // Initialize content density manager for smart spacing
        contentDensityManager.initialize();
        logger.debug('Content density manager initialized');

        // Initialize mobile layout manager for content-aware layouts
        const isMobileUserAgent = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        mobileLayoutManager.setEnabled(isMobile());
        logger.debug('Mobile layout manager initialized');

        // Enhanced mobile initialization for better Android/iOS compatibility
        if (isMobileUserAgent) {
            logger.info(`📱 Mobile device detected: ${navigator.userAgent.substring(0, 50)}...`);

            // Add mobile-specific class for CSS optimizations
            document.body.classList.add('mobile-device');

            // Mobile devices benefit from longer initialization delay
            setTimeout(() => {
                document.body.classList.add('mobile-ready');
                logger.debug('📱 Mobile initialization complete');
            }, 300);
        }

        logger.debug(`App initialized for ${isMobile() ? 'mobile' : 'desktop'} layout`);

        // Start onboarding tutorial for first-time users
        // Delay slightly to ensure UI is fully rendered
        setTimeout(() => {
            if (onboardingTutorial.shouldShowOnboarding()) {
                onboardingTutorial.start();
                logger.debug('Onboarding tutorial started for first-time user');
            }
        }, 800);

        // FOUC Prevention: Add loaded class for smooth appearance
        document.body.classList.add('loaded');

        // Make sure theme toggle is available globally
        window.toggleTheme = () => {
            logger.debug('Global theme toggle called');
            if (window.game && window.game.toggleTheme) {
                window.game.toggleTheme();
            } else {
                logger.debug('window.game.toggleTheme not available');
            }
        };

        // Initialize browser optimizations
        logger.debug('Browser optimization status:', browserOptimizer.getOptimizationStatus());

        logger.debug('Quizix Pro - Application initialized successfully');
    }, 'app_initialization', () => {
        logger.error('Failed to initialize application');
        document.body.innerHTML = `<div style="text-align: center; padding: 50px;"><h2>${translationManager.getTranslationSync('application_error')}</h2><p>${translationManager.getTranslationSync('app_failed_init')}</p></div>`;
    });
});

// Global cleanup on page unload
window.addEventListener('beforeunload', () => {
    logger.debug('Page unloading - performing cleanup...');
    try {
        if (window.game && typeof window.game.cleanup === 'function') {
            window.game.cleanup();
        }
        if (window.game?.gameManager && typeof window.game.gameManager.cleanup === 'function') {
            window.game.gameManager.cleanup();
        }
        if (window.game?.quizManager && typeof window.game.quizManager.cleanup === 'function') {
            window.game.quizManager.cleanup();
        }
        logger.debug('Global cleanup completed');
    } catch (error) {
        logger.error('Error during global cleanup:', error);
    }
});

// Also handle visibility change (tab switching, minimizing)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        logger.debug('Page hidden - performing partial cleanup...');
        try {
            if (window.game?.gameManager && typeof window.game.gameManager.clearTimerTracked === 'function' && window.game.gameManager.timer) {
                // Clear main game timer to prevent unnecessary ticking when page is hidden
                window.game.gameManager.clearTimerTracked(window.game.gameManager.timer);
                window.game.gameManager.timer = null;
            }
        } catch (error) {
            logger.error('Error during partial cleanup:', error);
        }
    }
});