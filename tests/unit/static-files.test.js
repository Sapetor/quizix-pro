const {
    createStaticFilesConfig,
    NO_STORE_CACHE_CONTROL
} = require('../../middleware/static-files');

function createMockResponse(reqOverrides = {}) {
    const headers = {};

    return {
        headers,
        req: {
            headers: {},
            secure: false,
            socket: {},
            ...reqOverrides
        },
        setHeader: jest.fn((name, value) => {
            headers[name] = value;
        })
    };
}

describe('Static file cache policy', () => {
    const config = createStaticFilesConfig(true);

    test('serves JavaScript with no-store headers on insecure LAN requests', () => {
        const res = createMockResponse({
            headers: {
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
            }
        });

        config.setHeaders(res, '/app/public/js/main.js');

        expect(res.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
        expect(res.headers['Cache-Control']).toBe(NO_STORE_CACHE_CONTROL);
        expect(res.headers.Pragma).toBe('no-cache');
        expect(res.headers.Expires).toBe('0');
        expect(res.headers['Surrogate-Control']).toBe('no-store');
    });

    test('keeps revalidation for JavaScript on secure requests', () => {
        const res = createMockResponse({
            headers: {
                'user-agent': 'Mozilla/5.0',
                'x-forwarded-proto': 'https'
            }
        });

        config.setHeaders(res, '/app/public/js/main.js');

        expect(res.headers['Cache-Control']).toBe('public, max-age=0, must-revalidate');
        expect(res.headers.Pragma).toBeUndefined();
    });

    test('never caches index.html', () => {
        const res = createMockResponse({
            headers: {
                'x-forwarded-proto': 'https'
            }
        });

        config.setHeaders(res, '/app/public/index.html');

        expect(res.headers['Content-Type']).toBe('text/html; charset=utf-8');
        expect(res.headers['Cache-Control']).toBe(NO_STORE_CACHE_CONTROL);
        expect(res.headers['Surrogate-Control']).toBe('no-store');
    });

    test('disables image caching on insecure LAN requests', () => {
        const res = createMockResponse();

        config.setHeaders(res, '/app/public/images/logo.png');

        expect(res.headers['Cache-Control']).toBe(NO_STORE_CACHE_CONTROL);
    });
});
