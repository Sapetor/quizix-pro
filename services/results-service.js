/**
 * Results Service
 * Handles quiz results management and export
 * Extracted from server.js for better organization
 */

const fs = require('fs').promises;
const path = require('path');
const { atomicWriteFile } = require('./atomic-write');
const { ScoringService } = require('./scoring-service');

class ResultsService {
    constructor(logger, resultsDir = 'results') {
        this.logger = logger;
        this.resultsDir = resultsDir;
    }

    /**
     * Validate results filename
     */
    validateFilename(filename) {
        return filename && filename.match(/^results_\d+_\d+\.json$/);
    }

    /**
     * Validate that a file path stays within the results directory
     * Prevents path traversal attacks
     * @param {string} filename - Filename to validate
     * @returns {string} - Safe resolved path
     * @throws {Error} - If path escapes results directory
     */
    validatePath(filename) {
        const resolvedBase = path.resolve(this.resultsDir);
        const resolvedPath = path.resolve(this.resultsDir, filename);

        if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
            const err = new Error('Invalid path: attempted directory traversal');
            err.messageKey = 'error_invalid_path';
            throw err;
        }

        return resolvedPath;
    }

    /**
     * Save quiz results
     */
    async saveResults(quizTitle, gamePin, results, startTime, endTime, questions) {
        if (!quizTitle || !gamePin || !results) {
            const err = new Error('Invalid results data');
            err.messageKey = 'error_invalid_results_data';
            throw err;
        }

        // Prevent path traversal / arbitrary file write via unvalidated gamePin.
        // Legitimate game PINs are always 6 digits.
        if (!/^\d{6}$/.test(String(gamePin))) {
            const err = new Error('Invalid game PIN');
            err.messageKey = 'error_invalid_pin_format';
            throw err;
        }

        const filename = `results_${gamePin}_${Date.now()}.json`;
        const resultsData = {
            quizTitle,
            gamePin,
            results,
            startTime,
            endTime,
            saved: new Date().toISOString()
        };

        // Include questions data if provided for enhanced analytics
        if (questions && Array.isArray(questions) && questions.length > 0) {
            resultsData.questions = questions;
        }

        // Defense-in-depth: resolve through validatePath like the read/delete paths
        const filePath = this.validatePath(filename);
        await atomicWriteFile(filePath, JSON.stringify(resultsData, null, 2));

        this.logger.debug(`Results saved successfully: ${filename}`);

        return {
            success: true,
            filename
        };
    }

    /**
     * List all results
     */
    async listResults() {
        try {
            await fs.access(this.resultsDir);
        } catch {
            this.logger.debug('Results directory does not exist');
            return [];
        }

        const allFiles = await fs.readdir(this.resultsDir);
        const resultFiles = allFiles.filter(file => file.startsWith('results_') && file.endsWith('.json'));

        const filePromises = resultFiles.map(async (filename) => {
            try {
                const filePath = path.join(this.resultsDir, filename);
                const stats = await fs.stat(filePath);
                const content = await fs.readFile(filePath, 'utf8');
                const data = JSON.parse(content);

                // Drop the heavy per-player `results` array from the listing
                // payload (unbounded growth); expose summary fields instead.
                return {
                    filename,
                    quizTitle: data.quizTitle || 'Untitled Quiz',
                    gamePin: data.gamePin,
                    participantCount: data.results?.length || 0,
                    averageScore: this._computeAverageScore(data.results),
                    startTime: data.startTime,
                    endTime: data.endTime,
                    saved: data.saved || stats.mtime.toISOString(),
                    fileSize: stats.size
                };
            } catch (error) {
                this.logger.error(`Error reading result file ${filename}:`, error);
                return null;
            }
        });

        const files = (await Promise.all(filePromises))
            .filter(result => result !== null)
            .sort((a, b) => new Date(b.saved) - new Date(a.saved));

        this.logger.debug(`Found ${files.length} result files`);
        return files;
    }

    /**
     * Compute the average score (correct-answer percentage) for a game.
     * Mirrors the client's calculateAverageScore so the listing UI keeps its
     * score badge without the heavy per-player `results` array.
     * @param {Array} results - Per-player result objects
     * @returns {number} Average score percentage (0-100)
     */
    _computeAverageScore(results) {
        if (!Array.isArray(results) || results.length === 0) {
            return 0;
        }

        let totalCorrect = 0;
        let totalQuestions = 0;

        results.forEach(player => {
            const answers = player.answers || [];
            totalQuestions += answers.length;
            totalCorrect += answers.filter(a => a?.isCorrect).length;
        });

        return totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    }

    /**
     * Delete a result file
     */
    async deleteResult(filename) {
        if (!this.validateFilename(filename)) {
            const err = new Error('Invalid filename format');
            err.messageKey = 'error_invalid_filename';
            throw err;
        }

        const filePath = this.validatePath(filename);

        try {
            await fs.access(filePath);
        } catch {
            const err = new Error('Result file not found');
            err.messageKey = 'error_result_not_found';
            throw err;
        }

        await fs.unlink(filePath);
        this.logger.info(`Result file deleted: ${filename}`);

        return {
            success: true,
            message: 'Result deleted successfully'
        };
    }

    /**
     * Get a specific result file
     */
    async getResult(filename) {
        if (!this.validateFilename(filename)) {
            const err = new Error('Invalid filename format');
            err.messageKey = 'error_invalid_filename';
            throw err;
        }

        const filePath = this.validatePath(filename);

        try {
            await fs.access(filePath);
        } catch {
            const err = new Error('Result file not found');
            err.messageKey = 'error_result_not_found';
            throw err;
        }

        try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            return data;
        } catch (parseError) {
            this.logger.error(`Failed to parse result file ${filename}:`, parseError);
            const err = new Error('Result file is corrupted or invalid JSON');
            err.messageKey = 'error_result_corrupted';
            throw err;
        }
    }

    /**
     * Export results in various formats
     */
    async exportResults(filename, format, exportType = 'analytics') {
        if (!this.validateFilename(filename)) {
            const err = new Error('Invalid filename format');
            err.messageKey = 'error_invalid_filename';
            throw err;
        }

        if (!['csv', 'json'].includes(format.toLowerCase())) {
            const err = new Error('Unsupported export format. Use csv or json.');
            err.messageKey = 'error_unsupported_format';
            throw err;
        }

        if (!['analytics', 'simple'].includes(exportType)) {
            const err = new Error('Invalid export type. Use analytics or simple.');
            err.messageKey = 'error_invalid_export_type';
            throw err;
        }

        const filePath = this.validatePath(filename);

        try {
            await fs.access(filePath);
        } catch {
            const err = new Error('Result file not found');
            err.messageKey = 'error_result_not_found';
            throw err;
        }

        let data;
        try {
            const content = await fs.readFile(filePath, 'utf8');
            data = JSON.parse(content);
        } catch (parseError) {
            this.logger.error(`Failed to parse result file for export ${filename}:`, parseError);
            const err = new Error('Result file is corrupted or invalid JSON');
            err.messageKey = 'error_result_corrupted';
            throw err;
        }

        if (format.toLowerCase() === 'csv') {
            return {
                type: 'text/csv',
                filename: exportType === 'simple'
                    ? `quiz_results_simple_${data.gamePin}.csv`
                    : `quiz_results_analytics_${data.gamePin}.csv`,
                content: exportType === 'simple'
                    ? this._generateSimpleCSV(data)
                    : this._generateAnalyticsCSV(data)
            };
        } else {
            return {
                type: 'application/json',
                filename: `quiz_results_${data.gamePin}.json`,
                content: JSON.stringify(data, null, 2)
            };
        }
    }

    /**
     * Generate simple player-centric CSV
     */
    _generateSimpleCSV(data) {
        let csv = '\ufeff'; // UTF-8 BOM for Excel compatibility
        csv += 'Player Name,Question #,Question Text,Player Answer,Correct Answer,Is Correct,Time (seconds),Points\n';

        const players = data.results || [];
        const questions = data.questions || [];

        players.forEach(player => {
            if (player.answers && Array.isArray(player.answers)) {
                player.answers.forEach((answer, qIndex) => {
                    if (answer) {
                        const question = questions[qIndex];
                        const questionText = question ? (question.text || question.question || `Question ${qIndex + 1}`) : `Question ${qIndex + 1}`;
                        const correctAnswer = this._formatCorrectAnswer(question);
                        const playerAnswer = this._formatAnswerValue(answer.answer, question);

                        // A poll response is neither right nor wrong
                        const isCorrectText = answer.isPoll ? 'N/A' : (answer.isCorrect ? 'Yes' : 'No');
                        const timeSeconds = Math.round((answer.timeMs || 0) / 1000);
                        const points = answer.points || 0;

                        const row = [
                            this._sanitizeCsvValue(player.name || 'Anonymous'),
                            qIndex + 1,
                            this._sanitizeCsvValue(questionText),
                            this._sanitizeCsvValue(playerAnswer),
                            this._sanitizeCsvValue(correctAnswer),
                            `"${isCorrectText}"`,
                            timeSeconds,
                            points
                        ].join(',');

                        csv += row + '\n';
                    }
                });
            }
        });

        return csv;
    }

    /**
     * Generate analytics question-centric CSV
     */
    _generateAnalyticsCSV(data) {
        if (!data.questions || data.questions.length === 0) {
            // Fallback to summary format if no question data
            return this._generateFallbackCSV(data);
        }

        let csv = '\ufeff'; // UTF-8 BOM for Excel compatibility
        const players = data.results || [];

        // Build header row
        const header = ['Question', 'Correct Answer', 'Difficulty'];

        // Add columns for each player (sanitize names to prevent injection)
        players.forEach(player => {
            const safeName = this._sanitizeHeaderName(player.name);
            header.push(`${safeName} Answer`);
            header.push(`${safeName} Time (s)`);
            header.push(`${safeName} Points`);
            header.push(`${safeName} Correct`);
        });

        // Add analytics columns
        header.push('Success Rate %');
        header.push('Avg Time (s)');
        header.push('Total Points Earned');
        header.push('Hardest For');
        header.push('Common Wrong Answer');

        csv += header.map(h => `"${h}"`).join(',') + '\n';

        // Generate question rows
        data.questions.forEach((question, qIndex) => {
            const questionText = (question.text || '').replace(/"/g, '""');
            const correctAnswer = this._formatCorrectAnswer(question);

            const row = [
                this._sanitizeCsvValue(questionText),
                this._sanitizeCsvValue(correctAnswer),
                this._sanitizeCsvValue(question.difficulty || 'medium')
            ];

            // Analytics tracking
            let correctCount = 0;
            let totalTime = 0;
            let responseCount = 0;
            let totalPointsEarned = 0;
            const playerPerformances = [];
            const wrongAnswers = {};

            // Add player data columns
            players.forEach(player => {
                const playerAnswer = player.answers && player.answers[qIndex];

                if (playerAnswer) {
                    const displayAnswer = this._formatAnswerValue(playerAnswer.answer, question);

                    row.push(this._sanitizeCsvValue(displayAnswer));
                    row.push(Math.round((playerAnswer.timeMs || 0) / 1000));
                    row.push(playerAnswer.points || 0);

                    // Handle partial credit for ordering questions
                    let resultSymbol;
                    if (playerAnswer.isPoll) {
                        resultSymbol = '–'; // poll: no verdict
                    } else if (playerAnswer.isCorrect) {
                        resultSymbol = '✓';
                    } else if (playerAnswer.partialScore !== undefined && playerAnswer.partialScore > 0) {
                        // Show partial score percentage for ordering questions
                        resultSymbol = `~${Math.round(playerAnswer.partialScore * 100)}%`;
                    } else {
                        resultSymbol = '✗';
                    }
                    row.push(resultSymbol);

                    // Collect analytics
                    if (playerAnswer.isCorrect || (playerAnswer.partialScore && playerAnswer.partialScore === 1)) {
                        correctCount++;
                    } else {
                        wrongAnswers[displayAnswer] = (wrongAnswers[displayAnswer] || 0) + 1;
                    }

                    totalTime += (playerAnswer.timeMs || 0) / 1000;
                    totalPointsEarned += playerAnswer.points || 0;
                    responseCount++;

                    playerPerformances.push({
                        name: player.name,
                        time: playerAnswer.timeMs / 1000,
                        correct: playerAnswer.isCorrect,
                        points: playerAnswer.points
                    });
                } else {
                    row.push('"No Answer"');
                    row.push('0');
                    row.push('0');
                    row.push('✗');

                    playerPerformances.push({
                        name: player.name,
                        time: 0,
                        correct: false,
                        points: 0
                    });
                }
            });

            // Calculate analytics
            const successRate = responseCount > 0 ? (correctCount / responseCount * 100).toFixed(1) : '0';
            const avgTime = responseCount > 0 ? (totalTime / responseCount).toFixed(1) : '0';

            // Find who struggled most
            const strugglers = playerPerformances
                .filter(p => !p.correct)
                .sort((a, b) => a.points - b.points || b.time - a.time);
            const hardestFor = strugglers.length > 0 ? strugglers[0].name : 'None';

            // Find most common wrong answer
            const wrongEntries = Object.entries(wrongAnswers);
            const mostCommonWrong = wrongEntries.length > 0
                ? wrongEntries.reduce((a, b) => a[1] > b[1] ? a : b)
                : null;
            const commonWrongText = mostCommonWrong
                ? `"${mostCommonWrong[0]}" (${mostCommonWrong[1]} players)`
                : 'N/A';

            // Add analytics columns
            row.push(`${successRate}%`);
            row.push(avgTime);
            row.push(totalPointsEarned);
            row.push(this._sanitizeCsvValue(hardestFor));
            row.push(this._sanitizeCsvValue(commonWrongText));

            csv += row.join(',') + '\n';
        });

        // Add summary
        csv += this._generateSummary(data, header.length);

        return csv;
    }

    /**
     * Generate summary rows for analytics CSV
     */
    _generateSummary(data, totalColumns) {
        const totalPlayers = data.results.length;
        const totalQuestions = data.questions.length;

        // Correctness, not points: scores carry difficulty multipliers and time
        // bonuses, so a points/(players x questions x 100) ratio routinely
        // reports rates well over 100%. Same computation as the score shown
        // beside this game in the results list.
        const overallSuccess = this._computeAverageScore(data.results).toFixed(1);

        const emptyCols = '"' + '","'.repeat(Math.max(0, totalColumns - 2)) + '"';

        // Sanitize all user-provided values to prevent CSV injection
        let summary = '\n';
        summary += `"=== GAME SUMMARY ===",${emptyCols}\n`;
        summary += `"Quiz Title",${this._sanitizeCsvValue(data.quizTitle || 'Untitled Quiz')},${emptyCols}\n`;
        summary += `"Game PIN",${this._sanitizeCsvValue(data.gamePin)},${emptyCols}\n`;
        summary += `"Total Players","${totalPlayers}",${emptyCols}\n`;
        summary += `"Total Questions","${totalQuestions}",${emptyCols}\n`;
        summary += `"Overall Success Rate","${overallSuccess}%",${emptyCols}\n`;
        summary += `"Game Duration",${this._sanitizeCsvValue((data.startTime || '') + ' to ' + (data.endTime || ''))},${emptyCols}\n`;

        return summary;
    }

    /**
     * Generate fallback CSV when no question data available
     */
    _generateFallbackCSV(data) {
        let csv = '\ufeff'; // UTF-8 BOM for Excel compatibility
        csv += 'Quiz Title,Game PIN,Player Name,Score,Start Time,End Time\n';

        data.results.forEach(player => {
            const row = [
                this._sanitizeCsvValue(data.quizTitle || 'Untitled Quiz'),
                this._sanitizeCsvValue(data.gamePin),
                this._sanitizeCsvValue(player.name),
                player.score || 0,
                this._sanitizeCsvValue(data.startTime || ''),
                this._sanitizeCsvValue(data.endTime || '')
            ].join(',');
            csv += row + '\n';
        });

        return csv;
    }

    /**
     * Format a saved answer value for export, resolving option indices to the
     * option text. Answers are stored as indices for option-based question
     * types, and "1" tells an educator nothing that "Paris" does.
     * @param {*} value - Raw answer value
     * @param {Object} [question] - Question the answer belongs to
     * @returns {string} Display string
     */
    _formatAnswerValue(value, question) {
        if (value === undefined || value === null || value === '') return 'No Answer';

        const options = question?.options;
        const component = (item) => (
            Number.isInteger(item) && Array.isArray(options) && item >= 0 && item < options.length
                ? String(options[item])
                : String(item)
        );

        if (Array.isArray(value)) {
            if (value.length === 0) return 'No Answer';
            const separator = question?.type === 'ordering' ? ' → ' : ', ';
            return value.map(component).join(separator);
        }

        return component(value);
    }

    /**
     * Format a question's correct answer for export.
     * Which field holds it depends on the type (`correctOrder` for ordering,
     * `correctAnswers`/`correctIndices` for multiple-correct, ...), so the field
     * priority comes from ScoringService rather than being re-derived here.
     * @param {Object} [question] - Question data
     * @returns {string} Display string
     */
    _formatCorrectAnswer(question) {
        if (!question) return 'Unknown';
        // Poll questions have no correct answer; 'Unknown' would read as missing data
        if (ScoringService.isPollQuestion(question)) return 'N/A (poll)';

        const correct = ScoringService.getCorrectAnswerKey(question, question.type);
        const missing = correct === undefined || correct === null ||
            (Array.isArray(correct) && correct.length === 0);

        return missing ? 'Unknown' : this._formatAnswerValue(correct, question);
    }

    /**
     * Sanitize CSV value to prevent formula injection attacks
     * Uses multiple defense layers per OWASP recommendations
     * @param {string} value - Value to sanitize
     * @returns {string} - Sanitized and quoted CSV value
     */
    _sanitizeCsvValue(value) {
        if (value === null || value === undefined) return '""';
        let str = String(value);

        // Remove newlines and carriage returns (prevent row injection)
        str = str.replace(/[\r\n]+/g, ' ');

        // Escape existing double quotes
        str = str.replace(/"/g, '""');

        // Prepend single quote to values that could be interpreted as formulas
        // Covers: = + - @ and also tab, |, ! which some spreadsheets interpret
        if (/^[=+\-@\t\r|!]/.test(str)) {
            // Use tab prefix as additional protection (Excel-specific)
            // The single quote tells Excel to treat as text
            str = "'" + str;
        }

        return `"${str}"`;
    }

    /**
     * Sanitize a name for use in CSV headers (no quotes, just strip dangerous chars)
     * @param {string} name - Name to sanitize
     * @returns {string} - Sanitized name
     */
    _sanitizeHeaderName(name) {
        if (name === null || name === undefined) return 'Anonymous';
        let str = String(name);

        // Remove or escape characters that could be dangerous in headers
        if (/^[=+\-@\t\r]/.test(str)) {
            str = "'" + str;
        }

        // Also escape double quotes
        return str.replace(/"/g, "'");
    }
}

module.exports = { ResultsService };
