/**
 * Offline Storage Service
 *
 * Provides IndexedDB-based storage for offline quiz creation.
 * Quizzes created offline are queued for sync when back online.
 *
 * Features:
 * - Store quizzes locally in IndexedDB
 * - Queue failed saves for background sync
 * - Automatic sync when connection restored
 * - Conflict resolution for offline edits
 */

import { logger } from '../core/config.js';

const DB_NAME = 'quizix-offline';
const DB_VERSION = 1;
const STORES = {
    QUIZZES: 'offline-quizzes',
    SYNC_QUEUE: 'sync-queue',
    DRAFTS: 'quiz-drafts'
};

class OfflineStorageService {
    constructor() {
        this.db = null;
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;

        // Listen for online/offline events
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        // Initialize database
        this.init();
    }

    /**
     * Initialize IndexedDB database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                logger.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                logger.debug('IndexedDB initialized successfully');
                resolve();

                // Attempt sync if online
                if (this.isOnline) {
                    this.syncQueue();
                }
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Offline quizzes store
                if (!db.objectStoreNames.contains(STORES.QUIZZES)) {
                    const quizStore = db.createObjectStore(STORES.QUIZZES, { keyPath: 'id' });
                    quizStore.createIndex('title', 'title', { unique: false });
                    quizStore.createIndex('created', 'created', { unique: false });
                    quizStore.createIndex('synced', 'synced', { unique: false });
                }

                // Sync queue store
                if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                    syncStore.createIndex('action', 'action', { unique: false });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Draft quizzes store (for auto-save)
                if (!db.objectStoreNames.contains(STORES.DRAFTS)) {
                    db.createObjectStore(STORES.DRAFTS, { keyPath: 'id' });
                }

                logger.debug('IndexedDB schema created');
            };
        });
    }

    /**
     * Handle coming online
     */
    handleOnline() {
        this.isOnline = true;
        logger.info('Network connection restored');
        this.syncQueue();
    }

    /**
     * Handle going offline
     */
    handleOffline() {
        this.isOnline = false;
        logger.info('Network connection lost - entering offline mode');
    }

    /**
     * Save quiz to local storage
     * @param {Object} quiz - Quiz data to save
     * @returns {Promise<Object>} - Saved quiz with local ID
     */
    async saveQuizLocally(quiz) {
        await this.ensureDb();

        const localQuiz = {
            ...quiz,
            id: quiz.id || this.generateId(),
            created: quiz.created || new Date().toISOString(),
            lastModified: new Date().toISOString(),
            synced: false
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.QUIZZES], 'readwrite');
            const store = transaction.objectStore(STORES.QUIZZES);

            const request = store.put(localQuiz);

            request.onsuccess = () => {
                logger.debug('Quiz saved locally:', localQuiz.id);

                // Queue for sync if online
                if (this.isOnline) {
                    this.addToSyncQueue('save-quiz', localQuiz);
                }

                resolve(localQuiz);
            };

            request.onerror = () => {
                logger.error('Failed to save quiz locally:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get all locally stored quizzes
     * @returns {Promise<Array>} - Array of quizzes
     */
    async getLocalQuizzes() {
        await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.QUIZZES], 'readonly');
            const store = transaction.objectStore(STORES.QUIZZES);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                logger.error('Failed to get local quizzes:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get a specific local quiz by ID
     * @param {string} id - Quiz ID
     * @returns {Promise<Object|null>} - Quiz data or null
     */
    async getLocalQuiz(id) {
        await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.QUIZZES], 'readonly');
            const store = transaction.objectStore(STORES.QUIZZES);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = () => {
                logger.error('Failed to get local quiz:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Delete a local quiz
     * @param {string} id - Quiz ID
     * @returns {Promise<void>}
     */
    async deleteLocalQuiz(id) {
        await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.QUIZZES], 'readwrite');
            const store = transaction.objectStore(STORES.QUIZZES);
            const request = store.delete(id);

            request.onsuccess = () => {
                logger.debug('Local quiz deleted:', id);
                resolve();
            };

            request.onerror = () => {
                logger.error('Failed to delete local quiz:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Save quiz draft (auto-save)
     * @param {string} id - Draft ID
     * @param {Object} draft - Draft data
     */
    async saveDraft(id, draft) {
        await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.DRAFTS], 'readwrite');
            const store = transaction.objectStore(STORES.DRAFTS);

            const draftData = {
                id,
                data: draft,
                timestamp: new Date().toISOString()
            };

            const request = store.put(draftData);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                logger.error('Failed to save draft:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get quiz draft
     * @param {string} id - Draft ID
     * @returns {Promise<Object|null>} - Draft data or null
     */
    async getDraft(id) {
        await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.DRAFTS], 'readonly');
            const store = transaction.objectStore(STORES.DRAFTS);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result?.data || null);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Add action to sync queue
     * @param {string} action - Action type
     * @param {Object} data - Action data
     */
    async addToSyncQueue(action, data) {
        await this.ensureDb();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.SYNC_QUEUE], 'readwrite');
            const store = transaction.objectStore(STORES.SYNC_QUEUE);

            const queueItem = {
                action,
                data,
                timestamp: new Date().toISOString(),
                retries: 0
            };

            const request = store.add(queueItem);

            request.onsuccess = () => {
                logger.debug('Added to sync queue:', action);

                // Trigger sync if online
                if (this.isOnline && !this.syncInProgress) {
                    this.syncQueue();
                }

                resolve();
            };

            request.onerror = () => {
                logger.error('Failed to add to sync queue:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Process sync queue
     */
    async syncQueue() {
        if (this.syncInProgress || !this.isOnline) {
            return;
        }

        this.syncInProgress = true;
        logger.info('Starting sync queue processing');

        try {
            await this.ensureDb();

            const transaction = this.db.transaction([STORES.SYNC_QUEUE], 'readonly');
            const store = transaction.objectStore(STORES.SYNC_QUEUE);
            const request = store.getAll();

            request.onsuccess = async () => {
                const queue = request.result || [];

                for (const item of queue) {
                    try {
                        await this.processQueueItem(item);
                        await this.removeFromQueue(item.id);
                    } catch (error) {
                        logger.warn('Sync failed for item:', item.id, error);
                        await this.incrementRetry(item);
                    }
                }

                logger.info('Sync queue processing complete');
            };
        } catch (error) {
            logger.error('Sync queue processing failed:', error);
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Process a single queue item
     * @param {Object} item - Queue item
     */
    async processQueueItem(item) {
        switch (item.action) {
            case 'save-quiz':
                const response = await fetch('/api/save-quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: item.data.title,
                        questions: item.data.questions
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                // Mark local quiz as synced
                await this.markAsSynced(item.data.id);
                logger.info('Quiz synced to server:', item.data.title);
                break;

            default:
                logger.warn('Unknown sync action:', item.action);
        }
    }

    /**
     * Mark a local quiz as synced
     * @param {string} id - Quiz ID
     */
    async markAsSynced(id) {
        await this.ensureDb();

        const quiz = await this.getLocalQuiz(id);
        if (quiz) {
            quiz.synced = true;
            quiz.syncedAt = new Date().toISOString();

            const transaction = this.db.transaction([STORES.QUIZZES], 'readwrite');
            const store = transaction.objectStore(STORES.QUIZZES);
            store.put(quiz);
        }
    }

    /**
     * Remove item from sync queue
     * @param {number} id - Queue item ID
     */
    async removeFromQueue(id) {
        await this.ensureDb();

        return new Promise((resolve) => {
            const transaction = this.db.transaction([STORES.SYNC_QUEUE], 'readwrite');
            const store = transaction.objectStore(STORES.SYNC_QUEUE);
            store.delete(id);
            resolve();
        });
    }

    /**
     * Increment retry count for queue item
     * @param {Object} item - Queue item
     */
    async incrementRetry(item) {
        await this.ensureDb();

        const MAX_RETRIES = 5;
        item.retries = (item.retries || 0) + 1;

        if (item.retries >= MAX_RETRIES) {
            logger.error('Max retries reached, removing from queue:', item.action);
            await this.removeFromQueue(item.id);
            return;
        }

        const transaction = this.db.transaction([STORES.SYNC_QUEUE], 'readwrite');
        const store = transaction.objectStore(STORES.SYNC_QUEUE);
        store.put(item);
    }

    /**
     * Ensure database is initialized
     */
    async ensureDb() {
        if (!this.db) {
            await this.init();
        }
    }

    /**
     * Generate unique ID
     * @returns {string} - UUID-like string
     */
    generateId() {
        return 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get pending sync count
     * @returns {Promise<number>} - Number of pending items
     */
    async getPendingSyncCount() {
        await this.ensureDb();

        return new Promise((resolve) => {
            const transaction = this.db.transaction([STORES.SYNC_QUEUE], 'readonly');
            const store = transaction.objectStore(STORES.SYNC_QUEUE);
            const request = store.count();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                resolve(0);
            };
        });
    }

    /**
     * Check if offline mode is active
     * @returns {boolean}
     */
    isOffline() {
        return !this.isOnline;
    }

    /**
     * Get storage usage info
     * @returns {Promise<Object>} - Storage info
     */
    async getStorageInfo() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage,
                quota: estimate.quota,
                usagePercentage: Math.round((estimate.usage / estimate.quota) * 100)
            };
        }
        return { usage: 0, quota: 0, usagePercentage: 0 };
    }

    /**
     * Clear all offline data
     */
    async clearAll() {
        await this.ensureDb();

        const transaction = this.db.transaction(
            [STORES.QUIZZES, STORES.SYNC_QUEUE, STORES.DRAFTS],
            'readwrite'
        );

        transaction.objectStore(STORES.QUIZZES).clear();
        transaction.objectStore(STORES.SYNC_QUEUE).clear();
        transaction.objectStore(STORES.DRAFTS).clear();

        logger.info('All offline data cleared');
    }
}

// Export singleton instance
export const offlineStorage = new OfflineStorageService();
