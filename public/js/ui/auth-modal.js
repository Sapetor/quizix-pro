/**
 * Auth Modal
 *
 * Lazily builds a login / signup modal, uses modal-utils for open/close,
 * delegates submit to authManager. No HTML markup required in index.html —
 * the DOM is created on first use and appended to `<body>`.
 */

import { logger } from '../core/config.js';
import { authManager } from '../utils/auth-manager.js';
import { openModal, closeModal } from '../utils/modal-utils.js';
import { translationManager, getTranslation } from '../utils/translation-manager.js';

let modalEl = null;
let currentTab = 'login';

function t(key) {
    return translationManager.getTranslationSync(key);
}

function ensureModal() {
    if (modalEl) return modalEl;

    const overlay = document.createElement('div');
    overlay.id = 'auth-modal';
    overlay.className = 'auth-modal-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'auth-modal-title');

    overlay.innerHTML = `
        <div class="auth-modal-content" role="document">
            <button type="button" class="auth-modal-close" aria-label="Close" data-auth-action="close">&times;</button>
            <h2 id="auth-modal-title" class="auth-modal-title" data-translate="auth_title">Sign in</h2>
            <p class="auth-modal-hint" data-translate="auth_hint">Accounts are optional. Sign in to keep your quizzes private.</p>

            <div class="auth-modal-tabs" role="tablist">
                <button type="button" class="auth-tab" role="tab" data-auth-tab="login" aria-selected="true" data-translate="auth_tab_login">Log in</button>
                <button type="button" class="auth-tab" role="tab" data-auth-tab="signup" aria-selected="false" data-translate="auth_tab_signup">Sign up</button>
            </div>

            <form class="auth-form" id="auth-form" autocomplete="on" novalidate>
                <label class="auth-field">
                    <span data-translate="auth_username">Username</span>
                    <input type="text" name="username" autocomplete="username" required
                        pattern="[a-zA-Z0-9_]{3,32}"
                        minlength="3" maxlength="32">
                </label>
                <label class="auth-field">
                    <span data-translate="auth_password">Password</span>
                    <input type="password" name="password" autocomplete="current-password" required
                        minlength="8" maxlength="200">
                </label>
                <div class="auth-error hidden" id="auth-error-msg" role="alert"></div>
                <button type="submit" class="btn primary auth-submit" data-translate="auth_submit_login">Log in</button>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);
    modalEl = overlay;

    // Overlay click dismisses (only when clicking the overlay itself, not the content)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
            close();
        }
    });

    // Close button + tab switching
    overlay.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('[data-auth-action="close"]');
        if (closeBtn) {
            close();
            return;
        }
        const tabBtn = e.target.closest('[data-auth-tab]');
        if (tabBtn) {
            setTab(tabBtn.getAttribute('data-auth-tab'));
        }
    });

    // Form submission
    overlay.querySelector('#auth-form').addEventListener('submit', onSubmit);

    // Re-translate when language changes while the modal is mounted
    document.addEventListener('languageChanged', () => {
        if (modalEl) {
            translationManager.translateContainer(modalEl);
            setTab(currentTab); // refresh submit button label
        }
    });

    return modalEl;
}

function setTab(tab) {
    currentTab = tab === 'signup' ? 'signup' : 'login';
    const form = modalEl.querySelector('#auth-form');
    const submit = form.querySelector('.auth-submit');
    const pwInput = form.querySelector('input[name="password"]');
    const errEl = modalEl.querySelector('#auth-error-msg');

    errEl.classList.add('hidden');
    errEl.textContent = '';

    modalEl.querySelectorAll('[data-auth-tab]').forEach(btn => {
        const isActive = btn.getAttribute('data-auth-tab') === currentTab;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });

    if (currentTab === 'signup') {
        submit.setAttribute('data-translate', 'auth_submit_signup');
        submit.textContent = t('auth_submit_signup');
        pwInput.setAttribute('autocomplete', 'new-password');
    } else {
        submit.setAttribute('data-translate', 'auth_submit_login');
        submit.textContent = t('auth_submit_login');
        pwInput.setAttribute('autocomplete', 'current-password');
    }
}

function showError(messageKey, fallback) {
    const errEl = modalEl.querySelector('#auth-error-msg');
    const text = messageKey ? getTranslation(messageKey) : fallback;
    errEl.textContent = text && text !== messageKey ? text : (fallback || t('auth_error_generic'));
    errEl.classList.remove('hidden');
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const username = (formData.get('username') || '').toString().trim();
    const password = (formData.get('password') || '').toString();

    if (!username || !password) {
        showError(null, t('auth_error_required'));
        return;
    }

    const submit = form.querySelector('.auth-submit');
    submit.disabled = true;
    try {
        if (currentTab === 'signup') {
            await authManager.signup(username, password);
        } else {
            await authManager.login(username, password);
        }
        close();
    } catch (err) {
        logger.debug('auth modal submit failed:', err.status, err.messageKey);
        showError(err.messageKey, err.message);
    } finally {
        submit.disabled = false;
    }
}

export function openAuthModal(initialTab = 'login') {
    ensureModal();
    translationManager.translateContainer(modalEl);
    setTab(initialTab);
    const form = modalEl.querySelector('#auth-form');
    form.reset();
    modalEl.querySelector('#auth-error-msg').classList.add('hidden');
    openModal(modalEl);
    setTimeout(() => {
        const firstInput = modalEl.querySelector('input[name="username"]');
        if (firstInput) firstInput.focus();
    }, 50);
}

export function closeAuthModal() {
    close();
}

function close() {
    if (!modalEl) return;
    closeModal(modalEl);
}
