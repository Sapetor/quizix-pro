/**
 * Math/LaTeX Renderer Module
 * Handles MathJax rendering and mathematical content formatting
 * 
 * EXTRACTION NOTES:
 * - Extracted from script.js lines 2742-2823, 3862-3921
 * - Includes robust MathJax integration with fallbacks and error handling
 * - Manages LaTeX rendering for quiz questions and answers
 * - Includes code block formatting for programming content
 * - Dependencies: MathJax (loaded externally)
 */

import { TIMING, logger } from '../core/config.js';
import { simpleMathJaxService } from './simple-mathjax-service.js';

export class MathRenderer {
    constructor() {
        this.mathJaxRenderTimeout = null;
        this.processingElements = new Set();
        this.mathJaxService = simpleMathJaxService;
        
        logger.debug('🔄 MathRenderer: Using simplified MathJax service');
    }

    /**
     * Wait for MathJax to be ready before executing callback (simplified)
     * @param {Function} callback - Function to execute when MathJax is ready
     */
    waitForMathJaxReady(callback) {
        // Use simplified service - always call callback to prevent blocking
        if (this.mathJaxService.isAvailable()) {
            callback();
        } else {
            // Don't block execution - call callback anyway
            logger.debug('MathJax not ready, proceeding without LaTeX rendering');
            callback();
        }
    }

    /**
     * Render MathJax for a specific element
     * @param {HTMLElement} element - Element to render math content in
     */
    async renderMathJax(element) {
        if (!element) return;
        
        try {
            // Use simplified MathJax service
            await this.mathJaxService.render([element]);
            
            // Ensure proper display styling after rendering
            const containers = element.querySelectorAll('.mjx-container');
            containers.forEach(container => {
                container.style.display = 'inline-block';
                container.style.verticalAlign = 'middle';
                container.classList.add('MathJax_Processed');
                
                // Prevent pointer events on MathJax elements to allow parent clicking
                container.style.pointerEvents = 'none';
            });
            
        } catch (err) {
            logger.warn('MathJax rendering failed (non-blocking):', err);
        }
    }

    /**
     * Render MathJax globally with debouncing for performance
     */
    async renderMathJaxGlobal() {
        if (this.mathJaxRenderTimeout) {
            clearTimeout(this.mathJaxRenderTimeout);
        }
        
        try {
            // Find all elements with math content
            const elementsWithMath = document.querySelectorAll([
                '[data-has-math]',
                '.question-text',
                '#current-question',
                '#player-question-text',
                '.player-option',
                '.option-display',
                '#preview-question-text-split',
                '#preview-answer-area-split',
                '.preview-content',
                '.preview-content-split'
            ].join(', '));
            
            const mathElements = Array.from(elementsWithMath).filter(el => 
                el.textContent.includes('$') || el.innerHTML.includes('$')
            );
            
            if (mathElements.length === 0) {
                logger.debug('🧮 No elements with LaTeX found for global rendering');
                return;
            }
            
            logger.debug('🧮 Global MathJax rendering for', mathElements.length, 'elements');
            
            // Use simplified MathJax service for batch rendering
            await this.mathJaxService.render(mathElements);
            
            logger.debug('✅ Global MathJax rendering completed');
            
        } catch (err) {
            logger.error('❌ Global MathJax rendering failed:', err);
        }
    }

    /**
     * Render MathJax only for editor elements (quiz builder) - prevents game element contamination
     */
    async renderMathJaxForEditor() {
        if (this.mathJaxRenderTimeout) {
            clearTimeout(this.mathJaxRenderTimeout);
        }
        
        try {
            // Only target editor elements, NEVER game elements
            const editorElements = document.querySelectorAll([
                '[data-has-math]',
                '.question-text',               // Editor question inputs
                '#preview-question-text-split', // Preview area
                '#preview-answer-area-split',   // Preview answers
                '.preview-content',             // Preview content
                '.preview-content-split'        // Split preview
            ].join(', '));
            
            const elementsWithMath = Array.from(editorElements).filter(el => 
                el.textContent.includes('$') || el.innerHTML.includes('$')
            );
            
            if (elementsWithMath.length === 0) {
                logger.debug('🧮 No editor elements with LaTeX found');
                return;
            }
            
            logger.debug('🧮 Editor MathJax rendering for', elementsWithMath.length, 'elements (avoiding game elements)');
            
            // Use simplified MathJax service for editor rendering
            await this.mathJaxService.render(elementsWithMath);
            
            logger.debug('✅ Editor MathJax rendering completed');
            
        } catch (err) {
            logger.error('❌ Editor MathJax rendering failed:', err);
        }
    }

    /**
     * Format code blocks in text content
     * @param {string} text - Text containing code blocks
     * @returns {string} - Formatted text with HTML code blocks
     */
    formatCodeBlocks(text) {
        if (!text) return text;

        // Convert code blocks (```language ... ```)
        text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, language, code) => {
            // SECURITY: Sanitize language to prevent XSS via class attribute injection
            // Only allow alphanumeric characters and common language names
            const rawLang = language || 'text';
            const lang = rawLang.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30) || 'text';
            const trimmedCode = code.trim();
            return `<pre><code class="language-${lang}">${this.escapeHtml(trimmedCode)}</code></pre>`;
        });
        
        // Convert inline code (`code`) - escape HTML to prevent XSS
        text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${this.escapeHtml(code)}</code>`);
        
        return text;
    }

    /**
     * Escape HTML entities in text
     * @param {string} text - Text to escape
     * @returns {string} - HTML-escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Apply syntax highlighting to code blocks within an element
     * @param {HTMLElement} element - Element containing code blocks
     */
    applySyntaxHighlighting(element) {
        if (!element || typeof window.hljs === 'undefined') {
            return; // Highlight.js not available
        }

        try {
            // Find all code blocks with language classes
            const codeBlocks = element.querySelectorAll('pre code[class*="language-"]');
            
            codeBlocks.forEach(codeBlock => {
                // Apply syntax highlighting
                window.hljs.highlightElement(codeBlock);
                
                // Add class to parent pre element for CSS targeting
                const preElement = codeBlock.closest('pre');
                if (preElement) {
                    preElement.classList.add('has-syntax-highlighting');
                }
            });
            
            // Also highlight any code blocks without specific language classes
            const genericCodeBlocks = element.querySelectorAll('pre code:not([class*="language-"])');
            genericCodeBlocks.forEach(codeBlock => {
                // Add a generic class and highlight
                codeBlock.className = 'language-text';
                window.hljs.highlightElement(codeBlock);
                
                // Add class to parent pre element for CSS targeting
                const preElement = codeBlock.closest('pre');
                if (preElement) {
                    preElement.classList.add('has-syntax-highlighting');
                }
            });
            
        } catch (error) {
            // Silently handle syntax highlighting errors
            logger.warn('Syntax highlighting failed:', error);
        }
    }

    /**
     * Process both code formatting and MathJax rendering for an element
     * @param {HTMLElement} element - Element to process
     */
    processContentFormatting(element) {
        if (!element) return;
        
        // First, format code blocks
        element.innerHTML = this.formatCodeBlocks(element.innerHTML);
        
        // Then apply syntax highlighting to code blocks
        this.applySyntaxHighlighting(element);
        
        // Finally, render MathJax
        this.renderMathJax(element);
    }

    /**
     * Check if MathJax is available and ready (delegated to service)
     * @returns {boolean} - Whether MathJax is ready
     */
    isMathJaxReady() {
        return this.mathJaxService.isAvailable();
    }

    /**
     * Wait for MathJax to be ready
     * @param {number} timeout - Maximum time to wait in milliseconds
     * @returns {Promise<boolean>} - Resolves when MathJax is ready
     */
    waitForMathJax(timeout = TIMING.MATHJAX_LOADING_TIMEOUT) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkReady = () => {
                if (this.isMathJaxReady()) {
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    resolve(false);
                } else {
                    setTimeout(checkReady, TIMING.DOM_UPDATE_DELAY);
                }
            };
            checkReady();
        });
    }

    /**
     * Clean up any processing timeouts and states
     */
    cleanup() {
        if (this.mathJaxRenderTimeout) {
            clearTimeout(this.mathJaxRenderTimeout);
            this.mathJaxRenderTimeout = null;
        }
        
        // Remove processing classes from any stuck elements
        this.processingElements.forEach(element => {
            element.classList.remove('processing-math');
            element.classList.add('math-ready');
        });
        this.processingElements.clear();
    }

    /**
     * Force re-render all math content on the page
     */
    forceRerender() {
        // Remove all existing MathJax content
        document.querySelectorAll('.mjx-container, .MathJax').forEach(el => el.remove());
        
        // Remove ready classes to force re-processing
        document.querySelectorAll('.math-ready').forEach(el => {
            el.classList.remove('math-ready');
        });
        
        // Re-render everything
        this.renderMathJaxGlobal();
    }
}