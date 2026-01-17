/**
 * Analytics Dashboard Module
 * Provides interactive visualization of quiz results using Chart.js
 *
 * Features:
 * - Question difficulty analysis
 * - Player performance trends
 * - Most common wrong answers
 * - Time-based analysis
 */

import { logger } from '../core/config.js';

export class AnalyticsDashboard {
    constructor() {
        this.charts = new Map();
        this.chartJsLoaded = false;
        this.loadChartJs();
    }

    /**
     * Load Chart.js from CDN
     */
    async loadChartJs() {
        if (window.Chart) {
            this.chartJsLoaded = true;
            return;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
            script.onload = () => {
                this.chartJsLoaded = true;
                logger.debug('Chart.js loaded successfully');
                resolve();
            };
            script.onerror = () => {
                logger.error('Failed to load Chart.js');
                reject(new Error('Failed to load Chart.js'));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Wait for Chart.js to be loaded
     */
    async ensureChartJs() {
        if (this.chartJsLoaded) return;

        // Wait up to 5 seconds for Chart.js to load
        const maxWait = 5000;
        const startTime = Date.now();

        while (!this.chartJsLoaded && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!this.chartJsLoaded) {
            throw new Error('Chart.js failed to load');
        }
    }

    /**
     * Create the analytics dashboard modal
     * @param {Object} resultsData - The results data to visualize
     */
    async showDashboard(resultsData) {
        await this.ensureChartJs();

        // Create modal container
        const modal = document.createElement('div');
        modal.id = 'analytics-dashboard-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content analytics-modal">
                <div class="modal-header">
                    <h2>Quiz Analytics: ${resultsData.quizTitle || 'Quiz Results'}</h2>
                    <button class="modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body analytics-body">
                    <div class="analytics-tabs">
                        <button class="analytics-tab active" data-tab="overview">Overview</button>
                        <button class="analytics-tab" data-tab="questions">Questions</button>
                        <button class="analytics-tab" data-tab="players">Players</button>
                        <button class="analytics-tab" data-tab="timing">Timing</button>
                    </div>
                    <div class="analytics-content">
                        <div class="analytics-panel active" id="panel-overview">
                            <div class="analytics-grid">
                                <div class="analytics-card">
                                    <h3>Summary</h3>
                                    <div class="summary-stats" id="summary-stats"></div>
                                </div>
                                <div class="analytics-card">
                                    <h3>Score Distribution</h3>
                                    <canvas id="chart-score-distribution"></canvas>
                                </div>
                                <div class="analytics-card">
                                    <h3>Difficulty Breakdown</h3>
                                    <canvas id="chart-difficulty"></canvas>
                                </div>
                                <div class="analytics-card">
                                    <h3>Overall Performance</h3>
                                    <canvas id="chart-performance"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="analytics-panel" id="panel-questions">
                            <div class="analytics-card full-width">
                                <h3>Question Success Rates</h3>
                                <canvas id="chart-question-success"></canvas>
                            </div>
                            <div class="analytics-card full-width">
                                <h3>Most Difficult Questions</h3>
                                <div id="difficult-questions-list"></div>
                            </div>
                        </div>
                        <div class="analytics-panel" id="panel-players">
                            <div class="analytics-card full-width">
                                <h3>Player Rankings</h3>
                                <canvas id="chart-player-rankings"></canvas>
                            </div>
                            <div class="analytics-card full-width">
                                <h3>Player Comparison</h3>
                                <div id="player-comparison-table"></div>
                            </div>
                        </div>
                        <div class="analytics-panel" id="panel-timing">
                            <div class="analytics-card full-width">
                                <h3>Average Response Time by Question</h3>
                                <canvas id="chart-response-time"></canvas>
                            </div>
                            <div class="analytics-card">
                                <h3>Time vs Accuracy</h3>
                                <canvas id="chart-time-accuracy"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Setup event listeners
        this.setupModalEvents(modal, resultsData);

        // Render initial charts
        this.renderOverviewPanel(resultsData);

        // Show modal with animation
        requestAnimationFrame(() => {
            modal.classList.add('visible');
        });
    }

    /**
     * Setup modal event listeners
     */
    setupModalEvents(modal, resultsData) {
        // Close button
        modal.querySelector('.modal-close').addEventListener('click', () => {
            this.closeDashboard();
        });

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeDashboard();
            }
        });

        // Tab switching
        modal.querySelectorAll('.analytics-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(modal, tab.dataset.tab, resultsData);
            });
        });

        // Escape key to close
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeDashboard();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }

    /**
     * Switch between analytics tabs
     */
    switchTab(modal, tabName, resultsData) {
        // Update tab buttons
        modal.querySelectorAll('.analytics-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update panels
        modal.querySelectorAll('.analytics-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `panel-${tabName}`);
        });

        // Render tab content
        switch (tabName) {
            case 'overview':
                this.renderOverviewPanel(resultsData);
                break;
            case 'questions':
                this.renderQuestionsPanel(resultsData);
                break;
            case 'players':
                this.renderPlayersPanel(resultsData);
                break;
            case 'timing':
                this.renderTimingPanel(resultsData);
                break;
        }
    }

    /**
     * Close the dashboard modal
     */
    closeDashboard() {
        const modal = document.getElementById('analytics-dashboard-modal');
        if (modal) {
            modal.classList.remove('visible');
            setTimeout(() => {
                // Destroy all charts
                this.charts.forEach(chart => chart.destroy());
                this.charts.clear();
                modal.remove();
            }, 300);
        }
    }

    /**
     * Render the overview panel
     */
    renderOverviewPanel(resultsData) {
        const results = resultsData.results || [];
        const questions = resultsData.questions || [];

        // Summary stats
        const summaryStats = document.getElementById('summary-stats');
        if (summaryStats) {
            const totalCorrect = results.reduce((sum, player) => {
                return sum + (player.answers || []).filter(a => a.isCorrect).length;
            }, 0);
            const totalAnswers = results.length * questions.length;
            const avgScore = results.length > 0
                ? Math.round(results.reduce((sum, p) => sum + p.score, 0) / results.length)
                : 0;

            summaryStats.innerHTML = `
                <div class="stat-item">
                    <span class="stat-value">${results.length}</span>
                    <span class="stat-label">Players</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${questions.length}</span>
                    <span class="stat-label">Questions</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${totalAnswers > 0 ? Math.round(totalCorrect / totalAnswers * 100) : 0}%</span>
                    <span class="stat-label">Accuracy</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${avgScore}</span>
                    <span class="stat-label">Avg Score</span>
                </div>
            `;
        }

        // Score distribution chart
        this.renderScoreDistributionChart(results);

        // Difficulty breakdown chart
        this.renderDifficultyChart(questions, results);

        // Performance chart
        this.renderPerformanceChart(questions, results);
    }

    /**
     * Render score distribution chart
     */
    renderScoreDistributionChart(results) {
        const canvas = document.getElementById('chart-score-distribution');
        if (!canvas) return;

        // Destroy existing chart
        if (this.charts.has('score-distribution')) {
            this.charts.get('score-distribution').destroy();
        }

        const labels = results.map(p => p.name);

        const chart = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Score',
                    data: results.map(p => p.score),
                    backgroundColor: 'rgba(99, 102, 241, 0.7)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });

        this.charts.set('score-distribution', chart);
    }

    /**
     * Render difficulty breakdown chart
     */
    renderDifficultyChart(questions, _results) {
        const canvas = document.getElementById('chart-difficulty');
        if (!canvas) return;

        if (this.charts.has('difficulty')) {
            this.charts.get('difficulty').destroy();
        }

        // Count questions by difficulty
        const difficultyCount = { easy: 0, medium: 0, hard: 0 };
        questions.forEach(q => {
            const diff = q.difficulty || 'medium';
            difficultyCount[diff] = (difficultyCount[diff] || 0) + 1;
        });

        const chart = new window.Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: ['Easy', 'Medium', 'Hard'],
                datasets: [{
                    data: [difficultyCount.easy, difficultyCount.medium, difficultyCount.hard],
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.7)',
                        'rgba(251, 191, 36, 0.7)',
                        'rgba(239, 68, 68, 0.7)'
                    ],
                    borderColor: [
                        'rgba(34, 197, 94, 1)',
                        'rgba(251, 191, 36, 1)',
                        'rgba(239, 68, 68, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });

        this.charts.set('difficulty', chart);
    }

    /**
     * Render overall performance chart
     */
    renderPerformanceChart(questions, results) {
        const canvas = document.getElementById('chart-performance');
        if (!canvas) return;

        if (this.charts.has('performance')) {
            this.charts.get('performance').destroy();
        }

        // Calculate success rate per question
        const successRates = questions.map((_, qIndex) => {
            const correct = results.filter(player => {
                const answer = player.answers?.[qIndex];
                return answer?.isCorrect;
            }).length;
            return results.length > 0 ? (correct / results.length) * 100 : 0;
        });

        const chart = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels: questions.map((_, i) => `Q${i + 1}`),
                datasets: [{
                    label: 'Success Rate (%)',
                    data: successRates,
                    fill: true,
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });

        this.charts.set('performance', chart);
    }

    /**
     * Render the questions panel
     */
    renderQuestionsPanel(resultsData) {
        const questions = resultsData.questions || [];
        const results = resultsData.results || [];

        // Question success rates
        const canvas = document.getElementById('chart-question-success');
        if (canvas) {
            if (this.charts.has('question-success')) {
                this.charts.get('question-success').destroy();
            }

            const successRates = questions.map((q, qIndex) => {
                const correct = results.filter(player => {
                    const answer = player.answers?.[qIndex];
                    return answer?.isCorrect;
                }).length;
                return results.length > 0 ? Math.round((correct / results.length) * 100) : 0;
            });

            const chart = new window.Chart(canvas, {
                type: 'bar',
                data: {
                    labels: questions.map((q, i) => `Q${i + 1}: ${(q.text || q.question || '').substring(0, 30)}...`),
                    datasets: [{
                        label: 'Success Rate (%)',
                        data: successRates,
                        backgroundColor: successRates.map(rate =>
                            rate >= 70 ? 'rgba(34, 197, 94, 0.7)' :
                                rate >= 40 ? 'rgba(251, 191, 36, 0.7)' :
                                    'rgba(239, 68, 68, 0.7)'
                        )
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: { max: 100 }
                    }
                }
            });

            this.charts.set('question-success', chart);
        }

        // Most difficult questions list
        const listContainer = document.getElementById('difficult-questions-list');
        if (listContainer) {
            const questionStats = questions.map((q, qIndex) => {
                const correct = results.filter(player => player.answers?.[qIndex]?.isCorrect).length;
                return {
                    index: qIndex + 1,
                    text: q.text || q.question || 'Unknown',
                    successRate: results.length > 0 ? Math.round((correct / results.length) * 100) : 0
                };
            }).sort((a, b) => a.successRate - b.successRate).slice(0, 5);

            listContainer.innerHTML = `
                <ol class="difficult-questions">
                    ${questionStats.map(q => `
                        <li>
                            <span class="question-number">Q${q.index}</span>
                            <span class="question-text">${q.text.substring(0, 50)}...</span>
                            <span class="success-rate ${q.successRate < 40 ? 'low' : ''}">${q.successRate}%</span>
                        </li>
                    `).join('')}
                </ol>
            `;
        }
    }

    /**
     * Render the players panel
     */
    renderPlayersPanel(resultsData) {
        const results = resultsData.results || [];

        // Player rankings chart
        const canvas = document.getElementById('chart-player-rankings');
        if (canvas) {
            if (this.charts.has('player-rankings')) {
                this.charts.get('player-rankings').destroy();
            }

            const sortedPlayers = [...results].sort((a, b) => b.score - a.score);

            const chart = new window.Chart(canvas, {
                type: 'bar',
                data: {
                    labels: sortedPlayers.map(p => p.name),
                    datasets: [{
                        label: 'Score',
                        data: sortedPlayers.map(p => p.score),
                        backgroundColor: sortedPlayers.map((_, i) =>
                            i === 0 ? 'rgba(251, 191, 36, 0.8)' :
                                i === 1 ? 'rgba(156, 163, 175, 0.8)' :
                                    i === 2 ? 'rgba(180, 83, 9, 0.8)' :
                                        'rgba(99, 102, 241, 0.7)'
                        )
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    }
                }
            });

            this.charts.set('player-rankings', chart);
        }

        // Player comparison table
        const tableContainer = document.getElementById('player-comparison-table');
        if (tableContainer) {
            const sortedPlayers = [...results].sort((a, b) => b.score - a.score);

            tableContainer.innerHTML = `
                <table class="analytics-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>Score</th>
                            <th>Correct</th>
                            <th>Accuracy</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedPlayers.map((player, i) => {
        const correct = (player.answers || []).filter(a => a.isCorrect).length;
        const total = player.answers?.length || 0;
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
        return `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${player.name}</td>
                                    <td>${player.score}</td>
                                    <td>${correct}/${total}</td>
                                    <td>${accuracy}%</td>
                                </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    /**
     * Render the timing panel
     */
    renderTimingPanel(resultsData) {
        const results = resultsData.results || [];
        const questions = resultsData.questions || [];

        // Response time by question
        const canvas = document.getElementById('chart-response-time');
        if (canvas) {
            if (this.charts.has('response-time')) {
                this.charts.get('response-time').destroy();
            }

            const avgTimes = questions.map((_, qIndex) => {
                const times = results
                    .map(player => player.answers?.[qIndex]?.timeMs)
                    .filter(t => t != null);
                return times.length > 0
                    ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 1000 * 10) / 10
                    : 0;
            });

            const chart = new window.Chart(canvas, {
                type: 'bar',
                data: {
                    labels: questions.map((_, i) => `Q${i + 1}`),
                    datasets: [{
                        label: 'Avg Response Time (s)',
                        data: avgTimes,
                        backgroundColor: 'rgba(99, 102, 241, 0.7)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });

            this.charts.set('response-time', chart);
        }

        // Time vs Accuracy scatter
        const scatterCanvas = document.getElementById('chart-time-accuracy');
        if (scatterCanvas) {
            if (this.charts.has('time-accuracy')) {
                this.charts.get('time-accuracy').destroy();
            }

            const scatterData = results.map(player => {
                const answers = player.answers || [];
                const avgTime = answers.length > 0
                    ? answers.reduce((sum, a) => sum + (a.timeMs || 0), 0) / answers.length / 1000
                    : 0;
                const accuracy = answers.length > 0
                    ? answers.filter(a => a.isCorrect).length / answers.length * 100
                    : 0;
                return { x: avgTime, y: accuracy, name: player.name };
            });

            const chart = new window.Chart(scatterCanvas, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Players',
                        data: scatterData,
                        backgroundColor: 'rgba(99, 102, 241, 0.7)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { title: { display: true, text: 'Avg Response Time (s)' } },
                        y: { title: { display: true, text: 'Accuracy (%)' }, max: 100 }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const point = scatterData[ctx.dataIndex];
                                    return `${point.name}: ${point.x.toFixed(1)}s, ${point.y.toFixed(0)}%`;
                                }
                            }
                        }
                    }
                }
            });

            this.charts.set('time-accuracy', chart);
        }
    }
}

// Export singleton instance
export const analyticsDashboard = new AnalyticsDashboard();
