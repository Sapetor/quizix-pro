/**
 * Image Path Resolver
 *
 * Centralized utility for handling image paths in Kubernetes deployments
 * with path-based routing (e.g., /quizmaster/ base path).
 *
 * Key Concepts:
 * - Storage Path: Portable path saved in quiz JSON (/uploads/file.gif)
 * - Display Path: Environment-specific path for browser (/quizmaster/uploads/file.gif)
 * - Base Path: Kubernetes path prefix from <base> tag (/quizmaster/)
 *
 * Usage:
 *   import { imagePathResolver } from './utils/image-path-resolver.js';
 *
 *   // When uploading
 *   const storagePath = imagePathResolver.toStoragePath(serverUrl);
 *   imageElement.dataset.url = storagePath;
 *
 *   // When displaying
 *   const displayPath = imagePathResolver.toDisplayPath(storagePath);
 *   imageElement.src = displayPath;
 */

import { logger } from '../core/config.js';

export class ImagePathResolver {
    constructor() {
        this._basePath = null;
    }

    /**
     * Get the base path from <base> tag (cached for performance)
     * @returns {string} Clean base path without trailing slash (e.g., "/quizmaster" or "")
     */
    getBasePath() {
        if (this._basePath === null) {
            const baseElement = document.querySelector('base');
            const baseHref = baseElement?.getAttribute('href') || '/';
            // Remove trailing slash for consistency
            this._basePath = baseHref === '/' ? '' : baseHref.replace(/\/$/, '');
            logger.debug(`ImagePathResolver: Base path initialized as "${this._basePath}"`);
        }
        return this._basePath;
    }

    /**
     * Convert any image path format to portable storage format
     * Strips base path and normalizes to /uploads/filename.gif
     *
     * @param {string} imagePath - Image path in any format
     * @returns {string} Portable storage path (e.g., "/uploads/file.gif")
     *
     * @example
     * toStoragePath('/quizmaster/uploads/file.gif') → '/uploads/file.gif'
     * toStoragePath('/uploads/file.gif')            → '/uploads/file.gif'
     * toStoragePath('uploads/file.gif')             → '/uploads/file.gif'
     * toStoragePath('file.gif')                     → '/uploads/file.gif'
     */
    toStoragePath(imagePath) {
        if (!imagePath || imagePath.trim() === '') {
            return '';
        }

        // Data URIs stay as-is
        if (imagePath.startsWith('data:')) {
            return imagePath;
        }

        // Full URLs - not supported in storage, this is an error case
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
            logger.warn('ImagePathResolver: Full URLs should not be stored', imagePath);
            // Try to extract path from URL
            try {
                const url = new URL(imagePath);
                imagePath = url.pathname;
            } catch (_e) {
                logger.error('ImagePathResolver: Invalid URL', imagePath);
                return '';
            }
        }

        const basePath = this.getBasePath();
        let cleanPath = imagePath;

        // Strip base path if present
        if (basePath && cleanPath.startsWith(basePath)) {
            cleanPath = cleanPath.substring(basePath.length);
            logger.debug(`ImagePathResolver: Stripped base path: ${imagePath} → ${cleanPath}`);
        }

        // Normalize to /uploads/filename.gif format
        if (!cleanPath.startsWith('/uploads/')) {
            if (cleanPath.startsWith('uploads/')) {
                cleanPath = '/' + cleanPath;
            } else if (cleanPath.startsWith('/')) {
                // Path like /file.gif - assume it belongs in uploads/
                cleanPath = '/uploads' + cleanPath;
            } else {
                // Just filename - prepend /uploads/
                cleanPath = '/uploads/' + cleanPath;
            }
        }

        logger.debug(`ImagePathResolver: Storage path: ${imagePath} → ${cleanPath}`);
        return cleanPath;
    }

    /**
     * Convert storage path to display path for current environment
     * Prepends base path for Kubernetes routing
     *
     * @param {string} storagePath - Portable storage path (e.g., "/uploads/file.gif")
     * @returns {string} Display path for browser (e.g., "/quizmaster/uploads/file.gif")
     *
     * @example
     * toDisplayPath('/uploads/file.gif') → '/quizmaster/uploads/file.gif' (in K8s)
     * toDisplayPath('/uploads/file.gif') → '/uploads/file.gif' (local)
     */
    toDisplayPath(storagePath) {
        if (!storagePath || storagePath.trim() === '') {
            return '';
        }

        // Data URIs stay as-is
        if (storagePath.startsWith('data:')) {
            return storagePath;
        }

        // Full URLs stay as-is (shouldn't happen in storage, but handle gracefully)
        if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
            return storagePath;
        }

        // First normalize to storage format (in case it's not clean)
        const cleanStoragePath = this.toStoragePath(storagePath);

        // Then add base path for display
        const basePath = this.getBasePath();
        const displayPath = basePath ? basePath + cleanStoragePath : cleanStoragePath;

        logger.debug(`ImagePathResolver: Display path: ${storagePath} → ${displayPath}`);
        return displayPath;
    }

    /**
     * Convert storage path to full absolute URL
     * Useful for game display where we need origin + path
     *
     * @param {string} storagePath - Portable storage path
     * @returns {string} Full URL (e.g., "http://10.80.21.11/quizmaster/uploads/file.gif")
     */
    toAbsoluteUrl(storagePath) {
        const displayPath = this.toDisplayPath(storagePath);

        // Return empty string if no path (prevents base URL being returned)
        if (!displayPath || displayPath.trim() === '') {
            return '';
        }

        // Already absolute URL or data URI
        if (displayPath.startsWith('http://') ||
            displayPath.startsWith('https://') ||
            displayPath.startsWith('data:')) {
            return displayPath;
        }

        return `${window.location.origin}${displayPath}`;
    }

    /**
     * Validate if a path is a valid image path
     * @param {string} path - Path to validate
     * @returns {boolean} True if valid
     */
    isValidImagePath(path) {
        if (!path || typeof path !== 'string' || path.trim() === '') {
            return false;
        }

        // Check for obviously invalid paths
        if (path === 'undefined' || path === 'null' || path.endsWith('/')) {
            return false;
        }

        // Check for valid formats
        return path.startsWith('data:') ||
               path.startsWith('/uploads/') ||
               path.startsWith('http://') ||
               path.startsWith('https://') ||
               /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path);
    }
}

// Export singleton instance
export const imagePathResolver = new ImagePathResolver();
