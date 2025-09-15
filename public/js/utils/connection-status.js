/**
 * Connection Status Manager
 * Provides real-time network connectivity monitoring for LAN environments
 */

import { logger } from '../core/config.js';
import { translationManager } from './translation-manager.js';

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
     * Create and inject the connection status indicator into the header
     */
    initializeUI() {
        // Find the header controls area
        const headerControls = document.querySelector('.header-controls');
        if (!headerControls) {
            logger.warn('Header controls not found, cannot add connection status');
            return;
        }

        // Create the connection status element
        const statusElement = document.createElement('div');
        statusElement.id = 'connection-status';
        statusElement.className = 'connection-status';
        statusElement.innerHTML = `
            <div class="connection-indicator">
                <div class="connection-dot"></div>
                <span class="connection-text" data-translate="checking_connection">Checking...</span>
            </div>
            <div class="connection-details" style="display: none;">
                <div class="detail-item">
                    <span data-translate="status">Status</span>: <span id="status-value">-</span>
                </div>
                <div class="detail-item">
                    <span data-translate="ping">Ping</span>: <span id="ping-value">-</span>
                </div>
                <div class="detail-item">
                    <span data-translate="quality">Quality</span>: <span id="quality-value">-</span>
                </div>
            </div>
        `;

        // Insert before the language selector (last element typically)
        const languageSelector = headerControls.querySelector('.language-selector');
        if (languageSelector) {
            headerControls.insertBefore(statusElement, languageSelector);
        } else {
            headerControls.appendChild(statusElement);
        }

        // Add click handler for details toggle
        const indicator = statusElement.querySelector('.connection-indicator');
        const details = statusElement.querySelector('.connection-details');
        
        indicator.addEventListener('click', () => {
            const isVisible = details.style.display !== 'none';
            details.style.display = isVisible ? 'none' : 'block';
        });

        // Add hover tooltip
        indicator.title = 'Click to view connection details';

        logger.debug('Connection status UI initialized');
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
            const response = await fetch('/api/ping', {
                method: 'GET',
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000) // 5 second timeout
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
        } catch (error) {
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
     * Update the UI elements
     */
    updateUI() {
        const statusElement = document.getElementById('connection-status');
        if (!statusElement) return;

        const dot = statusElement.querySelector('.connection-dot');
        const text = statusElement.querySelector('.connection-text');
        const statusValue = document.getElementById('status-value');
        const pingValue = document.getElementById('ping-value');
        const qualityValue = document.getElementById('quality-value');

        // Update connection dot and text
        if (this.isOnline) {
            dot.className = `connection-dot ${this.connectionQuality}`;
            text.setAttribute('data-translate', 'connected');
            text.textContent = translationManager.getTranslationSync('connected');
        } else {
            dot.className = 'connection-dot offline';
            text.setAttribute('data-translate', 'offline');
            text.textContent = translationManager.getTranslationSync('offline');
        }

        // Update details
        if (statusValue) {
            statusValue.textContent = this.isOnline ? 
                translationManager.getTranslationSync('connected') : 
                translationManager.getTranslationSync('offline');
        }
        
        if (pingValue) {
            pingValue.textContent = this.lastPingTime ? `${this.lastPingTime}ms` : '-';
        }
        
        if (qualityValue) {
            const qualityText = this.connectionQuality === 'excellent' ? translationManager.getTranslationSync('connection_excellent') :
                              this.connectionQuality === 'good' ? translationManager.getTranslationSync('connection_good') :
                              this.connectionQuality === 'fair' ? translationManager.getTranslationSync('connection_fair') :
                              this.connectionQuality === 'poor' ? translationManager.getTranslationSync('connection_poor') : 
                              this.connectionQuality === 'offline' ? translationManager.getTranslationSync('offline') : '-';
            qualityValue.textContent = qualityText;
        }

        // Update tooltip
        const indicator = statusElement.querySelector('.connection-indicator');
        if (indicator) {
            const qualityText = this.connectionQuality === 'excellent' ? translationManager.getTranslationSync('connection_excellent') :
                              this.connectionQuality === 'good' ? translationManager.getTranslationSync('connection_good') :
                              this.connectionQuality === 'fair' ? translationManager.getTranslationSync('connection_fair') :
                              this.connectionQuality === 'poor' ? translationManager.getTranslationSync('connection_poor') : 
                              translationManager.getTranslationSync('offline');
            
            const connectionLabel = translationManager.getTranslationSync('connection');
            indicator.title = `${connectionLabel}: ${qualityText}${this.lastPingTime ? ` (${this.lastPingTime}ms)` : ''}`;
        }
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

export default connectionStatus;