/**
 * Quiz Manager Module
 * Handles quiz operations: save, load, import, export, and quiz management
 */

import { translationManager, showErrorAlert, showSuccessAlert } from '../utils/translation-manager.js';
import { createQuestionElement } from '../utils/question-utils.js';
import { MathRenderer } from '../utils/math-renderer.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';
import { logger, TIMING } from '../core/config.js';
import { APIHelper } from '../utils/api-helper.js';
import { imagePathResolver, loadImageWithRetry as sharedLoadImageWithRetry } from '../utils/image-path-resolver.js';
import { QuestionTypeRegistry } from '../utils/question-type-registry.js';
import { getJSON, setJSON, removeItem } from '../utils/storage-utils.js';
import { EventListenerManager } from '../utils/event-listener-manager.js';
import { escapeHtml } from '../utils/dom.js';
import { getFileManager } from '../ui/file-manager.js';
import { openModal, closeModal } from '../utils/modal-utils.js';

// Shared translation fallback map used for cleaning translation keys from loaded data
const TRANSLATION_FALLBACKS = {
    'multiple_choice': 'Multiple Choice',
    'multiple_correct': 'Multiple Correct Answers',
    'true_false': 'True/False',
    'numeric': 'Numeric Answer',
    'easy': 'Easy',
    'medium': 'Medium',
    'hard': 'Hard',
    'time_seconds': 'Time (sec)',
    'add_image': 'Add Image',
    'remove_image': 'Remove Image',
    'remove': 'Remove',
    'a_is_correct': 'A is correct',
    'b_is_correct': 'B is correct',
    'c_is_correct': 'C is correct',
    'd_is_correct': 'D is correct',
    'true': 'True',
    'false': 'False',
    'question': 'Question',
    'enter_question_preview': 'Enter your question above to see preview',
    'enter_question_with_latex': 'Enter your question (supports LaTeX)',
    'toggle_live_preview': 'Live Preview',
    'close_live_preview': 'Close Live Preview'
};

export class QuizManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.mathRenderer = new MathRenderer();
        this.autoSaveTimeout = null;
        this.errorHandler = errorHandler; // Add ErrorHandler for future use

        // Dependency injection properties
        this._loadQuizHandler = null;
        this._startPracticeModeHandler = null;
        this._previewManager = null;
        this._addQuestionFn = null;

        // Memory management via EventListenerManager
        this.listenerManager = new EventListenerManager('QuizManager');

        // Initialize file manager for folder tree view
        this.fileManager = getFileManager({
            onLoadQuiz: (filename, data) => this.handleFileManagerLoad(filename, data),
            onPracticeQuiz: (filename, data) => this.handleFileManagerPractice(filename, data)
        });

        // Bind cleanup method
        this.cleanup = this.cleanup.bind(this);
    }

    /**
     * Dependency injection: Set load quiz handler
     * @param {Function} handler - Function to load a quiz by filename
     */
    setLoadQuizHandler(handler) {
        this._loadQuizHandler = handler;
    }

    /**
     * Dependency injection: Set start practice mode handler
     * @param {Function} handler - Function to start practice mode by filename
     */
    setStartPracticeModeHandler(handler) {
        this._startPracticeModeHandler = handler;
    }

    /**
     * Dependency injection: Set preview manager reference
     * @param {Object} previewManager - PreviewManager instance
     */
    setPreviewManager(previewManager) {
        this._previewManager = previewManager;
    }

    /**
     * Dependency injection: Set addQuestion function
     * @param {Function} addQuestionFn - Function to add a new question
     */
    setAddQuestionFunction(addQuestionFn) {
        this._addQuestionFn = addQuestionFn;
    }

    /**
     * Get load quiz handler with fallback to window.game
     * @returns {Function|null}
     */
    _getLoadQuizHandler() {
        return this._loadQuizHandler || window.game?.loadQuiz || null;
    }

    /**
     * Get start practice mode handler with fallback to window.game
     * @returns {Function|null}
     */
    _getStartPracticeModeHandler() {
        return this._startPracticeModeHandler || window.game?.startPracticeMode || null;
    }

    /**
     * Get preview manager with fallback to window.game
     * @returns {Object|null}
     */
    _getPreviewManager() {
        return this._previewManager || window.game?.previewManager || null;
    }

    /**
     * Get addQuestion function with fallback to window.game
     * @returns {Function|null}
     */
    _getAddQuestionFn() {
        return this._addQuestionFn || window.game?.addQuestion || null;
    }

    /**
     * Handle quiz load from file manager
     */
    handleFileManagerLoad(filename, data) {
        this.hideLoadQuizModal();
        const loadQuiz = this._getLoadQuizHandler();
        if (loadQuiz) {
            loadQuiz(filename);
        } else {
            logger.error('No loadQuiz handler available');
        }
    }

    /**
     * Handle practice mode from file manager
     */
    handleFileManagerPractice(filename, data) {
        this.hideLoadQuizModal();
        const startPracticeMode = this._getStartPracticeModeHandler();
        if (startPracticeMode) {
            startPracticeMode(filename);
        } else {
            logger.error('No startPracticeMode handler available');
        }
    }

    /**
     * Collect all questions from the quiz builder
     */
    collectQuestions() {
        return Array.from(document.querySelectorAll('.question-item'))
            .map(el => this.extractQuestionData(el))
            .filter(Boolean);
    }

    /**
     * Check if a URL is empty or a base URL (not a meaningful image path)
     */
    isEmptyOrBaseUrl(url) {
        if (!url || url === '') return true;
        const origin = window.location.origin;
        if (url === origin || url === origin + '/') return true;
        return url.endsWith('/') && !url.includes('/uploads/');
    }

    /**
     * Extract image URL from element, preferring dataset.url over src
     */
    extractImageUrl(imageElement) {
        // Prefer dataset.url (where uploaded images are stored)
        if (imageElement.dataset.url) {
            return imageElement.dataset.url;
        }

        // Fall back to src if it's a meaningful URL
        const srcUrl = imageElement.src;
        return this.isEmptyOrBaseUrl(srcUrl) ? null : srcUrl;
    }

    /**
     * Extract concept tags from question element
     * @param {HTMLElement} questionElement - The question DOM element
     * @returns {string[]} Array of concept strings
     */
    extractConceptTags(questionElement) {
        const tagsList = questionElement.querySelector('.concept-tags-list');
        if (!tagsList) return [];

        const tags = tagsList.querySelectorAll('.concept-tag');
        return Array.from(tags)
            .map(tag => tag.dataset.concept || tag.textContent.replace('×', '').trim())
            .filter(Boolean);
    }

    /**
     * Extract and process image data from question element
     */
    extractQuestionImageData(questionElement, questionData) {
        const imageElement = questionElement.querySelector('.question-image');
        if (!imageElement) return;

        const imageUrl = this.extractImageUrl(imageElement);
        if (imageUrl?.trim()) {
            logger.debug('Found image for question:', imageUrl);
            // Handle data URIs or use path resolver for regular URLs
            questionData.image = imageUrl.startsWith('data:')
                ? imageUrl
                : imagePathResolver.toStoragePath(imageUrl);
        }

        // Extract WebP version if available (for optimized loading)
        const webpUrl = imageElement.dataset.webpUrl;
        if (webpUrl?.trim()) {
            questionData.imageWebp = imagePathResolver.toStoragePath(webpUrl);
            logger.debug('Found WebP image for question:', questionData.imageWebp);
        }

        if (questionData.image) {
            logger.debug('Processed image path for quiz save:', questionData.image, 'WebP:', questionData.imageWebp);
        }
    }

    /**
     * Extract question data from DOM element
     * Uses QuestionTypeRegistry for centralized extraction logic
     */
    extractQuestionData(questionElement) {
        const questionText = questionElement.querySelector('.question-text')?.value?.trim();
        const questionType = questionElement.querySelector('.question-type')?.value;
        if (!questionText || !questionType) return null;

        // Check if global time is enabled
        const useGlobalTime = document.getElementById('use-global-time')?.checked;
        const globalTimeLimit = parseInt(document.getElementById('global-time-limit')?.value);

        // Use global time if enabled, otherwise use per-question time
        let timeLimit;
        if (useGlobalTime && !isNaN(globalTimeLimit)) {
            timeLimit = globalTimeLimit;
        } else {
            timeLimit = parseInt(questionElement.querySelector('.question-time-limit')?.value) || 30;
        }

        const questionData = {
            question: questionText,
            type: questionType,
            timeLimit: timeLimit,
            difficulty: questionElement.querySelector('.question-difficulty')?.value || 'medium'
        };

        // Extract optional explanation field
        const explanation = questionElement.querySelector('.question-explanation')?.value?.trim();
        if (explanation) {
            questionData.explanation = explanation;
        }

        // Extract concept tags
        const concepts = this.extractConceptTags(questionElement);
        if (concepts.length > 0) {
            questionData.concepts = concepts;
        }

        // Use QuestionTypeRegistry for type-specific data extraction
        Object.assign(questionData, QuestionTypeRegistry.extractData(questionType, questionElement));

        // Extract image data
        this.extractQuestionImageData(questionElement, questionData);

        return questionData;
    }

    /**
     * Validate type-specific question requirements
     * @returns {string|null} Error translation key if invalid, null if valid
     */
    validateQuestionType(question) {
        const hasMinOptions = question.options?.length >= 2;

        switch (question.type) {
            case 'multiple-choice': {
                if (!hasMinOptions) return 'question_needs_two_options';
                const correctIndex = question.correctIndex ?? question.correctAnswer;
                if (correctIndex === undefined || correctIndex < 0 || correctIndex >= question.options.length) {
                    return 'invalid_correct_answer';
                }
                break;
            }
            case 'multiple-correct': {
                if (!hasMinOptions) return 'question_needs_two_options';
                const correctIndices = question.correctIndices || question.correctAnswers;
                if (!correctIndices?.length) return 'select_at_least_one_correct';
                break;
            }
            case 'numeric':
                if (isNaN(question.correctAnswer)) return 'invalid_numeric_answer';
                break;
            case 'ordering':
                if (!hasMinOptions) return 'ordering_needs_two_items';
                if (!question.correctOrder || question.correctOrder.length !== question.options?.length) {
                    return 'invalid_ordering';
                }
                break;
        }
        return null;
    }

    /**
     * Validate questions array
     */
    validateQuestions(questions) {
        const errors = [];

        questions.forEach((question, index) => {
            const questionNum = index + 1;

            // Check for question text
            if (!question.question?.trim()) {
                errors.push(`Question ${questionNum}: ${translationManager.getTranslationSync('question_missing_text')}`);
            }

            // Type-specific validation
            const typeError = this.validateQuestionType(question);
            if (typeError) {
                errors.push(`Question ${questionNum}: ${translationManager.getTranslationSync(typeError)}`);
            }
        });

        return errors;
    }

    /**
     * Save quiz - shows modal for optional password
     */
    async saveQuiz() {
        const title = document.getElementById('quiz-title')?.value?.trim();
        if (!title) {
            showErrorAlert('please_enter_quiz_title');
            return;
        }

        const questions = this.collectQuestions();
        if (questions.length === 0) {
            showErrorAlert('please_add_one_question');
            return;
        }

        // Validate questions
        const validationErrors = this.validateQuestions(questions);
        if (validationErrors.length > 0) {
            translationManager.showAlert('error', validationErrors.join('\\n'));
            return;
        }

        // Store for use in confirmSave
        this.pendingSave = { title, questions };

        // Show save modal for optional password
        this.showSaveQuizModal();
    }

    /**
     * Show save quiz modal
     */
    showSaveQuizModal() {
        const modal = document.getElementById('save-quiz-modal');
        if (!modal) {
            // Fallback: save without password if modal doesn't exist
            this.confirmSave('');
            return;
        }

        // Reset password fields
        const passwordInput = document.getElementById('save-quiz-password');
        const confirmInput = document.getElementById('save-quiz-password-confirm');
        const confirmGroup = document.getElementById('save-quiz-confirm-group');

        if (passwordInput) passwordInput.value = '';
        if (confirmInput) confirmInput.value = '';
        if (confirmGroup) confirmGroup.style.display = 'none';

        // Show confirm field when password is entered
        if (passwordInput) {
            passwordInput.oninput = () => {
                if (confirmGroup) {
                    confirmGroup.style.display = passwordInput.value ? 'block' : 'none';
                }
            };
        }

        // Setup button handlers
        const cancelBtn = document.getElementById('cancel-save');
        const confirmBtn = document.getElementById('confirm-save');

        if (cancelBtn) {
            cancelBtn.onclick = () => this.hideSaveQuizModal(true); // Clear pending on cancel
        }

        if (confirmBtn) {
            confirmBtn.onclick = () => this.handleSaveConfirm();
        }

        // Show modal
        openModal(modal);
        modal.classList.remove('hidden');
        modal.classList.add('visible-flex');
    }

    /**
     * Hide save quiz modal
     * @param {boolean} clearPending - Whether to clear pending save data (default: false)
     */
    hideSaveQuizModal(clearPending = false) {
        const modal = document.getElementById('save-quiz-modal');
        if (modal) {
            closeModal(modal);
            modal.classList.remove('visible-flex');
            modal.classList.add('hidden');
        }
        // Only clear pendingSave if explicitly requested (e.g., on cancel)
        if (clearPending) {
            this.pendingSave = null;
        }
    }

    /**
     * Handle save confirmation from modal
     */
    handleSaveConfirm() {
        const passwordInput = document.getElementById('save-quiz-password');
        const confirmInput = document.getElementById('save-quiz-password-confirm');

        const password = passwordInput?.value || '';
        const confirmPassword = confirmInput?.value || '';

        // Validate password if provided
        if (password) {
            if (password.length < 4) {
                translationManager.showAlert('error', translationManager.getTranslationSync('password_too_short'));
                return;
            }
            if (password !== confirmPassword) {
                translationManager.showAlert('error', translationManager.getTranslationSync('passwords_dont_match'));
                return;
            }
        }

        this.hideSaveQuizModal();
        this.confirmSave(password);
    }

    /**
     * Actually save the quiz to server
     */
    async confirmSave(password) {
        if (!this.pendingSave) return;

        const { title, questions } = this.pendingSave;

        try {
            return await errorHandler.safeNetworkOperation(async () => {
                logger.info('Saving quiz:', title, 'with', questions.length, 'questions');

                const response = await APIHelper.fetchAPI('api/save-quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, questions, password: password || null })
                });

                const data = await response.json();
                logger.info('Save response:', response.status, data);

                if (response.ok) {
                    showSuccessAlert('quiz_saved_successfully');
                    if (data.filename) {
                        await this.fileManager.registerNewQuiz(data.filename, title);
                    }
                    this.autoSaveQuiz();
                } else {
                    const errorMsg = data.error || data.message || translationManager.getTranslationSync('failed_save_quiz');
                    logger.error('Save quiz failed:', errorMsg);
                    translationManager.showAlert('error', errorMsg);
                }
            }, 'quiz_save', () => {
                translationManager.showAlert('error', 'Failed to save quiz due to network error. Please try again.');
            });
        } finally {
            this.pendingSave = null;
        }
    }

    /**
     * Show load quiz modal
     */
    async showLoadQuizModal() {
        const modal = document.getElementById('load-quiz-modal');
        if (!modal) {
            logger.error('Load quiz modal not found');
            return;
        }

        // Set up modal event handlers
        this.setupLoadQuizModalHandlers(modal);

        // Check if tree view container exists (new folder tree UI)
        const treeContainer = document.getElementById('quiz-tree-container');
        if (treeContainer) {
            // Use new folder tree view
            await this.showFolderTreeView(treeContainer, modal);
        } else {
            // Fall back to flat list view for backward compatibility
            await this.showFlatListView(modal);
        }

        // Show modal with requestAnimationFrame for smooth transition
        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
            modal.classList.add('visible-flex');
        });
    }

    /**
     * Show folder tree view in load quiz modal
     */
    async showFolderTreeView(container, modal) {
        // Initialize tree in container if not done yet
        if (!this.fileManager.getTree()) {
            this.fileManager.initTree(container);
        }

        // Load tree data
        await this.errorHandler.wrapAsyncOperation(async () => {
            await this.fileManager.loadTree();
        }, {
            errorType: this.errorHandler.errorTypes.NETWORK,
            context: { operation: 'loadQuizTree' },
            fallback: () => {
                container.innerHTML = `
                    <div class="no-quizzes">
                        <p>${translationManager.getTranslationSync('failed_load_quizzes')}</p>
                    </div>
                `;
            }
        });
    }

    /**
     * Show flat list view in load quiz modal (backward compatibility)
     */
    async showFlatListView(modal) {
        // Cache quiz list element for better performance (validate it's still in DOM)
        if (!this.cachedQuizListElement || !document.contains(this.cachedQuizListElement)) {
            this.cachedQuizListElement = dom.get('quiz-list');
        }
        const quizList = this.cachedQuizListElement;

        // Load quizzes list with performance optimization
        await this.errorHandler.wrapAsyncOperation(async () => {
            const response = await fetch(APIHelper.getApiUrl('api/quizzes'));
            const data = await response.json();

            if (quizList) {
                // Use DocumentFragment for better performance with multiple DOM operations
                const fragment = document.createDocumentFragment();

                // Check if data is directly an array or has a quizzes property
                const quizzes = Array.isArray(data) ? data : data.quizzes;

                if (quizzes && quizzes.length > 0) {
                    quizzes.forEach(quiz => {
                        const quizItem = document.createElement('div');
                        quizItem.className = 'quiz-item';
                        quizItem.innerHTML = `
                            <div class="quiz-info">
                                <h3>${escapeHtml(quiz.title)}</h3>
                                <p>${quiz.questionCount} ${translationManager.getTranslationSync('questions')} • ${translationManager.getTranslationSync('created')}: ${new Date(quiz.created).toLocaleDateString()}</p>
                            </div>
                            <div class="quiz-actions">
                                <button class="quiz-action-btn load-btn" data-filename="${escapeHtml(quiz.filename)}" title="${translationManager.getTranslationSync('load')}">
                                    <span class="btn-icon">📂</span>
                                    <span class="btn-text">${translationManager.getTranslationSync('load')}</span>
                                </button>
                                <button class="quiz-action-btn practice-btn" data-filename="${escapeHtml(quiz.filename)}" title="${translationManager.getTranslationSync('practice')}">
                                    <span class="btn-icon">🎯</span>
                                    <span class="btn-text">${translationManager.getTranslationSync('practice')}</span>
                                </button>
                            </div>
                        `;

                        // Wire up button handlers
                        const loadBtn = quizItem.querySelector('.load-btn');
                        const practiceBtn = quizItem.querySelector('.practice-btn');

                        loadBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const loadQuiz = this._getLoadQuizHandler();
                            if (loadQuiz) {
                                loadQuiz(quiz.filename);
                            }
                        });

                        practiceBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const startPracticeMode = this._getStartPracticeModeHandler();
                            if (startPracticeMode) {
                                startPracticeMode(quiz.filename);
                            }
                        });

                        fragment.appendChild(quizItem);
                    });
                } else {
                    const noQuizzesDiv = document.createElement('div');
                    noQuizzesDiv.className = 'no-quizzes';
                    noQuizzesDiv.innerHTML = `<p>${translationManager.getTranslationSync('no_saved_quizzes')}</p>`;
                    fragment.appendChild(noQuizzesDiv);
                }

                // Batch DOM update for better performance
                quizList.innerHTML = '';
                quizList.appendChild(fragment);
            }
        }, {
            errorType: this.errorHandler.errorTypes.NETWORK,
            context: { operation: 'loadQuizzes' },
            fallback: () => {
                if (quizList) {
                    quizList.innerHTML = `
                        <div class="no-quizzes">
                            <p>${translationManager.getTranslationSync('failed_load_quizzes')}</p>
                        </div>
                    `;
                }
            }
        });
    }

    /**
     * Create a new folder (triggered from modal button)
     */
    createNewFolder() {
        this.fileManager.handleAction('new-folder', 'root', null, null);
    }

    /**
     * Hide a modal element using CSS classes
     */
    hideModalElement(modal) {
        if (!modal) return;
        modal.classList.remove('visible-flex');
        modal.classList.add('hidden');
    }

    /**
     * Hide load quiz modal
     */
    hideLoadQuizModal() {
        const modal = document.getElementById('load-quiz-modal');
        if (!modal) {
            logger.warn('Load quiz modal not found when trying to hide');
            return;
        }

        logger.debug('Hiding load quiz modal');
        this.hideModalElement(modal);
        this.cleanupLoadQuizModalHandlers(modal);

        // Force DOM update
        modal.offsetHeight; // Force reflow
        requestAnimationFrame(() => {
            if (modal.style.display !== 'none') {
                modal.style.display = 'none';
            }
        });

        logger.debug('Load quiz modal hidden');
    }

    /**
     * Force close modal as last resort
     */
    forceCloseModal() {
        this.errorHandler.safeExecute(() => {
            logger.warn('Force closing modal as backup mechanism');

            // Find and hide all possible modals
            const selectors = ['#load-quiz-modal', '.modal', '[id*="modal"]'];
            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(modal => {
                    this.hideModalElement(modal);
                    if (modal?.style) modal.style.opacity = '0';
                });
            });

            // Remove any backdrop/overlay
            document.querySelectorAll('.modal-backdrop, .overlay').forEach(el => el.remove());

            logger.debug('Force modal close completed');
        }, { operation: 'forceCloseModal' });
    }

    /**
     * Safely update preview after quiz loading (completely isolated)
     */
    updatePreviewSafely() {
        // Use setTimeout to completely separate this from the loading flow
        setTimeout(() => {
            this.errorHandler.safeExecute(() => {
                logger.debug('Attempting safe preview update');

                // Check for always-preview mode (desktop editor with split view)
                const hostContainer = document.getElementById('host-container');
                const isAlwaysPreview = hostContainer?.classList.contains('always-preview');

                if (isAlwaysPreview) {
                    logger.debug('Always-preview mode active, updating split preview and pagination');

                    // Initialize pagination to show first question
                    if (window.showQuestion) {
                        window.showQuestion(0);
                    }

                    // Update split preview
                    const previewManager = this._getPreviewManager();
                    if (previewManager) {
                        previewManager.currentPreviewQuestion = 0;
                        if (typeof previewManager.updateSplitPreview === 'function') {
                            previewManager.updateSplitPreview();
                            logger.debug('Split preview updated successfully');
                        }
                    }
                    return;
                }

                // Legacy: Check for modal preview mode
                if (window.previewManager &&
                    typeof window.previewManager.isPreviewMode === 'function' &&
                    window.previewManager.isPreviewMode()) {

                    logger.debug('Preview mode is active, updating preview');

                    if (typeof window.previewManager.updatePreview === 'function') {
                        window.previewManager.updatePreview();
                        logger.debug('Preview updated successfully');
                    } else {
                        logger.warn('updatePreview method not available');
                    }
                } else {
                    logger.debug('Preview mode not active, skipping update');
                }
            }, {
                operation: 'updatePreviewSafely',
                silent: true // Don't show errors - quiz already loaded successfully
            });
        }, TIMING.SHORT_DELAY); // Give modal time to close before updating preview
    }

    /**
     * Set up event handlers for load quiz modal
     */
    setupLoadQuizModalHandlers(modal) {
        // Clean up any existing handlers first to prevent accumulation
        if (this.loadQuizModalHandlers) {
            this.cleanupLoadQuizModalHandlers(modal);
        }

        // Store handler references for cleanup
        this.loadQuizModalHandlers = {};

        // Click outside to close
        this.loadQuizModalHandlers.modalClick = (e) => {
            if (e.target === modal) {
                this.hideLoadQuizModal();
            }
        };

        // Escape key to close
        this.loadQuizModalHandlers.keydown = (e) => {
            if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
                this.hideLoadQuizModal();
            }
        };

        // Add event listeners
        modal.addEventListener('click', this.loadQuizModalHandlers.modalClick);
        document.addEventListener('keydown', this.loadQuizModalHandlers.keydown);
    }

    /**
     * Clean up event handlers for load quiz modal
     */
    cleanupLoadQuizModalHandlers(modal) {
        if (this.loadQuizModalHandlers) {
            // Remove event listeners
            if (this.loadQuizModalHandlers.modalClick) {
                modal.removeEventListener('click', this.loadQuizModalHandlers.modalClick);
            }
            if (this.loadQuizModalHandlers.keydown) {
                document.removeEventListener('keydown', this.loadQuizModalHandlers.keydown);
            }

            // Clear handler references
            this.loadQuizModalHandlers = null;
        }
    }

    /**
     * Load quiz from server
     */
    async loadQuiz(filename) {
        let modalClosed = false;
        let successShown = false;

        await this.errorHandler.wrapAsyncOperation(async () => {
            logger.debug('Starting bulletproof quiz loading for:', filename);

            // Basic fetch and structure check only
            const response = await fetch(APIHelper.getApiUrl(`api/quiz/${filename}`));
            const data = await response.json();

            if (response.ok && data && data.questions && Array.isArray(data.questions)) {
                logger.debug('Valid quiz structure found with', data.questions.length, 'questions');

                // Clean data with safe execution
                const cleanedData = this.errorHandler.safeExecute(
                    () => this.cleanQuizData(data) || data,
                    { operation: 'cleanQuizData' },
                    () => data
                );

                // Load quiz with safe execution
                try {
                    await this.populateQuizBuilder(cleanedData);
                    logger.debug('Quiz populated successfully');

                    // Dispatch quizLoaded event for editor question count update
                    const event = new CustomEvent('quizLoaded', {
                        detail: { questionCount: cleanedData.questions.length, title: cleanedData.title }
                    });
                    document.dispatchEvent(event);
                } catch (populateError) {
                    logger.warn('Error in populateQuizBuilder, but continuing:', populateError);
                    // Continue anyway - don't let this break the flow
                }

                // ALWAYS close modal and show success, regardless of any errors above
                modalClosed = this.errorHandler.safeExecute(
                    () => {
                        this.hideLoadQuizModal();
                        logger.debug('Modal closed successfully');
                        return true;
                    },
                    { operation: 'hideLoadQuizModal' },
                    () => {
                        this.forceCloseModal();
                        return true;
                    }
                );

                successShown = this.errorHandler.safeExecute(
                    () => {
                        showSuccessAlert('quiz_loaded_successfully');
                        logger.debug('Success alert shown');
                        return true;
                    },
                    { operation: 'showSuccessAlert' },
                    () => false
                );

                // Update preview AFTER everything else (completely separate)
                this.updatePreviewSafely();

            } else {
                // Only show error for truly invalid data structure
                logger.error('Invalid quiz data structure for:', filename);
                translationManager.showAlert('error', 'Invalid quiz file format. Please check the file.');
            }
        }, {
            errorType: this.errorHandler.errorTypes.NETWORK,
            context: { operation: 'loadQuiz', filename },
            fallback: () => {
                // Emergency cleanup - ensure modal closes and user gets feedback
                if (!modalClosed) {
                    this.errorHandler.safeExecute(
                        () => this.hideLoadQuizModal(),
                        { operation: 'emergencyModalClose' },
                        () => this.forceCloseModal()
                    );
                }

                if (!successShown) {
                    this.errorHandler.safeExecute(
                        () => showErrorAlert('failed_load_quiz'),
                        { operation: 'showErrorAlert' },
                        () => translationManager.showAlert('error', 'Failed to load quiz. Please try again.')
                    );
                }
            }
        });
    }

    /**
     * Clean corrupted text from quiz data
     */
    cleanQuizData(data) {
        if (!data || !data.questions) return data;

        const cleanedData = JSON.parse(JSON.stringify(data)); // Deep copy

        cleanedData.questions = cleanedData.questions.map(question => {
            const cleanedQuestion = { ...question };

            // Clean question text
            if (cleanedQuestion.question && typeof cleanedQuestion.question === 'string') {
                cleanedQuestion.question = cleanedQuestion.question.replace(/ and this is of the client.*$/g, '');
                cleanedQuestion.question = cleanedQuestion.question.replace(/ if this means that we sorted the first task.*$/g, '');
            }

            // Clean options
            if (cleanedQuestion.options && Array.isArray(cleanedQuestion.options)) {
                cleanedQuestion.options = cleanedQuestion.options.map(option => {
                    if (typeof option === 'string') {
                        return option.replace(/ and this is of the client.*$/g, '')
                            .replace(/ if this means that we sorted the first task.*$/g, '');
                    }
                    return option;
                });
            }

            return cleanedQuestion;
        });

        return cleanedData;
    }

    /**
     * Render MathJax for loaded quiz with proper timing coordination
     * CRITICAL F5 FIX: Use proper MathJax readiness coordination instead of timeouts
     */
    renderMathForLoadedQuiz() {
        // CRITICAL: Only render MathJax for editor elements to prevent game element contamination
        this.mathRenderer.renderMathJaxForEditor();

        // F5 RELOAD FIX: Wait for MathJax readiness before updating preview
        this.mathRenderer.waitForMathJaxReady(() => {
            const previewManager = this._getPreviewManager();
            if (previewManager && previewManager.previewRenderer) {
                logger.debug('🔄 Updating live preview after MathJax is ready');
                previewManager.previewRenderer.renderMathJaxForPreview();
            }
        });
    }

    /**
     * Populate quiz builder with loaded data
     */
    async populateQuizBuilder(quizData) {
        logger.debug('Starting bulletproof populateQuizBuilder');

        try {
            // ========== CRITICAL OPERATIONS (must succeed) ==========

            // Set quiz title (essential)
            const titleInput = document.getElementById('quiz-title');
            if (!titleInput) {
                throw new Error('Quiz title input not found');
            }
            titleInput.value = quizData.title || '';

            // Clear existing questions (essential)
            const questionsContainer = document.getElementById('questions-container');
            if (!questionsContainer) {
                throw new Error('Questions container not found');
            }
            questionsContainer.innerHTML = '';

            // Add loaded questions (essential)
            if (quizData.questions && Array.isArray(quizData.questions)) {
                quizData.questions.forEach((questionData, index) => {
                    this.errorHandler.safeExecute(
                        () => this.addQuestionFromData(questionData),
                        { operation: 'addQuestionFromData', questionIndex: index }
                    );
                });
            }
            logger.debug('Questions added successfully');

            // ========== NICE-TO-HAVE OPERATIONS (don't let these break the flow) ==========

            // Translation loading
            await this.errorHandler.safeExecute(
                async () => {
                    const currentLang = translationManager.getCurrentLanguage();
                    await translationManager.ensureLanguageLoaded(currentLang);
                    logger.debug('Translations loaded successfully');
                },
                { operation: 'ensureLanguageLoaded' }
            );

            // Container translation
            this.errorHandler.safeExecute(
                () => {
                    const container = document.getElementById('questions-container');
                    if (container) {
                        translationManager.translateContainer(container);
                    }
                },
                { operation: 'translateContainer' }
            );

            // Page translation
            this.errorHandler.safeExecute(
                () => translationManager.translatePage(),
                { operation: 'translatePage' }
            );

            // UI updates
            this.errorHandler.safeExecute(
                () => this.updateQuestionsUI(),
                { operation: 'updateQuestionsUI' }
            );

            // MathJax rendering
            this.errorHandler.safeExecute(
                () => this.renderMathForLoadedQuiz(),
                { operation: 'renderMathForLoadedQuiz' }
            );

            logger.debug('populateQuizBuilder completed successfully');

        } catch (error) {
            logger.error('Critical error in populateQuizBuilder:', error);
            // Only throw if a truly critical operation failed
            throw error;
        }

        // NOTE: Preview update is now handled separately in updatePreviewSafely()
        // This ensures it can't break the quiz loading flow
    }

    /**
     * Create or get remove button for a question item
     */
    ensureRemoveButton(questionItem) {
        let removeButton = questionItem.querySelector('.remove-question');
        if (removeButton) return removeButton;

        removeButton = document.createElement('button');
        removeButton.className = 'btn secondary remove-question';
        removeButton.onclick = () => {
            questionItem.remove();
            this.updateQuestionsUI();
        };
        removeButton.setAttribute('data-translate', 'remove');
        removeButton.textContent = translationManager.getTranslationSync('remove') || 'Remove';
        questionItem.appendChild(removeButton);
        return removeButton;
    }

    /**
     * Combined update method for questions UI - prevents visual glitches
     * Updates both remove button visibility and question numbering in single operation
     */
    updateQuestionsUI() {
        const questionsContainer = document.getElementById('questions-container');
        if (!questionsContainer) return;

        const questionItems = questionsContainer.querySelectorAll('.question-item');
        const hasMultipleQuestions = questionItems.length > 1;

        logger.debug(`updateQuestionsUI: Found ${questionItems.length} questions, hasMultipleQuestions: ${hasMultipleQuestions}`);

        questionItems.forEach((questionItem, index) => {
            // Update data-question attribute only if needed
            if (questionItem.getAttribute('data-question') !== index.toString()) {
                questionItem.setAttribute('data-question', index);

                // Update the question heading with proper translation
                const questionHeading = questionItem.querySelector('h3');
                if (questionHeading) {
                    questionHeading.innerHTML = `<span data-translate="question">Question</span> ${index + 1}`;
                    translationManager.translateContainer(questionHeading);
                }
            }

            // Handle remove button visibility
            const removeButton = this.ensureRemoveButton(questionItem);
            removeButton.style.display = hasMultipleQuestions ? 'block' : 'none';
        });

        logger.debug(`Updated questions UI for ${questionItems.length} questions`);
    }

    /**
     * Update remove button visibility for all questions
     * @deprecated Use updateQuestionsUI() instead - kept for backward compatibility
     */
    updateRemoveButtonVisibility() {
        this.updateQuestionsUI();
    }

    /**
     * Add question from data object
     */
    addQuestionFromData(questionData) {
        const questionsContainer = document.getElementById('questions-container');
        if (!questionsContainer) return;

        const questionElement = createQuestionElement(questionData);
        questionsContainer.appendChild(questionElement);

        // Clean translation keys from text content WITHOUT using innerHTML
        // This preserves the DOM structure and form field values
        this.cleanTranslationKeysInElement(questionElement);

        logger.debug('Cleaned translation keys from question element');

        // Populate the question data
        this.populateQuestionElement(questionElement, questionData);

        // Translate the individual question element after populating data
        translationManager.translateContainer(questionElement);
        // logger.debug('Translated individual question element');

        // Debug: Check if translation keys are showing as actual text
        const problemElements = questionElement.querySelectorAll('*');
        problemElements.forEach(el => {
            const text = el.textContent || '';
            if (text.includes('add_image') || text.includes('time_seconds') || text.includes('multiple_choice')) {
                logger.warn('Found translation key as text:', text, 'in element:', el.tagName, el.className);
            }
        });
    }

    /**
     * Replace translation keys in text with fallback values
     * @returns {string|null} Replaced text if changes made, null otherwise
     */
    replaceTranslationKeys(text) {
        if (!text) return null;

        let result = text;
        let changed = false;

        for (const [key, value] of Object.entries(TRANSLATION_FALLBACKS)) {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            if (regex.test(result)) {
                result = result.replace(regex, value);
                changed = true;
            }
        }

        return changed ? result : null;
    }

    /**
     * Clean translation keys from an element without destroying DOM structure
     */
    cleanTranslationKeysInElement(element) {
        // Clean text content in text nodes (preserving DOM structure)
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach(textNode => {
            const replaced = this.replaceTranslationKeys(textNode.textContent);
            if (replaced) {
                textNode.textContent = replaced;
            }
        });

        // Clean placeholder attributes
        element.querySelectorAll('[placeholder]').forEach(el => {
            const replaced = this.replaceTranslationKeys(el.getAttribute('placeholder'));
            if (replaced) {
                el.setAttribute('placeholder', replaced);
            }
        });
    }

    /**
     * Clean translation keys from loaded data (legacy method for backward compatibility)
     */
    cleanTranslationKeys(htmlString) {
        return this.replaceTranslationKeys(htmlString) || htmlString;
    }

    /**
     * Populate question element with data
     */
    populateQuestionElement(questionElement, questionData) {
        logger.debug('Populating question element with data:', questionData);

        this.populateBasicQuestionData(questionElement, questionData);
        this.populateQuestionImage(questionElement, questionData);
        this.populateTypeSpecificData(questionElement, questionData);
    }

    /**
     * Populate basic question data (text, type, time, difficulty)
     */
    populateBasicQuestionData(questionElement, questionData) {
        // Set question text
        const questionText = questionElement.querySelector('.question-text');
        if (questionText) {
            questionText.value = questionData.question || '';
            logger.debug('Set question text:', questionData.question);
        } else {
            logger.warn('Question text element not found');
        }

        // Set question type
        const questionType = questionElement.querySelector('.question-type');
        if (questionType) {
            questionType.value = questionData.type || 'multiple-choice';
            // Trigger change event to update UI
            questionType.dispatchEvent(new Event('change'));
        }

        // Set question time (with NaN protection)
        // Match the selector used in extractQuestionData: .question-time-limit
        const questionTime = questionElement.querySelector('.question-time-limit');
        if (questionTime) {
            // Support both 'timeLimit' (new) and 'time' (old) for backward compatibility
            const timeValue = parseInt(questionData.timeLimit || questionData.time, 10);
            questionTime.value = !isNaN(timeValue) && timeValue > 0 ? timeValue : 30;
        }

        // Set question difficulty
        const questionDifficulty = questionElement.querySelector('.question-difficulty');
        if (questionDifficulty) {
            questionDifficulty.value = questionData.difficulty || 'medium';
        }

        // Set explanation (optional field from AI generator or manual entry)
        const questionExplanation = questionElement.querySelector('.question-explanation');
        if (questionExplanation && questionData.explanation) {
            questionExplanation.value = questionData.explanation;
            logger.debug('Set explanation:', questionData.explanation.substring(0, 50) + '...');
        }

        // Ensure concept container exists (for backward compatibility with old questions)
        // and populate concept tags if present
        this.ensureConceptTagsContainer(questionElement);
        if (questionData.concepts && Array.isArray(questionData.concepts)) {
            this.populateConceptTags(questionElement, questionData.concepts);
        }
    }

    /**
     * Ensure concept tags container exists in question element
     * @param {HTMLElement} questionElement - The question DOM element
     * @returns {HTMLElement|null} The concept-tags-list element
     */
    ensureConceptTagsContainer(questionElement) {
        let tagsList = questionElement.querySelector('.concept-tags-list');
        if (tagsList) return tagsList;

        // Container doesn't exist - inject it (for backward compatibility with old questions)
        const questionMeta = questionElement.querySelector('.question-meta');
        if (!questionMeta) return null;

        const container = document.createElement('div');
        container.className = 'concept-tags-container';
        container.innerHTML = `
            <label data-translate="concepts">Concepts</label>
            <div class="concept-tags-input">
                <div class="concept-tags-list"></div>
                <input type="text" class="concept-input" placeholder="Add concept..." data-translate-placeholder="add_concept" maxlength="30">
            </div>
            <div class="concept-hint" data-translate="concept_hint">Press Enter to add (max 5)</div>
        `;

        // Insert before time-limit-container
        const timeContainer = questionMeta.querySelector('.time-limit-container');
        if (timeContainer) {
            questionMeta.insertBefore(container, timeContainer);
        } else {
            questionMeta.appendChild(container);
        }

        // Note: Event handling uses document-level delegation (see setupEventDelegation)
        // so no specific listener setup needed for the new input

        logger.debug('Injected concept-tags-container for backward compatibility');
        return container.querySelector('.concept-tags-list');
    }

    /**
     * Populate concept tags in question element
     * @param {HTMLElement} questionElement - The question DOM element
     * @param {string[]} concepts - Array of concept strings
     */
    populateConceptTags(questionElement, concepts) {
        const tagsList = this.ensureConceptTagsContainer(questionElement);
        if (!tagsList) return;

        tagsList.innerHTML = '';
        concepts.slice(0, 5).forEach(concept => {
            this.createConceptTag(tagsList, concept, false);
        });
        logger.debug('Populated concept tags:', concepts);
    }

    /**
     * Create a concept tag element and append to container
     * @param {HTMLElement} tagsList - The container for tags
     * @param {string} concept - The concept text
     * @param {boolean} triggerAutoSave - Whether to trigger auto-save on removal
     * @returns {HTMLElement} The created tag element
     */
    createConceptTag(tagsList, concept, triggerAutoSave = true) {
        const tag = document.createElement('span');
        tag.className = 'concept-tag';
        tag.dataset.concept = concept;
        tag.innerHTML = `${escapeHtml(concept)}<button type="button" class="concept-tag-remove" aria-label="Remove">×</button>`;

        tag.querySelector('.concept-tag-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            tag.remove();
            if (triggerAutoSave) {
                this.scheduleAutoSave();
            }
        });

        tagsList.appendChild(tag);
        return tag;
    }

    /**
     * Populate question image data with proper error handling
     */
    populateQuestionImage(questionElement, questionData) {
        if (!questionData.image) return;

        logger.debug('Populating image for question:', questionData.image, 'WebP:', questionData.imageWebp);
        const imageElement = questionElement.querySelector('.question-image');
        const imagePreview = questionElement.querySelector('.image-preview');

        if (!imageElement || !imagePreview) {
            logger.debug('Image elements not found in question DOM');
            return;
        }

        // Use WebP version for display if available (better compression)
        const displayImage = questionData.imageWebp || questionData.image;
        const imageSrc = this.resolveImageSource(displayImage);
        this.setupImageElement(imageElement, imageSrc, questionData.image, questionData.imageWebp);
        this.setupImageHandlers(imageElement, imagePreview, questionData.image);

        imagePreview.style.display = 'block';
        logger.debug('Image populated:', imageElement.src);
    }

    /**
     * Resolve image source from various formats using centralized resolver
     * Delegates to imagePathResolver for consistent path handling
     */
    resolveImageSource(imageData) {
        return imagePathResolver.toDisplayPath(imageData);
    }

    /**
     * Set up image element with source and data attributes
     * @param {HTMLImageElement} imageElement - The image element
     * @param {string} imageSrc - The display source URL
     * @param {string} originalImageData - The original image storage path
     * @param {string|null} webpImageData - The WebP image storage path (if available)
     */
    setupImageElement(imageElement, imageSrc, originalImageData, webpImageData = null) {
        imageElement.src = imageSrc;
        imageElement.dataset.url = originalImageData;
        if (webpImageData) {
            imageElement.dataset.webpUrl = webpImageData;
        }
    }

    /**
     * Set up image error and load handlers
     */
    setupImageHandlers(imageElement, imagePreview, imageData) {
        // Add load success handler first
        imageElement.onload = () => {
            logger.debug('✅ Quiz builder image loaded successfully:', imageData);
            imagePreview.style.display = 'block';
        };

        // Set up retry logic similar to preview renderer
        this.loadImageWithRetry(imageElement, imageElement.src, 3, 1, imagePreview, imageData);
    }

    /**
     * Handle image load errors with user-friendly messaging
     */
    handleImageLoadError(imageElement, imagePreview, imageData) {
        // Prevent infinite loop - remove error handler after first failure
        imageElement.onerror = null;

        logger.warn('⚠️ Quiz builder image failed to load:', imageData);

        // Hide the broken image
        imageElement.style.display = 'none';

        // Create or update error message
        this.showImageErrorMessage(imagePreview, imageData);

        // Keep preview visible with error message
        imagePreview.style.display = 'block';
        logger.debug('Shown image error message in quiz builder');
    }

    /**
     * Load image with retry logic for WSL environments (delegates to shared utility)
     */
    loadImageWithRetry(img, src, maxRetries = 3, _attempt = 1, imagePreview = null, imageData = '') {
        sharedLoadImageWithRetry(img, src, {
            maxRetries,
            useCacheBuster: true,
            onError: () => {
                this.handleImageLoadError(img, imagePreview, imageData || src);
            }
        });
    }

    /**
     * Show user-friendly image error message
     */
    showImageErrorMessage(imagePreview, imageData) {
        let errorMsg = imagePreview.querySelector('.image-error-message');
        if (!errorMsg) {
            errorMsg = document.createElement('div');
            errorMsg.className = 'image-error-message';
            errorMsg.style.cssText = `
                padding: 15px;
                text-align: center;
                background: rgba(255, 255, 255, 0.05);
                border: 2px dashed rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                color: var(--text-primary);
                font-size: 0.85rem;
                margin: 5px 0;
            `;
            imagePreview.appendChild(errorMsg);
        }

        errorMsg.innerHTML = `
            <div style="margin-bottom: 6px;">📷 Image not found</div>
            <div style="font-size: 0.75rem; opacity: 0.7;">${imageData}</div>
            <div style="font-size: 0.7rem; opacity: 0.6; margin-top: 3px;">Remove reference or upload file</div>
        `;
    }

    /**
     * Populate type-specific question data with proper timing
     * Uses QuestionTypeRegistry for centralized population logic
     *
     * Note: AI generator may use different property names than QuestionTypeRegistry expects:
     * - AI uses correctAnswer/correctAnswers, registry expects correctIndex/correctIndices
     */
    populateTypeSpecificData(questionElement, questionData) {
        setTimeout(() => {
            logger.debug('Populating type-specific data for:', questionData.type);

            // Normalize property names from AI generator to match QuestionTypeRegistry expectations
            const normalizedData = this.normalizeQuestionData(questionData);

            QuestionTypeRegistry.populateQuestion(questionData.type, questionElement, normalizedData);
        }, TIMING.DOM_UPDATE_DELAY);
    }

    /**
     * Normalize question data property names
     * Maps AI generator output to QuestionTypeRegistry expected format
     */
    normalizeQuestionData(questionData) {
        const normalized = { ...questionData };

        switch (questionData.type) {
            case 'multiple-choice':
                // AI uses correctAnswer (index), registry expects correctIndex
                if (normalized.correctAnswer !== undefined && normalized.correctIndex === undefined) {
                    normalized.correctIndex = normalized.correctAnswer;
                    logger.debug('Normalized correctAnswer -> correctIndex:', normalized.correctIndex);
                }
                break;

            case 'multiple-correct':
                // AI uses correctAnswers (array), registry expects correctIndices
                if (normalized.correctAnswers !== undefined && normalized.correctIndices === undefined) {
                    normalized.correctIndices = normalized.correctAnswers;
                    logger.debug('Normalized correctAnswers -> correctIndices:', normalized.correctIndices);
                }
                break;

            case 'true-false':
                // AI may use string "true"/"false", registry expects boolean
                if (typeof normalized.correctAnswer === 'string') {
                    normalized.correctAnswer = normalized.correctAnswer.toLowerCase() === 'true';
                    logger.debug('Normalized true-false correctAnswer string -> boolean:', normalized.correctAnswer);
                }
                break;

            // numeric already uses correctAnswer as number, which matches registry
        }

        return normalized;
    }

    /**
     * Import quiz from file
     */
    async importQuiz() {
        const fileInput = document.getElementById('import-file-input');
        if (fileInput) {
            fileInput.click();
        }
    }

    /**
     * Handle file import
     */
    async handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            showErrorAlert('invalid_file_format');
            return;
        }

        await this.errorHandler.wrapAsyncOperation(async () => {
            const text = await file.text();
            const quizData = JSON.parse(text);

            // Validate quiz data structure
            if (!quizData.title || !quizData.questions || !Array.isArray(quizData.questions)) {
                showErrorAlert('invalid_quiz_format');
                return;
            }

            // Validate questions
            const validationErrors = this.validateQuestions(quizData.questions);
            if (validationErrors.length > 0) {
                translationManager.showAlert('error', translationManager.getTranslationSync('invalid_quiz_questions') + '\\n' + validationErrors.join('\\n'));
                return;
            }

            // Load the quiz
            await this.populateQuizBuilder(quizData);
            showSuccessAlert('quiz_imported_successfully');
        }, {
            context: { operation: 'importQuiz', filename: file.name },
            fallback: () => showErrorAlert('failed_import_quiz')
        });

        // Clear file input
        event.target.value = '';
    }

    /**
     * Export quiz to file
     */
    async exportQuiz() {
        const title = document.getElementById('quiz-title')?.value?.trim();
        if (!title) {
            showErrorAlert('please_enter_quiz_title');
            return;
        }

        const questions = this.collectQuestions();
        if (questions.length === 0) {
            showErrorAlert('please_add_one_question');
            return;
        }

        const quizData = {
            title: title,
            questions: questions,
            createdAt: new Date().toISOString()
        };

        await this.errorHandler.wrapAsyncOperation(async () => {
            const dataStr = JSON.stringify(quizData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
            link.click();

            showSuccessAlert('quiz_exported_successfully');
        }, {
            context: { operation: 'exportQuiz', title },
            fallback: () => showErrorAlert('failed_export_quiz')
        });
    }

    /**
     * Add a generated question from AI generator
     * @param {Object} questionData - Generated question data
     * @param {boolean} showAlerts - Whether to show success alerts
     */
    addGeneratedQuestion(questionData, _showAlerts = true) {
        logger.debug('🔧 AddGeneratedQuestion - Starting with question:', {
            type: questionData.type,
            question: questionData.question?.substring(0, 50) + '...'
        });

        const questionElements = document.querySelectorAll('.question-item');
        let targetElement = null;

        // Check if there's an empty default question we can replace
        const firstQuestion = questionElements[0];
        if (firstQuestion && this.isEmptyQuestion(firstQuestion)) {
            logger.debug('🔧 AddGeneratedQuestion - Using existing empty question');
            targetElement = firstQuestion;

            // Use same processing as addQuestionFromData for consistency
            this.cleanTranslationKeysInElement(targetElement);
            this.populateQuestionElement(targetElement, questionData);
            translationManager.translateContainer(targetElement);
            // Update preview after populating (programmatic value changes don't fire input events)
            this.updatePreviewSafely();
        } else {
            // Add a new question
            logger.debug('🔧 AddGeneratedQuestion - Creating new question element');
            const addQuestion = this._getAddQuestionFn();
            if (addQuestion) {
                const initialCount = questionElements.length;
                addQuestion();

                // Use retry mechanism instead of fixed timeout to handle varying DOM update speeds
                const maxRetries = 10;
                const retryDelay = TIMING.DOM_READY_CHECK;
                let retryCount = 0;

                const findAndPopulate = () => {
                    const updatedQuestionElements = document.querySelectorAll('.question-item');

                    // Check if a new question was actually added
                    if (updatedQuestionElements.length > initialCount) {
                        targetElement = updatedQuestionElements[updatedQuestionElements.length - 1];
                        logger.debug('🔧 AddGeneratedQuestion - New element created, populating data');
                        // Use same processing as addQuestionFromData for consistency
                        this.cleanTranslationKeysInElement(targetElement);
                        this.populateQuestionElement(targetElement, questionData);
                        translationManager.translateContainer(targetElement);
                        // Update preview after populating (programmatic value changes don't fire input events)
                        this.updatePreviewSafely();
                    } else if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(findAndPopulate, retryDelay);
                    } else {
                        logger.error('🔧 AddGeneratedQuestion - Failed to find new question element after retries');
                    }
                };

                // Start checking after initial delay
                setTimeout(findAndPopulate, TIMING.DOM_READY_CHECK);
            } else {
                logger.error('addQuestion function not available');
                return;
            }
        }
    }

    /**
     * Check if a question element is empty/default
     */
    isEmptyQuestion(questionElement) {
        const questionText = questionElement.querySelector('.question-text')?.value?.trim();
        if (questionText) return false;

        const options = questionElement.querySelectorAll('.option');
        return Array.from(options).every(opt => !opt.value?.trim());
    }

    /**
     * Auto-save quiz to localStorage
     */
    autoSaveQuiz() {
        const title = document.getElementById('quiz-title')?.value?.trim();
        const questions = this.collectQuestions();

        if (title || questions.length > 0) {
            const autoSaveData = {
                title: title,
                questions: questions,
                timestamp: Date.now()
            };

            if (setJSON('quizAutoSave', autoSaveData)) {
                logger.debug('Auto-saved quiz data');
            }
        }
    }

    /**
     * Load auto-saved quiz
     */
    async loadAutoSave() {
        const data = getJSON('quizAutoSave');
        if (data) {
            // Check if auto-save is recent (within 24 hours)
            const hoursSinceAutoSave = (Date.now() - data.timestamp) / (1000 * 60 * 60);
            if (hoursSinceAutoSave < 24) {
                // Validate data before loading to prevent corruption
                if (this.validateQuizData(data)) {
                    await this.populateQuizBuilder(data);
                    logger.debug('Loaded auto-saved quiz data');
                } else {
                    logger.warn('Auto-save data appears corrupted, clearing localStorage');
                    removeItem('quizAutoSave');
                }
            }
        }
    }

    /**
     * Check if text contains corruption patterns
     * @param {string} text - Text to check
     * @returns {boolean} - True if corrupted
     */
    isCorruptedText(text) {
        if (!text || typeof text !== 'string') return false;

        // Check for specific corruption pattern but be less restrictive
        return text.includes('if this means that we sorted the first task');
    }

    /**
     * Validate question structure and content
     * @param {object} question - Question object to validate
     * @returns {boolean} - True if valid
     */
    validateQuestionStructure(question) {
        if (!question || typeof question !== 'object') {
            return false;
        }

        // Check for corrupted question text
        if (this.isCorruptedText(question.question)) {
            logger.warn('Found corrupted question text:', question.question);
            return false;
        }

        // Validate options if present
        return this.validateQuestionOptions(question.options);
    }

    /**
     * Validate question options for corruption
     * @param {Array} options - Options array to validate
     * @returns {boolean} - True if valid
     */
    validateQuestionOptions(options) {
        if (!options || !Array.isArray(options)) {
            return true; // Options are optional, so null/undefined is valid
        }

        // Check each option for corruption using early return
        for (const option of options) {
            if (this.isCorruptedText(option)) {
                logger.warn('Found corrupted option text:', option);
                return false;
            }
        }

        return true;
    }

    /**
     * Validate quiz data to prevent corruption
     */
    validateQuizData(data) {
        // Early return for invalid data structure
        if (!data || typeof data !== 'object') {
            logger.warn('Quiz validation failed: data is not an object');
            return false;
        }

        if (!data.questions || !Array.isArray(data.questions)) {
            logger.warn('Quiz validation failed: questions not found or not an array');
            return false;
        }

        logger.debug(`Validating quiz with ${data.questions.length} questions`);

        // Validate each question using helper method (reduces nesting)
        const isValid = data.questions.every((question, index) => {
            const valid = this.validateQuestionStructure(question);
            if (!valid) {
                logger.warn(`Question ${index + 1} failed validation`);
            }
            return valid;
        });

        logger.debug(`Quiz validation result: ${isValid}`);
        return isValid;
    }

    /**
     * Schedule auto-save with debounce (5 second delay)
     */
    scheduleAutoSave() {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => this.autoSaveQuiz(), TIMING.AUTO_SAVE_DELAY);
    }

    /**
     * Setup auto-save functionality
     */
    setupAutoSave() {
        // Auto-save on quiz title change
        const titleInput = document.getElementById('quiz-title');
        if (titleInput) {
            titleInput.addEventListener('input', () => this.scheduleAutoSave());
        }

        // Auto-save on question changes with tracked listener
        this.addDocumentListenerTracked('input', (event) => {
            if (event.target.closest('.question')) {
                this.scheduleAutoSave();
            }
        });

        // Setup concept tag input handlers
        this.setupConceptTagHandlers();
    }

    /**
     * Setup event handlers for concept tag inputs
     * Uses event delegation for dynamically added questions
     */
    setupConceptTagHandlers() {
        // Handle Enter key to add concept tags
        this.addDocumentListenerTracked('keydown', (event) => {
            if (event.key === 'Enter' && event.target.classList.contains('concept-input')) {
                event.preventDefault();
                this.handleConceptTagInput(event.target);
            }
        });

        // Handle blur to add concept tag (if user clicks away after typing)
        this.addDocumentListenerTracked('blur', (event) => {
            if (event.target.classList.contains('concept-input')) {
                this.handleConceptTagInput(event.target);
            }
        }, { capture: true });
    }

    /**
     * Handle adding a concept tag from input
     * @param {HTMLInputElement} input - The concept input element
     */
    handleConceptTagInput(input) {
        const concept = input.value.trim();
        if (!concept) return;

        const container = input.closest('.concept-tags-container');
        const tagsList = container?.querySelector('.concept-tags-list');
        if (!tagsList) return;

        // Check max 5 tags limit
        const existingTags = tagsList.querySelectorAll('.concept-tag');
        if (existingTags.length >= 5) {
            input.value = '';
            return;
        }

        // Check for duplicates
        const isDuplicate = Array.from(existingTags).some(
            tag => (tag.dataset.concept || '').toLowerCase() === concept.toLowerCase()
        );
        if (isDuplicate) {
            input.value = '';
            return;
        }

        this.createConceptTag(tagsList, concept, true);
        input.value = '';
        this.scheduleAutoSave();
    }

    // ==================== MEMORY MANAGEMENT METHODS ====================
    // Delegated to EventListenerManager for centralized tracking

    /**
     * Add document-level event listener with tracking
     */
    addDocumentListenerTracked(event, handler, options = {}) {
        this.listenerManager.addDocumentListener(event, handler, options);
    }

    /**
     * Add element event listener with tracking
     */
    addEventListenerTracked(element, event, handler, options = {}) {
        this.listenerManager.addEventListenerTracked(element, event, handler, options);
    }

    /**
     * Cleanup all tracked event listeners and timeouts
     */
    cleanup() {
        logger.debug('QuizManager cleanup started');

        this.errorHandler.safeExecute(() => {
            // Clear auto-save timeout
            if (this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
                this.autoSaveTimeout = null;
            }

            // Delegate to EventListenerManager for listener cleanup
            this.listenerManager.cleanup();

            logger.debug('QuizManager cleanup completed successfully');
        }, { operation: 'cleanup' });
    }
}