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

describe('JS fallback handler path containment', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { createJsFileHandler } = require('../../middleware/static-files');
    const logger = { debug() {}, info() {}, warn() {}, error() {} };
    let baseDir;
    let handler;

    beforeAll(() => {
        baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-handler-'));
        fs.mkdirSync(path.join(baseDir, 'public', 'js'), { recursive: true });
        fs.mkdirSync(path.join(baseDir, 'public', 'js-private'));
        fs.writeFileSync(path.join(baseDir, 'public', 'js', 'a.js'), 'export const a = 1;');
        fs.writeFileSync(path.join(baseDir, 'public', 'js-private', 'b.js'), 'SIBLING-SECRET');
        fs.writeFileSync(path.join(baseDir, 'secret.txt'), 'TOP-SECRET');
        handler = createJsFileHandler(logger, true, baseDir);
    });

    afterAll(() => fs.rmSync(baseDir, { recursive: true, force: true }));

    // The handler answers asynchronously (fs.readFile), so resolve on json/send.
    function request(reqPath) {
        return new Promise((resolve) => {
            const res = {
                statusCode: 200,
                setHeader() {},
                status(code) { this.statusCode = code; return this; },
                json(body) { resolve({ status: this.statusCode, body: JSON.stringify(body) }); },
                send(body) { resolve({ status: this.statusCode, body: String(body) }); }
            };
            handler({ path: reqPath }, res, () => resolve({ status: 'next', body: '' }));
        });
    }

    test('serves a file inside public/js', async () => {
        const { status, body } = await request('/js/a.js');
        expect(status).toBe(200);
        expect(body).toBe('export const a = 1;');
    });

    test.each([
        ['/js/../../secret.txt', 'TOP-SECRET'],
        ['/js/../js-private/b.js', 'SIBLING-SECRET']
    ])('refuses %s, which resolves outside public/js', async (reqPath, secret) => {
        const { status, body } = await request(reqPath);
        expect(status).toBe(404);
        expect(body).not.toContain(secret);
    });
});
