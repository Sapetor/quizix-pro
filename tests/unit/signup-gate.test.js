/**
 * Signup gate: first user becomes the owner.
 *
 * On a fresh instance (zero accounts) POST /signup is open so the operator can
 * create the first account. Once any account exists, signup is refused with 403
 * unless ALLOW_SIGNUP is exactly "true". Login is never affected.
 *
 * Uses a real UserService over a temp directory and a real express router, so
 * the ordering guarantee (gate runs before PBKDF2 hashing) is observable.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const { UserService } = require('../../services/user-service');
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'signup-gate-'));
    userService = new UserService(silentLogger, tmpDir);
    await userService.initialize();
    await new Promise((resolve) => {
        server = http.createServer(buildApp(userService)).listen(0, () => {
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

describe('signup gate', () => {
    test('zero users and no flag: signup succeeds (first user becomes owner)', async () => {
        const res = await post('/api/auth/signup', { username: 'owner', password: 'correct-horse' });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user.username).toBe('owner');
    });

    test('a user already exists and no flag: signup is refused with 403', async () => {
        await userService.createUser('owner', 'correct-horse');

        const res = await post('/api/auth/signup', { username: 'intruder', password: 'correct-horse' });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.messageKey).toBe('error_signup_disabled');
        expect(typeof body.error).toBe('string');
    });

    test('a user already exists and ALLOW_SIGNUP=true: signup succeeds', async () => {
        await userService.createUser('owner', 'correct-horse');
        process.env.ALLOW_SIGNUP = 'true';

        const res = await post('/api/auth/signup', { username: 'guest', password: 'correct-horse' });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user.username).toBe('guest');
    });

    test('a refused signup never reaches createUser, so no password is hashed', async () => {
        await userService.createUser('owner', 'correct-horse');
        const spy = jest.spyOn(userService, 'createUser');

        const res = await post('/api/auth/signup', { username: 'intruder', password: 'correct-horse' });
        expect(res.status).toBe(403);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    test('a refused signup does not consume a rate-limit attempt', async () => {
        await userService.createUser('owner', 'correct-horse');
        const spy = jest.spyOn(userService, 'recordAuthAttempt');

        await post('/api/auth/signup', { username: 'intruder', password: 'correct-horse' });
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe('login is unaffected by the signup gate', () => {
    test('login succeeds for an existing user while signup is closed', async () => {
        await userService.createUser('owner', 'correct-horse');

        const res = await post('/api/auth/login', { username: 'owner', password: 'correct-horse' });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.user.username).toBe('owner');
        expect(res.headers.get('set-cookie')).toContain('qx_session=');
    });

    test('login still rejects a wrong password while signup is closed', async () => {
        await userService.createUser('owner', 'correct-horse');

        const res = await post('/api/auth/login', { username: 'owner', password: 'wrong-password' });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.messageKey).toBe('error_invalid_credentials');
    });

    test('login and logout behave the same with ALLOW_SIGNUP=true', async () => {
        await userService.createUser('owner', 'correct-horse');
        process.env.ALLOW_SIGNUP = 'true';

        const login = await post('/api/auth/login', { username: 'owner', password: 'correct-horse' });
        expect(login.status).toBe(200);

        const logout = await post('/api/auth/logout', {});
        expect(logout.status).toBe(200);
        expect(await logout.json()).toEqual({ success: true });
    });
});
