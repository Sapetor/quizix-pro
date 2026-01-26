/**
 * Context Menu Component
 * Right-click context menu for file management actions
 */

import { logger } from '../../core/config.js';
import { escapeHtml } from '../../utils/dom.js';
import { translationManager } from '../../utils/translation-manager.js';

// Helper for shorter translation calls
const t = (key) => translationManager.getTranslationSync(key);

export class ContextMenu {
    constructor(options = {}) {
        this.options = {
            onAction: options.onAction || (() => {})
        };

        this.element = null;
        this.currentContext = null;
        this.boundClickOutside = this.handleClickOutside.bind(this);
        this.boundKeyDown = this.handleKeyDown.bind(this);

        this.createMenu();
    }

    /**
     * Create the menu DOM element
     */
    createMenu() {
        this.element = document.createElement('div');
        this.element.className = 'context-menu';
        this.element.style.display = 'none';
        document.body.appendChild(this.element);
    }

    /**
     * Show the context menu at position
     */
    show(x, y, type, id, data) {
        this.currentContext = { type, id, data };

        // Build menu items based on context
        const items = this.getMenuItems(type, data);
        this.renderItems(items);

        // Position the menu
        this.element.style.display = 'block';

        // Adjust position to stay within viewport
        const rect = this.element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let finalX = x;
        let finalY = y;

        if (x + rect.width > viewportWidth) {
            finalX = viewportWidth - rect.width - 10;
        }

        if (y + rect.height > viewportHeight) {
            finalY = viewportHeight - rect.height - 10;
        }

        this.element.style.left = `${Math.max(10, finalX)}px`;
        this.element.style.top = `${Math.max(10, finalY)}px`;

        // Add event listeners
        document.addEventListener('click', this.boundClickOutside);
        document.addEventListener('contextmenu', this.boundClickOutside);
        document.addEventListener('keydown', this.boundKeyDown);

        logger.debug('Context menu shown for', type, id);
    }

    /**
     * Hide the context menu
     */
    hide() {
        this.element.style.display = 'none';
        this.currentContext = null;

        document.removeEventListener('click', this.boundClickOutside);
        document.removeEventListener('contextmenu', this.boundClickOutside);
        document.removeEventListener('keydown', this.boundKeyDown);
    }

    /**
     * Get menu items based on context type
     */
    getMenuItems(type, data) {
        const items = [];

        if (type === 'folder') {
            items.push(
                { action: 'new-folder', label: t('new_folder') || 'New Folder', icon: '&#128193;' },
                { type: 'separator' },
                { action: 'rename', label: t('rename') || 'Rename', icon: '&#9998;' },
                { action: 'move', label: t('move_to') || 'Move To...', icon: '&#128194;' },
                { type: 'separator' },
                {
                    action: data.protected ? 'remove-password' : 'set-password',
                    label: data.protected ? (t('remove_password') || 'Remove Password') : (t('set_password') || 'Set Password'),
                    icon: data.protected ? '&#128275;' : '&#128274;'
                },
                { type: 'separator' },
                { action: 'delete', label: t('delete') || 'Delete', icon: '&#128465;', danger: true }
            );
        } else if (type === 'quiz') {
            items.push(
                { action: 'load', label: t('load') || 'Load', icon: '&#128194;' },
                { action: 'practice', label: t('practice') || 'Practice', icon: '&#127919;' },
                { type: 'separator' },
                { action: 'rename', label: t('rename') || 'Rename', icon: '&#9998;' },
                { action: 'move', label: t('move_to') || 'Move To...', icon: '&#128194;' },
                { type: 'separator' },
                {
                    action: data.protected ? 'remove-password' : 'set-password',
                    label: data.protected ? (t('remove_password') || 'Remove Password') : (t('set_password') || 'Set Password'),
                    icon: data.protected ? '&#128275;' : '&#128274;'
                },
                { type: 'separator' },
                { action: 'delete', label: t('delete') || 'Delete', icon: '&#128465;', danger: true }
            );
        } else if (type === 'root') {
            // Context menu for empty area / root
            items.push(
                { action: 'new-folder', label: t('new_folder') || 'New Folder', icon: '&#128193;' },
                { type: 'separator' },
                { action: 'expand-all', label: t('expand_all') || 'Expand All', icon: '&#128193;' },
                { action: 'collapse-all', label: t('collapse_all') || 'Collapse All', icon: '&#128193;' }
            );
        }

        return items;
    }

    /**
     * Render menu items
     */
    renderItems(items) {
        this.element.innerHTML = '';

        items.forEach((item, index) => {
            if (item.type === 'separator') {
                const separator = document.createElement('div');
                separator.className = 'context-menu-separator';
                this.element.appendChild(separator);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                if (item.danger) {
                    menuItem.classList.add('danger');
                }

                menuItem.innerHTML = `
                    <span class="context-menu-icon">${item.icon || ''}</span>
                    <span class="context-menu-label">${escapeHtml(item.label)}</span>
                `;

                menuItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleItemClick(item.action);
                });

                // Keyboard navigation
                menuItem.tabIndex = 0;
                menuItem.dataset.index = index;

                this.element.appendChild(menuItem);
            }
        });

        // Focus first item
        const firstItem = this.element.querySelector('.context-menu-item');
        if (firstItem) {
            firstItem.focus();
        }
    }

    /**
     * Handle menu item click
     */
    handleItemClick(action) {
        if (!this.currentContext) return;

        const { type, id, data } = this.currentContext;
        this.hide();

        this.options.onAction(action, type, id, data);
    }

    /**
     * Handle click outside menu
     */
    handleClickOutside(e) {
        if (!this.element.contains(e.target)) {
            this.hide();
        }
    }

    /**
     * Handle keyboard navigation
     */
    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.hide();
            return;
        }

        const items = this.element.querySelectorAll('.context-menu-item');
        const focused = document.activeElement;
        const currentIndex = parseInt(focused?.dataset?.index || '0');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = (currentIndex + 1) % items.length;
            items[nextIndex]?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = (currentIndex - 1 + items.length) % items.length;
            items[prevIndex]?.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            focused?.click();
        }
    }

    /**
     * Destroy the menu
     */
    destroy() {
        this.hide();
        this.element?.remove();
    }
}

export default ContextMenu;
