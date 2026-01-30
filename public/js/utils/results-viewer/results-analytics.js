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
                <p class="click-hint">Click a question for detailed breakdown</p>
                <div class="questions-analytics-list">
                    ${analytics.map((q, idx) => `
                        <div class="question-analytics-item clickable ${q.isPotentiallyProblematic ? 'problematic' : ''}" data-question-index="${idx}">
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
                <button class="btn secondary" data-action="export-excel" data-filename="${safeFilename}">Export Excel</button>
                <button class="btn secondary" data-action="export-pdf" data-filename="${safeFilename}">Export PDF</button>
                <button class="btn primary" data-action="export-analytics" data-filename="${safeFilename}">Export CSV</button>
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

/**
 * Create question drill-down modal for detailed answer breakdown
 * @param {Object} questionAnalysis - Analytics data for the specific question
 * @param {Object} question - Original question data (if available)
 * @param {Array} playerAnswers - Array of player answer data for this question
 * @returns {HTMLElement} Drill-down modal element
 */
export function createQuestionDrilldownModal(questionAnalysis, question, playerAnswers) {
    const existingModal = document.getElementById('question-drilldown-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'question-drilldown-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '1060';

    const qNum = questionAnalysis.questionNumber;
    const qText = questionAnalysis.text || `Question ${qNum}`;
    const qType = questionAnalysis.type || 'multiple-choice';

    // Build answer distribution data
    const answerCounts = {};
    const timeBuckets = { '0-5s': 0, '5-10s': 0, '10-15s': 0, '15-20s': 0, '20s+': 0 };
    let correctCount = 0;
    let incorrectCount = 0;

    playerAnswers.forEach(pa => {
        if (!pa) return;

        // Count answers
        const answerKey = Array.isArray(pa.answer) ? pa.answer.join(', ') : String(pa.answer ?? 'No answer');
        answerCounts[answerKey] = (answerCounts[answerKey] || 0) + 1;

        // Count correct/incorrect
        if (pa.isCorrect) {
            correctCount++;
        } else {
            incorrectCount++;
        }

        // Time buckets
        const timeSec = (pa.timeMs || 0) / 1000;
        if (timeSec <= 5) timeBuckets['0-5s']++;
        else if (timeSec <= 10) timeBuckets['5-10s']++;
        else if (timeSec <= 15) timeBuckets['10-15s']++;
        else if (timeSec <= 20) timeBuckets['15-20s']++;
        else timeBuckets['20s+']++;
    });

    // Sort answers by count (descending)
    const sortedAnswers = Object.entries(answerCounts)
        .sort((a, b) => b[1] - a[1]);

    // Build answer distribution HTML
    const answerDistHtml = sortedAnswers.map(([answer, count]) => {
        const percentage = ((count / questionAnalysis.totalResponses) * 100).toFixed(1);
        const isCorrect = answer === String(questionAnalysis.correctAnswer) ||
            (Array.isArray(questionAnalysis.correctAnswer) && answer === questionAnalysis.correctAnswer.join(', '));
        const barColor = isCorrect ? '#10b981' : '#ef4444';

        return `
            <div class="answer-dist-row">
                <div class="answer-text ${isCorrect ? 'correct' : ''}">${escapeHtml(answer.substring(0, 50))}${answer.length > 50 ? '...' : ''}</div>
                <div class="answer-bar-container">
                    <div class="answer-bar" style="width: ${percentage}%; background: ${barColor};"></div>
                </div>
                <div class="answer-count">${count} (${percentage}%)</div>
            </div>
        `;
    }).join('');

    // Build time distribution HTML
    const maxTimeCount = Math.max(...Object.values(timeBuckets), 1);
    const timeDistHtml = Object.entries(timeBuckets).map(([bucket, count]) => {
        const percentage = (count / maxTimeCount) * 100;
        return `
            <div class="time-dist-row">
                <div class="time-label">${bucket}</div>
                <div class="time-bar-container">
                    <div class="time-bar" style="width: ${percentage}%;"></div>
                </div>
                <div class="time-count">${count}</div>
            </div>
        `;
    }).join('');

    // Common wrong answers (top 5)
    const wrongAnswers = Object.entries(questionAnalysis.commonWrongAnswers || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const wrongAnswersHtml = wrongAnswers.length > 0
        ? wrongAnswers.map(([answer, count]) => `
            <div class="wrong-answer-item">
                <span class="wrong-answer-text">${escapeHtml(answer.substring(0, 40))}${answer.length > 40 ? '...' : ''}</span>
                <span class="wrong-answer-count">${count} students</span>
            </div>
        `).join('')
        : '<p class="no-wrong-answers">All answers were correct!</p>';

    modal.innerHTML = `
        <div class="modal-content drilldown-modal-content">
            <div class="modal-header">
                <h2>Question ${qNum} Details</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>

            <div class="drilldown-body">
                <div class="drilldown-question-text">
                    <span class="question-type-badge">${qType}</span>
                    ${escapeHtml(qText)}
                </div>

                <div class="drilldown-stats">
                    <div class="drilldown-stat">
                        <div class="stat-value ${questionAnalysis.successRate >= 60 ? 'good' : 'poor'}">${questionAnalysis.successRate.toFixed(1)}%</div>
                        <div class="stat-label">Success Rate</div>
                    </div>
                    <div class="drilldown-stat">
                        <div class="stat-value">${questionAnalysis.averageTime.toFixed(1)}s</div>
                        <div class="stat-label">Avg Time</div>
                    </div>
                    <div class="drilldown-stat">
                        <div class="stat-value correct">${correctCount}</div>
                        <div class="stat-label">Correct</div>
                    </div>
                    <div class="drilldown-stat">
                        <div class="stat-value incorrect">${incorrectCount}</div>
                        <div class="stat-label">Incorrect</div>
                    </div>
                </div>

                <div class="drilldown-section">
                    <h4>Answer Distribution</h4>
                    <div class="answer-distribution">
                        ${answerDistHtml}
                    </div>
                </div>

                <div class="drilldown-section">
                    <h4>Response Time Distribution</h4>
                    <div class="time-distribution">
                        ${timeDistHtml}
                    </div>
                </div>

                <div class="drilldown-section">
                    <h4>Most Common Wrong Answers</h4>
                    <div class="wrong-answers-list">
                        ${wrongAnswersHtml}
                    </div>
                </div>

                ${questionAnalysis.problemFlags && questionAnalysis.problemFlags.length > 0 ? `
                    <div class="drilldown-section">
                        <h4>Issues Detected</h4>
                        <div class="problem-flags">
                            ${questionAnalysis.problemFlags.map(flag =>
        `<span class="flag ${flag.severity}">${escapeHtml(flag.message)}</span>`
    ).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>

            <div class="modal-footer">
                <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
            </div>
        </div>
    `;

    return modal;
}

/**
 * Create numeric answer distribution histogram
 * Shows how numeric answers were distributed with correct answer highlighted
 * @param {string} canvasId - Canvas element ID
 * @param {Object} questionData - Question analytics data including answer distribution
 * @param {number} correctAnswer - The correct numeric answer
 */
export function createNumericDistributionChart(canvasId, questionData, correctAnswer) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') {
        return null;
    }

    const answers = questionData.answers || [];
    if (answers.length === 0) {
        return null;
    }

    // Extract numeric values
    const numericAnswers = answers
        .map(a => parseFloat(a.value))
        .filter(v => !isNaN(v));

    if (numericAnswers.length === 0) {
        return null;
    }

    // Calculate bucket ranges
    const min = Math.min(...numericAnswers);
    const max = Math.max(...numericAnswers);
    const range = max - min || 1;
    const bucketCount = Math.min(10, Math.max(5, Math.ceil(numericAnswers.length / 3)));
    const bucketSize = range / bucketCount;

    // Create buckets
    const buckets = Array(bucketCount).fill(0);
    const bucketLabels = [];

    for (let i = 0; i < bucketCount; i++) {
        const bucketMin = min + (i * bucketSize);
        const bucketMax = min + ((i + 1) * bucketSize);
        bucketLabels.push(`${bucketMin.toFixed(1)}-${bucketMax.toFixed(1)}`);
    }

    // Fill buckets
    numericAnswers.forEach(value => {
        let bucketIndex = Math.floor((value - min) / bucketSize);
        if (bucketIndex >= bucketCount) bucketIndex = bucketCount - 1;
        if (bucketIndex < 0) bucketIndex = 0;
        buckets[bucketIndex]++;
    });

    // Find which bucket contains the correct answer
    let correctBucketIndex = -1;
    if (correctAnswer !== null && correctAnswer !== undefined) {
        const correctNum = parseFloat(correctAnswer);
        if (!isNaN(correctNum)) {
            correctBucketIndex = Math.floor((correctNum - min) / bucketSize);
            if (correctBucketIndex >= bucketCount) correctBucketIndex = bucketCount - 1;
            if (correctBucketIndex < 0) correctBucketIndex = 0;
        }
    }

    // Calculate mean and median
    const mean = numericAnswers.reduce((a, b) => a + b, 0) / numericAnswers.length;
    const sorted = [...numericAnswers].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bucketLabels,
            datasets: [{
                label: 'Answer Count',
                data: buckets,
                backgroundColor: buckets.map((_, i) =>
                    i === correctBucketIndex ? '#10b981' : '#3b82f6'
                ),
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
                    text: 'Numeric Answer Distribution'
                },
                legend: {
                    display: false
                },
                annotation: {
                    annotations: {
                        meanLine: {
                            type: 'line',
                            xMin: (mean - min) / bucketSize,
                            xMax: (mean - min) / bucketSize,
                            borderColor: '#f59e0b',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: `Mean: ${mean.toFixed(2)}`,
                                position: 'start'
                            }
                        },
                        medianLine: {
                            type: 'line',
                            xMin: (median - min) / bucketSize,
                            xMax: (median - min) / bucketSize,
                            borderColor: '#8b5cf6',
                            borderWidth: 2,
                            borderDash: [3, 3],
                            label: {
                                display: true,
                                content: `Median: ${median.toFixed(2)}`,
                                position: 'end'
                            }
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const idx = context.dataIndex;
                            if (idx === correctBucketIndex) {
                                return '(Contains correct answer)';
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Answers'
                    },
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Answer Range'
                    }
                }
            }
        }
    });
}

/**
 * Create horizontal bar chart for multiple-correct questions
 * Shows selection count per option with correct options highlighted
 * @param {string} canvasId - Canvas element ID
 * @param {Object} questionData - Question analytics data
 * @param {Array} options - Array of option objects with text and isCorrect
 */
export function createMultipleCorrectChart(canvasId, questionData, options) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') {
        return null;
    }

    if (!options || options.length === 0) {
        return null;
    }

    // Count selections per option
    const selectionCounts = options.map(() => 0);
    const totalResponses = questionData.totalResponses || 1;

    if (questionData.optionSelections) {
        questionData.optionSelections.forEach((count, idx) => {
            if (idx < selectionCounts.length) {
                selectionCounts[idx] = count;
            }
        });
    }

    // Calculate percentages
    const percentages = selectionCounts.map(count =>
        Math.round((count / totalResponses) * 100)
    );

    // Truncate long option text
    const labels = options.map((opt, idx) => {
        const text = opt.text || opt.label || `Option ${idx + 1}`;
        return text.length > 30 ? text.substring(0, 27) + '...' : text;
    });

    // Colors: green for correct, red for incorrect
    const backgroundColors = options.map(opt =>
        opt.isCorrect ? '#10b981' : '#ef4444'
    );

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Selection %',
                data: percentages,
                backgroundColor: backgroundColors,
                borderColor: '#374151',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Option Selection Distribution'
                },
                legend: {
                    display: true,
                    labels: {
                        generateLabels: function() {
                            return [
                                { text: 'Correct Option', fillStyle: '#10b981', strokeStyle: '#374151' },
                                { text: 'Incorrect Option', fillStyle: '#ef4444', strokeStyle: '#374151' }
                            ];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const idx = context.dataIndex;
                            const count = selectionCounts[idx];
                            const pct = percentages[idx];
                            return `${count} selections (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Selection Rate (%)'
                    },
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
 * Create comparison line chart for multiple game sessions
 * Shows success rate trends over time per question
 * @param {string} canvasId - Canvas element ID
 * @param {Array} sessionsData - Array of session analytics objects
 */
export function createComparisonChart(canvasId, sessionsData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') {
        return null;
    }

    if (!sessionsData || sessionsData.length < 2) {
        return null;
    }

    // X-axis: session dates
    const labels = sessionsData.map(s => {
        const date = new Date(s.date);
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });

    // Find common question count
    const questionCounts = sessionsData.map(s => s.questionAnalytics?.length || 0);
    const minQuestions = Math.min(...questionCounts);

    // Create datasets for each question
    const datasets = [];
    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];

    // Overall average dataset (always shown)
    const avgData = sessionsData.map(s => {
        const analytics = s.questionAnalytics || [];
        if (analytics.length === 0) return 0;
        return analytics.reduce((sum, q) => sum + q.successRate, 0) / analytics.length;
    });

    datasets.push({
        label: 'Overall Average',
        data: avgData,
        borderColor: '#1f2937',
        backgroundColor: '#1f293720',
        borderWidth: 3,
        tension: 0.3,
        fill: false
    });

    // Per-question datasets (up to 5 for clarity)
    for (let i = 0; i < Math.min(minQuestions, 5); i++) {
        const questionData = sessionsData.map(s => {
            const analytics = s.questionAnalytics || [];
            return analytics[i]?.successRate || 0;
        });

        datasets.push({
            label: `Q${i + 1}`,
            data: questionData,
            borderColor: colors[i % colors.length],
            backgroundColor: colors[i % colors.length] + '20',
            borderWidth: 2,
            tension: 0.3,
            fill: false
        });
    }

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Success Rate Comparison Across Sessions'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Success Rate (%)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Session Date'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

/**
 * Calculate comparative metrics across multiple game sessions
 * @param {Array} resultsArray - Array of full result objects for same quiz
 * @returns {Object} Comparative metrics object
 */
export function calculateComparativeMetrics(resultsArray) {
    if (!resultsArray || resultsArray.length < 2) {
        return null;
    }

    const sessions = resultsArray.map(result => {
        const analytics = calculateQuestionAnalytics(result);
        const summary = getQuizSummaryStats(analytics);

        return {
            date: result.saved,
            filename: result.filename,
            participantCount: result.results?.length || 0,
            questionAnalytics: analytics,
            summary: summary,
            overallSuccessRate: summary.avgSuccessRate || 0
        };
    });

    // Sort by date
    sessions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate trends
    const firstSession = sessions[0];
    const lastSession = sessions[sessions.length - 1];
    const overallTrend = lastSession.overallSuccessRate - firstSession.overallSuccessRate;

    // Per-question trends
    const questionCount = Math.min(
        ...sessions.map(s => s.questionAnalytics?.length || 0)
    );

    const questionTrends = [];
    for (let i = 0; i < questionCount; i++) {
        const firstRate = firstSession.questionAnalytics[i]?.successRate || 0;
        const lastRate = lastSession.questionAnalytics[i]?.successRate || 0;
        questionTrends.push({
            questionNumber: i + 1,
            trend: lastRate - firstRate,
            firstRate,
            lastRate
        });
    }

    // Find most improved and most declined questions
    const sortedByTrend = [...questionTrends].sort((a, b) => b.trend - a.trend);
    const mostImproved = sortedByTrend[0];
    const mostDeclined = sortedByTrend[sortedByTrend.length - 1];

    return {
        sessions,
        sessionCount: sessions.length,
        overallTrend,
        trendDirection: overallTrend > 2 ? 'improving' : overallTrend < -2 ? 'declining' : 'stable',
        questionTrends,
        mostImproved: mostImproved?.trend > 0 ? mostImproved : null,
        mostDeclined: mostDeclined?.trend < 0 ? mostDeclined : null,
        averageParticipants: Math.round(
            sessions.reduce((sum, s) => sum + s.participantCount, 0) / sessions.length
        )
    };
}

export default {
    calculateQuestionAnalytics,
    getQuizSummaryStats,
    reconstructQuestionsFromResults,
    createAnalyticsModal,
    createSuccessRateChart,
    createTimeVsSuccessChart,
    switchAnalyticsTab,
    createQuestionDrilldownModal,
    createNumericDistributionChart,
    createMultipleCorrectChart,
    createComparisonChart,
    calculateComparativeMetrics
};
