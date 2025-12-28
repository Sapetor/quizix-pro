/**
 * Quiz Service
 * Handles quiz CRUD operations
 * Extracted from server.js for better organization
 */

const fs = require('fs').promises;
const fsSync = require('fs');
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
     */
    async saveQuiz(title, questions) {
        if (!title || !questions || !Array.isArray(questions)) {
            throw new Error('Invalid quiz data');
        }

        // Input length validation
        if (title.length > 200) {
            throw new Error('Quiz title must be less than 200 characters');
        }

        if (questions.length > 100) {
            throw new Error('Maximum 100 questions allowed per quiz');
        }

        // Validate individual question content lengths
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (q.question && q.question.length > 5000) {
                throw new Error(`Question ${i + 1} text exceeds 5000 characters`);
            }
            if (q.explanation && q.explanation.length > 2000) {
                throw new Error(`Question ${i + 1} explanation exceeds 2000 characters`);
            }
            if (q.options && Array.isArray(q.options)) {
                for (let j = 0; j < q.options.length; j++) {
                    if (q.options[j] && q.options[j].length > 1000) {
                        throw new Error(`Question ${i + 1}, option ${j + 1} exceeds 1000 characters`);
                    }
                }
            }
        }

        // Sanitize filename to prevent path traversal
        const safeTitle = title.replace(/[^a-z0-9\-_]/gi, '_').toLowerCase().substring(0, 50);
        const filename = `${safeTitle}_${Date.now()}.json`;

        const quizData = {
            title,
            questions,
            created: new Date().toISOString(),
            id: uuidv4()
        };

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
     * Load a specific quiz
     */
    async loadQuiz(filename) {
        // Validate filename to prevent path traversal
        if (!this.validateFilename(filename)) {
            throw new Error('Invalid filename');
        }

        if (!filename.endsWith('.json')) {
            throw new Error('Invalid filename');
        }

        const filePath = path.join(this.quizzesDir, filename);

        if (!fsSync.existsSync(filePath)) {
            throw new Error('Quiz not found');
        }

        const data = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
        return data;
    }
}

module.exports = { QuizService };
