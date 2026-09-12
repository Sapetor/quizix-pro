/**
 * Results access control.
 *
 * A game's results are readable by the signed-in user who hosted it, or by a
 * caller that presents the host token minted for that game (anonymous hosting).
 * Everyone else is refused. Files written before ownership was recorded have no
 * owner and stay readable by any signed-in user.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const { ResultsService, hashHostToken } = require('../../services/results-service');
const { createQuizManagementRoutes } = require('../../routes/quiz-management');

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

const OWNER_TOKEN = '11111111-2222-3333-4444-555555555555';
const OTHER_TOKEN = '99999999-8888-7777-6666-555555555555';

let resultsDir;
let resultsService;
let server;
let base;
let currentUser = null;

function writeResultFile(filename, extra) {
    const data = Object.assign({
        quizTitle: 'Test Quiz',
        gamePin: filename.split('_')[1],
        results: [{ name: 'Player1', score: 100, answers: [{ isCorrect: true }] }],
        questions: [{ text: 'Q1?', type: 'multiple-choice', options: ['a', 'b'], correctAnswer: 0 }],
        saved: new Date().toISOString()
    }, extra);
    fs.writeFileSync(path.join(resultsDir, filename), JSON.stringify(data));
    return filename;
}

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = currentUser; next(); });
    const passthrough = () => (req, _res, next) => { req.validatedBody = req.body; next(); };
    app.use('/', createQuizManagementRoutes({
        quizService: {},
        resultsService,
        metadataService: {},
        gameSessionService: {},
        qrService: {},
        logger: silentLogger,
        validateBody: passthrough,
        validateParams: passthrough,
        schemas: {}
    }));
    return app;
}

function get(urlPath, headers = {}) {
    return fetch(`${base}${urlPath}`, { headers });
}

beforeAll((done) => {
    resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizix-results-auth-'));
    resultsService = new ResultsService(silentLogger, resultsDir);
    server = http.createServer(buildApp()).listen(0, () => {
        base = `http://127.0.0.1:${server.address().port}`;
        done();
    });
});

afterAll((done) => {
    fs.rmSync(resultsDir, { recursive: true, force: true });
    server.close(done);
});

beforeEach(() => {
    currentUser = null;
    for (const f of fs.readdirSync(resultsDir)) fs.unlinkSync(path.join(resultsDir, f));
});

describe('ResultsService.canAccess', () => {
    test('owner user id grants access', () => {
        const record = { hostUserId: 'u1', hostTokenHash: hashHostToken(OWNER_TOKEN) };
        expect(resultsService.canAccess(record, { userId: 'u1', hostTokens: [] })).toBe(true);
        expect(resultsService.canAccess(record, { userId: 'u2', hostTokens: [] })).toBe(false);
    });

    test('matching host token grants access, a different token does not', () => {
        const record = { hostUserId: null, hostTokenHash: hashHostToken(OWNER_TOKEN) };
        expect(resultsService.canAccess(record, { userId: null, hostTokens: [OWNER_TOKEN] })).toBe(true);
        expect(resultsService.canAccess(record, { userId: null, hostTokens: [OTHER_TOKEN] })).toBe(false);
        expect(resultsService.canAccess(record, { userId: null, hostTokens: [] })).toBe(false);
    });

    test('legacy record with no owner fields is readable by any signed-in user only', () => {
        const record = { quizTitle: 'Old' };
        expect(resultsService.canAccess(record, { userId: 'anyone', hostTokens: [] })).toBe(true);
        expect(resultsService.canAccess(record, { userId: null, hostTokens: [OWNER_TOKEN] })).toBe(false);
    });
});

describe('saveResults owner record', () => {
    test('stores the token hash, never the raw token', async () => {
        const { filename } = await resultsService.saveResults(
            'Test Quiz', '123456', [{ name: 'P', score: 1 }], null, null, null,
            { userId: 'u1', hostToken: OWNER_TOKEN }
        );
        const raw = fs.readFileSync(path.join(resultsDir, filename), 'utf8');
        expect(raw).not.toContain(OWNER_TOKEN);
        const data = JSON.parse(raw);
        expect(data.hostUserId).toBe('u1');
        expect(data.hostTokenHash).toBe(hashHostToken(OWNER_TOKEN));
    });
});

describe('GET /api/results/:filename', () => {
    test('signed-in owner reads own results', async () => {
        const f = writeResultFile('results_123456_1704067200000.json', { hostUserId: 'u1', hostTokenHash: hashHostToken(OWNER_TOKEN) });
        currentUser = { id: 'u1', username: 'owner' };
        const res = await get(`/api/results/${f}`);
        expect(res.status).toBe(200);
        expect((await res.json()).quizTitle).toBe('Test Quiz');
    });

    test('anonymous host reads own results with the host token', async () => {
        const f = writeResultFile('results_123456_1704067200000.json', { hostUserId: null, hostTokenHash: hashHostToken(OWNER_TOKEN) });
        const viaHeader = await get(`/api/results/${f}`, { 'X-Host-Token': OWNER_TOKEN });
        expect(viaHeader.status).toBe(200);
        const viaBearer = await get(`/api/results/${f}`, { Authorization: `Bearer ${OWNER_TOKEN}` });
        expect(viaBearer.status).toBe(200);
    });

    test('stranger with no credentials is refused', async () => {
        const f = writeResultFile('results_123456_1704067200000.json', { hostUserId: 'u1', hostTokenHash: hashHostToken(OWNER_TOKEN) });
        const res = await get(`/api/results/${f}`);
        expect(res.status).toBe(401);
        expect((await res.json()).messageKey).toBe('error_auth_required');
    });

    test('wrong host token is refused', async () => {
        const f = writeResultFile('results_123456_1704067200000.json', { hostUserId: null, hostTokenHash: hashHostToken(OWNER_TOKEN) });
        const res = await get(`/api/results/${f}`, { 'X-Host-Token': OTHER_TOKEN });
        expect(res.status).toBe(403);
        expect((await res.json()).messageKey).toBe('error_access_forbidden');
    });

    test('a different signed-in user is refused', async () => {
        const f = writeResultFile('results_123456_1704067200000.json', { hostUserId: 'u1', hostTokenHash: hashHostToken(OWNER_TOKEN) });
        currentUser = { id: 'u2', username: 'stranger' };
        const res = await get(`/api/results/${f}`);
        expect(res.status).toBe(403);
    });

    test('legacy file: signed-in user reads it, anonymous token holder does not', async () => {
        const f = writeResultFile('results_222222_1704067200000.json');
        currentUser = { id: 'u2', username: 'any' };
        expect((await get(`/api/results/${f}`)).status).toBe(200);
        currentUser = null;
        expect((await get(`/api/results/${f}`, { 'X-Host-Token': OWNER_TOKEN })).status).toBe(403);
        expect((await get(`/api/results/${f}`)).status).toBe(401);
    });
});

describe('GET /api/results (listing)', () => {
    test('token holder sees only that game; owner sees own plus legacy files', async () => {
        writeResultFile('results_111111_1704067200000.json', { hostUserId: null, hostTokenHash: hashHostToken(OWNER_TOKEN) });
        writeResultFile('results_333333_1704067200000.json', { hostUserId: 'u1', hostTokenHash: hashHostToken(OTHER_TOKEN) });
        writeResultFile('results_222222_1704067200000.json');

        const tokenList = await get('/api/results', { 'X-Host-Token': OWNER_TOKEN });
        expect(tokenList.status).toBe(200);
        expect((await tokenList.json()).map(r => r.gamePin)).toEqual(['111111']);

        currentUser = { id: 'u1', username: 'owner' };
        const ownerList = await get('/api/results');
        expect((await ownerList.json()).map(r => r.gamePin).sort()).toEqual(['222222', '333333']);
    });

    test('no credentials is refused', async () => {
        writeResultFile('results_111111_1704067200000.json', { hostTokenHash: hashHostToken(OWNER_TOKEN) });
        const res = await get('/api/results');
        expect(res.status).toBe(401);
        expect((await res.json()).messageKey).toBe('error_auth_required');
    });

    test('several tokens in one header return every matching game', async () => {
        writeResultFile('results_111111_1704067200000.json', { hostTokenHash: hashHostToken(OWNER_TOKEN) });
        writeResultFile('results_333333_1704067200000.json', { hostTokenHash: hashHostToken(OTHER_TOKEN) });
        const res = await get('/api/results', { 'X-Host-Token': `${OWNER_TOKEN},${OTHER_TOKEN}` });
        expect((await res.json()).map(r => r.gamePin).sort()).toEqual(['111111', '333333']);
    });
});

describe('DELETE /api/results/:filename', () => {
    test('a stranger cannot delete another host\'s results; the token holder can', async () => {
        const f = writeResultFile('results_123456_1704067200000.json', { hostTokenHash: hashHostToken(OWNER_TOKEN) });

        const denied = await fetch(`${base}/api/results/${f}?confirm=true`, { method: 'DELETE' });
        expect(denied.status).toBe(403);
        expect(fs.existsSync(path.join(resultsDir, f))).toBe(true);

        const allowed = await fetch(`${base}/api/results/${f}?confirm=true`, {
            method: 'DELETE',
            headers: { 'X-Host-Token': OWNER_TOKEN }
        });
        expect(allowed.status).toBe(200);
        expect(fs.existsSync(path.join(resultsDir, f))).toBe(false);
    });
});

describe('GET /api/results/:filename/export/:format', () => {
    test('host token exports, wrong token is refused', async () => {
        const f = writeResultFile('results_123456_1704067200000.json', { hostTokenHash: hashHostToken(OWNER_TOKEN) });
        const ok = await get(`/api/results/${f}/export/csv`, { 'X-Host-Token': OWNER_TOKEN });
        expect(ok.status).toBe(200);
        expect(await ok.text()).toContain('Player1');

        const denied = await get(`/api/results/${f}/export/csv`, { 'X-Host-Token': OTHER_TOKEN });
        expect(denied.status).toBe(403);
    });
});
