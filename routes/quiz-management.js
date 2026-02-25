const express = require('express');

/**
 * Quiz Management Routes
 *
 * Handles all quiz and folder management operations including:
 * - Quiz listing and loading
 * - Results management (save, list, export, delete)
 * - Active games tracking
 * - QR code generation
 * - Folder operations (create, rename, move, delete, password)
 * - Quiz metadata management
 * - Authentication and unlocking
 */

/**
 * Create quiz management router with dependencies
 * @param {Object} options - Configuration options
 * @param {Object} options.quizService - Quiz service instance
 * @param {Object} options.resultsService - Results service instance
 * @param {Object} options.metadataService - Metadata service instance
 * @param {Object} options.gameSessionService - Game session service instance
 * @param {Object} options.qrService - QR code service instance
 * @param {Object} options.logger - Logger instance
 * @param {Function} options.validateBody - Body validation middleware
 * @param {Function} options.validateParams - Params validation middleware
 * @param {Object} options.schemas - Validation schemas
 * @returns {express.Router} Configured router
 */
function createQuizManagementRoutes(options) {
    const {
        quizService,
        resultsService,
        metadataService,
        gameSessionService,
        qrService,
        logger,
        validateBody,
        validateParams,
        schemas
    } = options;

    const router = express.Router();

    // ============================================================================
    // Quiz Loading Endpoints
    // ============================================================================

    // List all quizzes
    router.get('/api/quizzes', async (req, res) => {
        try {
            const quizzes = await quizService.listQuizzes();
            res.json(quizzes);
        } catch (error) {
            logger.error('Load quizzes error:', error);
            res.status(500).json({ error: 'Failed to load quizzes', messageKey: 'error_failed_load_quizzes' });
        }
    });

    // Load specific quiz
    router.get('/api/quiz/:filename', async (req, res) => {
        try {
            const { filename } = req.params;
            const data = await quizService.loadQuiz(filename);
            res.json(data);
        } catch (error) {
            logger.error('Load quiz error:', error);
            const statusCode = error.message === 'Quiz not found' ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to load quiz', messageKey: error.messageKey || 'error_failed_load_quiz' });
        }
    });

    // ============================================================================
    // Results Management Endpoints
    // ============================================================================

    // Save quiz results
    router.post('/api/save-results', async (req, res) => {
        try {
            const { quizTitle, gamePin, results, startTime, endTime, questions } = req.body;
            const result = await resultsService.saveResults(quizTitle, gamePin, results, startTime, endTime, questions);
            res.json(result);
        } catch (error) {
            logger.error('Save results error:', error);
            res.status(400).json({ error: error.message || 'Failed to save results', messageKey: error.messageKey || 'error_failed_save_results' });
        }
    });

    // Get list of saved quiz results
    router.get('/api/results', async (req, res) => {
        try {
            const results = await resultsService.listResults();
            res.json(results);
        } catch (error) {
            logger.error('Error listing results:', error);
            res.status(500).json({ error: 'Failed to list results', messageKey: 'error_failed_list_results' });
        }
    });

    // Delete quiz result (must be before GET route to avoid conflicts)
    // Security: Requires same-origin and confirmation parameter
    router.delete('/api/results/:filename', async (req, res) => {
        try {
            // Validate origin - must be same host
            const origin = req.get('origin') || req.get('referer');
            const host = req.get('host');
            if (origin && !origin.includes(host)) {
                logger.warn(`Rejected cross-origin delete attempt from ${origin}`);
                return res.status(403).json({ error: 'Cross-origin requests not allowed', messageKey: 'error_cross_origin' });
            }

            // Require confirmation parameter to prevent accidental deletes
            if (req.query.confirm !== 'true') {
                return res.status(400).json({ error: 'Delete requires confirm=true parameter', messageKey: 'error_confirm_required' });
            }

            const filename = req.params.filename;

            // Audit log the deletion
            logger.info(`Result file deletion requested: ${filename} from ${req.ip}`);

            const result = await resultsService.deleteResult(filename);
            res.json(result);
        } catch (error) {
            logger.error('Error deleting result file:', error);
            const statusCode = error.message === 'Result file not found' ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to delete result file', messageKey: error.messageKey || 'error_failed_delete_result' });
        }
    });

    // Get specific quiz result file
    router.get('/api/results/:filename', async (req, res) => {
        try {
            const filename = req.params.filename;
            const data = await resultsService.getResult(filename);
            res.json(data);
        } catch (error) {
            logger.error('Error retrieving result file:', error);
            const statusCode = error.message === 'Result file not found' ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to retrieve result file', messageKey: error.messageKey || 'error_failed_retrieve_result' });
        }
    });

    // Export quiz results in different formats
    router.get('/api/results/:filename/export/:format', async (req, res) => {
        try {
            const { filename, format } = req.params;
            const exportType = req.query.type || 'analytics';

            const exportData = await resultsService.exportResults(filename, format, exportType);

            // Set response headers - sanitize filename to prevent header injection
            const sanitizedFilename = exportData.filename.replace(/[\r\n"]/g, '_');
            res.setHeader('Content-Type', exportData.type);
            res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);

            // Send content (works for both CSV and JSON)
            res.send(exportData.content);
        } catch (error) {
            logger.error('Error exporting result file:', error);
            const statusCode = error.message === 'Result file not found' ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to export result file', messageKey: error.messageKey || 'error_failed_export_result' });
        }
    });

    // ============================================================================
    // Game Management Endpoints
    // ============================================================================

    // Get list of active games
    router.get('/api/active-games', (req, res) => {
        try {
            const allGames = Array.from(gameSessionService.getAllGames().values()).map(game => ({
                pin: game.pin,
                title: game.quiz.title || 'Untitled Quiz',
                playerCount: game.players.size,
                questionCount: game.quiz.questions.length,
                gameState: game.gameState,
                created: new Date().toISOString()
            }));

            const activeGames = allGames.filter(game => game.gameState === 'lobby');

            res.json({
                games: activeGames,
                debug: {
                    totalGames: allGames.length,
                    allGames: allGames
                }
            });
        } catch (error) {
            logger.error('Active games fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch active games', messageKey: 'error_failed_fetch_games' });
        }
    });

    // Generate QR code with caching optimization
    router.get('/api/qr/:pin', async (req, res) => {
        try {
            const { pin } = req.params;

            // Validate PIN format - must be 6 digits
            if (!pin || !/^\d{6}$/.test(pin)) {
                return res.status(400).json({ error: 'Invalid PIN format. Must be 6 digits.', messageKey: 'error_invalid_pin_format' });
            }

            const game = gameSessionService.getGame(pin);

            if (!game) {
                return res.status(404).json({ error: 'Game not found', messageKey: 'error_game_not_found' });
            }

            // Generate QR code with caching
            const responseData = await qrService.generateQRCode(pin, game, req);

            // Apply cache headers
            const headers = qrService.getCacheHeaders(pin);
            Object.entries(headers).forEach(([key, value]) => {
                res.setHeader(key, value);
            });

            res.json(responseData);
        } catch (error) {
            logger.error(`QR code generation error for PIN ${req.params.pin}:`, error);
            res.status(500).json({ error: error.message || 'Failed to generate QR code', messageKey: 'error_failed_generate_qr' });
        }
    });

    // ============================================================================
    // File Management API Endpoints
    // ============================================================================

    // Get quiz tree structure (folders and quizzes)
    router.get('/api/quiz-tree', async (req, res) => {
        try {
            const tree = metadataService.getTreeStructure();
            res.json(tree);
        } catch (error) {
            logger.error('Get quiz tree error:', error);
            res.status(500).json({ error: 'Failed to get quiz tree', messageKey: 'error_failed_get_quiz_tree' });
        }
    });

    // Create a new folder
    router.post('/api/folders', validateBody(schemas.createFolderSchema), async (req, res) => {
        try {
            const { name, parentId } = req.validatedBody;
            const folder = await metadataService.createFolder(name, parentId);
            res.status(201).json(folder);
        } catch (error) {
            logger.error('Create folder error:', error);
            res.status(400).json({ error: error.message || 'Failed to create folder', messageKey: error.messageKey || 'error_failed_create_folder' });
        }
    });

    // Rename a folder
    router.patch('/api/folders/:id/rename', validateParams(schemas.folderIdParamSchema), validateBody(schemas.renameFolderSchema), async (req, res) => {
        try {
            const { id } = req.validatedParams;
            const { name } = req.validatedBody;
            const folder = await metadataService.renameFolder(id, name);
            res.json(folder);
        } catch (error) {
            logger.error('Rename folder error:', error);
            const statusCode = error.message === 'Folder not found' ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to rename folder', messageKey: error.messageKey || 'error_failed_rename_folder' });
        }
    });

    // Move a folder
    router.patch('/api/folders/:id/move', validateParams(schemas.folderIdParamSchema), validateBody(schemas.moveFolderSchema), async (req, res) => {
        try {
            const { id } = req.validatedParams;
            const { parentId } = req.validatedBody;
            const folder = await metadataService.moveFolder(id, parentId);
            res.json(folder);
        } catch (error) {
            logger.error('Move folder error:', error);
            const statusCode = error.message === 'Folder not found' ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to move folder', messageKey: error.messageKey || 'error_failed_move_folder' });
        }
    });

    // Set or remove folder password
    router.post('/api/folders/:id/password', validateParams(schemas.folderIdParamSchema), validateBody(schemas.setPasswordSchema), async (req, res) => {
        try {
            const { id } = req.validatedParams;
            const { password } = req.validatedBody;
            const result = await metadataService.setFolderPassword(id, password);
            res.json(result);
        } catch (error) {
            logger.error('Set folder password error:', error);
            const statusCode = error.message === 'Folder not found' ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to set folder password', messageKey: error.messageKey || 'error_failed_set_password' });
        }
    });

    // Delete a folder
    router.delete('/api/folders/:id', validateParams(schemas.folderIdParamSchema), async (req, res) => {
        try {
            const { id } = req.validatedParams;
            const deleteContents = req.query.deleteContents === 'true';

            // Check if folder requires authentication
            if (metadataService.requiresAuth(id, 'folder')) {
                // Extract token from Authorization header
                const authHeader = req.headers['authorization'];
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ error: 'Authentication required', messageKey: 'error_auth_required' });
                }

                const token = authHeader.substring(7); // Remove 'Bearer ' prefix
                if (!metadataService.verifyToken(token, id, 'folder')) {
                    return res.status(403).json({ error: 'Invalid or expired authentication token', messageKey: 'error_invalid_token' });
                }
            }

            const result = await metadataService.deleteFolder(id, deleteContents);
            res.json(result);
        } catch (error) {
            logger.error('Delete folder error:', error);
            const statusCode = error.message === 'Folder not found' ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to delete folder', messageKey: error.messageKey || 'error_failed_delete_folder' });
        }
    });

    // Update quiz metadata (display name and/or folder)
    router.patch('/api/quiz-metadata/:filename', validateBody(schemas.updateQuizMetadataSchema), async (req, res) => {
        try {
            const { filename } = req.params;

            // Validate filename
            if (!quizService.validateFilename(filename)) {
                return res.status(400).json({ error: 'Invalid filename', messageKey: 'error_invalid_filename' });
            }

            const { displayName, folderId } = req.validatedBody;
            let quiz = metadataService.getQuizMetadata(filename);

            // If quiz not in metadata, try to register it
            if (!quiz) {
                try {
                    const quizData = await quizService.loadQuiz(filename);
                    quiz = await metadataService.registerQuiz(filename, quizData.title);
                } catch {
                    return res.status(404).json({ error: 'Quiz not found', messageKey: 'error_quiz_not_found' });
                }
            }

            // Update display name if provided
            if (displayName !== undefined) {
                await metadataService.setQuizDisplayName(filename, displayName);
            }

            // Update folder if provided
            if (folderId !== undefined) {
                await metadataService.moveQuizToFolder(filename, folderId);
            }

            const updatedQuiz = metadataService.getQuizMetadata(filename);
            res.json(updatedQuiz);
        } catch (error) {
            logger.error('Update quiz metadata error:', error);
            res.status(400).json({ error: error.message || 'Failed to update quiz metadata', messageKey: error.messageKey || 'error_failed_update_metadata' });
        }
    });

    // Set or remove quiz password
    router.post('/api/quiz-metadata/:filename/password', validateBody(schemas.setPasswordSchema), async (req, res) => {
        try {
            const { filename } = req.params;

            // Validate filename
            if (!quizService.validateFilename(filename)) {
                return res.status(400).json({ error: 'Invalid filename', messageKey: 'error_invalid_filename' });
            }

            const { password } = req.validatedBody;
            const result = await metadataService.setQuizPassword(filename, password);
            res.json(result);
        } catch (error) {
            logger.error('Set quiz password error:', error);
            const statusCode = error.message.includes('not found') ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to set quiz password', messageKey: error.messageKey || 'error_failed_set_password' });
        }
    });

    // Delete a quiz (file + metadata)
    router.delete('/api/quiz/:filename', async (req, res) => {
        try {
            const { filename } = req.params;

            // Validate filename
            if (!quizService.validateFilename(filename)) {
                return res.status(400).json({ error: 'Invalid filename', messageKey: 'error_invalid_filename' });
            }

            // Require confirmation parameter
            if (req.query.confirm !== 'true') {
                return res.status(400).json({ error: 'Delete requires confirm=true parameter', messageKey: 'error_confirm_required' });
            }

            // Check if quiz requires authentication
            if (metadataService.requiresAuth(filename, 'quiz')) {
                // Extract token from Authorization header
                const authHeader = req.headers['authorization'];
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ error: 'Authentication required', messageKey: 'error_auth_required' });
                }

                const token = authHeader.substring(7); // Remove 'Bearer ' prefix
                if (!metadataService.verifyToken(token, filename, 'quiz')) {
                    return res.status(403).json({ error: 'Invalid or expired authentication token', messageKey: 'error_invalid_token' });
                }
            }

            // Delete the physical file
            await quizService.deleteQuiz(filename);

            // Delete metadata
            try {
                await metadataService.deleteQuizMetadata(filename);
            } catch {
                // Metadata might not exist, that's OK
            }

            logger.info(`Quiz deleted: ${filename} from ${req.ip}`);
            res.json({ success: true, filename });
        } catch (error) {
            logger.error('Delete quiz error:', error);
            const statusCode = error.message === 'Quiz not found' ? 404 : 400;
            res.status(statusCode).json({ error: error.message || 'Failed to delete quiz', messageKey: error.messageKey || 'error_failed_delete_quiz' });
        }
    });

    // Unlock a password-protected item
    router.post('/api/unlock', validateBody(schemas.unlockSchema), async (req, res) => {
        try {
            const { itemId, itemType, password } = req.validatedBody;
            const ip = req.ip || req.connection.remoteAddress || 'unknown';
            const result = await metadataService.unlock(itemId, itemType, password, ip);
            res.json(result);
        } catch (error) {
            logger.error('Unlock error:', error);

            // Rate limiting
            if (error.message.includes('Too many')) {
                return res.status(429).json({ error: error.message, messageKey: error.messageKey || 'error_rate_limited' });
            }

            // Wrong password
            if (error.message.includes('Incorrect password')) {
                return res.status(401).json({ error: error.message, messageKey: error.messageKey || 'error_incorrect_password' });
            }

            res.status(400).json({ error: error.message || 'Failed to unlock', messageKey: error.messageKey || 'error_failed_unlock' });
        }
    });

    // Check if item requires authentication
    router.get('/api/requires-auth/:itemType/:itemId', (req, res) => {
        try {
            const { itemType, itemId } = req.params;

            if (!['folder', 'quiz'].includes(itemType)) {
                return res.status(400).json({ error: 'Invalid item type', messageKey: 'error_invalid_item_type' });
            }

            const requiresAuth = metadataService.requiresAuth(itemId, itemType);
            res.json({ requiresAuth });
        } catch (error) {
            logger.error('Check auth error:', error);
            res.status(400).json({ error: error.message || 'Failed to check authentication', messageKey: error.messageKey || 'error_failed_check_auth' });
        }
    });

    return router;
}

module.exports = { createQuizManagementRoutes };
