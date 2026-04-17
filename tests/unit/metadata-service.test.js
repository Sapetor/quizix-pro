/**
 * Metadata Service Tests
 */

const { MetadataService } = require('../../services/metadata-service');
const fs = require('fs').promises;
const path = require('path');

// Mock fs module
jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
        readFile: jest.fn(),
        readdir: jest.fn(),
        access: jest.fn(),
        mkdir: jest.fn()
    }
}));

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

const mockWslMonitor = {
    trackFileOperation: jest.fn((fn) => fn())
};

describe('MetadataService', () => {
    let metadataService;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        metadataService = new MetadataService(mockLogger, mockWslMonitor, 'quizzes');
    });

    afterEach(() => {
        if (metadataService.tokenCleanupInterval) {
            clearInterval(metadataService.tokenCleanupInterval);
        }
        jest.useRealTimers();
    });

    describe('initialize', () => {
        test('should create new metadata file if not exists', async () => {
            fs.access.mockRejectedValueOnce({ code: 'ENOENT' }); // quizzes dir
            fs.mkdir.mockResolvedValue();
            fs.readFile.mockRejectedValueOnce({ code: 'ENOENT' }); // metadata file
            fs.writeFile.mockResolvedValue();
            fs.readdir.mockResolvedValue([]);

            await metadataService.initialize();

            expect(metadataService.metadata).toBeDefined();
            expect(metadataService.metadata.version).toBe('1.0');
            expect(metadataService.metadata.folders).toEqual({});
            expect(metadataService.metadata.quizzes).toEqual({});
        });

        test('should load existing metadata file', async () => {
            const existingMetadata = {
                version: '1.0',
                folders: { 'folder-1': { id: 'folder-1', name: 'Test Folder' } },
                quizzes: { 'quiz.json': { displayName: 'Test Quiz' } }
            };

            fs.access.mockResolvedValue();
            fs.readFile.mockResolvedValue(JSON.stringify(existingMetadata));

            await metadataService.initialize();

            expect(metadataService.metadata).toEqual(existingMetadata);
        });

        test('should migrate existing quizzes on first run', async () => {
            fs.access.mockResolvedValue();
            fs.readFile.mockRejectedValueOnce({ code: 'ENOENT' }); // No metadata
            fs.writeFile.mockResolvedValue();
            fs.readdir.mockResolvedValue(['quiz1.json', 'quiz2.json', 'quiz-metadata.json']);
            fs.readFile.mockResolvedValue(JSON.stringify({ title: 'Test Quiz', created: '2024-01-01' }));

            await metadataService.initialize();

            // Should migrate quiz1.json and quiz2.json (not quiz-metadata.json)
            expect(Object.keys(metadataService.metadata.quizzes).length).toBe(2);
        });
    });

    describe('validateFolderName', () => {
        beforeEach(async () => {
            metadataService.metadata = { version: '1.0', folders: {}, quizzes: {} };
        });

        test('should accept valid folder names', () => {
            expect(() => metadataService.validateFolderName('My Folder')).not.toThrow();
            expect(() => metadataService.validateFolderName('Folder-123')).not.toThrow();
            expect(() => metadataService.validateFolderName('日本語')).not.toThrow();
        });

        test('should reject empty names', () => {
            // Empty string is falsy, triggers "required" check
            expect(() => metadataService.validateFolderName('')).toThrow('Folder name is required');
            // Whitespace-only passes first check, triggers "cannot be empty"
            expect(() => metadataService.validateFolderName('   ')).toThrow('Folder name cannot be empty');
        });

        test('should reject null/undefined', () => {
            expect(() => metadataService.validateFolderName(null)).toThrow('Folder name is required');
            expect(() => metadataService.validateFolderName(undefined)).toThrow('Folder name is required');
        });

        test('should reject names exceeding 100 characters', () => {
            const longName = 'a'.repeat(101);
            expect(() => metadataService.validateFolderName(longName)).toThrow('must be less than 100 characters');
        });

        test('should reject invalid characters', () => {
            expect(() => metadataService.validateFolderName('Folder<test>')).toThrow('contains invalid characters');
            expect(() => metadataService.validateFolderName('Folder:test')).toThrow('contains invalid characters');
            expect(() => metadataService.validateFolderName('Folder|test')).toThrow('contains invalid characters');
        });
    });

    describe('createFolder', () => {
        beforeEach(async () => {
            metadataService.metadata = { version: '1.0', folders: {}, quizzes: {} };
            fs.writeFile.mockResolvedValue();
        });

        test('should create folder at root level', async () => {
            const folder = await metadataService.createFolder('Test Folder');

            expect(folder.name).toBe('Test Folder');
            expect(folder.parentId).toBeNull();
            expect(folder.id).toBeDefined();
            expect(metadataService.metadata.folders[folder.id]).toBeDefined();
        });

        test('should create nested folder', async () => {
            const parent = await metadataService.createFolder('Parent');
            const child = await metadataService.createFolder('Child', parent.id);

            expect(child.parentId).toBe(parent.id);
        });

        test('should reject duplicate names in same parent', async () => {
            await metadataService.createFolder('Test');

            await expect(metadataService.createFolder('Test'))
                .rejects.toThrow('already exists');
        });

        test('should allow same name in different parents', async () => {
            const parent1 = await metadataService.createFolder('Parent1');
            const parent2 = await metadataService.createFolder('Parent2');

            await metadataService.createFolder('Child', parent1.id);
            const child2 = await metadataService.createFolder('Child', parent2.id);

            expect(child2.name).toBe('Child');
        });

        test('should reject non-existent parent', async () => {
            await expect(metadataService.createFolder('Test', 'non-existent-id'))
                .rejects.toThrow('Parent folder not found');
        });
    });

    describe('renameFolder', () => {
        beforeEach(async () => {
            metadataService.metadata = { version: '1.0', folders: {}, quizzes: {} };
            fs.writeFile.mockResolvedValue();
        });

        test('should rename existing folder', async () => {
            const folder = await metadataService.createFolder('OldName');
            const renamed = await metadataService.renameFolder(folder.id, 'NewName');

            expect(renamed.name).toBe('NewName');
        });

        test('should reject non-existent folder', async () => {
            await expect(metadataService.renameFolder('non-existent', 'NewName'))
                .rejects.toThrow('Folder not found');
        });

        test('should reject duplicate names', async () => {
            const folder1 = await metadataService.createFolder('Folder1');
            await metadataService.createFolder('Folder2');

            await expect(metadataService.renameFolder(folder1.id, 'Folder2'))
                .rejects.toThrow('already exists');
        });
    });

    describe('moveFolder', () => {
        beforeEach(async () => {
            metadataService.metadata = { version: '1.0', folders: {}, quizzes: {} };
            fs.writeFile.mockResolvedValue();
        });

        test('should move folder to different parent', async () => {
            const parent1 = await metadataService.createFolder('Parent1');
            const parent2 = await metadataService.createFolder('Parent2');
            const child = await metadataService.createFolder('Child', parent1.id);

            const moved = await metadataService.moveFolder(child.id, parent2.id);

            expect(moved.parentId).toBe(parent2.id);
        });

        test('should move folder to root', async () => {
            const parent = await metadataService.createFolder('Parent');
            const child = await metadataService.createFolder('Child', parent.id);

            const moved = await metadataService.moveFolder(child.id, null);

            expect(moved.parentId).toBeNull();
        });

        test('should reject moving folder into itself', async () => {
            const folder = await metadataService.createFolder('Folder');

            await expect(metadataService.moveFolder(folder.id, folder.id))
                .rejects.toThrow('Cannot move folder into itself');
        });

        test('should reject moving folder into descendant', async () => {
            const parent = await metadataService.createFolder('Parent');
            const child = await metadataService.createFolder('Child', parent.id);
            const grandchild = await metadataService.createFolder('Grandchild', child.id);

            await expect(metadataService.moveFolder(parent.id, grandchild.id))
                .rejects.toThrow('Cannot move folder into its own descendant');
        });
    });

    describe('deleteFolder', () => {
        beforeEach(async () => {
            metadataService.metadata = { version: '1.0', folders: {}, quizzes: {} };
            fs.writeFile.mockResolvedValue();
        });

        test('should delete empty folder', async () => {
            const folder = await metadataService.createFolder('Test');
            const result = await metadataService.deleteFolder(folder.id);

            expect(result.success).toBe(true);
            expect(metadataService.metadata.folders[folder.id]).toBeUndefined();
        });

        test('should reject deleting non-empty folder without flag', async () => {
            const folder = await metadataService.createFolder('Parent');
            await metadataService.createFolder('Child', folder.id);

            await expect(metadataService.deleteFolder(folder.id))
                .rejects.toThrow('not empty');
        });

        test('should delete non-empty folder with deleteContents=true', async () => {
            const folder = await metadataService.createFolder('Parent');
            const child = await metadataService.createFolder('Child', folder.id);

            const result = await metadataService.deleteFolder(folder.id, true);

            expect(result.success).toBe(true);
            expect(metadataService.metadata.folders[folder.id]).toBeUndefined();
            expect(metadataService.metadata.folders[child.id]).toBeUndefined();
        });

        test('should reject non-existent folder', async () => {
            await expect(metadataService.deleteFolder('non-existent'))
                .rejects.toThrow('Folder not found');
        });
    });

    describe('isDescendant', () => {
        beforeEach(async () => {
            metadataService.metadata = { version: '1.0', folders: {}, quizzes: {} };
            fs.writeFile.mockResolvedValue();
        });

        test('should return true for direct child', async () => {
            const parent = await metadataService.createFolder('Parent');
            const child = await metadataService.createFolder('Child', parent.id);

            expect(metadataService.isDescendant(child.id, parent.id)).toBe(true);
        });

        test('should return true for grandchild', async () => {
            const parent = await metadataService.createFolder('Parent');
            const child = await metadataService.createFolder('Child', parent.id);
            const grandchild = await metadataService.createFolder('Grandchild', child.id);

            expect(metadataService.isDescendant(grandchild.id, parent.id)).toBe(true);
        });

        test('should return false for unrelated folders', async () => {
            const folder1 = await metadataService.createFolder('Folder1');
            const folder2 = await metadataService.createFolder('Folder2');

            expect(metadataService.isDescendant(folder1.id, folder2.id)).toBe(false);
        });

        test('should return false for parent-child reversed', async () => {
            const parent = await metadataService.createFolder('Parent');
            const child = await metadataService.createFolder('Child', parent.id);

            expect(metadataService.isDescendant(parent.id, child.id)).toBe(false);
        });
    });

    describe('session tokens', () => {
        beforeEach(() => {
            metadataService.sessionTokens.clear();
        });

        test('should clean up expired tokens', () => {
            // Add expired token
            metadataService.sessionTokens.set('expired-token', {
                itemId: 'quiz-1',
                itemType: 'quiz',
                expiresAt: Date.now() - 1000 // Already expired
            });

            // Add valid token
            metadataService.sessionTokens.set('valid-token', {
                itemId: 'quiz-2',
                itemType: 'quiz',
                expiresAt: Date.now() + 60000 // Still valid
            });

            metadataService.cleanupExpiredTokens();

            expect(metadataService.sessionTokens.has('expired-token')).toBe(false);
            expect(metadataService.sessionTokens.has('valid-token')).toBe(true);
        });
    });

    describe('rate limiting', () => {
        beforeEach(() => {
            metadataService.unlockAttempts.clear();
        });

        test('should track unlock attempts per IP', () => {
            const ip = '192.168.1.1';

            // Simulate multiple attempts
            metadataService.unlockAttempts.set(ip, {
                count: 4,
                windowStart: Date.now()
            });

            const attempts = metadataService.unlockAttempts.get(ip);
            expect(attempts.count).toBe(4);
        });
    });

    describe('quiz password ownership and visibility', () => {
        beforeEach(() => {
            metadataService.metadata = {
                version: '1.0',
                folders: {},
                quizzes: {
                    'owned-protected.json': {
                        displayName: 'Owned Protected',
                        folderId: null,
                        passwordHash: 'hash',
                        ownerId: 'user-1',
                        visibility: 'public',
                        created: '2026-01-01',
                        sortOrder: 0
                    },
                    'legacy-protected.json': {
                        displayName: 'Legacy Protected',
                        folderId: null,
                        passwordHash: 'hash',
                        ownerId: null,
                        visibility: 'public',
                        created: '2026-01-01',
                        sortOrder: 1
                    },
                    'public-open.json': {
                        displayName: 'Public Open',
                        folderId: null,
                        passwordHash: null,
                        ownerId: null,
                        visibility: 'public',
                        created: '2026-01-01',
                        sortOrder: 2
                    }
                }
            };
            fs.writeFile.mockResolvedValue();
        });

        test('setQuizPassword requires an authenticated owner', async () => {
            await expect(metadataService.setQuizPassword('owned-protected.json', 'secret'))
                .rejects.toThrow('Authentication required');

            await expect(metadataService.setQuizPassword('legacy-protected.json', 'secret', 'user-1'))
                .rejects.toThrow('Only account-owned quizzes can use passwords');

            await expect(metadataService.setQuizPassword('owned-protected.json', 'secret', 'user-2'))
                .rejects.toThrow('You do not own this quiz');
        });

        test('setQuizPassword allows any user to clear a legacy ownerless hash', async () => {
            const result = await metadataService.setQuizPassword('legacy-protected.json', null, 'user-2');

            expect(result).toEqual({ success: true, protected: false });
            expect(metadataService.metadata.quizzes['legacy-protected.json'].passwordHash).toBeNull();
        });

        test('setQuizPassword allows the owner to update protection', async () => {
            const result = await metadataService.setQuizPassword('owned-protected.json', 'new-secret', 'user-1');

            expect(result).toEqual({ success: true, protected: true });
            expect(metadataService.metadata.quizzes['owned-protected.json'].passwordHash).toBeTruthy();
        });

        test('owned protected quizzes are visible to all users (but locked)', () => {
            expect(metadataService.isQuizVisibleToUser('owned-protected.json', null)).toBe(true);
            expect(metadataService.isQuizVisibleToUser('owned-protected.json', 'user-2')).toBe(true);
            expect(metadataService.isQuizVisibleToUser('owned-protected.json', 'user-1')).toBe(true);
        });

        test('legacy protected quizzes remain visible to anonymous users', () => {
            expect(metadataService.isQuizVisibleToUser('legacy-protected.json', null)).toBe(true);
            expect(metadataService.isQuizVisibleToUser('legacy-protected.json', 'user-2')).toBe(true);
        });

        test('requiresAuth is skipped for the owner of a protected quiz', () => {
            expect(metadataService.requiresAuth('owned-protected.json', 'quiz', null)).toBe(true);
            expect(metadataService.requiresAuth('owned-protected.json', 'quiz', 'user-2')).toBe(true);
            expect(metadataService.requiresAuth('owned-protected.json', 'quiz', 'user-1')).toBe(false);
        });

        test('legacy anonymous quiz passwords are not enforced', () => {
            expect(metadataService.requiresAuth('legacy-protected.json', 'quiz', null)).toBe(false);
            expect(metadataService.requiresAuth('legacy-protected.json', 'quiz', 'user-2')).toBe(false);
        });

        test('setFolderPassword requires authentication', async () => {
            metadataService.metadata.folders['folder-1'] = {
                id: 'folder-1', name: 'Test', parentId: null,
                passwordHash: null, passwordSetBy: null,
                created: '2026-01-01', sortOrder: 0
            };

            await expect(metadataService.setFolderPassword('folder-1', 'secret'))
                .rejects.toThrow('Authentication required');
        });

        test('setFolderPassword records who locked the folder', async () => {
            metadataService.metadata.folders['folder-1'] = {
                id: 'folder-1', name: 'Test', parentId: null,
                passwordHash: null, passwordSetBy: null,
                created: '2026-01-01', sortOrder: 0
            };

            await metadataService.setFolderPassword('folder-1', 'secret', 'user-1');
            expect(metadataService.metadata.folders['folder-1'].passwordSetBy).toBe('user-1');
        });

        test('setFolderPassword rejects a different user', async () => {
            metadataService.metadata.folders['folder-1'] = {
                id: 'folder-1', name: 'Test', parentId: null,
                passwordHash: 'hash', passwordSetBy: 'user-1',
                created: '2026-01-01', sortOrder: 0
            };

            await expect(metadataService.setFolderPassword('folder-1', 'new-pw', 'user-2'))
                .rejects.toThrow('Only the user who locked this folder');
        });

        test('setFolderPassword rejects changes to legacy folders without passwordSetBy', async () => {
            metadataService.metadata.folders['folder-1'] = {
                id: 'folder-1', name: 'Legacy', parentId: null,
                passwordHash: 'hash',
                created: '2026-01-01', sortOrder: 0
            };

            await expect(metadataService.setFolderPassword('folder-1', 'new-pw', 'user-1'))
                .rejects.toThrow('Only the user who locked this folder');
        });

        test('setFolderPassword allows the same user to update', async () => {
            metadataService.metadata.folders['folder-1'] = {
                id: 'folder-1', name: 'Test', parentId: null,
                passwordHash: 'hash', passwordSetBy: 'user-1',
                created: '2026-01-01', sortOrder: 0
            };

            const result = await metadataService.setFolderPassword('folder-1', 'new-pw', 'user-1');
            expect(result).toEqual({ success: true, protected: true });
        });

        test('setFolderPassword clears passwordSetBy on removal', async () => {
            metadataService.metadata.folders['folder-1'] = {
                id: 'folder-1', name: 'Test', parentId: null,
                passwordHash: 'hash', passwordSetBy: 'user-1',
                created: '2026-01-01', sortOrder: 0
            };

            await metadataService.setFolderPassword('folder-1', null, 'user-1');
            expect(metadataService.metadata.folders['folder-1'].passwordHash).toBeNull();
            expect(metadataService.metadata.folders['folder-1'].passwordSetBy).toBeNull();
        });

        test('folder-protected quizzes are hidden from anonymous users', () => {
            metadataService.metadata.folders['folder-1'] = {
                id: 'folder-1',
                name: 'Protected Folder',
                parentId: null,
                passwordHash: 'folder-hash',
                created: '2026-01-01',
                sortOrder: 0
            };
            metadataService.metadata.quizzes['public-open.json'].folderId = 'folder-1';

            expect(metadataService.isQuizVisibleToUser('public-open.json', null)).toBe(false);
            expect(metadataService.isQuizVisibleToUser('public-open.json', 'user-2')).toBe(true);
        });
    });
});
