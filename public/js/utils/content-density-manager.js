/**
 * Content Density Manager
 * Intelligently adjusts spacing and sizing based on content type and complexity
 */

import { logger } from '../core/config.js';

export class ContentDensityManager {
    constructor() {
        this.initialized = false;
        this.observers = new Set();
        this.contentAnalysis = new Map();
    }

    /**
     * Initialize the content density system
     */
    initialize() {
        if (this.initialized) return;
        
        this.setupMutationObserver();
        this.analyzeExistingContent();
        this.initialized = true;
        
        logger.debug('Content Density Manager: Initialized smart spacing and sizing system');
    }

    /**
     * Set up mutation observer to handle dynamic content changes
     */
    setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.analyzeElement(node);
                        }
                    });
                }
            });
        });

        // Observe the main content areas
        const contentSelectors = [
            '#current-question',
            '#player-question-text', 
            '.preview-content',
            '.preview-content-split',
            '.player-options',
            '.host-options'
        ];

        contentSelectors.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                observer.observe(element, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
                this.observers.add(observer);
            }
        });
    }

    /**
     * Analyze existing content on page load
     */
    analyzeExistingContent() {
        const contentElements = document.querySelectorAll(`
            .question-text,
            .player-question-text,
            .host-question-text,
            #current-question,
            #player-question-text,
            .player-options,
            .host-options
        `);

        contentElements.forEach(element => this.analyzeElement(element));
    }

    /**
     * Analyze an element and apply appropriate density classes
     * @param {Element} element - Element to analyze
     */
    analyzeElement(element) {
        if (!element || !element.classList) return;

        const analysis = this.performContentAnalysis(element);
        this.contentAnalysis.set(element, analysis);
        this.applyDensityClasses(element, analysis);
    }

    /**
     * Perform detailed content analysis
     * @param {Element} element - Element to analyze
     * @returns {Object} Analysis results
     */
    performContentAnalysis(element) {
        const text = element.textContent || '';
        const html = element.innerHTML || '';
        
        const analysis = {
            // Content type detection
            hasLatex: this.detectLatex(html),
            hasCode: this.detectCode(html),
            hasImages: this.detectImages(html),
            
            // Content complexity
            textLength: text.length,
            wordCount: text.split(/\s+/).filter(word => word.length > 0).length,
            lineCount: text.split('\n').length,
            
            // Structural analysis
            hasManyOptions: this.detectManyOptions(element),
            hasLongOptions: this.detectLongOptions(element),
            hasNestedElements: this.detectNestedElements(element),
            
            // Viewport analysis
            viewportWidth: window.innerWidth,
            isMobile: window.innerWidth <= 768,
            isTablet: window.innerWidth > 768 && window.innerWidth <= 1024,
            isDesktop: window.innerWidth > 1024,
            
            // Content density score (0-100)
            densityScore: 0
        };

        // Calculate density score
        analysis.densityScore = this.calculateDensityScore(analysis);
        
        return analysis;
    }

    /**
     * Detect LaTeX content
     * @param {string} html - HTML content
     * @returns {boolean}
     */
    detectLatex(html) {
        return html.includes('mjx-container') || 
               html.includes('MathJax') ||
               html.includes('$$') ||
               html.includes('\\(') ||
               html.includes('\\[') ||
               /\$[^$]+\$/.test(html);
    }

    /**
     * Detect code content
     * @param {string} html - HTML content
     * @returns {boolean}
     */
    detectCode(html) {
        return html.includes('<pre') || 
               html.includes('<code') ||
               html.includes('```');
    }

    /**
     * Detect images
     * @param {string} html - HTML content
     * @returns {boolean}
     */
    detectImages(html) {
        return html.includes('<img') || 
               html.includes('background-image');
    }

    /**
     * Detect if element has many options (5+)
     * @param {Element} element - Element to check
     * @returns {boolean}
     */
    detectManyOptions(element) {
        const options = element.querySelectorAll('.player-option, .checkbox-option, .tf-option');
        return options.length >= 5;
    }

    /**
     * Detect if options are long (average >50 characters)
     * @param {Element} element - Element to check
     * @returns {boolean}
     */
    detectLongOptions(element) {
        const options = element.querySelectorAll('.player-option, .checkbox-option, .tf-option');
        if (options.length === 0) return false;
        
        const totalLength = Array.from(options).reduce((sum, option) => {
            return sum + (option.textContent?.length || 0);
        }, 0);
        
        const averageLength = totalLength / options.length;
        return averageLength > 50;
    }

    /**
     * Detect nested elements that increase complexity
     * @param {Element} element - Element to check
     * @returns {boolean}
     */
    detectNestedElements(element) {
        const nestedSelectors = [
            'pre', 'code', 'mjx-container', '.MathJax', 
            'table', 'ul', 'ol', 'blockquote'
        ];
        
        return nestedSelectors.some(selector => 
            element.querySelector(selector) !== null
        );
    }

    /**
     * Calculate content density score (0-100)
     * Higher score = more complex content = needs more space
     * @param {Object} analysis - Content analysis
     * @returns {number}
     */
    calculateDensityScore(analysis) {
        let score = 0;
        
        // Base text complexity (0-30 points)
        if (analysis.textLength > 500) score += 30;
        else if (analysis.textLength > 200) score += 20;
        else if (analysis.textLength > 100) score += 10;
        
        // Content type complexity (0-40 points)
        if (analysis.hasCode) score += 20;
        if (analysis.hasLatex) score += 15;
        if (analysis.hasImages) score += 10;
        if (analysis.hasNestedElements) score += 10;
        
        // Structural complexity (0-30 points)
        if (analysis.hasManyOptions) score += 15;
        if (analysis.hasLongOptions) score += 15;
        
        // Viewport adjustments
        if (analysis.isMobile) score += 10; // Mobile needs more compact layout
        
        return Math.min(score, 100);
    }

    /**
     * Apply appropriate density classes based on analysis
     * @param {Element} element - Element to modify
     * @param {Object} analysis - Content analysis
     */
    applyDensityClasses(element, analysis) {
        // Remove existing density classes
        element.classList.remove('content-compact', 'content-spacious', 'long-content');
        
        // Apply content type classes for smart sizing
        if (analysis.hasCode && analysis.hasLatex) {
            element.classList.add('mixed-content');
        } else if (analysis.hasCode) {
            element.classList.add('code-content');
        } else if (analysis.hasLatex) {
            element.classList.add('latex-content');
        } else {
            element.classList.add('text-content');
        }
        
        // Apply density classes based on score
        if (analysis.densityScore >= 70) {
            // High density content - use compact spacing
            element.classList.add('content-compact');
            if (analysis.textLength > 300) {
                element.classList.add('long-content');
            }
        } else if (analysis.densityScore <= 30 && analysis.isDesktop) {
            // Low density content on desktop - use spacious layout
            element.classList.add('content-spacious');
        }
        
        // Special handling for option containers
        if (element.classList.contains('player-options') || 
            element.classList.contains('host-options')) {
            this.optimizeOptionContainer(element, analysis);
        }

        logger.debug('Content Density Applied:', {
            element: element.className,
            score: analysis.densityScore,
            hasLatex: analysis.hasLatex,
            hasCode: analysis.hasCode,
            textLength: analysis.textLength,
            isMobile: analysis.isMobile
        });
    }

    /**
     * Optimize option container layout
     * @param {Element} container - Options container
     * @param {Object} analysis - Content analysis
     */
    optimizeOptionContainer(container, analysis) {
        // For many options, use grid layout on desktop
        if (analysis.hasManyOptions && analysis.isDesktop) {
            container.style.setProperty('display', 'grid', 'important');
            container.style.setProperty('grid-template-columns', 'repeat(auto-fit, minmax(250px, 1fr))', 'important');
            container.style.setProperty('gap', 'var(--option-gap-compact)', 'important');
        }
        
        // For mobile with many options, keep single column but compact spacing
        if (analysis.hasManyOptions && analysis.isMobile) {
            container.style.setProperty('gap', 'var(--option-gap-compact)', 'important');
        }
    }
}

// Create and export singleton instance
export const contentDensityManager = new ContentDensityManager();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        contentDensityManager.initialize();
    });
} else {
    contentDensityManager.initialize();
}

