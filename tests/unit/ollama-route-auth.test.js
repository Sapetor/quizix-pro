/**
 * The Ollama proxy routes run prompts on the operator's Ollama. Anonymous
 * clients reaching the server through the tunnel or a proxy must be refused;
 * signed-in users and direct LAN clients keep access.
 */
const http = require('http');
const express = require('express');
const { createAIGenerationRoutes } = require('../../routes/ai-generation');

function buildApp() {
    const app = express();
    app.use(express.json());
    // Stand-in for attach-user: a test header marks the request as signed in.
    app.use((req, _res, next) => {
        req.user = req.headers['x-test-user'] ? { id: 'u1', username: 'host' } : null;
        next();
    });
    const passthrough = () => (req, _res, next) => { req.validatedBody = req.body; next(); };
    app.use('/api', createAIGenerationRoutes({
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        validateBody: passthrough,
        claudeGenerateSchema: {}, geminiGenerateSchema: {}, extractUrlSchema: {}, aiCompleteSchema: {},
        isProduction: false,
    }));
    return app;
}

// http.request so the client call is not intercepted by the fetch mock.
function request(base, method, urlPath, headers = {}, payload) {
    const body = payload ? JSON.stringify(payload) : '';
    const url = new URL(base + urlPath);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
        });
        req.on('error', reject);
        req.end(body);
    });
}

describe('Ollama routes require a signed-in user or a direct LAN client', () => {
    let server, base, prevEnabled, fetchSpy;

    beforeAll(done => {
        prevEnabled = process.env.OLLAMA_ENABLED;
        process.env.OLLAMA_ENABLED = 'true';
        server = http.createServer(buildApp()).listen(0, '127.0.0.1', () => {
            base = `http://127.0.0.1:${server.address().port}`;
            done();
        });
    });

    afterAll(done => {
        if (prevEnabled === undefined) delete process.env.OLLAMA_ENABLED; else process.env.OLLAMA_ENABLED = prevEnabled;
        server.close(done);
    });

    beforeEach(() => {
        // Stand-in for the upstream Ollama server; no real host is contacted.
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true, status: 200,
            json: async () => ({ models: [], response: 'ok' }),
            text: async () => ''
        });
    });

    afterEach(() => fetchSpy.mockRestore());

    const TUNNEL = { 'cf-connecting-ip': '203.0.113.7' };
    const routes = [
        ['POST', '/api/ollama/generate', { model: 'm', prompt: 'p' }],
        ['GET', '/api/ollama/models', null],
        ['GET', '/api/ollama/health', null]
    ];

    test.each(routes)('anonymous tunnel client: %s %s -> 401, Ollama not called', async (method, urlPath, payload) => {
        const res = await request(base, method, urlPath, TUNNEL, payload);
        expect(res.status).toBe(401);
        expect(res.body.messageKey).toBe('error_auth_required');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test.each(routes)('anonymous direct LAN client: %s %s is served', async (method, urlPath, payload) => {
        const res = await request(base, method, urlPath, {}, payload);
        expect(res.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalled();
    });

    test.each(routes)('signed-in tunnel client: %s %s is served', async (method, urlPath, payload) => {
        const res = await request(base, method, urlPath, { ...TUNNEL, 'x-test-user': '1' }, payload);
        expect(res.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalled();
    });
});
