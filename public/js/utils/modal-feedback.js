/**
 * Modal Feedback System
 * Replaces inline feedback with modal popups to prevent scrolling issues on mobile
 */

import { logger } from '../core/config.js';
import { getTranslation } from './translation-manager.js';
import { simpleMathJaxService } from './simple-mathjax-service.js';
import { escapeHtmlPreservingLatex } from './dom.js';
import {
    openModal,
    closeModal,
    isModalOpen,
    createModalBindings,
    preventContentClose,
    MODAL_MODES
} from './modal-utils.js';

/**
 * The submission confirmation and the result share one overlay, so a round that
 * ends right after the last answer used to swap one modal for the other within
 * ~1.5s of the tap. Two constants keep that from reading as a flash:
 *
 *  - the tapped tile locks into `.selected` immediately, so the confirmation
 *    modal is only worth rendering to a player who is actually left waiting —
 *    it is deferred this long, and dropped outright if a result arrives first
 *    (the server reveals ~1.1s after the last answer, see
 *    QuestionFlowService.endQuestionEarly);
 *  - if it did render, it holds the overlay this long before a result may take
 *    it over, so a result landing just past the defer window cannot flash it
 *    away either.
 */
export const SUBMISSION_DEFER_MS = 1200;
export const SUBMISSION_MIN_VISIBLE_MS = 800;

export class ModalFeedback {
    constructor() {
        this.overlay = null;
        this.modal = null;
        this.feedbackIcon = null;
        this.feedbackText = null;
        this.scoreDisplay = null;
        this.explanationDisplay = null;
        this.playerAnswerDisplay = null;
        this.currentTimer = null;
        this.modalBindings = null;
        this.contentHandler = null;
        this.pendingSubmissionTimer = null;
        this.submissionShownAt = 0;
        this.deferredResultTimer = null;

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
        this.playerAnswerDisplay = document.getElementById('modal-player-answer');

        if (!this.overlay || !this.modal) {
            logger.error('❌ Modal feedback elements not found in DOM');
            return false;
        }

        return true;
    }

    /**
     * Setup event listeners for modal interactions using modal-utils
     */
    setupEventListeners() {
        if (!this.overlay) return;

        // Create modal bindings for overlay click and escape key
        this.modalBindings = createModalBindings(
            this.overlay,
            () => this.hide(),
            { mode: MODAL_MODES.CLASS, activeClass: 'active' }
        );

        // Prevent modal from closing when clicking inside the modal
        if (this.modal) {
            this.contentHandler = preventContentClose(this.modal);
        }
    }

    /**
     * Take the overlay for a result, cancelling a confirmation that has not been
     * rendered yet.
     * @returns {number} ms the caller must wait before rendering (0 = render now)
     */
    claimOverlayForResult() {
        if (this.pendingSubmissionTimer) {
            // Round ended before the player was left waiting — the confirmation
            // is no longer worth showing at all.
            clearTimeout(this.pendingSubmissionTimer);
            this.pendingSubmissionTimer = null;
            return 0;
        }

        if (!this.submissionShownAt) return 0;

        return Math.max(0, SUBMISSION_MIN_VISIBLE_MS - (Date.now() - this.submissionShownAt));
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

        const wait = this.claimOverlayForResult();
        if (wait > 0) {
            clearTimeout(this.deferredResultTimer);
            this.deferredResultTimer = setTimeout(() => {
                this.deferredResultTimer = null;
                this.show(isCorrect, message, score, autoDismissTime, explanation);
            }, wait);
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

        // Show modal with animation using modal-utils
        openModal(this.overlay, { mode: MODAL_MODES.CLASS, activeClass: 'active', lockScroll: true });

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
        // Set feedback icon - CSS handles animation reset via .feedback-icon styles
        if (this.feedbackIcon) {
            this.feedbackIcon.textContent = isCorrect ? '🎉' : '❌';
        }

        // Set feedback message
        if (this.feedbackText) {
            const feedbackMessage = message || (isCorrect
                ? getTranslation('correct_answer') || 'Correct!'
                : getTranslation('incorrect_answer') || 'Incorrect!');
            this.feedbackText.textContent = feedbackMessage;
        }

        // Set score display - use has-score class instead of inline style
        if (this.scoreDisplay && score !== null) {
            this.scoreDisplay.textContent = `+${score}`;
            this.modal.classList.add('has-score');
        } else {
            this.modal.classList.remove('has-score');
        }

        this.renderExplanation(explanation);
    }

    /**
     * Render the explanation slot. CSS handles visibility via has-explanation.
     * @param {string} explanation - Explanation text (may be empty/null)
     */
    renderExplanation(explanation) {
        if (!this.explanationDisplay) return;

        if (!explanation || !explanation.trim()) {
            this.explanationDisplay.innerHTML = '';
            return;
        }

        // Use escapeHtmlPreservingLatex to allow MathJax to render formulas
        this.explanationDisplay.innerHTML = `<span class="explanation-label">💡</span><span class="explanation-text">${escapeHtmlPreservingLatex(explanation)}</span>`;

        // Render MathJax for the explanation text
        const textSpan = this.explanationDisplay.querySelector('.explanation-text');
        if (textSpan) {
            simpleMathJaxService.render([textSpan]).catch(err => {
                logger.debug('MathJax render in modal explanation (non-blocking):', err);
            });
        }
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

        // A confirmation that has not rendered yet is moot once the overlay is
        // dismissed. A result waiting out the confirmation's minimum visible
        // time is not — dropping it would cost the player their score modal.
        this.cancelPendingSubmission();

        // Hide modal with animation using modal-utils
        closeModal(this.overlay, { mode: MODAL_MODES.CLASS, activeClass: 'active', unlockScroll: true });

        logger.debug('🎭 Modal feedback hidden');
    }

    /**
     * Drop a confirmation that has not rendered yet.
     */
    cancelPendingSubmission() {
        clearTimeout(this.pendingSubmissionTimer);
        this.pendingSubmissionTimer = null;
        this.submissionShownAt = 0;
    }

    /**
     * Drop every render still waiting on a timer, so nothing from the finished
     * question can surface on the next one.
     */
    cancelDeferredRenders() {
        this.cancelPendingSubmission();
        clearTimeout(this.deferredResultTimer);
        this.deferredResultTimer = null;
    }

    /**
     * Set the player's submitted answer text inside the modal.
     * @param {string} answerText - Formatted answer string (e.g. "B", "True", "42")
     */
    setPlayerAnswer(answerText) {
        if (!this.playerAnswerDisplay) return;
        if (!answerText) {
            this.modal?.classList.remove('has-player-answer');
            this.playerAnswerDisplay.textContent = '';
            return;
        }
        const label = getTranslation('your_answer') || 'Your answer';
        this.playerAnswerDisplay.textContent = `${label}: ${answerText}`;
        this.modal?.classList.add('has-player-answer');
    }

    /**
     * Clear all modal content to prevent stale data display
     * Called when starting a new question to ensure clean state
     */
    clearContent() {
        this.cancelDeferredRenders();

        if (this.feedbackIcon) {
            this.feedbackIcon.textContent = '';
        }
        if (this.feedbackText) {
            this.feedbackText.textContent = '';
        }
        if (this.scoreDisplay) {
            this.scoreDisplay.textContent = '';
        }
        if (this.explanationDisplay) {
            this.explanationDisplay.innerHTML = '';
        }
        if (this.playerAnswerDisplay) {
            this.playerAnswerDisplay.textContent = '';
        }
        // Remove all state classes (correct, incorrect, partial, has-score, has-explanation, has-player-answer)
        if (this.modal) {
            this.modal.className = 'feedback-modal';
        }
        logger.debug('🎭 Modal feedback content cleared');
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
            logger.debug('🎊 CONFETTI DEBUG: Starting modal confetti animation');

            // Create confetti canvas using CSS class for styling
            const confettiCanvas = document.createElement('canvas');
            confettiCanvas.className = 'confetti-canvas';

            // Append to modal overlay for correct stacking context, or body as fallback
            if (this.overlay && this.overlay.classList.contains('active')) {
                this.overlay.appendChild(confettiCanvas);
                logger.debug('CONFETTI DEBUG: Canvas appended to modal overlay');
            } else {
                document.body.appendChild(confettiCanvas);
                logger.debug('CONFETTI DEBUG: Canvas appended to body (fallback)');
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
     * Show neutral feedback — the response was recorded but is neither right nor
     * wrong (poll questions). No score, no verdict icon, no result sound.
     * @param {string} message - Custom message (optional)
     * @param {number} autoDismissTime - Auto-dismiss time in ms (default: 3000)
     * @param {string} explanation - Explanation text (optional)
     */
    showNeutral(message = null, autoDismissTime = 3000, explanation = null) {
        if (!this.overlay || !this.modal) {
            logger.error('❌ Cannot show modal feedback - elements not initialized');
            return;
        }

        const wait = this.claimOverlayForResult();
        if (wait > 0) {
            clearTimeout(this.deferredResultTimer);
            this.deferredResultTimer = setTimeout(() => {
                this.deferredResultTimer = null;
                this.showNeutral(message, autoDismissTime, explanation);
            }, wait);
            return;
        }

        if (this.currentTimer) {
            clearTimeout(this.currentTimer);
            this.currentTimer = null;
        }

        this.modal.className = 'feedback-modal';
        this.modal.classList.add('neutral');
        if (explanation) {
            this.modal.classList.add('has-explanation');
        }

        if (this.feedbackIcon) {
            this.feedbackIcon.textContent = '🗳️';
        }
        if (this.feedbackText) {
            this.feedbackText.textContent = message
                || getTranslation('poll_answer_recorded')
                || 'Answer recorded';
        }
        // A poll awards nothing, so the score slot stays empty
        if (this.scoreDisplay) {
            this.scoreDisplay.textContent = '';
        }
        this.modal.classList.remove('has-score');
        this.renderExplanation(explanation);

        openModal(this.overlay, { mode: MODAL_MODES.CLASS, activeClass: 'active', lockScroll: true });

        if (autoDismissTime > 0) {
            this.currentTimer = setTimeout(() => {
                this.hide();
            }, autoDismissTime);
        }

        logger.debug('🎭 Modal feedback shown: neutral (poll)');
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

        const wait = this.claimOverlayForResult();
        if (wait > 0) {
            clearTimeout(this.deferredResultTimer);
            this.deferredResultTimer = setTimeout(() => {
                this.deferredResultTimer = null;
                this.showPartial(message, score, autoDismissTime, explanation, partialScore);
            }, wait);
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

        // Show modal with animation using modal-utils
        openModal(this.overlay, { mode: MODAL_MODES.CLASS, activeClass: 'active', lockScroll: true });

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
        // Set feedback icon - CSS handles animation reset via .feedback-icon styles
        if (this.feedbackIcon) {
            this.feedbackIcon.textContent = '🔶';
        }

        // Set feedback message
        if (this.feedbackText) {
            const percentText = partialScore !== null ? ` (${Math.round(partialScore * 100)}%)` : '';
            const feedbackMessage = message || (getTranslation('partially_correct') || 'Partially Correct!') + percentText;
            this.feedbackText.textContent = feedbackMessage;
        }

        // Set score display - use has-score class instead of inline style
        if (this.scoreDisplay && score !== null && score > 0) {
            this.scoreDisplay.textContent = `+${score}`;
            this.modal.classList.add('has-score');
        } else {
            this.modal.classList.remove('has-score');
        }

        this.renderExplanation(explanation);
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

        // Deferred: a result arriving inside the window cancels this instead of
        // flashing the confirmation on screen. See SUBMISSION_DEFER_MS.
        clearTimeout(this.pendingSubmissionTimer);
        this.pendingSubmissionTimer = setTimeout(() => {
            this.pendingSubmissionTimer = null;
            this.renderSubmission(message, autoDismissTime);
        }, SUBMISSION_DEFER_MS);
    }

    /**
     * Render the submission confirmation now.
     * @param {string} message - Submission message
     * @param {number} autoDismissTime - Auto-dismiss time in ms
     */
    renderSubmission(message, autoDismissTime) {
        // Clear any existing timer
        if (this.currentTimer) {
            clearTimeout(this.currentTimer);
            this.currentTimer = null;
        }

        this.submissionShownAt = Date.now();

        // Set modal state - neutral styling
        this.modal.className = 'feedback-modal submission';

        // Set submission-specific content
        this.updateSubmissionContent(message);

        // Show modal with animation using modal-utils
        openModal(this.overlay, { mode: MODAL_MODES.CLASS, activeClass: 'active', lockScroll: true });

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
        // Fixed submission icon — a random pick per submission made the screen
        // non-reproducible for the visual regression suite with no UX gain.
        // CSS handles animation reset via .feedback-icon styles.
        if (this.feedbackIcon) {
            this.feedbackIcon.textContent = '🚀';
        }

        // Set submission message
        if (this.feedbackText) {
            this.feedbackText.textContent = message;
        }

        // Ensure score is hidden for submissions - use has-score class
        this.modal.classList.remove('has-score');
    }

    /**
     * Check if modal is currently visible
     * @returns {boolean} True if modal is visible
     */
    isVisible() {
        return isModalOpen(this.overlay, { mode: MODAL_MODES.CLASS, activeClass: 'active' });
    }

    /**
     * Cleanup method to remove event listeners
     */
    destroy() {
        if (this.currentTimer) {
            clearTimeout(this.currentTimer);
            this.currentTimer = null;
        }

        this.cancelDeferredRenders();

        // Clean up modal bindings (overlay click and escape key handlers)
        if (this.modalBindings?.cleanup) {
            this.modalBindings.cleanup();
        }

        // Clean up content click handler
        if (this.modal && this.contentHandler) {
            this.modal.removeEventListener('click', this.contentHandler);
        }

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