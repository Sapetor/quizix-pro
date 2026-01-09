/**
 * Preview Renderer Module
 * Handles all rendering logic for preview questions, answer types, and MathJax
 * Extracted from PreviewManager for better separation of concerns
 */

import { translationManager } from '../../utils/translation-manager.js';
import { simpleMathJaxService } from '../../utils/simple-mathjax-service.js';
import { logger } from '../../core/config.js';
import { imagePathResolver } from '../../utils/image-path-resolver.js';

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
        const previewElement = document.getElementById('preview-question-text-split');
        
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
     * Render text with LaTeX support and enhanced F5 handling
     */
    renderSplitTextWithLatex(element, text) {
        if (!element || !text) {
            logger.warn('Invalid element or text for LaTeX rendering');
            return;
        }
        
        // Clear previous content
        element.innerHTML = '';
        element.style.opacity = '0';
        element.style.display = 'block';
        
        // Format code blocks first
        const formattedContent = this.formatCodeBlocks(text);
        
        // Set content first
        element.innerHTML = formattedContent;
        element.style.opacity = '0';
        element.style.display = 'block';
        
        // Check for LaTeX content
        const hasLatex = this.mathJaxService.hasLatex(formattedContent);
        
        // Always show content immediately - don't wait for MathJax
        element.style.opacity = '1';
        
        if (hasLatex) {
            logger.debug('LaTeX content detected in preview, rendering with enhanced MathJax service');
            element.classList.add('tex2jax_process');
            
            // Use enhanced MathJax service with queue and retry logic (non-blocking)
            this.mathJaxService.render([element]).then(() => {
                logger.debug('Preview MathJax rendering completed successfully');
                // Add visual feedback that LaTeX is rendered
                element.classList.add('mathjax-rendered');
            }).catch(error => {
                logger.warn('Preview MathJax rendering failed, content still visible:', error);
                // Add class to indicate LaTeX failed but content is visible
                element.classList.add('mathjax-failed');
            });
            
        } else {
            logger.debug('Plain text preview rendering completed');
            element.classList.add('plain-text-rendered');
        }
    }

    /**
     * Show fallback text when MathJax fails
     */
    showSplitFallbackText(element) {
        if (element) {
            element.innerHTML = element.innerHTML.replace(/\$\$([^$]+)\$\$/g, '[$1]').replace(/\$([^$]+)\$/g, '[$1]');
            element.style.opacity = '1';
            logger.debug('Fallback text displayed');
        }
    }

    /**
     * Handle question image display
     */
    handleSplitQuestionImage(imageData) {
        const imageDisplay = document.getElementById('preview-question-image-split');
        const img = imageDisplay?.querySelector('img');
        
        if (imageData && imageDisplay && img) {
            imageDisplay.style.display = 'block';
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
     * Load image with retry logic for WSL environments
     * @param {HTMLImageElement} img - Image element
     * @param {string} src - Image source URL
     * @param {number} maxRetries - Maximum retry attempts
     * @param {number} attempt - Current attempt number
     * @param {HTMLElement} imageDisplay - Image container for error handling
     */
    loadImageWithRetry(img, src, maxRetries = 3, attempt = 1, imageDisplay = null) {
        img.onload = () => {
            logger.debug(`Preview image loaded successfully on attempt ${attempt}: ${src}`);
            if (imageDisplay) {
                imageDisplay.classList.remove('loading');
                // Clear any previous error messages
                const errorMsg = imageDisplay.querySelector('.image-error');
                if (errorMsg) {
                    errorMsg.remove();
                }
            }
        };
        
        img.onerror = () => {
            if (attempt < maxRetries) {
                logger.warn(`Preview image load failed, retrying (${attempt}/${maxRetries}): ${src}`);
                // Progressive delay: 100ms, 200ms, 300ms for WSL file system delays
                setTimeout(() => {
                    this.loadImageWithRetry(img, src, maxRetries, attempt + 1, imageDisplay);
                }, 100 * attempt);
            } else {
                logger.error(`Preview image failed to load after ${maxRetries} attempts: ${src}`);
                if (imageDisplay) {
                    // Extract filename from src for error display
                    const filename = src.split('/').pop();
                    this.showSplitImageError(imageDisplay, filename);
                }
            }
        };
        
        img.src = src;
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
        
        // Hide all answer containers
        const containerIds = [
            'preview-multiple-choice-split',
            'preview-multiple-correct-split',
            'preview-true-false-split',
            'preview-numeric-split',
            'preview-ordering-split'
        ];
        
        this.hideSplitAnswerContainers(containerIds);
        
        // Clear and hide question image
        this.clearSplitQuestionImage();
    }

    /**
     * Clear and hide question image
     */
    clearSplitQuestionImage() {
        const imageDisplay = document.getElementById('preview-question-image-split');
        const img = imageDisplay?.querySelector('img');
        
        if (imageDisplay) {
            imageDisplay.style.display = 'none';
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
            const container = document.getElementById(id);
            if (container) {
                container.style.display = 'none';
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
        const tfContainer = document.getElementById(`preview-${type}-split`);
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
        
        // Show and populate the correct container
        switch (data.type) {
            case 'multiple-choice':
                document.getElementById('preview-multiple-choice-split').style.display = 'block';
                this.renderSplitMultipleChoicePreview(data.options, data.correctIndex);
                break;

            case 'multiple-correct':
                document.getElementById('preview-multiple-correct-split').style.display = 'block';
                this.renderSplitMultipleCorrectPreview(data.options, data.correctIndices);
                break;
                
            case 'true-false':
                document.getElementById('preview-true-false-split').style.display = 'block';
                this.renderSplitTrueFalsePreview(data.correctAnswer);
                break;
                
            case 'numeric':
                document.getElementById('preview-numeric-split').style.display = 'block';
                this.renderSplitNumericPreview();
                break;

            case 'ordering':
                document.getElementById('preview-ordering-split').style.display = 'block';
                this.renderSplitOrderingPreview(data.options, data.correctOrder);
                break;
        }
    }

    /**
     * Render multiple choice options preview
     */
    renderSplitMultipleChoicePreview(options, correctAnswer) {
        const container = document.getElementById('preview-multiple-choice-split');
        const optionsContainer = container?.querySelector('.player-options');
        
        if (!container || !optionsContainer) {
            logger.warn('Multiple choice preview containers not found');
            return;
        }
        
        optionsContainer.innerHTML = '';
        
        if (!options || options.length === 0) {
            // Simple translation map for "No options"
            const translations = {
                es: 'Sin opciones', fr: 'Aucune option', de: 'Keine Optionen',
                it: 'Nessuna opzione', pt: 'Sem opções', pl: 'Brak opcji',
                ja: 'オプションなし', zh: '无选项'
            };
            const lang = translationManager.getCurrentLanguage();
            const noOptionsText = translations[lang] || 'No options';
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
        const container = document.getElementById('preview-multiple-correct-split');
        const optionsContainer = container?.querySelector('.player-checkbox-options');
        
        if (!container || !optionsContainer) {
            logger.warn('Multiple correct preview containers not found');
            return;
        }
        
        optionsContainer.innerHTML = '';
        
        logger.debug('Multiple correct preview data:', { options, correctAnswers });
        
        if (!options || options.length === 0) {
            // Simple translation map for "No options"
            const translations = {
                es: 'Sin opciones', fr: 'Aucune option', de: 'Keine Optionen',
                it: 'Nessuna opzione', pt: 'Sem opções', pl: 'Brak opcji',
                ja: 'オプションなし', zh: '无选项'
            };
            const lang = translationManager.getCurrentLanguage();
            const noOptionsText = translations[lang] || 'No options';
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
        const container = document.getElementById('preview-true-false-split');
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
        const container = document.getElementById('preview-numeric-split');
        const input = container?.querySelector('input');

        if (input) {
            input.placeholder = 'Enter numeric answer...';
            input.disabled = true;
        }
    }

    /**
     * Render ordering preview
     */
    renderSplitOrderingPreview(options, correctOrder) {
        const container = document.getElementById('preview-ordering-split');
        if (!container) {
            logger.warn('Preview ordering container not found');
            return;
        }

        if (!options || options.length === 0) {
            container.innerHTML = '<p>No ordering options available</p>';
            return;
        }

        // Distinct colors for tracking items
        const itemColors = [
            'rgba(59, 130, 246, 0.15)',   // Blue
            'rgba(16, 185, 129, 0.15)',   // Green
            'rgba(245, 158, 11, 0.15)',   // Orange
            'rgba(239, 68, 68, 0.15)',    // Red
            'rgba(139, 92, 246, 0.15)',   // Purple
            'rgba(236, 72, 153, 0.15)'    // Pink
        ];

        let html = `
            <div class="ordering-player-instruction" data-translate="ordering_player_instruction"></div>
            <div class="ordering-display">
        `;

        options.forEach((option, index) => {
            const bgColor = itemColors[index % itemColors.length];
            html += `
                <div class="ordering-display-item" data-original-index="${index}" data-order-index="${index}" style="background: ${bgColor};">
                    <div class="ordering-item-number">${index + 1}</div>
                    <div class="ordering-item-content">${option}</div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;

        // Translate the instruction
        translationManager.translateContainer(container);
    }

    /**
     * Update question counter display
     */
    updateSplitQuestionCounter(questionNumber, totalQuestions) {
        const counterDisplay = document.getElementById('preview-question-counter-split');
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
        optionDiv.style.opacity = '1';
        container.appendChild(optionDiv);
    }


    /**
     * Format code blocks in text - matches mathRenderer.formatCodeBlocks()
     */
    formatCodeBlocks(text) {
        if (!text) return '';
        
        // Convert code blocks (```language ... ```) - matches mathRenderer approach
        text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, language, code) => {
            const lang = language || 'text';
            const trimmedCode = code.trim();
            return `<pre><code class="language-${lang}">${this.escapeHtml(trimmedCode)}</code></pre>`;
        });
        
        // Convert inline code (`code`) - escape HTML to prevent XSS
        text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${this.escapeHtml(code)}</code>`);
        
        return text;
    }

    /**
     * Escape HTML entities in text - matches mathRenderer approach
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
            type.style.display = 'none';
        });
    }

    /**
     * Render mobile question text
     */
    renderMobileQuestionText(questionText) {
        const previewElement = document.getElementById('mobile-preview-question-text');
        
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
        this.applyMobileCodeHighlighting(previewElement);
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
            window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, element]);
            logger.debug('Mobile LaTeX queued:', element.id);
        }
    }

    /**
     * Apply syntax highlighting for code blocks in mobile preview
     */
    applyMobileCodeHighlighting(element) {
        const codeBlocks = element.querySelectorAll('pre code');
        
        if (codeBlocks.length > 0) {
            // Try to apply Highlight.js if available (like in-game)
            if (window.hljs && window.hljs.highlightElement) {
                codeBlocks.forEach(codeBlock => {
                    // Add proper classes and apply Highlight.js
                    if (!codeBlock.classList.contains('hljs')) {
                        window.hljs.highlightElement(codeBlock);
                        
                        // Mark parent pre as having syntax highlighting
                        const preElement = codeBlock.closest('pre');
                        if (preElement) {
                            preElement.classList.add('has-syntax-highlighting');
                        }
                    }
                });
                logger.debug('Mobile Highlight.js applied to', codeBlocks.length, 'blocks');
            } else {
                // Fallback: Use existing CSS classes that match the game styling
                codeBlocks.forEach(codeBlock => {
                    // Ensure proper CSS classes are applied (will inherit from code-blocks.css)
                    const preElement = codeBlock.closest('pre');
                    if (preElement && !preElement.classList.contains('has-syntax-highlighting')) {
                        // CSS will handle the dark background and proper styling
                        // No custom styling needed - let the CSS do the work
                    }
                });
                logger.debug('Mobile code styling applied via CSS classes to', codeBlocks.length, 'blocks');
            }
        }
    }

    /**
     * Render mobile answer type
     */
    renderMobileAnswerType(data) {
        switch (data.type) {
            case 'multiple-choice':
                this.renderMobileMultipleChoicePreview(data.options, data.correctIndex);
                break;
            case 'multiple-correct':
                this.renderMobileMultipleCorrectPreview(data.options, data.correctIndices);
                break;
            case 'true-false':
                this.renderMobileTrueFalsePreview(data.correctAnswer);
                break;
            case 'numeric':
                this.renderMobileNumericPreview(data.correctAnswer);
                break;
            case 'ordering':
                this.renderMobileOrderingPreview(data.options, data.correctOrder);
                break;
            default:
                logger.warn('Unknown mobile question type:', data.type);
        }
    }

    /**
     * Render mobile multiple choice options
     */
    renderMobileMultipleChoicePreview(options, correctAnswer) {
        const container = document.querySelector('#mobile-preview-answer-area .preview-multiple-choice');
        const optionsContainer = document.getElementById('mobile-preview-options');
        
        if (!container || !optionsContainer) {
            logger.warn('Mobile multiple choice preview containers not found');
            return;
        }
        
        container.style.display = 'block';
        optionsContainer.innerHTML = '';
        
        if (!options || options.length === 0) {
            // Simple translation map for "No options"
            const translations = {
                es: 'Sin opciones', fr: 'Aucune option', de: 'Keine Optionen',
                it: 'Nessuna opzione', pt: 'Sem opções', pl: 'Brak opcji',
                ja: 'オプションなし', zh: '无选项'
            };
            const lang = translationManager.getCurrentLanguage();
            const noOptionsText = translations[lang] || 'No options';
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
        const optionsContainer = document.getElementById('mobile-preview-checkbox-options');
        
        if (!container || !optionsContainer) {
            logger.warn('Mobile multiple correct preview containers not found');
            return;
        }
        
        container.style.display = 'block';
        optionsContainer.innerHTML = '';
        
        if (!options || options.length === 0) {
            // Simple translation map for "No options"
            const translations = {
                es: 'Sin opciones', fr: 'Aucune option', de: 'Keine Optionen',
                it: 'Nessuna opzione', pt: 'Sem opções', pl: 'Brak opcji',
                ja: 'オプションなし', zh: '无选项'
            };
            const lang = translationManager.getCurrentLanguage();
            const noOptionsText = translations[lang] || 'No options';
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
            this.applyMobileCodeHighlighting(optionDiv);
            
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
        const optionsContainer = document.getElementById('mobile-preview-tf-options');
        
        if (!container || !optionsContainer) {
            logger.warn('Mobile true/false preview containers not found');
            return;
        }
        
        container.style.display = 'block';
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
        const inputContainer = document.getElementById('mobile-preview-numeric');
        
        if (!container || !inputContainer) {
            logger.warn('Mobile numeric preview containers not found');
            return;
        }
        
        container.style.display = 'block';
        
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
        const orderingContainer = document.getElementById('mobile-preview-ordering');

        if (!container || !orderingContainer) {
            logger.warn('Mobile ordering preview containers not found');
            return;
        }

        container.style.display = 'block';

        if (!options || options.length === 0) {
            orderingContainer.innerHTML = '<p>No ordering options available</p>';
            return;
        }

        // Distinct colors for tracking items
        const itemColors = [
            'rgba(59, 130, 246, 0.15)',   // Blue
            'rgba(16, 185, 129, 0.15)',   // Green
            'rgba(245, 158, 11, 0.15)',   // Orange
            'rgba(239, 68, 68, 0.15)',    // Red
            'rgba(139, 92, 246, 0.15)',   // Purple
            'rgba(236, 72, 153, 0.15)'    // Pink
        ];

        let html = `
            <div class="ordering-player-instruction" data-translate="ordering_player_instruction"></div>
            <div class="ordering-display">
        `;

        options.forEach((option, index) => {
            const bgColor = itemColors[index % itemColors.length];
            html += `
                <div class="ordering-display-item" data-original-index="${index}" data-order-index="${index}" style="background: ${bgColor};">
                    <div class="ordering-item-number">${index + 1}</div>
                    <div class="ordering-item-content">${option}</div>
                </div>
            `;
        });

        html += '</div>';
        orderingContainer.innerHTML = html;

        // Translate the instruction
        translationManager.translateContainer(orderingContainer);
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