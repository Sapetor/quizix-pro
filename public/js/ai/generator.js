/**
 * AI Question Generator Module
 * Handles AI-powered question generation from various providers
 *
 * Refactored to use helper classes for better maintainability:
 * - AIQuestionPreview: Preview modal logic
 * - AIBatchProcessor: Batch processing logic
 * - AIUIHelpers: UI helper methods
 */

import { logger, AI, TIMING } from '../core/config.js';
import { translationManager } from '../utils/translation-manager.js';
import { secureStorage } from '../services/secure-storage-service.js';
import { APIHelper } from '../utils/api-helper.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';
import { dom, escapeHtml } from '../utils/dom.js';
import { setItem } from '../utils/storage-utils.js';
import {
    openModal,
    closeModal,
    bindOverlayClose,
    bindEscapeClose,
    getModal
} from '../utils/modal-utils.js';

// Import prompt templates
import {
    buildMainPrompt,
    buildRetryPrompt,
    buildExcelConversionPrompt,
    buildFormattingInstructions,
    buildBloomInstructions
} from './prompts.js';

// Import extracted services
import { aiProviderService } from './ai-provider-service.js';
import { aiQuestionValidator } from './ai-question-validator.js';
import { excelQuestionParser } from './excel-question-parser.js';

// Import helper classes
import { AIQuestionPreview } from './ai-question-preview.js';
import { AIBatchProcessor } from './ai-batch-processor.js';
import { AIUIHelpers } from './ai-ui-helpers.js';

export class AIQuestionGenerator {
    constructor() {
        this.providers = {
            ollama: {
                name: 'Ollama (Local)',
                apiKey: false,
                endpoint: AI.OLLAMA_ENDPOINT,
                models: ['llama3.2:latest', 'codellama:13b-instruct', 'codellama:7b-instruct', 'codellama:7b-code']
            },
            openai: {
                name: 'OpenAI',
                apiKey: true,
                endpoint: 'https://api.openai.com/v1/chat/completions',
                models: [AI.OPENAI_MODEL, 'gpt-4']
            },
            claude: {
                name: 'Anthropic Claude',
                apiKey: true,
                endpoint: 'https://api.anthropic.com/v1/messages',
                models: [
                    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (Recommended)' },
                    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (Fast & Cheap)' },
                    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5 (Most Capable)' },
                    { id: 'claude-sonnet-4-0', name: 'Claude Sonnet 4 (Legacy)' }
                ]
            },
            gemini: {
                name: 'Google Gemini',
                apiKey: true,
                endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
                models: [AI.GEMINI_MODEL, 'gemini-2.0-flash', 'gemini-1.5-pro']
            }
        };

        this.isGenerating = false;
        this.eventHandlers = {};
        this.batchInfo = null;
        this.requestedQuestionCount = 1;
        this.detectedQuestionCount = null;

        // Dependency injection properties
        this._quizManager = null;
        this._addQuestionFn = null;

        // Initialize helper classes
        this.questionPreview = new AIQuestionPreview(this);
        this.batchProcessor = new AIBatchProcessor(this);
        this.uiHelpers = new AIUIHelpers(this);

        this.initializeEventListeners();
        this.initializeSecureStorage();
    }

    /**
     * Dependency injection: Set quiz manager reference
     * @param {Object} quizManager - QuizManager instance
     */
    setQuizManager(quizManager) {
        this._quizManager = quizManager;
    }

    /**
     * Dependency injection: Set addQuestion function
     * @param {Function} addQuestionFn - Function to add a new question
     */
    setAddQuestionFunction(addQuestionFn) {
        this._addQuestionFn = addQuestionFn;
    }

    /**
     * Get quiz manager with fallback to window.game
     * @returns {Object|null}
     */
    _getQuizManager() {
        return this._quizManager || window.game?.quizManager || null;
    }

    /**
     * Get addQuestion function with fallback to window.game
     * @returns {Function|null}
     */
    _getAddQuestionFn() {
        return this._addQuestionFn || window.game?.addQuestion || null;
    }

    /**
     * Initialize secure storage and migrate existing API keys
     */
    async initializeSecureStorage() {
        return await errorHandler.wrapAsyncOperation(async () => {
            if (!secureStorage.constructor.isSupported()) {
                logger.warn('Web Crypto API not supported - API keys will not be encrypted');
                return;
            }
            await secureStorage.migrateApiKeys();
            logger.debug('Secure storage initialized and API keys migrated');
        }, {
            errorType: errorHandler.errorTypes.SYSTEM,
            context: 'secure-storage-initialization',
            userMessage: null,
            retryable: false,
            fallback: null
        });
    }

    initializeEventListeners() {
        const modal = getModal('ai-generator-modal');
        const closeButton = dom.get('close-ai-generator');

        // Use modal-utils for overlay click and escape key handlers
        this.eventHandlers.modalClick = bindOverlayClose(modal, () => this.closeModalMethod());
        this.eventHandlers.keydown = bindEscapeClose(modal, () => this.closeModalMethod());

        this.eventHandlers.closeButtonClick = () => this.closeModalMethod();
        this.eventHandlers.providerChange = (e) => this.uiHelpers.handleProviderChange(e.target.value);
        this.eventHandlers.modelChange = (e) => {
            if (e.target.value) {
                setItem('ollama_selected_model', e.target.value);
            }
        };
        this.eventHandlers.fileChange = (e) => this.uiHelpers.handleFileUpload(e.target.files[0]);
        this.eventHandlers.contentInput = (e) => this.uiHelpers.detectContentType(e.target.value);
        this.eventHandlers.generateClick = () => this.generateQuestions();
        this.eventHandlers.cancelClick = () => this.closeModalMethod();
        this.eventHandlers.apiKeyBlur = async (e) => {
            await errorHandler.wrapAsyncOperation(async () => {
                const provider = dom.get('ai-provider')?.value;
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
        this.eventHandlers.fetchUrlClick = () => this.uiHelpers.handleUrlFetch();

        // Attach listeners
        if (closeButton) {
            closeButton.addEventListener('click', this.eventHandlers.closeButtonClick);
        }

        const providerSelect = dom.get('ai-provider');
        if (providerSelect) {
            providerSelect.addEventListener('change', this.eventHandlers.providerChange);
        }

        const modelSelect = dom.get('ollama-model');
        if (modelSelect) {
            modelSelect.addEventListener('change', this.eventHandlers.modelChange);
        }

        const fileInput = dom.get('content-file');
        if (fileInput) {
            fileInput.addEventListener('change', this.eventHandlers.fileChange);
        }

        const contentTextarea = dom.get('source-content');
        if (contentTextarea) {
            contentTextarea.addEventListener('input', this.eventHandlers.contentInput);
        }

        const generateBtn = dom.get('generate-questions');
        if (generateBtn) {
            generateBtn.addEventListener('click', this.eventHandlers.generateClick);
        }

        const cancelBtn = dom.get('cancel-ai-generator');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', this.eventHandlers.cancelClick);
        }

        const apiKeyInput = dom.get('ai-api-key');
        if (apiKeyInput) {
            apiKeyInput.addEventListener('blur', this.eventHandlers.apiKeyBlur);
        }

        const fetchUrlBtn = dom.get('fetch-url-btn');
        if (fetchUrlBtn) {
            fetchUrlBtn.addEventListener('click', this.eventHandlers.fetchUrlClick);
        }
    }

    /**
     * Clean up all event listeners to prevent memory leaks
     */
    cleanup() {
        const modal = dom.get('ai-generator-modal');
        const closeButton = dom.get('close-ai-generator');
        const providerSelect = dom.get('ai-provider');
        const modelSelect = dom.get('ollama-model');
        const fileInput = dom.get('content-file');
        const contentTextarea = dom.get('source-content');
        const generateBtn = dom.get('generate-questions');
        const cancelBtn = dom.get('cancel-ai-generator');
        const apiKeyInput = dom.get('ai-api-key');
        const fetchUrlBtn = dom.get('fetch-url-btn');

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
        if (fetchUrlBtn && this.eventHandlers.fetchUrlClick) {
            fetchUrlBtn.removeEventListener('click', this.eventHandlers.fetchUrlClick);
        }

        // Clean up helper classes
        this.questionPreview.cleanup();

        this.eventHandlers = {};
        logger.debug('AI Generator event listeners cleaned up');
    }

    /**
     * Truncate text at a word boundary to avoid cutting words mid-way
     */
    truncateAtWordBoundary(text, maxLength) {
        if (!text || text.length <= maxLength) return text;

        const truncated = text.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        const lastNewline = truncated.lastIndexOf('\n');
        const lastBreak = Math.max(lastSpace, lastNewline);

        if (lastBreak > maxLength - 200) {
            return text.substring(0, lastBreak) + '...';
        }
        return truncated + '...';
    }

    async generateQuestions() {
        logger.debug('generateQuestions called');

        if (this.isGenerating) {
            logger.debug('Generation already in progress, ignoring request');
            return;
        }

        this.isGenerating = true;

        let provider, content, questionCount, difficulty, selectedTypes;

        try {
            provider = dom.get('ai-provider')?.value;
            content = dom.get('source-content')?.value?.trim();
            questionCount = parseInt(dom.get('question-count')?.value) || 1;
            difficulty = dom.get('difficulty-level')?.value || 'medium';

            logger.debug('Form values:', { provider, content: content?.length, questionCount, difficulty });

            selectedTypes = [];
            if (dom.get('type-multiple-choice')?.checked) selectedTypes.push('multiple-choice');
            if (dom.get('type-true-false')?.checked) selectedTypes.push('true-false');
            if (dom.get('type-multiple-correct')?.checked) selectedTypes.push('multiple-correct');
            if (dom.get('type-numeric')?.checked) selectedTypes.push('numeric');
            if (dom.get('type-ordering')?.checked) selectedTypes.push('ordering');

            logger.debug('Selected question types:', selectedTypes);

            if (!provider) {
                this.showSimpleErrorPopup('No AI Provider Selected', 'Please select an AI provider to generate questions.\n\nAvailable options:\n- OpenAI (paid)\n- Claude (paid)\n- Gemini (paid)\n- Ollama (free, local)', '\uD83E\uDD16');
                this.isGenerating = false;
                return;
            }

            if (!content) {
                this.showSimpleErrorPopup('No Content Provided', 'Please enter source content for question generation.\n\nYou can provide:\n- Text passages to create questions about\n- Topics you want questions on\n- Educational content to quiz students about\n- Any material you want to turn into quiz questions', '\uD83D\uDCDD');
                this.isGenerating = false;
                return;
            }

            if (selectedTypes.length === 0) {
                this.showSimpleErrorPopup('No Question Types Selected', 'Please select at least one question type to generate.\n\nAvailable types:\n- Multiple Choice (4 options, 1 correct)\n- True/False (factual statements)\n- Multiple Correct (select all that apply)\n- Numeric (number-based answers)\n- Ordering (arrange items in sequence)');
                this.isGenerating = false;
                return;
            }

        } catch (error) {
            logger.error('Validation error:', error);
            this.showSimpleErrorPopup('Validation Error', `Form validation failed: ${error.message}\n\nPlease check your inputs and try again.`);
            this.isGenerating = false;
            return;
        }

        this.requestedQuestionCount = questionCount;

        const needsApiKey = this.providers[provider]?.apiKey;
        if (needsApiKey) {
            const apiKey = await secureStorage.getSecureItem(`api_key_${provider}`);
            if (!apiKey || apiKey.trim().length === 0) {
                logger.warn(`Missing or empty API key for provider: ${provider}`);
                this.showApiKeyErrorPopup(provider, 'missing');
                this.isGenerating = false;
                return;
            }
        }

        const generateBtn = dom.get('generate-questions');
        const statusDiv = dom.get('generation-status');

        if (generateBtn) generateBtn.disabled = true;
        if (statusDiv) statusDiv.classList.remove('hidden');

        try {
            logger.debug('Starting question generation with provider:', provider);

            if (this.batchInfo) {
                logger.debug('Starting batched Excel processing');
                await this.batchProcessor.processBatchedGeneration();
                return;
            }

            const prompt = this.buildPrompt(content, questionCount, difficulty, selectedTypes);

            const maxRetries = 3;
            let questions = [];

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (attempt > 1) {
                        const statusText = statusDiv?.querySelector('span');
                        if (statusText) {
                            statusText.textContent = `Retry attempt ${attempt}/${maxRetries}...`;
                        }
                        logger.debug(`Retry attempt ${attempt}/${maxRetries}`);
                    }

                    const currentPrompt = attempt === 1 ? prompt : this.buildRetryPrompt(content, questionCount, difficulty, selectedTypes, attempt);
                    questions = await this.batchProcessor.generateWithProvider(provider, currentPrompt);

                    if (questions && questions.length > 0) {
                        if (attempt > 1) {
                            logger.debug(`Retry successful on attempt ${attempt}`);
                        }
                        break;
                    }

                } catch (providerError) {
                    logger.debug(`Provider error on attempt ${attempt}:`, providerError.message);

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
                    }

                    const isJsonError = providerError.message.includes('Invalid JSON') ||
                                       providerError.message.includes('JSON parsing') ||
                                       providerError.message.includes('Unexpected token');

                    if (isJsonError && attempt < maxRetries) {
                        logger.debug('JSON parsing failed, will retry with simplified prompt');
                        await new Promise(resolve => setTimeout(resolve, TIMING.RETRY_DELAY));
                        continue;
                    }

                    if (attempt === maxRetries) {
                        this.showSimpleErrorPopup('Generation Failed', `${providerError.message}\n\nPossible solutions:\n- Check your API key is correct\n- Verify your account has credits\n- Try with different content\n- Wait a moment and try again\n\n(Tried ${maxRetries} times)`);
                        return;
                    }
                }
            }

            logger.debug('Generation completed, questions:', questions?.length);

            if (questions && questions.length > 0) {
                if (questions.length > this.requestedQuestionCount) {
                    questions = questions.slice(0, this.requestedQuestionCount);
                }
                this.questionPreview.showQuestionPreview(questions);
                this.isGenerating = false;
            } else {
                logger.debug('No questions generated');
                this.showSimpleErrorPopup('No Questions Generated', 'The AI provider returned no questions.\n\nTry:\n- Providing more detailed content\n- Using different question types\n- Rephrasing your content\n- Checking if your content is suitable for quiz questions');
            }

        } finally {
            if (generateBtn) generateBtn.disabled = false;
            if (statusDiv) statusDiv.classList.add('hidden');
            this.isGenerating = false;
        }
    }

    buildPrompt(content, questionCount, difficulty, selectedTypes) {
        if (!selectedTypes || !Array.isArray(selectedTypes)) {
            logger.warn('buildPrompt called with invalid selectedTypes:', selectedTypes);
            selectedTypes = ['multiple-choice'];
        }

        if (content.includes('# Quiz Questions from Excel File:') && content.includes('INSTRUCTIONS FOR AI:')) {
            return this.buildExcelConversionPrompt(content);
        }

        const contentInfo = this.uiHelpers.detectContentType(content);
        const cognitiveLevel = dom.get('cognitive-level')?.value || 'mixed';

        return buildMainPrompt({
            content,
            questionCount,
            difficulty,
            selectedTypes,
            contentInfo,
            isFormattingExistingQuestions: contentInfo.hasExistingQuestions,
            cognitiveLevel
        });
    }

    buildRetryPrompt(content, questionCount, difficulty, selectedTypes, attemptNumber) {
        return buildRetryPrompt({
            content,
            questionCount,
            difficulty,
            selectedTypes,
            attemptNumber,
            truncateAtWordBoundary: this.truncateAtWordBoundary.bind(this)
        });
    }

    buildBloomInstructions(cognitiveLevel) {
        return buildBloomInstructions(cognitiveLevel);
    }

    buildExcelConversionPrompt(content) {
        return buildExcelConversionPrompt(content);
    }

    buildFormattingInstructions(contentInfo) {
        return buildFormattingInstructions(contentInfo);
    }

    // Provider generation methods
    async generateWithOllama(prompt) {
        const rawResponse = await aiProviderService.generateWithOllama(prompt);
        return this.parseAIResponse(rawResponse);
    }

    async generateWithOpenAI(prompt) {
        const rawResponse = await aiProviderService.generateWithOpenAI(prompt);
        return this.parseAIResponse(rawResponse);
    }

    async generateWithClaude(prompt) {
        logger.debug('generateWithClaude called');

        try {
            const modelSelect = dom.get('claude-model');
            const selectedModel = modelSelect?.value || 'claude-sonnet-4-5';

            const rawResponse = await aiProviderService.generateWithClaude(prompt, {
                model: selectedModel,
                numQuestions: this.requestedQuestionCount || 5
            });

            return this.parseAIResponse(rawResponse);

        } catch (error) {
            logger.debug('Claude generation error caught:', error.message);
            this.showSimpleErrorPopup('Claude Error', error.message, '\u274C');
            throw error;
        }
    }

    async generateWithGemini(prompt) {
        logger.debug('generateWithGemini called');

        try {
            const modelSelect = dom.get('gemini-model');
            const selectedModel = modelSelect?.value || 'gemini-2.5-flash';

            const rawResponse = await aiProviderService.generateWithGemini(prompt, {
                model: selectedModel,
                numQuestions: this.requestedQuestionCount || 5
            });

            return this.parseAIResponse(rawResponse);

        } catch (error) {
            logger.debug('Gemini generation error caught:', error.message);
            this.showSimpleErrorPopup('Gemini Error', error.message, '\u274C');
            throw error;
        }
    }

    parseAIResponse(responseText) {
        aiQuestionValidator.setRequestedCount(this.requestedQuestionCount || 1);
        return aiQuestionValidator.parseAIResponse(responseText);
    }

    fixCommonJsonIssues(jsonText) {
        return aiQuestionValidator.fixCommonJsonIssues(jsonText);
    }

    extractQuestionsManually(responseText) {
        aiQuestionValidator.setRequestedCount(this.requestedQuestionCount || 1);
        return aiQuestionValidator.extractQuestionsManually(responseText);
    }

    // Delegate to UI helpers for content detection
    detectContentType(content) {
        return this.uiHelpers.detectContentType(content);
    }

    // Excel processing delegates
    convertExcelToStructuredText(jsonData, filename, batchStart = 0, batchSize = null) {
        const provider = dom.get('ai-provider')?.value || 'ollama';
        const result = excelQuestionParser.convertToStructuredText(jsonData, filename, provider, batchStart, batchSize);
        this.batchInfo = excelQuestionParser.getBatchInfo();
        this.detectedQuestionCount = excelQuestionParser.getDetectedQuestionCount();
        return result;
    }

    detectExcelFormat(jsonData) {
        return excelQuestionParser.detectFormat(jsonData);
    }

    formatExcelDataWithDetection(jsonData, filename, batchStart = 0, batchSize = null) {
        return excelQuestionParser.formatDataWithDetection(jsonData, filename, batchStart, batchSize);
    }

    async processGeneratedQuestions(questions, showAlerts = true) {
        logger.debug('ProcessGeneratedQuestions - Starting with questions:', questions.length);

        const quizManager = this._getQuizManager();
        if (quizManager) {
            let validCount = 0;
            let invalidCount = 0;

            for (let index = 0; index < questions.length; index++) {
                const questionData = questions[index];
                logger.debug(`ProcessGeneratedQuestions - Processing question ${index + 1}:`, {
                    type: questionData.type,
                    hasQuestion: !!questionData.question,
                    hasOptions: !!questionData.options,
                    optionsLength: questionData.options?.length,
                    correctAnswer: questionData.correctAnswer,
                    correctAnswers: questionData.correctAnswers,
                    hasImageData: !!questionData.imageData,
                    imageType: questionData.imageType
                });

                if (questionData.imageData && questionData.imageType) {
                    logger.debug(`Rendering ${questionData.imageType} image for question ${index + 1}`);
                    await errorHandler.safeExecute(
                        async () => {
                            const imageUrl = await this.renderImageData(questionData.imageData, questionData.imageType);
                            if (imageUrl) {
                                questionData.image = imageUrl;
                                logger.debug(`Image rendered successfully: ${imageUrl.substring(0, 50)}...`);
                            }
                        },
                        { operation: 'render-question-image', questionIndex: index + 1, imageType: questionData.imageType }
                    );
                    delete questionData.imageData;
                    delete questionData.imageType;
                }

                // Handle AI-generated Manim animation code
                if (questionData.videoData && questionData.videoType === 'manim') {
                    const placement = questionData.videoPlacement || 'question';
                    await errorHandler.safeExecute(
                        async () => {
                            const videoPath = await this.renderManimCode(questionData.videoData);
                            if (videoPath) {
                                if (placement === 'explanation') {
                                    questionData.explanationVideo = videoPath;
                                    questionData.explanationVideoManimCode = questionData.videoData;
                                } else {
                                    questionData.video = videoPath;
                                    questionData.videoManimCode = questionData.videoData;
                                }
                                logger.debug(`Manim animation rendered for ${placement}: ${videoPath}`);
                            }
                        },
                        { operation: 'render-manim-animation', questionIndex: index + 1 }
                    );
                    delete questionData.videoData;
                    delete questionData.videoType;
                    delete questionData.videoPlacement;
                }

                if (this.validateGeneratedQuestion(questionData)) {
                    logger.debug(`ProcessGeneratedQuestions - Question ${index + 1} is valid, adding to quiz`);

                    await new Promise(resolve => {
                        const questionElements = document.querySelectorAll('.question-item');
                        const firstQuestion = questionElements[0];
                        const needsNewElement = !(firstQuestion && quizManager.isEmptyQuestion(firstQuestion));

                        quizManager.addGeneratedQuestion(questionData, showAlerts);

                        const waitTime = needsNewElement ? 400 : TIMING.DOM_READY_CHECK;
                        setTimeout(resolve, waitTime);
                    });

                    validCount++;
                } else {
                    logger.warn(`ProcessGeneratedQuestions - Question ${index + 1} is invalid, skipping:`, questionData);
                    invalidCount++;
                }
            }

            logger.debug('ProcessGeneratedQuestions - Summary:', {
                total: questions.length,
                valid: validCount,
                invalid: invalidCount
            });

        } else {
            logger.warn('ProcessGeneratedQuestions - Window.game.quizManager not available, using fallback');
            const event = new CustomEvent('questionsGenerated', {
                detail: { questions }
            });
            document.dispatchEvent(event);
        }
    }

    async renderImageData(imageData, imageType) {
        logger.debug(`renderImageData called: type=${imageType}`);

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
     * Render Manim code to MP4 via the server endpoint
     * @param {string} manimCode - Manim Python source code
     * @returns {Promise<string|null>} Video path or null on failure
     */
    async renderManimCode(manimCode) {
        try {
            const response = await fetch(APIHelper.getApiUrl('api/manim/render'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: manimCode, quality: 'low' })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                logger.warn(`Manim render failed: ${err.error || response.statusText}`);
                return null;
            }
            const data = await response.json();
            return data.videoPath || null;
        } catch (error) {
            logger.warn('Manim render request failed:', error.message);
            return null;
        }
    }

    async renderMermaidToSVG(mermaidCode) {
        logger.debug('Rendering Mermaid diagram');

        const cleanCode = mermaidCode.replace(/```mermaid/g, '').replace(/```/g, '').trim();

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
            await new Promise(resolve => setTimeout(resolve, TIMING.STREAMING_INDICATOR));
        }

        const id = 'mermaid-' + Date.now();
        const { svg } = await window.mermaid.render(id, cleanCode);
        const dataUrl = this.svgToDataURL(svg);

        logger.debug('Mermaid diagram rendered successfully');
        return dataUrl;
    }

    svgToDataURL(svgCode) {
        if (!svgCode.includes('xmlns=')) {
            svgCode = svgCode.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        const encoded = btoa(encodeURIComponent(svgCode).replace(/%([0-9A-F]{2})/g,
            (_, p1) => String.fromCharCode(parseInt(p1, 16))));
        return 'data:image/svg+xml;base64,' + encoded;
    }

    validateGeneratedQuestion(question) {
        logger.debug('ValidateGeneratedQuestion - Validating:', {
            type: question.type,
            hasQuestion: !!question.question,
            hasOptions: !!question.options,
            optionsLength: question.options?.length,
            correctAnswer: question.correctAnswer,
            correctAnswers: question.correctAnswers
        });

        if (!question.question || !question.type) {
            logger.debug('ValidateGeneratedQuestion - Missing basic fields');
            return false;
        }

        if (question.type === 'multiple-choice') {
            if (question.options && Array.isArray(question.options) && question.options.length < 4) {
                logger.debug('ValidateGeneratedQuestion - Auto-fixing: padding options to 4');
                const originalLength = question.options.length;

                const genericDistractors = [
                    'None of the above',
                    'All of the above',
                    'Not applicable',
                    'Cannot be determined',
                    'Not mentioned in the content',
                    'More information needed'
                ];

                while (question.options.length < 4) {
                    let distractor = genericDistractors.find(d => !question.options.includes(d));
                    if (!distractor) {
                        distractor = `Option ${question.options.length + 1}`;
                    }
                    question.options.push(distractor);
                }

                logger.debug(`Padded options from ${originalLength} to ${question.options.length}`);
            }

            if (!question.options || !Array.isArray(question.options) ||
                question.options.length !== 4 ||
                question.correctAnswer === undefined ||
                question.correctAnswer < 0 ||
                question.correctAnswer >= question.options.length) {
                logger.debug('ValidateGeneratedQuestion - Multiple choice validation failed');
                return false;
            }
        } else if (question.type === 'multiple-correct') {
            if (question.correctAnswer !== undefined && !question.correctAnswers) {
                logger.debug('ValidateGeneratedQuestion - Auto-fixing: converting correctAnswer to correctAnswers array');
                question.correctAnswers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
                delete question.correctAnswer;
            }

            if (!question.options || !Array.isArray(question.options) ||
                !question.correctAnswers || !Array.isArray(question.correctAnswers) ||
                question.correctAnswers.length === 0) {
                logger.debug('ValidateGeneratedQuestion - Multiple correct validation failed');
                return false;
            }

            const invalidIndices = question.correctAnswers.filter(index =>
                index < 0 || index >= question.options.length
            );
            if (invalidIndices.length > 0) {
                logger.debug('ValidateGeneratedQuestion - Multiple correct has invalid indices:', invalidIndices);
                return false;
            }
        } else if (question.type === 'true-false') {
            if (!question.options || !Array.isArray(question.options) ||
                question.options.length !== 2 ||
                (question.correctAnswer !== 'true' && question.correctAnswer !== 'false')) {
                logger.debug('ValidateGeneratedQuestion - True/false validation failed', {
                    optionsLength: question.options?.length,
                    correctAnswer: question.correctAnswer,
                    correctAnswerType: typeof question.correctAnswer
                });
                return false;
            }
        } else if (question.type === 'numeric') {
            if (question.options) {
                logger.debug('ValidateGeneratedQuestion - Auto-fixing: removing options from numeric question');
                delete question.options;
            }

            if (typeof question.correctAnswer === 'string' && !isNaN(question.correctAnswer)) {
                logger.debug('ValidateGeneratedQuestion - Auto-fixing: converting string answer to number');
                question.correctAnswer = parseFloat(question.correctAnswer);
            }

            if (question.tolerance === undefined) {
                logger.debug('ValidateGeneratedQuestion - Auto-fixing: adding default tolerance 0');
                question.tolerance = 0;
            }

            if (question.correctAnswer === undefined || isNaN(question.correctAnswer)) {
                logger.debug('ValidateGeneratedQuestion - Numeric validation failed');
                return false;
            }
        } else if (question.type === 'ordering') {
            if (!question.options || !Array.isArray(question.options) || question.options.length < 2) {
                logger.debug('ValidateGeneratedQuestion - Ordering validation failed: invalid options');
                return false;
            }
            if (!question.correctOrder || !Array.isArray(question.correctOrder)) {
                logger.debug('ValidateGeneratedQuestion - Ordering validation failed: missing correctOrder');
                return false;
            }
            if (question.correctOrder.length !== question.options.length) {
                logger.debug('ValidateGeneratedQuestion - Ordering validation failed: correctOrder length mismatch');
                return false;
            }
            const validIndices = question.correctOrder.every(idx =>
                typeof idx === 'number' && idx >= 0 && idx < question.options.length
            );
            if (!validIndices) {
                logger.debug('ValidateGeneratedQuestion - Ordering validation failed: invalid indices in correctOrder');
                return false;
            }
        } else {
            logger.debug('ValidateGeneratedQuestion - Unknown question type:', question.type);
            return false;
        }

        logger.debug('ValidateGeneratedQuestion - Question is valid');
        return true;
    }

    async openModal() {
        const modal = getModal('ai-generator-modal');
        if (modal) {
            openModal(modal, { lockScroll: false });

            const providerSelect = dom.get('ai-provider');
            if (providerSelect) {
                providerSelect.value = 'ollama';
            }

            const apiKeyInput = dom.get('ai-api-key');
            if (apiKeyInput) {
                apiKeyInput.value = '';
                apiKeyInput.placeholder = 'Enter your API key';
            }

            const modelSelection = dom.get('model-selection');
            if (modelSelection) {
                modelSelection.classList.remove('hidden');
            }

            const claudeModelSelection = dom.get('claude-model-selection');
            if (claudeModelSelection) {
                claudeModelSelection.classList.add('hidden');
            }

            const modelSelect = dom.get('ollama-model');
            if (modelSelect) {
                modelSelect.innerHTML = '<option value="">\u{1F504} Loading models...</option>';
                modelSelect.disabled = true;
            }

            const contentTextarea = dom.get('source-content');
            if (contentTextarea && !contentTextarea.value.trim()) {
                contentTextarea.placeholder = 'Enter your content here (e.g., a passage of text, topics to generate questions about, or paste from a document)...';
            }

            const questionCount = dom.get('question-count');
            if (questionCount) {
                questionCount.value = AI.DEFAULT_QUESTION_COUNT;
            }

            this.uiHelpers.updateOutputLanguageIndicator();

            setTimeout(async () => {
                await this.uiHelpers.loadOllamaModels();
            }, TIMING.DOM_UPDATE_DELAY);
        }
    }

    closeModalMethod() {
        const modal = getModal('ai-generator-modal');
        if (modal) {
            closeModal(modal, { unlockScroll: false });
        }
    }

    showApiKeyErrorPopup(provider, errorType = 'missing', specificMessage = '') {
        logger.debug('showApiKeyErrorPopup called', { provider, errorType, specificMessage });

        const providerName = this.providers[provider]?.name || provider;
        let title, message, icon;

        if (specificMessage) {
            title = `${providerName} Error`;
            message = specificMessage;
            icon = '\u274C';
        } else if (errorType === 'missing') {
            title = 'API Key Required';
            message = `Please enter your API key for ${providerName}`;
            icon = '\uD83D\uDD11';
        } else {
            title = `${providerName} Error`;
            message = `There was an issue with ${providerName}. Please check your API key.`;
            icon = '\u274C';
        }

        this.showSimpleErrorPopup(title, message, icon);
    }

    showSimpleErrorPopup(title, message, icon) {
        logger.debug('showSimpleErrorPopup called', { title, message, icon });

        const existingModal = dom.get('simple-error-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const safeIcon = escapeHtml(icon || '\u274C');
        const safeTitle = escapeHtml(title || 'Error');
        const safeMessage = escapeHtml(message || '').replace(/\n/g, '<br>');

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
                    <div style="font-size: 3rem; margin-bottom: 15px;">${safeIcon}</div>
                    <h3 style="margin: 0 0 15px 0 !important; color: #dc2626 !important; font-size: 1.3rem;">${safeTitle}</h3>
                    <p style="margin: 0 0 25px 0 !important; color: #dc2626 !important; font-size: 16px !important; font-weight: 500 !important;">${safeMessage}</p>
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

        const modal = dom.get('simple-error-modal');
        const okBtn = dom.get('simple-error-ok');

        if (!modal) {
            logger.error('Failed to create error modal');
            alert(title + '\n\n' + message);
            return;
        }

        const closeModalFn = () => {
            modal.remove();
            document.body.style.overflow = '';
        };

        if (okBtn) {
            okBtn.addEventListener('click', closeModalFn);
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModalFn();
        });

        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeModalFn();
                document.removeEventListener('keydown', escapeHandler);
            }
        });

        document.body.style.overflow = 'hidden';
        logger.debug('Simple error popup displayed');
    }
}
