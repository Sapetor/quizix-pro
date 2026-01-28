/**
 * File Manager Module
 * Coordinates folder tree, context menu, and password modals for quiz file management
 */

import { logger } from '../core/config.js';
import { APIHelper } from '../utils/api-helper.js';
import { translationManager } from '../utils/translation-manager.js';
import { unifiedErrorHandler } from '../utils/unified-error-handler.js';
import { FolderTree } from './components/folder-tree.js';
import { ContextMenu } from './components/context-menu.js';
import { PasswordModal } from './components/password-modal.js';

// Helper for shorter translation calls
const t = (key) => translationManager.getTranslationSync(key);

export class FileManager {
    constructor(options = {}) {
        this.options = {
            treeContainer: options.treeContainer || null,
            onLoadQuiz: options.onLoadQuiz || (() => {}),
            onPracticeQuiz: options.onPracticeQuiz || (() => {})
        };

        this.folderTree = null;
        this.contextMenu = null;
        this.passwordModal = null;
        this.sessionTokens = new Map(); // itemId -> { token, expiresAt }
        this.treeData = null;

        this.initialize();
    }

    /**
     * Initialize all components
     */
    initialize() {
        // Initialize context menu
        this.contextMenu = new ContextMenu({
            onAction: (action, type, id, data) => this.handleAction(action, type, id, data)
        });

        // Initialize password modal
        this.passwordModal = new PasswordModal();

        logger.debug('File manager initialized');
    }

    /**
     * Initialize the folder tree component
     */
    initTree(container) {
        if (!container) {
            logger.warn('No container provided for folder tree');
            return;
        }

        this.options.treeContainer = container;

        this.folderTree = new FolderTree(container, {
            onSelect: (type, id, data) => this.handleSelect(type, id, data),
            onDoubleClick: (type, id, data) => this.handleDoubleClick(type, id, data),
            onContextMenu: (e, type, id, data) => this.showContextMenu(e, type, id, data)
        });

        // Also handle context menu on empty area
        container.addEventListener('contextmenu', (e) => {
            if (e.target === container || e.target.classList.contains('folder-tree-root')) {
                e.preventDefault();
                this.contextMenu.show(e.clientX, e.clientY, 'root', null, null);
            }
        });
    }

    /**
     * Load and display the quiz tree
     */
    async loadTree() {
        try {
            const response = await APIHelper.fetchAPI('api/quiz-tree');

            if (!response.ok) {
                throw new Error('Failed to load quiz tree');
            }

            this.treeData = await response.json();

            if (this.folderTree) {
                this.folderTree.setData(this.treeData);
            }

            logger.debug('Quiz tree loaded:', this.treeData);
            return this.treeData;
        } catch (error) {
            logger.error('Failed to load quiz tree:', error);
            throw error;
        }
    }

    /**
     * Show context menu
     */
    showContextMenu(e, type, id, data) {
        this.contextMenu.show(e.clientX, e.clientY, type, id, data);
    }

    /**
     * Handle tree item selection
     */
    handleSelect(type, id, data) {
        logger.debug('Selected:', type, id);
    }

    /**
     * Handle double-click on tree item
     */
    async handleDoubleClick(type, id, data) {
        if (type === 'quiz') {
            await this.loadQuiz(id, data);
        }
    }

    /**
     * Handle context menu action
     */
    async handleAction(action, type, id, data) {
        logger.debug('Action:', action, type, id);

        try {
            switch (action) {
            case 'load':
                await this.loadQuiz(id, data);
                break;

            case 'practice':
                await this.practiceQuiz(id, data);
                break;

            case 'new-folder':
                await this.createFolder(type === 'folder' ? id : null);
                break;

            case 'rename':
                await this.renameItem(type, id, data);
                break;

            case 'move':
                await this.moveItem(type, id, data);
                break;

            case 'set-password':
                await this.setPassword(type, id, data);
                break;

            case 'remove-password':
                await this.removePassword(type, id);
                break;

            case 'delete':
                await this.deleteItem(type, id, data);
                break;

            case 'expand-all':
                this.folderTree?.expandAll();
                break;

            case 'collapse-all':
                this.folderTree?.collapseAll();
                break;

            default:
                logger.warn('Unknown action:', action);
            }
        } catch (error) {
            if (error.message !== 'Cancelled') {
                logger.error('Action failed:', error);
                this.showToast(error.message || 'Action failed', 'error');
            }
        }
    }

    /**
     * Execute action on quiz after ensuring it's unlocked
     */
    async executeQuizAction(filename, data, action) {
        if (data?.protected) {
            const unlocked = await this.ensureUnlocked('quiz', filename, data.displayName || filename);
            if (!unlocked) return;
        }
        action(filename, data);
    }

    /**
     * Load a quiz for editing
     */
    async loadQuiz(filename, data) {
        await this.executeQuizAction(filename, data, this.options.onLoadQuiz);
    }

    /**
     * Start practice mode for a quiz
     */
    async practiceQuiz(filename, data) {
        await this.executeQuizAction(filename, data, this.options.onPracticeQuiz);
    }

    /**
     * Create a new folder
     */
    async createFolder(parentId = null) {
        const name = prompt(t('enter_folder_name') || 'Enter folder name:');
        if (!name || !name.trim()) return;

        try {
            const response = await APIHelper.fetchAPI('api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), parentId })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create folder');
            }

            await this.loadTree();
            this.showToast(t('folder_created') || 'Folder created', 'success');
        } catch (error) {
            logger.error('Create folder failed:', error);
            this.showToast(error.message, 'error');
        }
    }

    /**
     * Rename an item
     */
    async renameItem(type, id, data) {
        const currentName = type === 'folder' ? data.name : (data.displayName || id.replace('.json', ''));
        const newName = prompt(t('enter_new_name') || 'Enter new name:', currentName);

        if (!newName || !newName.trim() || newName === currentName) return;

        try {
            let response;

            if (type === 'folder') {
                response = await APIHelper.fetchAPI(`api/folders/${id}/rename`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName.trim() })
                });
            } else {
                response = await APIHelper.fetchAPI(`api/quiz-metadata/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ displayName: newName.trim() })
                });
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to rename');
            }

            await this.loadTree();
            this.showToast(t('renamed_successfully') || 'Renamed successfully', 'success');
        } catch (error) {
            logger.error('Rename failed:', error);
            this.showToast(error.message, 'error');
        }
    }

    /**
     * Move an item to a different folder
     */
    async moveItem(type, id, data) {
        // Build folder list for selection
        const folders = this.getFolderList();

        // Simple prompt-based selection (could be enhanced with a custom modal)
        let options = ['/ (Root)'];
        folders.forEach((f, i) => {
            options.push(`${i + 1}. ${f.path}`);
        });

        const selection = prompt(
            `${t('move_to') || 'Move to'}:\n\n${options.join('\n')}\n\n${t('enter_number') || 'Enter number (0 for root)'}:`
        );

        if (selection === null) return;

        const index = parseInt(selection, 10);
        const targetFolderId = index === 0 ? null : folders[index - 1]?.id;

        if (isNaN(index) || (index !== 0 && !folders[index - 1])) {
            this.showToast(t('invalid_selection') || 'Invalid selection', 'error');
            return;
        }

        try {
            let response;

            if (type === 'folder') {
                response = await APIHelper.fetchAPI(`api/folders/${id}/move`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parentId: targetFolderId })
                });
            } else {
                response = await APIHelper.fetchAPI(`api/quiz-metadata/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folderId: targetFolderId })
                });
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to move');
            }

            await this.loadTree();
            this.showToast(t('moved_successfully') || 'Moved successfully', 'success');
        } catch (error) {
            logger.error('Move failed:', error);
            this.showToast(error.message, 'error');
        }
    }

    /**
     * Get flat list of folders for move selection
     */
    getFolderList() {
        const result = [];

        const traverse = (folders, path = '') => {
            folders.forEach(folder => {
                const currentPath = path ? `${path}/${folder.name}` : folder.name;
                result.push({ id: folder.id, name: folder.name, path: currentPath });

                if (folder.children && folder.children.length > 0) {
                    traverse(folder.children, currentPath);
                }
            });
        };

        if (this.treeData?.folders) {
            traverse(this.treeData.folders);
        }

        return result;
    }

    /**
     * Set password on an item
     */
    async setPassword(type, id, data) {
        try {
            const name = type === 'folder' ? data.name : (data.displayName || id.replace('.json', ''));
            const password = await this.passwordModal.promptNewPassword(name);

            const endpoint = type === 'folder'
                ? `api/folders/${id}/password`
                : `api/quiz-metadata/${id}/password`;

            const response = await APIHelper.fetchAPI(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to set password');
            }

            await this.loadTree();
            this.showToast(t('password_set') || 'Password set successfully', 'success');
        } catch (error) {
            if (error.message !== 'Cancelled') {
                logger.error('Set password failed:', error);
                this.showToast(error.message, 'error');
            }
        }
    }

    /**
     * Remove password from an item (requires current password verification)
     */
    async removePassword(type, id) {
        try {
            // Prompt for current password to verify ownership
            const name = type === 'folder' ? 'folder' : 'quiz';
            const password = await this.passwordModal.promptPassword(t('verify_to_remove_password') || `Enter current password to remove protection`);

            // Verify password first
            const verifyResponse = await APIHelper.fetchAPI('api/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: id,
                    itemType: type,
                    password
                })
            });

            if (!verifyResponse.ok) {
                const error = await verifyResponse.json();
                if (verifyResponse.status === 401) {
                    this.showToast(t('incorrect_password') || 'Incorrect password', 'error');
                    return;
                }
                throw new Error(error.error || 'Verification failed');
            }

            // Password verified, now remove it
            const endpoint = type === 'folder'
                ? `api/folders/${id}/password`
                : `api/quiz-metadata/${id}/password`;

            const response = await APIHelper.fetchAPI(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: null })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to remove password');
            }

            // Clear cached token
            this.sessionTokens.delete(id);

            await this.loadTree();
            this.showToast(t('password_removed') || 'Password removed', 'success');
        } catch (error) {
            if (error.message !== 'Cancelled') {
                logger.error('Remove password failed:', error);
                this.showToast(error.message, 'error');
            }
        }
    }

    /**
     * Delete an item
     */
    async deleteItem(type, id, data) {
        const name = type === 'folder' ? data.name : (data.displayName || id.replace('.json', ''));
        const message = type === 'folder'
            ? (t('confirm_delete_folder') || `Delete folder "${name}" and all its contents?`)
            : (t('confirm_delete_quiz') || `Delete quiz "${name}"?`);

        if (!confirm(message.replace('{name}', name))) {
            return;
        }

        // Ensure item is unlocked if password-protected
        if (data?.protected) {
            const unlocked = await this.ensureUnlocked(type, id, name);
            if (!unlocked) {
                return;
            }
        }

        // Wrap network operation with unified error handler
        await unifiedErrorHandler.wrapAsyncOperation(
            async () => {
                const headers = {};

                // Add session token if available and valid
                const cached = this.sessionTokens.get(id);
                if (cached) {
                    if (Date.now() < cached.expiresAt) {
                        // Token is still valid
                        headers['Authorization'] = `Bearer ${cached.token}`;
                    } else if (data?.protected) {
                        // Token expired, re-authenticate for protected items
                        logger.debug('Token expired, re-authenticating...');
                        this.sessionTokens.delete(id);
                        const unlocked = await this.ensureUnlocked(type, id, name);
                        if (!unlocked) {
                            throw new Error('Authentication required');
                        }
                        // Get the fresh token
                        const refreshed = this.sessionTokens.get(id);
                        if (refreshed) {
                            headers['Authorization'] = `Bearer ${refreshed.token}`;
                        }
                    }
                }

                let response;
                if (type === 'folder') {
                    response = await APIHelper.fetchAPI(`api/folders/${id}?deleteContents=true`, {
                        method: 'DELETE',
                        headers
                    });
                } else {
                    response = await APIHelper.fetchAPI(`api/quiz/${id}?confirm=true`, {
                        method: 'DELETE',
                        headers
                    });
                }

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to delete');
                }

                // Clear cached token after successful deletion
                this.sessionTokens.delete(id);

                await this.loadTree();
                this.showToast(t('deleted_successfully') || 'Deleted successfully', 'success');
            },
            'file_delete',
            (error) => {
                this.showToast(error.message || t('delete_failed') || 'Failed to delete', 'error');
            }
        );
    }

    /**
     * Ensure item is unlocked (prompt for password if needed)
     */
    async ensureUnlocked(type, id, name) {
        // Check if we have a valid token
        const cached = this.sessionTokens.get(id);
        if (cached && Date.now() < cached.expiresAt) {
            return true;
        }

        // Check if authentication is required
        let requiresAuth = false;
        try {
            const authResponse = await APIHelper.fetchAPI(`api/requires-auth/${type}/${id}`);
            if (authResponse.ok) {
                const authData = await authResponse.json();
                requiresAuth = authData.requiresAuth;
            } else {
                // Server returned error - fail closed for security
                logger.error('Auth check returned error status:', authResponse.status);
                return false;
            }
        } catch (error) {
            // Network or other error - fail closed for security
            logger.error('Auth check failed, denying access for safety:', error);
            this.showToast(t('auth_check_failed') || 'Unable to verify permissions. Please try again.', 'error');
            return false;
        }

        // If no auth required, allow access
        if (!requiresAuth) {
            return true;
        }

        // Prompt for password
        try {
            const password = await this.passwordModal.promptPassword(name);

            const response = await APIHelper.fetchAPI('api/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: id,
                    itemType: type,
                    password
                })
            });

            if (!response.ok) {
                const error = await response.json();

                if (response.status === 429) {
                    this.showToast(t('too_many_attempts') || 'Too many attempts. Please try again later.', 'error');
                    return false;
                }

                if (response.status === 401) {
                    this.passwordModal.showError(t('incorrect_password') || 'Incorrect password');
                    // Re-prompt
                    return this.ensureUnlocked(type, id, name);
                }

                throw new Error(error.error || 'Unlock failed');
            }

            const result = await response.json();

            // Cache the token
            this.sessionTokens.set(id, {
                token: result.token,
                expiresAt: Date.now() + result.expiresIn
            });

            return true;
        } catch (error) {
            if (error.message !== 'Cancelled') {
                logger.error('Unlock failed:', error);
                this.showToast(error.message, 'error');
            }
            return false;
        }
    }

    /**
     * Register a newly saved quiz in the tree
     */
    async registerNewQuiz(filename, title) {
        try {
            await APIHelper.fetchAPI(`api/quiz-metadata/${filename}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: title })
            });

            await this.loadTree();
        } catch (error) {
            logger.warn('Failed to register quiz in metadata:', error);
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Use the global toast system if available
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            // Fallback to alert
            if (type === 'error') {
                alert(`Error: ${message}`);
            } else {
                logger.info(`Toast [${type}]: ${message}`);
            }
        }
    }

    /**
     * Get the folder tree component
     */
    getTree() {
        return this.folderTree;
    }

    /**
     * Cleanup
     */
    destroy() {
        this.contextMenu?.destroy();
        this.passwordModal?.destroy();
    }
}

// Create singleton instance
let fileManagerInstance = null;

export function getFileManager(options = {}) {
    if (!fileManagerInstance) {
        fileManagerInstance = new FileManager(options);
    }
    return fileManagerInstance;
}

export default FileManager;
