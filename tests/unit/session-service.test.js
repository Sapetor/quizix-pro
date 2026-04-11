/**
 * Session Service Tests
 */

const { SessionService } = require('../../services/session-service');

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('SessionService', () => {
    let svc;

    beforeEach(() => {
        jest.clearAllMocks();
        // Inject secret via env so we never touch the filesystem.
        process.env.SESSION_SECRET = 'a'.repeat(64);
        svc = new SessionService(mockLogger, { ttlMs: 60_000 });
    });

    afterEach(() => {
        delete process.env.SESSION_SECRET;
    });

    describe('sign and verify roundtrip', () => {
        test('verifies a freshly signed cookie and returns the uid', () => {
            const token = svc.signSession('user-123');
            const result = svc.verifySession(token);
            expect(result).toEqual({ uid: 'user-123' });
        });

        test('rejects null / empty / non-string input without throwing', () => {
            expect(svc.verifySession(null)).toBeNull();
            expect(svc.verifySession('')).toBeNull();
            expect(svc.verifySession(undefined)).toBeNull();
            expect(svc.verifySession(12345)).toBeNull();
            expect(svc.verifySession('nodotshere')).toBeNull();
        });

        test('rejects a token with a tampered signature', () => {
            const token = svc.signSession('user-123');
            // Flip the last character of the signature.
            const last = token[token.length - 1];
            const flipped = token.slice(0, -1) + (last === 'A' ? 'B' : 'A');
            expect(svc.verifySession(flipped)).toBeNull();
        });

        test('rejects a token with a tampered payload (different uid)', () => {
            const token = svc.signSession('user-123');
            const dot = token.indexOf('.');
            const payload = token.slice(0, dot);
            const sig = token.slice(dot + 1);
            // Re-encode a different payload with the old signature.
            const fakePayload = Buffer.from(JSON.stringify({
                uid: 'attacker',
                iat: Date.now(),
                exp: Date.now() + 60_000,
                nonce: 'x'
            })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            expect(svc.verifySession(`${fakePayload}.${sig}`)).toBeNull();
            expect(payload).toBeTruthy();
        });

        test('rejects an expired token', () => {
            const shortSvc = new SessionService(mockLogger, { ttlMs: -1 });
            // Need a secret even for the short-ttl instance
            process.env.SESSION_SECRET = 'a'.repeat(64);
            const token = shortSvc.signSession('user-123');
            expect(shortSvc.verifySession(token)).toBeNull();
        });

        test('different secrets produce incompatible tokens', () => {
            const token = svc.signSession('user-123');
            process.env.SESSION_SECRET = 'b'.repeat(64);
            const other = new SessionService(mockLogger);
            expect(other.verifySession(token)).toBeNull();
        });
    });

    describe('buildSetCookie', () => {
        test('sets Path=/, HttpOnly, SameSite=Lax, and Max-Age', () => {
            const cookie = svc.buildSetCookie('abc.def');
            expect(cookie).toContain('quizix_session=abc.def');
            expect(cookie).toContain('Path=/');
            expect(cookie).toContain('HttpOnly');
            expect(cookie).toContain('SameSite=Lax');
            expect(cookie).toMatch(/Max-Age=\d+/);
            expect(cookie).not.toContain('Secure');
        });

        test('adds Secure flag when secure=true', () => {
            const cookie = svc.buildSetCookie('abc.def', { secure: true });
            expect(cookie).toContain('Secure');
        });
    });

    describe('buildClearCookie', () => {
        test('returns a cookie with Max-Age=0 and empty value', () => {
            const cookie = svc.buildClearCookie();
            expect(cookie).toContain('quizix_session=;');
            expect(cookie).toContain('Max-Age=0');
            expect(cookie).toContain('Path=/');
            expect(cookie).toContain('HttpOnly');
        });
    });

    describe('readCookieFromHeader', () => {
        test('extracts the session cookie from a header with multiple cookies', () => {
            const header = 'lang=en; quizix_session=abc.def; theme=dark';
            expect(svc.readCookieFromHeader(header)).toBe('abc.def');
        });

        test('returns null when the session cookie is absent', () => {
            const header = 'lang=en; theme=dark';
            expect(svc.readCookieFromHeader(header)).toBeNull();
        });

        test('returns null on null/undefined/empty input', () => {
            expect(svc.readCookieFromHeader(null)).toBeNull();
            expect(svc.readCookieFromHeader(undefined)).toBeNull();
            expect(svc.readCookieFromHeader('')).toBeNull();
        });
    });
});
