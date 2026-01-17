/**
 * Main QuizGame Application Class
 * Coordinating class that manages all game modules and core functionality
 */

import { TIMING, LIMITS, logger } from './config.js';
import { UIManager } from '../ui/ui-manager.js';
import { PreviewManager } from '../ui/preview-manager.js';
import { GameManager } from '../game/game-manager.js';
import { QuizManager } from '../quiz/quiz-manager.js';
import { SocketManager } from '../socket/socket-manager.js';
import { SettingsManager } from '../settings/settings-manager.js';
import { SoundManager } from '../audio/sound-manager.js';
import { MathRenderer } from '../utils/math-renderer.js';
// AI Generator will be lazy loaded when needed
import { addQuestion, randomizeAnswers, shuffleArray } from '../utils/question-utils.js';
import { translationManager, showErrorAlert, createQuestionCounter } from '../utils/translation-manager.js';
import { toastNotifications } from '../utils/toast-notifications.js';
import { connectionStatus } from '../utils/connection-status.js';
import { APIHelper } from '../utils/api-helper.js';
import { disableAutoHideToolbar, isAutoHideToolbarActive } from '../utils/auto-hide-toolbar-manager.js';
import { imagePathResolver } from '../utils/image-path-resolver.js';
import { bindElement } from '../utils/dom.js';
import { getJSON, setJSON } from '../utils/storage-utils.js';
import { PracticeModeManager } from '../practice/practice-mode-manager.js';
import { SocketEventBus } from '../events/socket-event-bus.js';
// Results viewer will be lazy loaded when needed

export class QuizGame {
    constructor() {
        logger.debug('QuizGame constructor called');
        logger.info('Initializing QuizGame...');

        // Initialize socket connection with base path support for Kubernetes
        const basePath = document.querySelector('base')?.getAttribute('href') || '/';
        const cleanPath = basePath.replace(/\/$/, '');
        this.socket = io({ path: cleanPath + '/socket.io' });

        // AbortController for cleanup of document-level event listeners
        this.abortController = new AbortController();

        // Initialize all managers with error handling
        try {
            this.settingsManager = new SettingsManager();
            logger.debug('SettingsManager initialized successfully');
        } catch (error) {
            logger.error('SettingsManager initialization failed:', error);
            // Create minimal fallback
            this.settingsManager = {
                toggleTheme: () => {
                    logger.debug('Fallback theme toggle from SettingsManager');
                    this.toggleTheme();
                },
                toggleFullscreen: () => logger.debug('Fullscreen toggle not available'),
                initializeEventListeners: () => {},
                getSetting: () => null
            };
            logger.warn('Using fallback SettingsManager');
        }

        this.soundManager = new SoundManager();
        this.uiManager = new UIManager();

        logger.debug('Creating MathRenderer');
        this.mathRenderer = new MathRenderer();
        logger.debug('MathRenderer created');

        this.previewManager = new PreviewManager(this.mathRenderer);
        this.gameManager = new GameManager(this.socket, this.uiManager, this.soundManager);
        this.quizManager = new QuizManager(this.uiManager);
        this.socketManager = new SocketManager(this.socket, this.gameManager, this.uiManager, this.soundManager);

        // Update GameManager with SocketManager reference
        this.gameManager.setSocketManager(this.socketManager);

        // Create SocketEventBus adapter for multiplayer mode
        this.socketEventBus = new SocketEventBus(this.socketManager, this.socket);

        // Initialize practice mode manager
        this.practiceModeManager = new PracticeModeManager(this.gameManager, this.uiManager);

        // Initialize connection status monitoring
        connectionStatus.setSocket(this.socket);
        this.aiGenerator = null; // Will be lazy loaded when needed

        // Initialize core functionality
        this.initializeEventListeners();
        this.initializeToolbar();

        // Make preview manager globally accessible for onclick handlers
        window.game = this;

        // Setup auto-save
        this.quizManager.setupAutoSave();

        // Load theme and settings
        this.settingsManager.initializeEventListeners();

        // Set default player name
        this.setDefaultPlayerName();

        // Logger system initialized and ready

        logger.info('QuizGame initialized successfully');
    }
    /**
     * Handle image upload for quiz questions
     * @param {HTMLInputElement} inputElement - The file input element
     */
    async uploadImage(inputElement) {
        try {
            const file = inputElement.files[0];
            if (!file) {
                logger.debug('No file selected for upload');
                return;
            }

            logger.debug('Uploading image:', file.name, file.type, file.size);

            // Validate file type
            if (!file.type.startsWith('image/')) {
                translationManager.showAlert('please_select_image');
                return;
            }

            // Validate file size (5MB limit)
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (file.size > maxSize) {
                translationManager.showAlert('image_too_large');
                return;
            }

            // Create FormData for upload
            const formData = new FormData();
            formData.append('image', file);

            // Show upload progress (optional UI feedback)
            const questionItem = inputElement.closest('.question-item');
            const imageUploadDiv = questionItem?.querySelector('.image-upload');
            if (imageUploadDiv) {
                imageUploadDiv.style.opacity = '0.5';
            }

            // Upload to server
            const response = await fetch(APIHelper.getApiUrl('upload'), {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            logger.debug('Upload successful:', result);

            // Use centralized path resolver for consistent handling
            const storagePath = imagePathResolver.toStoragePath(result.url);
            const displayPath = imagePathResolver.toDisplayPath(storagePath);

            // Handle WebP version if available
            let webpStoragePath = null;
            let webpDisplayPath = null;
            if (result.webpUrl) {
                webpStoragePath = imagePathResolver.toStoragePath(result.webpUrl);
                webpDisplayPath = imagePathResolver.toDisplayPath(webpStoragePath);
                logger.debug('WebP version available:', webpStoragePath);
            }

            // Update the image preview
            this.updateImagePreview(inputElement, storagePath, displayPath, webpStoragePath, webpDisplayPath);

        } catch (error) {
            logger.error('Image upload failed:', error);
            translationManager.showAlert('image_upload_failed');

            // Reset the file input
            inputElement.value = '';

            // Restore UI state
            const questionItem = inputElement.closest('.question-item');
            const imageUploadDiv = questionItem?.querySelector('.image-upload');
            if (imageUploadDiv) {
                imageUploadDiv.style.opacity = '1';
            }
        }
    }

    /**
     * Update image preview after successful upload
     * @param {HTMLInputElement} inputElement - The file input element
     * @param {string} storagePath - The portable storage path (e.g., /uploads/file.gif)
     * @param {string} displayPath - The environment-specific display path
     * @param {string|null} webpStoragePath - The WebP storage path (if available)
     * @param {string|null} webpDisplayPath - The WebP display path (if available)
     */
    updateImagePreview(inputElement, storagePath, displayPath, webpStoragePath = null, webpDisplayPath = null) {
        const questionItem = inputElement.closest('.question-item');
        if (!questionItem) {
            logger.error('Could not find question item for image preview');
            return;
        }

        const imagePreview = questionItem.querySelector('.image-preview');
        const imageElement = questionItem.querySelector('.question-image');

        if (!imagePreview || !imageElement) {
            logger.error('Could not find image preview elements');
            return;
        }

        // Use WebP for display if available (better compression), fallback to original
        const actualDisplayPath = webpDisplayPath || displayPath;
        imageElement.src = actualDisplayPath;

        // Store the portable storage paths for quiz saving
        // Store original path in dataset.url (backwards compatible)
        imageElement.dataset.url = storagePath;
        // Store WebP path separately if available
        if (webpStoragePath) {
            imageElement.dataset.webpUrl = webpStoragePath;
        }
        imageElement.alt = 'Question Image';

        // Show the preview
        imagePreview.style.display = 'block';

        // Restore UI state
        const imageUploadDiv = questionItem.querySelector('.image-upload');
        if (imageUploadDiv) {
            imageUploadDiv.style.opacity = '1';
        }

        logger.debug('Image preview updated - Storage:', storagePath, 'WebP:', webpStoragePath, 'Display:', actualDisplayPath);
    }

    /**
     * Initialize main event listeners
     */
    initializeEventListeners() {
        // Screen navigation
        bindElement('host-btn', 'click', () => {
            this.uiManager.showScreen('host-screen');
            // Show horizontal toolbar when entering host mode
            const horizontalToolbar = document.getElementById('horizontal-toolbar');
            if (horizontalToolbar) {
                horizontalToolbar.style.display = 'flex';
            }
        });
        bindElement('join-btn', 'click', () => this.uiManager.showScreen('join-screen'));

        // Mobile button handlers (same functionality as desktop)
        bindElement('host-btn-mobile', 'click', () => {
            this.uiManager.showScreen('host-screen');
            // Show horizontal toolbar when entering host mode
            const horizontalToolbar = document.getElementById('horizontal-toolbar');
            if (horizontalToolbar) {
                horizontalToolbar.style.display = 'flex';
            }
        });
        bindElement('join-btn-mobile', 'click', () => this.uiManager.showScreen('join-screen'));
        bindElement('browse-games', 'click', () => this.uiManager.showGameBrowser());
        bindElement('refresh-games', 'click', () => this.uiManager.refreshActiveGames());
        bindElement('back-to-join', 'click', () => this.uiManager.showScreen('join-screen'));
        bindElement('return-to-main', 'click', () => this.uiManager.showScreen('main-menu'));
        bindElement('mobile-return-to-main', 'click', () => this.uiManager.showScreen('main-menu'));
        bindElement('desktop-return-to-main', 'click', () => this.uiManager.showScreen('main-menu'));

        // Language selection
        document.querySelectorAll('[data-lang]').forEach(btn => {
            btn.addEventListener('click', () => {
                translationManager.setLanguage(btn.getAttribute('data-lang'));
            });
        });

        // Quiz building
        bindElement('add-question', 'click', () => this.addQuestion());
        bindElement('save-quiz', 'click', () => this.quizManager.saveQuiz());
        bindElement('load-quiz', 'click', () => this.quizManager.showLoadQuizModal());
        bindElement('cancel-load', 'click', () => this.quizManager.hideLoadQuizModal());
        bindElement('import-quiz', 'click', () => this.quizManager.importQuiz());
        bindElement('import-file-input', 'change', (e) => this.quizManager.handleFileImport(e));
        bindElement('preview-quiz', 'click', () => this.showQuizPreview());
        bindElement('cancel-preview', 'click', () => this.hideQuizPreview());

        // Game controls
        bindElement('start-hosting', 'click', () => this.startHosting());
        bindElement('start-hosting-top', 'click', () => this.startHosting());
        bindElement('start-hosting-main', 'click', () => this.startHosting());
        bindElement('start-hosting-header-small', 'click', () => this.startHosting());
        bindElement('start-game', 'click', () => this.startGame());
        bindElement('next-question', 'click', (e) => {
            e.preventDefault();
            this.nextQuestion();
        });
        bindElement('join-game', 'click', () => this.joinGame());
        bindElement('new-game', 'click', () => {
            logger.debug('New Game button clicked!');
            this.newGame();
        });
        bindElement('play-again', 'click', () => {
            logger.debug('Play Again button clicked!');
            this.newGame();
        });
        bindElement('exit-to-main', 'click', () => this.exitToMainMenu());

        // Statistics phase control buttons
        bindElement('next-question-stats', 'click', (e) => {
            e.preventDefault();
            this.nextQuestion();
        });
        bindElement('exit-to-main-stats', 'click', () => this.exitToMainMenu());

        // Auto-save setup
        bindElement('quiz-title', 'input', () => {
            clearTimeout(this.quizManager.autoSaveTimeout);
            this.quizManager.autoSaveTimeout = setTimeout(() => {
                this.quizManager.autoSaveQuiz();
            }, TIMING.AUTO_SAVE_DELAY);
        });

        // Global click handler for game interactions (with abort signal for cleanup)
        document.addEventListener('click', (e) => {
            // Handle player answer selection
            if (e.target.closest('#player-game-screen')) {
                this.handlePlayerGameClick(e);
            }

            // Handle PIN copy to clipboard
            if (e.target.closest('#game-pin')) {
                this.copyPinToClipboard(e.target.closest('#game-pin'));
            }
        }, { signal: this.abortController.signal });

        // Numeric answer input
        bindElement('numeric-answer-input', 'keypress', (e) => {
            if (e.key === 'Enter') {
                this.gameManager.submitNumericAnswer();
            }
        });

        // Multiple correct answer submission
        bindElement('submit-multiple', 'click', () => {
            this.gameManager.submitMultipleCorrectAnswer();
        });

        // Theme toggle is now handled by SettingsManager.initializeEventListeners()
        // Removed conflicting fallback event listener
        bindElement('fullscreen-toggle', 'click', () => {
            if (this.settingsManager.toggleFullscreen) {
                this.settingsManager.toggleFullscreen();
            } else {
                this.toggleFullscreen();
            }
        });
    }

    /**
     * Handle player game screen clicks
     */
    handlePlayerGameClick(_e) {
        // Client interactions are now handled by PlayerInteractionManager
        // This method kept for future non-client click handling if needed
        logger.debug('Player game click delegated to PlayerInteractionManager');
    }

    /**
     * Copy game PIN to clipboard
     */
    async copyPinToClipboard(pinElement) {
        try {
            const pinDigitsElement = pinElement.querySelector('.pin-digits');
            const pin = pinDigitsElement ? pinDigitsElement.textContent.trim() : pinElement.textContent.trim();

            if (pin && pin !== '------') {
                await navigator.clipboard.writeText(pin);

                // Show visual feedback on the digits element
                const targetElement = pinDigitsElement || pinElement;
                const originalText = targetElement.textContent;
                const originalBg = pinElement.style.backgroundColor;

                pinElement.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
                targetElement.textContent = translationManager.getTranslationSync('copied') || 'Copied!';

                // Show toast notification
                if (typeof translationManager !== 'undefined' && translationManager.showAlert) {
                    translationManager.showAlert('success', 'PIN copied to clipboard!');
                } else {
                    // Fallback notification
                    logger.info('PIN copied to clipboard:', pin);
                }

                // Reset appearance after animation
                setTimeout(() => {
                    targetElement.textContent = originalText;
                    pinElement.style.backgroundColor = originalBg;
                }, 1500);
            }
        } catch (error) {
            logger.error('Failed to copy PIN to clipboard:', error);
            // Fallback: select text for manual copy
            if (window.getSelection) {
                const selection = window.getSelection();
                const range = document.createRange();
                const pinDigitsElement = pinElement.querySelector('.pin-digits');
                range.selectNodeContents(pinDigitsElement || pinElement);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }

    /**
     * Add a new question to the quiz builder
     */
    addQuestion() {
        addQuestion();
        translationManager.translatePage();
    }

    /**
     * Add a new question and scroll to it
     */
    addQuestionAndScrollToIt() {
        this.addQuestion();

        // Wait for the DOM to update, then scroll to the new question
        setTimeout(() => {
            const questionItems = document.querySelectorAll('.question-item');
            if (questionItems.length > 0) {
                const lastQuestion = questionItems[questionItems.length - 1];

                // Use gentle scrolling that's less jarring
                lastQuestion.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'nearest'
                });

                // Add subtle highlight effect
                lastQuestion.style.transition = 'background-color 0.5s ease';
                lastQuestion.style.backgroundColor = 'rgba(37, 99, 235, 0.05)';

                setTimeout(() => {
                    lastQuestion.style.backgroundColor = '';
                    setTimeout(() => {
                        lastQuestion.style.transition = '';
                    }, 500);
                }, 1000);
            }
        }, TIMING.DOM_UPDATE_DELAY);
    }

    /**
     * Start hosting a game
     */
    startHosting() {
        // Debounce to prevent multiple rapid calls
        if (this.startHostingCalled) {
            logger.debug('startHosting already in progress, ignoring');
            return;
        }
        this.startHostingCalled = true;

        // Reset the flag after debounce delay
        setTimeout(() => {
            this.startHostingCalled = false;
        }, TIMING.LEADERBOARD_DISPLAY_TIME);

        logger.info('startHosting called');
        const title = document.getElementById('quiz-title')?.value?.trim();
        logger.debug('Quiz title from input field:', title);
        if (!title) {
            showErrorAlert('please_enter_quiz_title');
            return;
        }

        const questions = this.quizManager.collectQuestions();
        logger.debug('Collected questions:', questions);
        if (questions.length === 0) {
            showErrorAlert('please_add_one_question');
            return;
        }


        // Get quiz settings
        const randomizeQuestions = document.getElementById('randomize-questions')?.checked;
        const shouldRandomizeAnswers = document.getElementById('randomize-answers')?.checked;
        const sameTimeForAll = document.getElementById('same-time-all')?.checked;
        const questionTime = parseInt(document.getElementById('default-time')?.value) || 30;
        const manualAdvancement = document.getElementById('manual-advancement')?.checked;

        // Process questions
        let processedQuestions = [...questions];

        if (randomizeQuestions) {
            processedQuestions = shuffleArray(processedQuestions);
        }

        if (shouldRandomizeAnswers) {
            processedQuestions = randomizeAnswers(processedQuestions);
        }

        // Apply same time for all questions if selected
        if (sameTimeForAll) {
            processedQuestions.forEach(q => {
                q.time = questionTime;
            });
        }

        const quizData = {
            quiz: {
                title,
                questions: processedQuestions,
                manualAdvancement,
                randomizeQuestions,
                randomizeAnswers: shouldRandomizeAnswers,
                sameTimeForAll,
                questionTime
            }
        };

        // Create game through socket
        logger.debug('About to call createGame with data:', quizData);
        try {
            this.socketManager.createGame(quizData);
            logger.debug('createGame call completed successfully');
        } catch (error) {
            logger.error('Error calling createGame:', error);
        }
    }

    /**
     * Join a game
     */
    joinGame() {
        const pin = document.getElementById('game-pin-input')?.value?.trim();
        const name = document.getElementById('player-name')?.value?.trim();

        if (!pin || !name) {
            showErrorAlert('please_enter_pin_and_name');
            return;
        }

        if (pin.length !== 6 || !/^\d+$/.test(pin)) {
            showErrorAlert('pin_must_be_six_digits');
            return;
        }

        if (name.length > LIMITS.MAX_PLAYER_NAME_LENGTH) {
            showErrorAlert('name_max_twenty_chars');
            return;
        }

        if (!this.socketManager.isConnected()) {
            showErrorAlert('not_connected_refresh');
            return;
        }

        this.socketManager.joinGame(pin, name);
    }

    /**
     * Join game by PIN (called from game browser)
     */
    joinGameByPin(pin) {
        this.uiManager.joinGameByPin(pin);
    }

    /**
     * Start the game
     */
    startGame() {
        this.socketManager.startGame();
    }

    /**
     * Request next question (manual advancement)
     */
    nextQuestion() {
        logger.debug('CLIENT: Next Question button clicked!');

        // Debounce to prevent double calls
        if (this.nextQuestionCalled) {
            logger.debug('CLIENT: Debounced - ignoring click');
            return;
        }
        this.nextQuestionCalled = true;

        setTimeout(() => {
            this.nextQuestionCalled = false;
        }, TIMING.DEBOUNCE_DELAY);

        logger.debug('CLIENT: Calling socketManager.nextQuestion()');
        this.socketManager.nextQuestion();
    }

    /**
     * Reset game and return to main menu (shared logic for newGame and exitToMainMenu)
     */
    resetAndReturnToMenu() {
        this.gameManager.resetGameState();

        if (this.gameManager.timer) {
            clearInterval(this.gameManager.timer);
            this.gameManager.timer = null;
        }

        this.uiManager.showScreen('main-menu');
    }

    /**
     * Start a new game
     */
    newGame() {
        try {
            logger.debug('New Game - resetting and returning to main menu');
            this.resetAndReturnToMenu();
        } catch (error) {
            logger.error('Error in newGame():', error);
            // Fallback - try to at least show main menu
            try {
                this.uiManager.showScreen('main-menu');
            } catch (fallbackError) {
                logger.error('Fallback showScreen also failed:', fallbackError);
            }
        }
    }

    /**
     * Exit current game and return to main menu
     */
    exitToMainMenu() {
        this.resetAndReturnToMenu();
        logger.debug('Exited game and returned to main menu');
    }

    /**
     * Show quiz preview modal
     */
    showQuizPreview() {
        const questions = this.quizManager.collectQuestions();
        if (questions.length === 0) {
            showErrorAlert('please_add_one_question');
            return;
        }

        const modal = document.getElementById('preview-modal');
        const previewContainer = document.getElementById('quiz-preview-container');

        if (!modal || !previewContainer) return;

        previewContainer.innerHTML = '';

        questions.forEach((question, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'preview-question';

            let questionHTML = `
                <h3>${translationManager.getTranslationSync('question')} ${index + 1}</h3>
                <div class="preview-question-text">${this.mathRenderer.formatCodeBlocks(question.question)}</div>
                <div class="preview-question-meta">
                    <span>${translationManager.getTranslationSync('type')}: ${translationManager.getTranslationSync(question.type)}</span>
                    <span>${translationManager.getTranslationSync('time')}: ${question.time}s</span>
                </div>
            `;

            if (question.type === 'multiple-choice' || question.type === 'multiple-correct') {
                questionHTML += '<div class="preview-options">';
                question.options.forEach((option, optIndex) => {
                    const isCorrect = question.type === 'multiple-choice' ?
                        optIndex === question.correctAnswer :
                        question.correctAnswers?.includes(optIndex);

                    questionHTML += `
                        <div class="preview-option ${isCorrect ? 'correct' : ''}">
                            ${String.fromCharCode(65 + optIndex)}. ${this.mathRenderer.formatCodeBlocks(option)}
                        </div>
                    `;
                });
                questionHTML += '</div>';
            } else if (question.type === 'true-false') {
                questionHTML += `
                    <div class="preview-options">
                        <div class="preview-option ${question.correctAnswer === true ? 'correct' : ''}">A. ${translationManager.getTranslationSync('true')}</div>
                        <div class="preview-option ${question.correctAnswer === false ? 'correct' : ''}">B. ${translationManager.getTranslationSync('false')}</div>
                    </div>
                `;
            } else if (question.type === 'numeric') {
                questionHTML += `
                    <div class="preview-answer">
                        ${translationManager.getTranslationSync('correct_answer')}: ${question.correctAnswer}
                        ${question.tolerance ? ` (±${question.tolerance})` : ''}
                    </div>
                `;
            }

            questionDiv.innerHTML = questionHTML;
            previewContainer.appendChild(questionDiv);
        });

        // Render math in preview
        this.mathRenderer.renderMathJax(previewContainer);

        modal.style.display = 'flex';
    }

    /**
     * Hide quiz preview modal
     */
    hideQuizPreview() {
        const modal = document.getElementById('preview-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Initialize toolbar
     */
    initializeToolbar() {
        const toolbarButtons = [
            { id: 'toolbar-add-question', handler: () => this.addQuestionAndScrollToIt() },
            { id: 'toolbar-save', handler: () => this.quizManager.saveQuiz() },
            { id: 'toolbar-load', handler: () => this.quizManager.showLoadQuizModal() },
            { id: 'toolbar-preview', handler: () => this.togglePreviewMode() },
            { id: 'toolbar-ai-gen', handler: () => this.openAIGeneratorModal() },
            { id: 'toolbar-import', handler: () => this.quizManager.importQuiz() },
            { id: 'toolbar-export', handler: () => this.quizManager.exportQuiz() },
            { id: 'toolbar-results', handler: () => this.openResultsViewer() },
            { id: 'toolbar-top', handler: () => this.scrollToTop() },
            { id: 'toolbar-bottom', handler: () => this.scrollToBottom() }
        ];

        toolbarButtons.forEach(({ id, handler }) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', handler);
                logger.debug(`Connected toolbar button: ${id}`);
            } else {
                logger.warn(`Toolbar button not found: ${id}`);
            }
        });
    }

    /**
     * Show screen (wrapper for UI manager)
     */
    showScreen(screenId) {
        this.uiManager.showScreen(screenId);
    }

    /**
     * Load quiz (wrapper for quiz manager)
     */
    loadQuiz(filename) {
        this.quizManager.loadQuiz(filename);
    }

    /**
     * Start practice mode with a quiz
     * @param {string} filename - Quiz filename to practice
     */
    async startPracticeMode(filename) {
        logger.debug('Starting practice mode for:', filename);

        // Close the load quiz modal
        this.quizManager.hideLoadQuizModal();

        // Start practice mode
        const success = await this.practiceModeManager.startPracticeMode(filename);
        if (!success) {
            toastNotifications.show(
                translationManager.getTranslationSync('failed_start_practice') || 'Failed to start practice mode',
                'error'
            );
        }
    }

    /**
     * Quick debug: Load preset quiz and start game immediately
     */
    async loadLastQuiz() {
        try {
            logger.debug('Loading quiz for game startup...');

            // First check if we can fetch the quiz list
            const response = await fetch(APIHelper.getApiUrl('api/quizzes'));
            if (!response.ok) {
                throw new Error(`Failed to fetch quizzes: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            logger.debug('Available quizzes:', data?.length || 0);

            // Look for debug quiz first
            const debugQuizFilename = 'debug-width-quiz.json';
            const debugQuiz = data?.find(q => q.filename === debugQuizFilename);

            let targetQuiz = null;
            if (debugQuiz) {
                logger.debug('Found debug quiz:', debugQuiz.title);
                targetQuiz = debugQuiz;
            } else if (data && data.length > 0) {
                logger.debug('Debug quiz not found, using first available quiz');
                targetQuiz = data[0];
            } else {
                throw new Error('No quizzes available');
            }

            logger.debug('Loading quiz for debug:', targetQuiz.title);

            // Load the quiz
            await this.quizManager.loadQuiz(targetQuiz.filename);

            // Wait for quiz to load, then start the game
            setTimeout(() => {
                try {
                    logger.debug('🐛 DEBUG: Auto-starting quiz...');
                    this.startHosting();

                    // Add debugging after game starts
                    setTimeout(() => {
                        try {
                            // Game startup analysis complete
                        } catch (debugError) {
                            logger.error('Debug analysis failed:', debugError);
                        }
                    }, TIMING.GAME_START_DELAY); // Wait for game to fully start

                } catch (startError) {
                    logger.error('Failed to start game:', startError);
                }
            }, TIMING.GAME_START_DELAY);

        } catch (error) {
            logger.error('🐛 DEBUG: Error in loadLastQuiz:', error);

            // Show user-friendly error
            const errorModal = document.getElementById('error-modal');
            if (errorModal) {
                const errorMessage = document.getElementById('error-message');
                if (errorMessage) {
                    errorMessage.textContent = `Debug function failed: ${error.message}. Please check the console for details.`;
                }
                errorModal.style.display = 'flex';
            } else {
                alert(`Debug function failed: ${error.message}`);
            }
        }
    }

    /**
     * Debug function to analyze question width styles
     */


    /**
     * Load quiz directly as fallback
     */
    async loadQuizDirectly() {
        try {
            logger.debug('Using direct quiz loading fallback');
            const filename = 'advanced_quiz_with_latex_images.json';
            this.quizManager.loadQuiz(filename);

            toastNotifications.info('Debug: Loading LaTeX quiz - starting in 2 seconds...');

            setTimeout(() => {
                logger.debug('Auto-starting quiz via fallback method...');
                this.startHosting();
            }, TIMING.GAME_START_DELAY);
        } catch (error) {
            logger.error('Fallback quiz loading failed:', error);
            translationManager.showAlert('error', 'Debug function failed');
        }
    }

    /**
     * Load default LaTeX quiz for debugging
     */
    async loadDefaultLatexQuiz() {
        try {
            logger.debug('Loading default LaTeX quiz for debugging');

            // Try to load the advanced LaTeX quiz file directly
            const filename = 'advanced_quiz_with_latex_images.json';
            logger.debug('Attempting to load:', filename);

            const response = await fetch(APIHelper.getApiUrl(`api/quiz/${filename}`));
            if (!response.ok) {
                throw new Error(`Failed to load quiz: ${response.status}`);
            }

            const quizData = await response.json();
            logger.debug('Loaded quiz data:', quizData);

            if (quizData && quizData.quiz) {
                // Use the quiz manager to populate the form
                this.quizManager.populateQuizForm(quizData.quiz);

                toastNotifications.info(`Debug: Loaded "${quizData.quiz.title}" - starting game...`);

                // Wait for form to populate, then start game
                setTimeout(() => {
                    logger.debug('Auto-starting loaded LaTeX quiz...');
                    this.startHosting();
                }, 1500);
            } else {
                throw new Error('Invalid quiz data format');
            }
        } catch (error) {
            logger.error('Failed to load default LaTeX quiz:', error);
            translationManager.showAlert('error', 'Failed to load LaTeX quiz for debugging');
        }
    }

    /**
     * Get socket connection status
     */
    isConnected() {
        return this.socketManager.isConnected();
    }

    /**
     * Get current theme
     */
    getCurrentTheme() {
        return this.settingsManager.getSetting('theme');
    }

    /**
     * Get sound enabled status - delegates to SettingsManager which reads from SoundManager
     */
    isSoundEnabled() {
        return this.settingsManager.getSoundEnabled();
    }

    /**
     * Open AI Generator Modal
     */
    async openAIGeneratorModal() {
        logger.info('Opening AI Generator Modal');

        // Lazy load AI generator if not already loaded
        if (!this.aiGenerator) {
            try {
                logger.debug('Lazy loading AI Generator...');
                const { AIQuestionGenerator } = await import('../ai/generator.js');
                this.aiGenerator = new AIQuestionGenerator();

                // Initialize event listeners after creation
                if (this.aiGenerator.initializeEventListeners) {
                    this.aiGenerator.initializeEventListeners();
                    logger.debug('AI Generator lazy loaded and initialized');
                }
            } catch (error) {
                logger.error('Failed to lazy load AI Generator:', error);
                // Show fallback modal if available
                const modal = document.getElementById('ai-generator-modal');
                if (modal) {
                    modal.style.display = 'flex';
                }
                return;
            }
        }

        // Use the AI generator's openModal method if available
        if (this.aiGenerator && this.aiGenerator.openModal) {
            this.aiGenerator.openModal();
            logger.debug('AI Generator modal opened via class method');
        } else {
            // Fallback: open modal directly
            logger.warn('AI Generator class method not available, using fallback');
            const modal = document.getElementById('ai-generator-modal');
            if (modal) {
                modal.style.display = 'flex';
                logger.debug('AI Generator modal opened via fallback');
            } else {
                logger.error('AI Generator modal not found in DOM');
            }
        }
    }

    /**
     * Open Results Viewer with lazy loading
     */
    async openResultsViewer() {
        logger.info('Opening Results Viewer');

        try {
            // Lazy load results viewer if not already loaded
            if (!window.resultsViewer) {
                logger.debug('Lazy loading Results Viewer...');
                const { resultsViewer } = await import('../utils/results-viewer.js');
                window.resultsViewer = resultsViewer;
                logger.debug('Results Viewer lazy loaded and available globally');
            }

            // Open the results viewer modal
            window.resultsViewer.showModal();
            logger.debug('Results Viewer modal opened');

        } catch (error) {
            logger.error('Failed to lazy load Results Viewer:', error);
            // Show fallback error message
            translationManager.showAlert('results_viewer_failed');
        }
    }

    /**
     * Update game translations when language changes
     */
    updateGameTranslations() {
        // Helper to update question counter elements with new translations
        const updateQuestionCounter = (elementId) => {
            const element = document.getElementById(elementId);
            if (!element?.textContent.trim()) return;

            const match = element.textContent.match(/(\d+).*?(\d+)/);
            if (match) {
                element.textContent = createQuestionCounter(match[1], match[2]);
            }
        };

        // Update all question counter elements
        ['question-counter', 'player-question-counter', 'preview-question-counter', 'preview-question-counter-display']
            .forEach(updateQuestionCounter);

        // Update player info if visible
        const playerInfo = document.getElementById('player-info');
        if (playerInfo && this.gameManager.playerName) {
            playerInfo.textContent = `${translationManager.getTranslationSync('welcome')}, ${this.gameManager.playerName}!`;
        }
    }

    /**
     * Toggle preview mode (connected to PreviewManager)
     */
    togglePreviewMode() {
        logger.debug('Toggle preview mode called');
        if (this.previewManager) {
            this.previewManager.togglePreviewMode();
        } else {
            logger.debug('PreviewManager not available');
        }
    }

    /**
     * Fallback theme toggle
     */
    toggleTheme() {
        logger.info('Fallback theme toggle called');
        const body = document.body;
        const themeToggle = document.getElementById('theme-toggle');

        const currentTheme = body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        body.setAttribute('data-theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        if (themeToggle) {
            // Show current state (consistent with SettingsManager)
            themeToggle.textContent = newTheme === 'dark' ? '🌙' : '☀️';
        }
        // Save to quizSettings format for consistency with SettingsManager
        const savedSettings = getJSON('quizSettings', {});
        savedSettings.theme = newTheme;
        setJSON('quizSettings', savedSettings);
        logger.debug('Theme switched to:', newTheme);
    }

    /**
     * Fallback fullscreen toggle
     */
    toggleFullscreen() {
        logger.info('Fallback fullscreen toggle called');
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(err => {
                    logger.warn('Could not exit fullscreen:', err);
                });
            } else {
                document.documentElement.requestFullscreen().catch(err => {
                    logger.warn('Could not enter fullscreen:', err);
                });
            }
        } catch (error) {
            logger.warn('Fullscreen not supported or not allowed:', error);
        }
    }

    /**
     * Scroll to top (wrapper for global function)
     */
    scrollToTop() {
        if (window.scrollToTop) {
            window.scrollToTop();
        }
    }

    /**
     * Scroll to bottom
     */
    scrollToBottom() {
        logger.info('Scroll to bottom function called');
        const hostContainer = document.querySelector('.host-container');
        const quizEditor = document.querySelector('.quiz-editor-section');
        const isPreviewMode = hostContainer && hostContainer.classList.contains('split-screen');

        logger.debug('Preview mode:', isPreviewMode);

        if (quizEditor) {
            logger.debug('Quiz editor found, scrollHeight:', quizEditor.scrollHeight, 'clientHeight:', quizEditor.clientHeight);

            if (isPreviewMode) {
                // In split-screen mode, scroll the editor section directly
                logger.debug('Scrolling editor section in split-screen mode');
                quizEditor.scrollTo({ top: quizEditor.scrollHeight, behavior: 'smooth' });
            } else {
                // In single-screen mode, need to scroll the main container or window
                logger.debug('Scrolling in single-screen mode');

                // Try scrolling the host container first
                if (hostContainer && hostContainer.scrollHeight > hostContainer.clientHeight) {
                    logger.debug('Scrolling host container');
                    hostContainer.scrollTo({ top: hostContainer.scrollHeight, behavior: 'smooth' });
                } else {
                    // Fallback to window scroll
                    logger.debug('Scrolling window');
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                }

                // Also try scrolling the editor section itself in case it's scrollable
                if (quizEditor.scrollHeight > quizEditor.clientHeight) {
                    logger.debug('Also scrolling editor section');
                    quizEditor.scrollTo({ top: quizEditor.scrollHeight, behavior: 'smooth' });
                }
            }
        } else {
            logger.warn('Editor section not found, using window scroll');
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
    }

    // Test logger system removed - logger working correctly

    /**
     * Set default player name
     */
    setDefaultPlayerName() {
        const playerNameInput = document.getElementById('player-name');
        if (playerNameInput && !playerNameInput.value) {
            // Generate a random player number between 1-999
            const playerNumber = Math.floor(Math.random() * LIMITS.MAX_PLAYER_NUMBER) + 1;
            const defaultName = `Player${playerNumber}`;
            playerNameInput.value = defaultName;
        }
    }

    /**
     * Cleanup method for proper resource management
     */
    cleanup() {
        logger.debug('QuizGame cleanup started');

        // Abort all document-level event listeners
        if (this.abortController) {
            this.abortController.abort();
            logger.debug('AbortController aborted - document listeners removed');
        }

        // Disable auto-hide toolbar if active
        if (isAutoHideToolbarActive()) {
            disableAutoHideToolbar();
            logger.debug('Auto-hide toolbar disabled during cleanup');
        }

        // Clear any timers or intervals if needed
        if (this.gameManager && this.gameManager.timer) {
            clearInterval(this.gameManager.timer);
            this.gameManager.timer = null;
        }

        logger.debug('QuizGame cleanup completed');
    }
}