/**
 * Modal Feedback System
 * Replaces inline feedback with modal popups to prevent scrolling issues on mobile
 */

import { logger, ANIMATION } from '../core/config.js';
import { getTranslation } from './translation-manager.js';
import { simpleMathJaxService } from './simple-mathjax-service.js';

export class ModalFeedback {
    constructor() {
        this.overlay = null;
        this.modal = null;
        this.feedbackIcon = null;
        this.feedbackText = null;
        this.scoreDisplay = null;
        this.explanationDisplay = null;
        this.currentTimer = null;
        
        this.initializeElements();
        this.setupEventListeners();
        
        logger.debug('🎭 Modal Feedback System initialized');
    }

    /**
     * Initialize DOM elements for the modal feedback
     */
    initializeElements() {
        this.overlay = document.getElementById('feedback-modal-overlay');
        this.modal = document.getElementById('feedback-modal');
        this.feedbackIcon = document.getElementById('feedback-icon');
        this.feedbackText = document.getElementById('modal-feedback-text');
        this.scoreDisplay = document.getElementById('modal-score-display');
        this.explanationDisplay = document.getElementById('modal-explanation');

        if (!this.overlay || !this.modal) {
            logger.error('❌ Modal feedback elements not found in DOM');
            return false;
        }

        return true;
    }

    /**
     * Setup event listeners for modal interactions
     */
    setupEventListeners() {
        if (!this.overlay) return;

        // Close modal on overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });

        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
                this.hide();
            }
        });

        // Prevent modal from closing when clicking inside the modal
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    /**
     * Show feedback modal with specified state
     * @param {boolean} isCorrect - Whether the answer was correct
     * @param {string} message - Custom feedback message
     * @param {number} score - Score to display
     * @param {number} autoDismissTime - Time in milliseconds to auto-dismiss (default: 3000)
     * @param {string} explanation - Explanation text (optional)
     */
    show(isCorrect, message = null, score = null, autoDismissTime = 3000, explanation = null) {
        if (!this.overlay || !this.modal) {
            logger.error('❌ Cannot show modal feedback - elements not initialized');
            return;
        }

        // Clear any existing timer
        if (this.currentTimer) {
            clearTimeout(this.currentTimer);
            this.currentTimer = null;
        }

        // Set modal state
        this.modal.className = 'feedback-modal';
        this.modal.classList.add(isCorrect ? 'correct' : 'incorrect');

        // Add class if explanation is present (for styling)
        if (explanation) {
            this.modal.classList.add('has-explanation');
        }

        // Set feedback content
        this.updateContent(isCorrect, message, score, explanation);

        // Show modal with animation
        this.overlay.classList.add('active');

        // Prevent body scrolling when modal is open
        document.body.style.overflow = 'hidden';

        // Auto-dismiss after specified time
        if (autoDismissTime > 0) {
            this.currentTimer = setTimeout(() => {
                this.hide();
            }, autoDismissTime);
        }

        logger.debug(`🎭 Modal feedback shown: ${isCorrect ? 'correct' : 'incorrect'}`);
    }

    /**
     * Update modal content based on feedback type
     * @param {boolean} isCorrect - Whether the answer was correct
     * @param {string} message - Custom feedback message
     * @param {number} score - Score to display
     * @param {string} explanation - Explanation text (optional)
     */
    updateContent(isCorrect, message, score, explanation = null) {
        // Set feedback icon - no rotating emoji for correct answers
        if (this.feedbackIcon) {
            this.feedbackIcon.textContent = isCorrect ? '🎉' : '❌';
            // Force remove any animation classes
            this.feedbackIcon.style.animation = 'none';
            this.feedbackIcon.style.transform = 'none';
        }

        // Set feedback message
        if (this.feedbackText) {
            const feedbackMessage = message || (isCorrect
                ? getTranslation('correct_answer') || 'Correct!'
                : getTranslation('incorrect_answer') || 'Incorrect!');
            this.feedbackText.textContent = feedbackMessage;
        }

        // Set score display
        if (this.scoreDisplay && score !== null) {
            this.scoreDisplay.textContent = `+${score}`;
            this.scoreDisplay.style.display = 'inline-block';
        } else if (this.scoreDisplay) {
            this.scoreDisplay.style.display = 'none';
        }

        // Set explanation display
        if (this.explanationDisplay) {
            if (explanation && explanation.trim()) {
                // Use escapeHtmlPreservingLatex to allow MathJax to render formulas
                this.explanationDisplay.innerHTML = `<span class="explanation-label">💡</span><span class="explanation-text">${this.escapeHtmlPreservingLatex(explanation)}</span>`;
                this.explanationDisplay.style.display = 'block';

                // Render MathJax for the explanation text
                const textSpan = this.explanationDisplay.querySelector('.explanation-text');
                if (textSpan) {
                    simpleMathJaxService.render([textSpan]).catch(err => {
                        logger.debug('MathJax render in modal explanation (non-blocking):', err);
                    });
                }
            } else {
                this.explanationDisplay.style.display = 'none';
                this.explanationDisplay.innerHTML = '';
            }
        }
    }

    /**
     * Escape HTML but preserve LaTeX delimiters for MathJax
     * @param {string} text - Text to escape
     * @returns {string} Escaped text with LaTeX preserved
     */
    escapeHtmlPreservingLatex(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Escape HTML completely for safe display
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Hide the feedback modal
     */
    hide() {
        if (!this.overlay) return;

        // Clear auto-dismiss timer
        if (this.currentTimer) {
            clearTimeout(this.currentTimer);
            this.currentTimer = null;
        }

        // Hide modal with animation
        this.overlay.classList.remove('active');

        // Restore body scrolling
        document.body.style.overflow = '';

        logger.debug('🎭 Modal feedback hidden');
    }

    /**
     * Show correct answer feedback with confetti animation
     * @param {string} message - Custom message (optional)
     * @param {number} score - Score to display (optional)
     * @param {number} autoDismissTime - Auto-dismiss time in ms (default: 3000)
     * @param {string} explanation - Explanation text (optional)
     */
    showCorrect(message = null, score = null, autoDismissTime = 3000, explanation = null) {
        this.show(true, message, score, autoDismissTime, explanation);

        // Add confetti animation on top of the modal
        this.triggerModalConfetti();
    }
    
    /**
     * Trigger confetti animation positioned over the modal feedback
     */
    triggerModalConfetti() {
        if (typeof confetti === 'function') {
            logger.debug('🎊 CONFETTI DEBUG: Starting modal confetti animation with z-index 99999');
            logger.debug('CONFETTI DEBUG: Modal confetti triggered!');
            
            // Create confetti canvas that sits above everything
            const confettiCanvas = document.createElement('canvas');
            confettiCanvas.style.position = 'fixed';
            confettiCanvas.style.top = '0';
            confettiCanvas.style.left = '0';
            confettiCanvas.style.width = '100vw';
            confettiCanvas.style.height = '100vh';
            confettiCanvas.style.zIndex = '2147483647'; // Maximum possible z-index to ensure it's above everything including backdrop-filter
            confettiCanvas.style.pointerEvents = 'none';
            confettiCanvas.style.background = 'transparent';
            
            // Try appending to modal overlay to inherit correct stacking context
            if (this.overlay && this.overlay.classList.contains('active')) {
                this.overlay.appendChild(confettiCanvas);
                logger.debug('CONFETTI DEBUG: Canvas appended to modal overlay to avoid backdrop-filter blur');
            } else {
                document.body.appendChild(confettiCanvas);
                logger.debug('CONFETTI DEBUG: Canvas appended to body (fallback) with z-index:', confettiCanvas.style.zIndex);
            }
            
            // Create confetti instance targeting our canvas
            const confettiInstance = confetti.create(confettiCanvas, {
                resize: true,
                useWorker: true
            });
            
            // Get modal position for confetti targeting
            const modalRect = this.modal ? this.modal.getBoundingClientRect() : null;
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            
            // Calculate confetti origin relative to modal
            const originY = modalRect ? (modalRect.top / viewportHeight) - 0.1 : 0.1; // Above modal
            const originX = modalRect ? (modalRect.left + modalRect.width / 2) / viewportWidth : 0.5; // Center of modal
            
            // Main burst over the modal - much bigger and more prominent
            confettiInstance({
                particleCount: 150, // Much more particles for visibility
                spread: 90,
                origin: { y: Math.max(0.05, originY), x: originX },
                colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
                gravity: 0.6, // Slower fall for more visibility
                scalar: 1.5, // Bigger particles
                startVelocity: 60 // More explosive burst
            });
            
            // Side bursts for extra celebration - more prominent
            setTimeout(() => {
                confettiInstance({
                    particleCount: 50,
                    angle: 60,
                    spread: 60,
                    origin: { y: Math.max(0.05, originY), x: Math.max(0.1, originX - 0.3) },
                    colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'],
                    gravity: 0.6,
                    scalar: 1.3,
                    startVelocity: 50
                });
                
                confettiInstance({
                    particleCount: 50,
                    angle: 120,
                    spread: 60,
                    origin: { y: Math.max(0.05, originY), x: Math.min(0.9, originX + 0.3) },
                    colors: ['#ff00ff', '#00ffff', '#ffff00', '#00ff00'],
                    gravity: 0.6,
                    scalar: 1.3,
                    startVelocity: 50
                });
            }, 200);
            
            // Remove canvas after animation completes
            setTimeout(() => {
                if (confettiCanvas && confettiCanvas.parentNode) {
                    confettiCanvas.parentNode.removeChild(confettiCanvas);
                }
            }, 4000);
        } else {
            logger.debug('Confetti function not available for modal feedback');
        }
    }

    /**
     * Show incorrect answer feedback
     * @param {string} message - Custom message (optional)
     * @param {number} score - Score to display (optional)
     * @param {number} autoDismissTime - Auto-dismiss time in ms (default: 3000)
     * @param {string} explanation - Explanation text (optional)
     */
    showIncorrect(message = null, score = null, autoDismissTime = 3000, explanation = null) {
        this.show(false, message, score, autoDismissTime, explanation);
    }

    /**
     * Show partially correct answer feedback (for ordering questions with partial credit)
     * @param {string} message - Custom message (optional)
     * @param {number} score - Score to display (optional)
     * @param {number} autoDismissTime - Auto-dismiss time in ms (default: 3000)
     * @param {string} explanation - Explanation text (optional)
     * @param {number} partialScore - Partial score as decimal 0-1 (optional, for display)
     */
    showPartial(message = null, score = null, autoDismissTime = 3000, explanation = null, partialScore = null) {
        if (!this.overlay || !this.modal) {
            logger.error('❌ Cannot show modal feedback - elements not initialized');
            return;
        }

        // Clear any existing timer
        if (this.currentTimer) {
            clearTimeout(this.currentTimer);
            this.currentTimer = null;
        }

        // Set modal state to partial
        this.modal.className = 'feedback-modal';
        this.modal.classList.add('partial');

        if (explanation) {
            this.modal.classList.add('has-explanation');
        }

        // Set partial feedback content
        this.updatePartialContent(message, score, explanation, partialScore);

        // Show modal with animation
        this.overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Auto-dismiss after specified time
        if (autoDismissTime > 0) {
            this.currentTimer = setTimeout(() => {
                this.hide();
            }, autoDismissTime);
        }

        logger.debug('🎭 Modal feedback shown: partial');
    }

    /**
     * Update modal content for partial correctness
     */
    updatePartialContent(message, score, explanation, partialScore) {
        // Set feedback icon - partial gets a "so-so" emoji
        if (this.feedbackIcon) {
            this.feedbackIcon.textContent = '🔶';
            this.feedbackIcon.style.animation = 'none';
            this.feedbackIcon.style.transform = 'none';
        }

        // Set feedback message
        if (this.feedbackText) {
            const percentText = partialScore !== null ? ` (${Math.round(partialScore * 100)}%)` : '';
            const feedbackMessage = message || (getTranslation('partially_correct') || 'Partially Correct!') + percentText;
            this.feedbackText.textContent = feedbackMessage;
        }

        // Set score display
        if (this.scoreDisplay && score !== null && score > 0) {
            this.scoreDisplay.textContent = `+${score}`;
            this.scoreDisplay.style.display = 'inline-block';
        } else if (this.scoreDisplay) {
            this.scoreDisplay.style.display = 'none';
        }

        // Set explanation display
        if (this.explanationDisplay) {
            if (explanation && explanation.trim()) {
                this.explanationDisplay.innerHTML = `<span class="explanation-label">💡</span><span class="explanation-text">${this.escapeHtmlPreservingLatex(explanation)}</span>`;
                this.explanationDisplay.style.display = 'block';

                const textSpan = this.explanationDisplay.querySelector('.explanation-text');
                if (textSpan) {
                    simpleMathJaxService.render([textSpan]).catch(err => {
                        logger.debug('MathJax render in modal explanation (non-blocking):', err);
                    });
                }
            } else {
                this.explanationDisplay.style.display = 'none';
                this.explanationDisplay.innerHTML = '';
            }
        }
    }

    /**
     * Show answer submission feedback with neutral styling
     * @param {string} message - Submission message (required)
     * @param {number} autoDismissTime - Auto-dismiss time in ms (default: 2000)
     */
    showSubmission(message, autoDismissTime = 2000) {
        if (!this.overlay || !this.modal) {
            logger.error('❌ Cannot show modal feedback - elements not initialized');
            return;
        }

        // Clear any existing timer
        if (this.currentTimer) {
            clearTimeout(this.currentTimer);
            this.currentTimer = null;
        }

        // Set modal state - neutral styling
        this.modal.className = 'feedback-modal submission';

        // Set submission-specific content
        this.updateSubmissionContent(message);

        // Show modal with animation
        this.overlay.classList.add('active');

        // Prevent body scrolling when modal is open
        document.body.style.overflow = 'hidden';

        // Auto-dismiss after specified time
        if (autoDismissTime > 0) {
            this.currentTimer = setTimeout(() => {
                this.hide();
            }, autoDismissTime);
        }

        logger.debug(`🎭 Modal submission feedback shown: ${message}`);
    }

    /**
     * Update modal content for submission feedback
     * @param {string} message - Submission message
     */
    updateSubmissionContent(message) {
        // Set exciting submission icon - rotate through different ones for variety
        if (this.feedbackIcon) {
            const submissionIcons = ['🚀', '⚡', '🎯', '💫', '✨', '🔥'];
            const randomIcon = submissionIcons[Math.floor(Math.random() * submissionIcons.length)];
            this.feedbackIcon.textContent = randomIcon; // Random exciting icon for answer submission!
            // Force remove any animation classes
            this.feedbackIcon.style.animation = 'none';
            this.feedbackIcon.style.transform = 'none';
        }

        // Set submission message
        if (this.feedbackText) {
            this.feedbackText.textContent = message;
        }

        // Hide score display for submissions
        if (this.scoreDisplay) {
            this.scoreDisplay.style.display = 'none';
        }
    }

    /**
     * Check if modal is currently visible
     * @returns {boolean} True if modal is visible
     */
    isVisible() {
        return this.overlay && this.overlay.classList.contains('active');
    }

    /**
     * Cleanup method to remove event listeners
     */
    destroy() {
        if (this.currentTimer) {
            clearTimeout(this.currentTimer);
            this.currentTimer = null;
        }

        // Remove event listeners would go here if we tracked them
        // For now, they're attached to DOM elements that will be cleaned up automatically

        logger.debug('🎭 Modal Feedback System destroyed');
    }
}

// Create singleton instance
export const modalFeedback = new ModalFeedback();

// Make available globally for debugging
if (typeof window !== 'undefined') {
    window.modalFeedback = modalFeedback;
}

export default modalFeedback;