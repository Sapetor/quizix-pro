/**
 * Connection Status Manager
 * Provides real-time network connectivity monitoring for LAN environments
 */

import { logger } from '../core/config.js';
import { translationManager } from './translation-manager.js';
import { APIHelper } from './api-helper.js';

export class ConnectionStatus {
    constructor() {
        this.isOnline = navigator.onLine;
        this.connectionQuality = 'unknown';
        this.lastPingTime = null;
        this.pingInterval = null;
        this.socket = null;
        this.callbacks = new Set();

        // Initialize UI elements
        this.initializeUI();
        this.bindEvents();
        this.startMonitoring();

        logger.debug('Connection status manager initialized');
    }

    /**
     * Create an abort signal with timeout (fallback for older browsers)
     * @param {number} ms - Timeout in milliseconds
     * @returns {AbortSignal} - Abort signal that triggers after timeout
     */
    createTimeoutSignal(ms) {
        // Use native AbortSignal.timeout if available
        if (typeof AbortSignal.timeout === 'function') {
            return AbortSignal.timeout(ms);
        }

        // Fallback for older browsers
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
    }

    /**
     * Bind to the existing header connection pill and add a ping span.
     * The pill is rendered statically in index.html as part of the header redesign;
     * this class drives its dot color, label, and ping readout.
     */
    initializeUI() {
        const pill = document.getElementById('header-conn-pill');
        if (!pill) {
            logger.debug('Connection pill (#header-conn-pill) not present on this page');
            return;
        }

        const dot = pill.querySelector('.dot');
        const text = pill.querySelector('span[data-translate]');
        let ping = pill.querySelector('.ping');
        if (!ping) {
            ping = document.createElement('span');
            ping.className = 'ping';
            ping.setAttribute('aria-hidden', 'true');
            pill.appendChild(ping);
        }

        this.elements = { pill, dot, text, ping };
        logger.debug('Connection status bound to header pill');
    }

    /**
     * Bind network event listeners
     */
    bindEvents() {
        // Native browser online/offline events
        window.addEventListener('online', () => {
            this.handleNetworkChange(true);
        });

        window.addEventListener('offline', () => {
            this.handleNetworkChange(false);
        });

        // Visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Tab became visible, check connection
                this.checkConnection();
            }
        });
    }

    /**
     * Start continuous monitoring
     */
    startMonitoring() {
        // Initial check
        this.checkConnection();

        // Set up periodic ping checks (every 30 seconds)
        this.pingInterval = setInterval(() => {
            if (!document.hidden) { // Only ping when tab is active
                this.checkConnection();
            }
        }, 30000);
    }

    /**
     * Stop monitoring (cleanup)
     */
    stopMonitoring() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Handle network state changes
     */
    handleNetworkChange(isOnline) {
        this.isOnline = isOnline;
        this.updateUI();
        this.notifyCallbacks();

        logger.info(`Network status changed: ${isOnline ? 'online' : 'offline'}`);
    }

    /**
     * Perform connection quality check
     */
    async checkConnection() {
        const startTime = Date.now();

        try {
            // Ping the server with a lightweight request
            const response = await fetch(APIHelper.getApiUrl('api/ping'), {
                method: 'GET',
                cache: 'no-cache',
                signal: this.createTimeoutSignal(5000) // 5 second timeout
            });

            const pingTime = Date.now() - startTime;
            this.lastPingTime = pingTime;

            if (response.ok) {
                this.isOnline = true;
                this.connectionQuality = this.calculateQuality(pingTime);
            } else {
                this.isOnline = false;
                this.connectionQuality = 'poor';
            }
        } catch (_error) {
            // Fallback: try a simple connectivity check
            try {
                const fallbackResponse = await fetch(window.location.origin, {
                    method: 'HEAD',
                    cache: 'no-cache',
                    signal: AbortSignal.timeout(3000)
                });

                const pingTime = Date.now() - startTime;
                this.lastPingTime = pingTime;
                this.isOnline = fallbackResponse.ok;
                this.connectionQuality = fallbackResponse.ok ? this.calculateQuality(pingTime) : 'poor';
            } catch (fallbackError) {
                this.isOnline = false;
                this.connectionQuality = 'offline';
                this.lastPingTime = null;
                logger.warn('Connection check failed:', fallbackError.message);
            }
        }

        this.updateUI();
        this.notifyCallbacks();
    }

    /**
     * Calculate connection quality based on ping time
     */
    calculateQuality(pingTime) {
        if (pingTime < 100) return 'excellent';
        if (pingTime < 300) return 'good';
        if (pingTime < 1000) return 'fair';
        return 'poor';
    }

    /**
     * Update the header pill with current status.
     */
    updateUI() {
        if (!this.elements) return;
        const { pill, dot, text, ping } = this.elements;

        const labelKey = this.isOnline ? 'connected' : 'offline';
        const label = translationManager.getTranslationSync(labelKey);

        dot.classList.toggle('offline', !this.isOnline);
        text.setAttribute('data-translate', labelKey);
        text.textContent = label;

        if (this.isOnline && this.lastPingTime != null) {
            ping.textContent = `${this.lastPingTime}ms`;
            ping.hidden = false;
        } else {
            ping.textContent = '';
            ping.hidden = true;
        }

        const qualityText = this.getQualityText();
        const connectionLabel = translationManager.getTranslationSync('connection');
        pill.title = `${connectionLabel}: ${qualityText}${this.lastPingTime != null ? ` (${this.lastPingTime}ms)` : ''}`;
    }

    /**
     * Get translated quality text for current connection quality
     */
    getQualityText() {
        const qualityMap = {
            'excellent': 'connection_excellent',
            'good': 'connection_good',
            'fair': 'connection_fair',
            'poor': 'connection_poor',
            'offline': 'offline'
        };
        const key = qualityMap[this.connectionQuality];
        return key ? translationManager.getTranslationSync(key) : translationManager.getTranslationSync('offline');
    }

    /**
     * Register callback for connection status changes
     */
    onStatusChange(callback) {
        this.callbacks.add(callback);

        // Return unsubscribe function
        return () => {
            this.callbacks.delete(callback);
        };
    }

    /**
     * Notify all registered callbacks
     */
    notifyCallbacks() {
        const status = {
            isOnline: this.isOnline,
            quality: this.connectionQuality,
            ping: this.lastPingTime
        };

        this.callbacks.forEach(callback => {
            try {
                callback(status);
            } catch (error) {
                logger.error('Connection status callback error:', error);
            }
        });
    }

    /**
     * Set socket instance for enhanced monitoring
     */
    setSocket(socket) {
        this.socket = socket;

        if (socket) {
            socket.on('connect', () => {
                this.handleNetworkChange(true);
            });

            socket.on('disconnect', () => {
                this.handleNetworkChange(false);
            });

            socket.on('reconnect', () => {
                this.checkConnection();
            });
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isOnline: this.isOnline,
            quality: this.connectionQuality,
            ping: this.lastPingTime
        };
    }

    /**
     * Refresh the display with current translations (called when language changes)
     */
    refreshTranslations() {
        this.updateUI();
    }
}

// Create singleton instance
export const connectionStatus = new ConnectionStatus();

// Make globally available for translation updates
window.connectionStatus = connectionStatus;