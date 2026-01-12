/**
 * Results Exporter - Export and download functionality for quiz results
 * Handles format selection, downloads, and export operations
 */

import { logger } from '../../core/config.js';
import { resultsManagerService } from '../../services/results-manager-service.js';
import { showErrorAlert } from '../translation-manager.js';
import { createFormatSelectionModal } from './results-renderer.js';

export class ResultsExporter {
    constructor() {
        this.currentExportFormat = 'analytics';
    }

    /**
     * Set the current export format
     * @param {string} format - Export format key
     */
    setExportFormat(format) {
        this.currentExportFormat = format;
        logger.debug(`Export format changed to: ${this.currentExportFormat}`);
    }

    /**
     * Get the current export format
     * @returns {string} Current format key
     */
    getExportFormat() {
        return this.currentExportFormat;
    }

    /**
     * Download a result with the specified or current format
     * @param {string} filename - Result filename
     * @param {string} [format] - Export format (optional, uses current if not specified)
     * @returns {Promise<void>}
     */
    async downloadResult(filename, format = null) {
        const exportFormat = format || this.currentExportFormat;
        logger.debug(`Downloading result ${filename} as ${exportFormat}`);

        try {
            await resultsManagerService.downloadResult(filename, exportFormat, 'csv');
        } catch (error) {
            logger.error('Error downloading result:', error);
            showErrorAlert('Failed to download result');
        }
    }

    /**
     * Show download options modal for a result
     * @param {string} filename - Result filename
     * @param {Array} filteredResults - Current filtered results array
     * @returns {Promise<void>}
     */
    async showDownloadOptions(filename, filteredResults) {
        const result = filteredResults?.find(r => r.filename === filename);
        if (!result) {
            logger.error(`Result not found: ${filename}`);
            return;
        }

        const formats = resultsManagerService.getAvailableFormats(result);

        if (formats.length <= 1) {
            await this.downloadResult(filename, formats[0]?.key || 'analytics');
            return;
        }

        this.showFormatSelectionModal(filename, formats);
    }

    /**
     * Display the format selection modal
     * @param {string} filename - Result filename
     * @param {Array} formats - Available format options
     */
    showFormatSelectionModal(filename, formats) {
        const modal = createFormatSelectionModal(filename, formats, this.currentExportFormat);
        document.body.appendChild(modal);

        const content = modal.querySelector('div');
        const cancelBtn = content.querySelector('#format-cancel-btn');
        const downloadBtn = content.querySelector('#format-download-btn');

        const closeModal = () => {
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
        };

        cancelBtn.addEventListener('click', closeModal);

        downloadBtn.addEventListener('click', async () => {
            const selectedFormat = content.querySelector('input[name="export-format"]:checked')?.value || 'analytics';
            closeModal();
            await this.downloadResult(filename, selectedFormat);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    /**
     * Export analytics report for a result
     * @param {string} filename - Result filename
     * @returns {Promise<void>}
     */
    async exportAnalyticsReport(filename) {
        try {
            logger.info('Analytics export requested for:', filename);
            await resultsManagerService.downloadResult(filename, 'analytics', 'csv');
            logger.debug('Analytics report downloaded successfully');
        } catch (error) {
            logger.error('Failed to export analytics report:', error);
            showErrorAlert('Failed to export analytics report');
        }
    }
}

export const resultsExporter = new ResultsExporter();

export default resultsExporter;
