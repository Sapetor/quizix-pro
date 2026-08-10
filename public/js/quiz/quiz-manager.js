/**
 * Quiz Manager Module
 * Handles quiz operations: save, load, import, export, and quiz management
 */

import { translationManager, showErrorAlert, showSuccessAlert } from '../utils/translation-manager.js';
import { MathRenderer } from '../utils/math-renderer.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';
import { logger, TIMING } from '../core/config.js';
import { APIHelper } from '../utils/api-helper.js';
import { imagePathResolver } from '../utils/image-path-resolver.js';
import { QuestionTypeRegistry } from '../utils/question-type-registry.js';
import { getJSON, setJSON, removeItem } from '../utils/storage-utils.js';
import { EventListenerManager } from '../utils/event-listener-manager.js';
import { dom, escapeHtml, show, hide } from '../utils/dom.js';
import { getFileManager } from '../ui/file-manager.js';
import { openModal, closeModal } from '../utils/modal-utils.js';
import { authManager } from '../utils/auth-manager.js';
import { manimEditor } from './manim-editor.js';
import { resolveTimeLimit } from '../utils/question-utils.js';
import * as settings from './modules/settings-persistence.js';
import * as io from './modules/import-export.js';
import * as editing from './modules/question-editing.js';

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

        // Track the filename and title of the currently loaded quiz so saves overwrite it
        this._loadedFilename = null;
        this._loadedTitle = null;

        // Memory management via EventListenerManager
        this.listenerManager = new EventListenerManager('QuizManager');

        // Dependency injection for quick start
        this._quickStartHandler = null;

        // Initialize file manager for folder tree view
        this.fileManager = getFileManager({
            onLoadQuiz: (filename, data) => this.handleFileManagerLoad(filename, data),
            onPracticeQuiz: (filename, data) => this.handleFileManagerPractice(filename, data),
            onQuickStart: (filename, data) => this.handleFileManagerQuickStart(filename, data)
        });

        // Bind cleanup method
        this.cleanup = this.cleanup.bind(this);

        // Defer Manim init until DOM is fully loaded
        const initVideo = () => this._initExistingVideoSections();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initVideo);
        } else {
            setTimeout(initVideo, 0);
        }

        // Also init video sections for questions added via the "Add Question" button
        document.addEventListener('questionAdded', () => {
            const container = document.getElementById('questions-container');
            if (container?.lastElementChild) {
                manimEditor.initVideoSection(container.lastElementChild);
            }
        });
    }

    /**
     * Initialize video sections for questions already present in the HTML template.
     */
    async _initExistingVideoSections() {
        const existing = document.querySelectorAll('.question-item');
        for (const el of existing) {
            try {
                await manimEditor.initVideoSection(el);
            } catch (err) {
                logger.warn('Failed to init video section:', err);
            }
        }
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
     * Dependency injection: Set quick start handler
     * @param {Function} handler - Function to quick-start a quiz by filename
     */
    setQuickStartHandler(handler) {
        this._quickStartHandler = handler;
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
     * Handle quick start from file manager context menu
     */
    handleFileManagerQuickStart(filename, data) {
        this.hideLoadQuizModal();
        const quickStart = this._quickStartHandler || window.game?.quickStartQuiz;
        if (quickStart) {
            quickStart(filename);
        } else {
            logger.error('No quickStart handler available');
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
     * Collect game settings from host screen UI elements
     */
    collectSettings() {
        return settings.collectSettings();
    }

    /**
     * Restore saved game settings to host screen UI elements
     */
    restoreSettings(savedSettings) {
        return settings.restoreSettings(savedSettings);
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

        // Global-vs-per-question time resolution shared with the sidebar/preview
        const timeLimit = resolveTimeLimit(questionElement);

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

        // Extract video/Manim data
        const videoData = manimEditor.collectVideoData(questionElement);
        if (videoData.video) questionData.video = videoData.video;
        if (videoData.videoManimCode) questionData.videoManimCode = videoData.videoManimCode;
        if (videoData.explanationVideo) questionData.explanationVideo = videoData.explanationVideo;
        if (videoData.explanationVideoManimCode) questionData.explanationVideoManimCode = videoData.explanationVideoManimCode;

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
        const title = dom.get('quiz-title')?.value?.trim();
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

        // Collect current game settings from host screen UI
        const settings = this.collectSettings();

        // Only overwrite the loaded file if the title hasn't changed.
        // Changed title = user wants a new quiz, so skip filename to trigger conflict resolution.
        const shouldOverwrite = this._loadedFilename && this._loadedTitle === title;
        this.pendingSave = { title, questions, settings, filename: shouldOverwrite ? this._loadedFilename : null };

        // Show save modal for optional password
        this.showSaveQuizModal();
    }

    /**
     * Show save quiz modal
     */
    showSaveQuizModal() {
        const modal = dom.get('save-quiz-modal');
        if (!modal) {
            // Fallback: save without password if modal doesn't exist
            this.confirmSave('');
            return;
        }

        // Reset password fields
        const passwordInput = dom.get('save-quiz-password');
        const confirmInput = dom.get('save-quiz-password-confirm');
        const confirmGroup = dom.get('save-quiz-confirm-group');
        const passwordGroup = passwordInput?.closest('.form-group');
        const canUsePasswords = authManager.isAuthenticated;

        if (passwordInput) passwordInput.value = '';
        if (confirmInput) confirmInput.value = '';
        if (confirmGroup) hide(confirmGroup);
        if (passwordGroup) {
            if (canUsePasswords) {
                show(passwordGroup, 'visible-block');
            } else {
                hide(passwordGroup);
            }
        }

        // Show confirm field when password is entered
        if (passwordInput) {
            passwordInput.oninput = canUsePasswords
                ? () => {
                    if (confirmGroup) {
                        if (passwordInput.value) {
                            show(confirmGroup, 'visible-block');
                        } else {
                            hide(confirmGroup);
                        }
                    }
                }
                : null;
        }

        // Setup button handlers
        const cancelBtn = dom.get('cancel-save');
        const confirmBtn = dom.get('confirm-save');

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
        const modal = dom.get('save-quiz-modal');
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
        const passwordInput = dom.get('save-quiz-password');
        const confirmInput = dom.get('save-quiz-password-confirm');

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

        const { title, questions, settings, filename: loadedFilename } = this.pendingSave;

        try {
            return await errorHandler.safeNetworkOperation(async () => {
                logger.info('Saving quiz:', title, 'with', questions.length, 'questions');

                const response = await APIHelper.fetchAPI('api/save-quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, questions, settings, password: password || null, filename: loadedFilename || undefined })
                });

                const data = await response.json();
                logger.info('Save response:', response.status, data);

                if (response.ok) {
                    const savedTitle = data.title || title;
                    showSuccessAlert('quiz_saved_successfully', [savedTitle]);
                    if (data.filename) {
                        // Keep loaded state in sync so subsequent saves still overwrite
                        this._loadedFilename = data.filename;
                        this._loadedTitle = savedTitle;
                        // If server resolved a title conflict, update the input field
                        if (data.title && data.title !== title) {
                            const titleInput = dom.get('quiz-title');
                            if (titleInput) titleInput.value = data.title;
                        }
                        await this.fileManager.registerNewQuiz(data.filename, savedTitle);
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
        const modal = dom.get('load-quiz-modal');
        if (!modal) {
            logger.error('Load quiz modal not found');
            return;
        }

        // Set up modal event handlers
        this.setupLoadQuizModalHandlers(modal);

        // Check if tree view container exists (new folder tree UI)
        const treeContainer = dom.get('quiz-tree-container');
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
                    noQuizzesDiv.className = 'no-quizzes empty-state';
                    noQuizzesDiv.innerHTML = `
                        <div class="empty-state-icon">
                            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="12" y="8" width="40" height="48" rx="4" stroke="currentColor" stroke-width="2" opacity="0.4"/>
                                <line x1="20" y1="20" x2="44" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
                                <line x1="20" y1="28" x2="38" y2="28" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
                                <line x1="20" y1="36" x2="42" y2="36" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
                                <circle cx="48" cy="48" r="12" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                                <line x1="48" y1="42" x2="48" y2="54" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
                                <line x1="42" y1="48" x2="54" y2="48" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
                            </svg>
                        </div>
                        <p>${translationManager.getTranslationSync('no_saved_quizzes')}</p>
                        <div class="empty-state-actions">
                            <button class="btn primary empty-state-create-btn">${translationManager.getTranslationSync('create_first_quiz')}</button>
                            <p class="empty-state-hint">${translationManager.getTranslationSync('try_ai_generation')}</p>
                            <p class="empty-state-hint">${translationManager.getTranslationSync('import_quiz_hint')}</p>
                        </div>
                    `;
                    // Wire up the create button to close dialog and go to editor
                    const createBtn = noQuizzesDiv.querySelector('.empty-state-create-btn');
                    createBtn?.addEventListener('click', () => {
                        const modal = noQuizzesDiv.closest('.modal-overlay, .modal');
                        if (modal) modal.classList.remove('visible');
                        if (window.game?.uiManager) window.game.uiManager.showScreen('host-screen');
                    });
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
        const modal = dom.get('load-quiz-modal');
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
            if (!modal.classList.contains('hidden')) {
                hide(modal);
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
                const hostContainer = dom.get('host-container');
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

                // Mobile: also initialize pagination after quiz load
                if (window.innerWidth < 769 && window.showQuestion) {
                    window.showQuestion(0);
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
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
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

                    // Track which file is loaded so saves overwrite it
                    // (populateQuizBuilder dispatches quizLoaded itself)
                    this._loadedFilename = filename;
                    this._loadedTitle = cleanedData.title || null;
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
                        showSuccessAlert('quiz_loaded_successfully', [cleanedData.title || filename]);
                        logger.debug('Success alert shown');
                        return true;
                    },
                    { operation: 'showSuccessAlert' },
                    () => false
                );

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
            const titleInput = dom.get('quiz-title');
            if (!titleInput) {
                throw new Error('Quiz title input not found');
            }
            titleInput.value = quizData.title || '';

            // Clear existing questions (essential)
            const questionsContainer = dom.get('questions-container');
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

            // Restore saved game settings to host screen UI
            this.errorHandler.safeExecute(
                () => this.restoreSettings(quizData.settings),
                { operation: 'restoreSettings' }
            );

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
                    const container = dom.get('questions-container');
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

            // Refresh the live preview for every populate path (load, import,
            // programmatic) — callers previously had to remember this themselves
            // and the import path didn't, leaving the preview stale.
            this.updatePreviewSafely();

            // Notify listeners (sidebar, breadcrumb, question count, save
            // status) for EVERY populate path — load, import, autosave restore.
            document.dispatchEvent(new CustomEvent('quizLoaded', {
                detail: {
                    questionCount: Array.isArray(quizData.questions) ? quizData.questions.length : 0,
                    title: quizData.title
                }
            }));

        } catch (error) {
            logger.error('Critical error in populateQuizBuilder:', error);
            // Only throw if a truly critical operation failed
            throw error;
        }

        // NOTE: Preview update is now handled separately in updatePreviewSafely()
        // This ensures it can't break the quiz loading flow
    }

    /**
     * Combined update method for questions UI - prevents visual glitches
     * Updates both remove button visibility and question numbering in single operation
     */
    updateQuestionsUI() {
        return editing.updateQuestionsUI(this);
    }

    /**
     * Add question from data object
     */
    addQuestionFromData(questionData) {
        return editing.addQuestionFromData(this, questionData);
    }

    /**
     * Replace translation keys in text with fallback values
     * @returns {string|null} Replaced text if changes made, null otherwise
     */
    replaceTranslationKeys(text) {
        return editing.replaceTranslationKeys(text);
    }

    /**
     * Clean translation keys from an element without destroying DOM structure
     */
    cleanTranslationKeysInElement(element) {
        return editing.cleanTranslationKeysInElement(element);
    }

    /**
     * Clean translation keys from loaded data (legacy method for backward compatibility)
     */
    cleanTranslationKeys(htmlString) {
        return editing.cleanTranslationKeys(htmlString);
    }

    /**
     * Populate question element with data
     */
    populateQuestionElement(questionElement, questionData) {
        return editing.populateQuestionElement(this, questionElement, questionData);
    }

    /**
     * Populate basic question data (text, type, time, difficulty)
     */
    populateBasicQuestionData(questionElement, questionData) {
        return editing.populateBasicQuestionData(this, questionElement, questionData);
    }

    /**
     * Ensure concept tags container exists in question element
     * @param {HTMLElement} questionElement - The question DOM element
     * @returns {HTMLElement|null} The concept-tags-list element
     */
    ensureConceptTagsContainer(questionElement) {
        return editing.ensureConceptTagsContainer(questionElement);
    }

    /**
     * Populate concept tags in question element
     * @param {HTMLElement} questionElement - The question DOM element
     * @param {string[]} concepts - Array of concept strings
     */
    populateConceptTags(questionElement, concepts) {
        return editing.populateConceptTags(this, questionElement, concepts);
    }

    /**
     * Create a concept tag element and append to container
     * @param {HTMLElement} tagsList - The container for tags
     * @param {string} concept - The concept text
     * @param {boolean} triggerAutoSave - Whether to trigger auto-save on removal
     * @returns {HTMLElement} The created tag element
     */
    createConceptTag(tagsList, concept, triggerAutoSave = true) {
        return editing.createConceptTag(this, tagsList, concept, triggerAutoSave);
    }

    /**
     * Populate question image data with proper error handling
     */
    populateQuestionImage(questionElement, questionData) {
        return editing.populateQuestionImage(this, questionElement, questionData);
    }

    /**
     * Resolve image source from various formats using centralized resolver
     * Delegates to imagePathResolver for consistent path handling
     */
    resolveImageSource(imageData) {
        return editing.resolveImageSource(imageData);
    }

    /**
     * Set up image element with source and data attributes
     * @param {HTMLImageElement} imageElement - The image element
     * @param {string} imageSrc - The display source URL
     * @param {string} originalImageData - The original image storage path
     * @param {string|null} webpImageData - The WebP image storage path (if available)
     */
    setupImageElement(imageElement, imageSrc, originalImageData, webpImageData = null) {
        return editing.setupImageElement(imageElement, imageSrc, originalImageData, webpImageData);
    }

    /**
     * Set up image error and load handlers
     */
    setupImageHandlers(imageElement, imagePreview, imageData) {
        return editing.setupImageHandlers(this, imageElement, imagePreview, imageData);
    }

    /**
     * Handle image load errors with user-friendly messaging
     */
    handleImageLoadError(imageElement, imagePreview, imageData) {
        return editing.handleImageLoadError(this, imageElement, imagePreview, imageData);
    }

    /**
     * Load image with retry logic for WSL environments (delegates to shared utility)
     */
    loadImageWithRetry(img, src, maxRetries = 3, _attempt = 1, imagePreview = null, imageData = '') {
        return editing.loadImageWithRetry(this, img, src, maxRetries, _attempt, imagePreview, imageData);
    }

    /**
     * Show user-friendly image error message
     */
    showImageErrorMessage(imagePreview, imageData) {
        return editing.showImageErrorMessage(imagePreview, imageData);
    }

    /**
     * Populate type-specific question data with proper timing
     * Uses QuestionTypeRegistry for centralized population logic
     *
     * Note: AI generator may use different property names than QuestionTypeRegistry expects:
     * - AI uses correctAnswer/correctAnswers, registry expects correctIndex/correctIndices
     */
    populateTypeSpecificData(questionElement, questionData) {
        return editing.populateTypeSpecificData(this, questionElement, questionData);
    }

    /**
     * Normalize question data property names
     * Maps AI generator output to QuestionTypeRegistry expected format
     */
    normalizeQuestionData(questionData) {
        return editing.normalizeQuestionData(questionData);
    }

    /**
     * Import quiz from file
     */
    async importQuiz() {
        return io.importQuiz();
    }

    /**
     * Handle file import
     */
    async handleFileImport(event) {
        return io.handleFileImport(this, event);
    }

    /**
     * Export quiz to file
     */
    async exportQuiz() {
        return io.exportQuiz(this);
    }

    /**
     * Add a generated question from AI generator
     * @param {Object} questionData - Generated question data
     * @param {boolean} showAlerts - Whether to show success alerts
     */
    addGeneratedQuestion(questionData, _showAlerts = true) {
        return editing.addGeneratedQuestion(this, questionData, _showAlerts);
    }

    /**
     * Check if a question element is empty/default
     */
    isEmptyQuestion(questionElement) {
        return editing.isEmptyQuestion(questionElement);
    }

    /**
     * Auto-save quiz to localStorage
     */
    autoSaveQuiz() {
        const title = dom.get('quiz-title')?.value?.trim();
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
        // Header autosave stamp (editor-validation.js): "DRAFT SAVED LOCALLY · HH:MM".
        // Local draft only — the server save is the explicit #header-save-quiz button.
        document.dispatchEvent(new CustomEvent('editorAutosaveDone'));
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
        // Header autosave stamp (editor-validation.js) shows "Guardando…"
        document.dispatchEvent(new CustomEvent('editorAutosavePending'));
    }

    /**
     * Setup auto-save functionality
     */
    setupAutoSave() {
        // Auto-save on quiz title change
        const titleInput = dom.get('quiz-title');
        if (titleInput) {
            titleInput.addEventListener('input', () => this.scheduleAutoSave());
        }

        // Auto-save on question changes with tracked listener.
        // (Was '.question' — a class that exists nowhere; the editor's
        // question nodes are '.question-item', so edits never autosaved.)
        this.addDocumentListenerTracked('input', (event) => {
            if (event.target.closest('.question-item')) {
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
