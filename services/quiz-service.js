/**
 * Quiz Service
 * Handles quiz CRUD operations
 * Extracted from server.js for better organization
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class QuizService {
    constructor(logger, wslMonitor, quizzesDir = 'quizzes') {
        this.logger = logger;
        this.wslMonitor = wslMonitor;
        this.quizzesDir = quizzesDir;
    }

    /**
     * Validate filename to prevent path traversal attacks
     */
    validateFilename(filename) {
        if (!filename || typeof filename !== 'string') {
            return false;
        }

        // Check for path traversal attempts
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return false;
        }

        // Only allow alphanumeric, dash, underscore, and dot
        const filenameRegex = /^[a-zA-Z0-9._-]+$/;
        if (!filenameRegex.test(filename)) {
            return false;
        }

        return true;
    }

    /**
     * Save a quiz
     * @param {string} title - Quiz title
     * @param {Array} questions - Quiz questions
     * @param {string} [existingFilename] - If provided and valid, overwrite this file instead of creating a new one
     */
    async saveQuiz(titleArg, questions, existingFilename) {
        let title = titleArg;
        if (!title || !questions || !Array.isArray(questions)) {
            const err = new Error('Invalid quiz data');
            err.messageKey = 'error_invalid_quiz_data';
            throw err;
        }

        // Input length validation
        if (title.length > 200) {
            const err = new Error('Quiz title must be less than 200 characters');
            err.messageKey = 'error_quiz_title_too_long';
            throw err;
        }

        if (questions.length > 100) {
            const err = new Error('Maximum 100 questions allowed per quiz');
            err.messageKey = 'error_too_many_questions';
            throw err;
        }

        // Validate individual question content lengths
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (q.question && q.question.length > 5000) {
                const err = new Error(`Question ${i + 1} text exceeds 5000 characters`);
                err.messageKey = 'error_question_too_long';
                throw err;
            }
            if (q.explanation && q.explanation.length > 2000) {
                const err = new Error(`Question ${i + 1} explanation exceeds 2000 characters`);
                err.messageKey = 'error_explanation_too_long';
                throw err;
            }
            if (q.options && Array.isArray(q.options)) {
                for (let j = 0; j < q.options.length; j++) {
                    if (q.options[j] && q.options[j].length > 1000) {
                        const err = new Error(`Question ${i + 1}, option ${j + 1} exceeds 1000 characters`);
                        err.messageKey = 'error_option_too_long';
                        throw err;
                    }
                }
            }
        }

        // Only check for title conflicts on new saves (not overwrites)
        if (!existingFilename) {
            const originalTitle = title;
            title = await this._resolveNameConflict(title);
            if (title !== originalTitle) {
                this.logger.info(`Title conflict resolved: "${originalTitle}" → "${title}"`);
            }
        } else {
            this.logger.info(`Overwriting existing file: ${existingFilename}`);
        }

        // Determine filename: reuse existing if valid and the file exists, otherwise generate new
        let filename;
        if (existingFilename && this.validateFilename(existingFilename) && existingFilename.endsWith('.json')) {
            const existingPath = path.join(this.quizzesDir, existingFilename);
            try {
                await fs.access(existingPath);
                filename = existingFilename;
            } catch {
                // File doesn't exist on disk, generate a new name
                const safeTitle = title.replace(/[^a-z0-9\-_]/gi, '_').toLowerCase().substring(0, 50);
                filename = `${safeTitle}_${Date.now()}.json`;
            }
        } else {
            const safeTitle = title.replace(/[^a-z0-9\-_]/gi, '_').toLowerCase().substring(0, 50);
            filename = `${safeTitle}_${Date.now()}.json`;
        }

        // Build quiz data, preserving created/id when overwriting an existing file
        let quizData;
        if (existingFilename && filename === existingFilename) {
            try {
                const existingContent = await fs.readFile(path.join(this.quizzesDir, filename), 'utf8');
                const existing = JSON.parse(existingContent);
                quizData = {
                    title,
                    questions,
                    created: existing.created || new Date().toISOString(),
                    id: existing.id || uuidv4(),
                    modified: new Date().toISOString()
                };
            } catch {
                quizData = { title, questions, created: new Date().toISOString(), id: uuidv4() };
            }
        } else {
            quizData = { title, questions, created: new Date().toISOString(), id: uuidv4() };
        }

        // Write file with WSL performance monitoring
        await this.wslMonitor.trackFileOperation(
            () => fs.writeFile(
                path.join(this.quizzesDir, filename),
                JSON.stringify(quizData, null, 2),
                'utf8'
            ),
            `Quiz save: ${filename}`
        );

        this.logger.debug(`Quiz saved successfully: ${filename}`);

        return {
            success: true,
            filename,
            title,
            id: quizData.id
        };
    }

    /**
     * List all quizzes
     */
    async listQuizzes() {
        // Read directory with WSL performance monitoring
        const files = (await this.wslMonitor.trackFileOperation(
            () => fs.readdir(this.quizzesDir),
            'Quiz directory listing'
        )).filter(f => f.endsWith('.json'));

        // Process files in parallel for better performance
        const quizPromises = files.map(async (file) => {
            try {
                const data = JSON.parse(
                    await fs.readFile(path.join(this.quizzesDir, file), 'utf8')
                );
                return {
                    filename: file,
                    title: data.title,
                    questionCount: data.questions.length,
                    created: data.created,
                    id: data.id
                };
            } catch (err) {
                this.logger.error('Error reading quiz file:', file, err);
                return null;
            }
        });

        const quizzes = (await Promise.all(quizPromises)).filter(Boolean);
        this.logger.debug(`Loaded ${quizzes.length} quizzes from ${files.length} files`);

        return quizzes;
    }

    /**
     * Validate filename and resolve the full path, throwing on invalid input
     * @param {string} filename - Filename to validate
     * @returns {string} Resolved file path
     */
    resolveQuizPath(filename) {
        if (!this.validateFilename(filename) || !filename.endsWith('.json')) {
            const err = new Error('Invalid filename');
            err.messageKey = 'error_invalid_filename';
            throw err;
        }
        return path.join(this.quizzesDir, filename);
    }

    /**
     * Load a specific quiz
     */
    async loadQuiz(filename) {
        const filePath = this.resolveQuizPath(filename);

        try {
            await fs.access(filePath);
        } catch {
            const err = new Error('Quiz not found');
            err.messageKey = 'error_quiz_not_found';
            throw err;
        }

        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    }

    /**
     * Resolve title conflicts for new saves.
     * If a quiz with the same title already exists, appends a date suffix.
     * If that also conflicts, appends a counter.
     * @param {string} title - Proposed quiz title
     * @returns {Promise<string>} - Possibly modified title
     */
    async _resolveNameConflict(title) {
        let files;
        try {
            const allFiles = await fs.readdir(this.quizzesDir);
            files = allFiles.filter(f => f.endsWith('.json') && f !== 'quiz-metadata.json');
        } catch {
            // If we can't read the directory, skip conflict checking
            return title;
        }

        // Collect all existing titles
        const existingTitles = new Set();
        await Promise.all(files.map(async (file) => {
            try {
                const data = JSON.parse(await fs.readFile(path.join(this.quizzesDir, file), 'utf8'));
                if (data.title) {
                    existingTitles.add(data.title);
                }
            } catch {
                // Ignore unreadable files
            }
        }));

        this.logger.info(`[NameConflict] Checking "${title}" against ${existingTitles.size} existing titles`);

        if (!existingTitles.has(title)) {
            this.logger.info(`[NameConflict] No conflict found for "${title}"`);
            return title;
        }

        this.logger.info(`[NameConflict] Conflict found for "${title}", adding date suffix`);

        // Conflict exists — append date suffix
        const now = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dateSuffix = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
        const titledWithDate = `${title} (${dateSuffix})`;

        if (!existingTitles.has(titledWithDate)) {
            return titledWithDate;
        }

        // Date suffix also conflicts — append incrementing counter
        let counter = 2;
        while (existingTitles.has(`${titledWithDate} (${counter})`)) {
            counter++;
        }
        return `${titledWithDate} (${counter})`;
    }

    /**
     * Delete a quiz file
     */
    async deleteQuiz(filename) {
        const filePath = this.resolveQuizPath(filename);

        try {
            await fs.access(filePath);
        } catch {
            const err = new Error('Quiz not found');
            err.messageKey = 'error_quiz_not_found';
            throw err;
        }

        await this.wslMonitor.trackFileOperation(
            () => fs.unlink(filePath),
            `Quiz delete: ${filename}`
        );

        this.logger.debug(`Quiz deleted successfully: ${filename}`);
        return { success: true, filename };
    }
}

module.exports = { QuizService };
