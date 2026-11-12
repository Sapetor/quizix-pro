/**
 * Auth rate limit under concurrency.
 *
 * The per-IP limit (MAX_AUTH_ATTEMPTS per minute) must hold for a burst of
 * concurrent requests, not only for sequential ones: an attempt is counted
 * before the password hash is awaited.
 *
 * Uses a real UserService over a temp directory and a real express router.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const { UserService, MAX_AUTH_ATTEMPTS } = require('../../services/user-service');
const { createAuthRoutes } = require('../../routes/auth');

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

let tmpDir;
let userService;
let server;
let base;
let savedFlag;

function buildApp(svc) {
    const app = express();
    app.use(express.json());
    const passthrough = () => (req, _res, next) => { req.validatedBody = req.body; next(); };
    app.use('/api/auth', createAuthRoutes({
        userService: svc,
        sessionService: {
            signSession: (id) => `token-${id}`,
            buildSetCookie: (token) => `qx_session=${token}; Path=/`,
            buildClearCookie: () => 'qx_session=; Path=/; Max-Age=0'
        },
        logger: silentLogger,
        validateBody: passthrough,
        signupSchema: {},
        loginSchema: {}
    }));
    return app;
}

function post(urlPath, body) {
    return fetch(`${base}${urlPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

beforeEach(async () => {
    savedFlag = process.env.ALLOW_SIGNUP;
    delete process.env.ALLOW_SIGNUP;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-rate-limit-'));
    userService = new UserService(silentLogger, tmpDir);
    await userService.initialize();
    await new Promise((resolve) => {
        server = http.createServer(buildApp(userService)).listen(0, '127.0.0.1', () => {
            base = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

afterEach(async () => {
    if (savedFlag === undefined) delete process.env.ALLOW_SIGNUP;
    else process.env.ALLOW_SIGNUP = savedFlag;
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('login rate limit', () => {
    test('a concurrent burst of wrong passwords gets at most MAX_AUTH_ATTEMPTS password checks', async () => {
        await userService.createUser('owner', 'correct-horse');
        const authSpy = jest.spyOn(userService, 'authenticate');

        const responses = await Promise.all(Array.from({ length: 30 }, () =>
            post('/api/auth/login', { username: 'owner', password: 'wrong-password' })));
        const statuses = responses.map(r => r.status);

        expect(statuses.filter(s => s === 401).length).toBeLessThanOrEqual(MAX_AUTH_ATTEMPTS);
        expect(statuses.filter(s => s === 429).length).toBeGreaterThanOrEqual(30 - MAX_AUTH_ATTEMPTS);
        expect(authSpy.mock.calls.length).toBeLessThanOrEqual(MAX_AUTH_ATTEMPTS);
        authSpy.mockRestore();
    }, 60000);

    test('a correct login still succeeds on a fresh limiter', async () => {
        await userService.createUser('owner', 'correct-horse');

        const res = await post('/api/auth/login', { username: 'owner', password: 'correct-horse' });
        expect(res.status).toBe(200);
    });
});

describe('signup rate limit', () => {
    test('a concurrent burst of signups gets at most MAX_AUTH_ATTEMPTS createUser calls', async () => {
        process.env.ALLOW_SIGNUP = 'true';
        const createSpy = jest.spyOn(userService, 'createUser');

        const responses = await Promise.all(Array.from({ length: 30 }, (_, i) =>
            post('/api/auth/signup', { username: `user_${i}`, password: 'correct-horse' })));
        const statuses = responses.map(r => r.status);

        expect(statuses.filter(s => s === 429).length).toBeGreaterThanOrEqual(30 - MAX_AUTH_ATTEMPTS);
        expect(createSpy.mock.calls.length).toBeLessThanOrEqual(MAX_AUTH_ATTEMPTS);
        createSpy.mockRestore();
    }, 60000);
});
