/**
 * AI UI Helpers Module
 * Handles UI-related functionality for AI question generation
 *
 * Extracted from generator.js for better maintainability
 */

import { logger, AI } from '../core/config.js';
import { translationManager, showAlert } from '../utils/translation-manager.js';
import { APIHelper } from '../utils/api-helper.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';
import { toastNotifications } from '../utils/toast-notifications.js';
import { getItem, setItem } from '../utils/storage-utils.js';
import { dom } from '../utils/dom.js';

// Import extracted services
import { excelQuestionParser } from './excel-question-parser.js';

// Import language names from prompts
import { LANGUAGE_NATIVE_NAMES } from './prompts.js';

const TYPE_EMOJIS = {
    'mathematics': '\u{1F4D0}',
    'programming': '\u{1F4BB}',
    'physics': '\u{26A1}',
    'chemistry': '\u{1F9EA}',
    'biology': '\u{1F9EC}',
    'history': '\u{1F4DC}',
    'economics': '\u{1F4CA}',
    'general': '\u{1F4DD}'
};

const CONTENT_TYPE_TRANSLATION_KEYS = {
    'mathematics': 'content_type_mathematics',
    'programming': 'content_type_programming',
    'physics': 'content_type_physics',
    'chemistry': 'content_type_chemistry',
    'biology': 'content_type_biology',
    'history': 'content_type_history',
    'economics': 'content_type_economics',
    'general': 'content_type_general'
};

/**
 * AIUIHelpers class handles UI-related functionality for AI question generation
 * including content detection, provider changes, and file uploads
 */
export class AIUIHelpers {
    /**
     * @param {Object} generator - Reference to the main AIQuestionGenerator instance
     */
    constructor(generator) {
        this.generator = generator;
        this.isChangingProvider = false;
    }

    /**
     * Detect content type and programming language for smart formatting
     * @param {string} content - The content to analyze
     * @returns {Object} { type: string, language: string|null, hasExistingQuestions: boolean }
     */
    detectContentType(content) {
        if (!content) {
            this.updateContentAnalysisUI(null);
            return { type: 'general', language: null, hasExistingQuestions: false };
        }

        return errorHandler.safeExecute(
            () => {
                const result = {
                    type: 'general',
                    language: null,
                    hasExistingQuestions: AI.EXISTING_QUESTIONS_INDICATORS?.test(content) || false,
                    needsLatex: false,
                    needsCodeBlocks: false,
                    wordCount: content.split(/\s+/).filter(w => w.length > 0).length
                };

                // Validate patterns are loaded
                if (!AI.MATH_INDICATORS || !AI.PROGRAMMING_INDICATORS) {
                    logger.warn('AI content detection patterns not loaded');
                    this.updateContentAnalysisUI(result);
                    return result;
                }

                // Content type detection - order matters (more specific patterns first)
                const contentTypeChecks = [
                    { pattern: AI.MATH_INDICATORS, type: 'mathematics', needsLatex: true },
                    { pattern: AI.PHYSICS_INDICATORS, type: 'physics', needsLatex: true },
                    { pattern: AI.CHEMISTRY_INDICATORS, type: 'chemistry', needsLatex: true },
                    { pattern: AI.PROGRAMMING_INDICATORS, type: 'programming', needsCodeBlocks: true },
                    { pattern: AI.BIOLOGY_INDICATORS, type: 'biology' },
                    { pattern: AI.HISTORY_INDICATORS, type: 'history' },
                    { pattern: AI.ECONOMICS_INDICATORS, type: 'economics' }
                ];

                for (const check of contentTypeChecks) {
                    if (check.pattern?.test(content)) {
                        result.type = check.type;
                        if (check.needsLatex) result.needsLatex = true;
                        if (check.needsCodeBlocks) {
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
                        }
                        break;
                    }
                }

                this.updateContentAnalysisUI(result);
                this.updateCostEstimation(content);
                return result;
            },
            { operation: 'content-type-detection' },
            () => {
                const fallbackResult = { type: 'general', language: null, hasExistingQuestions: false };
                this.updateContentAnalysisUI(fallbackResult);
                return fallbackResult;
            }
        );
    }

    /**
     * Update the content analysis panel UI with detected information
     * @param {Object|null} result - Detection result or null to hide panel
     */
    updateContentAnalysisUI(result) {
        const panel = dom.get('content-analysis-panel');
        const typeEl = dom.get('detected-content-type');
        const formattingEl = dom.get('detected-formatting');
        const languageItem = dom.get('detected-language-item');
        const languageEl = dom.get('detected-language');
        const modeEl = dom.get('detected-mode');
        const recommendationEl = dom.get('analysis-recommendation');

        if (!panel) return;

        if (!result) {
            panel.classList.add('hidden');
            return;
        }

        panel.classList.remove('hidden');

        // Update type with emoji and translated name
        if (typeEl) {
            const typeKey = CONTENT_TYPE_TRANSLATION_KEYS[result.type] || 'content_type_general';
            const typeName = translationManager.getTranslationSync(typeKey) || 'General';
            typeEl.textContent = `${TYPE_EMOJIS[result.type] || TYPE_EMOJIS.general} ${typeName}`;
        }

        // Update formatting with translations
        if (formattingEl) {
            if (result.needsLatex) {
                formattingEl.textContent = '\u2728 ' + (translationManager.getTranslationSync('format_latex') || 'LaTeX math');
            } else if (result.needsCodeBlocks) {
                formattingEl.textContent = '\u2328\uFE0F ' + (translationManager.getTranslationSync('format_code') || 'Code blocks');
            } else {
                formattingEl.textContent = '\uD83D\uDCC4 ' + (translationManager.getTranslationSync('format_standard') || 'Standard');
            }
        }

        // Update language (for programming)
        if (languageItem && languageEl) {
            if (result.language) {
                languageItem.classList.remove('hidden');
                languageItem.classList.add('visible-flex');
                languageEl.textContent = result.language.charAt(0).toUpperCase() + result.language.slice(1);
            } else {
                languageItem.classList.remove('visible-flex');
                languageItem.classList.add('hidden');
            }
        }

        // Update mode with translations
        if (modeEl) {
            const modeKey = result.hasExistingQuestions ? 'mode_format_existing' : 'mode_generate_new';
            const modeText = translationManager.getTranslationSync(modeKey) || (result.hasExistingQuestions ? 'Format existing' : 'Generate new');
            modeEl.textContent = result.hasExistingQuestions ? '\uD83D\uDD04 ' + modeText : '\u2728 ' + modeText;
        }

        // Update recommendation with translations
        if (recommendationEl) {
            let recommendation = '';
            if (result.hasExistingQuestions) {
                recommendation = '\uD83D\uDCA1 ' + (translationManager.getTranslationSync('recommendation_existing_questions') || 'Existing questions detected. The AI will format and structure them.');
            } else if (result.needsLatex) {
                recommendation = '\uD83D\uDCA1 ' + (translationManager.getTranslationSync('recommendation_math_content') || 'Math content detected. Questions will include LaTeX formatting.');
            } else if (result.needsCodeBlocks) {
                let codeRec = translationManager.getTranslationSync('recommendation_code_content') || 'Code detected. Questions will include syntax-highlighted code blocks.';
                if (result.language) {
                    codeRec = codeRec.replace('Code detected', `Code detected (${result.language})`);
                }
                recommendation = '\uD83D\uDCA1 ' + codeRec;
            } else if (result.wordCount && result.wordCount > 500) {
                recommendation = '\uD83D\uDCA1 ' + (translationManager.getTranslationSync('recommendation_rich_content') || 'Rich content detected. Consider generating multiple questions.');
            }
            recommendationEl.textContent = recommendation;
            if (recommendation) {
                recommendationEl.classList.remove('hidden');
            } else {
                recommendationEl.classList.add('hidden');
            }
        }
    }

    /**
     * Update the output language indicator to show current app language
     */
    updateOutputLanguageIndicator() {
        const languageNameEl = dom.get('output-language-name');
        if (!languageNameEl) return;

        const language = translationManager.getCurrentLanguage() || 'en';
        languageNameEl.textContent = LANGUAGE_NATIVE_NAMES[language] || 'English';
    }

    /**
     * Update cost estimation based on content and provider
     * @param {string} content - The source content
     */
    updateCostEstimation(content) {
        const costPanel = dom.get('cost-estimation');
        const costValue = dom.get('estimated-cost');
        const tokensValue = dom.get('estimated-tokens');
        const provider = dom.get('ai-provider')?.value;
        const questionCount = parseInt(dom.get('question-count')?.value) || 1;

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
            costPanel.classList.add('hidden');
            return;
        }

        // Show for non-free providers or always show for transparency
        if (provider === 'ollama') {
            costValue.textContent = translationManager.getTranslationSync('cost_free') || 'Free';
            tokensValue.textContent = `(~${this.formatTokenCount(totalTokens)} tokens)`;
            costPanel.classList.remove('hidden');
            costPanel.classList.add('visible-flex');
        } else {
            const estimatedCost = (inputTokens * providerCost.input / 1000000) + (outputTokens * providerCost.output / 1000000);
            costValue.textContent = estimatedCost < 0.01 ? '<$0.01' : `~$${estimatedCost.toFixed(3)}`;
            tokensValue.textContent = `(~${this.formatTokenCount(totalTokens)} tokens)`;
            costPanel.classList.remove('hidden');
            costPanel.classList.add('visible-flex');
        }
    }

    /**
     * Format token count for display (e.g., 1500 -> "1.5K")
     * @param {number} count - Token count
     * @returns {string} Formatted count
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
     * Handle provider change event
     * @param {string} provider - The selected provider
     */
    async handleProviderChange(provider) {
        return await errorHandler.wrapAsyncOperation(async () => {
            // Prevent multiple simultaneous calls
            if (this.isChangingProvider) return;

            this.isChangingProvider = true;

            try {
                const apiKeySection = dom.get('api-key-section');
                const modelSelection = dom.get('model-selection');
                const claudeModelSelection = dom.get('claude-model-selection');
                const geminiModelSelection = dom.get('gemini-model-selection');

                if (!apiKeySection || !modelSelection) return;

                // Show/hide API key section based on provider requirements
                const needsApiKey = this.generator.providers[provider]?.apiKey;
                if (needsApiKey) {
                    apiKeySection.classList.remove('hidden');
                    const apiKeyInput = dom.get('ai-api-key');
                    if (apiKeyInput) {
                        apiKeyInput.value = '';
                        apiKeyInput.placeholder = 'Enter your API key';
                    }
                } else {
                    apiKeySection.classList.add('hidden');
                }

                // Handle model selection visibility
                if (provider === 'ollama') {
                    modelSelection.classList.remove('hidden');
                    if (claudeModelSelection) claudeModelSelection.classList.add('hidden');
                    if (geminiModelSelection) geminiModelSelection.classList.add('hidden');
                    await this.loadOllamaModels();
                } else if (provider === 'claude') {
                    modelSelection.classList.add('hidden');
                    if (claudeModelSelection) claudeModelSelection.classList.remove('hidden');
                    if (geminiModelSelection) geminiModelSelection.classList.add('hidden');
                } else if (provider === 'gemini') {
                    modelSelection.classList.add('hidden');
                    if (claudeModelSelection) claudeModelSelection.classList.add('hidden');
                    if (geminiModelSelection) geminiModelSelection.classList.remove('hidden');
                } else {
                    modelSelection.classList.add('hidden');
                    if (claudeModelSelection) claudeModelSelection.classList.add('hidden');
                    if (geminiModelSelection) geminiModelSelection.classList.add('hidden');
                }
                // Re-trigger content detection for existing content
                const contentTextarea = dom.get('source-content');
                if (contentTextarea?.value?.trim()) {
                    this.detectContentType(contentTextarea.value);
                }
            } finally {
                this.isChangingProvider = false;
            }
        }, {
            errorType: errorHandler.errorTypes.SYSTEM,
            context: 'provider-change',
            userMessage: null,
            retryable: false,
            fallback: () => {
                this.isChangingProvider = false;
            }
        });
    }

    /**
     * Load available Ollama models from local server
     */
    async loadOllamaModels() {
        return await errorHandler.wrapAsyncOperation(async () => {
            const modelSelect = dom.get('ollama-model');
            const modelSelection = dom.get('model-selection');

            if (!modelSelect) return;

            // Ensure the parent div is visible
            if (modelSelection) {
                modelSelection.classList.remove('hidden');
            }

            // Set loading state
            modelSelect.innerHTML = '<option value="">\u{1F504} Loading models...</option>';
            modelSelect.disabled = true;

            try {
                // Use AbortController with short timeout - Ollama should respond quickly if running
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);

                const response = await fetch(AI.OLLAMA_TAGS_ENDPOINT, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                const models = data.models || [];

                modelSelect.innerHTML = '';

                if (models.length === 0) {
                    modelSelect.innerHTML = '<option value="">No models found</option>';
                } else {
                    models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.name;
                        option.textContent = `${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(1)}GB)`;
                        modelSelect.appendChild(option);
                    });

                    // Restore saved selection or set default
                    const savedModel = getItem('ollama_selected_model');
                    if (savedModel && models.some(m => m.name === savedModel)) {
                        modelSelect.value = savedModel;
                    } else if (models.length > 0) {
                        modelSelect.value = models[0].name;
                        setItem('ollama_selected_model', models[0].name);
                    }
                }

            } finally {
                modelSelect.disabled = false;
                // Ensure visibility after loading
                if (modelSelection) {
                    modelSelection.classList.remove('hidden');
                }
            }
        }, {
            errorType: errorHandler.errorTypes.NETWORK,
            context: 'ollama-model-loading',
            userMessage: null,
            silent: true,
            retryable: false,
            fallback: () => {
                const modelSelect = dom.get('ollama-model');
                if (!modelSelect) return;

                const fallbackModels = this.generator.providers.ollama.models;
                if (fallbackModels && fallbackModels.length > 0) {
                    modelSelect.innerHTML = '';
                    fallbackModels.forEach(modelName => {
                        const option = document.createElement('option');
                        option.value = modelName;
                        option.textContent = `${modelName} (fallback)`;
                        modelSelect.appendChild(option);
                    });
                    modelSelect.value = fallbackModels[0];
                    setItem('ollama_selected_model', fallbackModels[0]);
                } else {
                    modelSelect.innerHTML = '<option value="">\u274C Ollama not available</option>';
                }
            }
        });
    }

    /**
     * Handle file upload and route to appropriate handler
     * @param {File} file - The uploaded file
     */
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

        // Check if file is Word document
        if (fileExtension === 'docx') {
            this.handleDocxUpload(file);
            return;
        }

        // Check if file is PowerPoint
        if (fileExtension === 'pptx' || fileExtension === 'ppt') {
            this.handlePptxUpload(file);
            return;
        }

        // Handle text-based files as before
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const contentTextarea = dom.get('source-content');
            if (contentTextarea) {
                contentTextarea.value = content;
                this.detectContentType(content);
            }
        };
        reader.readAsText(file);
    }

    /**
     * Handle PDF file upload
     * @param {File} file - The PDF file
     */
    async handlePdfUpload(file) {
        const contentTextarea = dom.get('source-content');
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

            logger.debug(`PDF extracted: ${data.pages} pages, ${data.text.length} characters`);

            // Show success notification
            const message = (translationManager.getTranslationSync('pdf_extracted') || 'PDF extracted: {pages} pages')
                .replace('{pages}', data.pages);
            toastNotifications.success(message);

        } catch (error) {
            logger.error('PDF extraction failed:', error);
            contentTextarea.value = '';

            // Show error to user
            toastNotifications.error(error.message);
        } finally {
            contentTextarea.disabled = false;
        }
    }

    /**
     * Handle DOCX file upload
     * @param {File} file - The DOCX file
     */
    async handleDocxUpload(file) {
        const contentTextarea = dom.get('source-content');
        if (!contentTextarea) return;

        // Show loading state
        contentTextarea.value = translationManager.getTranslationSync('extracting_docx') || 'Extracting text from Word document...';
        contentTextarea.disabled = true;

        try {
            const formData = new FormData();
            formData.append('docx', file);

            const response = await fetch(APIHelper.getApiUrl('api/extract-docx'), {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'DOCX extraction failed');
            }

            if (!data.text || data.text.trim().length === 0) {
                throw new Error(translationManager.getTranslationSync('docx_no_text') || 'No text content found in document');
            }

            contentTextarea.value = data.text;
            this.detectContentType(data.text);

            logger.debug(`DOCX extracted: ${data.wordCount} words`);

            // Show success notification
            const message = translationManager.getTranslationSync('docx_extracted') || 'Word document extracted';
            toastNotifications.success(message);

        } catch (error) {
            logger.error('DOCX extraction failed:', error);
            contentTextarea.value = '';
            toastNotifications.error(error.message);
        } finally {
            contentTextarea.disabled = false;
        }
    }

    /**
     * Handle PPTX file upload
     * @param {File} file - The PPTX file
     */
    async handlePptxUpload(file) {
        const contentTextarea = dom.get('source-content');
        if (!contentTextarea) return;

        // Show loading state
        contentTextarea.value = translationManager.getTranslationSync('extracting_pptx') || 'Extracting text from slides...';
        contentTextarea.disabled = true;

        try {
            const formData = new FormData();
            formData.append('pptx', file);

            const response = await fetch(APIHelper.getApiUrl('api/extract-pptx'), {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'PowerPoint extraction failed');
            }

            if (!data.text || data.text.trim().length === 0) {
                throw new Error(translationManager.getTranslationSync('pptx_no_text') || 'No text content found in presentation');
            }

            contentTextarea.value = data.text;
            this.detectContentType(data.text);

            logger.debug(`PPTX extracted: ~${data.slideCount} slides, ${data.text.length} chars`);

            // Show success notification
            const message = (translationManager.getTranslationSync('pptx_extracted') || 'Slides extracted: {count} slides')
                .replace('{count}', data.slideCount);
            toastNotifications.success(message);

        } catch (error) {
            logger.error('PPTX extraction failed:', error);
            contentTextarea.value = '';
            toastNotifications.error(error.message);
        } finally {
            contentTextarea.disabled = false;
        }
    }

    /**
     * Handle URL fetch
     */
    async handleUrlFetch() {
        const urlInput = dom.get('source-url');
        const contentTextarea = dom.get('source-content');
        const fetchBtn = dom.get('fetch-url-btn');

        if (!urlInput || !contentTextarea) return;

        const url = urlInput.value.trim();

        // Validate URL
        if (!url) {
            toastNotifications.error(translationManager.getTranslationSync('invalid_url') || 'Please enter a valid URL');
            return;
        }

        // Basic URL validation
        try {
            new URL(url);
        } catch {
            toastNotifications.error(translationManager.getTranslationSync('invalid_url') || 'Please enter a valid URL');
            return;
        }

        // Show loading state
        contentTextarea.value = translationManager.getTranslationSync('fetching_url') || 'Fetching content...';
        contentTextarea.disabled = true;
        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = '...';
        }

        try {
            const response = await fetch(APIHelper.getApiUrl('api/extract-url'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (!response.ok) {
                // Handle specific error cases
                if (response.status === 429) {
                    throw new Error(data.message || 'Rate limit exceeded. Please wait before trying again.');
                }
                if (response.status === 403) {
                    throw new Error(translationManager.getTranslationSync('url_blocked') || 'This URL cannot be accessed');
                }
                throw new Error(data.message || data.error || 'Failed to fetch URL');
            }

            if (!data.text || data.text.trim().length < 50) {
                // If we got very little text, still show it but warn the user
                if (data.text && data.text.trim().length > 0) {
                    logger.warn(`URL extraction returned minimal content: ${data.wordCount} words`);
                    contentTextarea.value = data.text;
                    this.detectContentType(data.text);
                    toastNotifications.warning(
                        (translationManager.getTranslationSync('url_minimal_text') || 'Only {count} words extracted - page may use JavaScript rendering')
                            .replace('{count}', data.wordCount)
                    );
                    urlInput.value = '';
                    return;
                }
                throw new Error(translationManager.getTranslationSync('url_no_text') || 'No text content found at URL');
            }

            contentTextarea.value = data.text;
            this.detectContentType(data.text);

            logger.debug(`URL extracted: ${data.title}, ${data.wordCount} words`);

            // Show success notification with word count
            const message = (translationManager.getTranslationSync('url_fetched') || 'Content extracted')
                + ` (${data.wordCount} ${translationManager.getTranslationSync('words') || 'words'})`;
            toastNotifications.success(message);

            // Clear the URL input
            urlInput.value = '';

        } catch (error) {
            logger.error('URL extraction failed:', error);
            contentTextarea.value = '';
            toastNotifications.error(error.message);
        } finally {
            contentTextarea.disabled = false;
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = translationManager.getTranslationSync('fetch_content') || 'Fetch';
            }
        }
    }

    /**
     * Handle Excel file upload
     * @param {File} file - The Excel file
     */
    async handleExcelUpload(file) {
        // Check if parser is available
        if (!excelQuestionParser.isAvailable()) {
            logger.error('XLSX library not loaded');
            showAlert('Excel processing library not available', 'error');
            return;
        }

        logger.debug('Processing Excel file:', file.name);

        try {
            // Parse file using ExcelQuestionParser
            const { data: jsonData } = await excelQuestionParser.parseFile(file);

            // Get provider for batch sizing
            const provider = dom.get('ai-provider')?.value || 'ollama';

            // Convert to structured text for AI
            const structuredText = excelQuestionParser.convertToStructuredText(jsonData, file.name, provider);

            if (structuredText) {
                // Put the structured text in the content textarea
                const contentTextarea = dom.get('source-content');
                if (contentTextarea) {
                    contentTextarea.value = structuredText;
                    this.detectContentType(structuredText);
                }

                // Auto-fill question count from detected count
                const questionCountField = dom.get('question-count');
                const detectedCount = excelQuestionParser.getDetectedQuestionCount();
                if (questionCountField && detectedCount) {
                    questionCountField.value = detectedCount;
                    this.generator.detectedQuestionCount = detectedCount;
                    logger.debug('Auto-filled question count to', detectedCount);
                }

                // Sync batch info from parser
                this.generator.batchInfo = excelQuestionParser.getBatchInfo();

                logger.debug('Excel converted to structured text for AI');
            } else {
                throw new Error('No valid data found in Excel file');
            }
        } catch (error) {
            logger.error('Excel processing failed:', error);
            showAlert('Failed to process Excel file: ' + error.message, 'error');
        }
    }
}
