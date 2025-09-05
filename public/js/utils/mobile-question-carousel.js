/**
 * Mobile Question Carousel - Horizontal navigation for quiz questions on mobile
 * Provides touch-friendly question navigation with arrow buttons and indicator dots
 */

class MobileQuestionCarousel {
    constructor() {
        this.currentIndex = 0;
        this.questions = [];
        this.isCarouselActive = false;
        this.carouselContainer = null;
        this.questionsWrapper = null;
        this.initialized = false;
    }

    /**
     * Initialize the mobile question carousel
     */
    init() {
        if (this.initialized) return;
        
        // Only initialize on mobile
        if (window.innerWidth > 768) return;
        
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
        
        console.debug('Mobile Question Carousel initialized and activated');
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
            addBtn.addEventListener('click', () => this.addQuestion());
        }
        
        // Navigation buttons - use setTimeout to ensure they exist
        setTimeout(() => {
            const prevBtn = document.getElementById('mobile-prev-btn');
            const nextBtn = document.getElementById('mobile-next-btn');
            
            if (prevBtn) {
                prevBtn.addEventListener('click', () => this.previousQuestion());
            }
            
            if (nextBtn) {
                nextBtn.addEventListener('click', () => this.nextQuestion());
            }
        }, 100);

        // Listen for question changes in the main editor
        const questionsContainer = document.getElementById('questions-container');
        if (questionsContainer) {
            const observer = new MutationObserver(() => {
                if (this.isCarouselActive) {
                    setTimeout(() => this.updateCarousel(), 50);
                }
            });
            
            observer.observe(questionsContainer, {
                childList: true,
                subtree: true
            });
        }
    }


    /**
     * Add a new question
     */
    addQuestion() {
        // Use the global addQuestion function or trigger the main add question button
        if (window.game && window.game.addQuestionAndScrollToIt) {
            window.game.addQuestionAndScrollToIt();
        } else if (document.getElementById('toolbar-add-question')) {
            document.getElementById('toolbar-add-question').click();
        } else {
            console.warn('Add question functionality not found');
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

        // Show current question (like preview system)
        this.showCurrentQuestion();
    }

    /**
     * Update indicator dots
     */
    updateIndicators() {
        const indicators = document.getElementById('mobile-question-indicators');
        if (!indicators) return;

        indicators.innerHTML = '';

        this.questions.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = 'mobile-question-dot';
            if (index === this.currentIndex) {
                dot.classList.add('active');
            }
            
            dot.addEventListener('click', () => this.navigateToQuestion(index));
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
            title.textContent = `Question ${this.currentIndex + 1} of ${this.questions.length}`;
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
            console.warn(`Question at index ${this.currentIndex} not found`);
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

        console.debug(`Showing question ${this.currentIndex + 1} of ${this.questions.length}`);
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
    }

    /**
     * Set up two-way synchronization between original and clone
     */
    setupTwoWaySync(original, clone) {
        const originalInputs = original.querySelectorAll('input, textarea, select');
        const cloneInputs = clone.querySelectorAll('input, textarea, select');
        
        cloneInputs.forEach((cloneInput, index) => {
            const originalInput = originalInputs[index];
            if (!originalInput) return;

            // Remove any existing listeners to avoid duplicates
            cloneInput.removeEventListener('input', this.syncToOriginal);
            cloneInput.removeEventListener('change', this.syncToOriginal);

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
        });
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

        console.debug(`Navigated to question ${index + 1} of ${this.questions.length}`);
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