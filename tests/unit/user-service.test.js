/**
 * User Service Tests
 *
 * Uses a real temp directory per test so atomic writes and the promise-chain
 * mutex are exercised end-to-end instead of mocked.
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const { UserService } = require('../../services/user-service');

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'user-service-test-'));
}

async function cleanup(dir) {
    try {
        await fs.rm(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
}

describe('UserService', () => {
    let tmpDir;
    let svc;

    beforeEach(async () => {
        jest.clearAllMocks();
        tmpDir = await makeTempDir();
        svc = new UserService(mockLogger, tmpDir);
        await svc.initialize();
    });

    afterEach(async () => {
        await cleanup(tmpDir);
    });

    describe('initialize', () => {
        test('creates a fresh users.json when missing', async () => {
            const raw = await fs.readFile(path.join(tmpDir, 'users.json'), 'utf8');
            const parsed = JSON.parse(raw);
            expect(parsed.version).toBe('1.0');
            expect(parsed.users).toEqual({});
            expect(parsed.usernameIndex).toEqual({});
        });

        test('loads an existing users.json', async () => {
            const existing = {
                version: '1.0',
                users: { 'uid-1': { id: 'uid-1', username: 'alice', passwordHash: 'x:y', created: '2024-01-01', lastLogin: null } },
                usernameIndex: { alice: 'uid-1' }
            };
            await fs.writeFile(path.join(tmpDir, 'users.json'), JSON.stringify(existing), 'utf8');

            const svc2 = new UserService(mockLogger, tmpDir);
            await svc2.initialize();
            expect(svc2.getUser('uid-1')).toEqual({ id: 'uid-1', username: 'alice' });
        });

        test('refuses to start on malformed users.json (does not wipe)', async () => {
            await fs.writeFile(path.join(tmpDir, 'users.json'), '{not json', 'utf8');
            const svc2 = new UserService(mockLogger, tmpDir);
            await expect(svc2.initialize()).rejects.toThrow(/Cannot load users.json/);
            // The bad file must not have been overwritten.
            const raw = await fs.readFile(path.join(tmpDir, 'users.json'), 'utf8');
            expect(raw).toBe('{not json');
        });
    });

    describe('createUser', () => {
        test('creates a user and persists it', async () => {
            const user = await svc.createUser('alice', 'hunter22!');
            expect(user.username).toBe('alice');
            expect(user.id).toBeTruthy();

            // Re-read from disk to confirm persistence.
            const raw = await fs.readFile(path.join(tmpDir, 'users.json'), 'utf8');
            const parsed = JSON.parse(raw);
            expect(parsed.users[user.id].username).toBe('alice');
            expect(parsed.usernameIndex.alice).toBe(user.id);
        });

        test('lowercases the username in the index', async () => {
            const user = await svc.createUser('Alice', 'hunter22!');
            expect(user.username).toBe('alice');
            expect(svc.data.usernameIndex.alice).toBeTruthy();
        });

        test('rejects a duplicate username (case-insensitive)', async () => {
            await svc.createUser('alice', 'hunter22!');
            await expect(svc.createUser('ALICE', 'different!'))
                .rejects.toMatchObject({ messageKey: 'error_username_taken' });
        });

        test('rejects invalid username format', async () => {
            await expect(svc.createUser('ab', 'hunter22!'))
                .rejects.toMatchObject({ messageKey: 'error_username_invalid' });
            await expect(svc.createUser('bad name', 'hunter22!'))
                .rejects.toMatchObject({ messageKey: 'error_username_invalid' });
            await expect(svc.createUser('bad@name', 'hunter22!'))
                .rejects.toMatchObject({ messageKey: 'error_username_invalid' });
        });

        test('rejects a short password', async () => {
            await expect(svc.createUser('alice', 'short'))
                .rejects.toMatchObject({ messageKey: 'error_password_too_short' });
        });
    });

    describe('authenticate', () => {
        test('returns the public user on correct credentials', async () => {
            await svc.createUser('alice', 'hunter22!');
            const user = await svc.authenticate('alice', 'hunter22!');
            expect(user).toMatchObject({ username: 'alice' });
        });

        test('is case-insensitive on username', async () => {
            await svc.createUser('alice', 'hunter22!');
            const user = await svc.authenticate('ALICE', 'hunter22!');
            expect(user).toMatchObject({ username: 'alice' });
        });

        test('returns null on wrong password', async () => {
            await svc.createUser('alice', 'hunter22!');
            expect(await svc.authenticate('alice', 'wrong_pw!')).toBeNull();
        });

        test('returns null on unknown user', async () => {
            expect(await svc.authenticate('ghost', 'hunter22!')).toBeNull();
        });

        test('updates lastLogin on successful auth', async () => {
            await svc.createUser('alice', 'hunter22!');
            await svc.authenticate('alice', 'hunter22!');
            const id = svc.data.usernameIndex.alice;
            expect(svc.data.users[id].lastLogin).toBeTruthy();
        });
    });

    describe('concurrent signups (mutex)', () => {
        test('two simultaneous signups of the same username → exactly one succeeds', async () => {
            const results = await Promise.allSettled([
                svc.createUser('alice', 'hunter22!'),
                svc.createUser('ALICE', 'another_pw!')
            ]);
            const ok = results.filter(r => r.status === 'fulfilled');
            const err = results.filter(r => r.status === 'rejected');
            expect(ok).toHaveLength(1);
            expect(err).toHaveLength(1);
            expect(err[0].reason.messageKey).toBe('error_username_taken');

            // And only one user persisted.
            const raw = await fs.readFile(path.join(tmpDir, 'users.json'), 'utf8');
            const parsed = JSON.parse(raw);
            expect(Object.keys(parsed.users)).toHaveLength(1);
        });

        test('concurrent signups of different usernames all succeed', async () => {
            const results = await Promise.all([
                svc.createUser('alice', 'hunter22!'),
                svc.createUser('bob', 'another_pw!'),
                svc.createUser('carol', 'third_pass!')
            ]);
            expect(results).toHaveLength(3);
            const raw = await fs.readFile(path.join(tmpDir, 'users.json'), 'utf8');
            const parsed = JSON.parse(raw);
            expect(Object.keys(parsed.users)).toHaveLength(3);
        });
    });

    describe('rate limiting', () => {
        test('isRateLimited returns true after MAX_AUTH_ATTEMPTS records', () => {
            const ip = '127.0.0.1';
            for (let i = 0; i < 10; i++) {
                svc.recordAuthAttempt(ip);
            }
            expect(svc.isRateLimited(ip)).toBe(true);
        });

        test('window expiry resets the counter', () => {
            const ip = '127.0.0.1';
            svc.authAttempts.set(ip, { count: 99, windowStart: Date.now() - 10 * 60_000 });
            expect(svc.isRateLimited(ip)).toBe(false);
        });
    });
});
