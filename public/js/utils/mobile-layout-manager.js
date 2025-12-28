/**
 * Mobile Layout Manager
 * Intelligently adapts mobile gameplay layout based on content type and height
 * Provides smooth scrolling for tall content while maintaining immersive experience for short content
 */

import { logger } from '../core/config.js';
import { dom } from './dom.js';

export class MobileLayoutManager {
    constructor() {
        this.currentContentType = 'short'; // 'short', 'tall', 'code', 'image'
        this.viewportHeight = window.innerHeight;
        this.contentHeightThreshold = window.innerHeight * 0.85; // 85% of viewport
        this.enabled = window.innerWidth <= 768; // Mobile only
        
        this.setupEventListeners();
        logger.debug('📱 Mobile Layout Manager initialized');
    }

    /**
     * Setup event listeners for layout management
     */
    setupEventListeners() {
        // Listen for game state changes
        document.addEventListener('game-ui-state-changed', (event) => {
            if (event.detail.state === 'playing' && this.enabled) {
                // Delay to ensure content is rendered
                setTimeout(() => this.analyzeAndAdaptLayout(), 100);
            }
        });

        // Listen for window resize
        window.addEventListener('resize', () => {
            this.viewportHeight = window.innerHeight;
            this.enabled = window.innerWidth <= 768;
            this.contentHeightThreshold = window.innerHeight * 0.85;
            
            if (this.enabled) {
                this.analyzeAndAdaptLayout();
            }
        });

        // Listen for content updates
        document.addEventListener('question-content-updated', () => {
            if (this.enabled) {
                setTimeout(() => this.analyzeAndAdaptLayout(), 150);
            }
        });
    }

    /**
     * Analyze current question content and adapt layout accordingly
     */
    analyzeAndAdaptLayout() {
        if (!this.enabled) return;

        const container = document.querySelector('.container.game-state-playing');
        const playerContainer = document.querySelector('.player-game-container');
        
        if (!container || !playerContainer) {
            logger.debug('📱 Mobile layout: Required containers not found');
            return;
        }

        // Analyze content
        const contentAnalysis = this.analyzeQuestionContent(playerContainer);
        logger.debug('📱 Content analysis:', contentAnalysis);

        // Apply appropriate layout
        this.applyContentAwareLayout(container, contentAnalysis);
    }

    /**
     * Analyze question content to determine optimal layout strategy
     */
    analyzeQuestionContent(playerContainer) {
        const content = playerContainer.innerHTML;
        const analysis = {
            hasCode: this.detectCode(content),
            hasImage: this.detectImage(content),
            hasLaTeX: this.detectLaTeX(content),
            estimatedHeight: this.estimateContentHeight(playerContainer),
            isTall: false
        };

        // Determine if content is tall
        analysis.isTall = analysis.estimatedHeight > this.contentHeightThreshold;

        // Determine primary content type
        if (analysis.hasCode) {
            analysis.primaryType = 'code';
        } else if (analysis.hasImage) {
            analysis.primaryType = 'image';
        } else if (analysis.isTall) {
            analysis.primaryType = 'tall';
        } else {
            analysis.primaryType = 'short';
        }

        return analysis;
    }

    /**
     * Apply content-aware layout classes
     */
    applyContentAwareLayout(container, analysis) {
        // Remove existing layout classes
        container.classList.remove('tall-content', 'has-code', 'has-image', 'short-content');

        // Apply new classes based on analysis
        if (analysis.isTall || analysis.primaryType === 'code' || analysis.primaryType === 'image') {
            container.classList.add('tall-content');
            logger.debug('📱 Applied tall-content layout for better scrolling');
        } else {
            container.classList.add('short-content');
            logger.debug('📱 Applied short-content layout for immersive experience');
        }

        if (analysis.hasCode) {
            container.classList.add('has-code');
            logger.debug('📱 Applied code-specific optimizations');
        }

        if (analysis.hasImage) {
            container.classList.add('has-image');
            logger.debug('📱 Applied image-specific optimizations');
        }

        // Update current type
        this.currentContentType = analysis.primaryType;
    }

    /**
     * Detect code snippets in content
     */
    detectCode(content) {
        const codeIndicators = [
            /<pre\b/i,
            /<code\b/i,
            /class="code-block"/i,
            /class="language-/i,
            /```/,
            /function\s*\(/,
            /class\s+\w+/,
            /import\s+/,
            /def\s+\w+\(/,
            /var\s+\w+\s*=/,
            /let\s+\w+\s*=/,
            /const\s+\w+\s*=/
        ];
        
        return codeIndicators.some(pattern => pattern.test(content));
    }

    /**
     * Detect images in content
     */
    detectImage(content) {
        return /<img\b[^>]*>/i.test(content) || 
               content.includes('data:image/') ||
               /\.(jpg|jpeg|png|gif|webp|svg)/i.test(content);
    }

    /**
     * Detect LaTeX content
     */
    detectLaTeX(content) {
        const latexPatterns = [
            /\\\(/,     // \( ... \)
            /\\\[/,     // \[ ... \]
            /\$\$/,     // $$ ... $$
            /\\frac/,   // \frac{}{}
            /\\sqrt/,   // \sqrt{}
            /\\sum/,    // \sum
            /\\int/,    // \int
            /\\alpha|\\beta|\\gamma|\\delta/i, // Greek letters
            /\\text\{/,  // \text{}
            /\\mathbb/   // \mathbb{}
        ];
        
        return latexPatterns.some(pattern => pattern.test(content));
    }

    /**
     * Estimate content height
     */
    estimateContentHeight(element) {
        try {
            // Create a temporary copy to measure actual height
            const clone = element.cloneNode(true);
            clone.style.position = 'absolute';
            clone.style.visibility = 'hidden';
            clone.style.height = 'auto';
            clone.style.width = element.offsetWidth + 'px';
            clone.style.top = '-9999px';
            
            document.body.appendChild(clone);
            const height = clone.scrollHeight;
            document.body.removeChild(clone);
            
            return height;
        } catch (error) {
            logger.warn('📱 Could not estimate content height:', error);
            // Fallback: Use current element height
            return element.scrollHeight || element.offsetHeight || 400;
        }
    }

    /**
     * Force layout recalculation (useful for dynamic content)
     */
    recalculateLayout() {
        if (this.enabled) {
            setTimeout(() => this.analyzeAndAdaptLayout(), 50);
        }
    }

    /**
     * Get current layout information
     */
    getLayoutInfo() {
        return {
            enabled: this.enabled,
            currentContentType: this.currentContentType,
            viewportHeight: this.viewportHeight,
            contentHeightThreshold: this.contentHeightThreshold
        };
    }

    /**
     * Enable/disable mobile layout management
     */
    setEnabled(enabled) {
        this.enabled = enabled && (window.innerWidth <= 768);
        logger.debug('📱 Mobile layout manager enabled:', this.enabled);
    }

    /**
     * Cleanup method
     */
    destroy() {
        // Event listeners are automatically removed when page unloads
        logger.debug('📱 Mobile Layout Manager destroyed');
    }
}

// Create singleton instance
export const mobileLayoutManager = new MobileLayoutManager();

export default mobileLayoutManager;