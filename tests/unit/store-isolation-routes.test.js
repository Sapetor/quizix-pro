/**
 * Authorization tests for routes/quiz-management.js.
 *
 * Covers the folder mutation routes (which ran with no authorization at all)
 * and the results routes (which were readable and writable by anyone).
 *
 * The router is exercised directly as express middleware with plain req/res
 * objects, so no HTTP server is started.
 */

const { createQuizManagementRoutes, quizUnlockError } = require('../../routes/quiz-management');
const { MetadataService } = require('../../services/metadata-service');
const { validateBody, validateParams, ...schemas } = require('../../services/validation-schemas');

const FOLDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_FOLDER_ID = '22222222-2222-4222-8222-222222222222';

// Requests through the tunnel arrive from loopback with CF-Connecting-IP; behind
// a Docker or k8s proxy they arrive from a private address with X-Forwarded-For.
// Neither is a direct LAN client.
const PROXIED = [
    { 'cf-connecting-ip': '203.0.113.7' },
    { 'x-forwarded-for': '203.0.113.7' },
    { forwarded: 'for=203.0.113.7' }
];

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
        setFolderPassword: jest.fn(async (id, password) => ({ success: true, protected: !!password })),
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
        quizService: { validateFilename: () => true, listQuizzes: jest.fn(async () => []), loadQuiz: jest.fn(), deleteQuiz: jest.fn(), setQuizTitle: jest.fn(async () => {}) },
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
        expect(deps.metadataService.deleteFolder).toHaveBeenCalledWith(FOLDER_ID, false, 'user-1');
    });

    test('password rejects a signed-in non-owner', async () => {
        const res = await dispatch(router, {
            method: 'POST', url: `/api/folders/${FOLDER_ID}/password`, body: { password: 'secret' }, user: { id: 'user-2' }
        });

        expect(res.statusCode).toBe(403);
        expect(res.body.messageKey).toBe('error_folder_not_owner');
        expect(deps.metadataService.setFolderPassword).not.toHaveBeenCalled();
    });

    test('password allows the owner, and any signed-in user on a legacy ownerless folder', async () => {
        for (const [id, userId] of [[FOLDER_ID, 'user-1'], [OTHER_FOLDER_ID, 'user-9']]) {
            const res = await dispatch(router, {
                method: 'POST', url: `/api/folders/${id}/password`, body: { password: 'secret' }, user: { id: userId }
            });
            expect(res.statusCode).toBe(200);
            expect(deps.metadataService.setFolderPassword).toHaveBeenCalledWith(id, 'secret', userId);
        }
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

    const wellFormed = {
        quizTitle: 'Q',
        gamePin: '123456',
        results: [{ name: 'Alice', score: 100, answers: [] }],
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-01T00:10:00Z'
    };

    test('save-results accepts a well-formed body from a direct LAN client with a host token', async () => {
        const res = await dispatch(router, {
            method: 'POST', url: '/api/save-results', body: wellFormed, headers: { 'x-host-token': 'host-token-1' }
        });

        expect(res.statusCode).toBe(200);
        expect(deps.resultsService.saveResults.mock.calls[0][6]).toEqual({ userId: null, hostToken: 'host-token-1' });
    });

    test('save-results accepts a signed-in user behind the tunnel', async () => {
        const res = await dispatch(router, {
            method: 'POST', url: '/api/save-results', body: wellFormed, headers: PROXIED[0], user: { id: 'user-1' }
        });

        expect(res.statusCode).toBe(200);
        expect(deps.resultsService.saveResults.mock.calls[0][6]).toEqual({ userId: 'user-1', hostToken: null });
    });

    test('save-results rejects a request with no session and no host token', async () => {
        const res = await dispatch(router, { method: 'POST', url: '/api/save-results', body: wellFormed });

        expect(res.statusCode).toBe(401);
        expect(res.body.messageKey).toBe('error_auth_required');
        expect(deps.resultsService.saveResults).not.toHaveBeenCalled();
    });

    test.each(PROXIED)('save-results rejects an anonymous proxied client that presents a token: %j', async proxyHeaders => {
        const res = await dispatch(router, {
            method: 'POST', url: '/api/save-results', body: wellFormed,
            headers: { ...proxyHeaders, 'x-host-token': 'made-up-token' }
        });

        expect(res.statusCode).toBe(401);
        expect(deps.resultsService.saveResults).not.toHaveBeenCalled();
    });

    test('save-results rejects a body over 1 MB', async () => {
        const res = await dispatch(router, {
            method: 'POST',
            url: '/api/save-results',
            body: { ...wellFormed, results: [{ name: 'Alice', score: 100, padding: 'x'.repeat(2 * 1024 * 1024) }] },
            user: { id: 'user-1' }
        });

        expect(res.statusCode).toBe(413);
        expect(res.body.messageKey).toBe('error_validation_failed');
        expect(deps.resultsService.saveResults).not.toHaveBeenCalled();
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


describe('password-protected quiz downloads', () => {
    function setup() {
        const deps = makeDeps();
        deps.quizService = { validateFilename: () => true, loadQuiz: jest.fn(async () => ({ questions: ['secret'] })) };
        Object.assign(deps.metadataService, {
            isQuizVisibleToUser: () => true,
            requiresAuth: () => true,
            verifyToken: (token, filename, type) => token === 'valid' && filename === 'locked.json' && type === 'quiz'
        });
        return { deps, router: createQuizManagementRoutes(deps) };
    }
    test.each([{}, { authorization: 'Bearer wrong' }])('denies download without a valid unlock token: %j', async headers => {
        const { deps, router } = setup();
        const res = await dispatch(router, { method: 'GET', url: '/api/quiz/locked.json', headers });
        expect(res.statusCode).toBe(401);
        expect(deps.quizService.loadQuiz).not.toHaveBeenCalled();
    });
    test('allows download after unlocking', async () => {
        const { router } = setup();
        const res = await dispatch(router, { method: 'GET', url: '/api/quiz/locked.json', headers: { authorization: 'Bearer valid' } });
        expect(res.statusCode).toBe(200);
        expect(res.body.questions).toEqual(['secret']);
    });
});

describe('private quiz downloads', () => {
    test('a valid unlock token does not open another user\'s private quiz', async () => {
        const deps = makeDeps();
        deps.quizService = { validateFilename: () => true, loadQuiz: jest.fn(async () => ({ questions: ['secret'] })) };
        Object.assign(deps.metadataService, {
            isQuizVisibleToUser: () => false,
            requiresAuth: () => true,
            verifyToken: () => true
        });
        const router = createQuizManagementRoutes(deps);
        const res = await dispatch(router, {
            method: 'GET', url: '/api/quiz/private.json', headers: { authorization: 'Bearer valid' }, user: { id: 'user-2' }
        });
        expect(res.statusCode).toBe(403);
        expect(deps.quizService.loadQuiz).not.toHaveBeenCalled();
    });
});

describe('active games listing', () => {
    function setup() {
        const games = new Map([
            ['123456', { pin: '123456', quiz: { title: 'Live', questions: [1, 2] }, players: new Map(), gameState: 'lobby' }],
            ['654321', { pin: '654321', quiz: { title: 'Done', questions: [1] }, players: new Map(), gameState: 'finished' }]
        ]);
        const deps = makeDeps({ gameSessionService: { getAllGames: () => games, getGame: () => null } });
        return createQuizManagementRoutes(deps);
    }

    test('lists unfinished games to a direct LAN client, without a debug block', async () => {
        const res = await dispatch(setup(), { method: 'GET', url: '/api/active-games' });
        expect(res.statusCode).toBe(200);
        expect(res.body.games.map(g => g.pin)).toEqual(['123456']);
        expect(res.body.debug).toBeUndefined();
    });

    test.each(PROXIED)('returns an empty list to an anonymous proxied client: %j', async headers => {
        const res = await dispatch(setup(), { method: 'GET', url: '/api/active-games', headers });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ games: [] });
    });

    test('returns an empty list to a direct client with a public address', async () => {
        const router = setup();
        const req = { method: 'GET', url: '/api/active-games', headers: {}, query: {}, socket: { remoteAddress: '203.0.113.7' }, get: () => undefined };
        const res = makeRes();
        await new Promise((resolve, reject) => { res._resolve = resolve; router(req, res, err => (err ? reject(err) : resolve(res))); });
        expect(res.body).toEqual({ games: [] });
    });

    test('lists games to a signed-in user behind the tunnel', async () => {
        const res = await dispatch(setup(), {
            method: 'GET', url: '/api/active-games', headers: PROXIED[0], user: { id: 'user-1' }
        });
        expect(res.body.games.map(g => g.pin)).toEqual(['123456']);
    });
});

describe('ownerless quiz changes', () => {
    function setup() {
        const deps = makeDeps();
        deps.quizService.deleteQuiz = jest.fn(async () => {});
        Object.assign(deps.metadataService, {
            getQuizMetadata: jest.fn(() => ({ displayName: 'Legacy', folderId: null })),
            deleteQuizMetadata: jest.fn(async () => {}),
            setQuizDisplayName: jest.fn(async () => {})
        });
        return { deps, router: createQuizManagementRoutes(deps) };
    }

    test.each(PROXIED)('an anonymous proxied client cannot delete an ownerless quiz: %j', async headers => {
        const { deps, router } = setup();
        const res = await dispatch(router, {
            method: 'DELETE', url: '/api/quiz/legacy.json?confirm=true', query: { confirm: 'true' }, headers
        });
        expect(res.statusCode).toBe(401);
        expect(res.body.messageKey).toBe('error_auth_required');
        expect(deps.quizService.deleteQuiz).not.toHaveBeenCalled();
    });

    test('a direct LAN client can still delete an ownerless quiz', async () => {
        const { deps, router } = setup();
        const res = await dispatch(router, {
            method: 'DELETE', url: '/api/quiz/legacy.json?confirm=true', query: { confirm: 'true' }
        });
        expect(res.statusCode).toBe(200);
        expect(deps.quizService.deleteQuiz).toHaveBeenCalledWith('legacy.json');
    });

    test('a signed-in user behind the tunnel can delete an ownerless quiz', async () => {
        const { deps, router } = setup();
        const res = await dispatch(router, {
            method: 'DELETE', url: '/api/quiz/legacy.json?confirm=true', query: { confirm: 'true' },
            headers: PROXIED[0], user: { id: 'user-1' }
        });
        expect(res.statusCode).toBe(200);
        expect(deps.quizService.deleteQuiz).toHaveBeenCalled();
    });

    // The editor overwrites a quiz only when its title matches the loaded
    // file title, and the save then writes that title back as display name.
    test('renaming a quiz also renames the title in the quiz file', async () => {
        const { deps, router } = setup();
        const res = await dispatch(router, {
            method: 'PATCH', url: '/api/quiz-metadata/legacy.json', body: { displayName: 'Algebra final' }
        });
        expect(res.statusCode).toBe(200);
        expect(deps.quizService.setQuizTitle).toHaveBeenCalledWith('legacy.json', 'Algebra final');
        expect(deps.metadataService.setQuizDisplayName).toHaveBeenCalledWith('legacy.json', 'Algebra final');
    });

    test('an anonymous proxied client cannot rename or move an ownerless quiz', async () => {
        const { deps, router } = setup();
        const res = await dispatch(router, {
            method: 'PATCH', url: '/api/quiz-metadata/legacy.json', body: { displayName: 'Renamed' }, headers: PROXIED[0]
        });
        expect(res.statusCode).toBe(401);
        expect(deps.metadataService.setQuizDisplayName).not.toHaveBeenCalled();
        expect(deps.quizService.setQuizTitle).not.toHaveBeenCalled();
    });
});

test('an anonymous proxied client cannot register an unknown quiz through the metadata route', async () => {
    const deps = makeDeps();
    deps.quizService.loadQuiz = jest.fn(async () => ({ title: 'x' }));
    deps.metadataService.registerQuiz = jest.fn(async () => ({}));
    const router = createQuizManagementRoutes(deps);
    const res = await dispatch(router, {
        method: 'PATCH', url: '/api/quiz-metadata/unknown.json', body: { displayName: 'x' }, headers: PROXIED[1]
    });
    expect(res.statusCode).toBe(401);
    expect(deps.metadataService.registerQuiz).not.toHaveBeenCalled();
});

// Uses the real MetadataService so the route is checked against the real
// requiresAuth, unlock and verifyToken.
describe('changing a quiz inside a password-protected folder', () => {
    async function setup() {
        const metadataService = new MetadataService(makeDeps().logger, {}, 'unused');
        metadataService.saveMetadata = async () => {};
        metadataService.metadata = {
            folders: {
                [FOLDER_ID]: { id: FOLDER_ID, name: 'Locked', parentId: null, passwordHash: await metadataService.hashPassword('folder-pw') }
            },
            quizzes: { 'legacy.json': { displayName: 'Legacy', folderId: FOLDER_ID } }
        };
        const deps = makeDeps({ metadataService });
        return { metadataService, router: createQuizManagementRoutes(deps) };
    }

    const patch = (router, body, extra = {}) => dispatch(router, {
        method: 'PATCH', url: '/api/quiz-metadata/legacy.json', body, ...extra
    });

    test.each([
        ['a direct LAN client with no token', {}],
        ['a direct LAN client with a wrong token', { headers: { authorization: 'Bearer wrong' } }],
        ['a signed-in user with no token', { user: { id: 'user-2' } }]
    ])('%s cannot move the quiz out of the folder', async (_label, extra) => {
        const { metadataService, router } = await setup();
        const res = await patch(router, { folderId: null }, extra);

        expect(res.statusCode).toBe(401);
        expect(res.body.messageKey).toBe('error_auth_required');
        expect(metadataService.getQuizMetadata('legacy.json').folderId).toBe(FOLDER_ID);
        expect(metadataService.requiresAuth('legacy.json', 'quiz', null)).toBe(true);
    });

    test('a rename without the token is refused', async () => {
        const { metadataService, router } = await setup();
        const res = await patch(router, { displayName: 'Renamed' });

        expect(res.statusCode).toBe(401);
        expect(metadataService.getQuizMetadata('legacy.json').displayName).toBe('Legacy');
    });

    test('the token from unlocking with the folder password allows the move', async () => {
        const { metadataService, router } = await setup();
        const { token } = await metadataService.unlock('legacy.json', 'quiz', 'folder-pw', '10.0.0.1');
        const res = await patch(router, { folderId: null }, { headers: { authorization: `Bearer ${token}` } });

        expect(res.statusCode).toBe(200);
        expect(metadataService.getQuizMetadata('legacy.json').folderId).toBeNull();
    });

    // POST /api/save-quiz in server.js calls quizUnlockError before overwriting.
    test('overwriting through save-quiz needs the unlock token', async () => {
        const { metadataService } = await setup();
        const req = (headers = {}) => ({ user: null, get: (name) => headers[name.toLowerCase()] });
        const { token } = await metadataService.unlock('legacy.json', 'quiz', 'folder-pw', '10.0.0.1');

        expect(quizUnlockError(metadataService, req(), 'legacy.json').status).toBe(401);
        expect(quizUnlockError(metadataService, req({ authorization: 'Bearer wrong' }), 'legacy.json').status).toBe(401);
        expect(quizUnlockError(metadataService, req({ authorization: `Bearer ${token}` }), 'legacy.json')).toBeNull();
        expect(quizUnlockError(metadataService, req(), 'unknown.json')).toBeNull();
    });
});
