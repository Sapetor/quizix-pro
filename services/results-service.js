/**
 * Results Service
 * Handles quiz results management and export
 * Extracted from server.js for better organization
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

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
     * Save quiz results
     */
    async saveResults(quizTitle, gamePin, results, startTime, endTime, questions) {
        if (!quizTitle || !gamePin || !results) {
            throw new Error('Invalid results data');
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

        await fs.writeFile(
            path.join(this.resultsDir, filename),
            JSON.stringify(resultsData, null, 2),
            'utf8'
        );

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
        this.logger.info('Listing results');

        if (!fsSync.existsSync(this.resultsDir)) {
            this.logger.info('Results directory does not exist');
            return [];
        }

        const files = fsSync.readdirSync(this.resultsDir)
            .filter(file => file.startsWith('results_') && file.endsWith('.json'))
            .map(filename => {
                try {
                    const filePath = path.join(this.resultsDir, filename);
                    const stats = fsSync.statSync(filePath);
                    const data = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));

                    return {
                        filename,
                        quizTitle: data.quizTitle || 'Untitled Quiz',
                        gamePin: data.gamePin,
                        participantCount: data.results?.length || 0,
                        startTime: data.startTime,
                        endTime: data.endTime,
                        saved: data.saved || stats.mtime.toISOString(),
                        fileSize: stats.size,
                        results: data.results || []
                    };
                } catch (error) {
                    this.logger.error(`Error reading result file ${filename}:`, error);
                    return null;
                }
            })
            .filter(result => result !== null)
            .sort((a, b) => new Date(b.saved) - new Date(a.saved));

        this.logger.info(`Found ${files.length} result files`);
        return files;
    }

    /**
     * Delete a result file
     */
    async deleteResult(filename) {
        this.logger.info(`DELETE request for file: ${filename}`);

        if (!this.validateFilename(filename)) {
            throw new Error('Invalid filename format');
        }

        const filePath = path.join(this.resultsDir, filename);
        this.logger.info(`Checking file path: ${filePath}`);
        this.logger.info(`File exists: ${fsSync.existsSync(filePath)}`);

        if (!fsSync.existsSync(filePath)) {
            throw new Error('Result file not found');
        }

        fsSync.unlinkSync(filePath);
        this.logger.info(`Result file deleted successfully: ${filename}`);

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
            throw new Error('Invalid filename format');
        }

        const filePath = path.join(this.resultsDir, filename);

        if (!fsSync.existsSync(filePath)) {
            throw new Error('Result file not found');
        }

        try {
            const data = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
            return data;
        } catch (parseError) {
            this.logger.error(`Failed to parse result file ${filename}:`, parseError);
            throw new Error('Result file is corrupted or invalid JSON');
        }
    }

    /**
     * Export results in various formats
     */
    async exportResults(filename, format, exportType = 'analytics') {
        if (!this.validateFilename(filename)) {
            throw new Error('Invalid filename format');
        }

        if (!['csv', 'json'].includes(format.toLowerCase())) {
            throw new Error('Unsupported export format. Use csv or json.');
        }

        if (!['analytics', 'simple'].includes(exportType)) {
            throw new Error('Invalid export type. Use analytics or simple.');
        }

        const filePath = path.join(this.resultsDir, filename);

        if (!fsSync.existsSync(filePath)) {
            throw new Error('Result file not found');
        }

        let data;
        try {
            data = JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
        } catch (parseError) {
            this.logger.error(`Failed to parse result file for export ${filename}:`, parseError);
            throw new Error('Result file is corrupted or invalid JSON');
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
                        let correctAnswer = question ? question.correctAnswer : 'Unknown';
                        let playerAnswer = answer.answer;

                        // Handle different question types
                        if (question?.type === 'ordering') {
                            // For ordering questions, show with option text if available
                            if (question.correctOrder && question.correctOrder.length > 0) {
                                if (question.options && question.options.length > 0) {
                                    correctAnswer = question.correctOrder.map(idx => question.options[idx] || `#${idx}`).join(' → ');
                                } else {
                                    correctAnswer = question.correctOrder.join(' → ');
                                }
                            }
                            if (Array.isArray(playerAnswer)) {
                                if (question.options && question.options.length > 0) {
                                    playerAnswer = playerAnswer.map(idx => question.options[idx] || `#${idx}`).join(' → ');
                                } else {
                                    playerAnswer = playerAnswer.join(' → ');
                                }
                            }
                        } else if (question?.type === 'multiple-correct' && question.correctAnswers) {
                            // For multiple correct
                            correctAnswer = question.correctAnswers.join(', ');
                            if (Array.isArray(playerAnswer)) {
                                playerAnswer = playerAnswer.join(', ');
                            }
                        } else {
                            // Handle array answers for other types
                            if (Array.isArray(correctAnswer)) {
                                correctAnswer = correctAnswer.join(', ');
                            }
                            if (Array.isArray(playerAnswer)) {
                                playerAnswer = playerAnswer.join(', ');
                            }
                        }

                        const isCorrectText = answer.isCorrect ? 'Yes' : 'No';
                        const timeSeconds = Math.round((answer.timeMs || 0) / 1000);
                        const points = answer.points || 0;

                        const row = [
                            this._sanitizeCsvValue(player.name || 'Anonymous'),
                            qIndex + 1,
                            this._sanitizeCsvValue(questionText),
                            this._sanitizeCsvValue(playerAnswer || 'No Answer'),
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
        let header = ['Question', 'Correct Answer', 'Difficulty'];

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
        header.push('Total Points Possible');
        header.push('Total Points Earned');
        header.push('Hardest For');
        header.push('Common Wrong Answer');

        csv += header.map(h => `"${h}"`).join(',') + '\n';

        // Generate question rows
        data.questions.forEach((question, qIndex) => {
            const questionText = (question.text || '').replace(/"/g, '""');
            let correctAnswer = question.correctAnswer;

            // Handle different question types
            if (question.type === 'ordering' && question.correctOrder && question.correctOrder.length > 0) {
                // For ordering questions, show the sequence with option text if available
                if (question.options && question.options.length > 0) {
                    correctAnswer = question.correctOrder.map(idx => question.options[idx] || `#${idx}`).join(' → ');
                } else {
                    correctAnswer = question.correctOrder.join(' → ');
                }
            } else if (question.type === 'multiple-correct' && question.correctAnswers && question.correctAnswers.length > 0) {
                // For multiple correct, show comma-separated
                correctAnswer = question.correctAnswers.join(', ');
            } else if (Array.isArray(correctAnswer)) {
                correctAnswer = correctAnswer.join(', ');
            }

            let row = [
                this._sanitizeCsvValue(questionText),
                this._sanitizeCsvValue(correctAnswer),
                this._sanitizeCsvValue(question.difficulty || 'medium')
            ];

            // Analytics tracking
            let correctCount = 0;
            let totalTime = 0;
            let responseCount = 0;
            let totalPointsPossible = 0;
            let totalPointsEarned = 0;
            let playerPerformances = [];
            let wrongAnswers = {};

            // Add player data columns
            players.forEach(player => {
                const playerAnswer = player.answers && player.answers[qIndex];

                if (playerAnswer) {
                    let displayAnswer = playerAnswer.answer;
                    if (Array.isArray(displayAnswer)) {
                        displayAnswer = displayAnswer.join(', ');
                    }

                    row.push(this._sanitizeCsvValue(displayAnswer));
                    row.push(Math.round((playerAnswer.timeMs || 0) / 1000));
                    row.push(playerAnswer.points || 0);

                    // Handle partial credit for ordering questions
                    let resultSymbol;
                    if (playerAnswer.isCorrect) {
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
                        wrongAnswers[String(displayAnswer)] = (wrongAnswers[String(displayAnswer)] || 0) + 1;
                    }

                    totalTime += (playerAnswer.timeMs || 0) / 1000;
                    totalPointsEarned += playerAnswer.points || 0;
                    responseCount++;
                    totalPointsPossible = Math.max(totalPointsPossible, playerAnswer.points || 100);

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
            totalPointsPossible *= players.length;

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
            row.push(totalPointsPossible);
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
        const gameScore = data.results.reduce((sum, p) => sum + (p.score || 0), 0);
        const maxPossibleScore = totalPlayers * totalQuestions * 100;
        const overallSuccess = maxPossibleScore > 0 ? (gameScore / maxPossibleScore * 100).toFixed(1) : '0';

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
     * Sanitize CSV value to prevent formula injection attacks
     * Prepends single quote to values starting with =, +, -, @, or tab
     * @param {string} value - Value to sanitize
     * @returns {string} - Sanitized and quoted CSV value
     */
    _sanitizeCsvValue(value) {
        if (value === null || value === undefined) return '""';
        let str = String(value);

        // Escape existing double quotes
        str = str.replace(/"/g, '""');

        // Prepend single quote to values that could be interpreted as formulas
        if (/^[=+\-@\t\r]/.test(str)) {
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
