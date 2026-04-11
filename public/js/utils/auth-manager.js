/**
 * Auth Manager (frontend)
 *
 * Tracks the current logged-in user and wraps the /api/auth/* endpoints.
 * Dispatches an `auth-changed` window event whenever the user flips between
 * logged-in and anonymous so other components (file manager, top bar) can
 * refresh themselves.
 */

import { logger } from '../core/config.js';
import { APIHelper } from './api-helper.js';

class AuthManager {
    constructor() {
        this._user = null;
        this._booted = false;
    }

    get user() {
        return this._user;
    }

    get isAuthenticated() {
        return this._user !== null;
    }

    /**
     * Called once at app startup. Reads /api/auth/me to restore the user if
     * a valid session cookie exists.
     */
    async bootstrap() {
        if (this._booted) return this._user;
        this._booted = true;
        try {
            const res = await fetch(APIHelper.getApiUrl('api/auth/me'), {
                credentials: 'same-origin'
            });
            if (res.ok) {
                const body = await res.json();
                this._setUser(body.user || null);
            } else {
                this._setUser(null);
            }
        } catch (err) {
            logger.warn('auth-manager bootstrap failed:', err.message);
            this._setUser(null);
        }
        return this._user;
    }

    async signup(username, password) {
        return this._authRequest('api/auth/signup', { username, password });
    }

    async login(username, password) {
        return this._authRequest('api/auth/login', { username, password });
    }

    async logout() {
        try {
            await fetch(APIHelper.getApiUrl('api/auth/logout'), {
                method: 'POST',
                credentials: 'same-origin'
            });
        } catch (err) {
            logger.warn('auth-manager logout network error:', err.message);
        }
        this._setUser(null);
    }

    async _authRequest(endpoint, body) {
        const res = await fetch(APIHelper.getApiUrl(endpoint), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || `Request failed: ${res.status}`);
            err.status = res.status;
            err.messageKey = data.messageKey;
            throw err;
        }
        this._setUser(data.user || null);
        return data.user;
    }

    _setUser(user) {
        const prevId = this._user?.id || null;
        const nextId = user?.id || null;
        this._user = user;
        if (prevId !== nextId) {
            window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
            logger.debug(`auth-changed: ${nextId ? 'logged in as ' + user.username : 'logged out'}`);
        }
    }
}

export const authManager = new AuthManager();
