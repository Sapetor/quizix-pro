/**
 * Preview Renderer Module
 * Handles all rendering logic for preview questions, answer types, and MathJax
 * Extracted from PreviewManager for better separation of concerns
 */

import { translationManager } from '../../utils/translation-manager.js';
import { simpleMathJaxService } from '../../utils/simple-mathjax-service.js';
import { logger, COLORS } from '../../core/config.js';
import { imagePathResolver, loadImageWithRetry } from '../../utils/image-path-resolver.js';
import { escapeHtml, formatCodeBlocks as sharedFormatCodeBlocks, dom } from '../../utils/dom.js';
import { QuestionTypeRegistry } from '../../utils/question-type-registry.js';

export class PreviewRenderer {
    constructor() {
        this.mathJaxService = simpleMathJaxService;
        this.mathJaxRenderingInProgress = false;
    }

    /**
     * Render a complete question preview
     */
    renderSplitQuestionPreview(data) {
        logger.debug('Rendering split question preview:', data);

        // Clear previous content and reset states
        this.clearAllSplitAnswerTypes();

        // Render question text
        this.renderSplitQuestionText(data.question);

        // Render answer type
        this.renderSplitAnswerType(data);

        // Update counter
        this.updateSplitQuestionCounter(data.questionNumber, data.totalQuestions);

        // Handle image if present (prefer WebP for better compression)
        if (data.image) {
            this.handleSplitQuestionImage(data.imageWebp || data.image);
        }
    }

    /**
     * Render question text with LaTeX support
     */
    renderSplitQuestionText(questionText) {
        const previewElement = dom.get('preview-question-text-split');

        if (!previewElement) {
            logger.warn('Preview question text element not found');
            return;
        }

        if (questionText) {
            this.renderSplitTextWithLatex(previewElement, questionText);
        } else {
            previewElement.innerHTML = '<em>No question text</em>';
        }
    }

    /**
     * Render text with LaTeX and syntax highlighting support
     */
    renderSplitTextWithLatex(element, text) {
        if (!element || !text) {
            logger.warn('Invalid element or text for LaTeX rendering');
            return;
        }

        const formattedContent = this.formatCodeBlocks(text);
        element.innerHTML = formattedContent;
        element.classList.remove('hidden');
        element.style.opacity = '1';

        // Apply syntax highlighting for code blocks
        this.applySyntaxHighlighting(element);

        const hasLatex = this.mathJaxService.hasLatex(formattedContent);

        if (hasLatex) {
            logger.debug('LaTeX content detected in preview');
            element.classList.add('tex2jax_process');

            this.mathJaxService.render([element]).then(() => {
                logger.debug('Preview MathJax rendering completed');
                element.classList.add('mathjax-rendered');
            }).catch(error => {
                logger.warn('Preview MathJax rendering failed:', error);
                element.classList.add('mathjax-failed');
            });
        } else {
            element.classList.add('plain-text-rendered');
        }
    }

    /**
     * Handle question image display
     */
    handleSplitQuestionImage(imageData) {
        const imageDisplay = dom.get('preview-question-image-split');
        const img = imageDisplay?.querySelector('img');

        if (imageData && imageDisplay && img) {
            imageDisplay.classList.remove('hidden');
            this.setupSplitImageHandlers(img, imageDisplay, imageData);
            this.setSplitImageSource(img, imageData);
        }
    }

    /**
     * Setup image event handlers
     */
    setupSplitImageHandlers(img, imageDisplay, imageData) {
        img.onload = () => {
            logger.debug('Preview image loaded successfully');
            imageDisplay.classList.remove('loading');
        };

        img.onerror = () => {
            this.showSplitImageError(imageDisplay, imageData);
        };
    }

    /**
     * Set image source with data URI or path handling
     * Uses centralized path resolver for consistent handling
     * Enhanced with WSL-aware retry logic for file serving delays
     */
    setSplitImageSource(img, imageData) {
        if (!imageData || imageData.trim() === '') {
            logger.warn('Empty image data provided to setSplitImageSource');
            return;
        }

        // Use centralized resolver for consistent path handling
        const displayPath = imagePathResolver.toDisplayPath(imageData);

        // Data URIs are handled directly, file paths use retry logic
        if (displayPath.startsWith('data:')) {
            img.src = displayPath;
        } else {
            // Use retry logic for uploaded images to handle WSL file serving delays
            this.loadImageWithRetry(img, displayPath, 3, 1, img.closest('#preview-question-image-split'));
        }
    }

    /**
     * Load image with retry logic for WSL environments (delegates to shared utility)
     */
    loadImageWithRetry(img, src, maxRetries = 3, _attempt = 1, imageDisplay = null) {
        loadImageWithRetry(img, src, {
            maxRetries,
            onSuccess: () => {
                if (imageDisplay) {
                    imageDisplay.classList.remove('loading');
                    // Clear any previous error messages
                    const errorMsg = imageDisplay.querySelector('.image-error');
                    if (errorMsg) {
                        errorMsg.remove();
                    }
                }
            },
            onError: () => {
                if (imageDisplay) {
                    // Extract filename from src for error display
                    const filename = src.split('/').pop();
                    this.showSplitImageError(imageDisplay, filename);
                }
            }
        });
    }

    /**
     * Show image error state
     */
    showSplitImageError(imageDisplay, imageData) {
        logger.error('Failed to load preview image:', imageData);

        let errorMsg = imageDisplay.querySelector('.image-error');
        if (!errorMsg) {
            errorMsg = document.createElement('div');
            errorMsg.className = 'image-error';
            errorMsg.innerHTML = `
                <div class="error-icon">🖼️</div>
                <div class="error-text">Image failed to load</div>
                <div class="error-details">Check if the image file exists</div>
            `;
            imageDisplay.appendChild(errorMsg);
        }

        imageDisplay.classList.remove('loading');
        this.logSplitImageError(imageData, imageDisplay, imageDisplay.querySelector('img'));
    }

    /**
     * Log detailed image error information
     */
    logSplitImageError(imageData, imageDisplay, img) {
        logger.error('Image Error Details:', {
            imageData: imageData ? imageData.substring(0, 100) + '...' : 'null',
            imageDisplay: !!imageDisplay,
            img: !!img,
            imgSrc: img?.src || 'not set'
        });
    }

    /**
     * Clear all answer type displays and images
     */
    clearAllSplitAnswerTypes() {
        this.resetSplitAnswerStates();

        // Use registry to get all type IDs and build container IDs dynamically
        const typeIds = QuestionTypeRegistry.getTypeIds();
        const containerIds = typeIds.map(typeId => `preview-${typeId}-split`);

        this.hideSplitAnswerContainers(containerIds);

        // Clear and hide question image
        this.clearSplitQuestionImage();
    }

    /**
     * Clear and hide question image
     */
    clearSplitQuestionImage() {
        const imageDisplay = dom.get('preview-question-image-split');
        const img = imageDisplay?.querySelector('img');

        if (imageDisplay) {
            imageDisplay.classList.add('hidden');
            imageDisplay.classList.remove('loading');
        }

        if (img) {
            img.src = '';
            img.onload = null;
            img.onerror = null;
        }

        // Remove any error messages
        const errorMsg = imageDisplay?.querySelector('.image-error');
        if (errorMsg) {
            errorMsg.remove();
        }

        logger.debug('Question image cleared and hidden');
    }

    /**
     * Hide specified answer containers
     */
    hideSplitAnswerContainers(containerIds) {
        containerIds.forEach(id => {
            const container = dom.get(id);
            if (container) {
                container.classList.add('hidden');
            }
        });
    }

    /**
     * Reset answer states and clear content
     */
    resetSplitAnswerStates() {
        // Clear multiple choice content
        this.clearSplitAnswerContent('multiple-choice');

        // Clear multiple correct content
        this.clearSplitAnswerContent('multiple-correct');

        // Reset true/false buttons
        this.resetSplitTrueFalseButtons('true-false');

        // Clear numeric input
        this.resetSplitInputFields('numeric');
    }

    /**
     * Clear answer content for specific type
     */
    clearSplitAnswerContent(type) {
        const playerOptions = document.querySelector(`#preview-${type}-split .player-options`);
        if (playerOptions) {
            playerOptions.innerHTML = '';
        }

        const checkboxOptions = document.querySelector(`#preview-${type}-split .player-checkbox-options`);
        if (checkboxOptions) {
            checkboxOptions.innerHTML = '';
        }
    }

    /**
     * Reset true/false button states
     */
    resetSplitTrueFalseButtons(type) {
        const tfContainer = dom.get(`preview-${type}-split`);
        if (tfContainer) {
            const buttons = tfContainer.querySelectorAll('.tf-option');
            buttons.forEach(button => {
                button.classList.remove('correct', 'selected');
                button.style.background = '';
                button.style.border = '';
                button.style.transform = '';
            });
        }
    }

    /**
     * Reset input fields
     */
    resetSplitInputFields(type) {
        const input = document.querySelector(`#preview-${type}-split input`);
        if (input) {
            input.value = '';
        }
    }

    /**
     * Render appropriate answer type based on question data
     */
    renderSplitAnswerType(data) {
        // Hide all containers first
        this.clearAllSplitAnswerTypes();

        const containerMap = {
            'multiple-choice': 'preview-multiple-choice-split',
            'multiple-correct': 'preview-multiple-correct-split',
            'true-false': 'preview-true-false-split',
            'numeric': 'preview-numeric-split',
            'ordering': 'preview-ordering-split'
        };

        const containerId = containerMap[data.type];
        if (!containerId) {
            logger.warn('Unknown question type for preview:', data.type);
            return;
        }

        const container = dom.get(containerId);
        if (container) {
            container.classList.remove('hidden');
        }

        // Render based on type
        switch (data.type) {
            case 'multiple-choice':
                this.renderSplitMultipleChoicePreview(data.options, data.correctIndex);
                break;
            case 'multiple-correct':
                this.renderSplitMultipleCorrectPreview(data.options, data.correctIndices);
                break;
            case 'true-false':
                this.renderSplitTrueFalsePreview(data.correctAnswer);
                break;
            case 'numeric':
                this.renderSplitNumericPreview();
                break;
            case 'ordering':
                this.renderSplitOrderingPreview(data.options, data.correctOrder);
                break;
        }
    }

    /**
     * Render multiple choice options preview
     */
    renderSplitMultipleChoicePreview(options, correctAnswer) {
        const container = dom.get('preview-multiple-choice-split');
        const optionsContainer = container?.querySelector('.player-options');

        if (!container || !optionsContainer) {
            logger.warn('Multiple choice preview containers not found');
            return;
        }

        optionsContainer.innerHTML = '';

        if (!options || options.length === 0) {
            const noOptionsText = translationManager.getTranslationSync('no_options') || 'No options';
            optionsContainer.innerHTML = `<p><em>${noOptionsText}</em></p>`;
            return;
        }

        options.forEach((option, index) => {
            if (!option || option.trim() === '' || option === 'Option text') {
                return;
            }

            const optionDiv = document.createElement('div');
            optionDiv.className = 'player-option preview-option';
            optionDiv.setAttribute('data-option', index);

            // Add correct answer styling
            if (index === correctAnswer) {
                optionDiv.classList.add('correct');
            }

            const optionLetter = translationManager.getOptionLetter(index);
            const hasLatex = this.hasLatexContent(option);
            const formattedContent = `${optionLetter}: ${this.formatCodeBlocks(option)}`;

            this.renderOptionWithLatex(optionDiv, formattedContent, optionsContainer, hasLatex);
        });
    }

    /**
     * Render multiple correct options preview
     */
    renderSplitMultipleCorrectPreview(options, correctAnswers) {
        const container = dom.get('preview-multiple-correct-split');
        const optionsContainer = container?.querySelector('.player-checkbox-options');

        if (!container || !optionsContainer) {
            logger.warn('Multiple correct preview containers not found');
            return;
        }

        optionsContainer.innerHTML = '';

        logger.debug('Multiple correct preview data:', { options, correctAnswers });

        if (!options || options.length === 0) {
            const noOptionsText = translationManager.getTranslationSync('no_options') || 'No options';
            optionsContainer.innerHTML = `<p><em>${noOptionsText}</em></p>`;
            return;
        }

        options.forEach((option, index) => {
            if (!option || option.trim() === '' || option === 'Option text') {
                return;
            }

            const optionDiv = document.createElement('div');
            optionDiv.className = 'checkbox-option preview-checkbox';
            optionDiv.setAttribute('data-option', index);

            const isCorrect = correctAnswers && correctAnswers.includes(index);

            // Add correct answer styling
            if (isCorrect) {
                optionDiv.classList.add('correct-preview');
            }

            const optionLetter = translationManager.getOptionLetter(index);
            const hasLatex = this.hasLatexContent(option);
            const formattedContent = `<input type="checkbox" ${isCorrect ? 'checked' : ''} disabled> ${optionLetter}: ${this.formatCodeBlocks(option)}`;

            this.renderOptionWithLatex(optionDiv, formattedContent, optionsContainer, hasLatex);
        });
    }

    /**
     * Render true/false preview
     */
    renderSplitTrueFalsePreview(correctAnswer) {
        const container = dom.get('preview-true-false-split');
        const tfContainer = container?.querySelector('.true-false-options');

        if (!container || !tfContainer) {
            logger.warn('True/false preview containers not found');
            return;
        }

        const trueOption = tfContainer.querySelector('.tf-option[data-answer="true"]');
        const falseOption = tfContainer.querySelector('.tf-option[data-answer="false"]');

        if (trueOption && falseOption) {
            // Reset styles
            [trueOption, falseOption].forEach(option => {
                option.classList.remove('correct');
            });

            // Mark correct answer
            if (correctAnswer === true) {
                trueOption.classList.add('correct');
            }
            if (correctAnswer === false) {
                falseOption.classList.add('correct');
            }
        }
    }

    /**
     * Render numeric input preview
     */
    renderSplitNumericPreview() {
        const container = dom.get('preview-numeric-split');
        const input = container?.querySelector('input');

        if (input) {
            input.placeholder = 'Enter numeric answer...';
            input.disabled = true;
        }
    }

    /**
     * Render ordering preview (desktop split view)
     */
    renderSplitOrderingPreview(options, correctOrder) {
        this.renderOrderingPreview('preview-ordering-split', options, correctOrder, 'split');
    }

    /**
     * Render ordering preview into a target container
     * Shared implementation for both desktop and mobile views
     */
    renderOrderingPreview(containerId, options, _correctOrder, context = 'preview') {
        const container = dom.get(containerId);
        if (!container) {
            logger.warn(`${context} ordering container not found: ${containerId}`);
            return;
        }

        if (!options || options.length === 0) {
            container.innerHTML = '<p>No ordering options available</p>';
            return;
        }

        const hasLatexContent = options.some(option => this.hasLatexContent(option));

        const itemsHtml = options.map((option, index) => {
            const bgColor = COLORS.ORDERING_ITEM_COLORS[index % COLORS.ORDERING_ITEM_COLORS.length];
            const formattedContent = this.formatCodeBlocks(option);
            return `
                <div class="ordering-display-item" data-original-index="${index}" data-order-index="${index}" style="background: ${bgColor};">
                    <div class="ordering-item-number">${index + 1}</div>
                    <div class="ordering-item-content">${formattedContent}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="ordering-player-instruction" data-translate="ordering_player_instruction"></div>
            <div class="ordering-display">${itemsHtml}</div>
        `;

        translationManager.translateContainer(container);

        if (hasLatexContent) {
            this.renderLatexInContainer(container.querySelector('.ordering-display'), context);
        }
    }

    /**
     * Render LaTeX content in a container element
     */
    renderLatexInContainer(displayContainer, context = 'preview') {
        if (!displayContainer) return;

        displayContainer.classList.add('tex2jax_process');
        this.mathJaxService.render([displayContainer]).then(() => {
            logger.debug(`${context} MathJax rendering completed`);
        }).catch(error => {
            logger.warn(`${context} MathJax rendering failed:`, error);
        });
    }

    /**
     * Update question counter display
     */
    updateSplitQuestionCounter(questionNumber, totalQuestions) {
        const counterDisplay = dom.get('preview-question-counter-split');
        if (counterDisplay) {
            counterDisplay.textContent = `${questionNumber}/${totalQuestions}`;
        }
    }

    /**
     * Check if text contains LaTeX expressions (delegated to service)
     */
    hasLatexContent(text) {
        return this.mathJaxService.hasLatex(text);
    }

    /**
     * Render option with LaTeX support
     */
    renderOptionWithLatex(optionDiv, formattedContent, container, hasLatex) {
        if (hasLatex) {
            this.renderLatexOption(optionDiv, formattedContent, container);
        } else {
            this.renderPlainOption(optionDiv, formattedContent, container);
        }
    }

    /**
     * Render option with LaTeX content
     */
    renderLatexOption(optionDiv, formattedContent, container) {
        optionDiv.innerHTML = formattedContent;
        optionDiv.classList.add('tex2jax_process');
        container.appendChild(optionDiv);

        // Apply syntax highlighting for code blocks
        this.applySyntaxHighlighting(optionDiv);

        // Always show option content immediately
        optionDiv.style.opacity = '1';

        // Use simplified MathJax service for option rendering (non-blocking)
        this.mathJaxService.render([optionDiv]).then(() => {
            logger.debug('Option MathJax rendering completed');
        }).catch(error => {
            logger.warn('MathJax option rendering error, content still visible:', error);
        });
    }

    /**
     * Render plain text option
     */
    renderPlainOption(optionDiv, formattedContent, container) {
        optionDiv.innerHTML = formattedContent;
        this.applySyntaxHighlighting(optionDiv);
        optionDiv.style.opacity = '1';
        container.appendChild(optionDiv);
    }

    /**
     * Format code blocks in text (delegates to shared utility)
     */
    formatCodeBlocks(text) {
        return sharedFormatCodeBlocks(text);
    }

    /**
     * Render MathJax for preview elements with enhanced F5 handling
     */
    renderMathJaxForPreview() {
        if (this.mathJaxRenderingInProgress) {
            logger.debug('MathJax rendering already in progress, skipping');
            return;
        }

        this.mathJaxRenderingInProgress = true;

        try {
            // Find specific preview elements that need MathJax rendering
            const previewContainer = document.querySelector('.preview-content-split');
            if (!previewContainer) {
                logger.debug('Preview container not found, skipping MathJax rendering');
                this.mathJaxRenderingInProgress = false;
                return;
            }

            // Use enhanced service with queue and retry logic
            this.mathJaxService.renderAll(previewContainer).then(() => {
                logger.debug('Preview MathJax rendering completed successfully');
            }).catch(error => {
                logger.warn('Preview MathJax rendering failed, content still visible:', error);
            }).finally(() => {
                this.mathJaxRenderingInProgress = false;
            });

        } catch (error) {
            logger.warn('Preview MathJax rendering error:', error);
            this.mathJaxRenderingInProgress = false;
        }
    }

    /**
     * Render a mobile question preview using the same styling as desktop
     */
    renderMobileQuestionPreview(data) {
        logger.debug('Rendering mobile question preview:', data);

        // Clear previous content and reset states
        this.clearAllMobileAnswerTypes();

        // Render question text
        this.renderMobileQuestionText(data.question);

        // Render answer type
        this.renderMobileAnswerType(data);

        // Handle image if present
        if (data.image) {
            this.handleMobileQuestionImage(data.image);
        }
    }

    /**
     * Clear all mobile answer types
     */
    clearAllMobileAnswerTypes() {
        document.querySelectorAll('#mobile-preview-answer-area .preview-answer-type').forEach(type => {
            type.classList.add('hidden');
        });
    }

    /**
     * Render mobile question text
     */
    renderMobileQuestionText(questionText) {
        const previewElement = dom.get('mobile-preview-question-text');

        if (!previewElement) {
            logger.warn('Mobile preview question text element not found');
            return;
        }

        const hasLatex = this.hasLatexContent(questionText);
        const formattedText = this.formatCodeBlocks(questionText);
        previewElement.innerHTML = formattedText;

        if (hasLatex) {
            previewElement.setAttribute('data-has-latex', 'true');
            // CRITICAL: Trigger MathJax rendering immediately after content insertion
            this.triggerMobileLatexRendering(previewElement);
        } else {
            previewElement.removeAttribute('data-has-latex');
        }

        // Apply syntax highlighting for code blocks
        this.applySyntaxHighlighting(previewElement);
    }

    /**
     * Trigger MathJax rendering specifically for mobile preview elements
     */
    triggerMobileLatexRendering(element) {
        if (window.MathJax?.typesetPromise) {
            // Use MathJax 3 API - immediate rendering
            window.MathJax.typesetPromise([element]).then(() => {
                logger.debug('Mobile LaTeX rendered:', element.id);
            }).catch(error => {
                logger.warn('Mobile LaTeX failed:', error);
            });
        } else if (window.MathJax?.Hub) {
            // Fallback to MathJax 2 API - immediate rendering
            window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, element]);
            logger.debug('Mobile LaTeX queued:', element.id);
        }
    }

    /**
     * Apply syntax highlighting for code blocks in preview
     */
    applySyntaxHighlighting(element) {
        const codeBlocks = element.querySelectorAll('pre code');

        if (codeBlocks.length > 0) {
            if (window.hljs && window.hljs.highlightElement) {
                codeBlocks.forEach(codeBlock => {
                    if (!codeBlock.classList.contains('hljs')) {
                        window.hljs.highlightElement(codeBlock);
                        const preElement = codeBlock.closest('pre');
                        if (preElement) {
                            preElement.classList.add('has-syntax-highlighting');
                        }
                    }
                });
                logger.debug('Highlight.js applied to', codeBlocks.length, 'code blocks');
            }
        }
    }

    /**
     * Render mobile answer type
     */
    renderMobileAnswerType(data) {
        const rendererMap = {
            'multiple-choice': () => this.renderMobileMultipleChoicePreview(data.options, data.correctIndex),
            'multiple-correct': () => this.renderMobileMultipleCorrectPreview(data.options, data.correctIndices),
            'true-false': () => this.renderMobileTrueFalsePreview(data.correctAnswer),
            'numeric': () => this.renderMobileNumericPreview(data.correctAnswer),
            'ordering': () => this.renderMobileOrderingPreview(data.options, data.correctOrder)
        };

        const renderer = rendererMap[data.type];
        if (renderer) {
            renderer();
        } else {
            logger.warn('Unknown mobile question type:', data.type);
        }
    }

    /**
     * Render mobile multiple choice options
     */
    renderMobileMultipleChoicePreview(options, correctAnswer) {
        const container = document.querySelector('#mobile-preview-answer-area .preview-multiple-choice');
        const optionsContainer = dom.get('mobile-preview-options');

        if (!container || !optionsContainer) {
            logger.warn('Mobile multiple choice preview containers not found');
            return;
        }

        container.classList.remove('hidden');
        optionsContainer.innerHTML = '';

        if (!options || options.length === 0) {
            const noOptionsText = translationManager.getTranslationSync('no_options') || 'No options';
            optionsContainer.innerHTML = `<p><em>${noOptionsText}</em></p>`;
            return;
        }

        options.forEach((option, index) => {
            if (!option || option.trim() === '' || option === 'Option text') {
                return;
            }

            const optionDiv = document.createElement('div');
            optionDiv.className = 'player-option preview-option';
            optionDiv.setAttribute('data-option', index);

            // Add correct answer styling
            if (index === correctAnswer) {
                optionDiv.classList.add('correct');
            }

            const optionLetter = translationManager.getOptionLetter(index);
            const hasLatex = this.hasLatexContent(option);
            const formattedContent = `${optionLetter}: ${this.formatCodeBlocks(option)}`;

            this.renderOptionWithLatex(optionDiv, formattedContent, optionsContainer, hasLatex);
        });
    }

    /**
     * Render mobile multiple correct options
     */
    renderMobileMultipleCorrectPreview(options, correctAnswers) {
        const container = document.querySelector('#mobile-preview-answer-area .preview-multiple-correct');
        const optionsContainer = dom.get('mobile-preview-checkbox-options');

        if (!container || !optionsContainer) {
            logger.warn('Mobile multiple correct preview containers not found');
            return;
        }

        container.classList.remove('hidden');
        optionsContainer.innerHTML = '';

        if (!options || options.length === 0) {
            const noOptionsText = translationManager.getTranslationSync('no_options') || 'No options';
            optionsContainer.innerHTML = `<p><em>${noOptionsText}</em></p>`;
            return;
        }

        options.forEach((option, index) => {
            if (!option || option.trim() === '' || option === 'Option text') {
                return;
            }

            const optionDiv = document.createElement('div');
            optionDiv.className = 'checkbox-option preview-checkbox';
            optionDiv.setAttribute('data-option', index);

            // Add correct answer styling
            if (correctAnswers && correctAnswers.includes(index)) {
                optionDiv.classList.add('correct');
            }

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.disabled = true;
            if (correctAnswers && correctAnswers.includes(index)) {
                checkbox.checked = true;
            }

            const optionLetter = translationManager.getOptionLetter(index);
            const hasLatex = this.hasLatexContent(option);
            const formattedContent = `${optionLetter}: ${this.formatCodeBlocks(option)}`;

            optionDiv.appendChild(checkbox);
            optionDiv.insertAdjacentHTML('beforeend', ' ' + formattedContent);

            if (hasLatex) {
                optionDiv.setAttribute('data-has-latex', 'true');
                optionDiv.classList.add('tex2jax_process');
            }

            // Apply syntax highlighting for code blocks
            this.applySyntaxHighlighting(optionDiv);

            optionsContainer.appendChild(optionDiv);
        });

        // Single LaTeX rendering call for entire container
        this.triggerMobileLatexRendering(optionsContainer);
    }

    /**
     * Render mobile true/false options
     */
    renderMobileTrueFalsePreview(correctAnswer) {
        const container = document.querySelector('#mobile-preview-answer-area .preview-true-false');
        const optionsContainer = dom.get('mobile-preview-tf-options');

        if (!container || !optionsContainer) {
            logger.warn('Mobile true/false preview containers not found');
            return;
        }

        container.classList.remove('hidden');
        optionsContainer.innerHTML = '';

        // Create True option
        const trueOption = document.createElement('div');
        trueOption.className = 'tf-option preview-option';
        trueOption.setAttribute('data-option', 'true');
        if (correctAnswer === true) {
            trueOption.classList.add('correct');
        }
        trueOption.textContent = translationManager.getTranslationSync('true') || 'True';

        // Create False option
        const falseOption = document.createElement('div');
        falseOption.className = 'tf-option preview-option';
        falseOption.setAttribute('data-option', 'false');
        if (correctAnswer === false) {
            falseOption.classList.add('correct');
        }
        falseOption.textContent = translationManager.getTranslationSync('false') || 'False';

        optionsContainer.appendChild(trueOption);
        optionsContainer.appendChild(falseOption);
    }

    /**
     * Render mobile numeric input
     */
    renderMobileNumericPreview(correctAnswer) {
        const container = document.querySelector('#mobile-preview-answer-area .preview-numeric');
        const inputContainer = dom.get('mobile-preview-numeric');

        if (!container || !inputContainer) {
            logger.warn('Mobile numeric preview containers not found');
            return;
        }

        container.classList.remove('hidden');

        const input = inputContainer.querySelector('input[type="number"]');
        if (input) {
            input.placeholder = translationManager.getTranslationSync('enter_your_answer') || 'Enter your answer';
            if (correctAnswer !== undefined && correctAnswer !== null) {
                input.value = correctAnswer;
            }
        }
    }

    /**
     * Render mobile ordering preview
     */
    renderMobileOrderingPreview(options, correctOrder) {
        const container = document.querySelector('#mobile-preview-answer-area .preview-ordering');
        if (!container) {
            logger.warn('Mobile ordering preview container not found');
            return;
        }

        container.classList.remove('hidden');
        this.renderOrderingPreview('mobile-preview-ordering', options, correctOrder, 'mobile');
    }

    /**
     * Handle mobile question image
     */
    handleMobileQuestionImage(imageUrl) {
        // Similar to desktop image handling, but for mobile container
        // Implementation depends on where image should be displayed in mobile layout
        logger.debug('Mobile image handling not yet implemented:', imageUrl);
    }
}