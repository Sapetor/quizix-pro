/**
 * Authorization tests for routes/quiz-management.js.
 *
 * Covers the folder mutation routes (which ran with no authorization at all)
 * and the results routes (which were readable and writable by anyone).
 *
 * The router is exercised directly as express middleware with plain req/res
 * objects, so no HTTP server is started.
 */

const { createQuizManagementRoutes } = require('../../routes/quiz-management');
const { validateBody, validateParams, ...schemas } = require('../../services/validation-schemas');

const FOLDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_FOLDER_ID = '22222222-2222-4222-8222-222222222222';

function makeRes() {
    const res = {
        statusCode: 200,
        body: undefined,
        headers: {},
        _resolve: null
    };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; res._resolve(res); return res; };
    res.send = (body) => { res.body = body; res._resolve(res); return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    return res;
}

function dispatch(router, { method, url, body = {}, user = null, query = {}, headers = {} }) {
    const req = {
        method,
        url,
        body,
        user,
        query,
        headers,
        ip: '10.0.0.1',
        socket: { remoteAddress: '10.0.0.1' },
        get: (name) => headers[name.toLowerCase()]
    };
    const res = makeRes();
    return new Promise((resolve, reject) => {
        res._resolve = resolve;
        router(req, res, (err) => (err ? reject(err) : resolve(res)));
    });
}

function makeDeps(overrides = {}) {
    const folders = {
        [FOLDER_ID]: { id: FOLDER_ID, name: 'Owned', parentId: null, ownerId: 'user-1' },
        [OTHER_FOLDER_ID]: { id: OTHER_FOLDER_ID, name: 'Legacy', parentId: null }
    };

    const metadataService = {
        getFolder: jest.fn((id) => folders[id]),
        createFolder: jest.fn(async (name, parentId, ownerId) => ({ id: 'new-folder', name, parentId, ownerId })),
        renameFolder: jest.fn(async (id, name) => ({ id, name })),
        moveFolder: jest.fn(async (id, parentId) => ({ id, parentId })),
        deleteFolder: jest.fn(async () => ({ success: true })),
        requiresAuth: jest.fn(() => false),
        verifyToken: jest.fn(() => true),
        isQuizVisibleToUser: jest.fn(() => true),
        getQuizMetadata: jest.fn(() => null),
        getTreeStructure: jest.fn(() => ({}))
    };

    const resultsService = {
        saveResults: jest.fn(async () => ({ success: true, filename: 'results_123456_1.json' })),
        listResults: jest.fn(async () => [{ filename: 'results_123456_1.json' }]),
        getResult: jest.fn(async () => ({ results: [] })),
        exportResults: jest.fn(async () => ({ filename: 'x.csv', type: 'text/csv', content: 'a,b' })),
        deleteResult: jest.fn(async () => ({ success: true }))
    };

    return {
        quizService: { validateFilename: () => true, listQuizzes: jest.fn(async () => []), loadQuiz: jest.fn(), deleteQuiz: jest.fn() },
        resultsService,
        metadataService,
        gameSessionService: { getAllGames: () => new Map(), getGame: () => null },
        qrService: { generateQRCode: jest.fn(), getCacheHeaders: () => ({}) },
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        validateBody,
        validateParams,
        schemas,
        ...overrides
    };
}

describe('folder route authorization', () => {
    let deps, router;

    beforeEach(() => {
        deps = makeDeps();
        router = createQuizManagementRoutes(deps);
    });

    test('create rejects an anonymous request', async () => {
        const res = await dispatch(router, { method: 'POST', url: '/api/folders', body: { name: 'New' } });

        expect(res.statusCode).toBe(401);
        expect(res.body.messageKey).toBe('error_auth_required');
        expect(deps.metadataService.createFolder).not.toHaveBeenCalled();
    });

    test('create records the creator as owner', async () => {
        const res = await dispatch(router, {
            method: 'POST', url: '/api/folders', body: { name: 'New' }, user: { id: 'user-1' }
        });

        expect(res.statusCode).toBe(201);
        expect(deps.metadataService.createFolder).toHaveBeenCalledWith('New', null, 'user-1');
    });

    test('rename rejects an anonymous request', async () => {
        const res = await dispatch(router, {
            method: 'PATCH', url: `/api/folders/${FOLDER_ID}/rename`, body: { name: 'X' }
        });

        expect(res.statusCode).toBe(401);
        expect(deps.metadataService.renameFolder).not.toHaveBeenCalled();
    });

    test('rename rejects a signed-in non-owner', async () => {
        const res = await dispatch(router, {
            method: 'PATCH', url: `/api/folders/${FOLDER_ID}/rename`, body: { name: 'X' }, user: { id: 'user-2' }
        });

        expect(res.statusCode).toBe(403);
        expect(res.body.messageKey).toBe('error_folder_not_owner');
        expect(deps.metadataService.renameFolder).not.toHaveBeenCalled();
    });

    test('rename allows the owner', async () => {
        const res = await dispatch(router, {
            method: 'PATCH', url: `/api/folders/${FOLDER_ID}/rename`, body: { name: 'X' }, user: { id: 'user-1' }
        });

        expect(res.statusCode).toBe(200);
        expect(deps.metadataService.renameFolder).toHaveBeenCalledWith(FOLDER_ID, 'X');
    });

    test('rename allows any signed-in user on a legacy ownerless folder', async () => {
        const res = await dispatch(router, {
            method: 'PATCH', url: `/api/folders/${OTHER_FOLDER_ID}/rename`, body: { name: 'X' }, user: { id: 'user-9' }
        });

        expect(res.statusCode).toBe(200);
    });

    test('move rejects a signed-in non-owner', async () => {
        const res = await dispatch(router, {
            method: 'PATCH', url: `/api/folders/${FOLDER_ID}/move`, body: { parentId: null }, user: { id: 'user-2' }
        });

        expect(res.statusCode).toBe(403);
        expect(deps.metadataService.moveFolder).not.toHaveBeenCalled();
    });

    test('move rejects an anonymous request', async () => {
        const res = await dispatch(router, {
            method: 'PATCH', url: `/api/folders/${FOLDER_ID}/move`, body: { parentId: null }
        });

        expect(res.statusCode).toBe(401);
    });

    test('delete rejects an anonymous request', async () => {
        const res = await dispatch(router, { method: 'DELETE', url: `/api/folders/${FOLDER_ID}` });

        expect(res.statusCode).toBe(401);
        expect(deps.metadataService.deleteFolder).not.toHaveBeenCalled();
    });

    test('delete rejects a signed-in non-owner', async () => {
        const res = await dispatch(router, {
            method: 'DELETE', url: `/api/folders/${FOLDER_ID}`, user: { id: 'user-2' }
        });

        expect(res.statusCode).toBe(403);
        expect(deps.metadataService.deleteFolder).not.toHaveBeenCalled();
    });

    test('delete allows the owner', async () => {
        const res = await dispatch(router, {
            method: 'DELETE', url: `/api/folders/${FOLDER_ID}`, user: { id: 'user-1' }
        });

        expect(res.statusCode).toBe(200);
        expect(deps.metadataService.deleteFolder).toHaveBeenCalledWith(FOLDER_ID, false);
    });
});

describe('results route authorization', () => {
    let deps, router;

    beforeEach(() => {
        deps = makeDeps();
        router = createQuizManagementRoutes(deps);
    });

    test('save-results rejects a body with no schema fields', async () => {
        const res = await dispatch(router, { method: 'POST', url: '/api/save-results', body: {} });

        expect(res.statusCode).toBe(400);
        expect(deps.resultsService.saveResults).not.toHaveBeenCalled();
    });

    test('save-results rejects an unbounded results array', async () => {
        const res = await dispatch(router, {
            method: 'POST',
            url: '/api/save-results',
            body: {
                quizTitle: 'Q',
                gamePin: '123456',
                results: Array.from({ length: 1001 }, (_, i) => ({ name: `p${i}`, score: 0 }))
            }
        });

        expect(res.statusCode).toBe(400);
        expect(deps.resultsService.saveResults).not.toHaveBeenCalled();
    });

    test('save-results rejects a non-6-digit game pin', async () => {
        const res = await dispatch(router, {
            method: 'POST',
            url: '/api/save-results',
            body: { quizTitle: 'Q', gamePin: '../../etc', results: [] }
        });

        expect(res.statusCode).toBe(400);
        expect(deps.resultsService.saveResults).not.toHaveBeenCalled();
    });

    test('save-results accepts a well-formed body', async () => {
        const res = await dispatch(router, {
            method: 'POST',
            url: '/api/save-results',
            body: {
                quizTitle: 'Q',
                gamePin: '123456',
                results: [{ name: 'Alice', score: 100, answers: [] }],
                startTime: '2026-01-01T00:00:00Z',
                endTime: '2026-01-01T00:10:00Z'
            }
        });

        expect(res.statusCode).toBe(200);
        expect(deps.resultsService.saveResults).toHaveBeenCalled();
    });

    test('save-results is rate limited per IP', async () => {
        const body = { quizTitle: 'Q', gamePin: '123456', results: [] };
        let last;
        for (let i = 0; i < 40; i++) {
            last = await dispatch(router, { method: 'POST', url: '/api/save-results', body });
        }

        expect(last.statusCode).toBe(429);
        expect(last.body.messageKey).toBe('error_rate_limited');
    });

    test('listing results requires a signed-in user', async () => {
        const anon = await dispatch(router, { method: 'GET', url: '/api/results' });
        expect(anon.statusCode).toBe(401);
        expect(anon.body.messageKey).toBe('error_auth_required');
        expect(deps.resultsService.listResults).not.toHaveBeenCalled();

        const signedIn = await dispatch(router, { method: 'GET', url: '/api/results', user: { id: 'user-1' } });
        expect(signedIn.statusCode).toBe(200);
    });

    test('reading one result requires a signed-in user', async () => {
        const res = await dispatch(router, { method: 'GET', url: '/api/results/results_123456_1.json' });

        expect(res.statusCode).toBe(401);
        expect(deps.resultsService.getResult).not.toHaveBeenCalled();
    });

    test('exporting results requires a signed-in user', async () => {
        const res = await dispatch(router, { method: 'GET', url: '/api/results/results_123456_1.json/export/csv' });

        expect(res.statusCode).toBe(401);
        expect(deps.resultsService.exportResults).not.toHaveBeenCalled();
    });

    test('delete rejects an origin whose host merely contains the server host', async () => {
        const res = await dispatch(router, {
            method: 'DELETE',
            url: '/api/results/results_123456_1.json',
            query: { confirm: 'true' },
            headers: { origin: 'https://evil-example.com', host: 'example.com' }
        });

        expect(res.statusCode).toBe(403);
        expect(res.body.messageKey).toBe('error_cross_origin');
        expect(deps.resultsService.deleteResult).not.toHaveBeenCalled();
    });

    test('delete accepts a matching origin host', async () => {
        const res = await dispatch(router, {
            method: 'DELETE',
            url: '/api/results/results_123456_1.json',
            query: { confirm: 'true' },
            headers: { origin: 'https://example.com', host: 'example.com' }
        });

        expect(res.statusCode).toBe(200);
        expect(deps.resultsService.deleteResult).toHaveBeenCalled();
    });
});
