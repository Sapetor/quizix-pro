/**
 * API Helper Module
 * Provides utilities for making API requests with proper URL handling
 */

import { logger } from '../core/config.js';

export class APIHelper {
    static getBaseUrl() {
        // Get base path from <base> tag for Kubernetes path-based routing
        const basePath = document.querySelector('base')?.getAttribute('href') || '/';
        return `${window.location.protocol}//${window.location.host}${basePath}`;
    }

    static getApiUrl(endpoint) {
        // Remove leading slash if present to avoid double slashes
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
        const baseUrl = this.getBaseUrl();
        // Remove trailing slash from base URL to avoid double slashes
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        return `${cleanBaseUrl}/${cleanEndpoint}`;
    }

    static async fetchAPI(endpoint, options = {}) {
        const url = this.getApiUrl(endpoint);
        const method = options.method || 'GET';
        logger.info(`🌐 API Request: ${method} ${url} (host: ${window.location.host})`);

        try {
            const response = await fetch(url, options);

            // Log response for debugging
            if (!response.ok) {
                logger.error(`❌ API Error: ${response.status} ${response.statusText} for ${url}`);
                logger.error('❌ Response headers:', Object.fromEntries(response.headers.entries()));
            } else {
                logger.info(`✅ API Success: ${response.status} for ${url}`);
            }

            return response;
        } catch (error) {
            logger.error(`❌ Network Error for ${url}:`, error);
            logger.error('❌ Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    static async fetchAPIJSON(endpoint, options = {}) {
        const response = await this.fetchAPI(endpoint, options);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }
}