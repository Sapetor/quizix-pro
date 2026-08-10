/**
 * Connection Status Manager
 * Provides real-time network connectivity monitoring for LAN environments
 */

import { logger } from '../core/config.js';
import { translationManager } from './translation-manager.js';
import { APIHelper } from './api-helper.js';

export class ConnectionStatus {
    /** Consecutive failed probes required before the badge shows Offline. */
    static FAILURE_THRESHOLD = 2;

    constructor() {
        this.isOnline = navigator.onLine;
        this.connectionQuality = 'unknown';
        this.lastPingTime = null;
        this.pingInterval = null;
        this.socket = null;
        this.callbacks = new Set();

        // A live socket.io connection is authoritative proof we are online: the
        // HTTP probe may fail or time out while the socket is happily carrying
        // answers. null = no socket attached (probe is the only signal).
        this.socketConnected = null;
        // Number of consecutive probe failures before the badge degrades. One
        // dropped/aborted probe is not evidence of an outage.
        this.consecutiveFailures = 0;

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
        // navigator's offline event is not authoritative while the socket is
        // demonstrably delivering events (common false positive on VPN/LAN).
        if (!isOnline && this.socketConnected === true) {
            logger.debug('Ignoring offline event: socket is still connected');
            return;
        }

        this.isOnline = isOnline;
        this.updateUI();
        this.notifyCallbacks();

        logger.info(`Network status changed: ${isOnline ? 'online' : 'offline'}`);
    }

    /**
     * Perform connection quality check
     */
    async checkConnection() {
        const pingUrl = APIHelper.getApiUrl('api/ping');
        const startTime = Date.now();

        try {
            // Ping the server with a lightweight request
            const response = await fetch(pingUrl, {
                method: 'GET',
                cache: 'no-cache',
                signal: this.createTimeoutSignal(5000) // 5 second timeout
            });

            // Drain the body. Without this the response stream stays open, so the
            // request is still "in flight" when the 5s timeout signal fires and
            // aborts it — logged by Chrome as `Fetch failed loading: GET /api/ping`
            // on every page load. The fetch promise has already resolved by then,
            // so nothing in the app notices; only the console does.
            await response.arrayBuffer();

            if (response.ok) {
                this.recordSuccess(this.measureNetworkTime(pingUrl, Date.now() - startTime));
            } else {
                this.recordFailure(`ping returned HTTP ${response.status}`);
            }
        } catch (_error) {
            // Fallback: try a simple connectivity check. It gets its own start
            // time — reusing startTime here charged the failed primary attempt
            // (up to its full 5s timeout) to the fallback's latency reading,
            // which is where the bogus 3000ms+ "latency" on a healthy LAN
            // came from.
            const fallbackStart = Date.now();
            try {
                const fallbackResponse = await fetch(window.location.origin, {
                    method: 'HEAD',
                    cache: 'no-cache',
                    signal: this.createTimeoutSignal(3000)
                });

                if (fallbackResponse.ok) {
                    this.recordSuccess(Date.now() - fallbackStart);
                } else {
                    this.recordFailure(`fallback returned HTTP ${fallbackResponse.status}`);
                }
            } catch (fallbackError) {
                this.recordFailure(fallbackError.message);
            }
        }

        this.updateUI();
        this.notifyCallbacks();
    }

    /**
     * Read the browser's own network timing for the probe request.
     *
     * Date.now() around `await fetch(...)` measures wall-clock time including
     * however long the main thread was blocked before the continuation could
     * run — during a question transition (MathJax typeset, leaderboard render)
     * that is seconds, none of it network. PerformanceResourceTiming.duration
     * is recorded by the network stack and is immune to that.
     *
     * @param {string} url - Probe URL (may be relative)
     * @param {number} wallTimeMs - Fallback measurement
     * @returns {number} Latency in ms
     */
    measureNetworkTime(url, wallTimeMs) {
        try {
            const absolute = new URL(url, window.location.href).href;
            const entries = performance.getEntriesByName(absolute, 'resource');
            const last = entries[entries.length - 1];
            if (last && last.duration > 0) {
                return Math.round(last.duration);
            }
        } catch (_error) {
            // Resource timing unavailable (buffer full, cross-origin, old browser)
        }
        return wallTimeMs;
    }

    /**
     * Record a successful probe.
     */
    recordSuccess(pingTime) {
        this.consecutiveFailures = 0;
        this.lastPingTime = pingTime;
        this.isOnline = true;
        this.connectionQuality = this.calculateQuality(pingTime);
    }

    /**
     * Record a failed probe. The badge only degrades when the socket is not
     * connected AND the failure repeats — a single aborted probe during a busy
     * render used to flip a working game to "Offline".
     */
    recordFailure(reason) {
        this.consecutiveFailures++;
        logger.warn(`Connection check failed (${this.consecutiveFailures}):`, reason);

        if (this.socketConnected === true) {
            // Socket is live; the probe result says nothing about connectivity.
            // Drop the stale latency reading rather than display a bad one.
            this.lastPingTime = null;
            this.isOnline = true;
            this.connectionQuality = 'unknown';
            return;
        }

        if (this.consecutiveFailures < ConnectionStatus.FAILURE_THRESHOLD) {
            return;
        }

        this.isOnline = false;
        this.connectionQuality = 'offline';
        this.lastPingTime = null;
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
            'offline': 'offline',
            'unknown': 'connected'
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
        if (!socket) return;

        this.socketConnected = socket.connected === true;

        socket.on('connect', () => {
            this.socketConnected = true;
            this.consecutiveFailures = 0;
            this.handleNetworkChange(true);
        });

        socket.on('disconnect', () => {
            this.socketConnected = false;
            this.lastPingTime = null;
            this.connectionQuality = 'offline';
            this.handleNetworkChange(false);
        });
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