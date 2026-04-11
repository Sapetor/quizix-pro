/**
 * Session Service
 *
 * Stateless HMAC-signed session cookies for user accounts.
 *
 * Cookie format: base64url(JSON payload) "." base64url(hmac-sha256 of payload)
 * Payload:       { uid, iat, exp, nonce }
 *
 * No server-side store. Revocation is out of scope for v1 — clearing the
 * cookie client-side ends the session. Rotating SESSION_SECRET invalidates
 * every outstanding cookie.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COOKIE_NAME = 'quizix_session';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function b64urlEncode(buf) {
    return Buffer.from(buf).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function b64urlDecode(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

class SessionService {
    constructor(logger, options = {}) {
        this.logger = logger;
        this.cookieName = options.cookieName || COOKIE_NAME;
        this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
        this.secretPath = options.secretPath || path.join('quizzes', '.session-secret');
        this.secret = null;
    }

    /**
     * Resolve the HMAC secret: env first, then secret file, then generate.
     * Called lazily on first use so the quizzes dir exists by then.
     */
    _loadSecret() {
        if (this.secret) return this.secret;

        if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
            this.secret = process.env.SESSION_SECRET;
            this.logger.info('Session secret loaded from SESSION_SECRET env');
            return this.secret;
        }

        try {
            const raw = fs.readFileSync(this.secretPath, 'utf8').trim();
            if (raw.length < 32) {
                throw new Error(`Session secret file ${this.secretPath} is too short (<32 chars)`);
            }
            this.secret = raw;
            this.logger.info(`Session secret loaded from ${this.secretPath}`);
            return this.secret;
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }

        const generated = crypto.randomBytes(64).toString('hex');
        fs.mkdirSync(path.dirname(this.secretPath), { recursive: true });
        fs.writeFileSync(this.secretPath, generated, { mode: 0o600 });
        this.secret = generated;
        this.logger.info(`Generated new session secret at ${this.secretPath}`);
        return this.secret;
    }

    _sign(payloadB64) {
        const secret = this._loadSecret();
        return b64urlEncode(
            crypto.createHmac('sha256', secret).update(payloadB64).digest()
        );
    }

    /**
     * Create a signed cookie value for a user id.
     */
    signSession(uid) {
        const now = Date.now();
        const payload = {
            uid,
            iat: now,
            exp: now + this.ttlMs,
            nonce: crypto.randomBytes(8).toString('hex')
        };
        const payloadB64 = b64urlEncode(JSON.stringify(payload));
        const sig = this._sign(payloadB64);
        return `${payloadB64}.${sig}`;
    }

    /**
     * Verify a cookie value. Returns { uid } on success, null on any failure.
     * Never throws on malformed input.
     */
    verifySession(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const dot = raw.indexOf('.');
        if (dot < 1 || dot === raw.length - 1) return null;

        const payloadB64 = raw.slice(0, dot);
        const sigB64 = raw.slice(dot + 1);

        let expectedSig;
        try {
            expectedSig = this._sign(payloadB64);
        } catch {
            return null;
        }

        const sigBuf = Buffer.from(sigB64);
        const expBuf = Buffer.from(expectedSig);
        if (sigBuf.length !== expBuf.length) return null;
        if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

        let payload;
        try {
            payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
        } catch {
            return null;
        }
        if (!payload || typeof payload.uid !== 'string') return null;
        if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;

        return { uid: payload.uid };
    }

    /**
     * Build a Set-Cookie header value. `secure` should be true when the
     * request is HTTPS (behind a terminating proxy, check x-forwarded-proto).
     */
    buildSetCookie(value, { secure = false } = {}) {
        const maxAgeSec = Math.floor(this.ttlMs / 1000);
        const parts = [
            `${this.cookieName}=${value}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${maxAgeSec}`
        ];
        if (secure) parts.push('Secure');
        return parts.join('; ');
    }

    /**
     * Build a Set-Cookie header that clears the session cookie.
     */
    buildClearCookie({ secure = false } = {}) {
        const parts = [
            `${this.cookieName}=`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            'Max-Age=0'
        ];
        if (secure) parts.push('Secure');
        return parts.join('; ');
    }

    /**
     * Parse a raw Cookie header and return the session cookie value, or null.
     */
    readCookieFromHeader(cookieHeader) {
        if (!cookieHeader || typeof cookieHeader !== 'string') return null;
        const parts = cookieHeader.split(';');
        for (const part of parts) {
            const eq = part.indexOf('=');
            if (eq < 0) continue;
            const name = part.slice(0, eq).trim();
            if (name === this.cookieName) {
                return part.slice(eq + 1).trim();
            }
        }
        return null;
    }
}

/**
 * Detect whether a request arrived over HTTPS, accounting for a TLS-terminating
 * proxy (K8s Ingress, Railway). Used to set the `Secure` cookie flag.
 */
function isSecureRequest(req) {
    if (req.secure) return true;
    const xfp = req.headers['x-forwarded-proto'];
    if (typeof xfp === 'string' && xfp.split(',')[0].trim() === 'https') return true;
    return false;
}

module.exports = { SessionService, COOKIE_NAME, isSecureRequest };
