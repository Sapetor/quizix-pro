const http = require('http');
const express = require('express');
const { createAIGenerationRoutes } = require('../../routes/ai-generation');

function buildApp() {
    const app = express();
    app.use(express.json());
    // anonymous: attach-user would set req.user, here we leave it null
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

describe('server-key path requires an authenticated user', () => {
    let server, base, prevKey;
    beforeAll(done => {
        prevKey = process.env.CLAUDE_API_KEY;
        process.env.CLAUDE_API_KEY = 'server-side-key';
        server = http.createServer(buildApp()).listen(0, () => {
            base = `http://127.0.0.1:${server.address().port}`;
            done();
        });
    });
    afterAll(done => {
        if (prevKey === undefined) delete process.env.CLAUDE_API_KEY; else process.env.CLAUDE_API_KEY = prevKey;
        server.close(done);
    });

    test('anonymous request with NO client key -> 401, upstream never called', async () => {
        const spy = jest.spyOn(global, 'fetch');
        const res = await fetch(`${base}/api/claude/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'x', numQuestions: 1 })
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.messageKey).toBe('error_auth_required');
        // provider must not be hit (spy started after listen; only route-driven fetches count)
        expect(spy.mock.calls.find(c => String(c[0]).includes('api.anthropic.com'))).toBeUndefined();
        spy.mockRestore();
    });

    test('anonymous BYOK (client key present) is NOT 401', async () => {
        // Mock the UPSTREAM provider call so the handler resolves without a real
        // network hop. The client request below uses http.request (NOT fetch) so
        // this mock only intercepts the route's own outbound call, letting the
        // request actually reach the server and exercise the auth gate.
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true, status: 200, json: async () => ({ content: [{ text: '[]' }] }), text: async () => ''
        });
        const status = await postJson(base, '/api/claude/generate', { prompt: 'x', numQuestions: 1, apiKey: 'sk-client' });
        expect(status).not.toBe(401);
        global.fetch.mockRestore();
    });
});

// Minimal JSON POST over http.request so it is NOT intercepted by a fetch mock.
function postJson(base, path, payload) {
    const body = JSON.stringify(payload);
    const url = new URL(base + path);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
            res.resume();
            resolve(res.statusCode);
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
