/**
 * CORS Validation Service
 * Provides robust CORS validation for local network environments
 */

const logger = console; // Will be replaced with proper logger when available

class CORSValidationService {
    constructor() {
        // Allowed origins for production
        this.allowedOrigins = new Set([
            'http://localhost:3000',
            'https://localhost:3000',
            'http://127.0.0.1:3000',
            'https://127.0.0.1:3000'
        ]);

        // Track logged origins to prevent spam
        this.loggedOrigins = new Set();

        // IP range patterns for local networks (properly constrained)
        this.localNetworkPatterns = [
            /^http:\/\/localhost(:\d+)?$/,
            /^https:\/\/localhost(:\d+)?$/,
            /^http:\/\/127\.0\.0\.1(:\d+)?$/,
            /^https:\/\/127\.0\.0\.1(:\d+)?$/,
            /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
            /^https:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
            /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
            /^https:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
            // Properly constrained 172.16.0.0/12 range
            /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/,
            /^https:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/
        ];

        // Cloud platform patterns for production deployment
        this.cloudPlatformPatterns = [
            // Railway - specific pattern for your app
            /^https:\/\/quizix-pro-production\.up\.railway\.app$/,
            // Railway - general patterns
            /^https:\/\/[a-zA-Z0-9-]+-production\.up\.railway\.app$/,
            /^https:\/\/[a-zA-Z0-9-]+\.railway\.app$/,
            // Heroku
            /^https:\/\/[a-zA-Z0-9-]+\.herokuapp\.com$/,
            // Vercel
            /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/,
            // Netlify
            /^https:\/\/[a-zA-Z0-9-]+\.netlify\.app$/,
            // DigitalOcean App Platform
            /^https:\/\/[a-zA-Z0-9-]+\.ondigitalocean\.app$/,
            // AWS CloudFront/S3
            /^https:\/\/[a-zA-Z0-9-]+\.cloudfront\.net$/,
            // Azure Static Web Apps
            /^https:\/\/[a-zA-Z0-9-]+\.azurestaticapps\.net$/,
            // Google Cloud Run
            /^https:\/\/[a-zA-Z0-9-]+-[a-zA-Z0-9-]+\.a\.run\.app$/,
            // Custom domains (be careful with this pattern)
            /^https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/
        ];

        // Fix environment detection - prioritize production detection
        this.isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';
        this.isDevelopment = !this.isProduction; // Development is simply NOT production
        this.allowedPorts = new Set(['3000', '3001', '8080', '8000']);
    }

    /**
     * Validate if origin is allowed
     * @param {string} origin - The origin to validate
     * @returns {boolean} - Whether the origin is allowed
     */
    isOriginAllowed(origin) {
        // Allow requests with no origin (same-origin, mobile apps, etc.)
        if (!origin) {
            return true;
        }

        // Check against explicitly allowed origins
        if (this.allowedOrigins.has(origin)) {
            return true;
        }

        // Production mode: allow both local networks AND cloud platforms
        if (this.isProduction) {
            const localCheck = this.isLocalNetworkOrigin(origin);
            const cloudCheck = this.isCloudPlatformOrigin(origin);
            return localCheck || cloudCheck;
        }

        // Development mode: be more permissive with local networks only
        if (this.isDevelopment) {
            return this.isLocalNetworkOrigin(origin);
        }

        // Default fallback: only local networks
        return this.isLocalNetworkOrigin(origin);
    }

    /**
     * Check if origin is from local network
     * @param {string} origin - The origin to check
     * @returns {boolean} - Whether origin is from local network
     */
    isLocalNetworkOrigin(origin) {
        try {
            const url = new URL(origin);
            
            // Validate protocol
            if (!['http:', 'https:'].includes(url.protocol)) {
                return false;
            }

            // Check against local network patterns
            for (const pattern of this.localNetworkPatterns) {
                if (pattern.test(origin)) {
                    // Additional port validation
                    if (url.port && !this.allowedPorts.has(url.port)) {
                        logger.warn(`CORS: Port ${url.port} not in allowed ports for origin: ${origin}`);
                        return false;
                    }
                    return true;
                }
            }

            return false;
        } catch (error) {
            logger.error('CORS: Invalid origin URL:', origin, error.message);
            return false;
        }
    }

    /**
     * Check if origin is from a trusted cloud platform
     * @param {string} origin - The origin to check
     * @returns {boolean} - Whether origin is from a trusted cloud platform
     */
    isCloudPlatformOrigin(origin) {
        try {
            const url = new URL(origin);
            
            // Must be HTTPS for cloud platforms (security requirement)
            if (url.protocol !== 'https:') {
                return false;
            }

            // Check against cloud platform patterns
            for (const pattern of this.cloudPlatformPatterns) {
                if (pattern.test(origin)) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            logger.error('CORS: Invalid cloud platform origin URL:', origin, error.message);
            return false;
        }
    }

    /**
     * Get CORS configuration for Express
     */
    getExpressCorsConfig() {
        return {
            origin: (origin, callback) => {
                if (this.isOriginAllowed(origin)) {
                    // Only log the first time we see a new origin
                    const originKey = origin || 'same-origin';
                    if (!this.loggedOrigins.has(originKey)) {
                        this.loggedOrigins.add(originKey);
                        logger.info(`CORS: New allowed origin: ${originKey}`);
                    }
                    callback(null, true);
                } else {
                    logger.warn(`CORS: Blocked origin: ${origin}`);
                    callback(new Error(`CORS: Origin ${origin} not allowed`));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            exposedHeaders: ['X-Total-Count'],
            maxAge: 300 // 5 minutes
        };
    }

    /**
     * Get CORS configuration for Socket.IO
     */
    getSocketIOCorsConfig() {
        return {
            origin: (origin, callback) => {
                if (this.isOriginAllowed(origin)) {
                    // Only log the first time we see a new origin for Socket.IO
                    const originKey = `socketio:${origin || 'same-origin'}`;
                    if (!this.loggedOrigins.has(originKey)) {
                        this.loggedOrigins.add(originKey);
                        logger.info(`Socket.IO CORS: New allowed origin: ${origin || 'same-origin'}`);
                    }
                    callback(null, true);
                } else {
                    logger.warn(`Socket.IO CORS: Blocked origin: ${origin}`);
                    callback(new Error(`Socket.IO CORS: Origin ${origin} not allowed`));
                }
            },
            credentials: true,
            methods: ['GET', 'POST']
        };
    }

    /**
     * Add a custom allowed origin
     * @param {string} origin - Origin to allow
     */
    addAllowedOrigin(origin) {
        if (this.isValidOrigin(origin)) {
            this.allowedOrigins.add(origin);
            logger.info(`CORS: Added allowed origin: ${origin}`);
        } else {
            logger.error(`CORS: Invalid origin format: ${origin}`);
        }
    }

    /**
     * Remove an allowed origin
     * @param {string} origin - Origin to remove
     */
    removeAllowedOrigin(origin) {
        if (this.allowedOrigins.delete(origin)) {
            logger.info(`CORS: Removed allowed origin: ${origin}`);
        }
    }

    /**
     * Validate origin format
     * @param {string} origin - Origin to validate
     * @returns {boolean} - Whether origin format is valid
     */
    isValidOrigin(origin) {
        try {
            const url = new URL(origin);
            return ['http:', 'https:'].includes(url.protocol);
        } catch {
            return false;
        }
    }

    /**
     * Get validation statistics
     */
    getStats() {
        return {
            allowedOriginsCount: this.allowedOrigins.size,
            localNetworkPatternsCount: this.localNetworkPatterns.length,
            allowedPortsCount: this.allowedPorts.size,
            isDevelopment: this.isDevelopment
        };
    }

    /**
     * Log current configuration
     */
    logConfiguration() {
        logger.info('CORS Configuration:', {
            environment: this.isDevelopment ? 'development' : 'production',
            isProduction: this.isProduction,
            allowedOrigins: Array.from(this.allowedOrigins),
            allowedPorts: Array.from(this.allowedPorts),
            localNetworkPatterns: this.localNetworkPatterns.length,
            cloudPlatformPatterns: this.cloudPlatformPatterns.length,
            supportsCloudPlatforms: this.isProduction
        });
    }
}

module.exports = { CORSValidationService };