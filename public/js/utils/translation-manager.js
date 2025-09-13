/**
 * Lazy-Loading Translation Manager
 * Loads only the required language instead of all 9 languages (172KB → ~19KB)
 * Replaces the monolithic translations.js with dynamic loading
 */

import { logger } from '../core/config.js';
import { toastNotifications } from './toast-notifications.js';

class TranslationManager {
    constructor() {
        this.currentLanguage = 'es';
        this.loadedTranslations = new Map();
        this.defaultLanguage = 'es';
        this.loadingPromises = new Map();
        
        // Supported languages
        this.supportedLanguages = ['es', 'en', 'pl', 'fr', 'de', 'it', 'pt', 'ja', 'zh'];
        
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
            logger.debug(`🔄 Attempting to load language: ${languageCode}`);
            const importPath = `./translations/${languageCode}.js`;
            logger.debug(`📁 Import path: ${importPath}`);
            
            // Dynamic import of language module
            const module = await import(importPath);
            logger.debug(`✅ Module loaded successfully:`, module);
            
            const translations = module.default || module.translations;
            logger.debug(`📖 Translations extracted:`, translations ? Object.keys(translations).length : 'null');
            
            return translations;
        } catch (error) {
            logger.error(`❌ Failed to import language module ${languageCode}:`, error);
            logger.error(`📁 Attempted path: ./translations/${languageCode}.js`);
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
        
        // Save to localStorage
        localStorage.setItem('language', languageCode);
        
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
                element.textContent = translatedText;
                // // logger.debug(`Translated "${translationKey}" to "${translatedText}"`);
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
                element.textContent = this.getTranslationSync(translationKey);
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
                    // Update structured format: <span data-translate="question">Question</span> X <span data-translate="of">of</span> Y
                    const questionText = this.getTranslationSync('question');
                    const ofText = this.getTranslationSync('of');
                    element.innerHTML = `<span data-translate="question">${questionText}</span> ${current} <span data-translate="of">${ofText}</span> ${total}`;
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

        // Update any other dynamic game elements
        const playerInfo = document.querySelector('.player-info');
        if (playerInfo && window.gameManager && window.gameManager.playerName) {
            playerInfo.textContent = `${this.getTranslationSync('welcome')}, ${window.gameManager.playerName}!`;
        }
    }

    /**
     * Translate a specific container and all its children
     * Useful for dynamically added content
     */
    translateContainer(container) {
        if (!container) return;
        
        // Debug: count elements to translate
        const elementsToTranslate = container.querySelectorAll('[data-translate]');
        logger.debug(`🔍 translateContainer: Found ${elementsToTranslate.length} elements to translate`);
        logger.debug(`🌐 Current language: ${this.currentLanguage}`);
        logger.debug(`📚 Has translations loaded: ${this.loadedTranslations.has(this.currentLanguage)}`);
        logger.debug(`🗂️ All loaded languages:`, Array.from(this.loadedTranslations.keys()));
        logger.debug(`📊 Total loaded translations:`, this.loadedTranslations.size);
        
        if (this.loadedTranslations.has(this.currentLanguage)) {
            const translations = this.loadedTranslations.get(this.currentLanguage);
            logger.debug(`📖 Available translation keys:`, Object.keys(translations).slice(0, 10));
            logger.debug(`🎯 Test translation for 'multiple_choice':`, translations['multiple_choice']);
        } else {
            logger.error(`❌ No translations found for language: ${this.currentLanguage}`);
            logger.error(`🔍 Available languages:`, Array.from(this.loadedTranslations.keys()));
        }
        
        // Translate elements with data-translate attribute within this container
        elementsToTranslate.forEach((element, index) => {
            const translationKey = element.getAttribute('data-translate');
            const args = element.getAttribute('data-translate-args');
            const parsedArgs = args ? args.split(',').map(arg => arg.trim()) : [];
            
            if (translationKey) {
                const originalText = element.textContent;
                const translatedText = this.getTranslationSync(translationKey, parsedArgs);
                element.textContent = translatedText;
                
                // Debug all translations, especially problematic ones
                if (['add_image', 'time_seconds', 'multiple_choice', 'question', 'remove', 'a_is_correct'].includes(translationKey)) {
                    logger.debug(`🔤 Translation ${index + 1}: "${translationKey}" -> "${translatedText}" (was: "${originalText}")`);
                    
                    if (translatedText === translationKey) {
                        logger.error(`❌ Translation FAILED for: ${translationKey}`);
                        logger.error('Loaded translations:', this.loadedTranslations.has(this.currentLanguage) ? 'YES' : 'NO');
                        logger.error('Current language:', this.currentLanguage);
                    }
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
                element.textContent = this.getTranslationSync(translationKey);
            }
        });
    }

    /**
     * Initialize with default language
     */
    async initialize(languageCode = null) {
        // Get language from localStorage or use provided/default
        const targetLanguage = languageCode || 
                              localStorage.getItem('language') || 
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
 * Convenience function for getting translations (async)
 */
export async function getTranslationAsync(key, params = []) {
    return translationManager.getTranslation(key, params);
}

/**
 * Convenience function for getting translations (sync, for backward compatibility)
 */
export function getTranslation(key, params = []) {
    return translationManager.getTranslationSync(key, params);
}

/**
 * Convenience function for changing language
 */
export async function changeLanguage(languageCode) {
    const success = await translationManager.changeLanguage(languageCode);
    if (success) {
        // Trigger UI update
        const event = new CustomEvent('languageChanged', { 
            detail: { language: languageCode } 
        });
        document.dispatchEvent(event);
    }
    return success;
}

/**
 * Get option letter for backward compatibility
 */
export function getOptionLetter(index) {
    return String.fromCharCode(65 + index); // A, B, C, D...
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
    
    console.log('🔥 DEBUG: showAlert called with:', { key, message, params });
    
    // Use toast for known success/error message keys
    if (key.includes('success') || key.includes('loaded') || key.includes('saved') || key.includes('exported') || key.includes('generated')) {
        console.log('🔥 DEBUG: Showing success toast');
        toastNotifications.success(message);
    } else if (key.includes('error') || key.includes('failed') || key.includes('invalid') || 
               key.includes('wrong') || key.includes('missing') || key.includes('empty') ||
               message.toLowerCase().includes('failed') || message.toLowerCase().includes('error') ||
               message.toLowerCase().includes('invalid') || message.toLowerCase().includes('wrong') ||
               message.toLowerCase().includes('check your') || message.toLowerCase().includes('try again')) {
        console.log('🔥 DEBUG: Showing error toast');
        toastNotifications.error(message);
    } else {
        console.log('🔥 DEBUG: Showing fallback alert');
        // Fallback to regular alert for other message types
        alert(message);
    }
}

export default translationManager;