/**
 * Simple Results Downloader
 * Simple tool to populate dropdown with available results and download CSV
 */

import { translationManager, showErrorAlert, showSuccessAlert } from './translation-manager.js';
import { unifiedErrorHandler as errorHandler } from './unified-error-handler.js';
import { logger } from '../core/config.js';
import { resultsManagerService } from '../services/results-manager-service.js';
import { APIHelper } from './api-helper.js';

export class SimpleResultsDownloader {
    constructor() {
        this.currentExportFormat = 'simple'; // Default to simple format for this tool

        // Listen to results service updates
        resultsManagerService.addListener((event, data) => {
            this.handleServiceUpdate(event, data);
        });

        logger.debug('🔧 SimpleResultsDownloader initialized');
    }

    /**
     * Handle updates from the results manager service
     */
    handleServiceUpdate(event, data) {
        switch (event) {
            case 'resultsUpdated':
                this.onResultsUpdated(data);
                break;
            case 'downloadComplete':
                showSuccessAlert(`Downloaded: ${data.downloadFilename}`);
                break;
            case 'error':
                logger.error('Service error:', data);
                break;
        }
    }

    /**
     * Handle results update from service
     */
    onResultsUpdated(results) {
        // Update dropdown if it's currently visible
        const dropdown = document.getElementById('results-dropdown');
        if (dropdown && dropdown.style.display !== 'none') {
            this.populateDropdownWithResults(results);
        }
    }

    /**
     * Initialize the dropdown with available results using the service
     */
    async initializeDropdown() {
        const dropdown = document.getElementById('results-dropdown');
        const downloadButton = document.getElementById('download-selected');

        if (!dropdown) {
            logger.warn('Results dropdown not found');
            return;
        }

        try {
            // Clear existing options except the first placeholder
            dropdown.innerHTML = '<option value="" data-translate="select_results">Select results to download...</option>';

            // Fetch available results using the service
            logger.debug('📊 Fetching results via service...');
            const results = await resultsManagerService.fetchResults();

            this.populateDropdownWithResults(results);

            // Setup download button handler
            if (downloadButton) {
                downloadButton.onclick = () => this.downloadSelected();
                downloadButton.disabled = results.length === 0;
                downloadButton.textContent = translationManager.getTranslationSync('download_csv') || 'Download CSV';
            }

        } catch (error) {
            logger.error('❌ Error initializing results dropdown:', error);
            showErrorAlert('failed_fetch_results');

            // Show error in dropdown
            const errorOption = document.createElement('option');
            errorOption.value = '';
            errorOption.textContent = translationManager.getTranslationSync('error_loading_results') || 'Error loading results';
            errorOption.disabled = true;
            dropdown.appendChild(errorOption);

            if (downloadButton) {
                downloadButton.disabled = true;
            }
        }
    }

    /**
     * Populate dropdown with results data
     */
    populateDropdownWithResults(results) {
        const dropdown = document.getElementById('results-dropdown');
        const downloadButton = document.getElementById('download-selected');

        if (!dropdown) return;

        // Clear existing options except the first placeholder
        const placeholder = dropdown.querySelector('option[value=""]');
        dropdown.innerHTML = '';
        if (placeholder) {
            dropdown.appendChild(placeholder);
        } else {
            dropdown.innerHTML = '<option value="" data-translate="select_results">Select results to download...</option>';
        }

        if (results.length === 0) {
            const noResultsOption = document.createElement('option');
            noResultsOption.value = '';
            noResultsOption.textContent = translationManager.getTranslationSync('no_results_found') || 'No results found';
            noResultsOption.disabled = true;
            dropdown.appendChild(noResultsOption);

            if (downloadButton) {
                downloadButton.disabled = true;
            }
            return;
        }

        // Populate dropdown with results (most recent first)
        results.forEach(result => {
            const option = document.createElement('option');
            option.value = result.filename;
            option.textContent = `${result.quizTitle} (PIN: ${result.gamePin}) - ${this.formatDate(result.saved)}`;
            dropdown.appendChild(option);
        });

        if (downloadButton) {
            downloadButton.disabled = false;
        }

        logger.debug(`📊 Populated dropdown with ${results.length} results`);
    }

    /**
     * Download the selected result
     */
    async downloadSelected() {
        const dropdown = document.getElementById('results-dropdown');
        const downloadButton = document.getElementById('download-selected');

        if (!dropdown || !dropdown.value) {
            showErrorAlert('Please select a result to download');
            return;
        }

        const filename = dropdown.value;

        try {
            if (downloadButton) {
                downloadButton.disabled = true;
                downloadButton.textContent = translationManager.getTranslationSync('loading') || 'Loading...';
            }

            logger.debug(`📊 Downloading result: ${filename}`);

            // Simple direct API call - no over-engineered service layer
            const response = await fetch(APIHelper.getApiUrl(`api/results/${filename}/export/csv`));

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }

            // Create download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const gamePin = filename.match(/results_(\d+)_/)?.[1] || 'unknown';
            const downloadFilename = `quiz_results_${gamePin}.csv`;

            const link = document.createElement('a');
            link.href = url;
            link.download = downloadFilename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            logger.debug(`📊 Download completed: ${downloadFilename}`);

        } catch (error) {
            logger.error('❌ Download failed:', error);
            showErrorAlert('Download failed. Please try again.');
        } finally {
            if (downloadButton) {
                downloadButton.disabled = false;
                downloadButton.textContent = translationManager.getTranslationSync('download_csv') || 'Download CSV';
            }
        }
    }

    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return 'Unknown';

        try {
            const date = new Date(dateString);
            return date.toLocaleString();
        } catch (error) {
            return dateString;
        }
    }

    /**
     * Show the download tool (called when final results are shown)
     */
    async showDownloadTool() {
        logger.debug('📊 showDownloadTool called');
        const downloadSection = document.querySelector('.download-results');
        if (downloadSection) {
            downloadSection.style.display = 'block';
            await this.initializeDropdown();
            this.addViewAllResultsButton();
        } else {
            logger.error('📊 Download section not found in DOM');
        }
    }

    /**
     * Add a "View All Results" button for cross-tool navigation
     */
    addViewAllResultsButton() {
        const downloadSection = document.querySelector('.download-results');
        if (!downloadSection) return;

        // Check if button already exists
        if (downloadSection.querySelector('.view-all-results-btn')) return;

        const viewAllBtn = document.createElement('button');
        viewAllBtn.className = 'view-all-results-btn';
        viewAllBtn.textContent = translationManager.getTranslationSync('view_all_results') || 'View All Results';
        viewAllBtn.style.cssText = `
            margin-left: 10px;
            padding: 8px 16px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;

        viewAllBtn.addEventListener('click', () => {
            this.openFullResultsViewer();
        });

        // Add after the download button
        const downloadButton = downloadSection.querySelector('#download-selected');
        if (downloadButton && downloadButton.parentNode) {
            downloadButton.parentNode.insertBefore(viewAllBtn, downloadButton.nextSibling);
        }
    }

    /**
     * Open the full results viewer with lazy loading
     */
    async openFullResultsViewer() {
        logger.debug('📊 Opening full results viewer from simple downloader');

        try {
            // Lazy load results viewer if not already loaded
            if (!window.resultsViewer) {
                logger.debug('Lazy loading Results Viewer from simple downloader...');
                const { resultsViewer } = await import('./results-viewer.js');
                window.resultsViewer = resultsViewer;
                logger.debug('Results Viewer lazy loaded from simple downloader');
            }

            // Open the results viewer modal
            window.resultsViewer.showModal();

        } catch (error) {
            logger.error('Failed to load results viewer:', error);
            showErrorAlert('Could not open detailed results viewer');
        }
    }

    /**
     * Hide the download tool
     */
    hideDownloadTool() {
        const downloadSection = document.querySelector('.download-results');
        if (downloadSection) {
            downloadSection.style.display = 'none';
        }
    }
}

// Create and export singleton instance
export const simpleResultsDownloader = new SimpleResultsDownloader();

// Make available globally
window.simpleResultsDownloader = simpleResultsDownloader;

export default simpleResultsDownloader;