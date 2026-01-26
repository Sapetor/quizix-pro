/**
 * Password Modal Component
 * Handles password entry and creation for protected items
 */

import { logger } from '../../core/config.js';
import { translationManager } from '../../utils/translation-manager.js';
import { openModal, closeModal, createModalBindings } from '../../utils/modal-utils.js';

// Helper for shorter translation calls
const t = (key) => translationManager.getTranslationSync(key);

export class PasswordModal {
    constructor() {
        this.modal = null;
        this.bindings = null;
        this.resolvePromise = null;
        this.rejectPromise = null;

        this.createModal();
    }

    /**
     * Create the modal DOM structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.id = 'password-modal';
        this.modal.className = 'modal password-modal';
        this.modal.style.display = 'none';

        this.modal.innerHTML = `
            <div class="modal-content password-modal-content">
                <h3 class="password-modal-title"></h3>
                <p class="password-modal-message"></p>

                <div class="password-modal-fields">
                    <div class="password-modal-field">
                        <label class="password-modal-label" for="password-input"></label>
                        <input type="password" id="password-input" class="password-modal-input" autocomplete="off" />
                    </div>
                    <div class="password-modal-field password-confirm-field" style="display: none;">
                        <label class="password-modal-label" for="password-confirm-input"></label>
                        <input type="password" id="password-confirm-input" class="password-modal-input" autocomplete="off" />
                    </div>
                    <div class="password-strength" style="display: none;">
                        <div class="password-strength-bar">
                            <div class="password-strength-fill"></div>
                        </div>
                        <span class="password-strength-text"></span>
                    </div>
                </div>

                <p class="password-modal-error" style="display: none;"></p>

                <div class="password-modal-actions">
                    <button class="btn btn-secondary password-cancel-btn"></button>
                    <button class="btn btn-primary password-submit-btn"></button>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);

        // Bind events
        this.modal.querySelector('.password-cancel-btn').addEventListener('click', () => this.handleCancel());
        this.modal.querySelector('.password-submit-btn').addEventListener('click', () => this.handleSubmit());
        this.modal.querySelector('#password-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSubmit();
        });
        this.modal.querySelector('#password-confirm-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSubmit();
        });
        this.modal.querySelector('#password-input').addEventListener('input', (e) => {
            this.updateStrength(e.target.value);
        });

        // Modal bindings
        this.bindings = createModalBindings(this.modal, () => this.handleCancel());
    }

    /**
     * Prompt for existing password
     */
    promptPassword(itemName = '') {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;

            // Configure modal for password entry
            this.modal.querySelector('.password-modal-title').textContent =
                t('enter_password') || 'Enter Password';
            this.modal.querySelector('.password-modal-message').textContent =
                itemName ? `${t('password_required_for') || 'Password required for'} "${itemName}"` : '';
            this.modal.querySelector('.password-modal-label').textContent =
                t('password') || 'Password';
            this.modal.querySelector('.password-confirm-field').style.display = 'none';
            this.modal.querySelector('.password-strength').style.display = 'none';
            this.modal.querySelector('.password-modal-error').style.display = 'none';
            this.modal.querySelector('.password-cancel-btn').textContent =
                t('cancel') || 'Cancel';
            this.modal.querySelector('.password-submit-btn').textContent =
                t('unlock') || 'Unlock';

            // Reset fields
            this.modal.querySelector('#password-input').value = '';
            this.modal.querySelector('#password-confirm-input').value = '';

            this.isNewPassword = false;
            openModal(this.modal);

            // Focus input
            setTimeout(() => {
                this.modal.querySelector('#password-input').focus();
            }, 100);
        });
    }

    /**
     * Prompt for new password with confirmation
     */
    promptNewPassword(itemName = '') {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;

            // Configure modal for new password
            this.modal.querySelector('.password-modal-title').textContent =
                t('set_password') || 'Set Password';
            this.modal.querySelector('.password-modal-message').textContent =
                itemName ? `${t('set_password_for') || 'Set password for'} "${itemName}"` : '';

            const labels = this.modal.querySelectorAll('.password-modal-label');
            labels[0].textContent = t('new_password') || 'New Password';
            labels[1].textContent = t('confirm_password') || 'Confirm Password';

            this.modal.querySelector('.password-confirm-field').style.display = 'block';
            this.modal.querySelector('.password-strength').style.display = 'block';
            this.modal.querySelector('.password-modal-error').style.display = 'none';
            this.modal.querySelector('.password-cancel-btn').textContent =
                t('cancel') || 'Cancel';
            this.modal.querySelector('.password-submit-btn').textContent =
                t('set_password') || 'Set Password';

            // Reset fields
            this.modal.querySelector('#password-input').value = '';
            this.modal.querySelector('#password-confirm-input').value = '';
            this.updateStrength('');

            this.isNewPassword = true;
            openModal(this.modal);

            // Focus input
            setTimeout(() => {
                this.modal.querySelector('#password-input').focus();
            }, 100);
        });
    }

    /**
     * Update password strength indicator
     */
    updateStrength(password) {
        const strengthBar = this.modal.querySelector('.password-strength-fill');
        const strengthText = this.modal.querySelector('.password-strength-text');

        let strength = 0;
        let text = '';
        let color = '';

        if (password.length >= 4) strength += 25;
        if (password.length >= 8) strength += 25;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength += 25;
        if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) strength += 25;

        if (strength <= 25) {
            text = t('password_weak') || 'Weak';
            color = '#dc3545';
        } else if (strength <= 50) {
            text = t('password_fair') || 'Fair';
            color = '#ffc107';
        } else if (strength <= 75) {
            text = t('password_good') || 'Good';
            color = '#28a745';
        } else {
            text = t('password_strong') || 'Strong';
            color = '#17a2b8';
        }

        strengthBar.style.width = `${strength}%`;
        strengthBar.style.backgroundColor = color;
        strengthText.textContent = text;
        strengthText.style.color = color;
    }

    /**
     * Show error message
     */
    showError(message) {
        const errorEl = this.modal.querySelector('.password-modal-error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';

        // Shake animation
        this.modal.querySelector('.password-modal-content').classList.add('shake');
        setTimeout(() => {
            this.modal.querySelector('.password-modal-content').classList.remove('shake');
        }, 500);
    }

    /**
     * Handle submit
     */
    handleSubmit() {
        const password = this.modal.querySelector('#password-input').value;

        if (!password) {
            this.showError(t('password_required') || 'Password is required');
            return;
        }

        if (this.isNewPassword) {
            // Validate new password
            if (password.length < 4) {
                this.showError(t('password_too_short') || 'Password must be at least 4 characters');
                return;
            }

            const confirm = this.modal.querySelector('#password-confirm-input').value;
            if (password !== confirm) {
                this.showError(t('passwords_dont_match') || 'Passwords do not match');
                return;
            }
        }

        closeModal(this.modal);

        if (this.resolvePromise) {
            this.resolvePromise(password);
            this.resolvePromise = null;
            this.rejectPromise = null;
        }
    }

    /**
     * Handle cancel
     */
    handleCancel() {
        closeModal(this.modal);

        if (this.rejectPromise) {
            this.rejectPromise(new Error('Cancelled'));
            this.resolvePromise = null;
            this.rejectPromise = null;
        }
    }

    /**
     * Destroy the modal
     */
    destroy() {
        if (this.bindings?.cleanup) {
            this.bindings.cleanup();
        }
        this.modal?.remove();
    }
}

export default PasswordModal;
