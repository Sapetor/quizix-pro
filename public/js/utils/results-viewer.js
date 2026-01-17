/**
 * Results Viewer - Coordinator for viewing and managing quiz results
 * Provides a modal interface accessible from the toolbar
 *
 * This module coordinates between specialized sub-modules:
 * - ResultsRenderer: HTML generation and templates
 * - ResultsFilterManager: Filtering, sorting, and utilities
 * - ResultsExporter: Export and download functionality
 * - ResultsAnalytics: Analytics calculation and visualization
 */

import { translationManager, showErrorAlert, showSuccessAlert } from './translation-manager.js';
import { logger } from '../core/config.js';
import { resultsManagerService } from '../services/results-manager-service.js';
import { APIHelper } from './api-helper.js';
import { SwipeToDelete } from './swipe-to-delete.js';
import { bindElement } from './dom.js';
import {
    openModal,
    closeModal,
    bindOverlayClose,
    bindEscapeClose,
    getModal
} from './modal-utils.js';

// Import specialized modules
import {
    renderResultsList,
    renderParticipantsList,
    createAnalyticsUnavailableModal
} from './results-viewer/results-renderer.js';

import {
    calculateAverageScore,
    formatDate,
    formatTime,
    getScoreClass
} from './results-viewer/results-filter-manager.js';

import { resultsExporter } from './results-viewer/results-exporter.js';

import {
    calculateQuestionAnalytics,
    getQuizSummaryStats,
    reconstructQuestionsFromResults,
    createAnalyticsModal,
    createSuccessRateChart,
    createTimeVsSuccessChart,
    switchAnalyticsTab
} from './results-viewer/results-analytics.js';

export class ResultsViewer {
    constructor() {
        this.filteredResults = null;
        this.currentDetailResult = null;

        // Store modal binding handlers for cleanup
        this.modalHandlers = {
            resultsOverlay: null,
            resultsEscape: null,
            detailOverlay: null,
            detailEscape: null
        };

        this.swipeToDelete = new SwipeToDelete({
            deleteThreshold: 100,
            revealThreshold: 60,
            maxSwipeDistance: 120,
            onDelete: (filename) => this.handleSwipeDelete(filename)
        });

        this.initializeEventListeners();

        resultsManagerService.addListener((event, data) => {
            this.handleServiceUpdate(event, data);
        });

        logger.debug('ResultsViewer initialized');
    }

    // ========================================
    // Service Event Handling
    // ========================================

    handleServiceUpdate(event, data) {
        switch (event) {
            case 'loadingStart':
                this.showLoading();
                break;
            case 'loadingEnd':
                this.hideLoading();
                break;
            case 'resultsUpdated':
                this.onResultsUpdated(data);
                break;
            case 'error':
                this.showError('Failed to load quiz results: ' + data.message);
                break;
            case 'downloadComplete':
                showSuccessAlert(`Downloaded: ${data.downloadFilename}`);
                break;
            case 'resultDeleted':
                this.onResultDeleted(data);
                break;
        }
    }

    onResultsUpdated(results) {
        this.filteredResults = [...results];
        this.updateSummaryStats();
        this.filterResults();
    }

    onResultDeleted(filename) {
        if (this.filteredResults) {
            this.filteredResults = this.filteredResults.filter(r => r.filename !== filename);
            this.updateSummaryStats();
            this.renderResults();
        }

        if (this.currentDetailResult?.filename === filename) {
            this.hideDetailModal();
        }
    }

    // ========================================
    // Event Listeners
    // ========================================

    initializeEventListeners() {
        bindElement('close-results-viewer', 'click', () => this.hideModal());
        bindElement('close-result-detail', 'click', () => this.hideDetailModal());
        bindElement('search-results', 'input', () => this.filterResults());
        bindElement('sort-results', 'change', () => this.filterResults());
        bindElement('refresh-results', 'click', () => this.refreshResults());
        bindElement('download-result-csv', 'click', () => this.downloadCurrentResult());
        bindElement('delete-result', 'click', () => this.deleteCurrentResult());

        const formatSelect = document.getElementById('export-format-select');
        if (formatSelect) {
            formatSelect.addEventListener('change', (e) => {
                resultsExporter.setExportFormat(e.target.value);
            });
        }

        // Setup modal bindings using modal-utils
        const resultsModal = getModal('results-viewing-modal');
        const detailModal = getModal('result-detail-modal');

        if (resultsModal) {
            this.modalHandlers.resultsOverlay = bindOverlayClose(resultsModal, () => this.hideModal());
            this.modalHandlers.resultsEscape = bindEscapeClose(resultsModal, () => this.hideModal());
        }

        if (detailModal) {
            this.modalHandlers.detailOverlay = bindOverlayClose(detailModal, () => this.hideDetailModal());
            this.modalHandlers.detailEscape = bindEscapeClose(detailModal, () => this.hideDetailModal());
        }
    }

    // ========================================
    // Modal Management
    // ========================================

    async showModal() {
        const modal = getModal('results-viewing-modal');
        if (!modal) {
            showErrorAlert('Results viewer not available');
            return;
        }

        logger.debug('Opening results viewing modal');
        openModal(modal, { lockScroll: false });
        await this.loadResults();
        this.initSwipeToDelete();
    }

    hideModal() {
        const modal = getModal('results-viewing-modal');
        if (modal) {
            closeModal(modal, { unlockScroll: false });
        }
        this.swipeToDelete?.resetAllItems();
    }

    showDetailModal(result) {
        this.currentDetailResult = result;
        const modal = getModal('result-detail-modal');
        if (modal) {
            this.populateDetailModal(result);
            openModal(modal, { lockScroll: false });
        }
    }

    showDetailModalByFilename(filename) {
        const result = this.filteredResults?.find(r => r.filename === filename);
        if (result) {
            this.showDetailModal(result);
        } else {
            logger.warn('Result not found for filename:', filename);
        }
    }

    hideDetailModal() {
        const modal = getModal('result-detail-modal');
        if (modal) {
            closeModal(modal, { unlockScroll: false });
        }
        this.currentDetailResult = null;
    }

    // ========================================
    // Data Loading
    // ========================================

    async loadResults() {
        try {
            const results = await resultsManagerService.fetchResults();
            logger.debug(`Loaded ${results.length} results`);
        } catch (error) {
            logger.error('Error loading results:', error);
            this.showError('Failed to load quiz results');
        }
    }

    async refreshResults() {
        try {
            await resultsManagerService.fetchResults(true);
            showSuccessAlert('Results refreshed successfully');
        } catch (error) {
            logger.error('Error refreshing results:', error);
            showErrorAlert('Failed to refresh results');
        }
    }

    // ========================================
    // UI State Management
    // ========================================

    showLoading() {
        const loadingEl = document.getElementById('results-loading');
        if (loadingEl) {
            loadingEl.style.display = 'flex';
        }
    }

    hideLoading() {
        const loadingEl = document.getElementById('results-loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    showError(message) {
        const resultsList = document.getElementById('results-list');
        if (resultsList) {
            resultsList.innerHTML = `
                <div class="empty-results empty-state">
                    <div class="empty-state-illustration">
                        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M60 20L15 100h90L60 20z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2.5" opacity="0.5"/>
                            <line x1="60" y1="45" x2="60" y2="70" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
                            <circle cx="60" cy="82" r="3" fill="currentColor" opacity="0.7"/>
                            <circle cx="25" cy="95" r="2" fill="currentColor" opacity="0.3"/>
                            <circle cx="95" cy="95" r="2" fill="currentColor" opacity="0.3"/>
                        </svg>
                    </div>
                    <h4>Error</h4>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    updateSummaryStats() {
        if (!this.filteredResults) return;

        const stats = resultsManagerService.calculateSummaryStats(this.filteredResults);

        this.updateStatElement('total-quizzes', stats.totalQuizzes);
        this.updateStatElement('total-participants', stats.totalParticipants);
        this.updateStatElement('avg-score', `${stats.averageScore}%`);
    }

    updateStatElement(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    }

    // ========================================
    // Filtering and Rendering
    // ========================================

    filterResults() {
        const allResults = Array.from(resultsManagerService.resultsCache.values());
        if (!allResults.length) return;

        const searchTerm = document.getElementById('search-results')?.value.toLowerCase() || '';
        const sortBy = document.getElementById('sort-results')?.value || 'date-desc';

        this.filteredResults = resultsManagerService.filterResults(allResults, searchTerm, sortBy);
        this.renderResults();
    }

    renderResults() {
        const resultsList = document.getElementById('results-list');
        if (!resultsList) return;

        resultsList.innerHTML = renderResultsList(
            this.filteredResults,
            calculateAverageScore,
            formatDate
        );

        this.attachResultItemListeners(resultsList);

        if (this.swipeToDelete) {
            this.swipeToDelete.refresh();
        }
    }

    attachResultItemListeners(resultsList) {
        resultsList.querySelectorAll('.result-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.result-actions') && !e.target.closest('.swipe-delete-action')) {
                    const filename = item.dataset.filename;
                    const result = this.filteredResults.find(r => r.filename === filename);
                    if (result) {
                        this.showDetailModal(result);
                    }
                }
            });

            const deleteAction = item.querySelector('.swipe-delete-action');
            if (deleteAction) {
                deleteAction.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const filename = item.dataset.filename;
                    if (filename) {
                        this.handleSwipeDelete(filename);
                    }
                });
            }
        });

        // Attach action button handlers via delegation
        resultsList.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn) return;

            const action = actionBtn.dataset.action;
            const filename = actionBtn.dataset.filename;

            switch (action) {
                case 'analytics':
                    this.showQuestionAnalytics(this.filteredResults.find(r => r.filename === filename));
                    break;
                case 'download':
                    this.showDownloadOptions(filename);
                    break;
                case 'delete':
                    this.quickDelete(filename);
                    break;
            }
        });
    }

    initSwipeToDelete() {
        const resultsList = document.getElementById('results-list');
        if (resultsList) {
            this.swipeToDelete.init(resultsList, '.result-item');
        }
    }

    // ========================================
    // Detail Modal
    // ========================================

    async populateDetailModal(result) {
        let fullResult = result;
        if (!result.results && result.filename) {
            try {
                const response = await fetch(APIHelper.getApiUrl(`api/results/${result.filename}`));
                if (response.ok) {
                    fullResult = await response.json();
                    fullResult.filename = result.filename;
                }
            } catch (error) {
                logger.error('Error fetching detailed results:', error);
            }
        }

        const untitledQuiz = translationManager.getTranslationSync('untitled_quiz') || 'Untitled Quiz';
        const unknown = translationManager.getTranslationSync('unknown') || 'Unknown';

        document.getElementById('result-detail-title').textContent = `${fullResult.quizTitle || untitledQuiz} - Results`;
        document.getElementById('detail-quiz-title').textContent = fullResult.quizTitle || untitledQuiz;
        document.getElementById('detail-game-pin').textContent = fullResult.gamePin || unknown;
        document.getElementById('detail-date').textContent = formatDate(fullResult.saved);
        document.getElementById('detail-participants').textContent = fullResult.results?.length || 0;
        document.getElementById('detail-avg-score').textContent = `${calculateAverageScore(fullResult)}%`;

        const participantResults = document.getElementById('participant-results');
        if (!participantResults) return;

        participantResults.innerHTML = renderParticipantsList(
            fullResult.results,
            getScoreClass,
            formatTime
        );
    }

    // ========================================
    // Delete Operations
    // ========================================

    async handleSwipeDelete(filename) {
        if (!translationManager.showConfirm('confirm_delete_result')) {
            this.swipeToDelete.refresh();
            return;
        }

        try {
            logger.debug(`Swipe deleting result: ${filename}`);
            await resultsManagerService.deleteResult(filename);
        } catch (error) {
            logger.error('Error deleting result via swipe:', error);
            showErrorAlert('Failed to delete result');
            this.swipeToDelete.refresh();
        }
    }

    async quickDelete(filename) {
        if (!translationManager.showConfirm('confirm_delete_result')) {
            return;
        }

        try {
            logger.debug(`Deleting result: ${filename}`);
            await resultsManagerService.deleteResult(filename);
        } catch (error) {
            logger.error('Error deleting result:', error);
            showErrorAlert('Failed to delete result');
        }
    }

    async deleteCurrentResult() {
        if (!this.currentDetailResult) return;
        await this.quickDelete(this.currentDetailResult.filename);
        this.hideDetailModal();
    }

    // ========================================
    // Download Operations
    // ========================================

    async quickDownload(filename, format = null) {
        await resultsExporter.downloadResult(filename, format);
    }

    async showDownloadOptions(filename) {
        await resultsExporter.showDownloadOptions(filename, this.filteredResults);
    }

    async downloadCurrentResult() {
        if (!this.currentDetailResult) return;
        await this.quickDownload(this.currentDetailResult.filename);
    }

    // ========================================
    // Analytics
    // ========================================

    async showQuestionAnalytics(result) {
        try {
            this.showLoading();

            let fullResult = result;
            if (!result.results && result.filename) {
                try {
                    const response = await fetch(APIHelper.getApiUrl(`api/results/${result.filename}`));
                    if (response.ok) {
                        fullResult = await response.json();
                        fullResult.filename = result.filename;
                    } else {
                        throw new Error(`Failed to fetch results: ${response.status}`);
                    }
                } catch (error) {
                    logger.error('Error fetching detailed results for analytics:', error);
                    this.hideLoading();
                    this.showError('Failed to load detailed data for analytics. Please try again.');
                    return;
                }
            }

            let questions = fullResult.questions || fullResult.questionMetadata || [];
            const results = fullResult.results || [];

            if (questions.length === 0 && results.length > 0) {
                questions = reconstructQuestionsFromResults(results);
                if (questions.length > 0) {
                    logger.debug(`Reconstructed ${questions.length} questions from results`);
                    fullResult.questions = questions;
                } else {
                    this.hideLoading();
                    this.showAnalyticsUnavailableModal(fullResult);
                    return;
                }
            } else if (questions.length === 0) {
                this.hideLoading();
                this.showAnalyticsUnavailableModal(fullResult);
                return;
            }

            if (results.length === 0) {
                this.hideLoading();
                this.showError('No player response data available for analytics.');
                return;
            }

            const questionAnalytics = calculateQuestionAnalytics(fullResult);
            const summaryStats = getQuizSummaryStats(questionAnalytics);

            this.hideLoading();
            this.displayAnalyticsModal(fullResult, questionAnalytics, summaryStats);

        } catch (error) {
            logger.error('Error in showQuestionAnalytics:', error);
            this.hideLoading();
            this.showError('Failed to generate analytics. Please check the console for details.');
        }
    }

    displayAnalyticsModal(result, analytics, summary) {
        const modal = createAnalyticsModal(result, analytics, summary);
        document.body.appendChild(modal);

        // Attach tab switching handlers
        modal.querySelectorAll('.analytics-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = btn.dataset.tab;
                switchAnalyticsTab(e, tabName);
            });
        });

        // Attach export handler
        const exportBtn = modal.querySelector('[data-action="export-analytics"]');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportAnalyticsReport(exportBtn.dataset.filename);
            });
        }

        // Create charts after modal is in DOM
        setTimeout(() => {
            createSuccessRateChart(analytics);
            createTimeVsSuccessChart(analytics);
        }, 100);
    }

    showAnalyticsUnavailableModal(result) {
        const modal = createAnalyticsUnavailableModal(result);
        document.body.appendChild(modal);

        // Attach view basic results handler
        const viewBasicBtn = modal.querySelector('[data-action="view-basic"]');
        if (viewBasicBtn) {
            viewBasicBtn.addEventListener('click', () => {
                this.showDetailModalByFilename(viewBasicBtn.dataset.filename);
                modal.remove();
            });
        }
    }

    switchAnalyticsTab(event, tabName) {
        switchAnalyticsTab(event, tabName);
    }

    async exportAnalyticsReport(filename) {
        await resultsExporter.exportAnalyticsReport(filename);
    }
}

// Create and export singleton instance
export const resultsViewer = new ResultsViewer();

// Make available globally for onclick handlers
window.resultsViewer = resultsViewer;

export default resultsViewer;
