/**
 * Preview Manager Module
 * Handles live preview functionality with auto-scroll and real-time updates
 * Restored to match original monolithic functionality
 */

import { translationManager } from '../utils/translation-manager.js';
import { MathRenderer } from '../utils/math-renderer.js';
import { simpleMathJaxService } from '../utils/simple-mathjax-service.js';
import { SplitLayoutManager } from './modules/split-layout-manager.js';
import { PreviewRenderer } from './modules/preview-renderer.js';
import { logger, TIMING } from '../core/config.js';
import { QuestionTypeRegistry } from '../utils/question-type-registry.js';
import { EventListenerManager } from '../utils/event-listener-manager.js';
import { isMobile, debounce } from '../utils/dom.js';

export class PreviewManager {
    constructor(mathRenderer) {
        this.mathRenderer = mathRenderer || new MathRenderer();
        this.mathJaxService = simpleMathJaxService;
        this.splitLayoutManager = new SplitLayoutManager();
        this.previewRenderer = new PreviewRenderer();
        this.currentPreviewQuestion = 0;
        this.splitPreviewListenersSet = false;
        this.previewMode = false;
        this.manualNavigationInProgress = false;
        this.updatePreviewDebounced = debounce(() => this.updateSplitPreview(), TIMING.ANIMATION_DURATION);

        // Memory management via EventListenerManager
        this.listenerManager = new EventListenerManager('PreviewManager');

        // Store listener references for proper cleanup
        this.listeners = {
            prevBtn: null,
            nextBtn: null,
            scrollBtn: null,
            inputHandler: null,
            changeHandler: null,
            radioHandler: null,
            checkboxHandler: null,
            trueFalseHandler: null,
            imageHandler: null
        };
    }

    /**
     * Create a tracked setTimeout that can be cleaned up
     * @param {Function} callback - Function to execute
     * @param {number} delay - Delay in milliseconds
     * @returns {number} Timer ID
     */
    createTrackedTimeout(callback, delay) {
        return this.listenerManager.createTimeout(callback, delay);
    }

    /**
     * Clear all tracked timers
     */
    clearAllTimers() {
        this.listenerManager.cleanup();

        // Also clear the autoScrollTimeout if it exists
        if (this.autoScrollTimeout) {
            clearTimeout(this.autoScrollTimeout);
            this.autoScrollTimeout = null;
        }
    }

    /**
     * Toggle preview mode
     */
    togglePreviewMode() {
        const toggleBtn = document.getElementById('toggle-preview');

        this.previewMode = !this.previewMode;

        if (this.previewMode) {
            // Check if mobile and handle exclusively
            if (isMobile()) {
                // Mobile: Show full-screen overlay preview ONLY
                this.showMobilePreview();
            } else {
                // Desktop: Show split-screen preview ONLY
                const previewSection = document.querySelector('.quiz-preview-section');
                const hostContainer = document.querySelector('.host-container');

                if (!previewSection || !hostContainer) {
                    logger.warn('Preview elements not found for desktop');
                    return;
                }

                this.showDesktopSplitPreview(previewSection, hostContainer);
            }

            // Update button styling and text
            if (toggleBtn) {
                toggleBtn.classList.remove('secondary');
                toggleBtn.classList.add('danger');
                toggleBtn.textContent = translationManager.getTranslationSync('close_live_preview') || 'Close Live Preview';
                toggleBtn.setAttribute('data-translate', 'close_live_preview');
            }
        } else {
            // Close preview mode - handle mobile vs desktop exclusively
            if (isMobile()) {
                this.hideMobilePreview();
            } else {
                const previewSection = document.querySelector('.quiz-preview-section');
                const hostContainer = document.querySelector('.host-container');

                if (previewSection && hostContainer) {
                    this.hideDesktopSplitPreview(previewSection, hostContainer);
                }
            }

            // Update button styling and text
            if (toggleBtn) {
                toggleBtn.classList.remove('danger');
                toggleBtn.classList.add('secondary');
                toggleBtn.textContent = translationManager.getTranslationSync('toggle_live_preview') || 'Live Preview';
                toggleBtn.setAttribute('data-translate', 'toggle_live_preview');
            }
        }
    }

    /**
     * Show desktop split-screen preview
     */
    showDesktopSplitPreview(previewSection, hostContainer) {
        // Show preview
        previewSection.style.display = 'block';
        hostContainer.classList.add('split-screen');

        // Initialize split layout (handles resize handle, drag functionality, and ratios)
        this.splitLayoutManager.initializeSplitLayout();

        // Initialize preview with async support
        this.initializeSplitPreview().catch(error => {
            logger.warn('Preview initialization error:', error);
            // Fallback to synchronous initialization
            this.setupSplitPreviewEventListeners();
            this.updateSplitPreview();
        });
    }

    /**
     * Hide desktop split-screen preview
     */
    hideDesktopSplitPreview(previewSection, hostContainer) {
        // Clean up listeners first
        this.cleanupPreviewListeners();
        this.splitLayoutManager.cleanupSplitLayout();

        // Clear all tracked timers to prevent stale callbacks
        this.clearAllTimers();
        clearTimeout(this.updatePreviewTimeout);

        // Stop any pending debounced updates
        if (this.updatePreviewDebounced && this.updatePreviewDebounced.cancel) {
            this.updatePreviewDebounced.cancel();
        }

        // Temporarily disable ALL transitions to prevent glitching
        hostContainer.style.transition = 'none';
        previewSection.style.transition = 'none';

        // Force a reflow to ensure transitions are disabled
        hostContainer.offsetHeight;

        // Hide preview and remove split-screen class simultaneously
        previewSection.style.display = 'none';
        hostContainer.classList.remove('split-screen');

        // Hide resize handle
        const resizeHandle = document.getElementById('split-resize-handle');
        if (resizeHandle) {
            resizeHandle.style.display = 'none';
        }

        // Re-enable transitions after layout changes are complete
        requestAnimationFrame(() => {
            setTimeout(() => {
                hostContainer.style.transition = '';
                previewSection.style.transition = '';
            }, 50);
        });
    }

    /**
     * Initialize split preview system
     */
    async initializeSplitPreview() {
        logger.debug('Initializing split preview system');

        // Reset preview state completely
        this.currentPreviewQuestion = 0;
        this.manualNavigationInProgress = false;

        // Clear any existing update timeouts
        clearTimeout(this.updatePreviewTimeout);
        clearTimeout(this.autoScrollTimeout);

        logger.debug('Preview state reset - currentPreviewQuestion:', this.currentPreviewQuestion);

        // Ensure translation manager is ready before setting up preview
        if (translationManager && !translationManager.loadedTranslations.has(translationManager.currentLanguage)) {
            logger.debug('Waiting for translation manager to be ready...');
            try {
                await translationManager.ensureLanguageLoaded(translationManager.currentLanguage);
                logger.debug('Translation manager ready for preview');
            } catch (error) {
                logger.warn('Translation manager not ready, using fallbacks:', error);
            }
        }

        this.setupSplitPreviewEventListeners();

        // Update preview with a short delay to ensure DOM is ready
        this.createTrackedTimeout(() => this.updateSplitPreview(), 100);
    }

    /**
     * Setup event listeners for split preview
     */
    setupSplitPreviewEventListeners() {
        // Only set up listeners once
        if (this.splitPreviewListenersSet) {
            logger.debug('Split preview listeners already set, skipping');
            return;
        }
        this.splitPreviewListenersSet = true;

        // Navigation buttons for split screen
        const prevBtn = document.getElementById('preview-prev-split');
        const nextBtn = document.getElementById('preview-next-split');
        const scrollBtn = document.getElementById('scroll-to-question');

        logger.debug('🔘 Preview navigation buttons found:', {
            prevBtn: !!prevBtn,
            nextBtn: !!nextBtn,
            scrollBtn: !!scrollBtn
        });

        // Store listener references for cleanup
        this.listeners.prevBtn = () => {
            const questionItems = document.querySelectorAll('.question-item');
            logger.debug(`Prev button clicked: current=${this.currentPreviewQuestion}, total=${questionItems.length}`);

            // Set manual navigation flag to prevent auto-scroll conflicts
            this.manualNavigationInProgress = true;

            if (this.currentPreviewQuestion > 0) {
                this.currentPreviewQuestion--;
                this.updateSplitPreview();
            }

            // Clear flag after a short delay
            setTimeout(() => {
                this.manualNavigationInProgress = false;
            }, 500);
        };

        this.listeners.nextBtn = () => {
            const questionItems = document.querySelectorAll('.question-item');
            const maxIndex = questionItems.length - 1;
            logger.debug(`Next button clicked: current=${this.currentPreviewQuestion}, max=${maxIndex}, total=${questionItems.length}`);

            // Set manual navigation flag to prevent auto-scroll conflicts
            this.manualNavigationInProgress = true;

            if (this.currentPreviewQuestion < maxIndex) {
                this.currentPreviewQuestion++;
                this.updateSplitPreview();
            }

            // Clear flag after a short delay
            setTimeout(() => {
                this.manualNavigationInProgress = false;
            }, 500);
        };

        this.listeners.scrollBtn = () => {
            this.scrollToCurrentQuestion();
        };

        if (prevBtn) {
            prevBtn.addEventListener('click', this.listeners.prevBtn);
            logger.debug('✅ Prev button listener attached');
        } else {
            logger.warn('⚠️ Prev button not found - navigation may not work');
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', this.listeners.nextBtn);
            logger.debug('✅ Next button listener attached');
        } else {
            logger.warn('⚠️ Next button not found - navigation may not work');
        }

        if (scrollBtn) {
            scrollBtn.addEventListener('click', this.listeners.scrollBtn);
            logger.debug('✅ Scroll button listener attached');
        }

        // Real-time updates for split screen
        this.setupRealTimeSplitPreviewUpdates();
    }

    /**
     * Setup real-time preview updates for split screen
     */
    setupRealTimeSplitPreviewUpdates() {
        // Store listener references for cleanup
        this.listeners.inputHandler = (e) => {
            if (e.target.matches('.question-text, .option, .numeric-answer, .numeric-tolerance, .ordering-option')) {
                this.updatePreviewDebounced();
                // Smart auto-scroll with debouncing to prevent jumping
                this.smartAutoScrollToEditedQuestion(e.target);
            }
        };

        this.listeners.changeHandler = (e) => {
            // Include .correct-answer dropdown for multiple-choice questions
            if (e.target.matches('.question-type, .time-input, .question-difficulty, .correct-answer')) {
                this.updatePreviewDebounced();
            }
        };

        this.listeners.radioHandler = (e) => {
            if (e.target.matches('input[type="radio"][name^="correct-"]')) {
                this.updatePreviewDebounced();
            }
        };

        this.listeners.checkboxHandler = (e) => {
            // Match correct-option checkboxes for multiple-correct questions
            if (e.target.matches('.correct-option, input[type="checkbox"][name^="multiple-correct-"]')) {
                this.updatePreviewDebounced();
            }
        };

        this.listeners.trueFalseHandler = (e) => {
            if (e.target.matches('input[type="radio"][name^="tf-"]')) {
                this.updatePreviewDebounced();
            }
        };

        this.listeners.imageHandler = (e) => {
            if (e.target.matches('.image-input')) {
                this.updatePreviewDebounced();
            }
        };

        // Add event listeners
        document.addEventListener('input', this.listeners.inputHandler);
        document.addEventListener('change', this.listeners.changeHandler);
        document.addEventListener('change', this.listeners.radioHandler);
        document.addEventListener('change', this.listeners.checkboxHandler);
        document.addEventListener('change', this.listeners.trueFalseHandler);
        document.addEventListener('change', this.listeners.imageHandler);
    }

    /**
     * Update split preview
     */
    updateSplitPreview() {
        // Only update if preview mode is active
        if (!this.previewMode) {
            logger.debug('Preview mode not active, skipping updateSplitPreview');
            return;
        }

        const questionItems = document.querySelectorAll('.question-item');
        const totalQuestions = questionItems.length;

        // Clear simple MathJax cache for fresh rendering
        this.mathJaxService?.clearCache?.();
        logger.debug('MathJax cache cleared for fresh preview rendering');

        // Track who called updateSplitPreview
        const stack = new Error().stack;
        const caller = stack.split('\n')[2]?.trim() || 'unknown';
        logger.debug(`UPDATE SPLIT PREVIEW: total=${totalQuestions}, current=${this.currentPreviewQuestion}, caller=${caller}`);

        // Log all question items and their indices
        questionItems.forEach((item, index) => {
            const questionType = item.querySelector('.question-type')?.value || 'unknown';
            const questionText = item.querySelector('.question-text')?.value?.substring(0, 30) || 'empty';
            logger.debug(`Question ${index}: type=${questionType}, text="${questionText}"`);
        });

        if (totalQuestions === 0) {
            this.showEmptySplitPreview();
            return;
        }

        // Update navigation
        this.updateSplitPreviewNavigation(totalQuestions);

        // Validate and clamp currentPreviewQuestion to valid range
        const clampedIndex = Math.max(0, Math.min(this.currentPreviewQuestion, totalQuestions - 1));
        if (clampedIndex !== this.currentPreviewQuestion) {
            logger.warn(`currentPreviewQuestion was ${this.currentPreviewQuestion}, clamping to ${clampedIndex}`);
            this.currentPreviewQuestion = clampedIndex;
        }

        // Get current question data
        const currentQuestion = questionItems[this.currentPreviewQuestion];

        logger.debug('🔍 QUESTION RETRIEVAL:', {
            requestedIndex: this.currentPreviewQuestion,
            totalItems: questionItems.length,
            foundQuestion: !!currentQuestion,
            className: currentQuestion?.className || 'none'
        });

        if (!currentQuestion) {
            logger.error(`❌ Current question not found at index ${this.currentPreviewQuestion}, total questions: ${totalQuestions}`);
            logger.debug('📋 Available question items:', questionItems.length, 'DOM nodes found');

            // Only reset to 0 if we have questions and current index is invalid
            if (totalQuestions > 0 && questionItems.length > 0) {
                logger.debug('🔄 Resetting to question 0');
                this.currentPreviewQuestion = 0;
                const firstQuestion = questionItems[0];
                if (!firstQuestion) {
                    logger.error('❌ First question also not found, aborting preview update');
                    return;
                }

                const questionData = this.extractQuestionDataForPreview(firstQuestion);
                questionData.questionNumber = 1;
                questionData.totalQuestions = totalQuestions;
                this.previewRenderer.renderSplitQuestionPreview(questionData);

                // Render MathJax after content is ready
                setTimeout(() => {
                    this.previewRenderer.renderMathJaxForPreview();
                }, 100);
            } else {
                logger.warn('📭 No questions available for preview');
                this.showEmptySplitPreview();
            }
            return;
        }

        const questionData = this.extractQuestionDataForPreview(currentQuestion);
        questionData.questionNumber = this.currentPreviewQuestion + 1;
        questionData.totalQuestions = totalQuestions;

        logger.debug(`📊 EXTRACTED DATA FOR Q${questionData.questionNumber}:`, {
            hasQuestion: !!questionData.question,
            questionLength: questionData.question?.length || 0,
            questionPreview: questionData.question?.substring(0, 50) + '...' || 'empty',
            type: questionData.type,
            hasOptions: !!questionData.options,
            optionsCount: questionData.options?.length || 0
        });


        this.previewRenderer.renderSplitQuestionPreview(questionData);

        // Render MathJax after content is ready
        setTimeout(() => {
            this.previewRenderer.renderMathJaxForPreview();
        }, 100);
    }

    /**
     * Update split preview navigation
     */
    updateSplitPreviewNavigation(totalQuestions) {
        const counterSplit = document.getElementById('preview-question-counter-split');
        const counterDisplay = document.getElementById('preview-question-counter-display-split');
        const prevBtn = document.getElementById('preview-prev-split');
        const nextBtn = document.getElementById('preview-next-split');

        const questionNumber = this.currentPreviewQuestion + 1;
        const counterText = `${translationManager.getTranslationSync('question')} ${questionNumber} ${translationManager.getTranslationSync('of')} ${totalQuestions}`;

        if (counterSplit) {
            counterSplit.textContent = counterText;
        }
        if (counterDisplay) {
            counterDisplay.innerHTML = `<span data-translate="question">Question</span> ${questionNumber} <span data-translate="of">of</span> ${totalQuestions}`;
            // Update translations for the newly inserted content
            translationManager.updateGameTranslations();
        }

        if (prevBtn) {
            prevBtn.disabled = this.currentPreviewQuestion === 0;
        }
        if (nextBtn) {
            nextBtn.disabled = this.currentPreviewQuestion >= totalQuestions - 1;
        }
    }

    /**
     * Show empty split preview
     */
    showEmptySplitPreview() {
        const previewText = document.getElementById('preview-question-text-split');
        const counterDisplay = document.getElementById('preview-question-counter-display-split');
        const counterSplit = document.getElementById('preview-question-counter-split');

        if (previewText) {
            previewText.textContent = translationManager.getTranslationSync('no_questions_to_preview') || 'No questions to preview';
        }
        if (counterDisplay) {
            counterDisplay.innerHTML = '<span data-translate="question">Question</span> 0 <span data-translate="of">of</span> 0';
            // Update translations for the newly inserted content
            translationManager.updateGameTranslations();
        }
        if (counterSplit) {
            counterSplit.textContent = `${translationManager.getTranslationSync('question')} 0 ${translationManager.getTranslationSync('of')} 0`;
        }

        // Hide all answer areas
        document.querySelectorAll('#preview-answer-area-split .preview-answer-type').forEach(type => {
            type.classList.add('hidden');
        });
    }

    /**
     * Extract question data for preview from DOM element
     * Uses QuestionTypeRegistry for consistent extraction
     */
    extractQuestionDataForPreview(questionItem) {
        logger.debug('Extracting data from question item:', questionItem);

        const questionText = questionItem.querySelector('.question-text')?.value?.trim() || translationManager.getTranslationSync('enter_question_preview') || 'Enter question text...';
        const questionType = questionItem.querySelector('.question-type')?.value || 'multiple-choice';
        const imageElement = questionItem.querySelector('.question-image');
        const imageUrl = imageElement ? imageElement.dataset.url || '' : '';
        const imageWebpUrl = imageElement ? imageElement.dataset.webpUrl || '' : '';

        logger.debug('Question text:', questionText);
        logger.debug('Question type:', questionType);
        logger.debug('Image URL:', imageUrl, 'WebP:', imageWebpUrl);

        // Use QuestionTypeRegistry for consistent extraction
        const typeSpecificData = QuestionTypeRegistry.extractData(questionType, questionItem);

        // Build extracted data with consistent field names
        const extractedData = {
            question: questionText,
            type: questionType,
            image: imageUrl,
            imageWebp: imageWebpUrl,
            ...typeSpecificData
        };

        logger.debug('Extracted question data:', extractedData);
        return extractedData;
    }

    /**
     * Scroll to current question in editor
     */
    scrollToCurrentQuestion() {
        const questionItems = document.querySelectorAll('.question-item');
        const targetQuestion = questionItems[this.currentPreviewQuestion];

        if (targetQuestion) {
            targetQuestion.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });

            // Add a brief highlight effect using CSS class
            targetQuestion.classList.add('auto-scroll-highlight');

            setTimeout(() => {
                targetQuestion.classList.remove('auto-scroll-highlight');
            }, 1500);
        }
    }

    /**
     * Update preview (alias for updateSplitPreview)
     */
    updatePreview() {
        this.updateSplitPreview();
    }

    /**
     * Smart auto-scroll preview to edited question (debounced)
     */
    smartAutoScrollToEditedQuestion(inputElement) {
        // Only work when split preview is active
        if (!this.previewMode) return;

        // Debounce to prevent rapid jumping
        clearTimeout(this.autoScrollTimeout);
        this.autoScrollTimeout = setTimeout(() => {
            this.autoScrollToEditedQuestion(inputElement);
        }, 200); // Wait 200ms after user stops typing
    }

    /**
     * Auto-scroll preview to edited question
     */
    autoScrollToEditedQuestion(inputElement) {
        // Only work when split preview is active
        if (!this.previewMode) return;

        // Add a flag to prevent auto-scroll during manual navigation
        if (this.manualNavigationInProgress) {
            logger.debug('Manual navigation in progress, skipping auto-scroll');
            return;
        }

        // Find which question this input belongs to
        const questionItem = inputElement.closest('.question-item');
        if (!questionItem) return;

        // Find the index of this question
        const questionItems = Array.from(document.querySelectorAll('.question-item'));
        const questionIndex = questionItems.indexOf(questionItem);

        logger.debug(`📝 Auto-scroll triggered: questionIndex=${questionIndex}, current=${this.currentPreviewQuestion}, total=${questionItems.length}`);

        if (questionIndex !== -1 && questionIndex !== this.currentPreviewQuestion) {
            // Validate the index before updating
            if (questionIndex >= 0 && questionIndex < questionItems.length) {
                logger.debug(`🎯 Auto-scrolling preview from question ${this.currentPreviewQuestion + 1} to ${questionIndex + 1}`);
                this.currentPreviewQuestion = questionIndex;
                this.updateSplitPreview();
                // updateSplitPreview() already handles rendering
            } else {
                logger.debug(`❌ Invalid questionIndex: ${questionIndex}, not updating preview`);
            }
        }
    }

    /**
     * Clean up preview listeners
     */
    cleanupPreviewListeners() {
        logger.debug('Cleaning up preview listeners');

        // Remove navigation button listeners
        const prevBtn = document.getElementById('preview-prev-split');
        const nextBtn = document.getElementById('preview-next-split');
        const scrollBtn = document.getElementById('scroll-to-question');

        if (prevBtn && this.listeners.prevBtn) {
            prevBtn.removeEventListener('click', this.listeners.prevBtn);
        }
        if (nextBtn && this.listeners.nextBtn) {
            nextBtn.removeEventListener('click', this.listeners.nextBtn);
        }
        if (scrollBtn && this.listeners.scrollBtn) {
            scrollBtn.removeEventListener('click', this.listeners.scrollBtn);
        }

        // Remove document-level listeners
        if (this.listeners.inputHandler) {
            document.removeEventListener('input', this.listeners.inputHandler);
        }
        if (this.listeners.changeHandler) {
            document.removeEventListener('change', this.listeners.changeHandler);
        }
        if (this.listeners.radioHandler) {
            document.removeEventListener('change', this.listeners.radioHandler);
        }
        if (this.listeners.checkboxHandler) {
            document.removeEventListener('change', this.listeners.checkboxHandler);
        }
        if (this.listeners.trueFalseHandler) {
            document.removeEventListener('change', this.listeners.trueFalseHandler);
        }
        if (this.listeners.imageHandler) {
            document.removeEventListener('change', this.listeners.imageHandler);
        }

        // Clear listener references
        this.listeners = {
            prevBtn: null,
            nextBtn: null,
            scrollBtn: null,
            inputHandler: null,
            changeHandler: null,
            radioHandler: null,
            checkboxHandler: null,
            trueFalseHandler: null,
            imageHandler: null
        };

        // Reset flag
        this.splitPreviewListenersSet = false;

        logger.debug('Preview listeners cleanup completed');
    }

    /**
     * Show mobile full-screen carousel preview
     */
    showMobilePreview() {
        logger.debug('Showing mobile preview as full-screen overlay');

        // CRITICAL: Hide ALL page content to create true full-screen overlay
        // Store references for restoration later
        this.hiddenElements = [];

        const elementsToHide = [
            document.querySelector('.container'),
            document.querySelector('.host-container'),
            document.querySelector('.quiz-editor-section'),
            document.querySelector('header'),
            document.querySelector('.banner'),
            document.querySelector('.page-header'),
            document.querySelector('.mobile-quiz-fab')
        ];

        elementsToHide.forEach((element, index) => {
            if (element && !element.contains(document.getElementById('mobile-preview-container'))) {
                // Store original display value for restoration
                this.hiddenElements[index] = {
                    element: element,
                    originalDisplay: element.style.display || ''
                };
                element.style.display = 'none';
                logger.debug('Hidden element:', element.className || element.tagName);
            }
        });

        // Also hide any desktop preview elements
        const desktopPreviews = document.querySelectorAll('.quiz-preview-section:not(#mobile-preview-container .quiz-preview-section)');
        desktopPreviews.forEach(preview => {
            preview.style.display = 'none';
        });

        // Store original body styles to restore later
        const body = document.body;
        this.originalBodyOverflow = body.style.overflow;
        this.originalBodyHeight = body.style.height;

        // Prevent body scrolling while preview is active
        body.style.overflow = 'hidden';
        body.style.height = '100vh';

        // Create or show mobile preview container as full-screen overlay
        this.createMobilePreviewContainer();
        this.currentPreviewQuestion = 0;
        this.updateMobilePreview();
    }

    /**
     * Hide mobile full-screen carousel preview
     */
    hideMobilePreview() {
        logger.debug('Hiding mobile preview overlay');

        // Clear all tracked timers to prevent stale callbacks
        this.clearAllTimers();

        // Restore ALL hidden elements using stored references
        if (this.hiddenElements) {
            this.hiddenElements.forEach(hiddenElement => {
                if (hiddenElement && hiddenElement.element) {
                    hiddenElement.element.style.display = hiddenElement.originalDisplay;
                    logger.debug('Restored element:', hiddenElement.element.className || hiddenElement.element.tagName);
                }
            });
            this.hiddenElements = null;
        }

        // Restore original body styles
        const body = document.body;
        if (this.originalBodyOverflow !== undefined) {
            body.style.overflow = this.originalBodyOverflow;
        }
        if (this.originalBodyHeight !== undefined) {
            body.style.height = this.originalBodyHeight;
        }

        // Remove mobile preview overlay container
        const mobilePreview = document.getElementById('mobile-preview-container');
        if (mobilePreview) {
            mobilePreview.remove();
            logger.debug('Mobile preview overlay removed');
        }

        // Clean up listeners
        this.cleanupMobilePreviewListeners();
    }

    /**
     * Create mobile preview container with same style as desktop
     */
    createMobilePreviewContainer() {
        // Remove existing container if it exists
        const existing = document.getElementById('mobile-preview-container');
        if (existing) {
            existing.remove();
        }

        // Create the mobile preview container using the same structure as desktop
        const container = document.createElement('div');
        container.id = 'mobile-preview-container';
        container.className = 'mobile-preview-container mobile-only';

        // Redesigned layout with bottom navigation for better mobile UX
        container.innerHTML = `
            <div class="quiz-preview-section mobile-preview-modal">
                <!-- Simplified Mobile Header -->
                <div class="preview-modal-header mobile-header">
                    <div class="preview-title-section">
                        <h3><span data-translate="live_preview">Live Preview</span></h3>
                    </div>
                </div>
                
                <!-- Preview Content Area - Now takes most of the screen -->
                <div id="mobile-preview-viewport" class="preview-viewport mobile-viewport">
                    <div id="mobile-preview-content" class="preview-content mobile-content">
                        <div class="player-question-area mobile-question-area">
                            <div id="mobile-preview-question-counter-display" class="question-counter-display mobile-q-counter">
                                <span data-translate="question">Question</span> 1 <span data-translate="of">of</span> 1
                            </div>
                            <div id="mobile-preview-question-text" class="preview-question-text mobile-question" data-translate="no_questions_to_preview">No questions to preview</div>
                        </div>
                        
                        <div id="mobile-preview-answer-area" class="preview-answer-area mobile-answers">
                            <!-- Answer content will be inserted here -->
                            <div class="preview-answer-type preview-multiple-choice" style="display: none;">
                                <div class="preview-options mobile-options" id="mobile-preview-options">
                                    <!-- Options will be inserted here -->
                                </div>
                            </div>
                            
                            <div class="preview-answer-type preview-multiple-correct" style="display: none;">
                                <div class="preview-checkbox-options mobile-checkbox-options" id="mobile-preview-checkbox-options">
                                    <!-- Checkbox options will be inserted here -->
                                </div>
                            </div>
                            
                            <div class="preview-answer-type preview-true-false" style="display: none;">
                                <div class="preview-tf-options mobile-tf-options" id="mobile-preview-tf-options">
                                    <!-- True/False options will be inserted here -->
                                </div>
                            </div>
                            
                            <div class="preview-answer-type preview-numeric" style="display: none;">
                                <div class="preview-numeric-input mobile-numeric" id="mobile-preview-numeric">
                                    <input type="number" placeholder="Enter your answer" readonly>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Bottom Navigation Bar - Easy thumb access -->
                <div class="mobile-bottom-nav">
                    <button id="mobile-preview-prev" class="nav-btn mobile-nav-btn mobile-nav-prev">◀</button>
                    <button id="mobile-preview-close" class="close-btn mobile-close-btn" data-translate="close">Close</button>
                    <button id="mobile-preview-next" class="nav-btn mobile-nav-btn mobile-nav-next">▶</button>
                </div>
            </div>
        `;

        // Always append directly to body for true full-screen experience
        document.body.appendChild(container);

        // Update translations for dynamically created elements
        setTimeout(() => {
            try {
                // Translate the mobile preview container specifically
                translationManager.translateContainer(container);
                logger.debug('Mobile preview translations updated');
            } catch (error) {
                logger.warn('Error updating mobile preview translations:', error);
            }
        }, 100);

        // Get theme for container background
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // CRITICAL: Ensure the container is positioned properly for full-screen WITH BACKGROUND
        container.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 999999 !important;
            background: ${isDark ? '#0d1117' : '#ffffff'} !important;
            overflow: hidden !important;
        `;

        // CRITICAL: Ensure the quiz-preview-section child uses full container height
        const previewSection = container.querySelector('.quiz-preview-section');
        if (previewSection) {
            previewSection.style.cssText = `
                height: 100vh !important;
                max-height: 100vh !important;
                width: 100% !important;
                display: flex !important;
                flex-direction: column !important;
            `;
        }

        // Apply mobile-specific styling for enhanced desktop-like appearance
        this.applyMobilePreviewStyles(container);

        logger.debug('Mobile preview container created and positioned for full-screen with solid background');

        // Setup mobile preview event listeners
        this.setupMobilePreviewListeners();
    }

    /**
     * Apply mobile-specific styling with proper theme detection
     */
    applyMobilePreviewStyles(container) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Mobile header styling with theme awareness
        const header = container.querySelector('.mobile-header');
        if (header) {
            Object.assign(header.style, {
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.95)',
                borderBottom: isDark ? '2px solid rgba(255,255,255,0.2)' : '2px solid rgba(0,0,0,0.1)',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                minHeight: '50px',
                color: isDark ? '#f0f6fc' : '#1e293b'
            });
        }

        // Bottom Navigation Bar styling with theme awareness
        const bottomNav = container.querySelector('.mobile-bottom-nav');
        if (bottomNav) {
            Object.assign(bottomNav.style, {
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.95)',
                borderTop: isDark ? '2px solid rgba(255,255,255,0.2)' : '2px solid rgba(0,0,0,0.1)',
                padding: '12px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '15px',
                boxShadow: isDark ? '0 -2px 10px rgba(0,0,0,0.3)' : '0 -2px 10px rgba(0,0,0,0.1)',
                zIndex: '1000'
            });
        }

        // Navigation arrow buttons - always visible dark arrows on light background
        const navButtons = container.querySelectorAll('.mobile-nav-btn');
        navButtons.forEach(btn => {
            Object.assign(btn.style, {
                background: '#ffffff', // Always white background for contrast
                color: '#1e293b', // Always dark arrows for visibility
                border: '2px solid #1e293b', // Always dark border
                borderRadius: '50%',
                width: '48px',
                height: '48px',
                fontSize: '24px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '900',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
            });
        });

        // Close button - guaranteed red rectangular button in center
        const closeBtn = container.querySelector('.mobile-close-btn');
        if (closeBtn) {
            Object.assign(closeBtn.style, {
                background: '#ef4444', // Explicit red color
                color: 'white',
                border: 'none',
                borderRadius: '25px',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                minWidth: '100px'
            });
        }

        // Question counter styling
        const counter = container.querySelector('.mobile-counter');
        if (counter) {
            Object.assign(counter.style, {
                background: '#10b981',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '15px',
                fontWeight: '600',
                fontSize: '14px',
                whiteSpace: 'nowrap'
            });
        }

        // Mobile viewport styling with theme awareness
        const viewport = container.querySelector('.mobile-viewport');
        if (viewport) {
            Object.assign(viewport.style, {
                flex: '1',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '20px 16px',
                paddingBottom: '100px',
                background: isDark ? '#0d1117' : '#ffffff',
                maxHeight: 'calc(100vh - 170px)',
                minHeight: '300px',
                WebkitOverflowScrolling: 'touch',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                justifyContent: 'flex-start'
            });
        }

        // Mobile question area styling with theme awareness
        const questionArea = container.querySelector('.mobile-question-area');
        if (questionArea) {
            Object.assign(questionArea.style, {
                margin: '0 0 20px 0',
                padding: '20px 16px',
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)',
                borderRadius: '12px',
                border: isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)',
                minHeight: 'auto',
                height: 'auto',
                overflow: 'visible',
                flexShrink: '0',
                boxSizing: 'border-box'
            });
        }

        // Mobile question text styling with theme awareness
        const questionText = container.querySelector('.mobile-question');
        if (questionText) {
            Object.assign(questionText.style, {
                fontSize: '18px',
                fontWeight: '600',
                lineHeight: '1.4',
                color: isDark ? '#f0f6fc' : '#1e293b',
                marginTop: '16px',
                paddingTop: '8px',
                wordWrap: 'break-word',
                overflowWrap: 'break-word'
            });
        }

        // Mobile question counter styling with theme awareness
        const questionCounter = container.querySelector('.mobile-q-counter');
        if (questionCounter) {
            Object.assign(questionCounter.style, {
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)',
                fontSize: '14px',
                color: isDark ? '#8b949e' : '#64748b'
            });
        }

        // Header styling with theme awareness
        const titleSection = container.querySelector('.preview-title-section');
        if (titleSection) {
            Object.assign(titleSection.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                color: isDark ? '#f0f6fc' : '#1e293b'
            });
        }

        // Header title text with theme awareness
        const headerTitle = container.querySelector('.preview-title-section h3');
        if (headerTitle) {
            Object.assign(headerTitle.style, {
                color: isDark ? '#f0f6fc' : '#1e293b',
                fontSize: '18px',
                fontWeight: '600',
                margin: '0'
            });
        }

        // All text elements get theme-appropriate colors
        const allTextElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div, label');
        allTextElements.forEach(element => {
            element.style.color = isDark ? '#f0f6fc' : '#1e293b';
        });

        // Mobile content container
        const mobileContent = container.querySelector('.mobile-content');
        if (mobileContent) {
            Object.assign(mobileContent.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                height: 'auto',
                minHeight: 'auto',
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                width: '100%'
            });
        }

        // Mobile answers area styling - centered
        const answersArea = container.querySelector('.mobile-answers');
        if (answersArea) {
            Object.assign(answersArea.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                flexShrink: '0',
                height: 'auto',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: '100%',
                maxWidth: '100%',
                margin: '0 auto',
                padding: '0',
                boxSizing: 'border-box'
            });
        }

        // Mobile answer options styling - preserve colorful options, only style layout
        const answerOptions = container.querySelectorAll('.player-option, .checkbox-option, .tf-option');
        answerOptions.forEach(option => {
            // Only apply layout styles, not colors - let the preview renderer handle colors
            Object.assign(option.style, {
                wordWrap: 'break-word',
                width: '90%',
                maxWidth: '600px',
                padding: '20px',
                margin: '0 auto 12px auto',
                borderRadius: '12px',
                lineHeight: '1.5',
                fontSize: '16px',
                display: 'block',
                boxSizing: 'border-box'
                // Don't set background, border, or color - preserve colorful styling
            });
        });

        // Mobile code blocks - minimal responsive fixes
        const codeBlocks = container.querySelectorAll('pre, code');
        codeBlocks.forEach(code => {
            Object.assign(code.style, {
                maxWidth: '100%',
                overflowX: 'auto'
            });
        });

        // Delayed rendering triggers
        setTimeout(() => {
            if (this.previewRenderer?.mathJaxService) {
                this.previewRenderer.mathJaxService.renderAll(container).catch(error =>
                    logger.warn('MathJax rendering failed:', error)
                );
            }
            this.updateMobileCorrectAnswerStyling(container);
        }, 200);
    }

    /**
     * Update correct answer styling after content is rendered
     */
    updateMobileCorrectAnswerStyling(container) {
        // Unified correct answer styling for all option types
        const correctSelectors = ['.correct', '.correct-preview', '[data-correct]', 'input[checked]'];
        const correctElements = container.querySelectorAll(correctSelectors.join(', '));

        correctElements.forEach(element => {
            const option = element.matches('.player-option, .checkbox-option, .tf-option')
                ? element
                : element.closest('.player-option, .checkbox-option, .tf-option');

            if (option) {
                Object.assign(option.style, {
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '3px solid #22c55e',
                    color: '#15803d',
                    fontWeight: '600',
                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.25)'
                });
            }
        });
    }

    /**
     * Setup mobile preview event listeners
     */
    setupMobilePreviewListeners() {
        const closeBtn = document.getElementById('mobile-preview-close');
        const prevBtn = document.getElementById('mobile-preview-prev');
        const nextBtn = document.getElementById('mobile-preview-next');

        // Close button
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.togglePreviewMode(); // This will close the preview
            });
        }

        // Navigation buttons
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.navigateMobilePreview(-1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.navigateMobilePreview(1);
            });
        }

        // Touch/swipe support on the preview content area
        const container = document.getElementById('mobile-preview-container');
        // Look for mobile-specific content class (.mobile-content) or fallback to split class
        const previewContent = container ?
            (container.querySelector('.mobile-content') || container.querySelector('.preview-content-split')) : null;
        if (previewContent) {
            this.setupMobileSwipeListeners(previewContent);
        }
    }

    /**
     * Setup mobile swipe listeners for carousel
     */
    setupMobileSwipeListeners(track) {
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let isDragging = false;

        track.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = true;
        }, { passive: true });

        track.addEventListener('touchmove', (e) => {
            if (!isDragging) return;

            currentX = e.touches[0].clientX;
            const deltaX = currentX - startX;
            const deltaY = e.touches[0].clientY - startY;

            // Only prevent default if horizontal swipe is more significant than vertical
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                e.preventDefault();
            }
        }, { passive: false });

        track.addEventListener('touchend', () => {
            if (!isDragging) return;

            const deltaX = currentX - startX;
            const threshold = 50; // minimum swipe distance

            if (Math.abs(deltaX) > threshold) {
                if (deltaX > 0) {
                    // Swipe right - go to previous
                    this.navigateMobilePreview(-1);
                } else {
                    // Swipe left - go to next
                    this.navigateMobilePreview(1);
                }
            }

            isDragging = false;
            startX = 0;
            currentX = 0;
        }, { passive: true });
    }

    /**
     * Navigate mobile preview carousel
     */
    navigateMobilePreview(direction) {
        const questionItems = document.querySelectorAll('.question-item');
        const totalQuestions = questionItems.length;

        if (totalQuestions === 0) return;

        const newIndex = this.currentPreviewQuestion + direction;

        if (newIndex >= 0 && newIndex < totalQuestions) {
            this.currentPreviewQuestion = newIndex;
            this.updateMobilePreview();
        }
    }

    /**
     * Update mobile preview with current question using desktop rendering
     */
    updateMobilePreview() {
        const questionItems = document.querySelectorAll('.question-item');
        const totalQuestions = questionItems.length;

        if (totalQuestions === 0) {
            this.showEmptyMobilePreview();
            return;
        }

        // Validate and clamp currentPreviewQuestion to valid range
        this.currentPreviewQuestion = Math.max(0, Math.min(this.currentPreviewQuestion, totalQuestions - 1));

        // Update navigation
        this.updateMobilePreviewNavigation(totalQuestions);

        // Get current question data
        const currentQuestion = questionItems[this.currentPreviewQuestion];

        if (!currentQuestion) {
            logger.error(`Current question not found at index ${this.currentPreviewQuestion}`);
            return;
        }

        const questionData = this.extractQuestionDataForPreview(currentQuestion);
        questionData.questionNumber = this.currentPreviewQuestion + 1;
        questionData.totalQuestions = totalQuestions;

        // Use the same rendering as desktop preview
        this.previewRenderer.renderMobileQuestionPreview(questionData);

        // Render MathJax after content is ready - updated for new mobile preview structure
        setTimeout(() => {
            // Find the mobile preview container - updated selectors for redesigned structure
            const mobileContainer = document.querySelector('#mobile-preview-container .mobile-content') ||
                                   document.querySelector('#mobile-preview-container .preview-content') ||
                                   document.querySelector('#mobile-preview-container');

            if (mobileContainer && this.previewRenderer.mathJaxService) {
                logger.debug('Rendering MathJax for mobile preview container');
                this.previewRenderer.mathJaxService.renderAll(mobileContainer).then(() => {
                    logger.debug('Mobile preview MathJax rendering completed successfully');
                }).catch(error => {
                    logger.warn('Mobile preview MathJax rendering failed:', error);
                });
            } else {
                logger.warn('Mobile container or MathJax service not found for mobile preview rendering');
            }

            // Apply theme-aware styling to dynamically created answer options
            this.applyThemeAwareAnswerStyling();
        }, 300);
    }

    /**
     * Show empty mobile preview
     */
    showEmptyMobilePreview() {
        const previewText = document.getElementById('mobile-preview-question-text');
        const counterDisplay = document.getElementById('mobile-preview-question-counter-display');

        if (previewText) {
            previewText.textContent = translationManager.getTranslationSync('no_questions_to_preview') || 'No questions to preview';
        }
        if (counterDisplay) {
            counterDisplay.innerHTML = '<span data-translate="question">Question</span> 0 <span data-translate="of">of</span> 0';
        }

        // Hide all answer areas
        document.querySelectorAll('#mobile-preview-answer-area .preview-answer-type').forEach(type => {
            type.classList.add('hidden');
        });
    }

    /**
     * Update mobile preview navigation
     */
    updateMobilePreviewNavigation(totalQuestions) {
        const counterDisplay = document.getElementById('mobile-preview-question-counter-display');
        const prevBtn = document.getElementById('mobile-preview-prev');
        const nextBtn = document.getElementById('mobile-preview-next');

        const questionNumber = this.currentPreviewQuestion + 1;

        // Update counter display
        if (counterDisplay) {
            counterDisplay.innerHTML = `<span data-translate="question">Question</span> ${questionNumber} <span data-translate="of">of</span> ${totalQuestions}`;
        }

        // Update translations for the newly inserted content
        setTimeout(() => {
            translationManager?.updateGameTranslations?.();
        }, 50);

        if (prevBtn) {
            prevBtn.disabled = this.currentPreviewQuestion === 0;
        }
        if (nextBtn) {
            nextBtn.disabled = this.currentPreviewQuestion >= totalQuestions - 1;
        }
    }

    /**
     * Cleanup mobile preview listeners
     */
    cleanupMobilePreviewListeners() {
        // Mobile preview listeners are cleaned up when container is removed
        // Touch listeners are also removed with the container
    }

    /**
     * Apply theme-aware styling to dynamically created answer options while preserving colorful options
     */
    applyThemeAwareAnswerStyling() {
        const container = document.getElementById('mobile-preview-container');
        if (!container) return;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Only style non-colorful options (checkbox options should remain neutral)
        const checkboxOptions = container.querySelectorAll('.checkbox-option');
        checkboxOptions.forEach(option => {
            Object.assign(option.style, {
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)',
                border: isDark ? '2px solid rgba(255,255,255,0.2)' : '2px solid rgba(0,0,0,0.1)',
                color: isDark ? '#f0f6fc' : '#1e293b'
            });
        });

        // DON'T override .player-option styles - they should keep their colorful appearance
        // Just ensure text is readable on colorful backgrounds
        const colorfulOptions = container.querySelectorAll('.player-option');
        colorfulOptions.forEach(option => {
            // Only set text color, preserve background colors
            option.style.color = 'white'; // White text works on all colorful backgrounds
        });

        // Apply theme-appropriate colors to text elements but NOT to answer options
        const textElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span:not(.player-option *), div:not(.player-option):not(.mobile-nav-btn):not(.mobile-close-btn), label, input, textarea');
        textElements.forEach(element => {
            element.style.color = isDark ? '#f0f6fc' : '#1e293b';
        });

        logger.debug(`Applied theme-aware styling preserving colorful options: ${checkboxOptions.length} checkbox options, ${colorfulOptions.length} colorful options`);
    }

    /**
     * Check if preview mode is active
     */
    isPreviewMode() {
        return this.previewMode;
    }
}