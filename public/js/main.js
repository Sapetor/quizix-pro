/**
 * Quizix Pro Application Entry Point
 * Initializes the modular application
 */

import { QuizGame } from './core/app.js';
import { translationManager } from './utils/translation-manager.js';
import { unifiedErrorHandler as errorBoundary } from './utils/unified-error-handler.js';
import { TIMING, logger } from './core/config.js';
import './utils/globals.js'; // Import globals to make them available
// Removed testing infrastructure and performance monitoring - keeping app lightweight
import { browserOptimizer } from './utils/browser-optimizer.js'; // Browser-specific optimizations
import { contentDensityManager } from './utils/content-density-manager.js'; // Smart content spacing and sizing
import { mobileLayoutManager } from './utils/mobile-layout-manager.js'; // Smart mobile layout for different content types
import './utils/mobile-enhancements.js'; // Mobile UX enhancements and touch interactions
import './utils/mobile-carousel.js'; // Airbnb-style mobile carousel for main menu

/**
 * Update language dropdown display to show the currently selected language
 * @param {string} languageCode - Current language code (e.g., 'en', 'es', 'fr')
 */
function updateLanguageDropdownDisplay(languageCode) {
    try {
        const dropdown = document.getElementById('language-selector');
        if (!dropdown) {
            logger.debug('Language dropdown not found during initialization');
            return;
        }

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
                
                logger.debug(`Updated language dropdown display to: ${languageCode}`);
            }
        } else {
            logger.warn(`Could not find language option for: ${languageCode}`);
        }
    } catch (error) {
        logger.error('Error updating language dropdown display:', error);
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    const timestamp = new Date().toISOString();
    logger.debug(`🟠 [${timestamp}] main.js DOMContentLoaded event fired`);
    logger.debug('Quizix Pro - Initializing modular application...');
    
    // FOUC Prevention: Apply saved font size immediately (should already be done in HTML head)
    const savedFontSize = localStorage.getItem('globalFontSize') || 'medium';
    if (window.setGlobalFontSize) {
        window.setGlobalFontSize(savedFontSize);
    }
    
    await errorBoundary.safeNetworkOperation(async () => {
        // Initialize translation manager first
        const savedLanguage = localStorage.getItem('language') || 'es';
        logger.debug('Initializing translation manager with language:', savedLanguage);
        
        const success = await translationManager.initialize(savedLanguage);
        if (success) {
            logger.debug('Translation manager initialized successfully');
            
            // Translate the page after initialization
            translationManager.translatePage();
            logger.debug('Page translated with language:', savedLanguage);
            
            // Ensure main menu is translated specifically (fixes Quick Start Guide translation)
            setTimeout(() => {
                const mainMenuScreen = document.getElementById('main-menu');
                if (mainMenuScreen) {
                    translationManager.translateContainer(mainMenuScreen);
                    logger.debug('🔄 Main menu screen translated specifically');
                }
            }, 100);
            
            // Update language dropdown display to show current language
            updateLanguageDropdownDisplay(savedLanguage);
            
            // Log memory savings
            const memoryInfo = translationManager.getMemoryInfo();
            logger.debug('Translation memory info:', memoryInfo);
        } else {
            logger.error('Failed to initialize translation manager');
        }
        
        // Initialize the main application
        const appInitTimestamp = new Date().toISOString();
        logger.debug(`🟠 [${appInitTimestamp}] Creating QuizGame instance`);
        window.game = new QuizGame();
        const appCreatedTimestamp = new Date().toISOString();
        logger.debug(`🟠 [${appCreatedTimestamp}] QuizGame instance created successfully`);
        logger.debug('QuizGame instance created successfully');
        
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
        const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        mobileLayoutManager.setEnabled(window.innerWidth <= 768);
        logger.debug('Mobile layout manager initialized');
        
        // Initialize mobile enhancements for touch interactions and UX improvements
        if (window.mobileEnhancements) {
            logger.debug('Mobile enhancements initialized successfully');
        } else {
            logger.warn('Mobile enhancements not available');
        }
        
        // Enhanced mobile initialization for better Android/iOS compatibility
        if (isMobile) {
            logger.info(`📱 Mobile device detected: ${navigator.userAgent.substring(0, 50)}...`);
            
            // Add mobile-specific class for CSS optimizations
            document.body.classList.add('mobile-device');
            
            // Mobile devices benefit from longer initialization delay
            setTimeout(() => {
                document.body.classList.add('mobile-ready');
                logger.debug('📱 Mobile initialization complete');
            }, 300);
        }
        
        logger.debug(`App initialized for ${isMobile ? 'mobile' : 'desktop'} layout`);
        
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
        
        // Apply saved theme immediately
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Update theme toggle icon to match current theme
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = savedTheme === 'dark' ? '🌙' : '☀️'; // Moon for dark, sun for light
        }
        
        logger.debug('Applied theme:', savedTheme);
        
        // Initialize global font size after DOM is ready
        setTimeout(() => {
            errorBoundary.safeDOMOperation(() => {
                const savedFontSize = localStorage.getItem('globalFontSize') || 'medium';
                logger.debug('Setting global font size to:', savedFontSize);
                if (window.setGlobalFontSize) {
                    window.setGlobalFontSize(savedFontSize);
                    logger.debug('Global font size initialized successfully');
                } else {
                    logger.warn('setGlobalFontSize function not available yet');
                }
            }, 'font-size-init');
        }, TIMING.MATHJAX_TIMEOUT);
        
        // Removed performance dashboard keyboard shortcut - keeping app lightweight
        
        
        // Initialize browser optimizations
        logger.debug('Browser optimization status:', browserOptimizer.getOptimizationStatus());
        
        logger.debug('Quizix Pro - Application initialized successfully');
    }, 'app_initialization', () => {
        logger.error('Failed to initialize application');
        document.body.innerHTML = '<div style="text-align: center; padding: 50px;"><h2>Application Error</h2><p>Failed to initialize Quizix Pro. Please refresh the page.</p></div>';
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
                // logger.debug('Main game timer cleared while page hidden');
            }
        } catch (error) {
            logger.error('Error during partial cleanup:', error);
        }
    }
});