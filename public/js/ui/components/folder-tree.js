/**
 * Folder Tree Component
 * Expandable tree view for displaying quiz folders and files
 */

import { logger } from '../../core/config.js';
import { escapeHtml } from '../../utils/dom.js';
import { translationManager } from '../../utils/translation-manager.js';

// Helper for shorter translation calls
const t = (key) => translationManager.getTranslationSync(key);

export class FolderTree {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            onSelect: options.onSelect || (() => {}),
            onDoubleClick: options.onDoubleClick || (() => {}),
            onContextMenu: options.onContextMenu || (() => {}),
            animationDuration: options.animationDuration || 200
        };

        this.treeData = { folders: [], quizzes: [] };
        this.expandedFolders = new Set();
        this.selectedItem = null;

        // Double-tap detection for mobile (uses string IDs to survive re-renders)
        this.lastTapTime = 0;
        this.lastTapId = null;
        this.doubleTapDelay = 300; // ms

        // Load expanded state from storage
        this.loadExpandedState();
    }

    /**
     * Add double-tap support for mobile devices
     * Works alongside dblclick for desktop
     * @param {HTMLElement} element - The element to attach handler to
     * @param {string} tapId - Unique string identifier for tap detection (survives re-renders)
     * @param {Function} callback - Function to call on double-tap
     */
    addDoubleTapHandler(element, tapId, callback) {
        element.addEventListener('touchend', (e) => {
            const currentTime = Date.now();

            // Compare by string ID (not DOM reference) to survive re-renders
            if (this.lastTapId === tapId &&
                (currentTime - this.lastTapTime) < this.doubleTapDelay) {
                // Double-tap detected
                e.preventDefault();
                callback();
                // Reset to prevent triple-tap triggering
                this.lastTapTime = 0;
                this.lastTapId = null;
            } else {
                // First tap - record it
                this.lastTapTime = currentTime;
                this.lastTapId = tapId;
            }
        }, { passive: false });
    }

    /**
     * Set the tree data and render
     */
    setData(treeData) {
        this.treeData = treeData || { folders: [], quizzes: [] };
        this.render();
    }

    /**
     * Render the tree
     */
    render() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.className = 'folder-tree';

        // Render root level
        const rootList = document.createElement('ul');
        rootList.className = 'folder-tree-list folder-tree-root';

        // Render folders first, then quizzes
        this.treeData.folders.forEach(folder => {
            rootList.appendChild(this.renderFolder(folder));
        });

        this.treeData.quizzes.forEach(quiz => {
            rootList.appendChild(this.renderQuiz(quiz));
        });

        // Empty state
        if (this.treeData.folders.length === 0 && this.treeData.quizzes.length === 0) {
            const emptyMsg = document.createElement('li');
            emptyMsg.className = 'folder-tree-empty';
            emptyMsg.textContent = t('no_quizzes_yet') || 'No quizzes yet';
            rootList.appendChild(emptyMsg);
        }

        this.container.appendChild(rootList);
        logger.debug('Folder tree rendered');
    }

    /**
     * Render a folder node
     */
    renderFolder(folder) {
        const li = document.createElement('li');
        li.className = 'folder-tree-item folder-tree-folder';
        li.dataset.id = folder.id;
        li.dataset.type = 'folder';

        const isExpanded = this.expandedFolders.has(folder.id);
        if (isExpanded) {
            li.classList.add('expanded');
        }

        // Folder row
        const row = document.createElement('div');
        row.className = 'folder-tree-row';
        if (this.selectedItem?.type === 'folder' && this.selectedItem?.id === folder.id) {
            row.classList.add('selected');
        }

        // Expand/collapse toggle
        const toggle = document.createElement('span');
        toggle.className = 'folder-tree-toggle';
        toggle.innerHTML = isExpanded ? '&#9660;' : '&#9654;'; // Down/right arrow
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFolder(folder.id);
        });
        row.appendChild(toggle);

        // Folder icon
        const icon = document.createElement('span');
        icon.className = 'folder-tree-icon';
        icon.innerHTML = isExpanded ? '&#128194;' : '&#128193;'; // Open/closed folder
        row.appendChild(icon);

        // Folder name
        const name = document.createElement('span');
        name.className = 'folder-tree-name';
        name.textContent = folder.name;
        row.appendChild(name);

        // Lock icon if protected
        if (folder.protected) {
            const lock = document.createElement('span');
            lock.className = 'folder-tree-lock';
            lock.innerHTML = '&#128274;'; // Lock icon
            lock.title = t('password_protected') || 'Password protected';
            row.appendChild(lock);
        }

        // Event handlers
        row.addEventListener('click', () => this.handleSelect('folder', folder.id, folder));
        row.addEventListener('dblclick', () => this.toggleFolder(folder.id));
        this.addDoubleTapHandler(row, `folder:${folder.id}`, () => this.toggleFolder(folder.id)); // Mobile double-tap
        row.addEventListener('contextmenu', (e) => this.handleContextMenu(e, 'folder', folder.id, folder));

        li.appendChild(row);

        // Children container
        const childrenUl = document.createElement('ul');
        childrenUl.className = 'folder-tree-children';
        if (!isExpanded) {
            childrenUl.style.display = 'none';
        }

        // Render child folders
        if (folder.children && folder.children.length > 0) {
            folder.children.forEach(child => {
                childrenUl.appendChild(this.renderFolder(child));
            });
        }

        // Render quizzes in folder
        if (folder.quizzes && folder.quizzes.length > 0) {
            folder.quizzes.forEach(quiz => {
                childrenUl.appendChild(this.renderQuiz(quiz));
            });
        }

        // Empty folder indicator
        if ((!folder.children || folder.children.length === 0) &&
            (!folder.quizzes || folder.quizzes.length === 0)) {
            const empty = document.createElement('li');
            empty.className = 'folder-tree-empty-folder';
            empty.textContent = t('empty_folder') || '(empty)';
            childrenUl.appendChild(empty);
        }

        li.appendChild(childrenUl);

        return li;
    }

    /**
     * Render a quiz node
     */
    renderQuiz(quiz) {
        const li = document.createElement('li');
        li.className = 'folder-tree-item folder-tree-quiz';
        li.dataset.filename = quiz.filename;
        li.dataset.type = 'quiz';

        const row = document.createElement('div');
        row.className = 'folder-tree-row';
        if (this.selectedItem?.type === 'quiz' && this.selectedItem?.id === quiz.filename) {
            row.classList.add('selected');
        }

        // Indent spacer (no toggle for quizzes)
        const spacer = document.createElement('span');
        spacer.className = 'folder-tree-spacer';
        row.appendChild(spacer);

        // Quiz icon
        const icon = document.createElement('span');
        icon.className = 'folder-tree-icon';
        icon.innerHTML = '&#128196;'; // Document icon
        row.appendChild(icon);

        // Quiz name
        const name = document.createElement('span');
        name.className = 'folder-tree-name';
        name.textContent = quiz.displayName || quiz.filename.replace('.json', '');
        row.appendChild(name);

        // Lock icon if protected
        if (quiz.protected) {
            const lock = document.createElement('span');
            lock.className = 'folder-tree-lock';
            lock.innerHTML = '&#128274;'; // Lock icon
            lock.title = t('password_protected') || 'Password protected';
            row.appendChild(lock);
        }

        // Event handlers
        row.addEventListener('click', () => this.handleSelect('quiz', quiz.filename, quiz));
        row.addEventListener('dblclick', () => this.options.onDoubleClick('quiz', quiz.filename, quiz));
        this.addDoubleTapHandler(row, `quiz:${quiz.filename}`, () => this.options.onDoubleClick('quiz', quiz.filename, quiz)); // Mobile double-tap
        row.addEventListener('contextmenu', (e) => this.handleContextMenu(e, 'quiz', quiz.filename, quiz));

        li.appendChild(row);

        return li;
    }

    /**
     * Toggle folder expanded/collapsed state
     */
    toggleFolder(folderId) {
        if (this.expandedFolders.has(folderId)) {
            this.expandedFolders.delete(folderId);
        } else {
            this.expandedFolders.add(folderId);
        }

        this.saveExpandedState();
        this.render();
    }

    /**
     * Handle item selection
     */
    handleSelect(type, id, data) {
        // Remove previous selection
        const prevSelected = this.container.querySelector('.folder-tree-row.selected');
        if (prevSelected) {
            prevSelected.classList.remove('selected');
        }

        // Set new selection
        this.selectedItem = { type, id, data };

        // Find and mark new selection
        const selector = type === 'folder'
            ? `.folder-tree-folder[data-id="${id}"] > .folder-tree-row`
            : `.folder-tree-quiz[data-filename="${id}"] > .folder-tree-row`;
        const newSelected = this.container.querySelector(selector);
        if (newSelected) {
            newSelected.classList.add('selected');
        }

        this.options.onSelect(type, id, data);
    }

    /**
     * Handle context menu
     */
    handleContextMenu(e, type, id, data) {
        e.preventDefault();
        e.stopPropagation();

        // Also select the item
        this.handleSelect(type, id, data);

        this.options.onContextMenu(e, type, id, data);
    }

    /**
     * Save expanded state to localStorage
     */
    saveExpandedState() {
        try {
            const expanded = Array.from(this.expandedFolders);
            localStorage.setItem('folderTreeExpanded', JSON.stringify(expanded));
        } catch (error) {
            logger.warn('Failed to save folder tree state:', error);
        }
    }

    /**
     * Load expanded state from localStorage
     */
    loadExpandedState() {
        try {
            const stored = localStorage.getItem('folderTreeExpanded');
            if (stored) {
                const expanded = JSON.parse(stored);
                this.expandedFolders = new Set(expanded);
            }
        } catch (error) {
            logger.warn('Failed to load folder tree state:', error);
        }
    }

    /**
     * Expand all folders
     */
    expandAll() {
        const collectFolderIds = (folders) => {
            folders.forEach(folder => {
                this.expandedFolders.add(folder.id);
                if (folder.children) {
                    collectFolderIds(folder.children);
                }
            });
        };

        collectFolderIds(this.treeData.folders);
        this.saveExpandedState();
        this.render();
    }

    /**
     * Collapse all folders
     */
    collapseAll() {
        this.expandedFolders.clear();
        this.saveExpandedState();
        this.render();
    }

    /**
     * Get currently selected item
     */
    getSelection() {
        return this.selectedItem;
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedItem = null;
        const selected = this.container.querySelector('.folder-tree-row.selected');
        if (selected) {
            selected.classList.remove('selected');
        }
    }

    /**
     * Select an item programmatically
     */
    selectItem(type, id) {
        // Find the item data in tree
        const findItem = (type, id, folders, quizzes) => {
            if (type === 'quiz') {
                const quiz = quizzes.find(q => q.filename === id);
                if (quiz) return quiz;

                for (const folder of folders) {
                    if (folder.quizzes) {
                        const quiz = folder.quizzes.find(q => q.filename === id);
                        if (quiz) return quiz;
                    }
                    if (folder.children) {
                        const result = findItem(type, id, folder.children, []);
                        if (result) return result;
                    }
                }
            } else if (type === 'folder') {
                const folder = folders.find(f => f.id === id);
                if (folder) return folder;

                for (const folder of folders) {
                    if (folder.children) {
                        const result = findItem(type, id, folder.children, []);
                        if (result) return result;
                    }
                }
            }
            return null;
        };

        const data = findItem(type, id, this.treeData.folders, this.treeData.quizzes);
        if (data) {
            this.handleSelect(type, id, data);
        }
    }
}

export default FolderTree;
