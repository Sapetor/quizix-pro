/**
 * Game Display Manager Module
 * Handles question display, UI rendering, and DOM manipulation
 * Extracted from game-manager.js for better separation of concerns
 */

import { getTranslation } from '../../utils/translation-manager.js';
import { logger } from '../../core/config.js';
import { MathRenderer } from '../../utils/math-renderer.js';
import { simpleMathJaxService } from '../../utils/simple-mathjax-service.js';
import { imagePathResolver } from '../../utils/image-path-resolver.js';

export class GameDisplayManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.mathRenderer = new MathRenderer();
    }

    /**
     * Get question DOM elements
     */
    getQuestionElements() {
        return {
            hostQuestionElement: document.getElementById('current-question'),
            questionElement: document.getElementById('player-question-text'),
            hostOptionsContainer: document.getElementById('answer-options')
        };
    }

    /**
     * Get client-specific elements - centralized access
     */
    getClientElements() {
        return {
            questionText: document.getElementById('player-question-text'),
            questionImage: document.getElementById('player-question-image'),
            questionCounter: document.getElementById('player-question-counter'),
            optionsContainer: document.querySelector('.player-options'),
            multipleChoiceOptions: document.querySelectorAll('.player-option'),
            trueFalseOptions: document.querySelectorAll('.tf-option'),
            checkboxOptions: document.querySelectorAll('.checkbox-option'),
            numericInput: document.getElementById('numeric-answer-input'),
            submitButton: document.getElementById('submit-numeric'),
            multipleSubmitButton: document.getElementById('submit-multiple')
        };
    }

    /**
     * Update question counter display (generic method)
     * @param {string} elementId - ID of the counter element
     * @param {number} current - Current question number
     * @param {number} total - Total questions
     */
    updateCounter(elementId, current, total) {
        const counterElement = document.getElementById(elementId);
        if (counterElement) {
            counterElement.textContent = getTranslation('question_x_of_y', [current, total]);
            logger.debug(`Counter ${elementId} updated:`, current, 'of', total);
        }
    }

    /**
     * Update host question counter display
     */
    updateQuestionCounter(current, total) {
        this.updateCounter('question-counter', current, total);
    }

    /**
     * Update player question counter
     */
    updatePlayerQuestionCounter(current, total) {
        this.updateCounter('player-question-counter', current, total);
    }

    /**
     * Update question image display for host or player
     * Uses <picture> element for WebP with fallback support
     */
    updateQuestionImage(data, containerId) {
        const imageContainer = document.getElementById(containerId);
        if (!imageContainer) {
            return;
        }

        // Validate image data first
        if (!data.image || !data.image.trim() || data.image === 'undefined' || data.image === 'null') {
            // Hide the container if no valid image
            imageContainer.classList.add('hidden');
            return;
        }

        // Additional validation for invalid paths
        if (data.image.includes('nonexistent') || data.image === window.location.origin + '/') {
            imageContainer.classList.add('hidden');
            return;
        }

        // Get image sources
        const originalSrc = imagePathResolver.toAbsoluteUrl(data.image);
        const webpSrc = data.imageWebp ? imagePathResolver.toAbsoluteUrl(data.imageWebp) : null;

        // If no valid image URL, hide container
        if (!originalSrc || originalSrc.trim() === '') {
            imageContainer.classList.add('hidden');
            return;
        }

        // Clear existing content and create <picture> element for WebP fallback
        imageContainer.innerHTML = '';

        const picture = document.createElement('picture');

        // Add WebP source if available
        if (webpSrc) {
            const webpSource = document.createElement('source');
            webpSource.srcset = webpSrc;
            webpSource.type = 'image/webp';
            picture.appendChild(webpSource);
        }

        // Create fallback img element
        const img = document.createElement('img');
        img.className = 'question-image';
        img.src = originalSrc;
        img.alt = 'Question Image';

        // Silent error handling - hide container on load failure
        img.onerror = () => {
            imageContainer.classList.add('hidden');
        };

        img.onload = () => {
            imageContainer.classList.remove('hidden');
        };

        picture.appendChild(img);
        imageContainer.appendChild(picture);
    }

    /**
     * Update question video display for host or player
     * @param {Object} data - Question data (expects data.video)
     * @param {string} containerId - ID of the container element
     */
    updateQuestionVideo(data, containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        if (!data.video || !data.video.trim()) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        container.innerHTML = '';

        const video = document.createElement('video');
        video.className = 'question-video-player';
        video.controls = true;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.preload = 'auto';
        video.playsInline = true;

        const source = document.createElement('source');
        source.src = imagePathResolver.toAbsoluteUrl(data.video);
        source.type = 'video/mp4';

        video.appendChild(source);
        container.appendChild(video);

        video.onerror = () => container.classList.add('hidden');
        video.onloadedmetadata = () => container.classList.remove('hidden');
    }

    /**
     * Render MathJax for question content with enhanced F5 handling
     * @param {HTMLElement} element - Element to render MathJax in
     * @param {number} delay - Delay in ms before rendering (to avoid concurrent render conflicts)
     */
    async renderQuestionMath(element, delay = 0) {
        if (!element) return;

        try {
            // Add delay to avoid concurrent rendering conflicts
            // (SimpleMathJaxService has a renderingInProgress guard that skips concurrent calls)
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Check if element still exists in DOM
            if (!document.contains(element)) {
                logger.debug('Element removed from DOM before MathJax rendering, skipping');
                return;
            }

            // Use the simplified SimpleMathJaxService
            await simpleMathJaxService.render([element]);
            logger.debug('MathJax rendering completed for question');

        } catch (err) {
            logger.warn('MathJax question render error (non-blocking):', err);
            // Don't throw - let the game continue without LaTeX rendering
        }
    }

    /**
     * Format and display question text
     */
    displayQuestionText(element, questionText) {
        if (!element) return;

        // FOUC Prevention: Add class BEFORE innerHTML so CSS hides raw LaTeX
        element.classList.add('tex2jax_process');
        element.classList.remove('MathJax_Processed');

        element.innerHTML = this.mathRenderer.formatCodeBlocks(questionText);
        logger.debug('Question text displayed');

        // Apply syntax highlighting to code blocks
        this.mathRenderer.applySyntaxHighlighting(element);

        // Render MathJax immediately after content update
        this.renderQuestionMath(element);
    }

    // Answer submission feedback now handled by original modal system in GameManager

    /**
     * Clear question display
     */
    clearQuestionDisplay() {
        const elements = this.getQuestionElements();

        // Clear question text
        if (elements.hostQuestionElement) {
            elements.hostQuestionElement.innerHTML = '';
            // Reset MathJax processing classes
            elements.hostQuestionElement.classList.remove('tex2jax_process', 'MathJax_Processed');
        }
        if (elements.questionElement) {
            elements.questionElement.innerHTML = '';
            // Reset MathJax processing classes
            elements.questionElement.classList.remove('tex2jax_process', 'MathJax_Processed');
        }

        // Clear options container
        if (elements.hostOptionsContainer) {
            elements.hostOptionsContainer.innerHTML = '';
        }

        // Hide image containers
        this.updateQuestionImage({ image: '' }, 'question-image-display');
        this.updateQuestionImage({ image: '' }, 'player-question-image');

        // Hide video containers
        this.updateQuestionVideo({ video: '' }, 'question-video-display');
        this.updateQuestionVideo({ video: '' }, 'player-question-video');

        logger.debug('Question display cleared');
    }

    /**
     * Clear host-specific question content with loading state
     * Consolidated method replacing multiple clearing methods
     */
    clearHostQuestionContent(showLoading = false) {
        const elements = this.getQuestionElements();

        // Clear or show loading message in host question element
        if (elements.hostQuestionElement) {
            if (showLoading) {
                elements.hostQuestionElement.innerHTML = `<div class="loading-question">${getTranslation('loading_next_question')}</div>`;
            } else {
                elements.hostQuestionElement.innerHTML = '';
            }
        }

        // Clear existing answer displays
        const existingAnswer = document.querySelector('.correct-answer-display, .numeric-correct-answer-display');
        if (existingAnswer) {
            existingAnswer.remove();
        }

        // Clear and hide question image
        const questionImageDisplay = document.getElementById('question-image-display');
        if (questionImageDisplay) {
            questionImageDisplay.classList.add('hidden');
        }

        // Clear host options container
        if (elements.hostOptionsContainer) {
            elements.hostOptionsContainer.innerHTML = '';
            elements.hostOptionsContainer.classList.add('hidden');
        }

        // Reset host multiple choice container
        const hostMultipleChoice = document.getElementById('host-multiple-choice');
        if (hostMultipleChoice) {
            hostMultipleChoice.classList.remove('hidden', 'numeric-question-type');
        }

        logger.debug('Host question content cleared', { showLoading });
    }

    /**
     * Show loading state
     */
    showLoadingState(message = 'Loading...') {
        const loadingElement = document.createElement('div');
        loadingElement.id = 'game-loading';
        loadingElement.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">${message}</div>
            </div>
        `;

        // Style the loading element
        Object.assign(loadingElement.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '9999'
        });

        document.body.appendChild(loadingElement);
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        const loadingElement = document.getElementById('game-loading');
        if (loadingElement) {
            loadingElement.remove();
        }
    }

    /**
     * Clear client selections and reset to initial state
     * Consolidated method replacing multiple selection clearing methods
     */
    clearClientSelections() {
        const elements = this.getClientElements();

        // Clear multiple choice selections
        elements.multipleChoiceOptions.forEach(option => {
            option.classList.remove('selected', 'correct', 'incorrect', 'disabled');
            option.disabled = false;
            option.style.border = '';
            option.style.backgroundColor = '';
            option.style.transform = '';
        });

        // Clear true/false selections
        elements.trueFalseOptions.forEach(option => {
            option.classList.remove('selected', 'correct', 'incorrect', 'disabled');
            option.disabled = false;
            option.style.border = '';
            option.style.backgroundColor = '';
        });

        // Clear checkbox selections
        elements.checkboxOptions.forEach(option => {
            const checkbox = option.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = false;
                checkbox.disabled = false;
            }
            option.classList.remove('selected', 'disabled');
        });

        // Reset numeric input
        if (elements.numericInput) {
            elements.numericInput.value = '';
            elements.numericInput.disabled = false;
        }

        // Reset submit buttons
        if (elements.submitButton) {
            elements.submitButton.disabled = false;
            elements.submitButton.textContent = getTranslation('submit_answer');
        }

        if (elements.multipleSubmitButton) {
            elements.multipleSubmitButton.disabled = false;
        }

        logger.debug('Client selections cleared');
    }

    /**
     * Update client question display
     * @param {Object} data - Question data
     */
    updateClientQuestionDisplay(data) {
        const elements = this.getClientElements();

        // Update question text
        if (elements.questionText) {
            // Set className BEFORE displayQuestionText (which adds tex2jax_process for FOUC prevention)
            elements.questionText.className = `question-display player-question ${data.type}-question`;
            elements.questionText.setAttribute('data-question-type', data.type);
            this.displayQuestionText(elements.questionText, data.question);
        }

        // Update question image
        if (data.image && elements.questionImage) {
            this.updateQuestionImage(data, 'player-question-image');
        }

        // Update question video
        this.updateQuestionVideo(data, 'player-question-video');

        // Update question counter
        if (data.questionNumber && data.totalQuestions) {
            this.updatePlayerQuestionCounter(data.questionNumber, data.totalQuestions);
        }

        logger.debug('Client question display updated');
    }
}