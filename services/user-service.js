/**
 * User Service
 *
 * File-backed user accounts stored in `${quizzesDir}/users.json`.
 *
 * Guarantees:
 * - All mutating operations serialize through a promise-chain mutex
 *   (prevents lost-update races on concurrent signups).
 * - Writes are atomic via temp file + rename.
 * - Username lookup is case-insensitive via a lowercased index.
 * - Passwords are hashed with the shared PBKDF2 helper.
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { hashPassword, verifyPassword } = require('../utils/password-hash');

const USERNAME_REGEX = /^[a-z0-9_]{3,32}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;

// Rate-limit auth attempts per IP
const MAX_AUTH_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function makeError(message, messageKey, status = 400) {
    const err = new Error(message);
    err.messageKey = messageKey;
    err.status = status;
    return err;
}

class UserService {
    constructor(logger, quizzesDir = 'quizzes') {
        this.logger = logger;
        this.quizzesDir = quizzesDir;
        this.usersPath = path.join(quizzesDir, 'users.json');
        this.data = null;
        this._writeChain = Promise.resolve();
        this.authAttempts = new Map();
    }

    async initialize() {
        await fs.mkdir(this.quizzesDir, { recursive: true });
        try {
            const raw = await fs.readFile(this.usersPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || !parsed.users || !parsed.usernameIndex) {
                throw new Error('malformed');
            }
            this.data = parsed;
            this.logger.info(`Loaded user accounts: ${Object.keys(this.data.users).length} users`);
        } catch (err) {
            if (err.code === 'ENOENT') {
                this.data = { version: '1.0', users: {}, usernameIndex: {} };
                await this._writeNow();
                this.logger.info('Created new users.json file');
            } else {
                // Malformed or unreadable — refuse to start rather than silently
                // wiping existing accounts.
                this.logger.error(`users.json is unreadable/malformed: ${err.message}`);
                throw new Error(`Cannot load users.json: ${err.message}`);
            }
        }
    }

    /**
     * Atomic write: temp file + rename.
     */
    async _writeNow() {
        const tmp = `${this.usersPath}.tmp`;
        const body = JSON.stringify(this.data, null, 2);
        await fs.writeFile(tmp, body, 'utf8');
        await fs.rename(tmp, this.usersPath);
    }

    /**
     * Serialize a mutating operation. Each call appends to the chain so only
     * one write-critical section runs at a time, even across await points.
     */
    _runExclusive(fn) {
        const next = this._writeChain.then(fn, fn);
        // Do not let a failure poison the chain for future callers.
        this._writeChain = next.catch(() => {});
        return next;
    }

    // ------------------------------------------------------------------
    // Validation
    // ------------------------------------------------------------------

    _validateUsername(username) {
        if (typeof username !== 'string') {
            throw makeError('Username is required', 'error_username_required', 400);
        }
        const lower = username.toLowerCase();
        if (!USERNAME_REGEX.test(lower)) {
            throw makeError(
                'Username must be 3-32 characters, letters/digits/underscore only',
                'error_username_invalid',
                400
            );
        }
        return lower;
    }

    _validatePassword(password) {
        if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
            throw makeError(
                `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
                'error_password_too_short',
                400
            );
        }
        if (password.length > PASSWORD_MAX_LENGTH) {
            throw makeError(
                `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
                'error_password_too_long',
                400
            );
        }
    }

    // ------------------------------------------------------------------
    // Rate limiting (shared between signup and login per IP)
    // ------------------------------------------------------------------

    isRateLimited(ip) {
        const entry = this.authAttempts.get(ip);
        if (!entry) return false;
        if (Date.now() - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
            this.authAttempts.delete(ip);
            return false;
        }
        return entry.count >= MAX_AUTH_ATTEMPTS;
    }

    recordAuthAttempt(ip) {
        if (!ip) return;
        const now = Date.now();
        const entry = this.authAttempts.get(ip);
        if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
            this.authAttempts.set(ip, { count: 1, windowStart: now });
        } else {
            entry.count++;
        }
    }

    // ------------------------------------------------------------------
    // Account operations
    // ------------------------------------------------------------------

    async createUser(username, password) {
        const lower = this._validateUsername(username);
        this._validatePassword(password);

        // Hash outside the mutex — it's slow (PBKDF2 100k) and pure.
        const passwordHash = await hashPassword(password);

        return this._runExclusive(async () => {
            if (this.data.usernameIndex[lower]) {
                throw makeError('Username already taken', 'error_username_taken', 409);
            }
            const id = uuidv4();
            const nowIso = new Date().toISOString();
            this.data.users[id] = {
                id,
                username: lower,
                passwordHash,
                created: nowIso,
                lastLogin: null
            };
            this.data.usernameIndex[lower] = id;
            await this._writeNow();
            this.logger.info(`Created user: ${lower} (${id})`);
            return this._publicUser(this.data.users[id]);
        });
    }

    async authenticate(username, password) {
        if (typeof username !== 'string' || typeof password !== 'string') {
            return null;
        }
        const lower = username.toLowerCase();
        const id = this.data.usernameIndex[lower];
        if (!id) return null;
        const user = this.data.users[id];
        if (!user) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // Touch lastLogin through the mutex so concurrent logins don't stomp.
        await this._runExclusive(async () => {
            const u = this.data.users[id];
            if (u) {
                u.lastLogin = new Date().toISOString();
                await this._writeNow();
            }
        });

        return this._publicUser(user);
    }

    getUser(id) {
        if (!id || !this.data) return null;
        const user = this.data.users[id];
        return user ? this._publicUser(user) : null;
    }

    _publicUser(user) {
        return { id: user.id, username: user.username };
    }
}

module.exports = {
    UserService,
    USERNAME_REGEX,
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    MAX_AUTH_ATTEMPTS
};
