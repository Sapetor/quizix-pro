/**
 * Auth Chip controller
 *
 * Owns the top-bar user chip / "Sign in" button. Calls `authManager.bootstrap`
 * on init, updates the chip whenever auth state changes, and handles clicks
 * (open modal when anonymous, confirm + log out when authenticated).
 */

import { logger } from '../core/config.js';
import { authManager } from '../utils/auth-manager.js';
import { translationManager } from '../utils/translation-manager.js';
import { openAuthModal } from './auth-modal.js';

function t(key, fallback) {
    const res = translationManager.getTranslationSync(key);
    return res === key ? (fallback || key) : res;
}

function renderChip(chip) {
    const avatar = chip.querySelector('.user-chip-avatar');
    const name = chip.querySelector('.user-chip-name');
    if (!avatar || !name) return;

    if (authManager.isAuthenticated) {
        const u = authManager.user;
        const initial = (u.username || '?').charAt(0).toUpperCase();
        chip.classList.remove('anonymous');
        avatar.textContent = initial;
        name.textContent = u.username;
        name.removeAttribute('data-translate');
        chip.setAttribute('aria-label', t('auth_signed_in_as', 'Signed in as') + ' ' + u.username);
        chip.setAttribute('title', t('auth_logout_tooltip', 'Click to log out'));
    } else {
        chip.classList.add('anonymous');
        avatar.textContent = '?';
        name.setAttribute('data-translate', 'auth_signin_short');
        name.textContent = t('auth_signin_short', 'Sign in');
        chip.setAttribute('aria-label', t('auth_signin_tooltip', 'Sign in to your account'));
        chip.setAttribute('title', t('auth_signin_tooltip', 'Sign in to your account'));
    }
}

async function onChipClick() {
    if (authManager.isAuthenticated) {
        const msg = t('auth_logout_confirm', 'Log out?');
        if (window.confirm(`${msg} (${authManager.user.username})`)) {
            await authManager.logout();
        }
    } else {
        openAuthModal('login');
    }
}

export async function initAuthChip() {
    const chip = document.getElementById('user-chip');
    if (!chip) {
        logger.warn('auth-chip: #user-chip element not found');
        return;
    }

    chip.addEventListener('click', onChipClick);
    window.addEventListener('auth-changed', () => renderChip(chip));
    document.addEventListener('languageChanged', () => renderChip(chip));

    await authManager.bootstrap();
    renderChip(chip);
    logger.debug('Auth chip initialized; user:', authManager.user?.username || null);
}
