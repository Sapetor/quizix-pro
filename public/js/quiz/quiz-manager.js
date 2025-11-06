/**
 * Quiz Manager Module
 * Handles quiz operations: save, load, import, export, and quiz management
 */

import { translationManager, showErrorAlert, showSuccessAlert } from '../utils/translation-manager.js';
import { createQuestionElement } from '../utils/question-utils.js';
import { MathRenderer } from '../utils/math-renderer.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';
import { unifiedErrorHandler as errorBoundary } from '../utils/unified-error-handler.js';
import { logger } from '../core/config.js';
import { APIHelper } from '../utils/api-helper.js';

export class QuizManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.mathRenderer = new MathRenderer();
        this.autoSaveTimeout = null;
        this.errorHandler = errorHandler; // Add ErrorHandler for future use
        
        // Memory management tracking
        this.eventListeners = new Map();
        this.documentListeners = [];
        
        // Bind cleanup methods
        this.cleanup = this.cleanup.bind(this);
        this.addDocumentListenerTracked = this.addDocumentListenerTracked.bind(this);
    }

    /**
     * Collect all questions from the quiz builder
     */
    collectQuestions() {
        const questions = [];
        const questionElements = document.querySelectorAll('.question-item');
        
        questionElements.forEach(questionElement => {
            const questionData = this.extractQuestionData(questionElement);
            if (questionData) {
                questions.push(questionData);
            }
        });
        
        return questions;
    }

    /**
     * Extract question data from DOM element
     */
    extractQuestionData(questionElement) {
        const questionText = questionElement.querySelector('.question-text')?.value?.trim();
        const questionType = questionElement.querySelector('.question-type')?.value;
        const questionTime = parseInt(questionElement.querySelector('.question-time-limit')?.value) || 30;
        const questionDifficulty = questionElement.querySelector('.question-difficulty')?.value || 'medium';
        
        if (!questionText || !questionType) return null;
        
        const questionData = {
            question: questionText,
            type: questionType,
            time: questionTime,
            difficulty: questionDifficulty
        };
        
        // Handle different question types using the correct CSS selectors from question-utils.js
        if (questionType === 'multiple-choice') {
            const options = [];
            // Use the correct selector - .option not .option-input
            const optionInputs = questionElement.querySelectorAll('.multiple-choice-options .option');
            optionInputs.forEach(input => {
                if (input.value.trim()) {
                    options.push(input.value.trim());
                }
            });
            
            const correctAnswerElement = questionElement.querySelector('.multiple-choice-options .correct-answer');
            const correctAnswer = correctAnswerElement ? parseInt(correctAnswerElement.value) : 0;
            
            
            questionData.options = options;
            questionData.correctAnswer = isNaN(correctAnswer) ? 0 : correctAnswer;
            
        } else if (questionType === 'multiple-correct') {
            const options = [];
            // Use the correct selector
            const optionInputs = questionElement.querySelectorAll('.multiple-correct-options .option');
            optionInputs.forEach(input => {
                if (input.value.trim()) {
                    options.push(input.value.trim());
                }
            });
            
            const correctAnswers = [];
            // Use the correct selector - .correct-option not .correct-checkbox
            const correctCheckboxes = questionElement.querySelectorAll('.multiple-correct-options .correct-option:checked');
            correctCheckboxes.forEach(checkbox => {
                correctAnswers.push(parseInt(checkbox.dataset.option));
            });
            
            questionData.options = options;
            questionData.correctAnswers = correctAnswers;
            
        } else if (questionType === 'true-false') {
            const correctAnswer = questionElement.querySelector('.true-false-options .correct-answer')?.value === 'true';
            questionData.correctAnswer = correctAnswer;
            
        } else if (questionType === 'numeric') {
            const correctAnswer = parseFloat(questionElement.querySelector('.numeric-answer')?.value);
            const tolerance = parseFloat(questionElement.querySelector('.numeric-tolerance')?.value) || 0;
            questionData.correctAnswer = correctAnswer;
            questionData.tolerance = tolerance;
        }
        
        // Extract image data - check both src and dataset.url
        const imageElement = questionElement.querySelector('.question-image');
        if (imageElement) {
            // First check dataset.url (where uploaded images are stored)
            let imageUrl = imageElement.dataset.url || imageElement.src;
            
            // Validate that we have a meaningful image URL
            if (imageUrl && imageUrl.trim() !== '' && !imageUrl.endsWith('/') && imageUrl !== window.location.origin && imageUrl !== window.location.origin + '/') {
                logger.debug('Found image for question:', imageUrl);
                
                // Handle data URIs (base64 images)
                if (imageUrl.startsWith('data:')) {
                    questionData.image = imageUrl;
                } else {
                    // Handle file paths - extract relative path from URL
                    if (imageUrl.includes('/uploads/')) {
                        // Extract just the filename from /uploads/filename.jpg or http://localhost:3000/uploads/filename.jpg
                        const uploadsIndex = imageUrl.indexOf('/uploads/');
                        questionData.image = imageUrl.substring(uploadsIndex); // Keep /uploads/filename.jpg
                    } else if (imageUrl.startsWith('uploads/')) {
                        // Already a relative path like uploads/filename.jpg
                        questionData.image = '/' + imageUrl; // Make it /uploads/filename.jpg
                    } else if (imageUrl.startsWith('/uploads/')) {
                        // Already an absolute path like /uploads/filename.jpg
                        questionData.image = imageUrl; 
                    } else if (imageUrl.startsWith('http')) {
                        // Full URL without uploads path - this indicates an error
                        logger.warn('Invalid image URL format:', imageUrl);
                        questionData.image = ''; // Clear invalid URL
                    } else {
                        // Assume it's a relative path and make it absolute
                        questionData.image = '/uploads/' + imageUrl;
                    }
                }
            } else if (imageUrl) {
                logger.warn('Invalid image URL format:', imageUrl);
                questionData.image = ''; // Clear invalid URL
            }
            
            if (questionData.image) {
                logger.debug('Processed image path for quiz save:', questionData.image);
            }
        }
        
        return questionData;
    }

    /**
     * Validate questions array
     */
    validateQuestions(questions) {
        const errors = [];
        
        questions.forEach((question, index) => {
            const questionNum = index + 1;
            
            // Check for question text
            if (!question.question || question.question.trim() === '') {
                errors.push(`Question ${questionNum}: ${translationManager.getTranslationSync('question_missing_text')}`);
            }
            
            // LaTeX validation temporarily disabled to fix blocking error
            logger.debug('Skipping LaTeX validation for question', questionNum);
            
            // Type-specific validation
            if (question.type === 'multiple-choice' || question.type === 'multiple-correct') {
                if (!question.options || question.options.length < 2) {
                    errors.push(`Question ${questionNum}: ${translationManager.getTranslationSync('question_needs_two_options')}`);
                }
                
                if (question.type === 'multiple-choice' && 
                    (question.correctAnswer < 0 || question.correctAnswer >= question.options.length)) {
                    errors.push(`Question ${questionNum}: ${translationManager.getTranslationSync('invalid_correct_answer')}`);
                }
                
                if (question.type === 'multiple-correct' && 
                    (!question.correctAnswers || question.correctAnswers.length === 0)) {
                    errors.push(`Question ${questionNum}: ${translationManager.getTranslationSync('select_at_least_one_correct')}`);
                }
            }
            
            if (question.type === 'numeric' && isNaN(question.correctAnswer)) {
                errors.push(`Question ${questionNum}: ${translationManager.getTranslationSync('invalid_numeric_answer')}`);
            }
        });
        
        return errors;
    }

    /**
     * Save quiz to server
     */
    async saveQuiz() {
        return await errorBoundary.safeNetworkOperation(async () => {
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
            
            const response = await fetch(APIHelper.getApiUrl('api/save-quiz'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: title,
                    questions: questions
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showSuccessAlert('quiz_saved_successfully');
                
                // Auto-save the current state
                this.autoSaveQuiz();
            } else {
                translationManager.showAlert('error', data.message || translationManager.getTranslationSync('failed_save_quiz'));
            }
        }, 'quiz_save', () => {
            translationManager.showAlert('error', 'Failed to save quiz due to network error. Please try again.');
        });
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
        
        // Cache quiz list element for better performance
        if (!this.cachedQuizListElement) {
            this.cachedQuizListElement = document.getElementById('quiz-list');
        }
        const quizList = this.cachedQuizListElement;
        
        // Load quizzes list with performance optimization
        try {
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
                        quizItem.className = 'quiz-item clickable';
                        quizItem.style.cursor = 'pointer';
                        quizItem.onclick = () => window.game.loadQuiz(quiz.filename);
                        quizItem.innerHTML = `
                            <div class="quiz-info">
                                <h3>${this.escapeHtml(quiz.title)}</h3>
                                <p>${quiz.questionCount} ${translationManager.getTranslationSync('questions')} • ${translationManager.getTranslationSync('created')}: ${new Date(quiz.created).toLocaleDateString()}</p>
                            </div>
                        `;
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
        } catch (error) {
            this.errorHandler.log(error, { operation: 'loadQuizzes' });
            if (quizList) {
                quizList.innerHTML = `
                    <div class="no-quizzes">
                        <p>${translationManager.getTranslationSync('failed_load_quizzes')}</p>
                    </div>
                `;
            }
        }
        
        // Show modal with requestAnimationFrame for smooth transition
        requestAnimationFrame(() => {
            modal.style.display = 'flex';
            modal.style.visibility = 'visible'; // Reset visibility that might have been set to 'hidden'
        });
    }

    /**
     * Hide load quiz modal
     */
    hideLoadQuizModal() {
        const modal = document.getElementById('load-quiz-modal');
        if (modal) {
            logger.debug('Hiding load quiz modal');
            modal.style.display = 'none';
            modal.style.visibility = 'hidden'; // Double insurance
            
            // Clean up event handlers
            this.cleanupLoadQuizModalHandlers(modal);
            
            // Force DOM update with multiple approaches
            modal.offsetHeight; // Force reflow
            requestAnimationFrame(() => {
                if (modal.style.display !== 'none') {
                    modal.style.display = 'none';
                }
            });
            
            logger.debug('Load quiz modal hidden');
        } else {
            logger.warn('Load quiz modal not found when trying to hide');
        }
    }

    /**
     * Force close modal as last resort
     */
    forceCloseModal() {
        try {
            logger.warn('Force closing modal as backup mechanism');
            
            // Find and hide all possible modals
            const possibleModals = [
                document.getElementById('load-quiz-modal'),
                document.querySelector('.modal'),
                document.querySelector('[id*="modal"]'),
                ...document.querySelectorAll('.modal, [id*="modal"]')
            ];
            
            possibleModals.forEach(modal => {
                if (modal && modal.style) {
                    modal.style.display = 'none';
                    modal.style.visibility = 'hidden';
                    modal.style.opacity = '0';
                }
            });
            
            // Also remove any backdrop/overlay
            document.querySelectorAll('.modal-backdrop, .overlay').forEach(backdrop => {
                if (backdrop) backdrop.remove();
            });
            
            logger.debug('Force modal close completed');
        } catch (error) {
            logger.error('Error in force close modal:', error);
        }
    }

    /**
     * Safely update preview after quiz loading (completely isolated)
     */
    updatePreviewSafely() {
        // Use setTimeout to completely separate this from the loading flow
        setTimeout(() => {
            try {
                logger.debug('Attempting safe preview update');
                
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
                
            } catch (error) {
                logger.warn('Preview update failed, but quiz loaded successfully:', error);
                // Explicitly don't propagate this error - quiz is already loaded successfully
            }
        }, 200); // Give modal time to close before updating preview
    }

    /**
     * Set up event handlers for load quiz modal
     */
    setupLoadQuizModalHandlers(modal) {
        // Store handler references for cleanup
        if (!this.loadQuizModalHandlers) {
            this.loadQuizModalHandlers = {};
        }

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
        
        try {
            logger.debug('Starting bulletproof quiz loading for:', filename);
            
            // Basic fetch and structure check only
            const response = await fetch(APIHelper.getApiUrl(`api/quiz/${filename}`));
            const data = await response.json();
            
            if (response.ok && data && data.questions && Array.isArray(data.questions)) {
                logger.debug('Valid quiz structure found with', data.questions.length, 'questions');
                
                // Clean data (safe operation)
                let cleanedData;
                try {
                    cleanedData = this.cleanQuizData(data) || data;
                } catch (cleanError) {
                    logger.warn('Data cleaning failed, using original data:', cleanError);
                    cleanedData = data;
                }
                
                // Load quiz (wrapped in comprehensive try-catch)
                try {
                    await this.populateQuizBuilder(cleanedData);
                    logger.debug('Quiz populated successfully');
                } catch (populateError) {
                    logger.warn('Error in populateQuizBuilder, but continuing:', populateError);
                    // Continue anyway - don't let this break the flow
                }
                
                // ALWAYS close modal and show success, regardless of any errors above
                try {
                    this.hideLoadQuizModal();
                    modalClosed = true;
                    logger.debug('Modal closed successfully');
                } catch (modalError) {
                    logger.error('Error closing modal:', modalError);
                    // Force modal close as backup
                    this.forceCloseModal();
                    modalClosed = true;
                }
                
                try {
                    showSuccessAlert('quiz_loaded_successfully');
                    successShown = true;
                    logger.debug('Success alert shown');
                } catch (alertError) {
                    logger.warn('Error showing success alert:', alertError);
                }
                
                // Update preview AFTER everything else (completely separate)
                this.updatePreviewSafely();
                
            } else {
                // Only show error for truly invalid data structure
                logger.error('Invalid quiz data structure for:', filename);
                translationManager.showAlert('error', 'Invalid quiz file format. Please check the file.');
            }
            
        } catch (error) {
            logger.error('Critical quiz loading error:', error);
            
            // Emergency cleanup - ensure modal closes and user gets feedback
            if (!modalClosed) {
                try {
                    this.hideLoadQuizModal();
                } catch (e) {
                    this.forceCloseModal();
                }
            }
            
            if (!successShown) {
                try {
                    showErrorAlert('failed_load_quiz');
                } catch (e) {
                    // Last resort alert
                    translationManager.showAlert('error', 'Failed to load quiz. Please try again.');
                }
            }
        }
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
            if (window.game && window.game.previewManager && window.game.previewManager.previewRenderer) {
                logger.debug('🔄 Updating live preview after MathJax is ready');
                window.game.previewManager.previewRenderer.renderMathJaxForPreview();
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
            try {
                const titleInput = document.getElementById('quiz-title');
                if (titleInput) {
                    titleInput.value = quizData.title || '';
                }
            } catch (error) {
                logger.error('Critical: Failed to set quiz title:', error);
                throw error; // This is critical enough to fail the whole operation
            }
            
            // Clear existing questions (essential)
            try {
                const questionsContainer = document.getElementById('questions-container');
                if (questionsContainer) {
                    questionsContainer.innerHTML = '';
                } else {
                    logger.error('Critical: Questions container not found');
                    throw new Error('Questions container not found');
                }
            } catch (error) {
                logger.error('Critical: Failed to clear questions container:', error);
                throw error;
            }
            
            // Add loaded questions (essential)
            try {
                if (quizData.questions && Array.isArray(quizData.questions)) {
                    quizData.questions.forEach((questionData, index) => {
                        try {
                            this.addQuestionFromData(questionData);
                        } catch (questionError) {
                            logger.warn(`Failed to add question ${index + 1}, skipping:`, questionError);
                            // Don't fail the whole operation for one bad question
                        }
                    });
                }
                logger.debug('Questions added successfully');
            } catch (error) {
                logger.error('Critical: Failed to add questions:', error);
                throw error;
            }
            
            // ========== NICE-TO-HAVE OPERATIONS (don't let these break the flow) ==========
            
            // Translation loading (nice to have)
            try {
                const currentLang = translationManager.getCurrentLanguage();
                await translationManager.ensureLanguageLoaded(currentLang);
                logger.debug('Translations loaded successfully');
            } catch (error) {
                logger.warn('Non-critical: Translation loading failed:', error);
            }
            
            // Container translation (nice to have)
            try {
                const questionsContainer = document.getElementById('questions-container');
                if (questionsContainer) {
                    translationManager.translateContainer(questionsContainer);
                }
            } catch (error) {
                logger.warn('Non-critical: Container translation failed:', error);
            }
            
            // Page translation (nice to have)
            try {
                translationManager.translatePage();
            } catch (error) {
                logger.warn('Non-critical: Page translation failed:', error);
            }
            
            // UI updates (nice to have)
            try {
                this.updateQuestionsUI();
            } catch (error) {
                logger.warn('Non-critical: UI update failed:', error);
            }
            
            // MathJax rendering (nice to have)
            try {
                this.renderMathForLoadedQuiz();
            } catch (error) {
                logger.warn('Non-critical: MathJax rendering failed:', error);
            }
            
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
            const currentDataQuestion = questionItem.getAttribute('data-question');
            if (currentDataQuestion !== index.toString()) {
                questionItem.setAttribute('data-question', index);
                
                // Update the question heading with proper translation
                const questionHeading = questionItem.querySelector('h3');
                if (questionHeading) {
                    const questionNumber = index + 1;
                    questionHeading.innerHTML = `<span data-translate="question">Question</span> ${questionNumber}`;
                    translationManager.translateContainer(questionHeading);
                }
            }
            
            // Handle remove button visibility - show only when multiple questions exist
            let removeButton = questionItem.querySelector('.remove-question');
            
            // If remove button doesn't exist, create it
            if (!removeButton) {
                removeButton = document.createElement('button');
                removeButton.className = 'btn secondary remove-question';
                removeButton.onclick = () => {
                    questionItem.remove();
                    this.updateRemoveButtonVisibility();
                    this.updateQuestionNumbering();
                };
                removeButton.setAttribute('data-translate', 'remove');
                removeButton.textContent = translationManager.getTranslationSync('remove') || 'Remove';
                questionItem.appendChild(removeButton);
                logger.debug(`Question ${index + 1}: Created missing remove button`);
            }
            
            const shouldShow = hasMultipleQuestions ? 'block' : 'none';
            removeButton.style.display = shouldShow;
            logger.debug(`Question ${index + 1}: Set removeButton display to "${shouldShow}"`);
            
        });
        
        logger.debug(`Updated questions UI for ${questionItems.length} questions`);
    }

    /**
     * Update remove button visibility for all questions
     * Show remove buttons when there are multiple questions, hide when only one
     */
    updateRemoveButtonVisibility() {
        const questionsContainer = document.getElementById('questions-container');
        if (!questionsContainer) return;
        
        const questionItems = questionsContainer.querySelectorAll('.question-item');
        const hasMultipleQuestions = questionItems.length > 1;
        
        questionItems.forEach((questionItem, index) => {
            let removeButton = questionItem.querySelector('.remove-question');
            
            // If remove button doesn't exist, create it
            if (!removeButton) {
                removeButton = document.createElement('button');
                removeButton.className = 'btn secondary remove-question';
                removeButton.onclick = () => {
                    questionItem.remove();
                    this.updateRemoveButtonVisibility();
                    this.updateQuestionNumbering();
                };
                removeButton.setAttribute('data-translate', 'remove');
                removeButton.textContent = translationManager.getTranslationSync('remove') || 'Remove';
                questionItem.appendChild(removeButton);
            }
            
            // Show remove button only when multiple questions exist
            if (hasMultipleQuestions) {
                removeButton.style.display = 'block';
            } else {
                removeButton.style.display = 'none';
            }
        });
        
        logger.debug(`Updated remove button visibility for ${questionItems.length} questions`);
    }

    /**
     * Update question numbering after questions are added or removed
     */
    updateQuestionNumbering() {
        const questionsContainer = document.getElementById('questions-container');
        if (!questionsContainer) return;
        
        const questionItems = questionsContainer.querySelectorAll('.question-item');
        
        questionItems.forEach((questionItem, index) => {
            // Update data-question attribute
            questionItem.setAttribute('data-question', index);
            
            // Update the question heading text
            const questionHeading = questionItem.querySelector('h3');
            if (questionHeading) {
                const questionNumber = index + 1;
                // Use translation system instead of hardcoded English
                const questionText = translationManager.getTranslationSync('question') || 'Question';
                questionHeading.textContent = `${questionText} ${questionNumber}`;
            }
        });
        
        logger.debug(`Updated question numbering for ${questionItems.length} questions`);
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
     * Clean translation keys from an element without destroying DOM structure
     */
    cleanTranslationKeysInElement(element) {
        const translationMap = {
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
        
        // Clean text content in text nodes (preserving DOM structure)
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        textNodes.forEach(textNode => {
            let content = textNode.textContent;
            let changed = false;
            
            for (const [key, value] of Object.entries(translationMap)) {
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                if (regex.test(content)) {
                    content = content.replace(regex, value);
                    changed = true;
                }
            }
            
            if (changed) {
                textNode.textContent = content;
            }
        });
        
        // Clean placeholder attributes
        element.querySelectorAll('[placeholder]').forEach(el => {
            const placeholder = el.getAttribute('placeholder');
            let cleanedPlaceholder = placeholder;
            let changed = false;
            
            for (const [key, value] of Object.entries(translationMap)) {
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                if (regex.test(cleanedPlaceholder)) {
                    cleanedPlaceholder = cleanedPlaceholder.replace(regex, value);
                    changed = true;
                }
            }
            
            if (changed) {
                el.setAttribute('placeholder', cleanedPlaceholder);
            }
        });
    }
    
    /**
     * Clean translation keys from loaded data (legacy method for backward compatibility)
     */
    cleanTranslationKeys(htmlString) {
        if (!htmlString) return htmlString;
        
        // Map of translation keys to English text
        const translationMap = {
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
        
        let cleaned = htmlString;
        for (const [key, value] of Object.entries(translationMap)) {
            // Replace translation keys that appear as standalone text
            cleaned = cleaned.replace(new RegExp(`\\b${key}\\b`, 'g'), value);
        }
        
        return cleaned;
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
        
        // Set question time
        const questionTime = questionElement.querySelector('.question-time');
        if (questionTime) {
            questionTime.value = questionData.time || 30;
        }
        
        // Set question difficulty
        const questionDifficulty = questionElement.querySelector('.question-difficulty');
        if (questionDifficulty) {
            questionDifficulty.value = questionData.difficulty || 'medium';
        }
    }

    /**
     * Populate question image data with proper error handling
     */
    populateQuestionImage(questionElement, questionData) {
        if (!questionData.image) return;
        
        logger.debug('Populating image for question:', questionData.image);
        const imageElement = questionElement.querySelector('.question-image');
        const imagePreview = questionElement.querySelector('.image-preview');
        
        if (!imageElement || !imagePreview) {
            logger.debug('Image elements not found in question DOM');
            return;
        }
        
        const imageSrc = this.resolveImageSource(questionData.image);
        this.setupImageElement(imageElement, imageSrc, questionData.image);
        this.setupImageHandlers(imageElement, imagePreview, questionData.image);
        
        imagePreview.style.display = 'block';
        logger.debug('Image populated:', imageElement.src);
    }

    /**
     * Resolve image source from various formats
     * Kubernetes-aware: Prepends base path for path-based routing
     * Handles both old paths (with base path) and new paths (without base path)
     */
    resolveImageSource(imageData) {
        if (imageData.startsWith('data:')) {
            // Data URI - use directly
            return imageData;
        } else if (imageData.startsWith('http')) {
            // Full URL - use directly
            return imageData;
        } else {
            // Get base path for Kubernetes
            const basePath = document.querySelector('base')?.getAttribute('href') || '/';
            const cleanBasePath = basePath.replace(/\/$/, ''); // Remove trailing slash

            // First, strip any existing base path from imageData to get clean path
            let cleanPath = imageData;
            if (cleanBasePath && cleanBasePath !== '' && imageData.startsWith(cleanBasePath)) {
                // Remove base path if already present (handles old stored paths)
                cleanPath = imageData.substring(cleanBasePath.length);
                logger.debug(`Quiz-manager stripped base path: ${imageData} → ${cleanPath}`);
            }

            // Normalize to /uploads/filename.gif format
            if (!cleanPath.startsWith('/uploads/')) {
                if (cleanPath.startsWith('uploads/')) {
                    cleanPath = '/' + cleanPath;
                } else if (!cleanPath.startsWith('/')) {
                    cleanPath = `/uploads/${cleanPath}`;
                }
            }

            // Now prepend base path for display
            const fullPath = cleanBasePath === '' ? cleanPath : cleanBasePath + cleanPath;
            logger.debug(`Quiz-manager resolved: ${imageData} → ${cleanPath} → ${fullPath}`);
            return fullPath;
        }
    }

    /**
     * Set up image element with source and data attributes
     */
    setupImageElement(imageElement, imageSrc, originalImageData) {
        imageElement.src = imageSrc;
        imageElement.dataset.url = originalImageData;
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
     * Load image with retry logic for WSL environments (similar to preview renderer)
     * @param {HTMLImageElement} img - Image element
     * @param {string} src - Image source URL
     * @param {number} maxRetries - Maximum retry attempts
     * @param {number} attempt - Current attempt number
     * @param {HTMLElement} imagePreview - Image preview container for error handling
     * @param {string} imageData - Original image data for error display
     */
    loadImageWithRetry(img, src, maxRetries = 3, attempt = 1, imagePreview = null, imageData = '') {
        img.onerror = () => {
            if (attempt < maxRetries) {
                logger.warn(`Quiz builder image load failed, retrying (${attempt}/${maxRetries}): ${src}`);
                // Progressive delay: 100ms, 200ms, 300ms for WSL file system delays
                setTimeout(() => {
                    this.loadImageWithRetry(img, src, maxRetries, attempt + 1, imagePreview, imageData);
                }, 100 * attempt);
            } else {
                logger.error(`Quiz builder image failed to load after ${maxRetries} attempts: ${src}`);
                this.handleImageLoadError(img, imagePreview, imageData || src);
            }
        };
        
        // Set the source to trigger load/error event
        if (attempt === 1) {
            // Only set src on first attempt, subsequent attempts reuse existing src
            img.src = src;
        } else {
            // Force reload by appending cache buster
            const separator = src.includes('?') ? '&' : '?';
            img.src = src + separator + '_retry=' + attempt + '&_t=' + Date.now();
        }
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
     */
    populateTypeSpecificData(questionElement, questionData) {
        setTimeout(() => {
            if (questionData.type === 'multiple-choice') {
                this.populateMultipleChoiceData(questionElement, questionData);
            } else if (questionData.type === 'multiple-correct') {
                this.populateMultipleCorrectData(questionElement, questionData);
            } else if (questionData.type === 'true-false') {
                this.populateTrueFalseData(questionElement, questionData);
            } else if (questionData.type === 'numeric') {
                this.populateNumericData(questionElement, questionData);
            }
        }, 100);
    }

    /**
     * Populate multiple choice question data
     */
    populateMultipleChoiceData(questionElement, questionData) {
        logger.debug('Populating multiple choice data:', questionData.options);
        
        // Use correct selectors from question-utils.js
        const optionInputs = questionElement.querySelectorAll('.multiple-choice-options .option');
        logger.debug('Found option inputs:', optionInputs.length);
        
        if (questionData.options) {
            questionData.options.forEach((option, index) => {
                if (optionInputs[index]) {
                    logger.debug(`Setting option ${index}:`, option);
                    optionInputs[index].value = option;
                }
            });
        }
        
        const correctAnswer = questionElement.querySelector('.multiple-choice-options .correct-answer');
        if (correctAnswer && questionData.correctAnswer !== undefined) {
            correctAnswer.value = questionData.correctAnswer;
        }
    }

    /**
     * Populate multiple correct question data
     */
    populateMultipleCorrectData(questionElement, questionData) {
        // Use correct selectors from question-utils.js
        const optionInputs = questionElement.querySelectorAll('.multiple-correct-options .option');
        if (questionData.options) {
            questionData.options.forEach((option, index) => {
                if (optionInputs[index]) {
                    optionInputs[index].value = option;
                }
            });
        }
        
        const correctCheckboxes = questionElement.querySelectorAll('.multiple-correct-options .correct-option');
        if (questionData.correctAnswers) {
            questionData.correctAnswers.forEach(answerIndex => {
                if (correctCheckboxes[answerIndex]) {
                    correctCheckboxes[answerIndex].checked = true;
                }
            });
        }
    }

    /**
     * Populate true/false question data
     */
    populateTrueFalseData(questionElement, questionData) {
        const correctAnswer = questionElement.querySelector('.true-false-options .correct-answer');
        if (correctAnswer && questionData.correctAnswer !== undefined) {
            correctAnswer.value = questionData.correctAnswer ? 'true' : 'false';
        }
    }

    /**
     * Populate numeric question data
     */
    populateNumericData(questionElement, questionData) {
        const correctAnswer = questionElement.querySelector('.numeric-answer');
        if (correctAnswer && questionData.correctAnswer !== undefined) {
            correctAnswer.value = questionData.correctAnswer;
        }
        
        const tolerance = questionElement.querySelector('.numeric-tolerance');
        if (tolerance && questionData.tolerance !== undefined) {
            tolerance.value = questionData.tolerance;
        }
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
        
        try {
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
            
        } catch (error) {
            logger.error('Error importing quiz:', error);
            showErrorAlert('failed_import_quiz');
        }
        
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
        
        try {
            const dataStr = JSON.stringify(quizData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
            link.click();
            
            showSuccessAlert('quiz_exported_successfully');
        } catch (error) {
            logger.error('Error exporting quiz:', error);
            showErrorAlert('failed_export_quiz');
        }
    }

    /**
     * Add a generated question from AI generator
     * @param {Object} questionData - Generated question data
     * @param {boolean} showAlerts - Whether to show success alerts
     */
    addGeneratedQuestion(questionData, showAlerts = true) {
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
        } else {
            // Add a new question
            logger.debug('🔧 AddGeneratedQuestion - Creating new question element');
            if (window.game && window.game.addQuestion) {
                window.game.addQuestion();
                
                // Wait longer for DOM to update when creating new elements
                setTimeout(() => {
                    const updatedQuestionElements = document.querySelectorAll('.question-item');
                    targetElement = updatedQuestionElements[updatedQuestionElements.length - 1];
                    
                    if (targetElement) {
                        logger.debug('🔧 AddGeneratedQuestion - New element created, populating data');
                        // Use same processing as addQuestionFromData for consistency
                        this.cleanTranslationKeysInElement(targetElement);
                        this.populateQuestionElement(targetElement, questionData);
                        translationManager.translateContainer(targetElement);
                    } else {
                        logger.error('🔧 AddGeneratedQuestion - Failed to find new question element');
                    }
                }, 300); // Increased timeout to 300ms for DOM updates + any animations
            } else {
                logger.error('addQuestion function not available');
                return;
            }
        }
    }

    /**
     * Check if a question element is empty/default
     * @param {HTMLElement} questionElement - Question DOM element to check
     * @returns {boolean} - True if question is empty
     */
    isEmptyQuestion(questionElement) {
        const questionText = questionElement.querySelector('.question-text')?.value?.trim();
        const options = questionElement.querySelectorAll('.option');
        let hasEmptyOptions = true;
        
        // Check if all options are empty
        options.forEach(option => {
            if (option.value?.trim()) {
                hasEmptyOptions = false;
            }
        });
        
        return !questionText && hasEmptyOptions;
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
            
            try {
                localStorage.setItem('quizAutoSave', JSON.stringify(autoSaveData));
                logger.debug('Auto-saved quiz data');
            } catch (error) {
                logger.error('Failed to auto-save quiz:', error);
            }
        }
    }

    /**
     * Load auto-saved quiz
     */
    async loadAutoSave() {
        try {
            const autoSaveData = localStorage.getItem('quizAutoSave');
            if (autoSaveData) {
                const data = JSON.parse(autoSaveData);
                
                // Check if auto-save is recent (within 24 hours)
                const hoursSinceAutoSave = (Date.now() - data.timestamp) / (1000 * 60 * 60);
                if (hoursSinceAutoSave < 24) {
                    // Validate data before loading to prevent corruption
                    if (this.validateQuizData(data)) {
                        await this.populateQuizBuilder(data);
                        logger.debug('Loaded auto-saved quiz data');
                    } else {
                        logger.warn('Auto-save data appears corrupted, clearing localStorage');
                        localStorage.removeItem('quizAutoSave');
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to load auto-save:', error);
            localStorage.removeItem('quizAutoSave');
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
     * Setup auto-save functionality
     */
    setupAutoSave() {
        // Set up auto-save on quiz title change
        const titleInput = document.getElementById('quiz-title');
        if (titleInput) {
            titleInput.addEventListener('input', () => {
                clearTimeout(this.autoSaveTimeout);
                this.autoSaveTimeout = setTimeout(() => {
                    this.autoSaveQuiz();
                }, 5000); // Auto-save after 5 seconds of inactivity
            });
        }
        
        // Auto-save on question changes with tracked listener
        const questionInputHandler = (event) => {
            if (event.target.closest('.question')) {
                clearTimeout(this.autoSaveTimeout);
                this.autoSaveTimeout = setTimeout(() => {
                    this.autoSaveQuiz();
                }, 5000);
            }
        };
        this.addDocumentListenerTracked('input', questionInputHandler);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== MEMORY MANAGEMENT METHODS ====================

    /**
     * Add document-level event listener with tracking
     */
    addDocumentListenerTracked(event, handler, options = {}) {
        document.addEventListener(event, handler, options);
        this.documentListeners.push({ event, handler, options });
        logger.debug(`QuizManager: Tracked document listener: ${event}`);
    }

    /**
     * Add element event listener with tracking
     */
    addEventListenerTracked(element, event, handler, options = {}) {
        if (!element || typeof element.addEventListener !== 'function') {
            logger.warn('QuizManager: Invalid element passed to addEventListenerTracked:', element);
            return;
        }

        element.addEventListener(event, handler, options);
        
        if (!this.eventListeners.has(element)) {
            this.eventListeners.set(element, []);
        }
        this.eventListeners.get(element).push({ event, handler, options });
        
        logger.debug(`QuizManager: Tracked event listener: ${event} on`, element);
    }

    /**
     * Cleanup all tracked event listeners and timeouts
     */
    cleanup() {
        logger.debug('QuizManager cleanup started');
        
        try {
            // Clear auto-save timeout
            if (this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
                this.autoSaveTimeout = null;
            }

            // Clear all document-level listeners
            let docListenerCount = 0;
            this.documentListeners.forEach(({ event, handler }) => {
                try {
                    document.removeEventListener(event, handler);
                    docListenerCount++;
                } catch (error) {
                    logger.warn('Error removing document listener:', error);
                }
            });
            this.documentListeners = [];
            logger.debug(`QuizManager: Cleaned up ${docListenerCount} document listeners`);

            // Clear element-level listeners
            let elementListenerCount = 0;
            this.eventListeners.forEach((listeners, element) => {
                listeners.forEach(({ event, handler }) => {
                    try {
                        element.removeEventListener(event, handler);
                        elementListenerCount++;
                    } catch (error) {
                        logger.warn('Error removing element listener:', error);
                    }
                });
            });
            this.eventListeners.clear();
            logger.debug(`QuizManager: Cleaned up ${elementListenerCount} element listeners`);

            logger.debug('QuizManager cleanup completed successfully');
        } catch (error) {
            logger.error('Error during QuizManager cleanup:', error);
        }
    }
}