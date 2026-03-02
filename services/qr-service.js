/**
 * QR Code Service
 * Handles QR code generation with simple caching
 * Simplified from server.js - removed performance tracking overhead
 */

const QRCode = require('qrcode');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

class QRService {
    constructor(logger, basePath = '/') {
        this.logger = logger;
        this.basePath = basePath === '/' ? '' : basePath.replace(/\/$/, '');

        // Simple cache for QR codes (10 minutes)
        this.qrCache = new Map();
        this.cacheDuration = 10 * 60 * 1000;

        // IP detection cache (5 minutes)
        this.cachedIP = null;
        this.ipCacheTime = null;
        this.ipCacheDuration = 5 * 60 * 1000;

        // Detect WSL once at startup
        this._isWSL = this._detectWSL();
    }

    _detectWSL() {
        try {
            const procVersion = fs.readFileSync('/proc/version', 'utf8');
            return procVersion.toLowerCase().includes('microsoft');
        } catch {
            return false;
        }
    }

    /**
     * Get the Windows host's LAN IP from within WSL2.
     * Parses `ipconfig` output, skipping vEthernet (WSL virtual) adapters.
     */
    _getWindowsLanIP() {
        try {
            const output = execSync('cmd.exe /c ipconfig', { timeout: 5000, encoding: 'utf8' });
            const lines = output.split('\n');
            for (let i = 0; i < lines.length; i++) {
                // Skip vEthernet (WSL) adapter sections
                if (lines[i].match(/vEthernet/i)) {
                    while (i < lines.length && !lines[i + 1]?.match(/^\S/)) i++;
                    continue;
                }
                const ipMatch = lines[i].match(/IPv4.*?:\s*(\d+\.\d+\.\d+\.\d+)/);
                if (ipMatch && !ipMatch[1].startsWith('127.')) {
                    this.logger.debug('WSL: Detected Windows LAN IP via ipconfig:', ipMatch[1]);
                    return ipMatch[1];
                }
            }
        } catch (err) {
            this.logger.debug('WSL: ipconfig IP detection failed:', err.message);
        }

        return null;
    }

    /**
     * Get local network IP with caching
     */
    _getLocalIP() {
        const now = Date.now();

        // Return cached IP if still valid
        if (this.cachedIP && this.ipCacheTime && (now - this.ipCacheTime < this.ipCacheDuration)) {
            return this.cachedIP;
        }

        // Detect IP
        let localIP = 'localhost';
        const NETWORK_IP = process.env.NETWORK_IP;

        if (NETWORK_IP) {
            localIP = NETWORK_IP;
            this.logger.debug('Using manual IP from environment:', localIP);
        } else if (this._isWSL) {
            // WSL2: os.networkInterfaces() only sees the virtual adapter (172.x.x.x).
            // Ask Windows for the actual LAN IP so phones can connect.
            const winIP = this._getWindowsLanIP();
            if (winIP) {
                localIP = winIP;
            } else {
                this.logger.warn('WSL: Could not detect Windows LAN IP. Set NETWORK_IP env var manually.');
                // Fall through to standard detection as last resort
                localIP = this._detectFromInterfaces();
            }
        } else {
            localIP = this._detectFromInterfaces();
        }

        // Update cache
        this.cachedIP = localIP;
        this.ipCacheTime = now;

        return localIP;
    }

    _detectFromInterfaces() {
        const networkInterfaces = os.networkInterfaces();
        const interfaces = Object.values(networkInterfaces).flat();

        // Prefer 192.168.x.x (typical home network) over 172.x.x.x (WSL internal)
        const ip = interfaces.find(iface =>
            iface.family === 'IPv4' &&
            !iface.internal &&
            iface.address.startsWith('192.168.')
        )?.address ||
        interfaces.find(iface =>
            iface.family === 'IPv4' &&
            !iface.internal &&
            iface.address.startsWith('10.')
        )?.address ||
        interfaces.find(iface =>
            iface.family === 'IPv4' &&
            !iface.internal
        )?.address || 'localhost';

        this.logger.debug('Detected network IP:', ip);
        return ip;
    }

    /**
     * Generate environment-aware game URL
     */
    _getGameUrl(pin, req) {
        const isCloudDeployment = process.env.RAILWAY_ENVIRONMENT === 'production' ||
                                  process.env.VERCEL_ENV ||
                                  process.env.HEROKU_APP_NAME;

        if (isCloudDeployment) {
            // Cloud deployment: use request host
            const host = req.get('host');
            const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
            const gameUrl = `${protocol}://${host}${this.basePath}/?pin=${pin}`;

            this.logger.info(`QR Code: Cloud deployment URL: ${gameUrl}`);
            return gameUrl;
        } else {
            // Local deployment: use detected IP
            const localIP = this._getLocalIP();
            const port = process.env.PORT || 3000;
            const portSuffix = this.basePath ? '' : `:${port}`;
            const gameUrl = `http://${localIP}${portSuffix}${this.basePath}/?pin=${pin}`;

            this.logger.debug(`QR Code: Local network URL: ${gameUrl}`);
            return gameUrl;
        }
    }

    /**
     * Generate QR code with caching
     */
    async generateQRCode(pin, game, req) {
        if (!game) {
            throw new Error('Game not found');
        }

        // Check cache
        const envType = (process.env.RAILWAY_ENVIRONMENT === 'production' ||
                        process.env.NODE_ENV === 'production') ? 'cloud' : 'local';
        const cacheKey = `qr_${pin}_${envType}`;
        const cached = this.qrCache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp < this.cacheDuration)) {
            this.logger.debug(`QR code served from cache for PIN ${pin}`);
            return cached.data;
        }

        // Generate new QR code
        const gameUrl = this._getGameUrl(pin, req);

        const qrCodeDataUrl = await QRCode.toDataURL(gameUrl, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            quality: 0.92,
            type: 'image/png'
        });

        const responseData = {
            qrCode: qrCodeDataUrl,
            gameUrl: gameUrl,
            pin: pin
        };

        // Cache the result
        this.qrCache.set(cacheKey, {
            data: responseData,
            timestamp: now
        });

        // Clean old cache entries
        if (this.qrCache.size > 50) {
            const cutoffTime = now - this.cacheDuration;
            for (const [key, value] of this.qrCache.entries()) {
                if (value.timestamp < cutoffTime) {
                    this.qrCache.delete(key);
                }
            }
        }

        this.logger.debug(`QR code generated for PIN ${pin}`);

        return responseData;
    }

    /**
     * Get cache headers for response
     */
    getCacheHeaders(pin, timestamp = Date.now()) {
        return {
            'Cache-Control': 'public, max-age=300',
            'ETag': `"qr-${pin}-${timestamp}"`,
            'Vary': 'User-Agent'
        };
    }
}

module.exports = { QRService };
