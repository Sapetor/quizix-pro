/**
 * Keyboard Shortcuts Manager
 * Provides essential keyboard shortcuts for efficient quiz creation
 */

import { logger } from '../core/config.js';
import { addQuestion } from './question-utils.js';

export class KeyboardShortcuts {
    constructor() {
        this.shortcuts = new Map();
        this.isEnabled = true;
        this.activeModals = new Set();
        
        this.initializeShortcuts();
        this.bindEvents();
        
        logger.debug('Keyboard shortcuts manager initialized');
    }

    /**
     * Initialize all keyboard shortcuts
     */
    initializeShortcuts() {
        // Quiz Creation Shortcuts
        this.addShortcut('ctrl+n', 'Add New Question', () => {
            if (this.isQuizBuilderActive()) {
                addQuestion();
                this.showShortcutFeedback('New question added');
            }
        });

        this.addShortcut('ctrl+s', 'Save Quiz', (e) => {
            if (this.isQuizBuilderActive()) {
                e.preventDefault();
                const saveButton = document.getElementById('save-quiz') || document.getElementById('toolbar-save');
                if (saveButton) {
                    saveButton.click();
                    this.showShortcutFeedback('Quiz saved');
                }
            }
        });

        this.addShortcut('ctrl+o', 'Load Quiz', (e) => {
            if (this.isQuizBuilderActive()) {
                e.preventDefault();
                const loadButton = document.getElementById('load-quiz') || document.getElementById('toolbar-load');
                if (loadButton) {
                    loadButton.click();
                    this.showShortcutFeedback('Load quiz dialog opened');
                }
            }
        });

        this.addShortcut('ctrl+shift+p', 'Toggle Preview', () => {
            if (this.isQuizBuilderActive()) {
                const previewButton = document.getElementById('preview-quiz') || document.getElementById('toolbar-preview');
                if (previewButton) {
                    previewButton.click();
                    this.showShortcutFeedback('Preview toggled');
                }
            }
        });

        // Navigation Shortcuts
        this.addShortcut('ctrl+home', 'Go to Top', () => {
            if (this.isQuizBuilderActive()) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                this.showShortcutFeedback('Scrolled to top');
            }
        });

        this.addShortcut('ctrl+end', 'Go to Bottom', () => {
            if (this.isQuizBuilderActive()) {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                this.showShortcutFeedback('Scrolled to bottom');
            }
        });

        // Preview Navigation
        this.addShortcut('arrowleft', 'Previous Question (in preview)', () => {
            if (this.isPreviewActive()) {
                const prevButton = document.getElementById('preview-prev') || document.getElementById('preview-prev-split');
                if (prevButton) {
                    prevButton.click();
                }
            }
        });

        this.addShortcut('arrowright', 'Next Question (in preview)', () => {
            if (this.isPreviewActive()) {
                const nextButton = document.getElementById('preview-next') || document.getElementById('preview-next-split');
                if (nextButton) {
                    nextButton.click();
                }
            }
        });

        // Quick Actions
        this.addShortcut('ctrl+shift+a', 'AI Generator', () => {
            if (this.isQuizBuilderActive()) {
                const aiButton = document.getElementById('ai-generator') || document.getElementById('toolbar-ai-gen');
                if (aiButton) {
                    aiButton.click();
                    this.showShortcutFeedback('AI Generator opened');
                }
            }
        });

        this.addShortcut('ctrl+shift+i', 'Import Quiz', () => {
            if (this.isQuizBuilderActive()) {
                const importButton = document.getElementById('import-quiz') || document.getElementById('toolbar-import');
                if (importButton) {
                    importButton.click();
                    this.showShortcutFeedback('Import dialog opened');
                }
            }
        });

        this.addShortcut('ctrl+shift+e', 'Export Quiz', () => {
            if (this.isQuizBuilderActive()) {
                const exportButton = document.getElementById('export-quiz') || document.getElementById('toolbar-export');
                if (exportButton) {
                    exportButton.click();
                    this.showShortcutFeedback('Export dialog opened');
                }
            }
        });

        // Modal/Dialog Controls
        this.addShortcut('escape', 'Close Modal/Preview', () => {
            // Close any open modals or previews
            const closeButtons = document.querySelectorAll('.close-btn, .modal-close, #close-preview');
            for (const button of closeButtons) {
                if (button.style.display !== 'none' && button.offsetParent !== null) {
                    button.click();
                    this.showShortcutFeedback('Modal closed');
                    break;
                }
            }
        });

        // Theme and Settings
        this.addShortcut('ctrl+shift+t', 'Toggle Theme', () => {
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                themeToggle.click();
                this.showShortcutFeedback('Theme toggled');
            }
        });

        // Help
        this.addShortcut('f1', 'Show Shortcuts Help', (e) => {
            e.preventDefault();
            this.showShortcutsHelp();
        });
    }

    /**
     * Add a keyboard shortcut
     */
    addShortcut(keys, description, callback) {
        const normalizedKeys = this.normalizeKeys(keys);
        this.shortcuts.set(normalizedKeys, {
            keys: normalizedKeys,
            description,
            callback,
            originalKeys: keys
        });
    }

    /**
     * Normalize key combination for consistent matching
     */
    normalizeKeys(keys) {
        return keys.toLowerCase()
            .replace(/\s+/g, '')
            .split('+')
            .sort()
            .join('+');
    }

    /**
     * Convert keyboard event to key string
     */
    eventToKeyString(event) {
        const keys = [];
        
        if (event.ctrlKey) keys.push('ctrl');
        if (event.shiftKey) keys.push('shift');
        if (event.altKey) keys.push('alt');
        if (event.metaKey) keys.push('meta');
        
        const key = event.key.toLowerCase();
        if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
            keys.push(key);
        }
        
        return keys.sort().join('+');
    }

    /**
     * Bind keyboard event listeners
     */
    bindEvents() {
        document.addEventListener('keydown', (event) => {
            if (!this.isEnabled) return;
            
            // Skip if user is typing in an input field
            if (this.isInputActive(event.target)) return;
            
            const keyString = this.eventToKeyString(event);
            const shortcut = this.shortcuts.get(keyString);
            
            if (shortcut) {
                try {
                    shortcut.callback(event);
                    logger.debug(`Keyboard shortcut executed: ${shortcut.originalKeys}`);
                } catch (error) {
                    logger.error('Keyboard shortcut error:', error);
                }
            }
        });

        // Track modal states
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const element = mutation.target;
                    if (element.classList.contains('modal')) {
                        const isVisible = element.style.display !== 'none' && element.offsetParent !== null;
                        if (isVisible) {
                            this.activeModals.add(element.id);
                        } else {
                            this.activeModals.delete(element.id);
                        }
                    }
                }
            });
        });

        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['style']
        });
    }

    /**
     * Check if an input element is active
     */
    isInputActive(element) {
        const inputTags = ['input', 'textarea', 'select'];
        const isInput = inputTags.includes(element.tagName.toLowerCase());
        const isContentEditable = element.contentEditable === 'true';
        return isInput || isContentEditable;
    }

    /**
     * Check if quiz builder is the active screen
     */
    isQuizBuilderActive() {
        const quizBuilder = document.getElementById('quiz-builder-screen');
        return quizBuilder && quizBuilder.style.display !== 'none';
    }

    /**
     * Check if preview is active
     */
    isPreviewActive() {
        const previewModal = document.getElementById('preview-modal');
        const previewSplit = document.getElementById('live-preview');
        
        const modalActive = previewModal && previewModal.style.display !== 'none';
        const splitActive = previewSplit && previewSplit.style.display !== 'none';
        
        return modalActive || splitActive;
    }

    /**
     * Show visual feedback for shortcut activation
     */
    showShortcutFeedback(message) {
        // Remove any existing feedback
        const existingFeedback = document.getElementById('shortcut-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // Create feedback element
        const feedback = document.createElement('div');
        feedback.id = 'shortcut-feedback';
        feedback.className = 'shortcut-feedback';
        feedback.textContent = message;
        
        document.body.appendChild(feedback);

        // Animate and remove
        setTimeout(() => {
            feedback.classList.add('fade-out');
            setTimeout(() => {
                if (feedback.parentNode) {
                    feedback.remove();
                }
            }, 300);
        }, 1500);
    }

    /**
     * Show shortcuts help modal
     */
    showShortcutsHelp() {
        // Create help modal if it doesn't exist
        let helpModal = document.getElementById('shortcuts-help-modal');
        if (!helpModal) {
            helpModal = document.createElement('div');
            helpModal.id = 'shortcuts-help-modal';
            helpModal.className = 'modal shortcuts-help-modal';
            helpModal.innerHTML = this.generateHelpHTML();
            document.body.appendChild(helpModal);

            // Add close functionality
            const closeBtn = helpModal.querySelector('.close-btn');
            closeBtn.onclick = () => {
                helpModal.style.display = 'none';
            };

            // Close on outside click
            helpModal.onclick = (e) => {
                if (e.target === helpModal) {
                    helpModal.style.display = 'none';
                }
            };
        }

        helpModal.style.display = 'block';
        this.showShortcutFeedback('Shortcuts help opened');
    }

    /**
     * Generate help modal HTML
     */
    generateHelpHTML() {
        const categories = {
            'Quiz Creation': [
                { keys: 'Ctrl+N', desc: 'Add New Question' },
                { keys: 'Ctrl+S', desc: 'Save Quiz' },
                { keys: 'Ctrl+O', desc: 'Load Quiz' },
                { keys: 'Ctrl+Shift+P', desc: 'Toggle Preview' }
            ],
            'Navigation': [
                { keys: 'Ctrl+Home', desc: 'Go to Top' },
                { keys: 'Ctrl+End', desc: 'Go to Bottom' },
                { keys: '← →', desc: 'Navigate Preview (when preview is active)' }
            ],
            'Quick Actions': [
                { keys: 'Ctrl+Shift+A', desc: 'AI Generator' },
                { keys: 'Ctrl+Shift+I', desc: 'Import Quiz' },
                { keys: 'Ctrl+Shift+E', desc: 'Export Quiz' },
                { keys: 'Ctrl+Shift+T', desc: 'Toggle Theme' }
            ],
            'General': [
                { keys: 'Escape', desc: 'Close Modal/Preview' },
                { keys: 'F1', desc: 'Show This Help' }
            ]
        };

        let html = `
            <div class="modal-content shortcuts-help-content">
                <div class="modal-header">
                    <h2>⌨️ Keyboard Shortcuts</h2>
                    <button class="close-btn">×</button>
                </div>
                <div class="shortcuts-body">
        `;

        for (const [category, shortcuts] of Object.entries(categories)) {
            html += `
                <div class="shortcut-category">
                    <h3>${category}</h3>
                    <div class="shortcut-list">
            `;
            
            shortcuts.forEach(shortcut => {
                html += `
                    <div class="shortcut-item">
                        <kbd class="shortcut-keys">${shortcut.keys}</kbd>
                        <span class="shortcut-desc">${shortcut.desc}</span>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }

        html += `
                    <div class="shortcuts-footer">
                        <p><strong>💡 Tip:</strong> Shortcuts work when you're not typing in text fields</p>
                    </div>
                </div>
            </div>
        `;

        return html;
    }
}

// Create singleton instance
export const keyboardShortcuts = new KeyboardShortcuts();
export default keyboardShortcuts;