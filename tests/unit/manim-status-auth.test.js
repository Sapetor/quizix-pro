/**
 * /api/manim/status must not be readable anonymously — it reports whether
 * Manim is installed and at which version. It is gated by the same
 * requireUser middleware as /api/manim/render.
 */

const http = require('http');
const express = require('express');

const { createManimRoutes } = require('../../routes/manim-routes');

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

let server;
let base;
let currentUser = null;
let router;

const manimRenderService = {
    enabled: true,
    checkAvailability: async () => ({ available: true, version: '0.18.0', error: null }),
    renderAnimation: async () => ({ videoPath: '/uploads/x.mp4', duration: null })
};

function get(pathname) {
    return new Promise((resolve, reject) => {
        http.get(`${base}${pathname}`, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });
}

beforeAll((done) => {
    const app = express();
    app.use((req, res, next) => { req.user = currentUser; next(); });
    router = createManimRoutes({ logger: silentLogger, manimRenderService });
    app.use('/api', router);

    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${server.address().port}`;
        done();
    });
});

afterAll((done) => {
    for (const interval of router._cleanupIntervals || []) clearInterval(interval);
    server.close(done);
});

test('anonymous status request is refused', async () => {
    currentUser = null;
    const res = await get('/api/manim/status');
    expect(res.status).toBe(401);
    expect(res.body).not.toContain('0.18.0');
});

test('signed-in status request is served', async () => {
    currentUser = { id: 'u1', username: 'host' };
    const res = await get('/api/manim/status');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).version).toBe('0.18.0');
});
