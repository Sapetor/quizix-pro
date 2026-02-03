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
    getScoreClass,
    getQuizzesWithMultipleSessions
} from './results-viewer/results-filter-manager.js';

import { resultsExporter } from './results-viewer/results-exporter.js';

import {
    calculateQuestionAnalytics,
    getQuizSummaryStats,
    reconstructQuestionsFromResults,
    createAnalyticsModal,
    createSuccessRateChart,
    createTimeVsSuccessChart,
    switchAnalyticsTab,
    createQuestionDrilldownModal,
    createComparisonChart,
    calculateComparativeMetrics,
    calculateConceptMastery,
    createConceptMasteryChart
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
            // Fetch full data if missing results OR questions (list API may only include partial data)
            if ((!result.results || !result.questions) && result.filename) {
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
        // Calculate concept mastery data
        const conceptData = calculateConceptMastery(result);

        const modal = createAnalyticsModal(result, analytics, summary, conceptData);
        document.body.appendChild(modal);

        // Store data for drill-down access
        this.currentAnalyticsData = {
            result,
            analytics,
            summary,
            conceptData
        };

        // Attach tab switching handlers
        modal.querySelectorAll('.analytics-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = btn.dataset.tab;
                switchAnalyticsTab(e, tabName);
            });
        });

        // Attach question drill-down handlers
        modal.querySelectorAll('.question-analytics-item.clickable').forEach(item => {
            item.addEventListener('click', (e) => {
                const questionIndex = parseInt(item.dataset.questionIndex, 10);
                this.showQuestionDrilldown(questionIndex);
            });
        });

        // Attach export handlers
        const exportCsvBtn = modal.querySelector('[data-action="export-analytics"]');
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => {
                this.exportAnalyticsReport(exportCsvBtn.dataset.filename);
            });
        }

        const exportPdfBtn = modal.querySelector('[data-action="export-pdf"]');
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                this.exportCurrentToPDF(exportPdfBtn.dataset.filename);
            });
        }

        const exportExcelBtn = modal.querySelector('[data-action="export-excel"]');
        if (exportExcelBtn) {
            exportExcelBtn.addEventListener('click', () => {
                this.exportCurrentToExcel(exportExcelBtn.dataset.filename);
            });
        }

        // Create charts after modal is in DOM
        setTimeout(() => {
            createSuccessRateChart(analytics);
            createTimeVsSuccessChart(analytics);

            // Create concept mastery chart if concepts data exists
            if (conceptData?.hasConcepts) {
                createConceptMasteryChart('concept-mastery-chart', conceptData);

                // Setup toggle for study suggestions
                const toggle = modal.querySelector('#show-study-suggestions');
                const content = modal.querySelector('#concept-insights-content');
                if (toggle && content) {
                    toggle.addEventListener('change', () => {
                        content.style.display = toggle.checked ? 'flex' : 'none';
                    });
                }
            }
        }, 100);
    }

    /**
     * Show drill-down modal for a specific question
     * @param {number} questionIndex - Index of the question in analytics array
     */
    showQuestionDrilldown(questionIndex) {
        if (!this.currentAnalyticsData) {
            logger.warn('No analytics data available for drill-down');
            return;
        }

        const { result, analytics } = this.currentAnalyticsData;
        const questionAnalysis = analytics[questionIndex];

        if (!questionAnalysis) {
            logger.warn('Question not found at index:', questionIndex);
            return;
        }

        // Get player answers for this question
        const playerAnswers = [];
        if (result.results) {
            result.results.forEach(player => {
                if (player.answers && player.answers[questionIndex]) {
                    playerAnswers.push(player.answers[questionIndex]);
                }
            });
        }

        // Get original question data if available
        const question = result.questions?.[questionIndex] || null;

        const drilldownModal = createQuestionDrilldownModal(questionAnalysis, question, playerAnswers);
        document.body.appendChild(drilldownModal);
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

    // ========================================
    // PDF Export
    // ========================================

    /**
     * Export current result to PDF
     * @param {Object} resultData - Full result data object
     */
    async exportToPDF(resultData) {
        await resultsExporter.exportToPDF(resultData);
    }

    /**
     * Export current analytics view to PDF
     * Fetches full data if needed
     * @param {string} filename - Result filename
     */
    async exportCurrentToPDF(filename) {
        try {
            this.showLoading();

            const result = this.filteredResults?.find(r => r.filename === filename);
            if (!result) {
                showErrorAlert('Result not found');
                this.hideLoading();
                return;
            }

            // Fetch full data if needed
            let fullResult = result;
            if (!result.questions && result.filename) {
                try {
                    const response = await fetch(APIHelper.getApiUrl(`api/results/${result.filename}`));
                    if (response.ok) {
                        fullResult = await response.json();
                        fullResult.filename = result.filename;
                    }
                } catch (error) {
                    logger.error('Error fetching full results for PDF:', error);
                }
            }

            this.hideLoading();
            await resultsExporter.exportToPDF(fullResult);

        } catch (error) {
            logger.error('Error exporting to PDF:', error);
            this.hideLoading();
            showErrorAlert('Failed to export PDF');
        }
    }

    /**
     * Export current analytics view to Excel
     * Fetches full data if needed
     * @param {string} filename - Result filename
     */
    async exportCurrentToExcel(filename) {
        try {
            this.showLoading();

            const result = this.filteredResults?.find(r => r.filename === filename);
            if (!result) {
                showErrorAlert('Result not found');
                this.hideLoading();
                return;
            }

            // Fetch full data if needed
            let fullResult = result;
            if (!result.questions && result.filename) {
                try {
                    const response = await fetch(APIHelper.getApiUrl(`api/results/${result.filename}`));
                    if (response.ok) {
                        fullResult = await response.json();
                        fullResult.filename = result.filename;
                    }
                } catch (error) {
                    logger.error('Error fetching full results for Excel:', error);
                }
            }

            this.hideLoading();
            await resultsExporter.exportToExcel(fullResult);

        } catch (error) {
            logger.error('Error exporting to Excel:', error);
            this.hideLoading();
            showErrorAlert('Failed to export Excel');
        }
    }

    // ========================================
    // Comparative Analysis
    // ========================================

    /**
     * Show comparison modal for quizzes with multiple sessions
     */
    showComparisonSelector() {
        const allResults = Array.from(resultsManagerService.resultsCache.values());
        const quizzesWithSessions = getQuizzesWithMultipleSessions(allResults);

        if (quizzesWithSessions.length === 0) {
            showErrorAlert('No quizzes with multiple sessions found. Run a quiz multiple times to compare results.');
            return;
        }

        this.displayComparisonSelectorModal(quizzesWithSessions);
    }

    /**
     * Display the comparison selector modal
     * @param {Array} quizzesWithSessions - Array of quizzes that have multiple sessions
     */
    displayComparisonSelectorModal(quizzesWithSessions) {
        const existingModal = document.getElementById('comparison-selector-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'comparison-selector-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '1050';

        const quizListHtml = quizzesWithSessions.map(quiz => `
            <div class="comparison-quiz-item" data-quiz-title="${quiz.title.replace(/"/g, '&quot;')}">
                <div class="quiz-info">
                    <div class="quiz-title">${quiz.title}</div>
                    <div class="quiz-meta">${quiz.sessionCount} sessions | ${quiz.totalParticipants} total participants</div>
                </div>
                <button class="btn primary compare-btn">Compare</button>
            </div>
        `).join('');

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Compare Quiz Sessions</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body" style="padding: 20px; max-height: 400px; overflow-y: auto;">
                    <p style="margin-bottom: 16px; color: #6b7280;">
                        Select a quiz to compare results across multiple sessions.
                    </p>
                    <div class="comparison-quiz-list">
                        ${quizListHtml}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Attach handlers
        modal.querySelectorAll('.compare-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const quizTitle = e.target.closest('.comparison-quiz-item').dataset.quizTitle;
                modal.remove();
                this.showSessionSelector(quizTitle, quizzesWithSessions);
            });
        });
    }

    /**
     * Show session selector for a specific quiz
     * @param {string} quizTitle - Title of the quiz
     * @param {Array} quizzesWithSessions - Full quiz list for lookup
     */
    showSessionSelector(quizTitle, quizzesWithSessions) {
        const quiz = quizzesWithSessions.find(q => q.title === quizTitle);
        if (!quiz) return;

        const existingModal = document.getElementById('session-selector-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'session-selector-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '1050';

        const sessionListHtml = quiz.sessions.map((session, idx) => {
            const date = new Date(session.saved).toLocaleDateString();
            const participants = session.results?.length || 0;
            return `
                <label class="session-checkbox-item">
                    <input type="checkbox" value="${session.filename}" ${idx < 3 ? 'checked' : ''}>
                    <span class="session-info">
                        <span class="session-date">${date}</span>
                        <span class="session-meta">PIN: ${session.gamePin} | ${participants} participants</span>
                    </span>
                </label>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Select Sessions to Compare</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <p style="margin-bottom: 8px;"><strong>${quizTitle}</strong></p>
                    <p style="margin-bottom: 16px; color: #6b7280; font-size: 0.9rem;">
                        Select 2-5 sessions to compare. Results will show performance trends over time.
                    </p>
                    <div class="session-checkbox-list" style="max-height: 300px; overflow-y: auto;">
                        ${sessionListHtml}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    <button class="btn primary" id="run-comparison-btn">Compare Selected</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Attach compare handler
        modal.querySelector('#run-comparison-btn').addEventListener('click', async () => {
            const selectedFilenames = Array.from(modal.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => cb.value);

            if (selectedFilenames.length < 2) {
                showErrorAlert('Please select at least 2 sessions to compare');
                return;
            }

            if (selectedFilenames.length > 5) {
                showErrorAlert('Please select no more than 5 sessions for clarity');
                return;
            }

            modal.remove();
            await this.runComparison(quizTitle, selectedFilenames);
        });
    }

    /**
     * Run comparison analysis on selected sessions
     * @param {string} quizTitle - Title of the quiz
     * @param {Array} filenames - Array of result filenames to compare
     */
    async runComparison(quizTitle, filenames) {
        try {
            this.showLoading();

            // Fetch full data for each session
            const resultsPromises = filenames.map(async (filename) => {
                try {
                    const response = await fetch(APIHelper.getApiUrl(`api/results/${filename}`));
                    if (response.ok) {
                        const data = await response.json();
                        data.filename = filename;
                        return data;
                    }
                } catch (error) {
                    logger.error(`Error fetching ${filename}:`, error);
                }
                return null;
            });

            const results = (await Promise.all(resultsPromises)).filter(r => r !== null);

            if (results.length < 2) {
                this.hideLoading();
                showErrorAlert('Could not load enough session data for comparison');
                return;
            }

            // Calculate comparative metrics
            const comparisonData = calculateComparativeMetrics(results);

            this.hideLoading();

            if (!comparisonData) {
                showErrorAlert('Could not generate comparison data');
                return;
            }

            this.displayComparisonResults(quizTitle, comparisonData);

        } catch (error) {
            logger.error('Error running comparison:', error);
            this.hideLoading();
            showErrorAlert('Failed to generate comparison');
        }
    }

    /**
     * Display comparison results modal
     * @param {string} quizTitle - Title of the quiz
     * @param {Object} comparisonData - Calculated comparison metrics
     */
    displayComparisonResults(quizTitle, comparisonData) {
        const existingModal = document.getElementById('comparison-results-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'comparison-results-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '1050';

        const trendIcon = comparisonData.trendDirection === 'improving' ? '📈' :
            comparisonData.trendDirection === 'declining' ? '📉' : '➡️';
        const trendColor = comparisonData.trendDirection === 'improving' ? '#10b981' :
            comparisonData.trendDirection === 'declining' ? '#ef4444' : '#6b7280';

        let insightsHtml = '';
        if (comparisonData.mostImproved) {
            insightsHtml += `<p style="color: #10b981;"><strong>Most Improved:</strong> Q${comparisonData.mostImproved.questionNumber} (+${comparisonData.mostImproved.trend.toFixed(1)}%)</p>`;
        }
        if (comparisonData.mostDeclined) {
            insightsHtml += `<p style="color: #ef4444;"><strong>Needs Attention:</strong> Q${comparisonData.mostDeclined.questionNumber} (${comparisonData.mostDeclined.trend.toFixed(1)}%)</p>`;
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2>Session Comparison: ${quizTitle}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div class="comparison-summary" style="display: flex; gap: 20px; margin-bottom: 20px;">
                        <div class="stat-card" style="flex: 1; background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2rem;">${comparisonData.sessionCount}</div>
                            <div style="color: #6b7280;">Sessions</div>
                        </div>
                        <div class="stat-card" style="flex: 1; background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2rem;">${comparisonData.averageParticipants}</div>
                            <div style="color: #6b7280;">Avg Participants</div>
                        </div>
                        <div class="stat-card" style="flex: 1; background: ${trendColor}15; padding: 16px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2rem;">${trendIcon}</div>
                            <div style="color: ${trendColor};">${comparisonData.trendDirection.charAt(0).toUpperCase() + comparisonData.trendDirection.slice(1)} (${comparisonData.overallTrend > 0 ? '+' : ''}${comparisonData.overallTrend.toFixed(1)}%)</div>
                        </div>
                    </div>

                    <div class="chart-container" style="height: 300px; margin-bottom: 20px;">
                        <canvas id="comparison-chart"></canvas>
                    </div>

                    <div class="comparison-insights" style="background: #f9fafb; padding: 16px; border-radius: 8px;">
                        <h4 style="margin: 0 0 12px 0;">Key Insights</h4>
                        ${insightsHtml || '<p style="color: #6b7280;">Performance has remained stable across sessions.</p>'}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    <button class="btn primary" id="export-comparison-pdf">Export PDF</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Create chart after modal is in DOM
        setTimeout(() => {
            createComparisonChart('comparison-chart', comparisonData.sessions);
        }, 100);

        // Attach PDF export handler
        modal.querySelector('#export-comparison-pdf').addEventListener('click', async () => {
            await resultsExporter.exportComparisonToPDF(comparisonData, quizTitle);
        });
    }
}

// Create and export singleton instance
export const resultsViewer = new ResultsViewer();

// Make available globally for onclick handlers
window.resultsViewer = resultsViewer;

export default resultsViewer;
