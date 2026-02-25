/**
 * QR Service Tests
 */

const { QRService } = require('../../services/qr-service');
const os = require('os');

// Mock QRCode module
jest.mock('qrcode', () => ({
    toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,MOCKQRCODE')
}));

// Mock os module
jest.mock('os', () => ({
    networkInterfaces: jest.fn()
}));

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('QRService', () => {
    let qrService;

    beforeEach(() => {
        jest.clearAllMocks();
        qrService = new QRService(mockLogger, '/');
        // Reset caches
        qrService.qrCache.clear();
        qrService.cachedIP = null;
        qrService.ipCacheTime = null;
    });

    describe('constructor', () => {
        test('should set basePath correctly', () => {
            const service = new QRService(mockLogger, '/quizmaster/');
            expect(service.basePath).toBe('/quizmaster');
        });

        test('should handle root basePath', () => {
            const service = new QRService(mockLogger, '/');
            expect(service.basePath).toBe('');
        });
    });

    describe('_getLocalIP', () => {
        test('should use NETWORK_IP environment variable if set', () => {
            const originalEnv = process.env.NETWORK_IP;
            process.env.NETWORK_IP = '192.168.1.100';

            const ip = qrService._getLocalIP();

            expect(ip).toBe('192.168.1.100');
            process.env.NETWORK_IP = originalEnv;
        });

        test('should prefer 192.168.x.x addresses', () => {
            delete process.env.NETWORK_IP;
            os.networkInterfaces.mockReturnValue({
                eth0: [
                    { family: 'IPv4', address: '172.16.0.1', internal: false },
                    { family: 'IPv4', address: '192.168.1.50', internal: false }
                ]
            });

            const ip = qrService._getLocalIP();

            expect(ip).toBe('192.168.1.50');
        });

        test('should fallback to 10.x.x.x addresses', () => {
            delete process.env.NETWORK_IP;
            os.networkInterfaces.mockReturnValue({
                eth0: [
                    { family: 'IPv4', address: '10.0.0.5', internal: false }
                ]
            });

            const ip = qrService._getLocalIP();

            expect(ip).toBe('10.0.0.5');
        });

        test('should fallback to localhost if no external IP found', () => {
            delete process.env.NETWORK_IP;
            os.networkInterfaces.mockReturnValue({
                lo: [
                    { family: 'IPv4', address: '127.0.0.1', internal: true }
                ]
            });

            const ip = qrService._getLocalIP();

            expect(ip).toBe('localhost');
        });

        test('should cache IP for subsequent calls', () => {
            delete process.env.NETWORK_IP;
            os.networkInterfaces.mockReturnValue({
                eth0: [
                    { family: 'IPv4', address: '192.168.1.50', internal: false }
                ]
            });

            qrService._getLocalIP();
            qrService._getLocalIP();

            // networkInterfaces should only be called once due to caching
            expect(os.networkInterfaces).toHaveBeenCalledTimes(1);
        });
    });

    describe('_getGameUrl', () => {
        const mockReq = {
            get: jest.fn((header) => {
                if (header === 'host') return 'example.com';
                if (header === 'x-forwarded-proto') return 'https';
                return null;
            }),
            secure: false
        };

        test('should generate cloud URL in production', () => {
            const originalEnv = process.env.RAILWAY_ENVIRONMENT;
            process.env.RAILWAY_ENVIRONMENT = 'production';

            const url = qrService._getGameUrl('123456', mockReq);

            expect(url).toBe('https://example.com/?pin=123456');
            process.env.RAILWAY_ENVIRONMENT = originalEnv;
        });

        test('should generate local URL in development', () => {
            delete process.env.RAILWAY_ENVIRONMENT;
            delete process.env.NODE_ENV;
            delete process.env.VERCEL_ENV;
            delete process.env.HEROKU_APP_NAME;

            os.networkInterfaces.mockReturnValue({
                eth0: [{ family: 'IPv4', address: '192.168.1.50', internal: false }]
            });

            const url = qrService._getGameUrl('123456', mockReq);

            expect(url).toContain('192.168.1.50');
            expect(url).toContain('pin=123456');
        });

        test('should include basePath in URL', () => {
            const serviceWithBasePath = new QRService(mockLogger, '/quizmaster');
            delete process.env.RAILWAY_ENVIRONMENT;

            os.networkInterfaces.mockReturnValue({
                eth0: [{ family: 'IPv4', address: '192.168.1.50', internal: false }]
            });

            const url = serviceWithBasePath._getGameUrl('123456', mockReq);

            expect(url).toContain('/quizmaster/');
        });
    });

    describe('generateQRCode', () => {
        const mockGame = { pin: '123456' };
        const mockReq = {
            get: jest.fn((header) => {
                if (header === 'host') return 'localhost:3000';
                return null;
            }),
            secure: false
        };

        beforeEach(() => {
            delete process.env.RAILWAY_ENVIRONMENT;
            delete process.env.NODE_ENV;
            os.networkInterfaces.mockReturnValue({
                eth0: [{ family: 'IPv4', address: '192.168.1.50', internal: false }]
            });
        });

        test('should generate QR code for valid game', async () => {
            const result = await qrService.generateQRCode('123456', mockGame, mockReq);

            expect(result.qrCode).toContain('data:image/png');
            expect(result.pin).toBe('123456');
            expect(result.gameUrl).toContain('pin=123456');
        });

        test('should throw error if game not found', async () => {
            await expect(qrService.generateQRCode('123456', null, mockReq))
                .rejects.toThrow('Game not found');
        });

        test('should cache QR codes', async () => {
            const QRCode = require('qrcode');

            await qrService.generateQRCode('123456', mockGame, mockReq);
            await qrService.generateQRCode('123456', mockGame, mockReq);

            // QRCode.toDataURL should only be called once due to caching
            expect(QRCode.toDataURL).toHaveBeenCalledTimes(1);
        });

        test('should serve from cache on second request', async () => {
            const result1 = await qrService.generateQRCode('123456', mockGame, mockReq);
            const result2 = await qrService.generateQRCode('123456', mockGame, mockReq);

            expect(result1).toEqual(result2);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('served from cache')
            );
        });
    });

    describe('getCacheHeaders', () => {
        test('should return proper cache headers', () => {
            const headers = qrService.getCacheHeaders('123456', 1704067200000);

            expect(headers['Cache-Control']).toBe('public, max-age=300');
            expect(headers['ETag']).toBe('"qr-123456-1704067200000"');
            expect(headers['Vary']).toBe('User-Agent');
        });
    });

    describe('cache cleanup', () => {
        test('should clean up old cache entries when limit exceeded', async () => {
            const mockGame = { pin: '123456' };
            const mockReq = {
                get: jest.fn(() => 'localhost:3000'),
                secure: false
            };

            os.networkInterfaces.mockReturnValue({
                eth0: [{ family: 'IPv4', address: '192.168.1.50', internal: false }]
            });

            // Add many cache entries
            for (let i = 0; i < 55; i++) {
                qrService.qrCache.set(`qr_${i}_local`, {
                    data: { qrCode: 'test' },
                    timestamp: Date.now() - (15 * 60 * 1000) // 15 minutes ago (expired)
                });
            }

            // Trigger cache cleanup by generating new QR code
            await qrService.generateQRCode('123456', mockGame, mockReq);

            // Old entries should be cleaned up
            expect(qrService.qrCache.size).toBeLessThan(55);
        });
    });
});
