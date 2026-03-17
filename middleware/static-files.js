/**
 * Static Files Middleware
 * Handles static file serving with mobile-optimized caching and proper MIME types
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const NO_STORE_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, private';

function applyNoStoreHeaders(res) {
    res.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
}

function isSecureRequest(req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const normalizedProto = Array.isArray(forwardedProto)
        ? forwardedProto[0]
        : (forwardedProto || '').split(',')[0].trim();

    return Boolean(req.secure || req.socket?.encrypted || normalizedProto === 'https');
}

/**
 * Detect if request is from a mobile device
 * @param {string} userAgent - User agent string
 * @returns {boolean} - True if mobile device
 */
function isMobileDevice(userAgent) {
    return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent || '');
}

/**
 * Get asset max age based on environment and device
 * @param {boolean} isProduction - Whether running in production
 * @param {boolean} isMobile - Whether request is from mobile device
 * @returns {number} - Max age in seconds
 */
function getAssetMaxAge(isProduction, isMobile) {
    // Short max-age: the service worker handles caching via its own Cache Storage.
    // Long HTTP cache max-age causes stale files when SW transitions happen.
    return 0;
}

/**
 * Create static files middleware configuration
 * @param {boolean} isProduction - Whether running in production mode
 * @returns {object} Express static middleware options
 */
function createStaticFilesConfig(isProduction) {
    return {
        index: false,         // Disable automatic index.html serving
        // Short max-age: SW handles caching, HTTP cache just needs ETags for revalidation
        maxAge: 0,
        etag: true,           // Enable ETags for efficient cache validation
        lastModified: true,   // Include Last-Modified headers
        cacheControl: true,   // Enable Cache-Control headers

        // Mobile-optimized headers with proper MIME types for ES6 modules
        setHeaders: (res, filePath, stat) => {
            const userAgent = res.req.headers['user-agent'] || '';
            const isMobile = isMobileDevice(userAgent);
            const maxAge = getAssetMaxAge(isProduction, isMobile);
            const secureRequest = isSecureRequest(res.req);
            const serveNoStoreAsset = !secureRequest;

            // Critical fix: Proper MIME types for JavaScript modules
            if (filePath.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
                res.setHeader('Vary', 'Accept-Encoding, User-Agent');

                if (serveNoStoreAsset) {
                    applyNoStoreHeaders(res);
                } else {
                    res.setHeader('Cache-Control', `public, max-age=${maxAge}, must-revalidate`);
                }
            }

            // CSS files
            if (filePath.endsWith('.css')) {
                res.setHeader('Content-Type', 'text/css; charset=utf-8');
                res.setHeader('Vary', 'Accept-Encoding, User-Agent');

                if (serveNoStoreAsset) {
                    applyNoStoreHeaders(res);
                } else {
                    res.setHeader('Cache-Control', `public, max-age=${maxAge}, must-revalidate`);
                }
            }

            // HTML files
            if (filePath.endsWith('.html')) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                applyNoStoreHeaders(res);
            }

            // JSON files
            if (filePath.endsWith('.json')) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');

                if (serveNoStoreAsset) {
                    applyNoStoreHeaders(res);
                }
            }

            // Only cache images aggressively on secure deployments. On plain HTTP LAN
            // requests we disable storage so phones always fetch the current build.
            if (filePath.match(/\.(jpg|jpeg|png|gif|webp|svg|woff2?|ttf|mp3|wav|ico|mp4)$/i)) {
                if (serveNoStoreAsset) {
                    applyNoStoreHeaders(res);
                } else {
                    const imageMaxAge = isMobile ? 7200 : 3600; // 2 hours mobile, 1 hour desktop
                    res.setHeader('Cache-Control', `public, max-age=${imageMaxAge}`);
                }
            }

            // Special handling for index.html - NO cache, always revalidate for new deployments
            if (filePath.endsWith('index.html')) {
                applyNoStoreHeaders(res);
                res.setHeader('Vary', 'Accept-Encoding, User-Agent');
            }

            // CRITICAL: Service worker must always be revalidated to detect updates
            if (filePath.endsWith('sw.js')) {
                applyNoStoreHeaders(res);
                res.setHeader('Vary', 'Accept-Encoding');
            }

            // Enable compression for text-based files
            if (filePath.match(/\.(js|css|html|json|svg|txt)$/i)) {
                res.setHeader('Vary', 'Accept-Encoding, User-Agent');
            }

            // Mobile-specific optimizations
            if (isMobile) {
                res.setHeader('X-Mobile-Optimized', 'true');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('Keep-Alive', 'timeout=30, max=100');
            }
        }
    };
}

/**
 * Create error handling middleware for static files
 * @param {object} logger - Logger instance
 * @returns {Function} Express error middleware
 */
function createStaticErrorHandler(logger) {
    return (err, req, res, next) => {
        if (err) {
            logger.error('Static file serving error:', err);
            logger.error('Request path:', req.path);
            logger.error('Request method:', req.method);
        }
        next(err);
    };
}

/**
 * Create JavaScript file handler for explicit JS serving
 * @param {object} logger - Logger instance
 * @param {boolean} isProduction - Whether running in production
 * @param {string} baseDir - Base directory for public files
 * @returns {Function} Express route handler
 */
function createJsFileHandler(logger, isProduction, baseDir) {
    return (req, res, next) => {
        try {
            const filePath = path.join(baseDir, 'public', req.path);
            logger.info(`JS request: ${req.path} -> ${filePath}`);

            // Check if file exists before attempting to serve
            if (!fs.existsSync(filePath)) {
                logger.error(`JavaScript file not found: ${req.path} (${filePath})`);
                return res.status(404).json({
                    error: 'File not found',
                    path: req.path,
                    fullPath: filePath,
                    exists: false
                });
            }

            // Log file info
            const stats = fs.statSync(filePath);
            logger.info(`JS file found: ${req.path}, size: ${stats.size} bytes`);

            // Set proper headers for JavaScript files
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
            applyNoStoreHeaders(res);

            // Read and send file directly to avoid express.static issues
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    logger.error(`Error reading JS file ${req.path}:`, err);
                    return res.status(500).json({ error: 'Failed to read file', details: err.message });
                }
                res.send(data);
            });

        } catch (error) {
            logger.error(`JS file handler error for ${req.path}:`, error);
            res.status(500).json({ error: 'Server error', details: error.message });
        }
    };
}

/**
 * Create debug static middleware config
 * @returns {object} Express static middleware options for debug files
 */
function createDebugStaticConfig() {
    return {
        maxAge: 0,
        etag: false,
        cacheControl: false
    };
}

module.exports = {
    createStaticFilesConfig,
    createStaticErrorHandler,
    createJsFileHandler,
    createDebugStaticConfig,
    isMobileDevice,
    getAssetMaxAge,
    isSecureRequest,
    NO_STORE_CACHE_CONTROL
};
