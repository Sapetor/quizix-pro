/**
 * Game Display Manager Module  
 * Handles question display, UI rendering, and DOM manipulation
 * Extracted from game-manager.js for better separation of concerns
 */

import { translationManager, getTranslation } from '../../utils/translation-manager.js';
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
     * Update question counter display
     */
    updateQuestionCounter(current, total) {
        const counterElement = document.getElementById('question-counter');
        if (counterElement) {
            counterElement.textContent = getTranslation('question_x_of_y', [current, total]);
            logger.debug('Question counter updated:', current, 'of', total);
        }
    }

    /**
     * Update player question counter
     */
    updatePlayerQuestionCounter(current, total) {
        const counterElement = document.getElementById('player-question-counter');
        if (counterElement) {
            counterElement.textContent = getTranslation('question_x_of_y', [current, total]);
            logger.debug('Player question counter updated:', current, 'of', total);
        }
    }

    /**
     * Update question image display for host or player
     */
    updateQuestionImage(data, containerId) {
        const imageContainer = document.getElementById(containerId);
        if (!imageContainer) {
            return;
        }
        
        // Validate image data first
        if (!data.image || !data.image.trim() || data.image === 'undefined' || data.image === 'null') {
            // Hide the container if no valid image
            imageContainer.style.display = 'none';
            return;
        }
        
        // Additional validation for invalid paths
        if (data.image.includes('nonexistent') || data.image === window.location.origin + '/') {
            imageContainer.style.display = 'none';
            return;
        }
        
        // Create or update image element
        let img = imageContainer.querySelector('img');
        if (!img) {
            img = document.createElement('img');
            img.className = 'question-image';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '300px';
            img.style.height = 'auto';
            img.style.borderRadius = '8px';
            img.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            img.style.margin = '15px 0';
            imageContainer.appendChild(img);
        }
        
        // Set image source using centralized path resolver
        const imageSrc = imagePathResolver.toAbsoluteUrl(data.image);

        // If no valid image URL, hide container
        if (!imageSrc || imageSrc.trim() === '') {
            imageContainer.style.display = 'none';
            return;
        }

        img.alt = 'Question Image';

        // Silent error handling - hide container on load failure
        img.onerror = () => {
            imageContainer.style.display = 'none';
        };

        img.onload = () => {
            imageContainer.style.display = 'block';
        };

        // Set src last to trigger load/error events
        img.src = imageSrc;
    }

    /**
     * Render MathJax for question content with enhanced F5 handling
     */
    async renderQuestionMath(element, delay = 0) {
        if (!element) return;
        
        try {
            // No delay - render immediately for faster LaTeX display
            
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
        }
        if (elements.questionElement) {
            elements.questionElement.innerHTML = '';
        }
        
        // Clear options container
        if (elements.hostOptionsContainer) {
            elements.hostOptionsContainer.innerHTML = '';
        }
        
        // Hide image containers
        this.updateQuestionImage({ image: '' }, 'question-image-display');
        this.updateQuestionImage({ image: '' }, 'player-question-image');
        
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
            questionImageDisplay.style.display = 'none';
        }

        // Clear host options container
        if (elements.hostOptionsContainer) {
            elements.hostOptionsContainer.innerHTML = '';
            elements.hostOptionsContainer.style.display = 'none';
        }

        // Reset host multiple choice container
        const hostMultipleChoice = document.getElementById('host-multiple-choice');
        if (hostMultipleChoice) {
            hostMultipleChoice.style.display = 'block';
            hostMultipleChoice.classList.remove('numeric-question-type');
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
            this.displayQuestionText(elements.questionText, data.question);
            elements.questionText.className = `question-display player-question ${data.type}-question`;
            elements.questionText.setAttribute('data-question-type', data.type);
        }

        // Update question image
        if (data.image && elements.questionImage) {
            this.updateQuestionImage(data, 'player-question-image');
        }

        // Update question counter
        if (data.questionNumber && data.totalQuestions) {
            this.updatePlayerQuestionCounter(data.questionNumber, data.totalQuestions);
        }

        logger.debug('Client question display updated');
    }
}