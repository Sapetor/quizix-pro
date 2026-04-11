/**
 * Password hashing helpers (PBKDF2-SHA512).
 *
 * Shared between metadata-service (folder/quiz password protection)
 * and user-service (user account authentication). Format is
 * `${saltHex}:${hashHex}` so a single string stores everything.
 */

const crypto = require('crypto');

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const HASH_ALGORITHM = 'sha512';

function pbkdf2(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, HASH_ALGORITHM, (err, key) => {
            if (err) reject(err);
            else resolve(key);
        });
    });
}

/**
 * Hash a plaintext password. Returns a single string "salt:hash" in hex.
 */
async function hashPassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
        throw new Error('Password must be a non-empty string');
    }
    const salt = crypto.randomBytes(SALT_LENGTH);
    const hash = await pbkdf2(password, salt);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored "salt:hash" string.
 * Returns false on any malformed input (never throws).
 */
async function verifyPassword(password, storedHash) {
    if (typeof password !== 'string' || !storedHash || typeof storedHash !== 'string') {
        return false;
    }
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;

    const [saltHex, hashHex] = parts;
    let salt, stored;
    try {
        salt = Buffer.from(saltHex, 'hex');
        stored = Buffer.from(hashHex, 'hex');
    } catch {
        return false;
    }
    if (salt.length === 0 || stored.length !== KEY_LENGTH) return false;

    const derived = await pbkdf2(password, salt);
    return crypto.timingSafeEqual(derived, stored);
}

module.exports = {
    hashPassword,
    verifyPassword,
    PBKDF2_ITERATIONS,
    SALT_LENGTH,
    KEY_LENGTH,
    HASH_ALGORITHM
};
