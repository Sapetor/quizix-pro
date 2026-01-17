/**
 * Excel Question Parser
 * Handles Excel/XLSX file parsing and question detection
 * Extracted from generator.js for modularity and testability
 */

import { logger } from '../core/config.js';
import { showAlert } from '../utils/translation-manager.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';
import { getItem } from '../utils/storage-utils.js';

// Import XLSX library for Excel processing (loaded globally)
const XLSX = window.XLSX;

/**
 * Batch sizes based on AI provider capabilities
 */
const BATCH_SIZES = {
    'ollama': 5,
    'huggingface': 5,
    'openai': 10,
    'claude': 10,
    'gemini': 10
};

export class ExcelQuestionParser {
    constructor() {
        this.batchInfo = null;
        this.detectedQuestionCount = 0;
    }

    /**
     * Check if XLSX library is available
     * @returns {boolean} True if available
     */
    isAvailable() {
        return !!XLSX;
    }

    /**
     * Parse Excel file and return structured data
     * @param {File} file - Excel file to parse
     * @returns {Promise<Object>} Parsed data with rows and metadata
     */
    async parseFile(file) {
        if (!XLSX) {
            throw new Error('Excel processing library not available');
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                errorHandler.safeExecute(
                    () => {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });

                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                        logger.debug('Excel data parsed:', jsonData.length, 'rows');

                        resolve({
                            data: jsonData,
                            filename: file.name,
                            sheetName: firstSheetName,
                            rowCount: jsonData.length
                        });
                    },
                    { operation: 'excel-file-parsing' },
                    (error) => reject(new Error('Failed to parse Excel file: ' + error.message))
                );
            };

            reader.onerror = () => reject(new Error('Failed to read Excel file'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Detect Excel format (headers, question column, answer columns)
     * @param {Array} jsonData - Parsed Excel data
     * @returns {Object} Format detection result
     */
    detectFormat(jsonData) {
        if (!jsonData || jsonData.length < 2) {
            return { questionCol: 0, answerCols: [1, 2, 3, 4], hasHeaders: false };
        }

        const headerRow = jsonData[0];
        const dataRow = jsonData[1];

        // Check if first row looks like headers
        const hasHeaders = headerRow && headerRow.some(cell =>
            cell && typeof cell === 'string' &&
            (cell.toLowerCase().includes('question') ||
             cell.toLowerCase().includes('pregunta') ||
             cell.toLowerCase().includes('answer') ||
             cell.toLowerCase().includes('respuesta') ||
             cell.toLowerCase().includes('option') ||
             cell.toLowerCase().includes('opción') ||
             cell.toLowerCase().includes('correct') ||
             cell.toLowerCase().includes('correcto'))
        );

        let questionCol = 0;
        let answerCols = [];
        let correctAnswerCol = -1;

        if (hasHeaders) {
            headerRow.forEach((header, index) => {
                if (!header) return;
                const headerLower = header.toString().toLowerCase();

                if (headerLower.includes('question') || headerLower.includes('pregunta')) {
                    questionCol = index;
                } else if (headerLower.includes('answer') || headerLower.includes('respuesta') ||
                           headerLower.includes('option') || headerLower.includes('opción')) {
                    answerCols.push(index);
                } else if (headerLower.includes('correct') || headerLower.includes('correcto')) {
                    correctAnswerCol = index;
                }
            });

            if (answerCols.length === 0) {
                for (let i = questionCol + 1; i < headerRow.length && i < questionCol + 5; i++) {
                    if (headerRow[i] && headerRow[i].toString().trim()) {
                        answerCols.push(i);
                    }
                }
            }
        } else {
            // No headers - infer from data
            if (dataRow) {
                let longestTextCol = 0;
                let longestLength = 0;

                dataRow.forEach((cell, index) => {
                    if (cell && cell.toString().length > longestLength) {
                        longestLength = cell.toString().length;
                        longestTextCol = index;
                    }
                });

                questionCol = longestTextCol;

                for (let i = 0; i < dataRow.length; i++) {
                    if (i !== questionCol && dataRow[i] && dataRow[i].toString().trim()) {
                        answerCols.push(i);
                    }
                }
            }
        }

        if (answerCols.length === 0) {
            answerCols = [1, 2, 3, 4].filter(col => col < (headerRow?.length || 5));
        }

        logger.debug('Excel format detected:', { hasHeaders, questionCol, answerCols, correctAnswerCol });

        return { hasHeaders, questionCol, answerCols, correctAnswerCol };
    }

    /**
     * Convert Excel data to structured text for AI processing
     * @param {Array} jsonData - Parsed Excel data
     * @param {string} filename - Original filename
     * @param {string} provider - AI provider name
     * @param {number} batchStart - Starting row for batch
     * @param {number} batchSize - Batch size (null for auto)
     * @returns {string} Structured text for AI
     */
    convertToStructuredText(jsonData, filename, provider = 'ollama', batchStart = 0, batchSize = null) {
        if (!jsonData || jsonData.length < 2) {
            throw new Error('Excel file must contain at least a header row and one data row');
        }

        const totalRows = jsonData.length - 1;
        const optimalBatchSize = BATCH_SIZES[provider] || 5;

        // Setup batch info if needed
        if (totalRows > optimalBatchSize && batchSize === null && !this.batchInfo) {
            this.batchInfo = {
                totalQuestions: totalRows,
                batchSize: optimalBatchSize,
                totalBatches: Math.ceil(totalRows / optimalBatchSize),
                currentBatch: 1,
                originalData: jsonData,
                filename: filename
            };

            const modelName = provider === 'ollama'
                ? getItem('ollama_selected_model') || 'Unknown Model'
                : provider.charAt(0).toUpperCase() + provider.slice(1);

            showAlert(
                `Excel file has ${totalRows} questions. Processing in ${this.batchInfo.totalBatches} batches of ${optimalBatchSize} questions each with ${modelName} for better accuracy.`,
                'info'
            );

            return this.convertToStructuredText(jsonData, filename, provider, 0, optimalBatchSize);
        }

        // Create batch-specific data
        let batchData = jsonData;
        if (batchSize !== null) {
            const hasHeaders = jsonData[0] && jsonData[0].some(cell =>
                cell && typeof cell === 'string' &&
                (cell.toLowerCase().includes('question') || cell.toLowerCase().includes('pregunta'))
            );

            const headerRows = hasHeaders ? 1 : 0;
            const startRow = headerRows + batchStart;
            const endRow = Math.min(startRow + batchSize, jsonData.length);

            batchData = hasHeaders
                ? [jsonData[0], ...jsonData.slice(startRow, endRow)]
                : jsonData.slice(startRow, endRow);
        }

        const structuredText = this.formatDataWithDetection(batchData, filename, batchStart, batchSize);

        if (batchStart === 0) {
            this.detectedQuestionCount = totalRows;
        }

        return structuredText;
    }

    /**
     * Format Excel data with detected format
     * @param {Array} jsonData - Parsed data
     * @param {string} filename - Filename
     * @param {number} batchStart - Batch start index
     * @param {number} batchSize - Batch size
     * @returns {string} Formatted text
     */
    formatDataWithDetection(jsonData, filename, batchStart = 0, batchSize = null) {
        const format = this.detectFormat(jsonData);

        let text = `# Quiz Questions from Excel File: ${filename}\n\n`;
        text += 'IMPORTANT: These are existing questions from an Excel file. Convert them exactly as written.\n\n';

        if (this.batchInfo && batchSize !== null) {
            const batchEnd = Math.min(batchStart + batchSize, this.batchInfo.totalQuestions);
            text += `BATCH PROCESSING: Questions ${batchStart + 1} to ${batchEnd} (Batch ${this.batchInfo.currentBatch} of ${this.batchInfo.totalBatches})\n\n`;
        }

        if (format.hasHeaders) {
            const headerRow = jsonData[0];
            text += 'Detected Format:\n';
            text += `- Question Column: ${headerRow[format.questionCol] || 'Column ' + String.fromCharCode(65 + format.questionCol)}\n`;
            text += `- Answer Columns: ${format.answerCols.map(col => headerRow[col] || 'Column ' + String.fromCharCode(65 + col)).join(', ')}\n\n`;
        }

        text += 'EXCEL QUESTIONS TO CONVERT:\n\n';

        const startRow = format.hasHeaders ? 1 : 0;
        let questionNumber = batchStart + 1;

        for (let i = startRow; i < jsonData.length; i++) {
            const row = jsonData[i];

            if (!row || row.length === 0 || row.every(cell => !cell || cell.toString().trim() === '')) {
                continue;
            }

            text += `Question ${questionNumber}:\n`;

            if (row[format.questionCol]) {
                text += `  Question: ${row[format.questionCol].toString().trim()}\n`;
            }

            // Handle format: A=Question, B=Correct, C/D/E=Wrong
            const allAnswers = [];
            const correctAnswerText = row[1] ? row[1].toString().trim() : '';
            const wrongAnswers = [];

            for (let j = 2; j <= 4; j++) {
                if (row[j] && row[j].toString().trim()) {
                    wrongAnswers.push(row[j].toString().trim());
                }
            }

            if (correctAnswerText) {
                allAnswers.push(correctAnswerText);
                wrongAnswers.forEach(wrong => allAnswers.push(wrong));

                allAnswers.forEach((answer, index) => {
                    text += `  Option ${index + 1}: ${answer}\n`;
                });

                text += `  CORRECT_ANSWER_INDEX: 0\n`;
            }

            text += '\n';
            questionNumber++;
        }

        text += '\nINSTRUCTIONS FOR AI:\n';
        text += '- Convert these existing questions to JSON format\n';
        text += '- Copy ALL text EXACTLY as written - do not change any words\n';
        text += '- Use CORRECT_ANSWER_INDEX number provided for each question\n';
        text += '- Do NOT translate or modify the language\n';

        return text;
    }

    /**
     * Get current batch info
     * @returns {Object|null} Batch info or null
     */
    getBatchInfo() {
        return this.batchInfo;
    }

    /**
     * Reset batch processing state
     */
    resetBatch() {
        this.batchInfo = null;
        this.detectedQuestionCount = 0;
    }

    /**
     * Advance to next batch
     * @returns {boolean} True if there's a next batch
     */
    nextBatch() {
        if (!this.batchInfo) return false;

        this.batchInfo.currentBatch++;
        return this.batchInfo.currentBatch <= this.batchInfo.totalBatches;
    }

    /**
     * Get detected question count
     * @returns {number} Question count
     */
    getDetectedQuestionCount() {
        return this.detectedQuestionCount;
    }
}

// Export singleton instance
export const excelQuestionParser = new ExcelQuestionParser();
