/**
 * Settings Manager Module
 * Handles theme management, settings persistence, and application preferences
 */

import { translationManager, getThemeToggleTitles } from '../utils/translation-manager.js';
import { logger } from '../core/config.js';
import { getJSON, setJSON } from '../utils/storage-utils.js';
import { dom } from '../utils/dom.js';

export class SettingsManager {
    constructor() {
        this.settings = {
            theme: 'light',
            // Note: soundEnabled is NOT stored here - SoundManager is the source of truth
            // Use getSoundEnabled() to get current sound state
            // Note: language is NOT stored here - TranslationManager is the source of truth
            // Use getLanguage() to get current language
            autoSave: true,
            animations: true,
            fullscreenMode: false,
            editorMode: 'basic'
        };

        // Store event handler references for cleanup
        this.eventHandlers = {};

        // SoundManager reference (injected to avoid window.game dependency)
        this._soundManager = null;

        this.loadSettings();
    }

    /**
     * Set the SoundManager reference (dependency injection)
     * @param {Object} soundManager - SoundManager instance
     */
    setSoundManager(soundManager) {
        this._soundManager = soundManager;
    }

    /**
     * Get the SoundManager instance (falls back to window.game for backward compat)
     * @returns {Object|null}
     */
    _getSoundManager() {
        return this._soundManager || window.game?.soundManager || null;
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        const savedSettings = getJSON('quizSettings');
        if (savedSettings) {
            this.settings = { ...this.settings, ...savedSettings };
        }

        // Apply loaded settings
        this.applySettings();
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        setJSON('quizSettings', this.settings);
    }

    /**
     * Apply settings to the application
     */
    applySettings() {
        // Apply theme
        this.applyTheme(this.settings.theme);

        // Apply other settings
        this.applyAnimations(this.settings.animations);
        this.applyFullscreen(this.settings.fullscreenMode);

        // Apply editor mode
        document.body.setAttribute('data-editor-mode', this.settings.editorMode || 'basic');

        // Update UI elements
        this.updateSettingsUI();
    }

    /**
     * Apply theme to the application
     */
    applyTheme(theme) {
        const body = document.body;

        // Get all theme toggle buttons (desktop, mobile header, mobile bottom)
        const themeToggleButtons = [
            dom.get('theme-toggle'),
            dom.get('theme-toggle-mobile-header'),
            dom.get('theme-toggle-mobile'), // fallback if still exists
            dom.get('mobile-theme-toggle')  // fallback if still exists
        ].filter(button => button !== null); // Remove null elements

        if (theme === 'dark') {
            body.classList.add('dark-theme');
            body.classList.remove('light-theme');
            body.setAttribute('data-theme', 'dark');
            document.documentElement.setAttribute('data-theme', 'dark');

            // Update all theme toggle buttons - show moon (current state: dark)
            themeToggleButtons.forEach(themeToggle => {
                // Update icon span if it exists (for mobile header controls)
                const iconSpan = themeToggle.querySelector('.control-icon');
                if (iconSpan) {
                    iconSpan.textContent = '🌙'; // Moon icon - currently dark
                } else {
                    // Update button text/icon directly
                    themeToggle.textContent = '🌙'; // Moon icon - currently dark
                }
                themeToggle.title = getThemeToggleTitles().switchToLight;
            });
        } else {
            body.classList.add('light-theme');
            body.classList.remove('dark-theme');
            body.setAttribute('data-theme', 'light');
            document.documentElement.setAttribute('data-theme', 'light');

            // Update all theme toggle buttons - show sun (current state: light)
            themeToggleButtons.forEach(themeToggle => {
                // Update icon span if it exists (for mobile header controls)
                const iconSpan = themeToggle.querySelector('.control-icon');
                if (iconSpan) {
                    iconSpan.textContent = '☀️'; // Sun icon - currently light
                } else {
                    // Update button text/icon directly
                    themeToggle.textContent = '☀️'; // Sun icon - currently light
                }
                themeToggle.title = getThemeToggleTitles().switchToDark;
            });
        }

        this.settings.theme = theme;
    }

    /**
     * Toggle theme between light and dark
     */
    toggleTheme() {
        // Get current theme from DOM to ensure accuracy
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme') || this.settings.theme || 'light';
        logger.debug('Current theme from DOM:', currentTheme);
        logger.debug('Current theme from settings:', this.settings.theme);

        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        logger.debug('New theme will be:', newTheme);

        this.applyTheme(newTheme);
        this.saveSettings();
        logger.debug('Theme after toggle:', this.settings.theme);
    }

    /**
     * Apply animations setting
     */
    applyAnimations(enabled) {
        const body = document.body;
        if (enabled) {
            body.classList.remove('no-animations');
        } else {
            body.classList.add('no-animations');
        }

        this.settings.animations = enabled;
    }

    /**
     * Toggle animations
     */
    toggleAnimations() {
        this.applyAnimations(!this.settings.animations);
        this.saveSettings();
    }

    /**
     * Apply fullscreen setting
     */
    applyFullscreen(enabled) {
        // Only apply fullscreen changes if explicitly requested by user
        // Don't try to apply stored fullscreen state on initialization
        if (enabled && document.fullscreenElement === null) {
            this.enterFullscreen();
        } else if (!enabled && document.fullscreenElement) {
            this.exitFullscreen();
        }
        // Update the setting but don't force changes on initialization
        this.settings.fullscreenMode = enabled;
    }

    /**
     * Toggle fullscreen mode
     */
    toggleFullscreen() {
        if (document.fullscreenElement) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }

    /**
     * Enter fullscreen mode
     */
    enterFullscreen() {
        const element = document.documentElement;

        try {
            let fullscreenPromise;

            if (element.requestFullscreen) {
                fullscreenPromise = element.requestFullscreen();
            } else if (element.mozRequestFullScreen) { // Firefox
                fullscreenPromise = element.mozRequestFullScreen();
            } else if (element.webkitRequestFullscreen) { // Chrome, Safari, Opera
                fullscreenPromise = element.webkitRequestFullscreen();
            } else if (element.msRequestFullscreen) { // IE/Edge
                fullscreenPromise = element.msRequestFullscreen();
            }

            // Handle promise-based fullscreen API
            if (fullscreenPromise && fullscreenPromise.then) {
                fullscreenPromise
                    .then(() => {
                        this.settings.fullscreenMode = true;
                        this.updateFullscreenButton();
                        this.saveSettings();
                    })
                    .catch((err) => {
                        logger.warn('Fullscreen request failed:', err.message);
                        this.settings.fullscreenMode = false;
                        this.updateFullscreenButton();
                    });
            } else {
                // For older browsers that don't return a promise
                this.settings.fullscreenMode = true;
                this.updateFullscreenButton();
                this.saveSettings();
            }
        } catch (err) {
            logger.warn('Fullscreen not supported or blocked:', err.message);
            this.settings.fullscreenMode = false;
            this.updateFullscreenButton();
        }
    }

    /**
     * Exit fullscreen mode
     */
    exitFullscreen() {
        // Only try to exit fullscreen if we're actually in fullscreen mode
        if (document.fullscreenElement || document.webkitFullscreenElement ||
            document.mozFullScreenElement || document.msFullscreenElement) {
            try {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.mozCancelFullScreen) { // Firefox
                    document.mozCancelFullScreen();
                } else if (document.webkitExitFullscreen) { // Chrome, Safari, Opera
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) { // IE/Edge
                    document.msExitFullscreen();
                }
            } catch (error) {
                logger.warn('Failed to exit fullscreen:', error);
            }
        }

        this.settings.fullscreenMode = false;
        this.updateFullscreenButton();
    }

    /**
     * Update fullscreen button appearance
     */
    updateFullscreenButton() {
        const fullscreenToggle = dom.get('fullscreen-toggle');
        if (fullscreenToggle) {
            if (this.settings.fullscreenMode) {
                fullscreenToggle.textContent = '🔲';
                fullscreenToggle.title = translationManager.getTranslationSync('exit_fullscreen');
            } else {
                fullscreenToggle.textContent = '⛶';
                fullscreenToggle.title = translationManager.getTranslationSync('enter_fullscreen');
            }
        }
    }

    /**
     * Set sound enabled/disabled - delegates to SoundManager (source of truth)
     * Note: Sound state is stored in 'quizAudioSettings' by SoundManager, not in quizSettings
     */
    setSoundEnabled(enabled) {
        const soundManager = this._getSoundManager();
        if (!soundManager) return;

        if (enabled) {
            soundManager.unmute();
        } else {
            soundManager.mute();
        }
        this.updateSettingsUI();
    }

    /**
     * Get sound enabled status from SoundManager (source of truth)
     */
    getSoundEnabled() {
        const soundManager = this._getSoundManager();
        return soundManager?.isSoundsEnabled() ?? true;
    }

    /**
     * Toggle sound - delegates to SoundManager
     */
    toggleSound() {
        const soundManager = this._getSoundManager();
        if (!soundManager) return;

        if (soundManager.isSoundsEnabled()) {
            soundManager.mute();
        } else {
            soundManager.unmute();
        }
        // SoundManager.mute()/unmute() saves to localStorage automatically
        this.updateSoundToggleButtons();
    }

    /**
     * Update sound toggle button icons and state
     */
    updateSoundToggleButtons() {
        const soundManager = this._getSoundManager();
        const isEnabled = soundManager?.isSoundsEnabled() ?? true;
        const icon = isEnabled ? '🔊' : '🔇';
        const tooltip = isEnabled ?
            (translationManager.getTranslationSync('mute_sound') || 'Mute sound') :
            (translationManager.getTranslationSync('unmute_sound') || 'Unmute sound');

        // Desktop button
        const desktopBtn = dom.get('sound-toggle');
        if (desktopBtn) {
            desktopBtn.textContent = icon;
            desktopBtn.title = tooltip;
        }

        // Mobile button
        const mobileBtn = dom.get('sound-toggle-mobile-header');
        if (mobileBtn) {
            const iconSpan = mobileBtn.querySelector('.control-icon');
            if (iconSpan) {
                iconSpan.textContent = icon;
            }
            mobileBtn.title = tooltip;
        }
    }

    /**
     * Set language - delegates to TranslationManager which is the source of truth
     * Note: Language is stored in 'language' localStorage key by TranslationManager,
     * not in quizSettings, to avoid duplication
     */
    async setLanguage(language) {
        const success = await translationManager.setLanguage(language);
        if (success) {
            this.updateSettingsUI();
        }
        return success;
    }

    /**
     * Get current language from TranslationManager (source of truth)
     */
    getLanguage() {
        return translationManager.getCurrentLanguage();
    }

    /**
     * Set auto-save enabled/disabled
     */
    setAutoSave(enabled) {
        this.settings.autoSave = enabled;
        this.saveSettings();
        this.updateSettingsUI();
    }

    /**
     * Toggle auto-save
     */
    toggleAutoSave() {
        this.setAutoSave(!this.settings.autoSave);
    }

    /**
     * Get current settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Get specific setting
     * Note: For 'soundEnabled' and 'language', delegates to their respective managers
     */
    getSetting(key) {
        // Delegate to source of truth managers for these keys
        if (key === 'soundEnabled') {
            return this.getSoundEnabled();
        }
        if (key === 'language') {
            return this.getLanguage();
        }
        return this.settings[key];
    }

    /**
     * Update setting
     */
    updateSetting(key, value) {
        this.settings[key] = value;
        this.saveSettings();
        this.applySettings();
    }

    /**
     * Reset settings to defaults
     */
    async resetSettings() {
        this.settings = {
            theme: 'light',
            autoSave: true,
            animations: true,
            fullscreenMode: false,
            editorMode: 'basic'
        };

        // Reset language via TranslationManager (source of truth) - await async operation
        await translationManager.setLanguage('en');

        // Reset sound via SoundManager (source of truth)
        this.setSoundEnabled(true);

        this.saveSettings();
        this.applySettings();
    }

    /**
     * Update settings UI elements
     */
    updateSettingsUI() {
        // Update all theme toggle buttons (desktop and mobile)
        const themeToggleButtons = [
            dom.get('theme-toggle'),
            dom.get('theme-toggle-mobile-header'),
            dom.get('theme-toggle-mobile'),
            dom.get('mobile-theme-toggle')
        ].filter(button => button !== null);

        themeToggleButtons.forEach(themeToggle => {
            const iconSpan = themeToggle.querySelector('.control-icon');
            // Update icon based on current theme - show current state
            if (this.settings.theme === 'dark') {
                // Currently dark, show moon (current state)
                if (iconSpan) {
                    iconSpan.textContent = '🌙';
                } else {
                    themeToggle.textContent = '🌙';
                }
                themeToggle.title = getThemeToggleTitles().switchToLight;
            } else {
                // Currently light, show sun (current state)
                if (iconSpan) {
                    iconSpan.textContent = '☀️';
                } else {
                    themeToggle.textContent = '☀️';
                }
                themeToggle.title = getThemeToggleTitles().switchToDark;
            }
        });

        // Update sound toggle (reads from SoundManager)
        this.updateSoundToggleButtons();

        // Update fullscreen toggle
        this.updateFullscreenButton();

        // Update language selector - use getLanguage() which reads from TranslationManager
        const currentLanguage = this.getLanguage();
        const languageButtons = document.querySelectorAll('[data-lang]');
        languageButtons.forEach(button => {
            const lang = button.getAttribute('data-lang');
            if (lang === currentLanguage) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        // Update auto-save toggle
        const autoSaveToggle = dom.get('auto-save-toggle');
        if (autoSaveToggle) {
            autoSaveToggle.checked = this.settings.autoSave;
        }

        // Update animations toggle
        const animationsToggle = dom.get('animations-toggle');
        if (animationsToggle) {
            animationsToggle.checked = this.settings.animations;
        }
    }

    /**
     * Initialize settings event listeners
     */
    initializeEventListeners() {
        // Theme toggle (desktop and mobile)
        const themeToggleButtons = [
            dom.get('theme-toggle'),
            dom.get('theme-toggle-mobile-header')
        ].filter(button => button !== null);

        themeToggleButtons.forEach(themeToggle => {
            if (themeToggle) {
                themeToggle.addEventListener('click', () => this.toggleTheme());
            }
        });

        // Sound toggle (desktop and mobile)
        const soundToggleButtons = [
            dom.get('sound-toggle'),
            dom.get('sound-toggle-mobile-header')
        ].filter(button => button !== null);

        soundToggleButtons.forEach(soundToggle => {
            if (soundToggle) {
                soundToggle.addEventListener('click', () => this.toggleSound());
            }
        });

        // Initial sound button state - reads from SoundManager (source of truth)
        this.updateSoundToggleButtons();

        // Fullscreen toggle
        const fullscreenToggle = dom.get('fullscreen-toggle');
        if (fullscreenToggle) {
            fullscreenToggle.addEventListener('click', () => this.toggleFullscreen());
        }

        // Auto-save toggle
        const autoSaveToggle = dom.get('auto-save-toggle');
        if (autoSaveToggle) {
            autoSaveToggle.addEventListener('change', (e) => {
                this.setAutoSave(e.target.checked);
            });
        }

        // Animations toggle
        const animationsToggle = dom.get('animations-toggle');
        if (animationsToggle) {
            animationsToggle.addEventListener('change', (e) => {
                this.applyAnimations(e.target.checked);
                this.saveSettings();
            });
        }

        // Note: Language buttons are handled by app.js which calls translationManager.setLanguage()
        // SettingsManager.setLanguage() delegates to TranslationManager, so no duplicate handlers needed

        // Handle fullscreen change events
        document.addEventListener('fullscreenchange', () => {
            this.settings.fullscreenMode = !!document.fullscreenElement;
            this.updateFullscreenButton();
            this.saveSettings();
        });

        // Handle fullscreen errors
        document.addEventListener('fullscreenerror', (e) => {
            logger.error('Fullscreen error:', e);
            this.settings.fullscreenMode = false;
            this.updateFullscreenButton();
            this.saveSettings();
        });
    }

    /**
     * Get current editor mode
     * @returns {'basic'|'advanced'}
     */
    getEditorMode() {
        return this.settings.editorMode || 'basic';
    }

    /**
     * Set editor mode and persist
     * @param {'basic'|'advanced'} mode
     */
    setEditorMode(mode) {
        this.settings.editorMode = mode;
        document.body.setAttribute('data-editor-mode', mode);
        this.saveSettings();
    }

    /**
     * Export settings
     */
    exportSettings() {
        const settingsData = {
            settings: this.settings,
            exportedAt: new Date().toISOString()
        };

        const dataStr = JSON.stringify(settingsData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'quizix-settings.json';
        link.click();
    }

    /**
     * Import settings with validation
     */
    async importSettings(file) {
        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            if (importData.settings) {
                // Validate imported settings to prevent injection attacks
                const validatedSettings = this.validateImportedSettings(importData.settings);
                this.settings = { ...this.settings, ...validatedSettings };
                this.saveSettings();
                this.applySettings();
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Failed to import settings:', error);
            return false;
        }
    }

    /**
     * Validate imported settings structure and types
     * @param {Object} settings - Settings to validate
     * @returns {Object} Validated settings with only known keys and correct types
     */
    validateImportedSettings(settings) {
        const validated = {};

        // Define allowed settings with their expected types and validators
        const schema = {
            theme: { type: 'string', values: ['light', 'dark'] },
            autoSave: { type: 'boolean' },
            animations: { type: 'boolean' },
            fullscreenMode: { type: 'boolean' },
            editorMode: { type: 'string', values: ['basic', 'advanced'] }
        };

        for (const [key, config] of Object.entries(schema)) {
            if (key in settings) {
                const value = settings[key];

                // Type check
                if (typeof value !== config.type) {
                    logger.warn(`Invalid type for setting ${key}: expected ${config.type}, got ${typeof value}`);
                    continue;
                }

                // Value validation for enums
                if (config.values && !config.values.includes(value)) {
                    logger.warn(`Invalid value for setting ${key}: ${value}`);
                    continue;
                }

                validated[key] = value;
            }
        }

        return validated;
    }
}