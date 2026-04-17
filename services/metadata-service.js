/**
 * Metadata Service
 * Handles quiz file organization with virtual folders and password protection.
 * Uses a JSON metadata file for virtual folder structure while physical quiz files remain flat.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Password hashing constants
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const HASH_ALGORITHM = 'sha512';

// Session token constants
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_LENGTH = 32;

// Rate limiting constants
const MAX_UNLOCK_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

class MetadataService {
    constructor(logger, wslMonitor, quizzesDir = 'quizzes') {
        this.logger = logger;
        this.wslMonitor = wslMonitor;
        this.quizzesDir = quizzesDir;
        this.metadataPath = path.join(quizzesDir, 'quiz-metadata.json');
        this.metadata = null;
        this.sessionTokens = new Map(); // token -> { itemId, itemType, expiresAt }
        this.unlockAttempts = new Map(); // ip -> { count, windowStart }
    }

    /**
     * Initialize the metadata service - load or create metadata file
     */
    async initialize() {
        try {
            // Ensure quizzes directory exists
            await fs.mkdir(this.quizzesDir, { recursive: true });

            // Try to load existing metadata
            try {
                const data = await this.wslMonitor.trackFileOperation(
                    () => fs.readFile(this.metadataPath, 'utf8'),
                    'Load quiz metadata'
                );
                this.metadata = JSON.parse(data);
                this.logger.info(`Loaded quiz metadata: ${Object.keys(this.metadata.folders).length} folders, ${Object.keys(this.metadata.quizzes).length} quizzes`);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // Create new metadata file
                    this.metadata = {
                        version: '1.0',
                        folders: {},
                        quizzes: {}
                    };
                    await this.saveMetadata();
                    this.logger.info('Created new quiz metadata file');

                    // Migrate existing quizzes
                    await this.migrateExistingQuizzes();
                } else {
                    throw error;
                }
            }

            // Seed demo quizzes on first boot (when no quizzes exist)
            if (Object.keys(this.metadata.quizzes).length === 0) {
                await this.seedDemoQuizzes();
            }

            // Start token cleanup interval
            this.tokenCleanupInterval = setInterval(() => this.cleanupExpiredTokens(), 5 * 60 * 1000);

            return this.metadata;
        } catch (error) {
            this.logger.error('Failed to initialize metadata service:', error);
            throw error;
        }
    }

    /**
     * Migrate existing quiz files into metadata
     */
    async migrateExistingQuizzes() {
        try {
            const files = await fs.readdir(this.quizzesDir);
            const quizFiles = files.filter(f => f.endsWith('.json') && f !== 'quiz-metadata.json');

            for (const filename of quizFiles) {
                if (!this.metadata.quizzes[filename]) {
                    try {
                        const quizPath = path.join(this.quizzesDir, filename);
                        const quizData = JSON.parse(await fs.readFile(quizPath, 'utf8'));

                        this.metadata.quizzes[filename] = {
                            displayName: quizData.title || filename.replace('.json', ''),
                            folderId: null, // Root level
                            passwordHash: null,
                            created: quizData.created || new Date().toISOString(),
                            sortOrder: Object.keys(this.metadata.quizzes).length
                        };
                    } catch (error) {
                        this.logger.warn(`Failed to migrate quiz ${filename}:`, error.message);
                    }
                }
            }

            await this.saveMetadata();
            this.logger.info(`Migrated ${quizFiles.length} existing quizzes to metadata`);
        } catch (error) {
            this.logger.error('Failed to migrate existing quizzes:', error);
        }
    }

    /**
     * Seed demo quizzes on first boot when no quizzes exist
     */
    async seedDemoQuizzes() {
        const seedDir = path.join(__dirname, '..', 'seeds', 'demo-quizzes');
        try {
            const files = await fs.readdir(seedDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            if (jsonFiles.length === 0) {
                this.logger.warn('No demo quiz seed files found');
                return;
            }

            // Create "Demo Quizzes" folder
            const folderId = uuidv4();
            this.metadata.folders[folderId] = {
                id: folderId,
                name: 'Demo Quizzes',
                parentId: null,
                passwordHash: null,
                created: new Date().toISOString(),
                sortOrder: 0
            };

            // Copy each seed file to quizzes/ and register in metadata
            for (let i = 0; i < jsonFiles.length; i++) {
                const filename = jsonFiles[i];
                const src = path.join(seedDir, filename);
                const dest = path.join(this.quizzesDir, filename);

                await fs.copyFile(src, dest);

                const quizData = JSON.parse(await fs.readFile(dest, 'utf8'));
                this.metadata.quizzes[filename] = {
                    displayName: quizData.title || filename.replace('.json', ''),
                    folderId,
                    passwordHash: null,
                    created: quizData.created || new Date().toISOString(),
                    sortOrder: i
                };
            }

            await this.saveMetadata();
            this.logger.info(`Seeded ${jsonFiles.length} demo quizzes in "Demo Quizzes" folder`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.debug('No seeds/demo-quizzes directory found, skipping demo seeding');
            } else {
                this.logger.warn('Failed to seed demo quizzes:', error.message);
            }
        }
    }

    /**
     * Save metadata to file
     */
    async saveMetadata() {
        await this.wslMonitor.trackFileOperation(
            () => fs.writeFile(this.metadataPath, JSON.stringify(this.metadata, null, 2), 'utf8'),
            'Save quiz metadata'
        );
    }

    // ============================================================================
    // Folder Operations
    // ============================================================================

    /**
     * Create a new folder
     */
    async createFolder(name, parentId = null) {
        this.validateFolderName(name);

        if (parentId && !this.metadata.folders[parentId]) {
            const err = new Error('Parent folder not found');
            err.messageKey = 'error_folder_not_found';
            throw err;
        }

        // Check for duplicate names in same parent
        const siblings = Object.values(this.metadata.folders)
            .filter(f => f.parentId === parentId);
        if (siblings.some(f => f.name.toLowerCase() === name.toLowerCase())) {
            const err = new Error('A folder with this name already exists');
            err.messageKey = 'error_folder_name_exists';
            throw err;
        }

        const id = uuidv4();
        const folder = {
            id,
            name,
            parentId,
            passwordHash: null,
            created: new Date().toISOString(),
            sortOrder: siblings.length
        };

        this.metadata.folders[id] = folder;
        await this.saveMetadata();

        this.logger.debug(`Created folder: ${name} (${id})`);
        return folder;
    }

    /**
     * Rename a folder
     */
    async renameFolder(folderId, newName) {
        this.validateFolderName(newName);

        const folder = this.metadata.folders[folderId];
        if (!folder) {
            const err = new Error('Folder not found');
            err.messageKey = 'error_folder_not_found';
            throw err;
        }

        // Check for duplicate names in same parent
        const siblings = Object.values(this.metadata.folders)
            .filter(f => f.parentId === folder.parentId && f.id !== folderId);
        if (siblings.some(f => f.name.toLowerCase() === newName.toLowerCase())) {
            const err = new Error('A folder with this name already exists');
            err.messageKey = 'error_folder_name_exists';
            throw err;
        }

        folder.name = newName;
        await this.saveMetadata();

        this.logger.debug(`Renamed folder ${folderId} to: ${newName}`);
        return folder;
    }

    /**
     * Move a folder to a different parent
     */
    async moveFolder(folderId, newParentId) {
        const folder = this.metadata.folders[folderId];
        if (!folder) {
            const err = new Error('Folder not found');
            err.messageKey = 'error_folder_not_found';
            throw err;
        }

        if (newParentId !== null && !this.metadata.folders[newParentId]) {
            const err = new Error('Target folder not found');
            err.messageKey = 'error_target_folder_not_found';
            throw err;
        }

        // Prevent moving to self or descendant
        if (newParentId === folderId) {
            const err = new Error('Cannot move folder into itself');
            err.messageKey = 'error_folder_move_self';
            throw err;
        }

        if (newParentId && this.isDescendant(newParentId, folderId)) {
            const err = new Error('Cannot move folder into its own descendant');
            err.messageKey = 'error_folder_move_descendant';
            throw err;
        }

        // Check for duplicate names in target
        const siblings = Object.values(this.metadata.folders)
            .filter(f => f.parentId === newParentId && f.id !== folderId);
        if (siblings.some(f => f.name.toLowerCase() === folder.name.toLowerCase())) {
            const err = new Error('A folder with this name already exists in the target location');
            err.messageKey = 'error_folder_name_exists';
            throw err;
        }

        folder.parentId = newParentId;
        folder.sortOrder = siblings.length;
        await this.saveMetadata();

        this.logger.debug(`Moved folder ${folderId} to parent: ${newParentId}`);
        return folder;
    }

    /**
     * Delete a folder and optionally its contents
     */
    async deleteFolder(folderId, deleteContents = false) {
        const folder = this.metadata.folders[folderId];
        if (!folder) {
            const err = new Error('Folder not found');
            err.messageKey = 'error_folder_not_found';
            throw err;
        }

        // Get all contents
        const childFolders = Object.values(this.metadata.folders)
            .filter(f => f.parentId === folderId);
        const childQuizzes = Object.entries(this.metadata.quizzes)
            .filter(([_, q]) => q.folderId === folderId);

        if (!deleteContents && (childFolders.length > 0 || childQuizzes.length > 0)) {
            const err = new Error('Folder is not empty. Use deleteContents=true to delete all contents.');
            err.messageKey = 'error_folder_not_empty';
            throw err;
        }

        if (deleteContents) {
            // Recursively delete child folders
            for (const child of childFolders) {
                await this.deleteFolder(child.id, true);
            }

            // Delete child quizzes
            for (const [filename] of childQuizzes) {
                await this.deleteQuizMetadata(filename);
            }
        }

        delete this.metadata.folders[folderId];
        await this.saveMetadata();

        this.logger.debug(`Deleted folder: ${folderId}`);
        return { success: true };
    }

    /**
     * Check if a folder is a descendant of another
     */
    isDescendant(folderId, ancestorId) {
        let current = this.metadata.folders[folderId];
        while (current) {
            if (current.parentId === ancestorId) {
                return true;
            }
            current = current.parentId ? this.metadata.folders[current.parentId] : null;
        }
        return false;
    }

    /**
     * Validate folder name
     */
    validateFolderName(name) {
        if (!name || typeof name !== 'string') {
            const err = new Error('Folder name is required');
            err.messageKey = 'error_folder_name_required';
            throw err;
        }

        const trimmed = name.trim();
        if (trimmed.length === 0) {
            const err = new Error('Folder name cannot be empty');
            err.messageKey = 'error_folder_name_required';
            throw err;
        }

        if (trimmed.length > 100) {
            const err = new Error('Folder name must be less than 100 characters');
            err.messageKey = 'error_folder_name_too_long';
            throw err;
        }

        // Prevent problematic characters
        if (/[<>:"/\\|?*]/.test(trimmed)) {
            const err = new Error('Folder name contains invalid characters');
            err.messageKey = 'error_folder_name_invalid';
            throw err;
        }
    }

    // ============================================================================
    // Quiz Metadata Operations
    // ============================================================================

    /**
     * Register a new quiz in metadata.
     *
     * @param {string} filename
     * @param {string} displayName
     * @param {object} [options]
     * @param {string|null} [options.ownerId]   - Account id of the quiz owner, or null for legacy/public.
     * @param {'public'|'private'} [options.visibility] - Only applied when creating or when ownerId is set.
     */
    async registerQuiz(filename, displayName, options = {}) {
        const { ownerId = null, visibility } = options;
        const existing = this.metadata.quizzes[filename];

        if (existing) {
            // Update display name on re-save. Do not change ownership on re-save of
            // an already-owned quiz unless an explicit owner is supplied.
            existing.displayName = displayName;
            if (ownerId && !existing.ownerId) {
                existing.ownerId = ownerId;
                if (!existing.visibility) existing.visibility = visibility || 'private';
            }
        } else {
            this.metadata.quizzes[filename] = {
                displayName,
                folderId: null,
                passwordHash: null,
                ownerId: ownerId || null,
                visibility: ownerId ? (visibility || 'private') : (visibility || 'public'),
                created: new Date().toISOString(),
                sortOrder: Object.keys(this.metadata.quizzes).length
            };
        }

        await this.saveMetadata();
        return this.metadata.quizzes[filename];
    }

    /**
     * Set quiz display name
     */
    async setQuizDisplayName(filename, displayName) {
        const quiz = this.metadata.quizzes[filename];
        if (!quiz) {
            const err = new Error('Quiz not found in metadata');
            err.messageKey = 'error_quiz_not_found';
            throw err;
        }

        if (!displayName || typeof displayName !== 'string') {
            const err = new Error('Display name is required');
            err.messageKey = 'error_display_name_required';
            throw err;
        }

        if (displayName.length > 200) {
            const err = new Error('Display name must be less than 200 characters');
            err.messageKey = 'error_display_name_too_long';
            throw err;
        }

        quiz.displayName = displayName;
        await this.saveMetadata();

        this.logger.debug(`Set display name for ${filename}: ${displayName}`);
        return quiz;
    }

    /**
     * Move quiz to a folder
     */
    async moveQuizToFolder(filename, folderId) {
        const quiz = this.metadata.quizzes[filename];
        if (!quiz) {
            const err = new Error('Quiz not found in metadata');
            err.messageKey = 'error_quiz_not_found';
            throw err;
        }

        if (folderId !== null && !this.metadata.folders[folderId]) {
            const err = new Error('Target folder not found');
            err.messageKey = 'error_target_folder_not_found';
            throw err;
        }

        quiz.folderId = folderId;
        await this.saveMetadata();

        this.logger.debug(`Moved quiz ${filename} to folder: ${folderId}`);
        return quiz;
    }

    /**
     * Delete quiz metadata (does not delete actual file)
     */
    async deleteQuizMetadata(filename) {
        if (!this.metadata.quizzes[filename]) {
            const err = new Error('Quiz not found in metadata');
            err.messageKey = 'error_quiz_not_found';
            throw err;
        }

        delete this.metadata.quizzes[filename];
        await this.saveMetadata();

        this.logger.debug(`Deleted metadata for quiz: ${filename}`);
        return { success: true };
    }

    /**
     * Get quiz metadata
     */
    getQuizMetadata(filename) {
        return this.metadata.quizzes[filename] || null;
    }

    /**
     * Set the visibility of a quiz. Only the owner may toggle visibility;
     * callers must pass the current requester's userId so the service can
     * enforce this.
     *
     * Legacy/ownerless quizzes cannot be toggled — they're always public.
     */
    async setQuizVisibility(filename, visibility, userId) {
        const quiz = this.metadata.quizzes[filename];
        if (!quiz) {
            const err = new Error('Quiz not found in metadata');
            err.messageKey = 'error_quiz_not_found';
            err.status = 404;
            throw err;
        }
        if (!quiz.ownerId) {
            const err = new Error('This quiz is public and cannot be made private');
            err.messageKey = 'error_quiz_legacy_public';
            err.status = 400;
            throw err;
        }
        if (quiz.ownerId !== userId) {
            const err = new Error('You do not own this quiz');
            err.messageKey = 'error_quiz_not_owner';
            err.status = 403;
            throw err;
        }
        if (visibility !== 'public' && visibility !== 'private') {
            const err = new Error('Invalid visibility value');
            err.messageKey = 'error_invalid_visibility';
            err.status = 400;
            throw err;
        }
        quiz.visibility = visibility;
        await this.saveMetadata();
        return quiz;
    }

    /**
     * Return the set of quiz filenames that belong to a given owner scope.
     * - If ownerId is a string, returns files whose metadata.ownerId matches.
     * - If ownerId is null or undefined, returns files with no ownerId
     *   (legacy / anonymous / public pool).
     *
     * Used by the quiz save flow to scope title-conflict detection so Alice
     * saving "Math Quiz" doesn't bump her title just because Bob already
     * has one.
     */
    getQuizFilenamesByOwner(ownerId) {
        const target = ownerId || null;
        const out = new Set();
        for (const [filename, quiz] of Object.entries(this.metadata.quizzes)) {
            const quizOwner = quiz.ownerId || null;
            if (quizOwner === target) out.add(filename);
        }
        return out;
    }

    // ============================================================================
    // Password Operations
    // ============================================================================

    /**
     * Hash a password using PBKDF2
     */
    async hashPassword(password) {
        const salt = crypto.randomBytes(SALT_LENGTH);
        const hash = await new Promise((resolve, reject) => {
            crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, HASH_ALGORITHM, (err, derivedKey) => {
                if (err) reject(err);
                else resolve(derivedKey);
            });
        });

        return `${salt.toString('hex')}:${hash.toString('hex')}`;
    }

    /**
     * Verify a password against a hash
     */
    async verifyPassword(password, storedHash) {
        if (!storedHash) return false;

        const [saltHex, hashHex] = storedHash.split(':');
        const salt = Buffer.from(saltHex, 'hex');
        const storedHashBuffer = Buffer.from(hashHex, 'hex');

        const derivedKey = await new Promise((resolve, reject) => {
            crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, HASH_ALGORITHM, (err, key) => {
                if (err) reject(err);
                else resolve(key);
            });
        });

        // Timing-safe comparison
        return crypto.timingSafeEqual(derivedKey, storedHashBuffer);
    }

    /**
     * Set password for a folder
     */
    async setFolderPassword(folderId, password, userId = null) {
        const folder = this.metadata.folders[folderId];
        if (!folder) {
            const err = new Error('Folder not found');
            err.messageKey = 'error_folder_not_found';
            throw err;
        }

        if (!userId) {
            const err = new Error('Authentication required to manage folder passwords');
            err.messageKey = 'error_auth_required';
            err.status = 401;
            throw err;
        }

        // Only the user who set the password can change it. Legacy folders with
        // a passwordHash but no passwordSetBy (predating ownership tracking) are
        // locked out of API changes to prevent silent hijacking — an admin must
        // clear the entry directly in quiz-metadata.json.
        if (folder.passwordHash && folder.passwordSetBy !== userId) {
            const err = new Error('Only the user who locked this folder can change its password');
            err.messageKey = 'error_folder_not_password_owner';
            err.status = 403;
            throw err;
        }

        if (password) {
            if (password.length < 4) {
                const err = new Error('Password must be at least 4 characters');
                err.messageKey = 'error_password_too_short';
                throw err;
            }
            folder.passwordHash = await this.hashPassword(password);
            folder.passwordSetBy = userId;
        } else {
            folder.passwordHash = null;
            folder.passwordSetBy = null;
        }

        await this.saveMetadata();
        this.logger.debug(`${password ? 'Set' : 'Removed'} password for folder: ${folderId}`);
        return { success: true, protected: !!password };
    }

    /**
     * Set password for a quiz
     */
    async setQuizPassword(filename, password, userId = null) {
        const quiz = this.metadata.quizzes[filename];
        if (!quiz) {
            const err = new Error('Quiz not found in metadata');
            err.messageKey = 'error_quiz_not_found';
            throw err;
        }

        if (!userId) {
            const err = new Error('Authentication required to manage quiz passwords');
            err.messageKey = 'error_auth_required';
            err.status = 401;
            throw err;
        }

        // Setting a password requires an owner; clearing an ownerless (legacy)
        // hash is allowed for any authenticated user so orphaned hashes can be
        // cleaned up via the API.
        if (password && !quiz.ownerId) {
            const err = new Error('Only account-owned quizzes can use passwords');
            err.messageKey = 'error_quiz_password_requires_owner';
            err.status = 400;
            throw err;
        }

        if (quiz.ownerId && quiz.ownerId !== userId) {
            const err = new Error('You do not own this quiz');
            err.messageKey = 'error_quiz_not_owner';
            err.status = 403;
            throw err;
        }

        if (password) {
            if (password.length < 4) {
                const err = new Error('Password must be at least 4 characters');
                err.messageKey = 'error_password_too_short';
                throw err;
            }
            quiz.passwordHash = await this.hashPassword(password);
        } else {
            quiz.passwordHash = null;
        }

        await this.saveMetadata();
        this.logger.debug(`${password ? 'Set' : 'Removed'} password for quiz: ${filename}`);
        return { success: true, protected: !!password };
    }

    /**
     * Check if rate limited
     */
    isRateLimited(ip) {
        const attempts = this.unlockAttempts.get(ip);
        if (!attempts) return false;

        const now = Date.now();
        if (now - attempts.windowStart > RATE_LIMIT_WINDOW_MS) {
            // Window expired, reset
            this.unlockAttempts.delete(ip);
            return false;
        }

        return attempts.count >= MAX_UNLOCK_ATTEMPTS;
    }

    /**
     * Record unlock attempt
     */
    recordUnlockAttempt(ip) {
        const now = Date.now();
        const attempts = this.unlockAttempts.get(ip);

        if (!attempts || now - attempts.windowStart > RATE_LIMIT_WINDOW_MS) {
            this.unlockAttempts.set(ip, { count: 1, windowStart: now });
        } else {
            attempts.count++;
        }
    }

    /**
     * Unlock an item with password
     */
    async unlock(itemId, itemType, password, ip) {
        // Check rate limiting
        if (this.isRateLimited(ip)) {
            const err = new Error('Too many unlock attempts. Please try again later.');
            err.messageKey = 'error_rate_limited';
            throw err;
        }

        let item, passwordHash;
        if (itemType === 'folder') {
            item = this.metadata.folders[itemId];
            if (!item) {
                const err = new Error('Folder not found');
                err.messageKey = 'error_folder_not_found';
                throw err;
            }
            passwordHash = item.passwordHash;
        } else if (itemType === 'quiz') {
            item = this.metadata.quizzes[itemId];
            if (!item) {
                const err = new Error('Quiz not found');
                err.messageKey = 'error_quiz_not_found';
                throw err;
            }
            passwordHash = item.passwordHash;
        } else {
            const err = new Error('Invalid item type');
            err.messageKey = 'error_invalid_item_type';
            throw err;
        }

        if (!passwordHash) {
            const err = new Error('Item is not password protected');
            err.messageKey = 'error_not_protected';
            throw err;
        }

        this.recordUnlockAttempt(ip);

        const valid = await this.verifyPassword(password, passwordHash);
        if (!valid) {
            const err = new Error('Incorrect password');
            err.messageKey = 'error_incorrect_password';
            throw err;
        }

        // Generate session token
        const token = crypto.randomBytes(TOKEN_LENGTH).toString('hex');
        this.sessionTokens.set(token, {
            itemId,
            itemType,
            expiresAt: Date.now() + TOKEN_EXPIRY_MS
        });

        this.logger.debug(`Unlocked ${itemType} ${itemId} - token issued`);
        return { token, expiresIn: TOKEN_EXPIRY_MS };
    }

    /**
     * Verify a session token
     */
    verifyToken(token, itemId, itemType) {
        const session = this.sessionTokens.get(token);
        if (!session) return false;

        if (Date.now() > session.expiresAt) {
            this.sessionTokens.delete(token);
            return false;
        }

        return session.itemId === itemId && session.itemType === itemType;
    }

    /**
     * Check if item requires authentication
     */
    requiresAuth(itemId, itemType, userId = null) {
        if (itemType === 'folder') {
            const folder = this.metadata.folders[itemId];
            return folder && !!folder.passwordHash;
        } else if (itemType === 'quiz') {
            const quiz = this.metadata.quizzes[itemId];
            if (!quiz) return false;

            // Check quiz password
            if (quiz.passwordHash) {
                if (!quiz.ownerId) return false; // legacy anonymous passwords are not enforced
                return !(userId && quiz.ownerId === userId);
            }

            // Check if any parent folder is protected
            let folderId = quiz.folderId;
            while (folderId) {
                const folder = this.metadata.folders[folderId];
                if (folder && folder.passwordHash) return true;
                folderId = folder ? folder.parentId : null;
            }
        }
        return false;
    }

    /**
     * Cleanup expired tokens
     */
    cleanupExpiredTokens() {
        const now = Date.now();
        for (const [token, session] of this.sessionTokens) {
            if (now > session.expiresAt) {
                this.sessionTokens.delete(token);
            }
        }
    }

    // ============================================================================
    // Tree Structure
    // ============================================================================

    /**
     * Is the given quiz visible to `userId`?
     *
     * - Legacy/ownerless quizzes (no ownerId) are always visible.
     * - Public quizzes are always visible.
     * - Private quizzes are only visible to their owner.
     */
    _quizVisibleTo(quiz, userId) {
        // Folder-level protection is hidden from anonymous users, but still
        // available to signed-in users through the password flow.
        if (!userId) {
            let folderId = quiz.folderId;
            while (folderId) {
                const folder = this.metadata.folders[folderId];
                if (folder && folder.passwordHash) return false;
                folderId = folder ? folder.parentId : null;
            }
        }

        if (!quiz.ownerId) return true;                 // legacy public
        if (quiz.visibility !== 'private') return true; // explicitly public
        return !!userId && userId === quiz.ownerId;
    }

    /**
     * Public wrapper for quiz visibility checks by filename.
     * Missing metadata falls back to visible to preserve legacy behavior.
     */
    isQuizVisibleToUser(filename, userId = null) {
        const quiz = this.metadata?.quizzes?.[filename];
        if (!quiz) return true;
        return this._quizVisibleTo(quiz, userId);
    }

    /**
     * Map a metadata quiz entry to the tree node shape, including an `owned`
     * flag that the frontend uses to render the visibility toggle.
     */
    _quizToTreeNode(filename, quiz, folder, userId) {
        return {
            type: 'quiz',
            filename,
            displayName: quiz.displayName,
            protected: (!!quiz.ownerId && !!quiz.passwordHash) || !!(folder && folder.passwordHash),
            created: quiz.created,
            ownerId: quiz.ownerId || null,
            visibility: quiz.ownerId ? (quiz.visibility || 'private') : 'public',
            owned: !!userId && quiz.ownerId === userId
        };
    }

    /**
     * Get the tree structure for the file browser, filtered to what `userId`
     * may see. Anonymous requesters (userId = null/undefined) see only the
     * public pool.
     *
     * Folders whose entire visible descendant set is empty are pruned — this
     * prevents leaking folder names for folders that only contain private
     * quizzes owned by someone else.
     */
    getTreeStructure(userId = null) {
        const visibleQuizzesInFolder = (folderId, folder) => {
            return Object.entries(this.metadata.quizzes)
                .filter(([_, q]) => q.folderId === folderId && this._quizVisibleTo(q, userId))
                .sort(([_, a], [__, b]) => a.sortOrder - b.sortOrder)
                .map(([filename, quiz]) => this._quizToTreeNode(filename, quiz, folder, userId));
        };

        const buildFolderTree = (parentId) => {
            return Object.values(this.metadata.folders)
                .filter(f => f.parentId === parentId)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(folder => {
                    const children = buildFolderTree(folder.id);
                    const quizzes = visibleQuizzesInFolder(folder.id, folder);
                    return {
                        type: 'folder',
                        id: folder.id,
                        name: folder.name,
                        protected: !!folder.passwordHash,
                        created: folder.created,
                        children,
                        quizzes
                    };
                })
                // Prune folders whose entire subtree is empty after filtering.
                // A folder is kept if it contains any visible quiz or any
                // non-empty child folder.
                .filter(f => f.quizzes.length > 0 || f.children.length > 0);
        };

        const rootFolders = buildFolderTree(null);
        const rootQuizzes = visibleQuizzesInFolder(null, null);

        return {
            folders: rootFolders,
            quizzes: rootQuizzes
        };
    }

    /**
     * Cleanup on service shutdown
     */
    shutdown() {
        if (this.tokenCleanupInterval) {
            clearInterval(this.tokenCleanupInterval);
        }
    }
}

module.exports = { MetadataService };
