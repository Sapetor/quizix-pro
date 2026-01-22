/**
 * Onboarding Tutorial - Spotlight-style guided tour for first-time users
 * Highlights UI elements with tooltips to guide users through main features
 */

import { logger } from '../core/config.js';
import { translationManager } from './translation-manager.js';
import { getJSON, setJSON, removeItem } from './storage-utils.js';
import { isMobile } from './dom.js';

const STORAGE_KEY = 'quiz_onboarding_complete';
const TUTORIAL_VERSION = 1;

class OnboardingTutorial {
    constructor() {
        this.currentStep = 0;
        this.steps = [];
        this.isActive = false;
        this.overlay = null;
        this.spotlight = null;
        this.tooltip = null;
        this.dontShowAgain = false;

        // Event handler references for cleanup
        this._keydownHandler = null;
        this._resizeHandler = null;
        this._clickHandler = null;

        this.initializeSteps();

        logger.debug('OnboardingTutorial initialized');
    }

    /**
     * Define all tutorial steps with target elements and content
     */
    initializeSteps() {
        this.steps = [
            {
                id: 'host-btn',
                targetSelector: '#host-btn',
                mobileSelector: '#host-btn-mobile',
                requiredScreen: 'main-menu',
                titleKey: 'onboarding_step1_title',
                contentKey: 'onboarding_step1_content',
                icon: '1',
                position: 'right'
            },
            {
                id: 'toolbar-add-question',
                targetSelector: '#toolbar-add-question',
                requiredScreen: 'host-screen',
                titleKey: 'onboarding_step2_title',
                contentKey: 'onboarding_step2_content',
                icon: '2',
                position: 'bottom'
            },
            {
                id: 'toolbar-save',
                targetSelector: '#toolbar-save',
                requiredScreen: 'host-screen',
                titleKey: 'onboarding_step3_title',
                contentKey: 'onboarding_step3_content',
                icon: '3',
                position: 'bottom'
            },
            {
                id: 'toolbar-ai-gen',
                targetSelector: '#toolbar-ai-gen',
                requiredScreen: 'host-screen',
                titleKey: 'onboarding_step4_title',
                contentKey: 'onboarding_step4_content',
                icon: '4',
                position: 'bottom'
            },
            {
                id: 'toolbar-preview',
                targetSelector: '#toolbar-preview',
                requiredScreen: 'host-screen',
                titleKey: 'onboarding_step5_title',
                contentKey: 'onboarding_step5_content',
                icon: '5',
                position: 'bottom'
            },
            {
                id: 'start-hosting-header-small',
                targetSelector: '#start-hosting-header-small',
                requiredScreen: 'host-screen',
                titleKey: 'onboarding_step6_title',
                contentKey: 'onboarding_step6_content',
                icon: '6',
                position: 'bottom',
                skipIfHidden: true
            },
            {
                id: 'join-btn',
                targetSelector: '#join-btn',
                mobileSelector: '#join-btn-mobile',
                requiredScreen: 'main-menu',
                titleKey: 'onboarding_step7_title',
                contentKey: 'onboarding_step7_content',
                icon: '7',
                position: 'left'
            }
        ];
    }

    /**
     * Check if this is a first-time user
     */
    shouldShowOnboarding() {
        const data = getJSON(STORAGE_KEY);
        if (!data) {
            return true;
        }
        // Also check version for future tutorial updates
        return !data.completed || data.version < TUTORIAL_VERSION;
    }

    /**
     * Mark onboarding as complete
     */
    setOnboardingComplete() {
        const data = {
            completed: true,
            completedAt: new Date().toISOString(),
            version: TUTORIAL_VERSION
        };
        if (setJSON(STORAGE_KEY, data)) {
            logger.debug('Onboarding marked as complete');
        }
    }

    /**
     * Reset onboarding to show again (for testing or manual trigger)
     */
    resetOnboarding() {
        if (removeItem(STORAGE_KEY)) {
            logger.debug('Onboarding reset');
        }
    }

    /**
     * Start the onboarding tutorial
     */
    start() {
        if (this.isActive) {
            logger.debug('Onboarding already active');
            return;
        }

        logger.debug('Starting onboarding tutorial');
        this.isActive = true;
        this.currentStep = 0;
        this.dontShowAgain = false;

        this.createOverlay();
        this.bindEvents();
        this.showStep(0);
    }

    /**
     * End the onboarding tutorial
     * @param {boolean} savePreference - Whether to save "don't show again" preference
     */
    end(savePreference = false) {
        if (!this.isActive) return;

        logger.debug('Ending onboarding tutorial');
        this.isActive = false;

        // Save preference if requested or checkbox was checked
        if (savePreference || this.dontShowAgain) {
            this.setOnboardingComplete();
        }

        this.cleanup();
    }

    /**
     * Create the overlay and tooltip elements
     */
    createOverlay() {
        // Create main overlay container
        this.overlay = document.createElement('div');
        this.overlay.className = 'onboarding-overlay';
        this.overlay.id = 'onboarding-overlay';

        // Create spotlight element
        this.spotlight = document.createElement('div');
        this.spotlight.className = 'onboarding-spotlight';
        this.overlay.appendChild(this.spotlight);

        // Create tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'onboarding-tooltip';
        this.tooltip.setAttribute('role', 'dialog');
        this.tooltip.setAttribute('aria-modal', 'true');
        this.overlay.appendChild(this.tooltip);

        document.body.appendChild(this.overlay);

        // Activate overlay with animation
        requestAnimationFrame(() => {
            this.overlay.classList.add('active');
        });
    }

    /**
     * Bind event handlers for keyboard and window resize
     */
    bindEvents() {
        this._keydownHandler = (e) => {
            if (!this.isActive) return;

            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    this.end(false);
                    break;
                case 'ArrowRight':
                case 'Enter':
                    e.preventDefault();
                    this.nextStep();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.previousStep();
                    break;
            }
        };

        this._resizeHandler = () => {
            if (this.isActive) {
                this.positionElements();
            }
        };

        this._clickHandler = (e) => {
            // Allow clicking through to target element
            const targetElement = this.getCurrentTargetElement();
            if (targetElement && targetElement.contains(e.target)) {
                // User clicked the highlighted element - advance to next step
                this.nextStep();
            }
        };

        document.addEventListener('keydown', this._keydownHandler);
        window.addEventListener('resize', this._resizeHandler);
        this.overlay.addEventListener('click', this._clickHandler);
    }

    /**
     * Remove event handlers
     */
    unbindEvents() {
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this._clickHandler && this.overlay) {
            this.overlay.removeEventListener('click', this._clickHandler);
            this._clickHandler = null;
        }
    }

    /**
     * Clean up DOM elements and event handlers
     */
    cleanup() {
        this.unbindEvents();

        // Remove highlight from any target element
        const highlightedElements = document.querySelectorAll('.onboarding-target');
        highlightedElements.forEach(el => el.classList.remove('onboarding-target'));

        // Remove overlay with animation
        if (this.overlay) {
            this.overlay.classList.remove('active');
            setTimeout(() => {
                if (this.overlay && this.overlay.parentNode) {
                    this.overlay.parentNode.removeChild(this.overlay);
                }
                this.overlay = null;
                this.spotlight = null;
                this.tooltip = null;
            }, 300);
        }
    }

    /**
     * Get current screen ID
     */
    getCurrentScreen() {
        const activeScreen = document.querySelector('.screen.active');
        return activeScreen ? activeScreen.id : null;
    }

    /**
     * Navigate to required screen for current step
     */
    async navigateToScreen(screenId) {
        const currentScreen = this.getCurrentScreen();
        if (currentScreen === screenId) {
            return true;
        }

        if (window.game && window.game.showScreen) {
            window.game.showScreen(screenId);
            // Wait for screen transition
            await new Promise(resolve => setTimeout(resolve, 350));
            return true;
        }

        logger.warn('Unable to navigate to screen:', screenId);
        return false;
    }

    /**
     * Get the target element for current step, considering mobile alternatives
     */
    getCurrentTargetElement() {
        const step = this.steps[this.currentStep];
        if (!step) return null;

        const isMobileDevice = isMobile();

        // Try mobile selector first on mobile devices
        if (isMobileDevice && step.mobileSelector) {
            const mobileElement = document.querySelector(step.mobileSelector);
            if (mobileElement && this.isElementVisible(mobileElement)) {
                return mobileElement;
            }
        }

        // Fall back to main selector
        const element = document.querySelector(step.targetSelector);
        if (element && this.isElementVisible(element)) {
            return element;
        }

        return null;
    }

    /**
     * Check if an element is visible
     */
    isElementVisible(element) {
        if (!element) return false;
        return element.offsetParent !== null &&
               getComputedStyle(element).visibility !== 'hidden' &&
               getComputedStyle(element).display !== 'none';
    }

    /**
     * Show a specific step
     */
    async showStep(stepIndex) {
        if (stepIndex < 0 || stepIndex >= this.steps.length) {
            return;
        }

        const step = this.steps[stepIndex];
        this.currentStep = stepIndex;

        // Navigate to required screen if needed
        if (step.requiredScreen) {
            await this.navigateToScreen(step.requiredScreen);
        }

        // Get target element
        let targetElement = this.getCurrentTargetElement();

        // Skip step if element is hidden and skipIfHidden is set
        if (!targetElement && step.skipIfHidden) {
            logger.debug(`Skipping step ${stepIndex} - element hidden`);
            if (stepIndex < this.steps.length - 1) {
                this.showStep(stepIndex + 1);
            } else {
                this.end(true);
            }
            return;
        }

        // Wait a bit for element to appear after screen transition
        if (!targetElement) {
            await new Promise(resolve => setTimeout(resolve, 200));
            targetElement = this.getCurrentTargetElement();
        }

        if (!targetElement) {
            logger.warn(`Target element not found for step ${stepIndex}:`, step.targetSelector);
            // Skip to next step if element not found
            if (stepIndex < this.steps.length - 1) {
                this.showStep(stepIndex + 1);
            } else {
                this.end(true);
            }
            return;
        }

        // Add highlight class to target
        document.querySelectorAll('.onboarding-target').forEach(el => el.classList.remove('onboarding-target'));
        targetElement.classList.add('onboarding-target');

        // Scroll element into view if needed
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Wait for scroll to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Position spotlight and tooltip
        this.positionElements();

        // Render tooltip content
        this.renderTooltip(step);

        // Show tooltip with animation
        requestAnimationFrame(() => {
            this.tooltip.classList.add('visible');
        });
    }

    /**
     * Position the spotlight and tooltip relative to target element
     */
    positionElements() {
        const targetElement = this.getCurrentTargetElement();
        if (!targetElement) return;

        const step = this.steps[this.currentStep];
        const rect = targetElement.getBoundingClientRect();
        const padding = 8;

        // Position spotlight
        this.spotlight.style.left = `${rect.left - padding}px`;
        this.spotlight.style.top = `${rect.top - padding}px`;
        this.spotlight.style.width = `${rect.width + padding * 2}px`;
        this.spotlight.style.height = `${rect.height + padding * 2}px`;

        // Position tooltip
        this.positionTooltip(rect, step.position);
    }

    /**
     * Position tooltip relative to target element
     */
    positionTooltip(targetRect, preferredPosition) {
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        const margin = 16;
        const gap = 16;

        let left, top;
        let position = preferredPosition;

        // Calculate positions for each option
        const positions = {
            bottom: {
                left: targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2),
                top: targetRect.bottom + gap
            },
            top: {
                left: targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2),
                top: targetRect.top - tooltipRect.height - gap
            },
            right: {
                left: targetRect.right + gap,
                top: targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2)
            },
            left: {
                left: targetRect.left - tooltipRect.width - gap,
                top: targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2)
            }
        };

        // Try preferred position first
        let pos = positions[position];

        // Check if it fits
        const fits = (p) => {
            return p.left >= margin &&
                   p.left + tooltipRect.width <= viewport.width - margin &&
                   p.top >= margin &&
                   p.top + tooltipRect.height <= viewport.height - margin;
        };

        if (!fits(pos)) {
            // Try other positions in order of preference
            const fallbackOrder = ['bottom', 'top', 'right', 'left'];
            for (const fallback of fallbackOrder) {
                if (fits(positions[fallback])) {
                    position = fallback;
                    pos = positions[fallback];
                    break;
                }
            }
        }

        // Apply position with viewport clamping
        const finalLeft = Math.max(margin, Math.min(pos.left, viewport.width - tooltipRect.width - margin));
        const finalTop = Math.max(margin, Math.min(pos.top, viewport.height - tooltipRect.height - margin));

        this.tooltip.style.left = `${finalLeft}px`;
        this.tooltip.style.top = `${finalTop}px`;
        this.tooltip.setAttribute('data-position', position);
    }

    /**
     * Render tooltip content for current step
     */
    renderTooltip(step) {
        const title = translationManager.getTranslationSync(step.titleKey) || step.titleKey;
        const content = translationManager.getTranslationSync(step.contentKey) || step.contentKey;
        const stepOf = translationManager.getTranslationSync('onboarding_step_of') || 'Step {0} of {1}';
        const nextText = translationManager.getTranslationSync('onboarding_next') || 'Next';
        const backText = translationManager.getTranslationSync('onboarding_back') || 'Back';
        const skipText = translationManager.getTranslationSync('onboarding_skip') || 'Skip Tour';
        const finishText = translationManager.getTranslationSync('onboarding_finish') || 'Get Started!';
        const dontShowText = translationManager.getTranslationSync('onboarding_dont_show') || "Don't show this again";

        const isFirst = this.currentStep === 0;
        const isLast = this.currentStep === this.steps.length - 1;

        // Format step counter
        const stepCounter = stepOf.replace('{0}', this.currentStep + 1).replace('{1}', this.steps.length);

        // Build progress dots
        let dotsHtml = '';
        for (let i = 0; i < this.steps.length; i++) {
            const activeClass = i === this.currentStep ? 'active' : '';
            const completedClass = i < this.currentStep ? 'completed' : '';
            dotsHtml += `<button class="onboarding-dot ${activeClass} ${completedClass}"
                                data-step="${i}"
                                aria-label="Go to step ${i + 1}"
                                tabindex="0"></button>`;
        }

        this.tooltip.innerHTML = `
            <div class="onboarding-step-counter">${stepCounter}</div>
            <div class="onboarding-header">
                <div class="onboarding-step-icon">${step.icon}</div>
                <h3 class="onboarding-title">${title}</h3>
            </div>
            <p class="onboarding-content">${content}</p>
            <div class="onboarding-progress">${dotsHtml}</div>
            <div class="onboarding-nav">
                <button class="onboarding-btn onboarding-btn-skip" id="onboarding-skip">
                    ${skipText}
                </button>
                <div class="onboarding-nav-group">
                    ${!isFirst ? `<button class="onboarding-btn onboarding-btn-secondary" id="onboarding-back">${backText}</button>` : ''}
                    <button class="onboarding-btn onboarding-btn-primary" id="onboarding-next">
                        ${isLast ? finishText : nextText}
                    </button>
                </div>
            </div>
            <div class="onboarding-checkbox-container">
                <input type="checkbox" id="onboarding-dont-show" class="onboarding-checkbox"
                       ${this.dontShowAgain ? 'checked' : ''}>
                <label for="onboarding-dont-show" class="onboarding-checkbox-label">${dontShowText}</label>
            </div>
        `;

        // Bind button events
        this.bindTooltipEvents();
    }

    /**
     * Bind event handlers to tooltip buttons
     */
    bindTooltipEvents() {
        const skipBtn = this.tooltip.querySelector('#onboarding-skip');
        const nextBtn = this.tooltip.querySelector('#onboarding-next');
        const backBtn = this.tooltip.querySelector('#onboarding-back');
        const dontShowCheckbox = this.tooltip.querySelector('#onboarding-dont-show');
        const dots = this.tooltip.querySelectorAll('.onboarding-dot');

        if (skipBtn) {
            skipBtn.addEventListener('click', () => this.end(false));
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.currentStep === this.steps.length - 1) {
                    this.end(true);
                } else {
                    this.nextStep();
                }
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => this.previousStep());
        }

        if (dontShowCheckbox) {
            dontShowCheckbox.addEventListener('change', (e) => {
                this.dontShowAgain = e.target.checked;
            });
        }

        // Progress dot navigation
        dots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                const stepIndex = parseInt(e.target.dataset.step, 10);
                if (!isNaN(stepIndex)) {
                    this.goToStep(stepIndex);
                }
            });
        });

        // Focus the primary button for accessibility
        if (nextBtn) {
            setTimeout(() => nextBtn.focus(), 100);
        }
    }

    /**
     * Go to next step
     */
    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.tooltip.classList.remove('visible');
            setTimeout(() => {
                this.showStep(this.currentStep + 1);
            }, 150);
        } else {
            this.end(true);
        }
    }

    /**
     * Go to previous step
     */
    previousStep() {
        if (this.currentStep > 0) {
            this.tooltip.classList.remove('visible');
            setTimeout(() => {
                this.showStep(this.currentStep - 1);
            }, 150);
        }
    }

    /**
     * Go to a specific step
     */
    goToStep(stepIndex) {
        if (stepIndex >= 0 && stepIndex < this.steps.length && stepIndex !== this.currentStep) {
            this.tooltip.classList.remove('visible');
            setTimeout(() => {
                this.showStep(stepIndex);
            }, 150);
        }
    }
}

// Create singleton instance
export const onboardingTutorial = new OnboardingTutorial();

// Make available globally for manual trigger
window.startOnboardingTutorial = () => {
    onboardingTutorial.resetOnboarding();
    onboardingTutorial.start();
};

// Also expose as window.onboardingTutorial for debugging
window.onboardingTutorial = onboardingTutorial;
