/**
 * AI Question Generator Module
 * Handles AI-powered question generation from various providers
 * 
 * EXTRACTION NOTES:
 * - Extracted from script.js lines 4804-5572
 * - Includes all AI provider integrations: Ollama, OpenAI, Claude, HuggingFace
 * - Handles file uploads and content parsing
 * - Manages API keys and model selection
 * - Dependencies: translation-manager.js for translationManager.getTranslationSync()
 */

import { logger, AI, TIMING } from '../core/config.js';
import { translationManager, showAlert } from '../utils/translation-manager.js';
import { secureStorage } from '../services/secure-storage-service.js';
import { APIHelper } from '../utils/api-helper.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';

// Import XLSX library for Excel processing
const XLSX = window.XLSX;

export class AIQuestionGenerator {
    constructor() {
        this.providers = {
            ollama: {
                name: "Ollama (Local)",
                apiKey: false,
                endpoint: AI.OLLAMA_ENDPOINT,
                models: ["llama3.2:latest", "codellama:13b-instruct", "codellama:7b-instruct", "codellama:7b-code"]
            },
            openai: {
                name: "OpenAI",
                apiKey: true,
                endpoint: "https://api.openai.com/v1/chat/completions",
                models: [AI.OPENAI_MODEL, "gpt-4"]
            },
            claude: {
                name: "Anthropic Claude", 
                apiKey: true,
                endpoint: "https://api.anthropic.com/v1/messages",
                models: ["claude-3-haiku", "claude-3-sonnet"]
            },
            gemini: {
                name: "Google Gemini",
                apiKey: true,
                endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
                models: [AI.GEMINI_MODEL, "gemini-2.0-flash", "gemini-1.5-pro"]
            }
        };
        
        this.isGenerating = false; // Flag to prevent multiple simultaneous generations
        this.eventHandlers = {}; // Store event handler references for cleanup
        this.initializeEventListeners();
        this.initializeSecureStorage();
    }

    /**
     * Initialize secure storage and migrate existing API keys
     */
    async initializeSecureStorage() {
        return await errorHandler.wrapAsyncOperation(async () => {
            // Check if Web Crypto API is supported
            if (!secureStorage.constructor.isSupported()) {
                logger.warn('Web Crypto API not supported - API keys will not be encrypted');
                return;
            }

            // Migrate existing API keys to secure storage
            await secureStorage.migrateApiKeys();
            logger.debug('Secure storage initialized and API keys migrated');
        }, {
            errorType: errorHandler.errorTypes.SYSTEM,
            context: 'secure-storage-initialization',
            userMessage: null, // Silent failure for initialization
            retryable: false,
            fallback: null
        });
    }

    initializeEventListeners() {
        const modal = document.getElementById('ai-generator-modal');
        const closeButton = document.getElementById('close-ai-generator');

        // Store handler references for cleanup
        this.eventHandlers.modalClick = (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        };

        this.eventHandlers.closeButtonClick = () => {
            this.closeModal();
        };

        this.eventHandlers.keydown = (e) => {
            if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
                this.closeModal();
            }
        };

        this.eventHandlers.providerChange = (e) => {
            this.handleProviderChange(e.target.value);
        };

        this.eventHandlers.modelChange = (e) => {
            if (e.target.value) {
                localStorage.setItem('ollama_selected_model', e.target.value);
            }
        };

        this.eventHandlers.fileChange = (e) => {
            this.handleFileUpload(e.target.files[0]);
        };

        this.eventHandlers.contentInput = (e) => {
            this.detectContentType(e.target.value);
        };

        this.eventHandlers.generateClick = () => {
            this.generateQuestions();
        };

        this.eventHandlers.cancelClick = () => {
            this.closeModal();
        };

        this.eventHandlers.apiKeyBlur = async (e) => {
            await errorHandler.wrapAsyncOperation(async () => {
                const provider = document.getElementById('ai-provider')?.value;
                if (provider && e.target.value.trim()) {
                    const success = await secureStorage.setSecureItem(`api_key_${provider}`, e.target.value.trim());
                    if (success) {
                        logger.debug(`API key securely saved for provider: ${provider}`);
                    } else {
                        throw new Error(`Failed to save API key for provider: ${provider}`);
                    }
                }
            }, {
                errorType: errorHandler.errorTypes.SYSTEM,
                context: 'api-key-storage',
                userMessage: 'Failed to save API key securely. Please try again.',
                retryable: false
            });
        };

        // Add event listeners
        if (modal) {
            modal.addEventListener('click', this.eventHandlers.modalClick);
        }

        if (closeButton) {
            closeButton.addEventListener('click', this.eventHandlers.closeButtonClick);
        }

        document.addEventListener('keydown', this.eventHandlers.keydown);

        // Provider selection change
        const providerSelect = document.getElementById('ai-provider');
        if (providerSelect) {
            providerSelect.addEventListener('change', this.eventHandlers.providerChange);
        }

        // Model selection change
        const modelSelect = document.getElementById('ollama-model');
        if (modelSelect) {
            modelSelect.addEventListener('change', this.eventHandlers.modelChange);
        }

        // File upload handling
        const fileInput = document.getElementById('content-file');
        if (fileInput) {
            fileInput.addEventListener('change', this.eventHandlers.fileChange);
        }

        // Content type detection
        const contentTextarea = document.getElementById('source-content');
        if (contentTextarea) {
            contentTextarea.addEventListener('input', this.eventHandlers.contentInput);
        }

        // Generate questions button
        const generateBtn = document.getElementById('generate-questions');
        if (generateBtn) {
            generateBtn.addEventListener('click', this.eventHandlers.generateClick);
        }

        // Cancel button
        const cancelBtn = document.getElementById('cancel-ai-generator');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', this.eventHandlers.cancelClick);
        }

        // API key input change listener
        const apiKeyInput = document.getElementById('ai-api-key');
        if (apiKeyInput) {
            apiKeyInput.addEventListener('blur', this.eventHandlers.apiKeyBlur);
        }
    }

    /**
     * Clean up all event listeners to prevent memory leaks
     */
    cleanup() {
        const modal = document.getElementById('ai-generator-modal');
        const closeButton = document.getElementById('close-ai-generator');
        const providerSelect = document.getElementById('ai-provider');
        const modelSelect = document.getElementById('ollama-model');
        const fileInput = document.getElementById('content-file');
        const contentTextarea = document.getElementById('source-content');
        const generateBtn = document.getElementById('generate-questions');
        const cancelBtn = document.getElementById('cancel-ai-generator');
        const apiKeyInput = document.getElementById('ai-api-key');

        // Remove all event listeners
        if (modal && this.eventHandlers.modalClick) {
            modal.removeEventListener('click', this.eventHandlers.modalClick);
        }

        if (closeButton && this.eventHandlers.closeButtonClick) {
            closeButton.removeEventListener('click', this.eventHandlers.closeButtonClick);
        }

        if (this.eventHandlers.keydown) {
            document.removeEventListener('keydown', this.eventHandlers.keydown);
        }

        if (providerSelect && this.eventHandlers.providerChange) {
            providerSelect.removeEventListener('change', this.eventHandlers.providerChange);
        }

        if (modelSelect && this.eventHandlers.modelChange) {
            modelSelect.removeEventListener('change', this.eventHandlers.modelChange);
        }

        if (fileInput && this.eventHandlers.fileChange) {
            fileInput.removeEventListener('change', this.eventHandlers.fileChange);
        }

        if (contentTextarea && this.eventHandlers.contentInput) {
            contentTextarea.removeEventListener('input', this.eventHandlers.contentInput);
        }

        if (generateBtn && this.eventHandlers.generateClick) {
            generateBtn.removeEventListener('click', this.eventHandlers.generateClick);
        }

        if (cancelBtn && this.eventHandlers.cancelClick) {
            cancelBtn.removeEventListener('click', this.eventHandlers.cancelClick);
        }

        if (apiKeyInput && this.eventHandlers.apiKeyBlur) {
            apiKeyInput.removeEventListener('blur', this.eventHandlers.apiKeyBlur);
        }

        // Clear handler references
        this.eventHandlers = {};

        logger.debug('AI Generator event listeners cleaned up');
    }

    /**
     * Initialize preview modal event listeners
     */
    initializePreviewModalListeners() {
        const previewModal = document.getElementById('question-preview-modal');
        const closeBtn = document.getElementById('close-question-preview');
        const cancelBtn = document.getElementById('cancel-question-preview');
        const confirmBtn = document.getElementById('confirm-add-questions');
        const selectAllBtn = document.getElementById('select-all-questions');
        const deselectAllBtn = document.getElementById('deselect-all-questions');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePreviewModal());
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closePreviewModal());
        }
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.confirmAddSelectedQuestions());
        }
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => this.selectAllQuestions(true));
        }
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => this.selectAllQuestions(false));
        }
        if (previewModal) {
            previewModal.addEventListener('click', (e) => {
                if (e.target === previewModal) {
                    this.closePreviewModal();
                }
            });
        }
    }

    /**
     * Show the question preview modal with generated questions
     * @param {Array} questions - Array of generated question objects
     */
    showQuestionPreview(questions) {
        // Filter out malformed questions (missing required fields) with detailed logging
        const validQuestions = [];
        const malformedQuestions = [];

        questions.forEach((q, i) => {
            const issues = [];
            if (!q) issues.push('question is null/undefined');
            else {
                if (!q.question) issues.push('missing "question" text');
                if (!q.type) issues.push('missing "type"');
                if (!Array.isArray(q.options)) issues.push('missing or invalid "options" array');
                else if (q.options.length === 0) issues.push('"options" array is empty');

                // Auto-fix: multiple-correct with correctAnswer instead of correctAnswers
                if (q.type === 'multiple-correct' && q.correctAnswer !== undefined && !q.correctAnswers) {
                    logger.debug(`🔧 Auto-fixing question ${i + 1}: converting correctAnswer to correctAnswers array`);
                    q.correctAnswers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
                    delete q.correctAnswer;
                }

                // Validate correct answer based on question type
                if (q.type === 'multiple-choice') {
                    if (q.correctAnswer === undefined) {
                        issues.push('missing "correctAnswer" for multiple-choice');
                    }
                } else if (q.type === 'true-false') {
                    // true-false can have correctAnswer as number (0/1) or string ("true"/"false")
                    if (q.correctAnswer === undefined) {
                        issues.push('missing "correctAnswer" for true-false');
                    }
                } else if (q.type === 'multiple-correct') {
                    if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
                        issues.push('missing or empty "correctAnswers" array for multiple-correct');
                    }
                } else if (q.type === 'numeric') {
                    if (q.correctAnswer === undefined) {
                        issues.push('missing "correctAnswer" for numeric');
                    }
                }
            }

            if (issues.length === 0) {
                validQuestions.push(q);
            } else {
                malformedQuestions.push({ index: i, issues, data: q });
            }
        });

        if (validQuestions.length === 0) {
            showToast(translationManager.getTranslationSync('error_generating') || 'Error generating questions', 'error');
            return;
        }

        if (malformedQuestions.length > 0) {
            logger.warn(`Filtered out ${malformedQuestions.length} malformed questions:`);
            malformedQuestions.forEach(({ index, issues, data }) => {
                logger.warn(`  Question ${index + 1}: ${issues.join(', ')}`);
                logger.debug(`  Raw data:`, data);
            });
        }

        this.previewQuestions = validQuestions.map((q, index) => ({
            ...q,
            selected: true,  // All selected by default
            index: index
        }));

        const previewModal = document.getElementById('question-preview-modal');
        const previewList = document.getElementById('question-preview-list');

        if (!previewModal || !previewList) {
            logger.warn('Preview modal elements not found, falling back to direct processing');
            this.processGeneratedQuestions(questions, false);
            return;
        }

        // Clear and render questions
        previewList.innerHTML = '';
        this.previewQuestions.forEach((question, index) => {
            const questionEl = this.renderPreviewQuestion(question, index);
            previewList.appendChild(questionEl);
        });

        // Update summary
        this.updatePreviewSummary();

        // Show the modal
        previewModal.style.display = 'flex';

        // Initialize listeners if not already done
        if (!this.previewListenersInitialized) {
            this.initializePreviewModalListeners();
            this.previewListenersInitialized = true;
        }
    }

    /**
     * Render a single question for preview
     * @param {Object} question - Question data
     * @param {number} index - Question index
     * @returns {HTMLElement} - The question preview element
     */
    renderPreviewQuestion(question, index) {
        const div = document.createElement('div');
        div.className = `preview-question-item ${question.selected ? 'selected' : 'rejected'}`;
        div.dataset.index = index;

        // Get translated question type
        const typeKey = `question_type_${question.type?.replace('-', '_')}`;
        const typeLabel = translationManager.getTranslationSync(typeKey) || question.type || 'Unknown';

        // Colorful option colors (matching app preview)
        const optionColors = [
            { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#3b82f6' },   // Blue
            { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#10b981' },   // Green
            { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#f59e0b' },   // Orange
            { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#ef4444' },    // Red
            { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#8b5cf6' },   // Purple
            { bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', text: '#06b6d4' }     // Cyan
        ];

        // Build options HTML based on question type
        let optionsHtml = '';
        if (question.type === 'multiple-choice' || question.type === 'true-false') {
            const options = question.options || [];
            const correctIndex = question.correctAnswer ?? 0;
            optionsHtml = options.map((opt, i) => {
                const color = optionColors[i % optionColors.length];
                const isCorrect = i === correctIndex;
                return `
                <div class="ai-preview-option ${isCorrect ? 'correct' : ''}"
                     style="background: ${color.bg}; border-left: 4px solid ${color.border};">
                    <span class="ai-option-letter" style="color: ${color.text}; font-weight: 700;">${String.fromCharCode(65 + i)}</span>
                    <span class="ai-option-text">${this.escapeHtml(opt)}</span>
                    ${isCorrect ? '<span class="ai-correct-badge">✓</span>' : ''}
                </div>`;
            }).join('');
        } else if (question.type === 'multiple-correct') {
            const options = question.options || [];
            const correctAnswers = question.correctAnswers || [];
            optionsHtml = options.map((opt, i) => {
                const color = optionColors[i % optionColors.length];
                const isCorrect = correctAnswers.includes(i);
                return `
                <div class="ai-preview-option ${isCorrect ? 'correct' : ''}"
                     style="background: ${color.bg}; border-left: 4px solid ${color.border};">
                    <span class="ai-option-letter" style="color: ${color.text}; font-weight: 700;">${String.fromCharCode(65 + i)}</span>
                    <span class="ai-option-text">${this.escapeHtml(opt)}</span>
                    ${isCorrect ? '<span class="ai-correct-badge">✓</span>' : ''}
                </div>`;
            }).join('');
        } else if (question.type === 'numeric') {
            const answerLabel = translationManager.getTranslationSync('correct_answer') || 'Correct Answer';
            const color = optionColors[0];
            optionsHtml = `
                <div class="ai-preview-option correct" style="background: ${color.bg}; border-left: 4px solid ${color.border};">
                    <span class="ai-option-letter" style="color: ${color.text}; font-weight: 700;">${answerLabel}:</span>
                    <span class="ai-option-text">${question.correctAnswer}</span>
                    <span class="ai-correct-badge">✓</span>
                </div>`;
        } else if (question.type === 'ordering') {
            const items = question.options || question.items || [];
            optionsHtml = items.map((item, i) => {
                const color = optionColors[i % optionColors.length];
                return `
                <div class="ai-preview-option" style="background: ${color.bg}; border-left: 4px solid ${color.border};">
                    <span class="ai-option-letter" style="color: ${color.text}; font-weight: 700;">${i + 1}</span>
                    <span class="ai-option-text">${this.escapeHtml(item)}</span>
                </div>`;
            }).join('');
        }

        // Explanation section if available
        const explanationHtml = question.explanation
            ? `<div class="ai-preview-explanation"><span class="explanation-icon">💡</span> ${this.escapeHtml(question.explanation)}</div>`
            : '';

        // Difficulty badge with color
        const difficulty = question.difficulty || 'medium';
        const difficultyColors = {
            easy: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
            medium: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
            hard: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' }
        };
        const diffColor = difficultyColors[difficulty] || difficultyColors.medium;
        const difficultyLabel = translationManager.getTranslationSync(difficulty) || difficulty;

        // Time limit display
        const timeLimit = question.timeLimit || 30;

        div.innerHTML = `
            <div class="ai-preview-header">
                <label class="ai-preview-checkbox">
                    <input type="checkbox" ${question.selected ? 'checked' : ''} />
                    <span class="checkmark"></span>
                </label>
                <div class="ai-preview-badges">
                    <span class="ai-type-badge">${typeLabel}</span>
                    <span class="ai-difficulty-badge" style="background: ${diffColor.bg}; color: ${diffColor.text};">${difficultyLabel}</span>
                    <span class="ai-time-badge">⏱️ ${timeLimit}s</span>
                </div>
            </div>
            <div class="ai-preview-question-text">${this.escapeHtml(question.question)}</div>
            <div class="ai-preview-options">${optionsHtml}</div>
            ${explanationHtml}
        `;

        // Add click handler for checkbox
        const checkbox = div.querySelector('input[type="checkbox"]');
        checkbox?.addEventListener('change', (e) => {
            e.stopPropagation();
            this.toggleQuestionSelection(index, e.target.checked);
        });

        // Toggle selection on card click (but not on checkbox)
        div.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                const newState = !this.previewQuestions[index].selected;
                this.toggleQuestionSelection(index, newState);
                if (checkbox) checkbox.checked = newState;
            }
        });

        return div;
    }

    /**
     * Toggle selection state of a question
     * @param {number} index - Question index
     * @param {boolean} selected - New selection state
     */
    toggleQuestionSelection(index, selected) {
        if (!this.previewQuestions[index]) return;

        this.previewQuestions[index].selected = selected;

        // Update visual state
        const item = document.querySelector(`.preview-question-item[data-index="${index}"]`);
        if (item) {
            item.classList.toggle('selected', selected);
            item.classList.toggle('rejected', !selected);
        }

        this.updatePreviewSummary();
    }

    /**
     * Select or deselect all questions
     * @param {boolean} select - True to select all, false to deselect all
     */
    selectAllQuestions(select) {
        this.previewQuestions.forEach((q, index) => {
            q.selected = select;
            const item = document.querySelector(`.preview-question-item[data-index="${index}"]`);
            if (item) {
                item.classList.toggle('selected', select);
                item.classList.toggle('rejected', !select);
            }
        });
        this.updatePreviewSummary();
    }

    /**
     * Update the preview summary with selected count
     */
    updatePreviewSummary() {
        const selectedCount = this.previewQuestions.filter(q => q.selected).length;
        const totalCount = this.previewQuestions.length;

        const selectedCountEl = document.getElementById('selected-count');
        const totalCountEl = document.getElementById('total-generated-count');
        const confirmBtn = document.getElementById('confirm-add-questions');

        if (selectedCountEl) selectedCountEl.textContent = selectedCount;
        if (totalCountEl) totalCountEl.textContent = totalCount;
        if (confirmBtn) confirmBtn.disabled = selectedCount === 0;
    }

    /**
     * Close the preview modal
     */
    closePreviewModal() {
        const previewModal = document.getElementById('question-preview-modal');
        if (previewModal) {
            previewModal.style.display = 'none';
        }
        this.previewQuestions = [];
    }

    /**
     * Confirm and add selected questions to the quiz
     */
    async confirmAddSelectedQuestions() {
        const selectedQuestions = this.previewQuestions
            .filter(q => q.selected)
            .map(({ selected, index, ...q }) => q); // Remove selection metadata

        if (selectedQuestions.length === 0) {
            showToast(translationManager.getTranslationSync('no_questions_selected') || 'No questions selected', 'warning');
            return;
        }

        // Close preview modal
        this.closePreviewModal();

        // Close AI generator modal
        this.closeModal();

        // Process the selected questions
        await this.processGeneratedQuestions(selectedQuestions, false);
        this.playCompletionChime();

        // Show success message
        setTimeout(() => {
            showAlert('successfully_generated_questions', [selectedQuestions.length]);
        }, 100);
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async generateQuestions() {
        logger.debug('generateQuestions called');

        // Prevent multiple simultaneous generations
        if (this.isGenerating) {
            logger.debug('Generation already in progress, ignoring request');
            return;
        }
        
        this.isGenerating = true;
        
        // Direct validation - show errors to user instead of silent failure
        let provider, content, questionCount, difficulty, selectedTypes;
        
        try {
            provider = document.getElementById('ai-provider')?.value;
            content = document.getElementById('source-content')?.value?.trim();
            questionCount = parseInt(document.getElementById('question-count')?.value) || 1;
            difficulty = document.getElementById('difficulty-level')?.value || 'medium';
            
            logger.debug('Form values:', { provider, content: content?.length, questionCount, difficulty });

            // Get selected question types
            selectedTypes = [];
            if (document.getElementById('type-multiple-choice')?.checked) {
                selectedTypes.push('multiple-choice');
            }
            if (document.getElementById('type-true-false')?.checked) {
                selectedTypes.push('true-false');
            }
            if (document.getElementById('type-multiple-correct')?.checked) {
                selectedTypes.push('multiple-correct');
            }
            if (document.getElementById('type-numeric')?.checked) {
                selectedTypes.push('numeric');
            }
            
            logger.debug('Selected question types:', selectedTypes);
            
            // Validate required fields with custom red popups
            if (!provider) {
                logger.debug('No provider selected');
                this.showSimpleErrorPopup('No AI Provider Selected', '❌ Please select an AI provider to generate questions.\n\nAvailable options:\n• OpenAI (paid)\n• Claude (paid)\n• Gemini (paid)\n• Ollama (free, local)', '🤖');
                this.isGenerating = false;
                return;
            }
            
            if (!content) {
                logger.debug('No content provided');
                this.showSimpleErrorPopup('No Content Provided', '❌ Please enter source content for question generation.\n\n💡 You can provide:\n• Text passages to create questions about\n• Topics you want questions on\n• Educational content to quiz students about\n• Any material you want to turn into quiz questions', '📝');
                this.isGenerating = false;
                return;
            }
            
            if (selectedTypes.length === 0) {
                logger.debug('No question types selected');
                this.showSimpleErrorPopup('No Question Types Selected', '❌ Please select at least one question type to generate.\n\n✅ Available types:\n• Multiple Choice (4 options, 1 correct)\n• True/False (factual statements)\n• Multiple Correct (select all that apply)\n• Numeric (number-based answers)');
                this.isGenerating = false;
                return;
            }
            
        } catch (error) {
            logger.error('Validation error:', error);
            this.showSimpleErrorPopup('Validation Error', `❌ Form validation failed: ${error.message}\n\nPlease check your inputs and try again.`);
            this.isGenerating = false;
            return;
        }
        
        // Store the requested count for use throughout the process
        this.requestedQuestionCount = questionCount;

        // Check for API key if required
        const needsApiKey = this.providers[provider]?.apiKey;
        logger.debug('Provider needs API key:', { provider, needsApiKey });
        
        if (needsApiKey) {
            const apiKey = await secureStorage.getSecureItem(`api_key_${provider}`);
            logger.debug(`API key validation for ${provider}:`, {
                exists: !!apiKey,
                length: apiKey?.length || 0,
                type: typeof apiKey
            });
            
            if (!apiKey || apiKey.trim().length === 0) {
                logger.warn(`Missing or empty API key for provider: ${provider}`);
                this.showApiKeyErrorPopup(provider, 'missing');
                this.isGenerating = false;
                return;
            }
        }

        // Show loading state
        const generateBtn = document.getElementById('generate-questions');
        const statusDiv = document.getElementById('generation-status');
        
        if (generateBtn) generateBtn.disabled = true;
        if (statusDiv) statusDiv.style.display = 'block';

        try {
            logger.debug('Starting question generation with provider:', provider);

            // Check if this is batched Excel processing
            if (this.batchInfo) {
                logger.debug('🔄 Starting batched Excel processing');
                await this.processBatchedGeneration();
                return; // processBatchedGeneration handles the full flow
            }
            
            // Build prompt based on content type and settings, including selected question types
            const prompt = this.buildPrompt(content, questionCount, difficulty, selectedTypes);
            
            let questions = [];
            try {
                switch (provider) {
                    case 'ollama':
                        questions = await this.generateWithOllama(prompt);
                        break;
                    case 'openai':
                        questions = await this.generateWithOpenAI(prompt);
                        break;
                    case 'claude':
                        questions = await this.generateWithClaude(prompt);
                        break;
                    case 'gemini':
                        questions = await this.generateWithGemini(prompt);
                        break;
                }
            } catch (providerError) {
                logger.debug('Provider error caught:', providerError.message);

                // Handle API key related errors with custom popup
                if (providerError.message.includes('Invalid') && providerError.message.includes('API key')) {
                    this.showApiKeyErrorPopup(provider, 'invalid', providerError.message);
                    return;
                } else if (providerError.message.includes('401') || providerError.message.includes('Unauthorized')) {
                    this.showApiKeyErrorPopup(provider, 'invalid', 'Unauthorized - please check your API key');
                    return;
                } else if (providerError.message.includes('429') || providerError.message.includes('rate limit')) {
                    this.showApiKeyErrorPopup(provider, 'network', 'Rate limit exceeded - please try again in a few minutes');
                    return;
                } else if (providerError.message.includes('quota') || providerError.message.includes('billing')) {
                    this.showApiKeyErrorPopup(provider, 'invalid', 'Account quota exceeded or billing issue - please check your account');
                    return;
                } else {
                    // For other errors, show a custom red alert instead of green showAlert
                    this.showSimpleErrorPopup('Generation Failed', `❌ ${providerError.message}\n\n🔧 Possible solutions:\n• Check your API key is correct\n• Verify your account has credits\n• Try with different content\n• Wait a moment and try again`);
                    return;
                }
            }

            logger.debug('Generation completed, questions:', questions?.length);

            if (questions && questions.length > 0) {
                // Double-check the count one more time before processing
                if (questions.length > this.requestedQuestionCount) {
                    questions = questions.slice(0, this.requestedQuestionCount);
                }

                // Show preview modal for user to select which questions to add
                this.showQuestionPreview(questions);
                this.isGenerating = false;
            } else {
                logger.debug('No questions generated');
                this.showSimpleErrorPopup('No Questions Generated', '❌ The AI provider returned no questions.\n\n🔧 Try:\n• Providing more detailed content\n• Using different question types\n• Rephrasing your content\n• Checking if your content is suitable for quiz questions');
            }

        } finally {
            // Reset UI
            if (generateBtn) generateBtn.disabled = false;
            if (statusDiv) statusDiv.style.display = 'none';
            this.isGenerating = false;
        }
    }

    async processBatchedGeneration() {
        if (!this.batchInfo) {
            logger.warn('processBatchedGeneration called without batch info');
            return;
        }
        
        const { totalBatches, currentBatch, originalData, filename, batchSize } = this.batchInfo;
        
        // Update status to show batch progress
        const statusDiv = document.getElementById('generation-status');
        if (statusDiv) {
            // Ensure status div is visible for batch processing
            statusDiv.style.display = 'block';
            
            const statusText = statusDiv.querySelector('span');
            if (statusText) {
                statusText.textContent = `Processing batch ${currentBatch} of ${totalBatches}...`;
            } else {
                // Create status text if it doesn't exist
                const newStatusText = document.createElement('span');
                newStatusText.textContent = `Processing batch ${currentBatch} of ${totalBatches}...`;
                statusDiv.appendChild(newStatusText);
            }
        }
        
        // Process next batch
        const batchStart = (currentBatch - 1) * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, this.batchInfo.totalQuestions);
        logger.debug(`📦 Processing batch ${currentBatch}: questions ${batchStart + 1}-${batchEnd}`);
        
        const structuredText = this.convertExcelToStructuredText(
            originalData, 
            filename, 
            batchStart, 
            batchSize
        );
        
        logger.debug(`📦 Batch ${currentBatch} structured text length:`, structuredText.length);
        
        // Get form values
        const provider = document.getElementById('ai-provider')?.value || 'ollama';
        const difficulty = document.getElementById('difficulty-level')?.value || 'medium';
        const selectedTypes = ['multiple-choice']; // Default for Excel conversion
        
        // Build prompt and generate
        const prompt = this.buildPrompt(structuredText, batchSize, difficulty, selectedTypes);
        
        let questions = [];
        try {
            switch (provider) {
                case 'ollama':
                    questions = await this.generateWithOllama(prompt);
                    break;
                case 'openai':
                    questions = await this.generateWithOpenAI(prompt);
                    break;
                case 'claude':
                    questions = await this.generateWithClaude(prompt);
                    break;
                case 'gemini':
                    questions = await this.generateWithGemini(prompt);
                    break;
            }
        } catch (error) {
            logger.error('Batch generation error:', error);
            showAlert(`Batch ${currentBatch} failed: ${error.message}`, 'error');
            return;
        }
        
        if (questions && questions.length > 0) {
            // Process questions for this batch
            await this.processGeneratedQuestions(questions, false);
            
            logger.debug(`✅ Batch ${currentBatch} completed: ${questions.length} questions processed`);
            
            // Check if we have more batches
            if (currentBatch < totalBatches) {
                // Prepare next batch
                this.batchInfo.currentBatch++;
                
                // Add delay between batches to be respectful to APIs
                setTimeout(() => {
                    this.processBatchedGeneration();
                }, 2000); // 2-second delay between batches
            } else {
                // All batches complete!
                this.playCompletionChime();
                this.closeModal();
                showAlert(`🎉 All ${totalBatches} batches completed! ${this.batchInfo.totalQuestions} questions generated successfully.`, 'success');
                
                // Reset batch info
                this.batchInfo = null;
                this.isGenerating = false;
                
                // Reset UI
                const generateBtn = document.getElementById('generate-questions');
                const statusDiv = document.getElementById('generation-status');
                if (generateBtn) generateBtn.disabled = false;
                if (statusDiv) statusDiv.style.display = 'none';
            }
        } else {
            showAlert(`Batch ${currentBatch} generated no questions`, 'warning');
            this.batchInfo = null;
            this.isGenerating = false;
        }
    }

    playCompletionChime() {
        // Create and play completion sound similar to Claude Code's hook chime
        try {
            // Create a pleasant completion chime using Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create a sequence of pleasant tones
            const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 - major chord
            const duration = 0.3;
            
            frequencies.forEach((frequency, index) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + index * 0.15);
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0, audioContext.currentTime + index * 0.15);
                gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + index * 0.15 + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + index * 0.15 + duration);
                
                oscillator.start(audioContext.currentTime + index * 0.15);
                oscillator.stop(audioContext.currentTime + index * 0.15 + duration);
            });
            
            logger.debug('🔔 Completion chime played');
        } catch (error) {
            logger.debug('Could not play completion chime:', error);
            // Fallback: try to play a system beep
            try {
                const utterance = new SpeechSynthesisUtterance('');
                utterance.volume = 0;
                speechSynthesis.speak(utterance);
            } catch (fallbackError) {
                logger.debug('Fallback chime also failed');
            }
        }
    }

    buildPrompt(content, questionCount, difficulty, selectedTypes) {
        // Safety check for parameters
        if (!selectedTypes || !Array.isArray(selectedTypes)) {
            logger.warn('buildPrompt called with invalid selectedTypes:', selectedTypes);
            selectedTypes = ['multiple-choice']; // Default fallback
        }

        // Check if this is Excel-converted content
        if (content.includes('# Quiz Questions from Excel File:') && content.includes('INSTRUCTIONS FOR AI:')) {
            return this.buildExcelConversionPrompt(content, selectedTypes);
        }

        // Detect content type for smart formatting
        const contentInfo = this.detectContentType(content);
        const contentType = contentInfo.type || 'general';

        // Check if content has existing questions to format vs content to generate from
        const isFormattingExistingQuestions = contentInfo.hasExistingQuestions;

        // Get Bloom's taxonomy cognitive level
        const cognitiveLevel = document.getElementById('cognitive-level')?.value || 'mixed';

        // Use translation manager to get current app language
        const language = translationManager.getCurrentLanguage() || 'en';

        const languageNames = {
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'pl': 'Polish',
            'ja': 'Japanese',
            'zh': 'Chinese'
        };

        const targetLanguage = languageNames[language] || 'English';

        // Build Bloom's taxonomy instructions
        const bloomInstructions = this.buildBloomInstructions(cognitiveLevel);

        // Build question type description
        let typeDescription = isFormattingExistingQuestions
            ? `Format and convert the following ${questionCount} existing question${questionCount === 1 ? '' : 's'} into proper quiz format.`
            : `Create EXACTLY ${questionCount} question${questionCount === 1 ? '' : 's'} about the following content. Difficulty: ${difficulty}. Content type detected: ${contentType}.`;

        let structureExamples = [];

        // Build examples with LaTeX/code formatting based on content type
        if (selectedTypes.includes('multiple-choice')) {
            typeDescription += '\n- Some questions should be multiple choice (4 options, one correct)';
            if (contentInfo.needsLatex) {
                structureExamples.push('{"question": "What is the derivative of $f(x) = x^2 + 3x$?", "type": "multiple-choice", "options": ["$2x + 3$", "$x^2 + 3$", "$2x$", "$3x + 2$"], "correctAnswer": 0, "timeLimit": 30, "explanation": "Using power rule: derivative of $x^2$ is $2x$, derivative of $3x$ is $3$", "difficulty": "medium"}');
            } else if (contentInfo.needsCodeBlocks) {
                const lang = contentInfo.language || 'python';
                structureExamples.push(`{"question": "What will this code output?\\n\`\`\`${lang}\\nprint(2 + 3 * 4)\\n\`\`\`", "type": "multiple-choice", "options": ["14", "20", "24", "Error"], "correctAnswer": 0, "timeLimit": 30, "explanation": "Multiplication has higher precedence than addition: 3*4=12, then 2+12=14", "difficulty": "easy"}`);
            } else {
                structureExamples.push('{"question": "Question text here?", "type": "multiple-choice", "options": ["Option A", "Option B", "Option C", "Option D"], "correctAnswer": 0, "timeLimit": 30, "explanation": "Brief explanation of why this answer is correct", "difficulty": "medium"}');
            }
        }
        if (selectedTypes.includes('true-false')) {
            typeDescription += '\n- Some questions should be true/false (single factual statements)';
            if (contentInfo.needsLatex) {
                structureExamples.push('{"question": "The integral $\\\\int x^2 dx = \\\\frac{x^3}{3} + C$", "type": "true-false", "options": ["True", "False"], "correctAnswer": "true", "timeLimit": 20, "explanation": "This is the correct antiderivative of $x^2$", "difficulty": "medium"}');
            } else {
                structureExamples.push('{"question": "Statement about the content.", "type": "true-false", "options": ["True", "False"], "correctAnswer": "true", "timeLimit": 20, "explanation": "Explanation of the correct answer", "difficulty": "easy"}');
            }
        }
        if (selectedTypes.includes('multiple-correct')) {
            typeDescription += '\n- Some questions should allow multiple correct answers (use "correctAnswers" array)';
            structureExamples.push('{"question": "Which of the following are TRUE? (Select all)", "type": "multiple-correct", "options": ["Correct A", "Wrong B", "Correct C", "Correct D"], "correctAnswers": [0, 2, 3], "timeLimit": 35, "explanation": "Options A, C, and D are correct because...", "difficulty": "hard"}');
        }
        if (selectedTypes.includes('numeric')) {
            typeDescription += '\n- Some questions should have numeric answers';
            if (contentInfo.needsLatex) {
                structureExamples.push('{"question": "Solve for $x$: $2x + 6 = 14$", "type": "numeric", "correctAnswer": 4, "tolerance": 0, "timeLimit": 25, "explanation": "$2x = 8$, so $x = 4$", "difficulty": "easy"}');
            } else {
                structureExamples.push('{"question": "Numeric question from content?", "type": "numeric", "correctAnswer": 1991, "tolerance": 0, "timeLimit": 25, "explanation": "Explanation of the answer", "difficulty": "medium"}');
            }
        }

        const structureExample = `Return ONLY a valid JSON array with structures like these:\n[${structureExamples.join(',\n')}]`;

        // Build formatting instructions based on content type
        const formattingInstructions = this.buildFormattingInstructions(contentInfo);

        // Build the main prompt
        let prompt = `${typeDescription}
${bloomInstructions}
CONTENT ${isFormattingExistingQuestions ? 'CONTAINING QUESTIONS TO FORMAT' : 'TO CREATE QUESTIONS FROM'}:
${content}

${structureExample}
${formattingInstructions}
CRITICAL REQUIREMENTS:
- Generate ALL questions in ${targetLanguage} language
- Generate EXACTLY ${questionCount} question${questionCount === 1 ? '' : 's'} - no more, no less
${isFormattingExistingQuestions ? '- PRESERVE the original question text and answers as much as possible' : '- EVERY question MUST be directly based on the content provided'}
- Questions must reference specific facts, concepts, or details from the content
- Mix different question types: ${selectedTypes.join(', ')}
- For true/false: Create factual statements, NOT binary choices
- For numeric: Numbers must come from content or be solvable from it
- Return ONLY the JSON array, no other text
- Use EXACTLY these JSON structures:
  * Multiple-choice: correctAnswer as integer (0-3), options array with 4 items
  * True-false: options ["True", "False"], correctAnswer as string ("true"/"false")
  * Multiple-correct: correctAnswers as array of indices, options array
  * Numeric: correctAnswer as number, tolerance as number, NO options array
- Include "timeLimit" (15-40 seconds), "explanation", and "difficulty" fields
- Ensure all JSON is properly formatted and valid

IMAGE/DIAGRAM GENERATION (OPTIONAL):
- Add "imageData" and "imageType" fields when visuals would help
- imageType: "svg" or "mermaid"

MERMAID (for processes/flowcharts):
- Valid Mermaid syntax: graph TD; A[Start] --> B[Step]; B --> C[End];
- Example: graph LR; A[Input] --> B{Decision}; B -->|Yes| C[Action]; B -->|No| D[End];

SVG (for shapes/diagrams):
- Valid SVG with viewBox="0 0 400 300"
- Example: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><circle cx="200" cy="150" r="80" fill="#4CAF50"/></svg>

Put COMPLETE code in imageData - don't truncate!`;

        return prompt;
    }

    /**
     * Build Bloom's taxonomy instructions based on selected cognitive level
     */
    buildBloomInstructions(cognitiveLevel) {
        if (cognitiveLevel === 'mixed') {
            return `
COGNITIVE LEVELS (Bloom's Taxonomy):
- Mix questions across different cognitive levels for variety
- Include some recall questions (Remember)
- Include some understanding questions (Understand)
- Include some application questions (Apply)
`;
        }

        const bloomDescriptions = {
            'remember': {
                verbs: ['define', 'list', 'name', 'recall', 'identify', 'recognize', 'state'],
                description: 'Focus on RECALL and RECOGNITION of facts',
                example: 'What is the capital of France?'
            },
            'understand': {
                verbs: ['explain', 'describe', 'summarize', 'interpret', 'classify', 'compare'],
                description: 'Focus on EXPLAINING and INTERPRETING concepts',
                example: 'Why does water boil at 100°C at sea level?'
            },
            'apply': {
                verbs: ['apply', 'demonstrate', 'solve', 'use', 'implement', 'execute'],
                description: 'Focus on USING knowledge in new situations',
                example: 'Calculate the area of a triangle with base 5 and height 8.'
            },
            'analyze': {
                verbs: ['analyze', 'compare', 'contrast', 'differentiate', 'examine', 'investigate'],
                description: 'Focus on BREAKING DOWN information and finding relationships',
                example: 'Compare and contrast mitosis and meiosis.'
            },
            'evaluate': {
                verbs: ['evaluate', 'judge', 'critique', 'justify', 'argue', 'defend'],
                description: 'Focus on MAKING JUDGMENTS based on criteria',
                example: 'Which solution is most effective for reducing carbon emissions and why?'
            },
            'create': {
                verbs: ['create', 'design', 'construct', 'develop', 'formulate', 'propose'],
                description: 'Focus on CREATING new ideas or products',
                example: 'Design an experiment to test plant growth under different light conditions.'
            }
        };

        const level = bloomDescriptions[cognitiveLevel];
        if (!level) return '';

        return `
COGNITIVE LEVEL (Bloom's Taxonomy - ${cognitiveLevel.toUpperCase()}):
- ${level.description}
- Use action verbs like: ${level.verbs.join(', ')}
- Example question style: "${level.example}"
- All questions should target THIS cognitive level
`;
    }

    buildExcelConversionPrompt(content, selectedTypes) {
        const language = translationManager.getCurrentLanguage() || 'en';
        const languageNames = {
            'en': 'English',
            'es': 'Spanish', 
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese', 
            'pl': 'Polish',
            'ja': 'Japanese',
            'zh': 'Chinese'
        };
        const targetLanguage = languageNames[language] || 'English';

        return `CONVERT EXCEL QUESTIONS TO JSON - DO NOT MAKE UP NEW QUESTIONS

You must convert ONLY the questions that are in this Excel data. Do not create any new questions.

${content}

STEP BY STEP INSTRUCTIONS:
1. Find each "Question X:" section in the Excel data above
2. For each question, copy the exact text and answers from the Excel
3. Convert to JSON format shown below
4. Do NOT translate or change any text
5. Do NOT create questions not in the Excel

JSON TEMPLATE - Use exactly this format:
{"question": "EXACT_TEXT_FROM_EXCEL_COLUMN_A", "type": "multiple-choice", "options": ["EXACT_TEXT_FROM_COLUMN_B", "EXACT_TEXT_FROM_COLUMN_C", "EXACT_TEXT_FROM_COLUMN_D", "EXACT_TEXT_FROM_COLUMN_E"], "correctAnswer": 0, "timeLimit": 30}

CRITICAL RULES:
- Use ONLY questions that appear in the Excel data above
- COPY TEXT EXACTLY AS WRITTEN - do NOT change, rephrase, translate, or modify ANY words
- DO NOT fix grammar, spelling, or punctuation - use the exact text from Excel
- DO NOT add punctuation marks if they're not in the original text
- DO NOT change question marks, periods, or any formatting
- CRITICAL: Use the CORRECT_ANSWER_INDEX provided for each question:
  * Look for "CORRECT_ANSWER_INDEX: [number]" in the data
  * Use that exact number as the correctAnswer field
  * Do NOT try to figure out the correct answer yourself
  * The correctAnswer field must be 0, 1, 2, or 3 (not A, B, C, D)
- Return valid JSON array format: [{"question": ...}, {"question": ...}]
- NO explanations, NO extra text, ONLY the JSON array
- PRESERVE EXACT TEXT: Copy every word, space, and character exactly as it appears in the Excel

Start converting now. Return only the JSON array.`;
    }


    async generateWithOllama(prompt) {
        return await errorHandler.safeNetworkOperation(async () => {
            const model = localStorage.getItem('ollama_selected_model') || AI.OLLAMA_DEFAULT_MODEL;
            const timestamp = Date.now();
            const randomSeed = Math.floor(Math.random() * 10000);
            
            // Enhanced prompt specifically for Ollama to ensure 4 options
            const enhancedPrompt = `[Session: ${timestamp}-${randomSeed}] ${prompt}

OLLAMA SPECIFIC REQUIREMENTS:
- For multiple-choice questions: You MUST provide exactly 4 options in the "options" array
- NEVER generate multiple-choice questions with 3 or fewer options
- If you cannot think of 4 good options, create plausible distractors related to the content
- Example: "options": ["Correct answer", "Related but wrong", "Plausible distractor", "Another distractor"]

Please respond with only valid JSON. Do not include explanations or additional text.`;

            const response = await fetch(AI.OLLAMA_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    prompt: enhancedPrompt,
                    stream: false,
                    options: {
                        temperature: AI.DEFAULT_TEMPERATURE,
                        seed: randomSeed
                    }
                })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Ollama server not running. Please start Ollama and try again.');
                } else if (response.status === 0) {
                    throw new Error('Cannot connect to Ollama. Make sure Ollama is running on localhost:11434');
                } else {
                    throw new Error(`Ollama error: ${response.status} - ${response.statusText}`);
                }
            }

            const data = await response.json();
            return this.parseAIResponse(data.response);
        }, {
            context: 'ollama-generation',
            userMessage: 'Failed to generate questions with Ollama. Please ensure Ollama is running and try again.',
            retryable: true
        });
    }

    async generateWithOpenAI(prompt) {
        return await errorHandler.safeNetworkOperation(async () => {
            const apiKey = await secureStorage.getSecureItem('api_key_openai');
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: AI.OPENAI_MODEL,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    temperature: AI.DEFAULT_TEMPERATURE
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid OpenAI API key. Please check your credentials.');
                } else if (response.status === 429) {
                    throw new Error('OpenAI rate limit exceeded. Please try again later.');
                } else if (response.status === 402) {
                    throw new Error('OpenAI billing issue. Please check your account balance and payment method.');
                } else if (response.status === 403) {
                    throw new Error('OpenAI API access forbidden. Please check your API key permissions.');
                } else {
                    const errorText = await response.text();
                    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
                }
            }

            const data = await response.json();
            return this.parseAIResponse(data.choices[0].message.content);
        }, {
            context: 'openai-generation',
            userMessage: 'Failed to generate questions with OpenAI. Please check your API key and try again.',
            retryable: true
        });
    }

    async generateWithClaude(prompt) {
        logger.debug('generateWithClaude called');

        try {
            const apiKey = await secureStorage.getSecureItem('api_key_claude');
            logger.debug('Claude API key retrieved:', !!apiKey);
            
            const response = await fetch(APIHelper.getApiUrl('api/claude/generate'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    apiKey: apiKey,
                    numQuestions: this.requestedQuestionCount || 5
                })
            });

            logger.debug('Claude API response status:', response.status);

            if (!response.ok) {
                let errorMessage = `Claude API error (${response.status})`;
                
                if (response.status === 401) {
                    errorMessage = 'Invalid Claude API key. Please check your credentials.';
                } else if (response.status === 429) {
                    errorMessage = 'Claude rate limit exceeded. Please try again later.';
                } else if (response.status === 402) {
                    errorMessage = 'Claude billing issue. Please check your account balance.';
                } else if (response.status === 403) {
                    errorMessage = 'Claude API access forbidden. Please check your API key permissions.';
                } else {
                    try {
                        const errorText = await response.text();
                        errorMessage = `Claude API error (${response.status}): ${errorText}`;
                    } catch (e) {
                        errorMessage = `Claude API error (${response.status})`;
                    }
                }

                logger.debug('Claude API error message:', errorMessage);
                throw new Error(errorMessage);
            }

            const data = await response.json();
            logger.debug('Claude API success, parsing response');
            
            // Claude API returns content in data.content[0].text format
            let content = '';
            if (data.content && Array.isArray(data.content) && data.content.length > 0) {
                content = data.content[0].text || data.content[0].content || '';
            } else if (data.content) {
                content = data.content;
            } else {
                throw new Error('Invalid Claude API response structure');
            }
            
            return this.parseAIResponse(content);
            
        } catch (error) {
            logger.debug('Claude generation error caught:', error.message);

            // Show error popup directly
            this.showSimpleErrorPopup('Claude Error', error.message, '❌');
            
            // Re-throw to stop further processing
            throw error;
        }
    }

    async generateWithGemini(prompt) {
        return await errorHandler.safeNetworkOperation(async () => {
            const apiKey = await secureStorage.getSecureItem('api_key_gemini');
            
            // Import the Google Gen AI library dynamically
            const { GoogleGenAI } = await import('https://esm.sh/@google/genai@0.21.0');
            
            const ai = new GoogleGenAI({ apiKey: apiKey });
            
            try {
                const response = await ai.models.generateContent({
                    model: AI.GEMINI_MODEL,
                    contents: prompt,
                    config: {
                        temperature: AI.DEFAULT_TEMPERATURE,
                        maxOutputTokens: AI.GEMINI_MAX_TOKENS,
                        candidateCount: 1,
                        responseMimeType: 'text/plain'
                    }
                });

                if (!response || !response.text) {
                    throw new Error('Invalid Gemini API response structure');
                }

                const content = response.text();
                logger.debug('Gemini API response:', content);
                
                return this.parseAIResponse(content);
                
            } catch (error) {
                if (error.message.includes('API key') || error.message.includes('invalid_api_key')) {
                    throw new Error('Invalid Gemini API key. Please check your credentials.');
                } else if (error.message.includes('quota') || error.message.includes('429') || error.message.includes('RATE_LIMIT_EXCEEDED')) {
                    throw new Error('Gemini rate limit exceeded. Please try again later.');
                } else if (error.message.includes('billing') || error.message.includes('QUOTA_EXCEEDED')) {
                    throw new Error('Gemini quota exceeded. Please check your account billing and quotas.');
                } else if (error.message.includes('safety') || error.message.includes('blocked') || error.message.includes('SAFETY')) {
                    throw new Error('Content blocked by Gemini safety filters. Try rephrasing your prompt.');
                } else if (error.message.includes('permission') || error.message.includes('forbidden') || error.message.includes('403')) {
                    throw new Error('Gemini API access forbidden. Please check your API key permissions.');
                } else {
                    throw new Error(`Gemini API error: ${error.message}`);
                }
            }
        }, {
            context: 'gemini-generation',
            userMessage: 'Failed to generate questions with Gemini. Please check your API key and try again.',
            retryable: true
        });
    }

    parseAIResponse(responseText) {
        logger.debug('🔍 ParseAIResponse - Raw response length:', responseText.length);
        logger.debug('🔍 ParseAIResponse - Raw response preview:', responseText.substring(0, 200) + '...');
        
        try {
            // Clean up the response text
            let cleanText = responseText.trim();
            
            // Handle code models that might return comments or explanations
            // Remove common code comments at the start of response
            cleanText = cleanText.replace(/^\/\/[^\n]*\n?/gm, ''); // Remove // comments
            cleanText = cleanText.replace(/^\/\*[\s\S]*?\*\/\n?/gm, ''); // Remove /* */ comments
            cleanText = cleanText.replace(/^#[^\n]*\n?/gm, ''); // Remove # comments
            cleanText = cleanText.replace(/^<!--[\s\S]*?-->\n?/gm, ''); // Remove HTML comments
            
            // Remove explanation text before JSON (common with code models)
            const explanationPatterns = [
                /^Here's?\s+(?:the|a)\s+JSON.*?:\s*/i,
                /^(?:Here\s+is|This\s+is)\s+.*?:\s*/i,
                /^(?:Based\s+on|From)\s+.*?:\s*/i,
                /^(?:The\s+)?(?:JSON|Array)\s+(?:response|output)\s*:?\s*/i,
                /^(?:Generated\s+)?(?:Questions?|Quiz)\s*:?\s*/i
            ];
            
            for (const pattern of explanationPatterns) {
                cleanText = cleanText.replace(pattern, '');
            }
            
            cleanText = cleanText.trim();
            
            // Detect if response is primarily code (common with code-specialized models like CodeLlama)
            const codePatterns = /^(from\s+\w+\s+import|import\s+\w+|def\s+\w+|class\s+\w+|function\s+\w+|var\s+\w+|const\s+\w+|let\s+\w+)/m;
            if (codePatterns.test(cleanText) && !cleanText.includes('[') && !cleanText.includes('{')) {
                throw new Error('Code models like CodeLlama are designed for code generation, not quiz creation. Please use Ollama with a general model like llama3.2 instead.');
            }
            
            // Extract JSON from markdown code blocks if present
            const jsonMatch = cleanText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
            if (jsonMatch) {
                cleanText = jsonMatch[1];
                logger.debug('🔍 ParseAIResponse - Extracted from code block');
            }
            
            // Try to extract JSON array from text even if not in code blocks
            const arrayMatch = cleanText.match(/\[[\s\S]*\]/);
            if (arrayMatch && !jsonMatch) {
                cleanText = arrayMatch[0];
                logger.debug('🔍 ParseAIResponse - Extracted JSON array from text');
            }
            
            // Remove any text before the JSON array
            const startBracket = cleanText.indexOf('[');
            const endBracket = cleanText.lastIndexOf(']');
            if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
                cleanText = cleanText.substring(startBracket, endBracket + 1);
            }
            
            // Try to fix common JSON issues for Claude/large models
            cleanText = this.fixCommonJsonIssues(cleanText);
            
            logger.debug('🔍 ParseAIResponse - Clean text for parsing:', cleanText.substring(0, 300) + '...');
            
            // Try to parse as JSON
            const parsed = JSON.parse(cleanText);
            logger.debug('🔍 ParseAIResponse - JSON parsed successfully');
            
            // Handle both single question object and array of questions
            let questions = Array.isArray(parsed) ? parsed : [parsed];
            logger.debug('🔍 ParseAIResponse - Questions after array handling:', questions.length);
            
            // Limit to requested count (in case AI generates more than requested)
            const requestedCount = this.requestedQuestionCount || 1;
            logger.debug('🔍 ParseAIResponse - Requested count:', requestedCount);
            
            if (questions.length > requestedCount) {
                logger.debug('🔍 ParseAIResponse - Truncating from', questions.length, 'to', requestedCount);
                questions = questions.slice(0, requestedCount);
            }
            
            logger.debug('🔍 ParseAIResponse - Final questions count:', questions.length);
            questions.forEach((q, i) => {
                logger.debug(`🔍 ParseAIResponse - Question ${i + 1}:`, {
                    type: q.type,
                    question: q.question?.substring(0, 50) + '...',
                    hasOptions: !!q.options,
                    optionsCount: q.options?.length,
                    correctAnswer: q.correctAnswer,
                    correctAnswers: q.correctAnswers
                });
            });
            
            return questions;
            
        } catch (error) {
            logger.error('🔍 ParseAIResponse - JSON parsing failed:', error);
            logger.error('🔍 ParseAIResponse - Failed text:', responseText.substring(0, 1000));
            
            // Try to extract questions manually if JSON parsing fails
            try {
                const manualQuestions = this.extractQuestionsManually(responseText);
                logger.debug('🔍 ParseAIResponse - Manual extraction succeeded, count:', manualQuestions.length);
                return manualQuestions;
            } catch (manualError) {
                logger.error('🔍 ParseAIResponse - Manual extraction also failed:', manualError);
                throw new Error(`Invalid JSON response from AI provider. Response: ${responseText.substring(0, 100)}...`);
            }
        }
    }

    fixCommonJsonIssues(jsonText) {
        let fixed = jsonText;

        // Fix trailing commas before closing brackets/braces
        fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

        // Fix common quote issues first
        fixed = fixed.replace(/'/g, '"'); // Replace single quotes with double quotes

        // Fix missing quotes around property names
        fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

        // Fix incomplete JSON by finding complete question objects
        if (fixed.includes('[') && !fixed.endsWith(']')) {
            logger.debug('🔧 Detected incomplete JSON, attempting to fix');

            // Count opening vs closing brackets
            const openBrackets = (fixed.match(/\[/g) || []).length;
            const closeBrackets = (fixed.match(/\]/g) || []).length;
            const openBraces = (fixed.match(/\{/g) || []).length;
            const closeBraces = (fixed.match(/\}/g) || []).length;

            if (openBrackets > closeBrackets || openBraces > closeBraces) {
                // Extract complete question objects using more reliable pattern matching
                // Look for complete question objects that end with } or },
                const completeObjectPattern = /\{[^}]*"question"[^}]*"type"[^}]*\}/g;
                const completeObjects = fixed.match(completeObjectPattern) || [];

                if (completeObjects.length > 0) {
                    // Reconstruct the JSON array with only complete objects
                    fixed = '[' + completeObjects.join(',') + ']';
                    logger.debug(`🔧 Extracted ${completeObjects.length} complete question objects from truncated JSON`);
                } else {
                    // Fallback: Try to find the last complete property and close from there
                    const lastCompleteProperty = Math.max(
                        fixed.lastIndexOf('"}'),
                        fixed.lastIndexOf('"]'),
                        fixed.lastIndexOf('}')
                    );

                    if (lastCompleteProperty !== -1) {
                        // Find how many closing braces/brackets we need
                        const textBeforeEnd = fixed.substring(0, lastCompleteProperty + 2);
                        const unclosedBraces = (textBeforeEnd.match(/\{/g) || []).length -
                                              (textBeforeEnd.match(/\}/g) || []).length;
                        const unclosedBrackets = (textBeforeEnd.match(/\[/g) || []).length -
                                                (textBeforeEnd.match(/\]/g) || []).length;

                        fixed = textBeforeEnd + '}'.repeat(Math.max(0, unclosedBraces)) +
                                               ']'.repeat(Math.max(0, unclosedBrackets));
                        logger.debug('🔧 Fixed incomplete JSON by closing unclosed braces and brackets');
                    }
                }
            }
        }

        // Additional validation: Try to parse and see if we can improve further
        try {
            JSON.parse(fixed);
            logger.debug('🔧 JSON fix successful - valid JSON produced');
        } catch (e) {
            logger.warn('🔧 Fixed JSON still invalid, but will attempt to parse anyway:', e.message);
        }

        logger.debug('🔧 Applied JSON fixes, length changed from', jsonText.length, 'to', fixed.length);
        return fixed;
    }

    extractQuestionsManually(responseText) {
        logger.debug('🔍 Manual extraction attempting to find questions in text');

        // First, try to extract individual JSON objects even if the array is malformed
        const jsonObjectPattern = /\{[\s\S]*?"question"\s*:\s*"[^"]*?"[\s\S]*?"type"\s*:\s*"[^"]*?"[\s\S]*?\}/g;
        const jsonObjects = responseText.match(jsonObjectPattern);

        if (jsonObjects && jsonObjects.length > 0) {
            logger.debug(`🔍 Found ${jsonObjects.length} JSON-like objects, attempting to parse each`);
            const questions = [];

            for (const objText of jsonObjects) {
                try {
                    // Try to fix and parse each object individually
                    let fixedObj = objText;

                    // Fix trailing commas
                    fixedObj = fixedObj.replace(/,(\s*\})/g, '$1');

                    // Fix single quotes
                    fixedObj = fixedObj.replace(/'/g, '"');

                    // Try to parse
                    const parsed = JSON.parse(fixedObj);

                    if (parsed.question && parsed.type) {
                        questions.push(parsed);
                        logger.debug('🔍 Successfully parsed JSON object:', parsed.question.substring(0, 50) + '...');
                    }
                } catch (e) {
                    logger.warn('🔍 Failed to parse individual JSON object:', e.message);
                }
            }

            if (questions.length > 0) {
                const requestedCount = this.requestedQuestionCount || 1;
                const limited = questions.slice(0, requestedCount);
                logger.debug(`🔍 Manual extraction successful: found ${limited.length} valid questions`);
                return limited;
            }
        }

        // Fallback: Try to find question-like patterns in plain text
        logger.debug('🔍 Attempting text pattern matching fallback');
        const questionPattern = /(?:question|q\d+)[:\s]*(.+?)(?:options?|choices?)[:\s]*(.+?)(?:answer|correct)[:\s]*(.+?)(?=(?:question|q\d+|$))/gis;
        const matches = [...responseText.matchAll(questionPattern)];

        if (matches.length > 0) {
            let questions = matches.map(match => {
                const question = match[1].trim();
                const optionsText = match[2].trim();
                const answerText = match[3].trim();

                // Extract options (A, B, C, D format)
                const options = optionsText.split(/[ABCD][\):\.]?\s*/).filter(opt => opt.trim()).slice(0, 4);

                // Try to determine correct answer
                let correctAnswer = 0;
                if (answerText.match(/^[A]$/i)) correctAnswer = 0;
                else if (answerText.match(/^[B]$/i)) correctAnswer = 1;
                else if (answerText.match(/^[C]$/i)) correctAnswer = 2;
                else if (answerText.match(/^[D]$/i)) correctAnswer = 3;

                return {
                    question: question,
                    options: options.length >= 4 ? options.slice(0, 4) : ['Option A', 'Option B', 'Option C', 'Option D'],
                    correctAnswer: correctAnswer,
                    type: 'multiple-choice',
                    timeLimit: 30
                };
            });

            // Limit to requested count
            const requestedCount = this.requestedQuestionCount || 1;
            if (questions.length > requestedCount) {
                questions = questions.slice(0, requestedCount);
            }

            logger.debug(`🔍 Text pattern matching found ${questions.length} questions`);
            return questions;
        }

        logger.error('🔍 All manual extraction methods failed');
        throw new Error('Could not extract questions from response');
    }

    /**
     * Detect content type and programming language for smart formatting
     * @returns {Object} { type: string, language: string|null, hasExistingQuestions: boolean }
     */
    detectContentType(content) {
        if (!content) {
            this.updateContentAnalysisUI(null);
            return { type: 'general', language: null, hasExistingQuestions: false };
        }

        try {
            const result = {
                type: 'general',
                language: null,
                hasExistingQuestions: false,
                needsLatex: false,
                needsCodeBlocks: false,
                wordCount: content.split(/\s+/).filter(w => w.length > 0).length
            };

            // Check if content contains existing questions (from file upload)
            if (AI.EXISTING_QUESTIONS_INDICATORS?.test(content)) {
                result.hasExistingQuestions = true;
            }

            // Mathematics - needs LaTeX formatting
            if (AI.MATH_INDICATORS?.test(content)) {
                result.type = 'mathematics';
                result.needsLatex = true;
                this.updateContentAnalysisUI(result);
                this.updateCostEstimation(content);
                return result;
            }

            // Programming - detect specific language for syntax highlighting
            if (AI.PROGRAMMING_INDICATORS?.test(content)) {
                result.type = 'programming';
                result.needsCodeBlocks = true;
                // Detect specific programming language
                if (AI.CODE_LANGUAGE_HINTS) {
                    for (const [lang, pattern] of Object.entries(AI.CODE_LANGUAGE_HINTS)) {
                        if (pattern.test(content)) {
                            result.language = lang;
                            break;
                        }
                    }
                }
                this.updateContentAnalysisUI(result);
                this.updateCostEstimation(content);
                return result;
            }

            // Physics - needs LaTeX for formulas
            if (AI.PHYSICS_INDICATORS?.test(content)) {
                result.type = 'physics';
                result.needsLatex = true;
                this.updateContentAnalysisUI(result);
                this.updateCostEstimation(content);
                return result;
            }

            // Chemistry - needs LaTeX for formulas and equations
            if (AI.CHEMISTRY_INDICATORS?.test(content)) {
                result.type = 'chemistry';
                result.needsLatex = true;
                this.updateContentAnalysisUI(result);
                this.updateCostEstimation(content);
                return result;
            }

            // Biology
            if (AI.BIOLOGY_INDICATORS?.test(content)) {
                result.type = 'biology';
                this.updateContentAnalysisUI(result);
                this.updateCostEstimation(content);
                return result;
            }

            // History
            if (AI.HISTORY_INDICATORS?.test(content)) {
                result.type = 'history';
                this.updateContentAnalysisUI(result);
                this.updateCostEstimation(content);
                return result;
            }

            // Economics
            if (AI.ECONOMICS_INDICATORS?.test(content)) {
                result.type = 'economics';
                this.updateContentAnalysisUI(result);
                this.updateCostEstimation(content);
                return result;
            }

            this.updateContentAnalysisUI(result);
            this.updateCostEstimation(content);
            return result;
        } catch (error) {
            logger.warn('Content type detection failed:', error.message);
            return { type: 'general', language: null, hasExistingQuestions: false };
        }
    }

    /**
     * Update the content analysis panel UI with detected information
     */
    updateContentAnalysisUI(result) {
        const panel = document.getElementById('content-analysis-panel');
        const typeEl = document.getElementById('detected-content-type');
        const formattingEl = document.getElementById('detected-formatting');
        const languageItem = document.getElementById('detected-language-item');
        const languageEl = document.getElementById('detected-language');
        const modeEl = document.getElementById('detected-mode');
        const recommendationEl = document.getElementById('analysis-recommendation');

        if (!panel) return;

        if (!result) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';

        // Update type with emoji and translated name
        const typeEmojis = {
            'mathematics': '📐',
            'programming': '💻',
            'physics': '⚡',
            'chemistry': '🧪',
            'biology': '🧬',
            'history': '📜',
            'economics': '📊',
            'general': '📝'
        };
        const typeTranslationKeys = {
            'mathematics': 'content_type_mathematics',
            'programming': 'content_type_programming',
            'physics': 'content_type_physics',
            'chemistry': 'content_type_chemistry',
            'biology': 'content_type_biology',
            'history': 'content_type_history',
            'economics': 'content_type_economics',
            'general': 'content_type_general'
        };
        if (typeEl) {
            const typeKey = typeTranslationKeys[result.type] || 'content_type_general';
            const typeName = translationManager.getTranslationSync(typeKey) || 'General';
            typeEl.textContent = `${typeEmojis[result.type] || '📝'} ${typeName}`;
        }

        // Update formatting with translations
        if (formattingEl) {
            if (result.needsLatex) {
                formattingEl.textContent = '✨ ' + (translationManager.getTranslationSync('format_latex') || 'LaTeX math');
            } else if (result.needsCodeBlocks) {
                formattingEl.textContent = '⌨️ ' + (translationManager.getTranslationSync('format_code') || 'Code blocks');
            } else {
                formattingEl.textContent = '📄 ' + (translationManager.getTranslationSync('format_standard') || 'Standard');
            }
        }

        // Update language (for programming)
        if (languageItem && languageEl) {
            if (result.language) {
                languageItem.style.display = 'flex';
                languageEl.textContent = result.language.charAt(0).toUpperCase() + result.language.slice(1);
            } else {
                languageItem.style.display = 'none';
            }
        }

        // Update mode with translations
        if (modeEl) {
            const modeKey = result.hasExistingQuestions ? 'mode_format_existing' : 'mode_generate_new';
            const modeText = translationManager.getTranslationSync(modeKey) || (result.hasExistingQuestions ? 'Format existing' : 'Generate new');
            modeEl.textContent = result.hasExistingQuestions ? '🔄 ' + modeText : '✨ ' + modeText;
        }

        // Update recommendation with translations
        if (recommendationEl) {
            let recommendation = '';
            if (result.hasExistingQuestions) {
                recommendation = '💡 ' + (translationManager.getTranslationSync('recommendation_existing_questions') || 'Existing questions detected. The AI will format and structure them.');
            } else if (result.needsLatex) {
                recommendation = '💡 ' + (translationManager.getTranslationSync('recommendation_math_content') || 'Math content detected. Questions will include LaTeX formatting.');
            } else if (result.needsCodeBlocks) {
                let codeRec = translationManager.getTranslationSync('recommendation_code_content') || 'Code detected. Questions will include syntax-highlighted code blocks.';
                if (result.language) {
                    codeRec = codeRec.replace('Code detected', `Code detected (${result.language})`);
                }
                recommendation = '💡 ' + codeRec;
            } else if (result.wordCount && result.wordCount > 500) {
                recommendation = '💡 ' + (translationManager.getTranslationSync('recommendation_rich_content') || 'Rich content detected. Consider generating multiple questions.');
            }
            recommendationEl.textContent = recommendation;
            recommendationEl.style.display = recommendation ? 'block' : 'none';
        }
    }

    /**
     * Update the output language indicator to show current app language
     */
    updateOutputLanguageIndicator() {
        const languageNameEl = document.getElementById('output-language-name');
        if (!languageNameEl) return;

        const language = translationManager.getCurrentLanguage() || 'en';
        const languageNames = {
            'en': 'English',
            'es': 'Español',
            'fr': 'Français',
            'de': 'Deutsch',
            'it': 'Italiano',
            'pt': 'Português',
            'pl': 'Polski',
            'ja': '日本語',
            'zh': '中文'
        };

        languageNameEl.textContent = languageNames[language] || 'English';
    }

    /**
     * Update cost estimation based on content and provider
     */
    updateCostEstimation(content) {
        const costPanel = document.getElementById('cost-estimation');
        const costValue = document.getElementById('estimated-cost');
        const tokensValue = document.getElementById('estimated-tokens');
        const provider = document.getElementById('ai-provider')?.value;
        const questionCount = parseInt(document.getElementById('question-count')?.value) || 1;

        if (!costPanel || !costValue || !tokensValue || !provider) return;

        // Token estimation: ~4 chars per token for English
        const inputTokens = Math.ceil((content?.length || 0) / 4);
        // Output estimation: ~500 tokens per question
        const outputTokens = questionCount * 500;
        const totalTokens = inputTokens + outputTokens;

        // Cost per 1M tokens (approximate, as of late 2024)
        const costs = {
            'ollama': { input: 0, output: 0, label: 'Free (local)' },
            'openai': { input: 0.15, output: 0.60, label: 'GPT-4o-mini' }, // $0.15/1M input, $0.60/1M output
            'claude': { input: 3.00, output: 15.00, label: 'Claude Sonnet' }, // $3/1M input, $15/1M output
            'gemini': { input: 0.075, output: 0.30, label: 'Gemini Flash' } // $0.075/1M input, $0.30/1M output
        };

        const providerCost = costs[provider];
        if (!providerCost) {
            costPanel.style.display = 'none';
            return;
        }

        // Show for non-free providers or always show for transparency
        if (provider === 'ollama') {
            costValue.textContent = translationManager.getTranslationSync('cost_free') || 'Free';
            tokensValue.textContent = `(~${this.formatTokenCount(totalTokens)} tokens)`;
            costPanel.style.display = 'flex';
        } else {
            const estimatedCost = (inputTokens * providerCost.input / 1000000) + (outputTokens * providerCost.output / 1000000);
            costValue.textContent = estimatedCost < 0.01 ? '<$0.01' : `~$${estimatedCost.toFixed(3)}`;
            tokensValue.textContent = `(~${this.formatTokenCount(totalTokens)} tokens)`;
            costPanel.style.display = 'flex';
        }
    }

    /**
     * Format token count for display (e.g., 1500 -> "1.5K")
     */
    formatTokenCount(count) {
        if (count >= 1000000) {
            return (count / 1000000).toFixed(1) + 'M';
        } else if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'K';
        }
        return count.toString();
    }

    /**
     * Build formatting instructions based on content type
     */
    buildFormattingInstructions(contentInfo) {
        let instructions = '';

        if (contentInfo.needsLatex) {
            instructions += `
LATEX FORMATTING (IMPORTANT):
- Use LaTeX syntax for ALL mathematical expressions, formulas, and equations
- Inline math: Use $...$ (e.g., "The formula $E = mc^2$ shows..." or "Calculate $\\frac{x+1}{2}$")
- Display math: Use $$...$$ for standalone equations (e.g., "$$\\int_0^\\infty e^{-x} dx = 1$$")
- Common symbols: $\\alpha$, $\\beta$, $\\gamma$, $\\theta$, $\\pi$, $\\sigma$, $\\Delta$, $\\infty$
- Fractions: $\\frac{numerator}{denominator}$
- Square roots: $\\sqrt{x}$ or $\\sqrt[n]{x}$
- Subscripts/superscripts: $x_1$, $x^2$, $x_1^2$
- Summation: $\\sum_{i=1}^{n} x_i$
- Integrals: $\\int_a^b f(x) dx$
- Chemical formulas: $H_2O$, $CO_2$, $C_6H_{12}O_6$
- Use LaTeX in BOTH questions AND answer options where appropriate
`;
        }

        if (contentInfo.needsCodeBlocks) {
            const langHint = contentInfo.language ? `Use \`\`\`${contentInfo.language}\` for code blocks.` : '';
            instructions += `
CODE FORMATTING (IMPORTANT):
- Wrap ALL code snippets in markdown code blocks with language specification
- Format: \`\`\`language
code here
\`\`\`
${langHint}
- Use inline code \`like this\` for short references (variable names, function names, keywords)
- Ensure code is properly indented and formatted
- Include necessary context (imports, function signatures) when relevant
- For code output questions, show both code and expected output
`;
        }

        // Add explanation and wrong answer feedback instructions
        instructions += `
QUESTION QUALITY & FEEDBACK:
- Add an "explanation" field with a BRIEF explanation (1-2 sentences max) of why the correct answer is right
- Add a "difficulty" field with value "easy", "medium", or "hard" based on content complexity
- Add an "optionFeedback" array with SHORT feedback (max 15 words each) for wrong answers explaining WHY incorrect
- For multiple-choice: optionFeedback should have feedback for indices that are NOT the correct answer
- Example: "optionFeedback": [{"index": 1, "feedback": "Incorrect - this describes X not Y"}, {"index": 2, "feedback": "Common misconception"}]
- Keep ALL text concise to ensure complete JSON output
- Ensure questions test understanding, not just memorization
`;

        return instructions;
    }

    async handleProviderChange(provider) {
        return await errorHandler.wrapAsyncOperation(async () => {
            // Prevent multiple simultaneous calls
            if (this.isChangingProvider) {
                logger.debug('HandleProviderChange - Already changing provider, ignoring call for:', provider);
                return;
            }
            
            this.isChangingProvider = true;
            logger.debug('HandleProviderChange called with provider:', provider);
            
            try {
                const apiKeySection = document.getElementById('api-key-section');
                const modelSelection = document.getElementById('model-selection');
                
                logger.debug('HandleProviderChange - Elements found:', { apiKeySection: !!apiKeySection, modelSelection: !!modelSelection });
                
                if (!apiKeySection || !modelSelection) return;
                
                const needsApiKey = this.providers[provider]?.apiKey;
                
                if (needsApiKey) {
                    apiKeySection.style.display = 'block';
                    // Clear API key input to force user to enter fresh key every time
                    const apiKeyInput = document.getElementById('ai-api-key');
                    if (apiKeyInput) {
                        apiKeyInput.value = '';
                        apiKeyInput.placeholder = 'Enter your API key';
                    }
                } else {
                    apiKeySection.style.display = 'none';
                }
                
                // Model selection visibility and loading
                if (provider === 'ollama') {
                    logger.debug('HandleProviderChange - Showing model selection for Ollama');
                    // Make sure it's visible (remove hidden class if it exists)
                    modelSelection.classList.remove('hidden');
                    modelSelection.style.display = 'block';
                    
                    // Load the models
                    await this.loadOllamaModels();
                } else {
                    logger.debug('HandleProviderChange - Hiding model selection for provider:', provider);
                    modelSelection.classList.add('hidden');
                }
            } finally {
                this.isChangingProvider = false;
            }
        }, {
            errorType: errorHandler.errorTypes.SYSTEM,
            context: 'provider-change',
            userMessage: null, // Silent failure for UI operations
            retryable: false,
            fallback: () => {
                this.isChangingProvider = false; // Ensure flag is reset on error
            }
        });
    }

    async loadOllamaModels() {
        return await errorHandler.wrapAsyncOperation(async () => {
            const modelSelect = document.getElementById('ollama-model');
            const modelSelection = document.getElementById('model-selection');
            
            if (!modelSelect) {
                logger.debug('LoadOllamaModels - Model select element not found');
                return;
            }

            logger.debug('LoadOllamaModels - Starting model loading');
            
            // Ensure the parent div is visible first
            if (modelSelection) {
                modelSelection.classList.remove('hidden');
                modelSelection.style.display = 'block';
                logger.debug('LoadOllamaModels - Ensured model selection div is visible');
            }
            
            // Set initial loading state and disable the select element
            modelSelect.innerHTML = '<option value="">🔄 Loading models...</option>';
            modelSelect.disabled = true;
            
            try {
                logger.debug('LoadOllamaModels - Fetching from:', AI.OLLAMA_TAGS_ENDPOINT);

                // Use AbortController with short timeout - Ollama should respond quickly if running
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);

                const response = await fetch(AI.OLLAMA_TAGS_ENDPOINT, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                logger.debug('LoadOllamaModels - Fetch response status:', response.status);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                logger.debug('LoadOllamaModels - Response data:', data);
                
                const models = data.models || [];
                logger.debug('LoadOllamaModels - Found models count:', models.length);
                
                // Clear existing options and populate with models
                modelSelect.innerHTML = ''; 
                
                if (models.length === 0) {
                    logger.debug('LoadOllamaModels - No models found, showing message');
                    modelSelect.innerHTML = '<option value="">No models found</option>';
                } else {
                    logger.debug('LoadOllamaModels - Populating select with models');
                    
                    models.forEach((model, index) => {
                        const option = document.createElement('option');
                        option.value = model.name;
                        option.textContent = `${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(1)}GB)`;
                        modelSelect.appendChild(option);
                        logger.debug(`LoadOllamaModels - Added model ${index + 1}:`, model.name);
                    });
                    
                    // Restore saved selection or set default
                    const savedModel = localStorage.getItem('ollama_selected_model');
                    if (savedModel && models.some(m => m.name === savedModel)) {
                        modelSelect.value = savedModel;
                        logger.debug('LoadOllamaModels - Set saved model:', savedModel);
                    } else if (models.length > 0) {
                        // Set default to first available model
                        modelSelect.value = models[0].name;
                        localStorage.setItem('ollama_selected_model', models[0].name);
                        logger.debug('LoadOllamaModels - Set default model:', models[0].name);
                    }
                }
                
                logger.debug('LoadOllamaModels - Final select options count:', modelSelect.options.length);
                
            } finally {
                modelSelect.disabled = false;
                
                // Force visibility again after loading
                if (modelSelection) {
                    modelSelection.classList.remove('hidden');
                    modelSelection.style.display = 'block';
                    logger.debug('LoadOllamaModels - Final visibility enforcement');
                }
                
                logger.debug('LoadOllamaModels - Enabled select, final state:', {
                    optionsCount: modelSelect.options.length,
                    selectedValue: modelSelect.value,
                    disabled: modelSelect.disabled,
                    parentVisible: modelSelection ? window.getComputedStyle(modelSelection).display : 'unknown'
                });
            }
        }, {
            errorType: errorHandler.errorTypes.NETWORK,
            context: 'ollama-model-loading',
            userMessage: null, // Don't show alert for model loading failures
            silent: true, // Don't log to console - Ollama may not be available
            retryable: false,
            fallback: () => {
                // Load fallback models on failure
                const modelSelect = document.getElementById('ollama-model');
                if (modelSelect) {
                    logger.debug('LoadOllamaModels - Loading fallback models');
                    const fallbackModels = this.providers.ollama.models;
                    if (fallbackModels && fallbackModels.length > 0) {
                        modelSelect.innerHTML = '';
                        fallbackModels.forEach(modelName => {
                            const option = document.createElement('option');
                            option.value = modelName;
                            option.textContent = `${modelName} (fallback)`;
                            modelSelect.appendChild(option);
                        });
                        
                        // Set first fallback as default
                        modelSelect.value = fallbackModels[0];
                        localStorage.setItem('ollama_selected_model', fallbackModels[0]);
                        logger.debug('LoadOllamaModels - Set fallback default:', fallbackModels[0]);
                    } else {
                        modelSelect.innerHTML = '<option value="">❌ Ollama not available</option>';
                    }
                }
            }
        });
    }

    handleFileUpload(file) {
        if (!file) return;

        const fileExtension = file.name.toLowerCase().split('.').pop();

        // Check if file is Excel format
        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            this.handleExcelUpload(file);
            return;
        }

        // Check if file is PDF format
        if (fileExtension === 'pdf') {
            this.handlePdfUpload(file);
            return;
        }

        // Handle text-based files as before
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const contentTextarea = document.getElementById('source-content');
            if (contentTextarea) {
                contentTextarea.value = content;
                this.detectContentType(content);
            }
        };
        reader.readAsText(file);
    }

    async handlePdfUpload(file) {
        const contentTextarea = document.getElementById('source-content');
        if (!contentTextarea) return;

        // Show loading state
        contentTextarea.value = translationManager.getTranslationSync('extracting_pdf') || 'Extracting text from PDF...';
        contentTextarea.disabled = true;

        try {
            const formData = new FormData();
            formData.append('pdf', file);

            const response = await fetch(APIHelper.getApiUrl('api/extract-pdf'), {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'PDF extraction failed');
            }

            if (!data.text || data.text.trim().length === 0) {
                throw new Error(translationManager.getTranslationSync('pdf_no_text') || 'No text content found in PDF');
            }

            contentTextarea.value = data.text;
            this.detectContentType(data.text);

            logger.debug(`📄 PDF extracted: ${data.pages} pages, ${data.text.length} characters`);

            // Show success notification
            if (typeof showToast === 'function') {
                const message = (translationManager.getTranslationSync('pdf_extracted') || 'PDF extracted: {pages} pages')
                    .replace('{pages}', data.pages);
                showToast(message, 'success');
            }

        } catch (error) {
            logger.error('📄 PDF extraction failed:', error);
            contentTextarea.value = '';

            // Show error to user
            if (typeof showToast === 'function') {
                showToast(error.message, 'error');
            } else if (typeof showAlert === 'function') {
                showAlert(error.message, 'error');
            }
        } finally {
            contentTextarea.disabled = false;
        }
    }

    handleExcelUpload(file) {
        if (!XLSX) {
            logger.error('XLSX library not loaded');
            showAlert('Excel processing library not available', 'error');
            return;
        }
        
        logger.debug('🗂️ Processing Excel file:', file.name);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Use the first sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert to array of objects
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                logger.debug('🗂️ Excel data parsed:', jsonData.length, 'rows');
                
                // Convert Excel data to structured text for AI processing
                const structuredText = this.convertExcelToStructuredText(jsonData, file.name);
                
                if (structuredText) {
                    // Put the structured text in the content textarea for AI processing
                    const contentTextarea = document.getElementById('source-content');
                    if (contentTextarea) {
                        contentTextarea.value = structuredText;
                        this.detectContentType(structuredText);
                    }
                    
                    // Auto-fill question count field with detected questions
                    const questionCountField = document.getElementById('question-count');
                    if (questionCountField && this.detectedQuestionCount) {
                        const previousCount = questionCountField.value;
                        questionCountField.value = this.detectedQuestionCount;
                        logger.debug('🗂️ Auto-filled question count from', previousCount, 'to', this.detectedQuestionCount);
                    }
                    
                    // Note: Batch processing alert will be shown by convertExcelToStructuredText if needed
                    logger.debug('🗂️ Excel converted to structured text for AI');
                } else {
                    throw new Error('No valid data found in Excel file');
                }
                
            } catch (error) {
                logger.error('🗂️ Excel processing failed:', error);
                showAlert('Failed to process Excel file: ' + error.message, 'error');
            }
        };
        
        reader.onerror = (error) => {
            logger.error('🗂️ File reading failed:', error);
            showAlert('Failed to read Excel file', 'error');
        };
        
        reader.readAsArrayBuffer(file);
    }

    convertExcelToStructuredText(jsonData, filename, batchStart = 0, batchSize = null) {
        if (!jsonData || jsonData.length < 2) {
            throw new Error('Excel file must contain at least a header row and one data row');
        }
        
        // Smart batching based on model capabilities  
        const totalRows = jsonData.length - 1; // Subtract header row
        const provider = document.getElementById('ai-provider')?.value || 'ollama';
        
        // Dynamic batch sizes based on AI provider capabilities
        const batchSizes = {
            'ollama': 5,        // Small local models work better with fewer questions
            'huggingface': 5,   // Free tier models are limited
            'openai': 10,       // Powerful models can handle more
            'claude': 10,       // Powerful models can handle more
            'gemini': 10        // Powerful models can handle more
        };
        
        const optimalBatchSize = batchSizes[provider] || 5;
        const actualBatchSize = batchSize || optimalBatchSize;
        
        // Determine if we need batching (only on initial call, not recursive)
        if (totalRows > optimalBatchSize && batchSize === null && !this.batchInfo) {
            // Store batch info for later processing
            this.batchInfo = {
                totalQuestions: totalRows,
                batchSize: optimalBatchSize,
                totalBatches: Math.ceil(totalRows / optimalBatchSize),
                currentBatch: 1,
                originalData: jsonData,
                filename: filename
            };
            
            const modelName = provider === 'ollama' ? 
                localStorage.getItem('ollama_selected_model') || 'Unknown Model' : 
                provider.charAt(0).toUpperCase() + provider.slice(1);
            
            showAlert(`Excel file has ${totalRows} questions. Processing in ${this.batchInfo.totalBatches} batches of ${optimalBatchSize} questions each with ${modelName} for better accuracy.`, 'info');
            
            // Process first batch
            return this.convertExcelToStructuredText(jsonData, filename, 0, optimalBatchSize);
        }
        
        // Create batch-specific data with consistent header handling
        let batchData = jsonData;
        if (batchSize !== null) {
            const hasHeaders = jsonData[0] && jsonData[0].some(cell => 
                cell && typeof cell === 'string' && 
                (cell.toLowerCase().includes('question') || cell.toLowerCase().includes('pregunta'))
            );
            
            const headerRows = hasHeaders ? 1 : 0;
            const startRow = headerRows + batchStart;
            const endRow = Math.min(startRow + batchSize, jsonData.length);
            
            // ALWAYS include original headers for consistent format detection
            // This ensures all batches see the same header structure
            batchData = hasHeaders ? 
                [jsonData[0], ...jsonData.slice(startRow, endRow)] :
                jsonData.slice(startRow, endRow);
                
            logger.debug(`📦 Batch data: headers=${hasHeaders}, startRow=${startRow}, endRow=${endRow}, batchData.length=${batchData.length}`);
        }
        
        // Use enhanced format detection
        const structuredText = this.formatExcelDataWithDetection(batchData, filename, batchStart, batchSize);
        
        logger.debug('🗂️ Converted Excel batch to structured text:', structuredText.length, 'characters');
        
        // Store the detected question count for auto-filling (only on first batch)
        if (batchStart === 0) {
            this.detectedQuestionCount = totalRows;
        }
        
        return structuredText;
    }

    detectExcelFormat(jsonData) {
        if (!jsonData || jsonData.length < 2) {
            return { questionCol: 0, answerCols: [1, 2, 3, 4], hasHeaders: false };
        }
        
        const headerRow = jsonData[0];
        const dataRow = jsonData[1];
        
        // Check if first row looks like headers
        const hasHeaders = headerRow && headerRow.some(cell => 
            cell && typeof cell === 'string' && 
            (cell.toLowerCase().includes('question') || 
             cell.toLowerCase().includes('pregunta') ||
             cell.toLowerCase().includes('answer') ||
             cell.toLowerCase().includes('respuesta') ||
             cell.toLowerCase().includes('option') ||
             cell.toLowerCase().includes('opción') ||
             cell.toLowerCase().includes('correct') ||
             cell.toLowerCase().includes('correcto'))
        );
        
        let questionCol = 0;
        let answerCols = [];
        let correctAnswerCol = -1;
        
        if (hasHeaders) {
            // Try to identify columns by headers
            headerRow.forEach((header, index) => {
                if (!header) return;
                
                const headerLower = header.toString().toLowerCase();
                
                // Question column
                if (headerLower.includes('question') || headerLower.includes('pregunta')) {
                    questionCol = index;
                }
                // Answer/option columns
                else if (headerLower.includes('answer') || headerLower.includes('respuesta') ||
                         headerLower.includes('option') || headerLower.includes('opción')) {
                    answerCols.push(index);
                }
                // Correct answer column
                else if (headerLower.includes('correct') || headerLower.includes('correcto')) {
                    correctAnswerCol = index;
                }
            });
            
            // If we didn't find specific answer columns, assume they follow the question
            if (answerCols.length === 0) {
                for (let i = questionCol + 1; i < headerRow.length && i < questionCol + 5; i++) {
                    if (headerRow[i] && headerRow[i].toString().trim()) {
                        answerCols.push(i);
                    }
                }
            }
        } else {
            // No headers - use default assumption but try to be smarter
            // Look at the data to infer structure
            if (dataRow) {
                // Find the column with the longest text (likely the question)
                let longestTextCol = 0;
                let longestLength = 0;
                
                dataRow.forEach((cell, index) => {
                    if (cell && cell.toString().length > longestLength) {
                        longestLength = cell.toString().length;
                        longestTextCol = index;
                    }
                });
                
                questionCol = longestTextCol;
                
                // Assume next 4 columns are answers
                for (let i = 0; i < dataRow.length; i++) {
                    if (i !== questionCol && dataRow[i] && dataRow[i].toString().trim()) {
                        answerCols.push(i);
                    }
                }
            }
        }
        
        // Ensure we have some answer columns
        if (answerCols.length === 0) {
            // Default fallback
            answerCols = [1, 2, 3, 4].filter(col => col < (headerRow?.length || 5));
        }
        
        logger.debug('🔍 Excel format detected:', {
            hasHeaders,
            questionCol,
            answerCols,
            correctAnswerCol
        });
        
        // Debug: Show what columns we think contain what
        logger.debug('🔍 Column interpretation:', {
            questionColumn: `Column ${String.fromCharCode(65 + questionCol)}`,
            answerColumns: answerCols.map(col => `Column ${String.fromCharCode(65 + col)}`),
            correctAnswerColumn: correctAnswerCol !== -1 ? `Column ${String.fromCharCode(65 + correctAnswerCol)}` : 'Not detected'
        });
        
        return {
            hasHeaders,
            questionCol,
            answerCols,
            correctAnswerCol
        };
    }

    formatExcelDataWithDetection(jsonData, filename, batchStart = 0, batchSize = null) {
        const format = this.detectExcelFormat(jsonData);
        const totalRows = jsonData.length - (format.hasHeaders ? 1 : 0);
        
        let structuredText = `# Quiz Questions from Excel File: ${filename}\n\n`;
        structuredText += `IMPORTANT: These are existing questions from an Excel file. Convert them exactly as written.\n\n`;
        
        // Add batch information if applicable
        if (this.batchInfo && batchSize !== null) {
            const batchEnd = Math.min(batchStart + batchSize, this.batchInfo.totalQuestions);
            structuredText += `BATCH PROCESSING: Questions ${batchStart + 1} to ${batchEnd} (Batch ${this.batchInfo.currentBatch} of ${this.batchInfo.totalBatches})\n\n`;
        }
        
        if (format.hasHeaders) {
            const headerRow = jsonData[0];
            structuredText += `Detected Format:\n`;
            structuredText += `- Question Column: ${headerRow[format.questionCol] || 'Column ' + String.fromCharCode(65 + format.questionCol)}\n`;
            structuredText += `- Answer Columns: ${format.answerCols.map(col => headerRow[col] || 'Column ' + String.fromCharCode(65 + col)).join(', ')}\n\n`;
        } else {
            structuredText += `Detected Format: Question in Column ${String.fromCharCode(65 + format.questionCol)}, Answers in Columns ${format.answerCols.map(col => String.fromCharCode(65 + col)).join(', ')}\n\n`;
        }
        
        structuredText += `EXCEL QUESTIONS TO CONVERT:\n\n`;
        
        // Process data rows
        const startRow = format.hasHeaders ? 1 : 0;
        let questionNumber = batchStart + 1; // Continue numbering from batch start
        
        for (let i = startRow; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // Skip completely empty rows
            if (!row || row.length === 0 || row.every(cell => !cell || cell.toString().trim() === '')) {
                continue;
            }
            
            structuredText += `Question ${questionNumber}:\n`;
            
            // Question text
            if (row[format.questionCol]) {
                structuredText += `  Question: ${row[format.questionCol].toString().trim()}\n`;
            }
            
            // Handle your specific Excel format: A=Question, B=Correct, C/D/E=Wrong
            const allAnswers = [];
            const correctAnswerText = row[1] ? row[1].toString().trim() : ''; // Column B
            const wrongAnswers = [];
            
            // Collect wrong answers from columns C, D, E (indices 2, 3, 4)
            for (let i = 2; i <= 4; i++) {
                if (row[i] && row[i].toString().trim()) {
                    wrongAnswers.push(row[i].toString().trim());
                }
            }
            
            // Arrange answers: Correct answer first, then wrong answers
            if (correctAnswerText) {
                allAnswers.push(correctAnswerText);
                wrongAnswers.forEach(wrong => allAnswers.push(wrong));
                
                // Output all options with correct answer first
                allAnswers.forEach((answer, index) => {
                    structuredText += `  Option ${index + 1}: ${answer}\n`;
                });
                
                // Correct answer is always first (index 0)
                const correctAnswerIndex = 0;
                structuredText += `  CORRECT_ANSWER_INDEX: ${correctAnswerIndex}\n`;
                logger.debug(`📝 Question ${questionNumber}: Column B="${correctAnswerText}" placed at index ${correctAnswerIndex}, all answers=[${allAnswers.join(', ')}]`);
            } else {
                // Fallback if no correct answer found
                structuredText += `  ERROR: No correct answer found in Column B\n`;
                logger.error(`📝 Question ${questionNumber}: No correct answer found in Column B`);
            }
            
            structuredText += `\n`;
            questionNumber++;
        }
        
        structuredText += `\nINSTRUCTIONS FOR AI:\n`;
        structuredText += `- Convert these existing questions to JSON format\n`;
        structuredText += `- Copy ALL text EXACTLY as written - do not change any words\n`;
        structuredText += `- Use CORRECT_ANSWER_INDEX number provided for each question\n`;
        structuredText += `- Do NOT translate or modify the language\n`;
        
        return structuredText;
    }

    async processGeneratedQuestions(questions, showAlerts = true) {
        logger.debug('🔄 ProcessGeneratedQuestions - Starting with questions:', questions.length);

        // Add questions to the main quiz
        if (window.game && window.game.quizManager) {
            let validCount = 0;
            let invalidCount = 0;

            // Process questions SEQUENTIALLY to avoid race conditions with DOM creation
            for (let index = 0; index < questions.length; index++) {
                const questionData = questions[index];
                logger.debug(`🔄 ProcessGeneratedQuestions - Processing question ${index + 1}:`, {
                    type: questionData.type,
                    hasQuestion: !!questionData.question,
                    hasOptions: !!questionData.options,
                    optionsLength: questionData.options?.length,
                    correctAnswer: questionData.correctAnswer,
                    correctAnswers: questionData.correctAnswers,
                    hasImageData: !!questionData.imageData,
                    imageType: questionData.imageType
                });

                // Generate image if AI provided image data
                if (questionData.imageData && questionData.imageType) {
                    logger.debug(`🖼️ Rendering ${questionData.imageType} image for question ${index + 1}`);
                    try {
                        const imageUrl = await this.renderImageData(questionData.imageData, questionData.imageType);
                        if (imageUrl) {
                            questionData.image = imageUrl;
                            logger.debug(`✅ Image rendered successfully: ${imageUrl.substring(0, 50)}...`);
                        }
                    } catch (error) {
                        logger.warn(`⚠️ Image rendering failed for question ${index + 1}:`, error.message);
                        // Continue without image - don't fail the whole question
                    }
                    // Remove temporary fields
                    delete questionData.imageData;
                    delete questionData.imageType;
                }

                // Validate and add each question
                if (this.validateGeneratedQuestion(questionData)) {
                    logger.debug(`✅ ProcessGeneratedQuestions - Question ${index + 1} is valid, adding to quiz`);

                    // Add question and wait for DOM updates to complete
                    await new Promise(resolve => {
                        // Check if this will create a new DOM element
                        const questionElements = document.querySelectorAll('.question-item');
                        const firstQuestion = questionElements[0];
                        const needsNewElement = !(firstQuestion && window.game.quizManager.isEmptyQuestion(firstQuestion));

                        window.game.quizManager.addGeneratedQuestion(questionData, showAlerts);

                        // Wait longer if we created a new DOM element
                        const waitTime = needsNewElement ? 400 : 50;
                        setTimeout(resolve, waitTime);
                    });

                    validCount++;
                } else {
                    logger.warn(`❌ ProcessGeneratedQuestions - Question ${index + 1} is invalid, skipping:`, questionData);
                    invalidCount++;
                }
            }

            logger.debug('🔄 ProcessGeneratedQuestions - Summary:', {
                total: questions.length,
                valid: validCount,
                invalid: invalidCount
            });

        } else {
            logger.warn('🔄 ProcessGeneratedQuestions - Window.game.quizManager not available, using fallback');
            // Fallback: dispatch custom event
            const event = new CustomEvent('questionsGenerated', {
                detail: { questions }
            });
            document.dispatchEvent(event);
        }
    }

    /**
     * Render image data (SVG or Mermaid) to a data URL
     * @param {string} imageData - SVG code or Mermaid syntax provided by AI
     * @param {string} imageType - Type: 'svg' or 'mermaid'
     * @returns {Promise<string>} - Data URL of the rendered image
     */
    async renderImageData(imageData, imageType) {
        logger.debug(`🖼️ renderImageData called: type=${imageType}`);

        try {
            if (imageType === 'mermaid') {
                return await this.renderMermaidToSVG(imageData);
            } else if (imageType === 'svg') {
                return this.svgToDataURL(imageData);
            } else {
                logger.warn(`Unknown image type: ${imageType}`);
                return null;
            }
        } catch (error) {
            logger.error(`Image rendering failed for type ${imageType}:`, error);
            throw error;
        }
    }

    /**
     * Render Mermaid syntax to SVG data URL
     * @param {string} mermaidCode - Mermaid diagram syntax provided by AI
     * @returns {Promise<string>} - Data URL of the rendered SVG
     */
    async renderMermaidToSVG(mermaidCode) {
        logger.debug('🖼️ Rendering Mermaid diagram');

        // Clean up the code (remove any markdown wrapping)
        let cleanCode = mermaidCode.replace(/```mermaid/g, '').replace(/```/g, '').trim();

        // Dynamically import Mermaid if not already loaded
        if (!window.mermaid) {
            logger.debug('Loading Mermaid library...');
            const script = document.createElement('script');
            script.type = 'module';
            script.textContent = `
                import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
                window.mermaid = mermaid;
                mermaid.initialize({ startOnLoad: false, theme: 'default' });
            `;
            document.head.appendChild(script);

            // Wait for Mermaid to load
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        // Render Mermaid diagram to SVG
        const id = 'mermaid-' + Date.now();
        const { svg } = await window.mermaid.render(id, cleanCode);

        // Convert SVG to data URL
        const dataUrl = this.svgToDataURL(svg);

        logger.debug('✅ Mermaid diagram rendered successfully');
        return dataUrl;
    }

    /**
     * Convert SVG code to data URL
     * @param {string} svgCode - SVG XML code
     * @returns {string} - Data URL
     */
    svgToDataURL(svgCode) {
        // Ensure SVG has xmlns attribute
        if (!svgCode.includes('xmlns=')) {
            svgCode = svgCode.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        // Convert to data URL
        const encoded = btoa(unescape(encodeURIComponent(svgCode)));
        return 'data:image/svg+xml;base64,' + encoded;
    }

    validateGeneratedQuestion(question) {
        logger.debug('🔍 ValidateGeneratedQuestion - Validating:', {
            type: question.type,
            hasQuestion: !!question.question,
            hasOptions: !!question.options,
            optionsLength: question.options?.length,
            correctAnswer: question.correctAnswer,
            correctAnswers: question.correctAnswers
        });
        
        // Basic validation for generated questions
        if (!question.question || !question.type) {
            logger.debug('❌ ValidateGeneratedQuestion - Missing basic fields');
            return false;
        }
        
        // Type-specific validation
        if (question.type === 'multiple-choice') {
            // Auto-fix: Ensure exactly 4 options for multiple-choice questions
            if (question.options && Array.isArray(question.options) && question.options.length < 4) {
                logger.debug('🔧 ValidateGeneratedQuestion - Auto-fixing: padding options to 4');
                const originalLength = question.options.length;
                
                // Add generic distractors to reach 4 options
                const genericDistractors = [
                    'None of the above',
                    'All of the above', 
                    'Not applicable',
                    'Cannot be determined',
                    'Not mentioned in the content',
                    'More information needed'
                ];
                
                while (question.options.length < 4) {
                    // Find a distractor that's not already in the options
                    let distractor = genericDistractors.find(d => !question.options.includes(d));
                    if (!distractor) {
                        distractor = `Option ${question.options.length + 1}`;
                    }
                    question.options.push(distractor);
                }
                
                logger.debug(`🔧 Padded options from ${originalLength} to ${question.options.length}`);
            }
            
            if (!question.options || !Array.isArray(question.options) || 
                question.options.length !== 4 ||
                question.correctAnswer === undefined || 
                question.correctAnswer < 0 || 
                question.correctAnswer >= question.options.length) {
                logger.debug('❌ ValidateGeneratedQuestion - Multiple choice validation failed');
                return false;
            }
        } else if (question.type === 'multiple-correct') {
            // Auto-fix: If AI used "correctAnswer" instead of "correctAnswers"
            if (question.correctAnswer !== undefined && !question.correctAnswers) {
                logger.debug('🔧 ValidateGeneratedQuestion - Auto-fixing: converting correctAnswer to correctAnswers array');
                question.correctAnswers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
                delete question.correctAnswer;
            }
            
            if (!question.options || !Array.isArray(question.options) ||
                !question.correctAnswers || !Array.isArray(question.correctAnswers) ||
                question.correctAnswers.length === 0) {
                logger.debug('❌ ValidateGeneratedQuestion - Multiple correct validation failed');
                return false;
            }
            
            // Validate that all correctAnswers indices are within bounds
            const invalidIndices = question.correctAnswers.filter(index => 
                index < 0 || index >= question.options.length
            );
            if (invalidIndices.length > 0) {
                logger.debug('❌ ValidateGeneratedQuestion - Multiple correct has invalid indices:', invalidIndices);
                return false;
            }
        } else if (question.type === 'true-false') {
            if (!question.options || !Array.isArray(question.options) || 
                question.options.length !== 2 ||
                (question.correctAnswer !== 'true' && question.correctAnswer !== 'false')) {
                logger.debug('❌ ValidateGeneratedQuestion - True/false validation failed', {
                    optionsLength: question.options?.length,
                    correctAnswer: question.correctAnswer,
                    correctAnswerType: typeof question.correctAnswer
                });
                return false;
            }
        } else if (question.type === 'numeric') {
            // Auto-fix: Remove options array if AI incorrectly added it
            if (question.options) {
                logger.debug('🔧 ValidateGeneratedQuestion - Auto-fixing: removing options from numeric question');
                delete question.options;
            }
            
            // Auto-fix: Convert string numbers to actual numbers
            if (typeof question.correctAnswer === 'string' && !isNaN(question.correctAnswer)) {
                logger.debug('🔧 ValidateGeneratedQuestion - Auto-fixing: converting string answer to number');
                question.correctAnswer = parseFloat(question.correctAnswer);
            }
            
            // Auto-fix: Add tolerance if missing
            if (question.tolerance === undefined) {
                logger.debug('🔧 ValidateGeneratedQuestion - Auto-fixing: adding default tolerance 0');
                question.tolerance = 0;
            }
            
            if (question.correctAnswer === undefined || isNaN(question.correctAnswer)) {
                logger.debug('❌ ValidateGeneratedQuestion - Numeric validation failed');
                return false;
            }
        } else {
            logger.debug('❌ ValidateGeneratedQuestion - Unknown question type:', question.type);
            return false;
        }
        
        logger.debug('✅ ValidateGeneratedQuestion - Question is valid');
        return true;
    }

    async openModal() {
        const modal = document.getElementById('ai-generator-modal');
        if (modal) {
            logger.debug('🚀 OpenModal - START');
            modal.style.display = 'flex';

            // Set provider to 'ollama' immediately
            const providerSelect = document.getElementById('ai-provider');
            logger.debug('🚀 OpenModal - Provider select found:', !!providerSelect);
            if (providerSelect) {
                logger.debug('🚀 OpenModal - Provider select current value before:', providerSelect.value);
                providerSelect.value = 'ollama';
                logger.debug('🚀 OpenModal - Provider select set to:', providerSelect.value);
            }

            // Clear API key input field to force fresh entry every time
            const apiKeyInput = document.getElementById('ai-api-key');
            if (apiKeyInput) {
                apiKeyInput.value = '';
                apiKeyInput.placeholder = 'Enter your API key';
            }

            // Show the model selection div immediately
            const modelSelection = document.getElementById('model-selection');
            logger.debug('🚀 OpenModal - Model selection div found:', !!modelSelection);
            if (modelSelection) {
                logger.debug('🚀 OpenModal - Model selection current display before:', window.getComputedStyle(modelSelection).display);
                modelSelection.classList.remove('hidden');
                modelSelection.style.display = 'block';
                logger.debug('🚀 OpenModal - Model selection set to block, computed style now:', window.getComputedStyle(modelSelection).display);
            }

            // Show loading message immediately
            const modelSelect = document.getElementById('ollama-model');
            logger.debug('🚀 OpenModal - Model select found:', !!modelSelect);
            if (modelSelect) {
                logger.debug('🚀 OpenModal - Model select current innerHTML before:', modelSelect.innerHTML);
                modelSelect.innerHTML = '<option value="">🔄 Loading models...</option>';
                modelSelect.disabled = true;
                logger.debug('🚀 OpenModal - Model select set to loading, innerHTML now:', modelSelect.innerHTML);
                logger.debug('🚀 OpenModal - Model select disabled:', modelSelect.disabled);
            }

            // Clear previous content
            const contentTextarea = document.getElementById('source-content');
            if (contentTextarea && !contentTextarea.value.trim()) {
                contentTextarea.placeholder = 'Enter your content here (e.g., a passage of text, topics to generate questions about, or paste from a document). ..';
            }

            // Reset question count to default
            const questionCount = document.getElementById('question-count');
            if (questionCount) {
                questionCount.value = AI.DEFAULT_QUESTION_COUNT;
            }

            // Update output language indicator
            this.updateOutputLanguageIndicator();

            logger.debug('🚀 OpenModal - About to set timeout for delayed loading');
            
            // Trigger the actual model loading after a short delay to let everything settle
            setTimeout(async () => {
                logger.debug('🚀 OpenModal - TIMEOUT TRIGGERED - Delayed model loading starting');
                
                // Debug current state before loading
                const currentModelSelection = document.getElementById('model-selection');
                const currentModelSelect = document.getElementById('ollama-model');
                
                logger.debug('🚀 TIMEOUT - Model selection div exists:', !!currentModelSelection);
                logger.debug('🚀 TIMEOUT - Model selection computed display:', currentModelSelection ? window.getComputedStyle(currentModelSelection).display : 'NOT_FOUND');
                logger.debug('🚀 TIMEOUT - Model select exists:', !!currentModelSelect);
                logger.debug('🚀 TIMEOUT - Model select innerHTML:', currentModelSelect ? currentModelSelect.innerHTML : 'NOT_FOUND');
                
                await this.loadOllamaModels();
                logger.debug('🚀 OpenModal - TIMEOUT COMPLETED - Model loading finished');
            }, 100);
            
            logger.debug('🚀 OpenModal - END');
        }
    }

    closeModal() {
        const modal = document.getElementById('ai-generator-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Show API key error popup with detailed information
     * @param {string} provider - The AI provider name
     * @param {string} errorType - Type of error: 'missing', 'invalid', or 'network'
     * @param {string} specificMessage - Specific error message from the API
     */
    showApiKeyErrorPopup(provider, errorType = 'missing', specificMessage = '') {
        logger.debug('showApiKeyErrorPopup called', { provider, errorType, specificMessage });

        const providerName = this.providers[provider]?.name || provider;
        let title, message, icon;

        if (specificMessage) {
            // Show the actual error message prominently
            title = `${providerName} Error`;
            message = specificMessage;
            icon = '❌';
        } else if (errorType === 'missing') {
            title = `API Key Required`;
            message = `Please enter your API key for ${providerName}`;
            icon = '🔑';
        } else {
            title = `${providerName} Error`;
            message = `There was an issue with ${providerName}. Please check your API key.`;
            icon = '❌';
        }

        // Create simple red error popup
        this.showSimpleErrorPopup(title, message, icon);
    }

    /**
     * Create and display a custom API key error modal
     */
    showSimpleErrorPopup(title, message, icon) {
        logger.debug('showSimpleErrorPopup called', { title, message, icon });

        // Remove any existing error modal
        const existingModal = document.getElementById('simple-error-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create simple red error modal
        const modalHTML = `
            <div id="simple-error-modal" class="modal" style="display: flex !important; z-index: 20000 !important; background: rgba(0,0,0,0.7) !important;">
                <div class="modal-content" style="
                    max-width: 400px !important; 
                    margin: auto !important; 
                    background: white !important; 
                    border-radius: 8px !important;
                    text-align: center !important;
                    padding: 30px !important;
                    border: 3px solid #dc2626 !important;
                ">
                    <div style="font-size: 3rem; margin-bottom: 15px;">${icon}</div>
                    <h3 style="margin: 0 0 15px 0 !important; color: #dc2626 !important; font-size: 1.3rem;">${title}</h3>
                    <p style="margin: 0 0 25px 0 !important; color: #dc2626 !important; font-size: 16px !important; font-weight: 500 !important;">${message}</p>
                    <button id="simple-error-ok" style="
                        background: #dc2626 !important;
                        color: white !important;
                        border: none !important;
                        padding: 12px 30px !important;
                        border-radius: 6px !important;
                        font-size: 16px !important;
                        cursor: pointer !important;
                        font-weight: 600 !important;
                    ">OK</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        const modal = document.getElementById('simple-error-modal');
        const okBtn = document.getElementById('simple-error-ok');

        if (!modal) {
            console.error('Failed to create error modal');
            alert(title + '\n\n' + message);
            return;
        }

        // Close modal
        const closeModal = () => {
            modal.remove();
            document.body.style.overflow = '';
        };

        if (okBtn) {
            okBtn.addEventListener('click', closeModal);
        }

        // Close on overlay click or escape key
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        });

        document.body.style.overflow = 'hidden';
        logger.debug('Simple error popup displayed');
    }
}

