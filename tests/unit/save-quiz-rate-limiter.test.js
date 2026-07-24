const { createSaveQuizRateLimiter } = require('../../utils/save-quiz-rate-limiter');

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('save-quiz rate limiter', () => {
    afterEach(() => jest.clearAllMocks());

    test('allows requests up to the limit, then blocks with retryAfter (failing-first case)', () => {
        const { checkLimit } = createSaveQuizRateLimiter({ logger: mockLogger, maxRequests: 3, windowMs: 60000 });
        const now = 1000;
        expect(checkLimit('1.1.1.1', now).allowed).toBe(true);  // 1
        expect(checkLimit('1.1.1.1', now).allowed).toBe(true);  // 2
        expect(checkLimit('1.1.1.1', now).allowed).toBe(true);  // 3
        const blocked = checkLimit('1.1.1.1', now);             // 4 -> blocked
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfter).toBe(60);
    });

    test('resets after the window elapses', () => {
        const { checkLimit } = createSaveQuizRateLimiter({ logger: mockLogger, maxRequests: 1, windowMs: 60000 });
        expect(checkLimit('2.2.2.2', 1000).allowed).toBe(true);
        expect(checkLimit('2.2.2.2', 2000).allowed).toBe(false);
        expect(checkLimit('2.2.2.2', 1000 + 60000 + 1).allowed).toBe(true);
    });

    test('tracks IPs independently', () => {
        const { checkLimit } = createSaveQuizRateLimiter({ logger: mockLogger, maxRequests: 1, windowMs: 60000 });
        expect(checkLimit('a', 1000).allowed).toBe(true);
        expect(checkLimit('a', 1000).allowed).toBe(false);
        expect(checkLimit('b', 1000).allowed).toBe(true);
    });

    test('middleware calls next() when under limit and 429s with messageKey when exceeded', () => {
        const { middleware } = createSaveQuizRateLimiter({ logger: mockLogger, maxRequests: 1, windowMs: 60000 });
        const req = { ip: '9.9.9.9' };
        const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
        const next = jest.fn();

        middleware(req, makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);

        const res2 = makeRes();
        middleware(req, res2, next);
        expect(res2.status).toHaveBeenCalledWith(429);
        expect(res2.json).toHaveBeenCalledWith(expect.objectContaining({ messageKey: 'error_rate_limited' }));
        expect(next).toHaveBeenCalledTimes(1); // not advanced on the blocked request
    });

    test('middleware falls back to req.socket.remoteAddress when req.ip is absent', () => {
        const { middleware } = createSaveQuizRateLimiter({ logger: mockLogger, maxRequests: 1, windowMs: 60000 });
        const req = { socket: { remoteAddress: '5.5.5.5' } };
        const next = jest.fn();
        const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        middleware(req, { status: jest.fn().mockReturnThis(), json: jest.fn() }, next);
        middleware(req, res2, next);
        expect(res2.status).toHaveBeenCalledWith(429);
    });
});
