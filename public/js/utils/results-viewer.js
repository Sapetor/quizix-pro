/**
 * Results Viewer - Enhanced interface for viewing and managing quiz results
 * Provides a comprehensive modal interface accessible from the toolbar
 */

import { translationManager, showErrorAlert, showSuccessAlert } from './translation-manager.js';
import { logger } from '../core/config.js';
import { resultsManagerService } from '../services/results-manager-service.js';
import { APIHelper } from './api-helper.js';
import { SwipeToDelete } from './swipe-to-delete.js';
import { escapeHtml } from './dom.js';

export class ResultsViewer {
    constructor() {
        this.filteredResults = null;
        this.currentDetailResult = null;
        this.currentExportFormat = 'analytics';

        // Initialize swipe-to-delete handler for mobile
        this.swipeToDelete = new SwipeToDelete({
            deleteThreshold: 100,
            revealThreshold: 60,
            maxSwipeDistance: 120,
            onDelete: (filename) => this.handleSwipeDelete(filename)
        });

        this.initializeEventListeners();

        // Listen to results service updates
        resultsManagerService.addListener((event, data) => {
            this.handleServiceUpdate(event, data);
        });

        logger.debug('ResultsViewer initialized');
    }

    /**
     * Handle swipe-to-delete gesture
     */
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

    /**
     * Handle updates from the results manager service
     */
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

    /**
     * Handle results update from service
     */
    onResultsUpdated(results) {
        this.filteredResults = [...results];
        this.updateSummaryStats();
        this.filterResults();
    }

    /**
     * Handle result deletion from service
     */
    onResultDeleted(filename) {
        if (this.filteredResults) {
            this.filteredResults = this.filteredResults.filter(r => r.filename !== filename);
            this.updateSummaryStats();
            this.renderResults();
        }

        // Close detail modal if we're viewing the deleted result
        if (this.currentDetailResult?.filename === filename) {
            this.hideDetailModal();
        }
    }

    /**
     * Initialize event listeners for modal interactions
     */
    initializeEventListeners() {
        // Main modal controls - X close button
        const closeBtn = document.getElementById('close-results-viewer');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideModal());
        }

        // Detail modal controls - X close button  
        const detailCloseBtn = document.getElementById('close-result-detail');
        if (detailCloseBtn) {
            detailCloseBtn.addEventListener('click', () => this.hideDetailModal());
        }

        // Search and sorting
        const searchInput = document.getElementById('search-results');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterResults());
        }

        const sortSelect = document.getElementById('sort-results');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => this.filterResults());
        }

        // Action buttons
        const refreshBtn = document.getElementById('refresh-results');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshResults());
        }

        const downloadBtn = document.getElementById('download-result-csv');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadCurrentResult());
        }

        const deleteBtn = document.getElementById('delete-result');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteCurrentResult());
        }

        // Format selection for downloads
        const formatSelect = document.getElementById('export-format-select');
        if (formatSelect) {
            formatSelect.addEventListener('change', (e) => {
                this.currentExportFormat = e.target.value;
                logger.debug(`📊 Export format changed to: ${this.currentExportFormat}`);
            });
        }

        // Modal overlay click to close
        const modal = document.getElementById('results-viewing-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal();
                }
            });
        }

        const detailModal = document.getElementById('result-detail-modal');
        if (detailModal) {
            detailModal.addEventListener('click', (e) => {
                if (e.target === detailModal) {
                    this.hideDetailModal();
                }
            });
        }
    }

    /**
     * Show the results viewing modal
     */
    async showModal() {
        const modal = document.getElementById('results-viewing-modal');
        if (!modal) {
            logger.error('Results viewing modal not found');
            showErrorAlert('Results viewer not available');
            return;
        }

        logger.debug('Opening results viewing modal');
        modal.style.display = 'flex';
        await this.loadResults();
        this.initSwipeToDelete();
    }

    /**
     * Initialize swipe-to-delete for mobile devices
     */
    initSwipeToDelete() {
        const resultsList = document.getElementById('results-list');
        if (resultsList) {
            this.swipeToDelete.init(resultsList, '.result-item');
        }
    }

    /**
     * Hide the results viewing modal
     */
    hideModal() {
        const modal = document.getElementById('results-viewing-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.swipeToDelete?.resetAllItems();
    }

    /**
     * Show the result detail modal
     */
    showDetailModal(result) {
        this.currentDetailResult = result;
        const modal = document.getElementById('result-detail-modal');
        if (modal) {
            this.populateDetailModal(result);
            modal.style.display = 'flex';
        }
    }

    /**
     * Show detail modal by looking up filename
     */
    showDetailModalByFilename(filename) {
        const result = this.filteredResults?.find(r => r.filename === filename);
        if (result) {
            this.showDetailModal(result);
        } else {
            logger.warn('Result not found for filename:', filename);
        }
    }

    hideDetailModal() {
        const modal = document.getElementById('result-detail-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.currentDetailResult = null;
    }

    /**
     * Load and display results using the service
     */
    async loadResults() {
        try {
            const results = await resultsManagerService.fetchResults();
            logger.debug(`Loaded ${results.length} results`);
        } catch (error) {
            logger.error('Error loading results:', error);
            this.showError('Failed to load quiz results');
        }
    }

    /**
     * Refresh results data
     */
    async refreshResults() {
        try {
            await resultsManagerService.fetchResults(true);
            showSuccessAlert('Results refreshed successfully');
        } catch (error) {
            logger.error('Error refreshing results:', error);
            showErrorAlert('Failed to refresh results');
        }
    }

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

    /**
     * Show error message
     */
    showError(message) {
        const resultsList = document.getElementById('results-list');
        if (resultsList) {
            resultsList.innerHTML = `
                <div class="empty-results empty-state">
                    <div class="empty-state-illustration">
                        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <!-- Warning triangle -->
                            <path d="M60 20L15 100h90L60 20z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2.5" opacity="0.5"/>
                            <!-- Exclamation mark -->
                            <line x1="60" y1="45" x2="60" y2="70" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
                            <circle cx="60" cy="82" r="3" fill="currentColor" opacity="0.7"/>
                            <!-- Small decorative elements -->
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

    /**
     * Update summary statistics
     */
    updateSummaryStats() {
        if (!this.filteredResults) return;

        const stats = resultsManagerService.calculateSummaryStats(this.filteredResults);
        
        this.updateStatElement('total-quizzes', stats.totalQuizzes);
        this.updateStatElement('total-participants', stats.totalParticipants);
        this.updateStatElement('avg-score', `${stats.averageScore}%`);
    }

    /**
     * Update a stat element
     */
    updateStatElement(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    }

    /**
     * Filter and sort results based on user input
     */
    filterResults() {
        const allResults = Array.from(resultsManagerService.resultsCache.values());
        if (!allResults.length) return;

        const searchTerm = document.getElementById('search-results')?.value.toLowerCase() || '';
        const sortBy = document.getElementById('sort-results')?.value || 'date-desc';

        this.filteredResults = resultsManagerService.filterResults(allResults, searchTerm, sortBy);
        this.renderResults();
    }

    /**
     * Render the results list
     */
    renderResults() {
        const resultsList = document.getElementById('results-list');
        if (!resultsList) return;

        if (!this.filteredResults || this.filteredResults.length === 0) {
            resultsList.innerHTML = `
                <div class="empty-results empty-state">
                    <div class="empty-state-illustration">
                        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <!-- Bar chart placeholder -->
                            <rect x="15" y="70" width="18" height="35" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" opacity="0.3"/>
                            <rect x="40" y="50" width="18" height="55" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" opacity="0.3"/>
                            <rect x="65" y="60" width="18" height="45" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" opacity="0.3"/>
                            <rect x="90" y="40" width="18" height="65" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" opacity="0.3"/>
                            <!-- Magnifying glass with question mark -->
                            <circle cx="55" cy="35" r="18" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.6"/>
                            <line x1="68" y1="48" x2="82" y2="62" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
                            <text x="55" y="42" text-anchor="middle" font-size="18" font-weight="bold" fill="currentColor" opacity="0.5">?</text>
                            <!-- Baseline -->
                            <line x1="10" y1="105" x2="110" y2="105" stroke="currentColor" stroke-width="2" opacity="0.3"/>
                        </svg>
                    </div>
                    <h4>No Results Found</h4>
                    <p>No quiz results match your search criteria.</p>
                </div>
            `;
            return;
        }

        const resultsHTML = this.filteredResults.map(result => {
            const participantCount = result.results?.length || 0;
            const avgScore = this.calculateAverageScore(result);
            const formattedDate = this.formatDate(result.saved);

            return `
                <div class="result-item" data-filename="${escapeHtml(result.filename)}">
                    <div class="swipe-delete-action">
                        <div class="swipe-delete-icon">
                            <span>🗑️</span>
                            <span>Delete</span>
                        </div>
                    </div>
                    <div class="result-info">
                        <div class="result-title">${escapeHtml(result.quizTitle || 'Untitled Quiz')}</div>
                        <div class="result-meta">
                            <span>📅 ${formattedDate}</span>
                            <span>🎯 PIN: ${escapeHtml(result.gamePin)}</span>
                            <span>👥 ${participantCount} participants</span>
                            <span>📊 ${avgScore}% avg score</span>
                        </div>
                    </div>
                    <div class="result-actions">
                        <button class="result-action-btn analytics" onclick="resultsViewer.showQuestionAnalytics(resultsViewer.filteredResults.find(r => r.filename === '${result.filename}'))" title="View Question Analytics">
                            📈 Analytics
                        </button>
                        <div class="download-options">
                            <button class="result-action-btn download" onclick="resultsViewer.showDownloadOptions('${result.filename}')">
                                💾 Download
                            </button>
                        </div>
                        <button class="result-action-btn delete" onclick="resultsViewer.quickDelete('${result.filename}')">
                            🗑️ Delete
                        </button>
                    </div>
                    <span class="swipe-hint">← swipe</span>
                </div>
            `;
        }).join('');

        resultsList.innerHTML = resultsHTML;

        // Add click listeners for detail view
        resultsList.querySelectorAll('.result-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger detail view if clicking action buttons or swipe action
                if (!e.target.closest('.result-actions') && !e.target.closest('.swipe-delete-action')) {
                    const filename = item.dataset.filename;
                    const result = this.filteredResults.find(r => r.filename === filename);
                    if (result) {
                        this.showDetailModal(result);
                    }
                }
            });

            // Add click handler for swipe delete action (when revealed)
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

        // Refresh swipe-to-delete handler for new items
        if (this.swipeToDelete) {
            this.swipeToDelete.refresh();
        }
    }

    /**
     * Calculate average score for a result
     * Based on percentage of correct answers, not raw scores
     * (since scores vary by difficulty and time bonus)
     */
    calculateAverageScore(result) {
        if (!result.results || result.results.length === 0) return '0';

        let totalCorrect = 0;
        let totalQuestions = 0;

        result.results.forEach(player => {
            const answers = player.answers || [];
            const playerQuestions = answers.length;
            const playerCorrect = answers.filter(a => a?.isCorrect).length;
            totalCorrect += playerCorrect;
            totalQuestions += playerQuestions;
        });

        return totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    }

    /**
     * Calculate comprehensive question analytics for identifying problematic questions
     * @param {Object} result - Quiz result data with questions and player answers
     * @returns {Array} Array of question analytics objects
     */
    calculateQuestionAnalytics(result) {
        if (!result.questions || !result.results) {
            return [];
        }

        const analytics = [];
        
        result.questions.forEach((question, qIndex) => {
            const questionAnalysis = {
                questionNumber: qIndex + 1,
                text: question.text || question.question || `Question ${qIndex + 1}`,
                type: question.type || 'multiple-choice',
                difficulty: question.difficulty || 'medium',
                correctAnswer: question.correctAnswer,
                
                // Performance metrics
                totalResponses: 0,
                correctResponses: 0,
                averageTime: 0,
                totalTime: 0,
                averagePoints: 0,
                totalPoints: 0,
                
                // Analysis metrics
                successRate: 0,
                timeEfficiency: 0, // success rate / average time
                strugglingPlayers: [],
                commonWrongAnswers: {},
                
                // Flags for problematic questions
                isPotentiallyProblematic: false,
                problemFlags: []
            };

            // Analyze each player's response to this question
            result.results.forEach(player => {
                const answer = player.answers && player.answers[qIndex];
                if (answer) {
                    questionAnalysis.totalResponses++;
                    questionAnalysis.totalTime += (answer.timeMs || 0) / 1000;
                    questionAnalysis.totalPoints += answer.points || 0;

                    if (answer.isCorrect) {
                        questionAnalysis.correctResponses++;
                    } else {
                        // Track struggling players
                        questionAnalysis.strugglingPlayers.push({
                            name: player.name,
                            answer: answer.answer,
                            time: (answer.timeMs || 0) / 1000,
                            points: answer.points || 0
                        });

                        // Track common wrong answers
                        const wrongAnswer = Array.isArray(answer.answer) ? 
                            answer.answer.join(', ') : String(answer.answer);
                        questionAnalysis.commonWrongAnswers[wrongAnswer] = 
                            (questionAnalysis.commonWrongAnswers[wrongAnswer] || 0) + 1;
                    }
                }
            });

            // Calculate derived metrics
            if (questionAnalysis.totalResponses > 0) {
                questionAnalysis.successRate = (questionAnalysis.correctResponses / questionAnalysis.totalResponses) * 100;
                questionAnalysis.averageTime = questionAnalysis.totalTime / questionAnalysis.totalResponses;
                questionAnalysis.averagePoints = questionAnalysis.totalPoints / questionAnalysis.totalResponses;
                questionAnalysis.timeEfficiency = questionAnalysis.successRate / Math.max(questionAnalysis.averageTime, 1);
            }

            // Identify problematic question patterns
            this.flagProblematicQuestions(questionAnalysis);

            analytics.push(questionAnalysis);
        });

        return analytics;
    }

    /**
     * Flag questions that may need review based on various criteria
     * @param {Object} analysis - Question analysis object to evaluate
     */
    flagProblematicQuestions(analysis) {
        const flags = [];

        // Low success rate (knowledge gap)
        if (analysis.successRate < 40) {
            flags.push({
                type: 'low_success',
                severity: 'high',
                message: `Only ${analysis.successRate.toFixed(1)}% success rate - potential knowledge gap`
            });
            analysis.isPotentiallyProblematic = true;
        } else if (analysis.successRate < 60) {
            flags.push({
                type: 'moderate_success',
                severity: 'medium',
                message: `${analysis.successRate.toFixed(1)}% success rate - room for improvement`
            });
        }

        // High time with low success (conceptual difficulty)
        if (analysis.averageTime > 15 && analysis.successRate < 50) {
            flags.push({
                type: 'time_vs_success',
                severity: 'high',
                message: `High time (${analysis.averageTime.toFixed(1)}s) with low success - conceptual difficulty`
            });
            analysis.isPotentiallyProblematic = true;
        }

        // Quick wrong answers (misconceptions)
        if (analysis.averageTime < 8 && analysis.successRate < 70) {
            flags.push({
                type: 'quick_wrong',
                severity: 'medium',
                message: `Quick responses with errors - potential misconceptions`
            });
        }

        // Common wrong answer (misleading option)
        const wrongAnswerEntries = Object.entries(analysis.commonWrongAnswers);
        const mostCommonWrong = wrongAnswerEntries.reduce((max, current) => 
            current[1] > (max[1] || 0) ? current : max, [null, 0]
        );
        
        if (mostCommonWrong[1] >= analysis.totalResponses * 0.4) {
            flags.push({
                type: 'common_wrong_answer',
                severity: 'medium',
                message: `${mostCommonWrong[1]} students chose "${mostCommonWrong[0]}" - potentially misleading option`
            });
        }

        analysis.problemFlags = flags;
    }

    /**
     * Get summary statistics for the entire quiz
     * @param {Array} questionAnalytics - Array of question analysis objects
     * @returns {Object} Summary statistics
     */
    getQuizSummaryStats(questionAnalytics) {
        if (!questionAnalytics.length) return {};

        const totalQuestions = questionAnalytics.length;
        const problematicCount = questionAnalytics.filter(q => q.isPotentiallyProblematic).length;
        const avgSuccessRate = questionAnalytics.reduce((sum, q) => sum + q.successRate, 0) / totalQuestions;
        const avgTime = questionAnalytics.reduce((sum, q) => sum + q.averageTime, 0) / totalQuestions;

        // Find hardest and easiest questions
        const sortedBySuccess = [...questionAnalytics].sort((a, b) => a.successRate - b.successRate);
        const hardestQuestion = sortedBySuccess[0];
        const easiestQuestion = sortedBySuccess[sortedBySuccess.length - 1];

        return {
            totalQuestions,
            problematicCount,
            avgSuccessRate,
            avgTime,
            hardestQuestion: {
                number: hardestQuestion.questionNumber,
                text: hardestQuestion.text,
                successRate: hardestQuestion.successRate
            },
            easiestQuestion: {
                number: easiestQuestion.questionNumber,
                text: easiestQuestion.text,
                successRate: easiestQuestion.successRate
            },
            needsReview: problematicCount / totalQuestions > 0.3 // Flag if >30% questions problematic
        };
    }

    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } catch (error) {
            return dateString;
        }
    }

    /**
     * Populate the detail modal with result information
     */
    async populateDetailModal(result) {
        // If we only have summary data, fetch full details
        let fullResult = result;
        if (!result.results && result.filename) {
            try {
                const response = await fetch(APIHelper.getApiUrl(`api/results/${result.filename}`));
                if (response.ok) {
                    fullResult = await response.json();
                    fullResult.filename = result.filename; // Preserve filename
                }
            } catch (error) {
                logger.error('Error fetching detailed results:', error);
            }
        }

        // Set basic info
        const untitledQuiz = translationManager.getTranslationSync('untitled_quiz') || 'Untitled Quiz';
        document.getElementById('result-detail-title').textContent = `${fullResult.quizTitle || untitledQuiz} - Results`;
        document.getElementById('detail-quiz-title').textContent = fullResult.quizTitle || untitledQuiz;
        document.getElementById('detail-game-pin').textContent = fullResult.gamePin || (translationManager.getTranslationSync('unknown') || 'Unknown');
        document.getElementById('detail-date').textContent = this.formatDate(fullResult.saved);
        document.getElementById('detail-participants').textContent = fullResult.results?.length || 0;
        document.getElementById('detail-avg-score').textContent = `${this.calculateAverageScore(fullResult)}%`;

        // Populate participant results
        const participantResults = document.getElementById('participant-results');
        if (!participantResults) return;

        if (!fullResult.results || fullResult.results.length === 0) {
            participantResults.innerHTML = `
                <div class="empty-results empty-state">
                    <div class="empty-state-illustration">
                        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <!-- Three person silhouettes (empty/ghost) -->
                            <circle cx="35" cy="40" r="12" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.4"/>
                            <path d="M20 80c0-12 7-20 15-20s15 8 15 20" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.4"/>
                            <circle cx="60" cy="35" r="14" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.5"/>
                            <path d="M42 85c0-14 8-23 18-23s18 9 18 23" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.5"/>
                            <circle cx="85" cy="40" r="12" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.4"/>
                            <path d="M70 80c0-12 7-20 15-20s15 8 15 20" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.4"/>
                            <!-- Question marks above -->
                            <text x="35" y="22" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.4">?</text>
                            <text x="60" y="16" text-anchor="middle" font-size="14" fill="currentColor" opacity="0.5">?</text>
                            <text x="85" y="22" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.4">?</text>
                            <!-- Ground line -->
                            <line x1="15" y1="95" x2="105" y2="95" stroke="currentColor" stroke-width="2" opacity="0.2"/>
                        </svg>
                    </div>
                    <h4>No Participants</h4>
                    <p>No participant data available for this quiz.</p>
                </div>
            `;
            return;
        }

        // Sort participants by score (descending)
        const sortedResults = [...fullResult.results].sort((a, b) => (b.score || 0) - (a.score || 0));

        const participantsHTML = `
            <div class="participant-header">Participant Results</div>
            ${sortedResults.map(player => {
                const playerScore = player.score || 0;
                const totalQuestions = player.answers?.length || 0;
                // Calculate percentage based on correct answers, not score
                // (score varies by difficulty and time bonus, making 100pts/question incorrect)
                const correctAnswers = player.answers?.filter(a => a?.isCorrect).length || 0;
                const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
                const scoreClass = this.getScoreClass(percentage);
                const timeDisplay = player.completedAt ? this.formatTime(player.completedAt) : 'N/A';
                
                return `
                    <div class="participant-row">
                        <div class="participant-name">${escapeHtml(player.name || 'Anonymous')}</div>
                        <div class="participant-score ${scoreClass}">${playerScore} pts</div>
                        <div class="participant-percentage ${scoreClass}">${percentage}%</div>
                        <div class="participant-time">${timeDisplay}</div>
                    </div>
                `;
            }).join('')}
        `;

        participantResults.innerHTML = participantsHTML;
    }

    /**
     * Get CSS class for score coloring
     */
    getScoreClass(percentage) {
        if (percentage >= 90) return 'score-excellent';
        if (percentage >= 75) return 'score-good';
        if (percentage >= 60) return 'score-average';
        return 'score-poor';
    }

    /**
     * Format time duration
     */
    formatTime(completedAt) {
        try {
            const date = new Date(completedAt);
            return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } catch (error) {
            return 'N/A';
        }
    }

    /**
     * Quick download functionality
     */
    async quickDownload(filename, format = null) {
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
     * Quick delete functionality
     */
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

    /**
     * Download current result from detail modal
     */
    async downloadCurrentResult() {
        if (!this.currentDetailResult) return;
        await this.quickDownload(this.currentDetailResult.filename);
    }

    /**
     * Delete current result from detail modal
     */
    async deleteCurrentResult() {
        if (!this.currentDetailResult) return;
        await this.quickDelete(this.currentDetailResult.filename);
        this.hideDetailModal();
    }

    /**
     * Show download options for a specific result
     */
    async showDownloadOptions(filename) {
        const result = this.filteredResults?.find(r => r.filename === filename);
        if (!result) {
            logger.error(`Result not found: ${filename}`);
            return;
        }

        // Get available formats for this result
        const formats = resultsManagerService.getAvailableFormats(result);
        
        if (formats.length <= 1) {
            // Only one format available, download directly
            await this.quickDownload(filename, formats[0]?.key || 'analytics');
            return;
        }

        // Show format selection modal/dropdown
        this.showFormatSelectionModal(filename, formats);
    }

    /**
     * Show format selection modal
     */
    showFormatSelectionModal(filename, formats) {
        // Create a simple modal for format selection
        const modal = document.createElement('div');
        modal.className = 'format-selection-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            min-width: 300px;
            max-width: 500px;
        `;

        content.innerHTML = `
            <h3>Select Export Format</h3>
            <p>Choose how you'd like to download the results:</p>
            <div class="format-options" style="margin: 15px 0;">
                ${formats.map(format => `
                    <label style="display: block; margin: 8px 0; cursor: pointer;">
                        <input type="radio" name="export-format" value="${format.key}" 
                               ${format.key === this.currentExportFormat ? 'checked' : ''}>
                        <strong>${format.name}</strong><br>
                        <small style="color: #666; margin-left: 20px;">${format.description}</small>
                    </label>
                `).join('')}
            </div>
            <div style="text-align: right; margin-top: 20px;">
                <button id="format-cancel-btn" style="margin-right: 10px; padding: 8px 16px;">Cancel</button>
                <button id="format-download-btn" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px;">Download</button>
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Add event listeners
        const cancelBtn = content.querySelector('#format-cancel-btn');
        const downloadBtn = content.querySelector('#format-download-btn');

        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        downloadBtn.addEventListener('click', async () => {
            const selectedFormat = content.querySelector('input[name="export-format"]:checked')?.value || 'analytics';
            document.body.removeChild(modal);
            await this.quickDownload(filename, selectedFormat);
        });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    
    /**
     * Show question analytics modal with charts and insights
     * @param {Object} result - Quiz result data
     */
    async showQuestionAnalytics(result) {
        try {
            this.showLoading();
            
            // If we only have summary data, fetch full details
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

            // Check for question data in multiple possible formats
            let questions = fullResult.questions || fullResult.questionMetadata || [];
            const results = fullResult.results || [];

            // Fallback: Try to reconstruct basic question info from player results
            if (questions.length === 0 && results.length > 0) {
                questions = this.reconstructQuestionsFromResults(results);
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

            const questionAnalytics = this.calculateQuestionAnalytics(fullResult);
            const summaryStats = this.getQuizSummaryStats(questionAnalytics);

            this.hideLoading();
            this.createAnalyticsModal(fullResult, questionAnalytics, summaryStats);
            
        } catch (error) {
            logger.error('Error in showQuestionAnalytics:', error);
            this.hideLoading();
            this.showError('Failed to generate analytics. Please check the console for details.');
        }
    }

    /**
     * Create the analytics modal with charts and insights
     */
    createAnalyticsModal(result, analytics, summary) {
        // Remove existing analytics modal if present
        const existingModal = document.getElementById('analytics-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'analytics-modal';
        modal.className = 'modal-overlay analytics-modal-overlay';
        
        const problematicQuestions = analytics.filter(q => q.isPotentiallyProblematic);
        const flagsHtml = problematicQuestions.map(q => 
            `<div class="problem-question">
                <strong>Q${q.questionNumber}:</strong> ${q.text.substring(0, 60)}...
                <div class="problem-flags">
                    ${q.problemFlags.map(flag => 
                        `<span class="flag ${flag.severity}">${flag.message}</span>`
                    ).join('')}
                </div>
            </div>`
        ).join('');

        modal.innerHTML = `
            <div class="modal-content analytics-modal-content">
                <div class="modal-header">
                    <h2>📊 Quiz Analytics: ${result.quizTitle || 'Untitled Quiz'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                
                <div class="analytics-tabs">
                    <button class="tab-btn active" onclick="resultsViewer.switchAnalyticsTab(event, 'overview')">Overview</button>
                    <button class="tab-btn" onclick="resultsViewer.switchAnalyticsTab(event, 'questions')">Questions</button>
                    <button class="tab-btn" onclick="resultsViewer.switchAnalyticsTab(event, 'insights')">Insights</button>
                </div>

                <div class="tab-content active" id="overview-tab">
                    <div class="summary-stats">
                        <div class="stat-card">
                            <div class="stat-value">${summary.avgSuccessRate.toFixed(1)}%</div>
                            <div class="stat-label">Average Success Rate</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${summary.avgTime.toFixed(1)}s</div>
                            <div class="stat-label">Average Response Time</div>
                        </div>
                        <div class="stat-card ${summary.problematicCount > 0 ? 'warning' : 'success'}">
                            <div class="stat-value">${summary.problematicCount}</div>
                            <div class="stat-label">Questions Need Review</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${result.results?.length || 0}</div>
                            <div class="stat-label">Participants</div>
                        </div>
                    </div>
                    
                    <div class="chart-container">
                        <canvas id="success-rate-chart" width="400" height="200"></canvas>
                    </div>
                    
                    <div class="chart-container">
                        <canvas id="time-vs-success-scatter" width="400" height="200"></canvas>
                    </div>
                </div>

                <div class="tab-content" id="questions-tab">
                    <div class="questions-analytics-list">
                        ${analytics.map(q => `
                            <div class="question-analytics-item ${q.isPotentiallyProblematic ? 'problematic' : ''}">
                                <div class="question-header">
                                    <span class="question-number">Q${q.questionNumber}</span>
                                    <span class="success-rate ${this.getSuccessRateClass(q.successRate)}">${q.successRate.toFixed(1)}%</span>
                                </div>
                                <div class="question-text">${q.text}</div>
                                <div class="question-metrics">
                                    <span class="metric">⏱️ ${q.averageTime.toFixed(1)}s avg</span>
                                    <span class="metric">👥 ${q.totalResponses} responses</span>
                                    <span class="metric">📈 ${q.averagePoints.toFixed(0)} avg points</span>
                                </div>
                                ${q.problemFlags.length > 0 ? `
                                    <div class="problem-flags">
                                        ${q.problemFlags.map(flag => 
                                            `<span class="flag ${flag.severity}">${flag.message}</span>`
                                        ).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="tab-content" id="insights-tab">
                    <div class="insights-section">
                        <h3>🔍 Content Review Recommendations</h3>
                        ${problematicQuestions.length > 0 ? `
                            <div class="problematic-questions">
                                ${flagsHtml}
                            </div>
                        ` : '<p class="no-issues">✅ No major issues detected. All questions performing well!</p>'}
                        
                        <h3>📈 Performance Insights</h3>
                        <div class="insights-grid">
                            <div class="insight-item">
                                <h4>Hardest Question</h4>
                                <p><strong>Q${summary.hardestQuestion.number}:</strong> ${summary.hardestQuestion.text.substring(0, 80)}...</p>
                                <p>Success Rate: ${summary.hardestQuestion.successRate.toFixed(1)}%</p>
                            </div>
                            <div class="insight-item">
                                <h4>Easiest Question</h4>
                                <p><strong>Q${summary.easiestQuestion.number}:</strong> ${summary.easiestQuestion.text.substring(0, 80)}...</p>
                                <p>Success Rate: ${summary.easiestQuestion.successRate.toFixed(1)}%</p>
                            </div>
                        </div>
                        
                        ${summary.needsReview ? `
                            <div class="review-alert">
                                ⚠️ <strong>Quiz needs review:</strong> ${summary.problematicCount} out of ${summary.totalQuestions} questions (${(summary.problematicCount/summary.totalQuestions*100).toFixed(1)}%) may need improvement.
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    <button class="btn primary" onclick="resultsViewer.exportAnalyticsReport('${result.filename}')">Export Report</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Create charts after modal is in DOM
        setTimeout(() => {
            this.createSuccessRateChart(analytics);
            this.createTimeVsSuccessChart(analytics);
        }, 100);
    }

    /**
     * Switch between analytics tabs
     */
    switchAnalyticsTab(event, tabName) {
        // Remove active class from all tabs and content
        document.querySelectorAll('.analytics-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        event.target.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    /**
     * Get CSS class for success rate styling
     */
    getSuccessRateClass(rate) {
        if (rate >= 80) return 'excellent';
        if (rate >= 60) return 'good';
        if (rate >= 40) return 'fair';
        return 'poor';
    }

    /**
     * Create success rate bar chart
     */
    createSuccessRateChart(analytics) {
        const ctx = document.getElementById('success-rate-chart');
        if (!ctx) return;

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: analytics.map(q => `Q${q.questionNumber}`),
                datasets: [{
                    label: 'Success Rate (%)',
                    data: analytics.map(q => q.successRate),
                    backgroundColor: analytics.map(q => {
                        if (q.successRate >= 80) return '#10b981';
                        if (q.successRate >= 60) return '#f59e0b';
                        if (q.successRate >= 40) return '#f97316';
                        return '#ef4444';
                    }),
                    borderColor: '#374151',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Success Rate by Question'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Create time vs success scatter plot
     */
    createTimeVsSuccessChart(analytics) {
        const ctx = document.getElementById('time-vs-success-scatter');
        if (!ctx) return;

        new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Questions',
                    data: analytics.map(q => ({
                        x: q.averageTime,
                        y: q.successRate,
                        questionNumber: q.questionNumber,
                        text: q.text
                    })),
                    backgroundColor: analytics.map(q => q.isPotentiallyProblematic ? '#ef4444' : '#3b82f6'),
                    borderColor: '#374151',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Time vs Success Rate (Red = Problematic)'
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                const point = context[0].raw;
                                return `Q${point.questionNumber}`;
                            },
                            label: function(context) {
                                const point = context.raw;
                                return [
                                    `Success: ${point.y.toFixed(1)}%`,
                                    `Time: ${point.x.toFixed(1)}s`,
                                    `Text: ${point.text.substring(0, 50)}...`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Average Time (seconds)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Success Rate (%)'
                        },
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    /**
     * Export analytics report as CSV
     */
    async exportAnalyticsReport(filename) {
        try {
            logger.info('Analytics export requested for:', filename);

            // Download analytics CSV format
            await resultsManagerService.downloadResult(filename, 'analytics', 'csv');

            logger.debug('Analytics report downloaded successfully');
        } catch (error) {
            logger.error('Failed to export analytics report:', error);
            translationManager.showAlert('error', 'Failed to export analytics report');
        }
    }

    /**
     * Show modal explaining that analytics are not available for this result
     */
    showAnalyticsUnavailableModal(result) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.zIndex = '1050';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>📊 Analytics Not Available</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                
                <div class="modal-body" style="padding: 20px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="font-size: 4rem; margin-bottom: 16px;">📈</div>
                        <h3>Question Analytics Not Available</h3>
                        <p>This quiz result doesn't contain the detailed question data needed for analytics.</p>
                    </div>
                    
                    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
                        <h4 style="margin: 0 0 12px 0; color: #374151;">🔍 What you can still see:</h4>
                        <ul style="margin: 0; padding-left: 20px; color: #6b7280;">
                            <li>Player scores and rankings</li>
                            <li>Game completion data</li>
                            <li>Overall participation statistics</li>
                            <li>Basic performance summary</li>
                        </ul>
                    </div>
                    
                    <div style="background: #dbeafe; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                        <h4 style="margin: 0 0 12px 0; color: #1e40af;">💡 Why aren't analytics available?</h4>
                        <p style="margin: 0 0 12px 0; color: #1e40af;">
                            This game result was saved without the detailed question metadata needed for advanced analytics.
                        </p>
                        <p style="margin: 0; color: #1e40af;">
                            <strong>For full analytics in future games:</strong><br>
                            • New games automatically save complete analytics data<br>
                            • Create and host a new quiz to see detailed success rates, timing analysis, and question difficulty insights
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px;">
                        <p style="color: #6b7280; font-size: 0.9rem;">
                            <strong>Quiz:</strong> ${result.quizTitle || 'Untitled Quiz'}<br>
                            <strong>PIN:</strong> ${result.gamePin}<br>
                            <strong>Participants:</strong> ${result.results?.length || 0}
                        </p>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                    <button class="btn primary" data-filename="${escapeHtml(result.filename)}" onclick="resultsViewer.showDetailModalByFilename(this.dataset.filename); this.closest('.modal-overlay').remove();">View Basic Results</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    /**
     * Attempt to reconstruct basic question information from player results
     * Used as fallback when saved results don't include questions metadata
     */
    reconstructQuestionsFromResults(results) {
        try {
            if (!results || !results.length) {
                return [];
            }

            // Get the first player's answers to determine question count and structure
            const firstPlayer = results[0];
            if (!firstPlayer || !firstPlayer.answers) {
                return [];
            }

            const questions = [];
            const questionCount = firstPlayer.answers.length;

            for (let i = 0; i < questionCount; i++) {
                questions.push({
                    questionNumber: i + 1,
                    text: `Question ${i + 1}`,
                    type: 'multiple-choice',
                    correctAnswer: this.inferCorrectAnswer(results, i),
                    difficulty: 'unknown',
                    reconstructed: true
                });
            }

            return questions;
        } catch (error) {
            logger.error('Failed to reconstruct questions from results:', error);
            return [];
        }
    }

    /**
     * Infer the correct answer by analyzing which answers received points
     */
    inferCorrectAnswer(results, questionIndex) {
        const answerStats = new Map();
        let firstCorrectAnswer = null;

        for (const player of results) {
            const answer = player.answers?.[questionIndex];
            const score = player.scores?.[questionIndex] || 0;

            if (answer == null) continue;

            const stats = answerStats.get(answer) || { count: 0, totalScore: 0 };
            stats.count++;
            stats.totalScore += score;
            answerStats.set(answer, stats);

            if (score > 0 && !firstCorrectAnswer) {
                firstCorrectAnswer = answer;
            }
        }

        if (firstCorrectAnswer) {
            return firstCorrectAnswer;
        }

        // Fallback: find answer with highest average score
        let bestAnswer = null;
        let highestAvgScore = 0;

        for (const [answer, stats] of answerStats) {
            const avgScore = stats.totalScore / stats.count;
            if (avgScore > highestAvgScore) {
                highestAvgScore = avgScore;
                bestAnswer = answer;
            }
        }

        return bestAnswer || 'Unknown';
    }
}

// Create and export singleton instance
export const resultsViewer = new ResultsViewer();

// Make available globally for onclick handlers
window.resultsViewer = resultsViewer;

export default resultsViewer;