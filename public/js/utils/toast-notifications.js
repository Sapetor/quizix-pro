/**
 * Toast Notification System
 * Provides non-intrusive, auto-dismissing notifications that don't require user interaction
 */

import { logger } from '../core/config.js';
import { escapeHtml } from './dom.js';

export class ToastNotifications {
    constructor() {
        this.toasts = [];
        this.container = null;
        this.initializeContainer();
        
        logger.debug('🍞 Toast Notification System initialized');
    }

    /**
     * Initialize the toast container
     */
    initializeContainer() {
        // Check if container already exists
        this.container = document.getElementById('toast-container');
        
        if (!this.container) {
            // Create container
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - Message to display
     * @param {string} type - Type: 'success', 'error', 'info', 'warning' 
     * @param {number} duration - Duration in ms (default: 3000)
     */
    show(message, type = 'info', duration = 3000) {
        if (!message) return;

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        // Add icon based on type
        const icon = this.getIcon(type);
        
        // Escape message to prevent XSS attacks
        const safeMessage = escapeHtml(message);
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${icon}</span>
                <span class="toast-message">${safeMessage}</span>
            </div>
        `;

        // Add to container
        this.container.appendChild(toast);
        this.toasts.push(toast);

        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });

        // Auto-dismiss - store timer on element for cleanup
        toast._dismissTimer = setTimeout(() => {
            toast._dismissTimer = null;
            this.dismiss(toast);
        }, duration);

        // Allow manual dismissal by clicking
        toast.addEventListener('click', () => {
            if (toast._dismissTimer) {
                clearTimeout(toast._dismissTimer);
                toast._dismissTimer = null;
            }
            this.dismiss(toast);
        });

        logger.debug(`🍞 Toast shown: ${type} - ${message}`);

        return toast;
    }

    /**
     * Get icon for toast type
     * @param {string} type - Toast type
     * @returns {string} Icon emoji
     */
    getIcon(type) {
        const icons = {
            success: '✅',
            error: '❌', 
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    /**
     * Dismiss a toast
     * @param {Element} toast - Toast element to dismiss
     */
    dismiss(toast) {
        if (!toast || !toast.parentNode) return;

        // Clear any pending dismiss timer
        if (toast._dismissTimer) {
            clearTimeout(toast._dismissTimer);
            toast._dismissTimer = null;
        }

        // Clear any pending animation timer
        if (toast._animTimer) {
            clearTimeout(toast._animTimer);
            toast._animTimer = null;
        }

        // Trigger exit animation
        toast.classList.add('toast-hide');

        // Remove after animation completes - track this timer too
        toast._animTimer = setTimeout(() => {
            toast._animTimer = null;
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }

            // Remove from tracking array
            const index = this.toasts.indexOf(toast);
            if (index > -1) {
                this.toasts.splice(index, 1);
            }
        }, 300); // Match CSS animation duration
    }

    /**
     * Show success toast
     * @param {string} message - Success message
     * @param {number} duration - Duration in ms (default: 2500)
     */
    success(message, duration = 2500) {
        return this.show(message, 'success', duration);
    }

    /**
     * Show error toast
     * @param {string} message - Error message  
     * @param {number} duration - Duration in ms (default: 4000)
     */
    error(message, duration = 4000) {
        return this.show(message, 'error', duration);
    }

    /**
     * Show warning toast
     * @param {string} message - Warning message
     * @param {number} duration - Duration in ms (default: 3500)
     */
    warning(message, duration = 3500) {
        return this.show(message, 'warning', duration);
    }

    /**
     * Show info toast
     * @param {string} message - Info message
     * @param {number} duration - Duration in ms (default: 3000)
     */
    info(message, duration = 3000) {
        return this.show(message, 'info', duration);
    }

    /**
     * Clear all toasts
     */
    clearAll() {
        this.toasts.forEach(toast => this.dismiss(toast));
    }

    /**
     * Cleanup method
     */
    destroy() {
        this.clearAll();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        logger.debug('🍞 Toast Notification System destroyed');
    }
}

// Create singleton instance
export const toastNotifications = new ToastNotifications();

// Make available globally for debugging
if (typeof window !== 'undefined') {
    window.toastNotifications = toastNotifications;
}

export default toastNotifications;