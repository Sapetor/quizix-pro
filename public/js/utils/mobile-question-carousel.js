/**
 * Mobile Question Carousel - Horizontal navigation for quiz questions on mobile
 * Provides touch-friendly question navigation with arrow buttons and indicator dots
 */

import { getTranslation } from './translation-manager.js';
import { logger } from '../core/config.js';
import { isMobile } from './dom.js';

class MobileQuestionCarousel {
    constructor() {
        this.currentIndex = 0;
        this.questions = [];
        this.isCarouselActive = false;
        this.carouselContainer = null;
        this.questionsWrapper = null;
        this.initialized = false;

        // Track resources for cleanup
        this._mutationObserver = null;
        this._boundHandlers = {
            addBtn: null,
            prevBtn: null,
            nextBtn: null,
            dotClicks: []
        };
        this._syncListeners = []; // Track sync listeners for cleanup
    }

    /**
     * Initialize the mobile question carousel
     */
    init() {
        if (this.initialized) return;

        // Only initialize on mobile
        if (!isMobile()) return;

        this.createCarouselStructure();
        this.setupEventListeners();
        this.isCarouselActive = true; // Always active on mobile
        this.initialized = true;

        // Auto-activate carousel on mobile
        document.body.classList.add('mobile-carousel-active');

        // Delay initial update to ensure DOM is ready
        setTimeout(() => {
            this.updateCarousel();
        }, 100);

        logger.debug('Mobile Question Carousel initialized and activated');
    }

    /**
     * Create the carousel HTML structure
     */
    createCarouselStructure() {
        const quizEditorSection = document.querySelector('.quiz-editor-section');
        if (!quizEditorSection) return;

        // Create carousel container
        this.carouselContainer = document.createElement('div');
        this.carouselContainer.className = 'mobile-carousel-container';
        this.carouselContainer.innerHTML = `
            <div class="mobile-questions-carousel">
                <div class="mobile-question-nav">
                    <button class="mobile-add-question-btn" id="mobile-add-question-btn" title="Add Question">
                        ➕
                    </button>
                    <button class="mobile-nav-btn" id="mobile-prev-btn" title="Previous Question">
                        ←
                    </button>
                    <div class="mobile-question-title" id="mobile-question-title">
                        Question 1
                    </div>
                    <button class="mobile-nav-btn" id="mobile-next-btn" title="Next Question">
                        →
                    </button>
                </div>
                <div class="mobile-questions-wrapper" id="mobile-questions-wrapper">
                    <!-- Questions will be cloned here -->
                </div>
                <div class="mobile-question-indicators" id="mobile-question-indicators">
                    <!-- Indicator dots will be generated here -->
                </div>
            </div>
        `;

        // Insert carousel container after questions container
        const questionsContainer = document.getElementById('questions-container');
        if (questionsContainer && questionsContainer.parentNode) {
            questionsContainer.parentNode.insertBefore(this.carouselContainer, questionsContainer.nextSibling);
        }

        // Get wrapper reference
        this.questionsWrapper = document.getElementById('mobile-questions-wrapper');
    }

    /**
     * Setup event listeners for carousel controls
     */
    setupEventListeners() {
        // Add Question button
        const addBtn = document.getElementById('mobile-add-question-btn');
        if (addBtn) {
            this._boundHandlers.addBtn = () => this.addQuestion();
            addBtn.addEventListener('click', this._boundHandlers.addBtn);
        }

        // Navigation buttons - use setTimeout to ensure they exist
        setTimeout(() => {
            const prevBtn = document.getElementById('mobile-prev-btn');
            const nextBtn = document.getElementById('mobile-next-btn');

            if (prevBtn) {
                this._boundHandlers.prevBtn = () => this.previousQuestion();
                prevBtn.addEventListener('click', this._boundHandlers.prevBtn);
            }

            if (nextBtn) {
                this._boundHandlers.nextBtn = () => this.nextQuestion();
                nextBtn.addEventListener('click', this._boundHandlers.nextBtn);
            }
        }, 100);

        // Listen for question changes in the main editor
        const questionsContainer = document.getElementById('questions-container');
        if (questionsContainer) {
            // Store observer reference for cleanup
            this._mutationObserver = new MutationObserver(() => {
                if (this.isCarouselActive) {
                    setTimeout(() => this.updateCarousel(), 50);
                }
            });

            this._mutationObserver.observe(questionsContainer, {
                childList: true,
                subtree: true
            });
        }
    }


    /**
     * Add a new question
     */
    addQuestion() {
        // Trigger the main add question button (decoupled from window.game)
        const addBtn = document.getElementById('toolbar-add-question');
        if (addBtn) {
            addBtn.click();
        } else {
            logger.warn('Add question button not found');
        }

        // Update carousel after adding question
        setTimeout(() => {
            this.updateCarousel();
            // Navigate to the last (newly added) question
            if (this.questions.length > 0) {
                this.navigateToQuestion(this.questions.length - 1);
            }
        }, 200);
    }

    /**
     * Update carousel with current questions - Show/Hide approach like preview
     */
    updateCarousel() {
        if (!this.isCarouselActive || !this.questionsWrapper) return;

        // Get all questions from the main container - work with originals, not clones
        const mainQuestions = document.querySelectorAll('#questions-container .question-item');
        this.questions = Array.from(mainQuestions);

        if (this.questions.length === 0) {
            // If no questions, show a placeholder
            this.questionsWrapper.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No questions yet. Click + to add one!</div>';
            this.updateIndicators();
            this.updateNavigation();
            return;
        }

        // Update indicators
        this.updateIndicators();

        // Update navigation
        this.updateNavigation();

        // Delay showing current question to ensure quiz data is fully populated
        // This fixes the issue where alternatives don't appear on mobile
        setTimeout(() => {
            this.showCurrentQuestion();
        }, 150); // Slightly longer than the 100ms delay in populateTypeSpecificData
    }

    /**
     * Update indicator dots
     */
    updateIndicators() {
        const indicators = document.getElementById('mobile-question-indicators');
        if (!indicators) return;

        // Clean up old dot listeners before recreating
        this._boundHandlers.dotClicks.forEach(({ dot, handler }) => {
            dot.removeEventListener('click', handler);
        });
        this._boundHandlers.dotClicks = [];

        indicators.innerHTML = '';

        this.questions.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = 'mobile-question-dot';
            if (index === this.currentIndex) {
                dot.classList.add('active');
            }

            const handler = () => this.navigateToQuestion(index);
            dot.addEventListener('click', handler);
            this._boundHandlers.dotClicks.push({ dot, handler });
            indicators.appendChild(dot);
        });
    }

    /**
     * Update navigation buttons and title
     */
    updateNavigation() {
        const prevBtn = document.getElementById('mobile-prev-btn');
        const nextBtn = document.getElementById('mobile-next-btn');
        const title = document.getElementById('mobile-question-title');

        if (prevBtn) {
            prevBtn.disabled = this.currentIndex === 0;
        }

        if (nextBtn) {
            nextBtn.disabled = this.currentIndex === this.questions.length - 1;
        }

        if (title) {
            title.textContent = getTranslation('question_x_of_y', [this.currentIndex + 1, this.questions.length]);
        }
    }

    /**
     * Show current question using show/hide approach (like preview system)
     */
    showCurrentQuestion() {
        if (!this.questions || this.questions.length === 0) return;

        // Validate and clamp currentIndex
        if (this.currentIndex < 0) this.currentIndex = 0;
        if (this.currentIndex >= this.questions.length) this.currentIndex = this.questions.length - 1;

        // Clear carousel wrapper
        this.questionsWrapper.innerHTML = '';

        // Get the current question from original container
        const currentQuestion = this.questions[this.currentIndex];
        if (!currentQuestion) {
            logger.warn(`Question at index ${this.currentIndex} not found`);
            return;
        }

        // Clone the current question and add it to carousel
        const clonedQuestion = currentQuestion.cloneNode(true);
        clonedQuestion.classList.add('mobile-question-active');

        // Copy form values from original to clone
        this.syncFormValues(currentQuestion, clonedQuestion);

        // Set up two-way sync between original and clone
        this.setupTwoWaySync(currentQuestion, clonedQuestion);

        this.questionsWrapper.appendChild(clonedQuestion);

        logger.debug(`Showing question ${this.currentIndex + 1} of ${this.questions.length}`);
    }

    /**
     * Sync form values from original to clone
     */
    syncFormValues(original, clone) {
        const originalInputs = original.querySelectorAll('input, textarea, select');
        const cloneInputs = clone.querySelectorAll('input, textarea, select');

        originalInputs.forEach((input, index) => {
            if (cloneInputs[index]) {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    cloneInputs[index].checked = input.checked;
                } else {
                    cloneInputs[index].value = input.value;
                }
            }
        });

        // Additional sync for question options that might not be captured above
        // Specifically sync multiple choice options
        const originalOptions = original.querySelectorAll('.option');
        const cloneOptions = clone.querySelectorAll('.option');
        originalOptions.forEach((option, index) => {
            if (cloneOptions[index]) {
                cloneOptions[index].value = option.value;
            }
        });

        logger.debug('Form values synced from original to clone, including question options');
    }

    /**
     * Set up two-way synchronization between original and clone
     */
    setupTwoWaySync(original, clone) {
        // Clean up previous sync listeners before adding new ones
        this._cleanupSyncListeners();

        const originalInputs = original.querySelectorAll('input, textarea, select');
        const cloneInputs = clone.querySelectorAll('input, textarea, select');

        cloneInputs.forEach((cloneInput, index) => {
            const originalInput = originalInputs[index];
            if (!originalInput) return;

            // Create sync function for this specific pair
            const syncToOriginal = () => {
                if (originalInput.type === 'checkbox' || originalInput.type === 'radio') {
                    originalInput.checked = cloneInput.checked;
                } else {
                    originalInput.value = cloneInput.value;
                }
                // Trigger change event on original to update other systems
                originalInput.dispatchEvent(new Event('change', { bubbles: true }));
            };

            // Add event listeners for real-time sync
            cloneInput.addEventListener('input', syncToOriginal);
            cloneInput.addEventListener('change', syncToOriginal);

            // Track for cleanup
            this._syncListeners.push(
                { element: cloneInput, type: 'input', handler: syncToOriginal },
                { element: cloneInput, type: 'change', handler: syncToOriginal }
            );
        });
    }

    /**
     * Clean up sync listeners from previous question
     */
    _cleanupSyncListeners() {
        this._syncListeners.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        this._syncListeners = [];
    }

    /**
     * Navigate to specific question
     */
    navigateToQuestion(index) {
        if (!this.questions || index < 0 || index >= this.questions.length) return;

        this.currentIndex = index;

        // Show the selected question
        this.showCurrentQuestion();

        // Update indicators
        const dots = document.querySelectorAll('.mobile-question-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });

        // Update navigation
        this.updateNavigation();

        logger.debug(`Navigated to question ${index + 1} of ${this.questions.length}`);
    }

    /**
     * Navigate to previous question
     */
    previousQuestion() {
        if (this.currentIndex > 0) {
            this.navigateToQuestion(this.currentIndex - 1);
        }
    }

    /**
     * Navigate to next question
     */
    nextQuestion() {
        if (this.currentIndex < this.questions.length - 1) {
            this.navigateToQuestion(this.currentIndex + 1);
        }
    }

    /**
     * Get current question index
     */
    getCurrentIndex() {
        return this.currentIndex;
    }

    /**
     * Get total number of questions
     */
    getQuestionCount() {
        return this.questions.length;
    }

    /**
     * Check if carousel is active
     */
    isActive() {
        return this.isCarouselActive;
    }

    /**
     * Destroy carousel and clean up all resources
     */
    destroy() {
        // Disconnect mutation observer
        if (this._mutationObserver) {
            this._mutationObserver.disconnect();
            this._mutationObserver = null;
        }

        // Clean up sync listeners
        this._cleanupSyncListeners();

        // Remove button event listeners
        const addBtn = document.getElementById('mobile-add-question-btn');
        if (addBtn && this._boundHandlers.addBtn) {
            addBtn.removeEventListener('click', this._boundHandlers.addBtn);
        }

        const prevBtn = document.getElementById('mobile-prev-btn');
        if (prevBtn && this._boundHandlers.prevBtn) {
            prevBtn.removeEventListener('click', this._boundHandlers.prevBtn);
        }

        const nextBtn = document.getElementById('mobile-next-btn');
        if (nextBtn && this._boundHandlers.nextBtn) {
            nextBtn.removeEventListener('click', this._boundHandlers.nextBtn);
        }

        // Remove dot click listeners
        this._boundHandlers.dotClicks.forEach(({ dot, handler }) => {
            dot.removeEventListener('click', handler);
        });
        this._boundHandlers.dotClicks = [];

        // Remove carousel container from DOM
        if (this.carouselContainer && this.carouselContainer.parentNode) {
            this.carouselContainer.parentNode.removeChild(this.carouselContainer);
        }

        // Reset state
        this.carouselContainer = null;
        this.questionsWrapper = null;
        this.questions = [];
        this.currentIndex = 0;
        this.isCarouselActive = false;
        this.initialized = false;

        document.body.classList.remove('mobile-carousel-active');

        logger.debug('MobileQuestionCarousel destroyed and cleaned up');
    }
}

// Create global instance
const mobileQuestionCarousel = new MobileQuestionCarousel();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        mobileQuestionCarousel.init();
    });
} else {
    mobileQuestionCarousel.init();
}

// Make globally accessible
window.mobileQuestionCarousel = mobileQuestionCarousel;

export { MobileQuestionCarousel, mobileQuestionCarousel };