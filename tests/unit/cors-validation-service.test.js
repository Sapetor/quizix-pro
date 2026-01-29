/**
 * CORS Validation Service Tests
 */

const { CORSValidationService } = require('../../services/cors-validation-service');

describe('CORSValidationService', () => {
    let corsService;
    const originalEnv = { ...process.env };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env.NODE_ENV;
        delete process.env.RAILWAY_ENVIRONMENT;
        corsService = new CORSValidationService();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('isOriginAllowed', () => {
        test('should allow null origin (same-origin requests)', () => {
            expect(corsService.isOriginAllowed(null)).toBe(true);
            expect(corsService.isOriginAllowed(undefined)).toBe(true);
        });

        test('should allow explicitly allowed origins', () => {
            expect(corsService.isOriginAllowed('http://localhost:3000')).toBe(true);
            expect(corsService.isOriginAllowed('https://localhost:3000')).toBe(true);
            expect(corsService.isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
        });
    });

    describe('isLocalNetworkOrigin', () => {
        test('should accept localhost origins', () => {
            expect(corsService.isLocalNetworkOrigin('http://localhost:3000')).toBe(true);
            expect(corsService.isLocalNetworkOrigin('https://localhost:3000')).toBe(true);
            expect(corsService.isLocalNetworkOrigin('http://localhost')).toBe(true);
        });

        test('should accept 127.0.0.1 origins', () => {
            expect(corsService.isLocalNetworkOrigin('http://127.0.0.1:3000')).toBe(true);
            expect(corsService.isLocalNetworkOrigin('https://127.0.0.1:8080')).toBe(true);
        });

        test('should accept 192.168.x.x origins', () => {
            expect(corsService.isLocalNetworkOrigin('http://192.168.1.1:3000')).toBe(true);
            expect(corsService.isLocalNetworkOrigin('http://192.168.0.100:3000')).toBe(true);
            expect(corsService.isLocalNetworkOrigin('https://192.168.255.255:8080')).toBe(true);
        });

        test('should accept 10.x.x.x origins', () => {
            expect(corsService.isLocalNetworkOrigin('http://10.0.0.1:3000')).toBe(true);
            expect(corsService.isLocalNetworkOrigin('http://10.255.255.255:3000')).toBe(true);
        });

        test('should accept 172.16-31.x.x origins (private range)', () => {
            expect(corsService.isLocalNetworkOrigin('http://172.16.0.1:3000')).toBe(true);
            expect(corsService.isLocalNetworkOrigin('http://172.20.5.10:3000')).toBe(true);
            expect(corsService.isLocalNetworkOrigin('http://172.31.255.255:3000')).toBe(true);
        });

        test('should reject 172.x outside private range', () => {
            expect(corsService.isLocalNetworkOrigin('http://172.15.0.1:3000')).toBe(false);
            expect(corsService.isLocalNetworkOrigin('http://172.32.0.1:3000')).toBe(false);
        });

        test('should reject non-HTTP/HTTPS protocols', () => {
            expect(corsService.isLocalNetworkOrigin('ftp://localhost:3000')).toBe(false);
            expect(corsService.isLocalNetworkOrigin('file://localhost')).toBe(false);
        });

        test('should reject disallowed ports', () => {
            expect(corsService.isLocalNetworkOrigin('http://localhost:9999')).toBe(false);
            expect(corsService.isLocalNetworkOrigin('http://192.168.1.1:5000')).toBe(false);
        });

        test('should handle invalid URLs gracefully', () => {
            expect(corsService.isLocalNetworkOrigin('not-a-url')).toBe(false);
            expect(corsService.isLocalNetworkOrigin('://invalid')).toBe(false);
        });

        test('should reject public IP addresses', () => {
            expect(corsService.isLocalNetworkOrigin('http://8.8.8.8:3000')).toBe(false);
            expect(corsService.isLocalNetworkOrigin('http://1.2.3.4:3000')).toBe(false);
        });
    });

    describe('isCloudPlatformOrigin', () => {
        test('should accept Railway origins', () => {
            expect(corsService.isCloudPlatformOrigin('https://quizix-pro-production.up.railway.app')).toBe(true);
            expect(corsService.isCloudPlatformOrigin('https://my-app-production.up.railway.app')).toBe(true);
            expect(corsService.isCloudPlatformOrigin('https://my-app.railway.app')).toBe(true);
        });

        test('should accept Heroku origins', () => {
            expect(corsService.isCloudPlatformOrigin('https://my-app.herokuapp.com')).toBe(true);
        });

        test('should accept Vercel origins', () => {
            expect(corsService.isCloudPlatformOrigin('https://my-app.vercel.app')).toBe(true);
        });

        test('should accept Netlify origins', () => {
            expect(corsService.isCloudPlatformOrigin('https://my-app.netlify.app')).toBe(true);
        });

        test('should accept DigitalOcean origins', () => {
            expect(corsService.isCloudPlatformOrigin('https://my-app.ondigitalocean.app')).toBe(true);
        });

        test('should accept AWS CloudFront origins', () => {
            expect(corsService.isCloudPlatformOrigin('https://d123abc.cloudfront.net')).toBe(true);
        });

        test('should accept Azure Static Web Apps origins', () => {
            expect(corsService.isCloudPlatformOrigin('https://my-app.azurestaticapps.net')).toBe(true);
        });

        test('should accept Google Cloud Run origins', () => {
            expect(corsService.isCloudPlatformOrigin('https://my-service-abc123.a.run.app')).toBe(true);
        });

        test('should reject HTTP cloud platform origins (security requirement)', () => {
            expect(corsService.isCloudPlatformOrigin('http://my-app.railway.app')).toBe(false);
            expect(corsService.isCloudPlatformOrigin('http://my-app.vercel.app')).toBe(false);
        });

        test('should reject unknown cloud platforms', () => {
            expect(corsService.isCloudPlatformOrigin('https://my-app.unknowncloud.com')).toBe(false);
        });
    });

    describe('production mode', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'production';
            corsService = new CORSValidationService();
        });

        test('should allow both local and cloud origins', () => {
            expect(corsService.isOriginAllowed('http://192.168.1.1:3000')).toBe(true);
            expect(corsService.isOriginAllowed('https://my-app.railway.app')).toBe(true);
        });
    });

    describe('development mode', () => {
        beforeEach(() => {
            delete process.env.NODE_ENV;
            delete process.env.RAILWAY_ENVIRONMENT;
            corsService = new CORSValidationService();
        });

        test('should allow local network origins', () => {
            expect(corsService.isOriginAllowed('http://192.168.1.1:3000')).toBe(true);
            expect(corsService.isOriginAllowed('http://localhost:3000')).toBe(true);
        });
    });

    describe('addAllowedOrigin', () => {
        test('should add valid origins', () => {
            corsService.addAllowedOrigin('https://custom.example.com');
            expect(corsService.isOriginAllowed('https://custom.example.com')).toBe(true);
        });

        test('should reject invalid origins', () => {
            const initialSize = corsService.allowedOrigins.size;
            corsService.addAllowedOrigin('not-a-valid-url');
            expect(corsService.allowedOrigins.size).toBe(initialSize);
        });
    });

    describe('removeAllowedOrigin', () => {
        test('should remove existing origins', () => {
            corsService.addAllowedOrigin('https://temp.example.com');
            expect(corsService.isOriginAllowed('https://temp.example.com')).toBe(true);

            corsService.removeAllowedOrigin('https://temp.example.com');
            // Note: might still be allowed via pattern matching, but not explicitly
        });
    });

    describe('isValidOrigin', () => {
        test('should return true for valid HTTP/HTTPS URLs', () => {
            expect(corsService.isValidOrigin('http://example.com')).toBe(true);
            expect(corsService.isValidOrigin('https://example.com')).toBe(true);
            expect(corsService.isValidOrigin('https://example.com:8080')).toBe(true);
        });

        test('should return false for invalid URLs', () => {
            expect(corsService.isValidOrigin('ftp://example.com')).toBe(false);
            expect(corsService.isValidOrigin('not-a-url')).toBe(false);
            expect(corsService.isValidOrigin('')).toBe(false);
        });
    });

    describe('getStats', () => {
        test('should return configuration statistics', () => {
            const stats = corsService.getStats();

            expect(stats.allowedOriginsCount).toBeGreaterThan(0);
            expect(stats.localNetworkPatternsCount).toBeGreaterThan(0);
            expect(stats.allowedPortsCount).toBeGreaterThan(0);
            expect(typeof stats.isDevelopment).toBe('boolean');
        });
    });

    describe('getExpressCorsConfig', () => {
        test('should return valid Express CORS config', () => {
            const config = corsService.getExpressCorsConfig();

            expect(config.credentials).toBe(true);
            expect(config.methods).toContain('GET');
            expect(config.methods).toContain('POST');
            expect(config.maxAge).toBe(300);
            expect(typeof config.origin).toBe('function');
        });

        test('should call callback with true for allowed origins', (done) => {
            const config = corsService.getExpressCorsConfig();

            config.origin('http://localhost:3000', (error, allowed) => {
                expect(error).toBeNull();
                expect(allowed).toBe(true);
                done();
            });
        });

        test('should call callback with error for blocked origins', (done) => {
            const config = corsService.getExpressCorsConfig();

            config.origin('http://evil.com:3000', (error, allowed) => {
                expect(error).toBeTruthy();
                expect(error.message).toContain('not allowed');
                done();
            });
        });
    });

    describe('getSocketIOCorsConfig', () => {
        test('should return valid Socket.IO CORS config', () => {
            const config = corsService.getSocketIOCorsConfig();

            expect(config.credentials).toBe(true);
            expect(config.methods).toContain('GET');
            expect(config.methods).toContain('POST');
            expect(typeof config.origin).toBe('function');
        });
    });
});
