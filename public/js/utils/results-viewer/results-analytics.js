/**
 * Results Analytics - Analytics calculation and visualization for quiz results
 * Handles question analytics, problem flagging, charts, and insights
 */

import { logger } from '../../core/config.js';
import { escapeHtml } from '../dom.js';
import { getSuccessRateClass } from './results-filter-manager.js';

/**
 * Calculate comprehensive question analytics for identifying problematic questions
 * @param {Object} result - Quiz result data with questions and player answers
 * @returns {Array} Array of question analytics objects
 */
export function calculateQuestionAnalytics(result) {
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
            timeEfficiency: 0,
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
                    questionAnalysis.strugglingPlayers.push({
                        name: player.name,
                        answer: answer.answer,
                        time: (answer.timeMs || 0) / 1000,
                        points: answer.points || 0
                    });

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

        flagProblematicQuestion(questionAnalysis);
        analytics.push(questionAnalysis);
    });

    return analytics;
}

/**
 * Flag questions that may need review based on various criteria
 * @param {Object} analysis - Question analysis object to evaluate
 */
function flagProblematicQuestion(analysis) {
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
            message: 'Quick responses with errors - potential misconceptions'
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
export function getQuizSummaryStats(questionAnalytics) {
    if (!questionAnalytics.length) {
        return {};
    }

    const totalQuestions = questionAnalytics.length;
    const problematicCount = questionAnalytics.filter(q => q.isPotentiallyProblematic).length;
    const avgSuccessRate = questionAnalytics.reduce((sum, q) => sum + q.successRate, 0) / totalQuestions;
    const avgTime = questionAnalytics.reduce((sum, q) => sum + q.averageTime, 0) / totalQuestions;

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
        needsReview: problematicCount / totalQuestions > 0.3
    };
}

/**
 * Attempt to reconstruct basic question information from player results
 * Used as fallback when saved results don't include questions metadata
 * @param {Array} results - Player results array
 * @returns {Array} Reconstructed questions array
 */
export function reconstructQuestionsFromResults(results) {
    try {
        if (!results || !results.length) {
            return [];
        }

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
                correctAnswer: inferCorrectAnswer(results, i),
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
 * @param {Array} results - Player results array
 * @param {number} questionIndex - Index of the question
 * @returns {*} Inferred correct answer
 */
function inferCorrectAnswer(results, questionIndex) {
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

/**
 * Create the analytics modal HTML element
 * @param {Object} result - Quiz result data
 * @param {Array} analytics - Question analytics array
 * @param {Object} summary - Summary statistics
 * @returns {HTMLElement} Analytics modal element
 */
export function createAnalyticsModal(result, analytics, summary) {
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
            <strong>Q${q.questionNumber}:</strong> ${escapeHtml(q.text.substring(0, 60))}...
            <div class="problem-flags">
                ${q.problemFlags.map(flag =>
        `<span class="flag ${flag.severity}">${escapeHtml(flag.message)}</span>`
    ).join('')}
            </div>
        </div>`
    ).join('');

    const safeFilename = escapeHtml(result.filename);

    modal.innerHTML = `
        <div class="modal-content analytics-modal-content">
            <div class="modal-header">
                <h2>Quiz Analytics: ${escapeHtml(result.quizTitle || 'Untitled Quiz')}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>

            <div class="analytics-tabs">
                <button class="tab-btn active" data-tab="overview">Overview</button>
                <button class="tab-btn" data-tab="questions">Questions</button>
                <button class="tab-btn" data-tab="insights">Insights</button>
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
                                <span class="success-rate ${getSuccessRateClass(q.successRate)}">${q.successRate.toFixed(1)}%</span>
                            </div>
                            <div class="question-text">${escapeHtml(q.text)}</div>
                            <div class="question-metrics">
                                <span class="metric">${q.averageTime.toFixed(1)}s avg</span>
                                <span class="metric">${q.totalResponses} responses</span>
                                <span class="metric">${q.averagePoints.toFixed(0)} avg points</span>
                            </div>
                            ${q.problemFlags.length > 0 ? `
                                <div class="problem-flags">
                                    ${q.problemFlags.map(flag =>
        `<span class="flag ${flag.severity}">${escapeHtml(flag.message)}</span>`
    ).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="tab-content" id="insights-tab">
                <div class="insights-section">
                    <h3>Content Review Recommendations</h3>
                    ${problematicQuestions.length > 0 ? `
                        <div class="problematic-questions">
                            ${flagsHtml}
                        </div>
                    ` : '<p class="no-issues">No major issues detected. All questions performing well!</p>'}

                    <h3>Performance Insights</h3>
                    <div class="insights-grid">
                        <div class="insight-item">
                            <h4>Hardest Question</h4>
                            <p><strong>Q${summary.hardestQuestion.number}:</strong> ${escapeHtml(summary.hardestQuestion.text.substring(0, 80))}...</p>
                            <p>Success Rate: ${summary.hardestQuestion.successRate.toFixed(1)}%</p>
                        </div>
                        <div class="insight-item">
                            <h4>Easiest Question</h4>
                            <p><strong>Q${summary.easiestQuestion.number}:</strong> ${escapeHtml(summary.easiestQuestion.text.substring(0, 80))}...</p>
                            <p>Success Rate: ${summary.easiestQuestion.successRate.toFixed(1)}%</p>
                        </div>
                    </div>

                    ${summary.needsReview ? `
                        <div class="review-alert">
                            <strong>Quiz needs review:</strong> ${summary.problematicCount} out of ${summary.totalQuestions} questions (${(summary.problematicCount / summary.totalQuestions * 100).toFixed(1)}%) may need improvement.
                        </div>
                    ` : ''}
                </div>
            </div>

            <div class="modal-footer">
                <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                <button class="btn primary" data-action="export-analytics" data-filename="${safeFilename}">Export Report</button>
            </div>
        </div>
    `;

    return modal;
}

/**
 * Create success rate bar chart using Chart.js
 * @param {Array} analytics - Question analytics array
 */
export function createSuccessRateChart(analytics) {
    const ctx = document.getElementById('success-rate-chart');
    if (!ctx || typeof Chart === 'undefined') {
        return;
    }

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
 * Create time vs success scatter plot using Chart.js
 * @param {Array} analytics - Question analytics array
 */
export function createTimeVsSuccessChart(analytics) {
    const ctx = document.getElementById('time-vs-success-scatter');
    if (!ctx || typeof Chart === 'undefined') {
        return;
    }

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
 * Switch between analytics tabs
 * @param {Event} event - Click event
 * @param {string} tabName - Tab identifier
 */
export function switchAnalyticsTab(event, tabName) {
    document.querySelectorAll('.analytics-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    const tabContent = document.getElementById(`${tabName}-tab`);
    if (tabContent) {
        tabContent.classList.add('active');
    }
}

export default {
    calculateQuestionAnalytics,
    getQuizSummaryStats,
    reconstructQuestionsFromResults,
    createAnalyticsModal,
    createSuccessRateChart,
    createTimeVsSuccessChart,
    switchAnalyticsTab
};
