/**
 * Lazy-Loading Translation Manager
 * Loads only the required language instead of all 9 languages (172KB → ~19KB)
 * Replaces the monolithic translations.js with dynamic loading
 */

import { logger, LANGUAGES } from '../core/config.js';
import { toastNotifications } from './toast-notifications.js';
import { getItem, setItem } from './storage-utils.js';

class TranslationManager {
    constructor() {
        this.currentLanguage = 'es';
        this.loadedTranslations = new Map();
        this.defaultLanguage = 'es';
        this.loadingPromises = new Map();

        // Supported languages (using centralized config from core/config.js)
        this.supportedLanguages = LANGUAGES.SUPPORTED_CODES;

        logger.debug('Translation manager initialized');
    }

    /**
     * Get translation for a key with lazy loading
     */
    async getTranslation(key, params = []) {
        // Ensure current language is loaded
        await this.ensureLanguageLoaded(this.currentLanguage);

        const translations = this.loadedTranslations.get(this.currentLanguage);
        let translation = translations?.[key];

        // Fallback to default language if key not found
        if (!translation && this.currentLanguage !== this.defaultLanguage) {
            await this.ensureLanguageLoaded(this.defaultLanguage);
            const defaultTranslations = this.loadedTranslations.get(this.defaultLanguage);
            translation = defaultTranslations?.[key];
        }

        // Final fallback to key itself
        if (!translation) {
            logger.warn(`Translation missing for key: ${key}`);
            translation = key;
        }

        // Replace parameters
        return this.replaceParameters(translation, params);
    }

    /**
     * Synchronous translation getter (for backward compatibility)
     * Note: This will return the key if translation not loaded yet
     */
    getTranslationSync(key, params = []) {
        // Guard against undefined/null keys
        if (!key) {
            return '';
        }

        const translations = this.loadedTranslations.get(this.currentLanguage);
        let translation = translations?.[key];

        // Fallback to default language
        if (!translation && this.currentLanguage !== this.defaultLanguage) {
            const defaultTranslations = this.loadedTranslations.get(this.defaultLanguage);
            translation = defaultTranslations?.[key];
        }

        // Debug logging for missing translations
        if (!translation && key.startsWith('option_letter_')) {
            logger.warn(`Missing translation for ${key}. Available translations:`, translations ? Object.keys(translations).filter(k => k.includes('option')) : 'No translations loaded');
        }

        // Final fallback
        translation = translation || key;

        return this.replaceParameters(translation, params);
    }

    /**
     * Replace parameters in translation string
     */
    replaceParameters(translation, params) {
        if (!params || params.length === 0) {
            return translation;
        }

        return translation.replace(/\{(\d+)\}/g, (match, index) => {
            const paramIndex = parseInt(index);
            return params[paramIndex] !== undefined ? params[paramIndex] : match;
        });
    }

    /**
     * Load language file dynamically
     */
    async loadLanguage(languageCode) {
        if (!this.supportedLanguages.includes(languageCode)) {
            logger.error(`Unsupported language: ${languageCode}`);
            return null;
        }

        // Check if already loading
        if (this.loadingPromises.has(languageCode)) {
            return this.loadingPromises.get(languageCode);
        }

        // Create loading promise
        const loadingPromise = this.doLoadLanguage(languageCode);
        this.loadingPromises.set(languageCode, loadingPromise);

        try {
            const translations = await loadingPromise;
            this.loadedTranslations.set(languageCode, translations);
            logger.debug(`Language loaded: ${languageCode} (${Object.keys(translations).length} keys)`);
            return translations;
        } catch (error) {
            logger.error(`Failed to load language ${languageCode}:`, error);
            return null;
        } finally {
            this.loadingPromises.delete(languageCode);
        }
    }

    /**
     * Actual language loading implementation
     */
    async doLoadLanguage(languageCode) {
        try {
            const importPath = `./translations/${languageCode}.js`;
            const module = await import(importPath);
            return module.default || module.translations;
        } catch (error) {
            logger.error(`Failed to import language module ${languageCode}:`, error);
            throw error;
        }
    }

    /**
     * Ensure language is loaded
     */
    async ensureLanguageLoaded(languageCode) {
        if (this.loadedTranslations.has(languageCode)) {
            return this.loadedTranslations.get(languageCode);
        }

        return this.loadLanguage(languageCode);
    }

    /**
     * Change current language
     */
    async changeLanguage(languageCode) {
        if (!this.supportedLanguages.includes(languageCode)) {
            logger.error(`Cannot change to unsupported language: ${languageCode}`);
            return false;
        }

        logger.debug(`Changing language from ${this.currentLanguage} to ${languageCode}`);

        // Load new language
        const translations = await this.loadLanguage(languageCode);
        if (!translations) {
            logger.error(`Failed to load language: ${languageCode}`);
            return false;
        }

        // Update current language
        const previousLanguage = this.currentLanguage;
        this.currentLanguage = languageCode;

        // Save to localStorage (with error handling for private browsing/quota)
        setItem('language', languageCode);

        // Unload previous language to save memory (except default)
        if (previousLanguage !== this.defaultLanguage && previousLanguage !== languageCode) {
            this.loadedTranslations.delete(previousLanguage);
            logger.debug(`Unloaded language: ${previousLanguage}`);
        }

        logger.debug(`Language changed to: ${languageCode}`);
        return true;
    }

    /**
     * Get current language
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Get supported languages
     */
    getSupportedLanguages() {
        return [...this.supportedLanguages];
    }

    /**
     * Check if language is loaded
     */
    isLanguageLoaded(languageCode) {
        return this.loadedTranslations.has(languageCode);
    }

    /**
     * Get memory usage information
     */
    getMemoryInfo() {
        const loadedLanguages = Array.from(this.loadedTranslations.keys());
        const totalKeys = Array.from(this.loadedTranslations.values())
            .reduce((sum, translations) => sum + Object.keys(translations).length, 0);

        return {
            loadedLanguages,
            currentLanguage: this.currentLanguage,
            totalLoadedKeys: totalKeys,
            memoryReduction: `${((8 - loadedLanguages.length) / 8 * 100).toFixed(1)}%`
        };
    }

    /**
     * Show alert with translation
     * Success alerts now use non-intrusive toast notifications
     */
    showAlert(type, message) {
        if (type === 'success') {
            // Use toast notification for success messages
            toastNotifications.success(message);
        } else if (type === 'error') {
            // Use toast notification for error messages too
            toastNotifications.error(message);
        } else {
            // Fallback to regular alert for other types (rare)
            alert(message);
        }
    }

    /**
     * Show confirm dialog with translation
     */
    showConfirm(translationKey, ...params) {
        const message = this.getTranslationSync(translationKey, params);
        return confirm(message);
    }

    /**
     * Get option letter translation
     */
    getOptionLetter(index) {
        const letters = ['option_letter_a', 'option_letter_b', 'option_letter_c', 'option_letter_d', 'option_letter_e', 'option_letter_f'];
        const key = letters[index] || 'option_letter_a';
        const result = this.getTranslationSync(key);

        // Debug logging for option letters
        if (result === key) {
            logger.warn(`Option letter translation failed for ${key}, returning fallback`);
            // Return simple fallback letters for all 6 options
            const fallbackLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
            return fallbackLetters[index] || String.fromCharCode(65 + index);
        }

        return result;
    }

    /**
     * Translate all elements on the page
     */
    translatePage() {
        // Check if translations are loaded
        const translations = this.loadedTranslations.get(this.currentLanguage);
        if (!translations) {
            logger.warn('No translations loaded for current language:', this.currentLanguage);
            return;
        }

        logger.debug('Translating page with', Object.keys(translations).length, 'translations');

        // Translate elements with data-translate attribute
        document.querySelectorAll('[data-translate]').forEach(element => {
            const translationKey = element.getAttribute('data-translate');
            const args = element.getAttribute('data-translate-args');
            const parsedArgs = args ? args.split(',').map(arg => arg.trim()) : [];

            if (translationKey) {
                const translatedText = this.getTranslationSync(translationKey, parsedArgs);
                // Only replace content if translation was found (not falling back to key)
                // This preserves the HTML fallback text if translation fails
                if (translatedText !== translationKey) {
                    element.textContent = translatedText;
                }
            }
        });

        // Translate title attributes
        document.querySelectorAll('[data-translate-title]').forEach(element => {
            const translationKey = element.getAttribute('data-translate-title');
            const args = element.getAttribute('data-translate-title-args');
            const parsedArgs = args ? args.split(',').map(arg => arg.trim()) : [];

            if (translationKey) {
                element.title = this.getTranslationSync(translationKey, parsedArgs);
            }
        });

        // Translate placeholder attributes
        document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
            const translationKey = element.getAttribute('data-translate-placeholder');
            element.placeholder = this.getTranslationSync(translationKey);
        });

        // Translate aria-label attributes
        document.querySelectorAll('[data-translate-aria-label]').forEach(element => {
            const translationKey = element.getAttribute('data-translate-aria-label');
            if (translationKey) {
                element.setAttribute('aria-label', this.getTranslationSync(translationKey));
            }
        });

        // Translate option elements (for select dropdowns)
        document.querySelectorAll('option[data-translate]').forEach(element => {
            const translationKey = element.getAttribute('data-translate');
            if (translationKey) {
                const translatedText = this.getTranslationSync(translationKey);
                if (translatedText !== translationKey) {
                    element.textContent = translatedText;
                }
            }
        });
    }

    /**
     * Set language and update all UI elements
     */
    async setLanguage(languageCode) {
        const success = await this.changeLanguage(languageCode);
        if (success) {
            this.translatePage();
            this.updateGameTranslations();

            // Update connection status translations
            if (window.connectionStatus) {
                window.connectionStatus.refreshTranslations();
            }

            // Dispatch language change event for custom components
            const event = new CustomEvent('languageChanged', {
                detail: { language: languageCode }
            });
            document.dispatchEvent(event);
        }
        return success;
    }

    /**
     * Update game-specific translations (like counters)
     */
    updateGameTranslations() {
        // Update question counters that contain numbers
        document.querySelectorAll('.question-counter, .player-question-counter, .preview-counter, #preview-question-counter-split, #question-counter, #player-question-counter, #preview-question-counter, #preview-question-counter-display-split, #preview-question-counter-display').forEach(element => {
            const text = element.textContent || element.innerText;
            const match = text.match(/(\d+).*?(\d+)/);
            if (match) {
                const [, current, total] = match;
                // Check if element has data-translate spans (structured format)
                const questionSpan = element.querySelector('[data-translate="question"]');
                const ofSpan = element.querySelector('[data-translate="of"]');

                if (questionSpan && ofSpan) {
                    // Update structured format using DOM methods (safer than innerHTML)
                    const questionText = this.getTranslationSync('question');
                    const ofText = this.getTranslationSync('of');
                    // Update existing span contents with textContent (auto-escapes)
                    questionSpan.textContent = questionText;
                    ofSpan.textContent = ofText;
                    // Rebuild text nodes between spans
                    element.childNodes.forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const text = node.textContent.trim();
                            if (/^\d+$/.test(text)) {
                                // Keep number nodes as-is
                            }
                        }
                    });
                    // Simpler approach: just update the spans directly, structure already exists
                } else {
                    // Update simple text format: "Question X of Y"
                    element.textContent = `${this.getTranslationSync('question')} ${current} ${this.getTranslationSync('of')} ${total}`;
                }
            }
        });

        // Update final score element if it exists and has a score
        const finalScore = document.getElementById('final-score');
        if (finalScore) {
            const text = finalScore.textContent || finalScore.innerText;
            const scoreMatch = text.match(/(\d+)/);
            if (scoreMatch) {
                const score = scoreMatch[1];
                finalScore.textContent = `${score} ${this.getTranslationSync('points')}`;
            }
        }

    }

    /**
     * Translate a specific container and all its children
     * Useful for dynamically added content
     */
    translateContainer(container) {
        if (!container) return;

        if (!this.loadedTranslations.has(this.currentLanguage)) {
            logger.error(`No translations found for language: ${this.currentLanguage}`);
            return;
        }

        // Translate elements with data-translate attribute within this container
        container.querySelectorAll('[data-translate]').forEach(element => {
            const translationKey = element.getAttribute('data-translate');
            const args = element.getAttribute('data-translate-args');
            const parsedArgs = args ? args.split(',').map(arg => arg.trim()) : [];

            if (translationKey) {
                const translatedText = this.getTranslationSync(translationKey, parsedArgs);

                // Only replace content if translation was found (not falling back to key)
                // This preserves the HTML fallback text if translation fails
                if (translatedText !== translationKey) {
                    element.textContent = translatedText;
                }
            }
        });

        // Translate title attributes
        container.querySelectorAll('[data-translate-title]').forEach(element => {
            const translationKey = element.getAttribute('data-translate-title');
            const args = element.getAttribute('data-translate-title-args');
            const parsedArgs = args ? args.split(',').map(arg => arg.trim()) : [];

            if (translationKey) {
                element.title = this.getTranslationSync(translationKey, parsedArgs);
            }
        });

        // Translate placeholder attributes
        container.querySelectorAll('[data-translate-placeholder]').forEach(element => {
            const translationKey = element.getAttribute('data-translate-placeholder');
            element.placeholder = this.getTranslationSync(translationKey);
        });

        // Translate aria-label attributes
        container.querySelectorAll('[data-translate-aria-label]').forEach(element => {
            const translationKey = element.getAttribute('data-translate-aria-label');
            if (translationKey) {
                element.setAttribute('aria-label', this.getTranslationSync(translationKey));
            }
        });

        // Translate option elements (for select dropdowns)
        container.querySelectorAll('option[data-translate]').forEach(element => {
            const translationKey = element.getAttribute('data-translate');
            if (translationKey) {
                const translatedText = this.getTranslationSync(translationKey);
                if (translatedText !== translationKey) {
                    element.textContent = translatedText;
                }
            }
        });
    }

    /**
     * Initialize with default language
     */
    async initialize(languageCode = null) {
        // Get language from localStorage or use provided/default
        const targetLanguage = languageCode ||
                              getItem('language') ||
                              this.defaultLanguage;

        logger.debug(`Initializing translation manager with language: ${targetLanguage}`);

        try {
            // Load default language first
            await this.loadLanguage(this.defaultLanguage);

            // Load target language if different
            if (targetLanguage !== this.defaultLanguage) {
                await this.changeLanguage(targetLanguage);
            } else {
                this.currentLanguage = this.defaultLanguage;
            }

            logger.debug('Translation manager initialized successfully');
            return true;
        } catch (error) {
            logger.error('Failed to initialize translation manager:', error);
            return false;
        }
    }
}

// Create singleton instance
const translationManager = new TranslationManager();

// Export both the manager and convenience functions
export { translationManager };

/**
 * Convenience function for getting translations (sync, for backward compatibility)
 */
export function getTranslation(key, params = []) {
    return translationManager.getTranslationSync(key, params);
}

// Common utility functions for translation patterns
/**
 * Show translated alert with error styling (now uses toast notifications)
 */
export function showErrorAlert(key, params = []) {
    const message = translationManager.getTranslationSync(key, params);
    toastNotifications.error(message);
}

/**
 * Show translated alert with success styling (now uses toast notifications)
 */
export function showSuccessAlert(key, params = []) {
    const message = translationManager.getTranslationSync(key, params);
    toastNotifications.success(message);
}

/**
 * Create question counter text "Question X of Y"
 */
export function createQuestionCounter(current, total) {
    return `${translationManager.getTranslationSync('question')} ${current} ${translationManager.getTranslationSync('of')} ${total}`;
}

/**
 * Get True/False button text
 */
export function getTrueFalseText() {
    return {
        true: translationManager.getTranslationSync('true'),
        false: translationManager.getTranslationSync('false'),
        trueDisplay: translationManager.getTranslationSync('true_display'),
        falseDisplay: translationManager.getTranslationSync('false_display')
    };
}

/**
 * Get theme toggle titles
 */
export function getThemeToggleTitles() {
    return {
        switchToLight: translationManager.getTranslationSync('switch_light_mode'),
        switchToDark: translationManager.getTranslationSync('switch_dark_mode')
    };
}

/**
 * Show plain alert with translated text (now uses toast notifications for success/error)
 */
export function showAlert(key, params = []) {
    const message = translationManager.getTranslationSync(key, params);

    // Use toast for known success/error message keys
    const successKeywords = ['success', 'loaded', 'saved', 'exported', 'generated'];
    const errorKeywords = ['error', 'failed', 'invalid', 'wrong', 'missing', 'empty'];

    const lowerMessage = message.toLowerCase();
    const errorMessagePatterns = ['failed', 'error', 'invalid', 'wrong', 'check your', 'try again'];

    if (successKeywords.some(kw => key.includes(kw))) {
        toastNotifications.success(message);
    } else if (errorKeywords.some(kw => key.includes(kw)) || errorMessagePatterns.some(p => lowerMessage.includes(p))) {
        toastNotifications.error(message);
    } else {
        alert(message);
    }
}