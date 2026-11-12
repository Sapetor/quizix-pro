/**
 * POST /api/extract-url must validate the address the connection actually
 * uses. A rebinding hostname answers the validation lookup with a public
 * address and the connection lookup with 127.0.0.1; the fetch must not reach
 * the loopback service.
 */
const http = require('http');
const dns = require('dns');
const express = require('express');
const { createAIGenerationRoutes } = require('../../routes/ai-generation');

const REBIND_HOST = 'rebind.invalid';
const PUBLIC_ADDR = '93.184.216.34';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = null; next(); });
    const passthrough = () => (req, _res, next) => { req.validatedBody = req.body; next(); };
    app.use('/api', createAIGenerationRoutes({
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        validateBody: passthrough,
        claudeGenerateSchema: {}, geminiGenerateSchema: {}, extractUrlSchema: {}, aiCompleteSchema: {},
        isProduction: false,
    }));
    return app;
}

function listen(handler) {
    return new Promise(resolve => {
        const server = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(server));
    });
}

describe('POST /api/extract-url resolves once per connection', () => {
    let app, target, targetHits, base;
    const realLookup = dns.lookup;
    const realPromiseLookup = dns.promises.lookup;

    beforeAll(async () => {
        targetHits = 0;
        target = await listen((req, res) => {
            targetHits++;
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><head><title>Internal</title></head><body><p>internal admin page</p></body></html>');
        });
        app = await listen(buildApp());
        base = `http://127.0.0.1:${app.address().port}`;
    });

    afterAll(async () => {
        await new Promise(r => target.close(r));
        await new Promise(r => app.close(r));
    });

    beforeEach(() => {
        targetHits = 0;
    });

    afterEach(() => {
        dns.lookup = realLookup;
        dns.promises.lookup = realPromiseLookup;
    });

    function post(url) {
        return fetch(`${base}/api/extract-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
    }

    test('a hostname that rebinds to 127.0.0.1 after validation is blocked', async () => {
        // Validation lookup (isBlockedHost, promise API): a public address.
        dns.promises.lookup = jest.fn(async (host, opts) => {
            if (host !== REBIND_HOST) return realPromiseLookup(host, opts);
            return [{ address: PUBLIC_ADDR, family: 4 }];
        });
        // Connection lookup (callback API, used by net/tls): loopback.
        dns.lookup = jest.fn((host, opts, cb) => {
            if (typeof opts === 'function') { cb = opts; opts = {}; }
            if (host !== REBIND_HOST) return realLookup(host, opts, cb);
            if (opts && opts.all) return cb(null, [{ address: '127.0.0.1', family: 4 }]);
            return cb(null, '127.0.0.1', 4);
        });

        const res = await post(`http://${REBIND_HOST}:${target.address().port}/`);
        const body = await res.json();

        expect(targetHits).toBe(0);
        expect(res.status).toBe(403);
        expect(body.messageKey).toBe('error_url_blocked');
    }, 30000);

    test('the connect-time lookup passes a public answer through in both callback shapes', async () => {
        const { createSafeLookup } = require('../../routes/ai-generation');
        const safeLookup = createSafeLookup(addr => addr.startsWith('10.') || addr.startsWith('127.'));
        dns.lookup = jest.fn((host, opts, cb) => {
            if (opts && opts.all) return cb(null, [{ address: PUBLIC_ADDR, family: 4 }]);
            return cb(null, PUBLIC_ADDR, 4);
        });
        const all = await new Promise((resolve, reject) => safeLookup('example.invalid', { all: true }, (err, a) => (err ? reject(err) : resolve(a))));
        expect(all).toEqual([{ address: PUBLIC_ADDR, family: 4 }]);
        const one = await new Promise((resolve, reject) => safeLookup('example.invalid', {}, (err, a, f) => (err ? reject(err) : resolve([a, f]))));
        expect(one).toEqual([PUBLIC_ADDR, 4]);
    });

    test('a public plus private answer at connect time is refused', async () => {
        const { createSafeLookup } = require('../../routes/ai-generation');
        const safeLookup = createSafeLookup(addr => addr.startsWith('10.') || addr.startsWith('127.'));
        dns.lookup = jest.fn((host, opts, cb) => cb(null, [
            { address: PUBLIC_ADDR, family: 4 },
            { address: '10.0.0.5', family: 4 }
        ]));
        const err = await new Promise(resolve => safeLookup('mixed.invalid', { all: true }, e => resolve(e)));
        expect(err).toBeInstanceOf(Error);
        expect(err.code).toBe('ERR_URL_BLOCKED');
    });
});
