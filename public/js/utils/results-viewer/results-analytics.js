/**
 * Results Analytics - Analytics calculation and visualization for quiz results
 * Handles question analytics, problem flagging, charts, and insights
 */

import { logger } from '../../core/config.js';
import { escapeHtml } from '../dom.js';
import { getTranslation } from '../translation-manager.js';
import { getSuccessRateClass } from './results-filter-manager.js';
import { getChartTheme, baseChartOptions, themedScale } from './chart-theme.js';
import {
    formatAnswerLabel,
    resolveCorrectAnswerLabel,
    normalizeAnswerRecord
} from './answer-format.js';

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
            correctAnswerLabel: resolveCorrectAnswerLabel(question),
            isPoll: question.isPoll === true,

            // Performance metrics
            totalResponses: 0,
            correctResponses: 0,
            timedResponses: 0,
            averageTime: 0,
            totalTime: 0,
            averagePoints: 0,
            totalPoints: 0,

            // Analysis metrics
            successRate: 0,
            timeEfficiency: 0,
            unanswered: false,
            strugglingPlayers: [],
            commonWrongAnswers: {},

            // Flags for problematic questions
            isPotentiallyProblematic: false,
            problemFlags: []
        };

        // Analyze each player's response to this question
        result.results.forEach(player => {
            const answer = normalizeAnswerRecord(player.answers?.[qIndex]);
            if (!answer) return;

            questionAnalysis.totalResponses++;
            questionAnalysis.totalPoints += answer.points;

            // A record without timing would otherwise report an artificial 0s
            // response time for the whole question.
            if (answer.timeMs !== null) {
                questionAnalysis.timedResponses++;
                questionAnalysis.totalTime += answer.timeMs / 1000;
            }

            // A poll response is neither right nor wrong; it never counts as a
            // correct response and never lands in the "struggling" bucket.
            if (answer.isPoll || questionAnalysis.isPoll) return;

            if (answer.isCorrect) {
                questionAnalysis.correctResponses++;
                return;
            }

            const label = formatAnswerLabel(answer.value, question);
            questionAnalysis.strugglingPlayers.push({
                name: player.name,
                answer: label,
                time: (answer.timeMs || 0) / 1000,
                points: answer.points
            });
            questionAnalysis.commonWrongAnswers[label] =
                (questionAnalysis.commonWrongAnswers[label] || 0) + 1;
        });

        // Calculate derived metrics
        if (questionAnalysis.isPoll) {
            // A poll has no success rate. It stays numerically 0 so every
            // `.toFixed()` display site keeps working; readers must branch on
            // `isPoll` (as flagProblematicQuestion and the summaries below do)
            // rather than believe the 0.
            questionAnalysis.successRate = 0;
            questionAnalysis.averagePoints = 0;
            questionAnalysis.unanswered = questionAnalysis.totalResponses === 0;
        } else if (questionAnalysis.totalResponses > 0) {
            questionAnalysis.successRate = (questionAnalysis.correctResponses / questionAnalysis.totalResponses) * 100;
            questionAnalysis.averagePoints = questionAnalysis.totalPoints / questionAnalysis.totalResponses;
        } else {
            questionAnalysis.unanswered = true;
        }

        if (questionAnalysis.timedResponses > 0) {
            questionAnalysis.averageTime = questionAnalysis.totalTime / questionAnalysis.timedResponses;
            if (!questionAnalysis.isPoll) {
                questionAnalysis.timeEfficiency = questionAnalysis.successRate / Math.max(questionAnalysis.averageTime, 1);
            }
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
    // A poll has no right answer, so no accuracy-based flag can apply to it.
    if (analysis.isPoll) {
        analysis.problemFlags = [];
        analysis.isPotentiallyProblematic = false;
        return;
    }

    // A question nobody answered carries no evidence about its quality; a 0%
    // success rate here means "no data", not "knowledge gap".
    if (analysis.totalResponses === 0) {
        analysis.problemFlags = [];
        analysis.isPotentiallyProblematic = false;
        return;
    }

    const flags = [];

    // Low success rate (knowledge gap)
    if (analysis.successRate < 40) {
        flags.push({
            type: 'low_success',
            severity: 'high',
            message: getTranslation('analytics_flag_low_success', [analysis.successRate.toFixed(1)])
        });
        analysis.isPotentiallyProblematic = true;
    } else if (analysis.successRate < 60) {
        flags.push({
            type: 'moderate_success',
            severity: 'medium',
            message: getTranslation('analytics_flag_moderate_success', [analysis.successRate.toFixed(1)])
        });
    }

    // Timing flags need timing data.
    if (analysis.timedResponses > 0) {
        // High time with low success (conceptual difficulty)
        if (analysis.averageTime > 15 && analysis.successRate < 50) {
            flags.push({
                type: 'time_vs_success',
                severity: 'high',
                message: getTranslation('analytics_flag_slow_and_wrong', [analysis.averageTime.toFixed(1)])
            });
            analysis.isPotentiallyProblematic = true;
        }

        // Quick wrong answers (misconceptions)
        if (analysis.averageTime < 8 && analysis.successRate < 70) {
            flags.push({
                type: 'quick_wrong',
                severity: 'medium',
                message: getTranslation('analytics_flag_quick_wrong')
            });
        }
    }

    // Common wrong answer (misleading option)
    const wrongAnswerEntries = Object.entries(analysis.commonWrongAnswers);
    const mostCommonWrong = wrongAnswerEntries.reduce((max, current) =>
        current[1] > (max[1] || 0) ? current : max, [null, 0]
    );

    if (mostCommonWrong[0] !== null && mostCommonWrong[1] >= analysis.totalResponses * 0.4) {
        flags.push({
            type: 'common_wrong_answer',
            severity: 'medium',
            message: getTranslation('analytics_flag_common_wrong', [mostCommonWrong[1], mostCommonWrong[0]])
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

    // Questions nobody answered would otherwise pull every average toward zero.
    // Polls have no success rate at all, so they are excluded for the same reason —
    // and "hardest question" must never resolve to a question with no right answer.
    const answered = questionAnalytics.filter(q => !q.unanswered && !q.isPoll);
    const timed = answered.filter(q => q.timedResponses > 0);

    const avgSuccessRate = answered.length
        ? answered.reduce((sum, q) => sum + q.successRate, 0) / answered.length
        : 0;
    const avgTime = timed.length
        ? timed.reduce((sum, q) => sum + q.averageTime, 0) / timed.length
        : 0;

    const sortedBySuccess = [...answered].sort((a, b) => a.successRate - b.successRate);
    const hardestQuestion = sortedBySuccess[0] || null;
    const easiestQuestion = sortedBySuccess[sortedBySuccess.length - 1] || null;

    const summarize = (q) => q && {
        number: q.questionNumber,
        text: q.text,
        successRate: q.successRate
    };

    return {
        totalQuestions,
        answeredQuestions: answered.length,
        problematicCount,
        avgSuccessRate,
        avgTime,
        hardestQuestion: summarize(hardestQuestion) || null,
        easiestQuestion: summarize(easiestQuestion) || null,
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
 * Infer the correct answer from the graded answer records.
 *
 * A record marked correct is authoritative; otherwise fall back to the answer
 * that earned the highest average points. Both live on `player.answers[i]` —
 * there is no per-player `scores` array in any saved result.
 * @param {Array} results - Player results array
 * @param {number} questionIndex - Index of the question
 * @returns {*} Inferred correct answer
 */
function inferCorrectAnswer(results, questionIndex) {
    const answerStats = new Map();
    let firstCorrectAnswer;

    for (const player of results) {
        const record = normalizeAnswerRecord(player.answers?.[questionIndex]);
        if (!record || record.value === undefined || record.value === null) continue;

        const key = Array.isArray(record.value) ? record.value.join(',') : record.value;
        const stats = answerStats.get(key) || { count: 0, totalPoints: 0, value: record.value };
        stats.count++;
        stats.totalPoints += record.points;
        answerStats.set(key, stats);

        if (record.isCorrect && firstCorrectAnswer === undefined) {
            firstCorrectAnswer = record.value;
        }
    }

    if (firstCorrectAnswer !== undefined) {
        return firstCorrectAnswer;
    }

    // Fallback: the answer that earned the highest average points
    let bestAnswer = null;
    let highestAvgPoints = 0;

    for (const stats of answerStats.values()) {
        const avgPoints = stats.totalPoints / stats.count;
        if (avgPoints > highestAvgPoints) {
            highestAvgPoints = avgPoints;
            bestAnswer = stats.value;
        }
    }

    return bestAnswer ?? getTranslation('unknown');
}

/**
 * Render one hardest/easiest insight card, or a placeholder when no question
 * has any responses to rank.
 * @param {string} titleKey - Translation key for the card title
 * @param {Object|null} extreme - Summary entry {number, text, successRate}
 * @returns {string} HTML string
 */
function renderExtremeInsight(titleKey, extreme) {
    if (!extreme) {
        return `
            <div class="insight-item">
                <h4>${getTranslation(titleKey)}</h4>
                <p class="no-issues">${getTranslation('analytics_unanswered_note')}</p>
            </div>
        `;
    }

    const text = extreme.text || '';
    const truncated = text.length > 80 ? `${text.substring(0, 80)}...` : text;

    return `
        <div class="insight-item">
            <h4>${getTranslation(titleKey)}</h4>
            <p><strong>Q${extreme.number}:</strong> ${escapeHtml(truncated)}</p>
            <p>${getTranslation('analytics_success_rate')}: ${extreme.successRate.toFixed(1)}%</p>
        </div>
    `;
}

/**
 * Create the analytics modal HTML element
 * @param {Object} result - Quiz result data
 * @param {Array} analytics - Question analytics array
 * @param {Object} summary - Summary statistics
 * @param {Object} [conceptData] - Optional concept mastery data
 * @returns {HTMLElement} Analytics modal element
 */
export function createAnalyticsModal(result, analytics, summary, conceptData = null) {
    const existingModal = document.getElementById('analytics-modal');
    if (existingModal) {
        // Destroy any Chart.js instances retained on the old modal before removing it
        existingModal._charts?.forEach(chart => chart?.destroy());
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
                <h2>${getTranslation('analytics_quiz_title')}: ${escapeHtml(result.quizTitle || getTranslation('untitled_quiz'))}</h2>
                <button class="modal-close" data-action="close-analytics">&times;</button>
            </div>

            <div class="analytics-tabs">
                <button class="tab-btn active" data-tab="overview">${getTranslation('analytics_overview_tab')}</button>
                <button class="tab-btn" data-tab="questions">${getTranslation('analytics_questions_tab')}</button>
                <button class="tab-btn" data-tab="insights">${getTranslation('analytics_insights_tab')}</button>
                ${conceptData?.hasConcepts ? `<button class="tab-btn" data-tab="concepts">${getTranslation('analytics_concepts_tab')}</button>` : ''}
            </div>

            <div class="tab-content active" id="overview-tab">
                <div class="summary-stats">
                    <div class="stat-card">
                        <div class="stat-value">${(summary.avgSuccessRate || 0).toFixed(1)}%</div>
                        <div class="stat-label">${getTranslation('analytics_avg_success_rate')}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${(summary.avgTime || 0).toFixed(1)}s</div>
                        <div class="stat-label">${getTranslation('analytics_avg_response_time')}</div>
                    </div>
                    <div class="stat-card ${summary.problematicCount > 0 ? 'warning' : 'success'}">
                        <div class="stat-value">${summary.problematicCount}</div>
                        <div class="stat-label">${getTranslation('analytics_questions_need_review')}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${result.results?.length || 0}</div>
                        <div class="stat-label">${getTranslation('analytics_participants_label')}</div>
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
                <p class="click-hint">${getTranslation('analytics_click_hint')}</p>
                <div class="questions-analytics-list">
                    ${analytics.map((q, idx) => `
                        <div class="question-analytics-item clickable ${q.isPotentiallyProblematic ? 'problematic' : ''} ${q.unanswered ? 'unanswered' : ''}" data-question-index="${idx}">
                            <div class="question-header">
                                <span class="question-number">Q${q.questionNumber}</span>
                                ${q.isPoll
        ? `<span class="success-rate poll">${getTranslation('poll_no_correct_answer')}</span>`
        : q.unanswered
            ? `<span class="success-rate unanswered">${getTranslation('analytics_unanswered')}</span>`
            : `<span class="success-rate ${getSuccessRateClass(q.successRate)}">${q.successRate.toFixed(1)}%</span>`}
                            </div>
                            <div class="qa-question-text">${escapeHtml(q.text)}</div>
                            <div class="question-metrics">
                                ${q.unanswered ? `<span class="metric">${getTranslation('analytics_unanswered_note')}</span>` : `
                                    ${q.timedResponses > 0 ? `<span class="metric">${q.averageTime.toFixed(1)}s ${getTranslation('analytics_avg')}</span>` : ''}
                                    <span class="metric">${q.totalResponses} ${getTranslation('analytics_responses')}</span>
                                    <span class="metric">${q.averagePoints.toFixed(0)} ${getTranslation('analytics_avg_points')}</span>
                                `}
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
                    <h3>${getTranslation('analytics_content_review_title')}</h3>
                    ${problematicQuestions.length > 0 ? `
                        <div class="problematic-questions">
                            ${flagsHtml}
                        </div>
                    ` : `<p class="no-issues">${getTranslation('analytics_no_major_issues')}</p>`}

                    <h3>${getTranslation('analytics_performance_insights_title')}</h3>
                    <div class="insights-grid">
                        ${renderExtremeInsight('analytics_hardest_question', summary.hardestQuestion)}
                        ${renderExtremeInsight('analytics_easiest_question', summary.easiestQuestion)}
                    </div>

                    ${summary.needsReview ? `
                        <div class="review-alert">
                            <strong>${getTranslation('analytics_quiz_needs_review')}:</strong> ${summary.problematicCount} / ${summary.totalQuestions} (${(summary.problematicCount / summary.totalQuestions * 100).toFixed(1)}%) ${getTranslation('analytics_may_need_improvement')}.
                        </div>
                    ` : ''}
                </div>
            </div>

            ${conceptData?.hasConcepts ? buildConceptsTabContent(conceptData, result) : ''}

            <div class="modal-footer">
                <button class="btn secondary" data-action="close-analytics">${getTranslation('close')}</button>
                <button class="btn secondary" data-action="export-excel" data-filename="${safeFilename}">${getTranslation('export_excel_btn')}</button>
                <button class="btn secondary" data-action="export-pdf" data-filename="${safeFilename}">${getTranslation('export_pdf_btn')}</button>
                <button class="btn primary" data-action="export-analytics" data-filename="${safeFilename}">${getTranslation('export_csv_btn')}</button>
            </div>
        </div>
    `;

    return modal;
}

/**
 * Build HTML content for the Concepts tab
 * @param {Object} conceptData - Concept mastery data
 * @param {Object} result - Original quiz result
 * @returns {string} HTML string for concepts tab
 */
function buildConceptsTabContent(conceptData, result) {
    const { concepts } = conceptData;
    const sortedConcepts = Object.values(concepts)
        .sort((a, b) => a.masteryRate - b.masteryRate);

    // Generate dependencies and insights
    const dependencies = inferConceptDependencies(conceptData, result);
    const insights = generateConceptInsights(conceptData, dependencies);

    // Build concept list HTML
    const conceptListHtml = sortedConcepts.map(concept => {
        const levelIcon = getMasteryIcon(concept.masteryRate);

        return `
            <div class="concept-mastery-item ${concept.masteryLevel}">
                <div class="concept-info">
                    <span class="concept-level-icon">${levelIcon}</span>
                    <span class="concept-name">${escapeHtml(concept.name)}</span>
                    <span class="concept-question-count">${concept.questionCount} Q</span>
                </div>
                <div class="concept-bar-container">
                    <div class="concept-bar" style="width: ${concept.masteryRate}%;"></div>
                </div>
                <div class="concept-percentage">${concept.masteryRate.toFixed(0)}%</div>
            </div>
        `;
    }).join('');

    // Build insights HTML
    const insightsHtml = insights.length > 0 ? insights.map(insight => `
        <div class="concept-insight-card ${insight.severity}">
            <div class="insight-title">${escapeHtml(insight.title)}</div>
            <div class="insight-message">${escapeHtml(insight.message)}</div>
            ${insight.concepts ? `
                <div class="insight-concepts">
                    ${insight.concepts.map(c => `<span class="insight-concept-tag">${escapeHtml(c)}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `).join('') : `<p class="no-issues">${getTranslation('analytics_all_concepts_well')}</p>`;

    return `
        <div class="tab-content" id="concepts-tab">
            <div class="concepts-section">
                <div class="concepts-header">
                    <h3>${getTranslation('analytics_concept_mastery')}</h3>
                    <div class="concepts-legend">
                        <span class="legend-item mastered"><span class="legend-color"></span> ${getTranslation('analytics_mastered_label')}</span>
                        <span class="legend-item proficient"><span class="legend-color"></span> ${getTranslation('analytics_proficient_label')}</span>
                        <span class="legend-item developing"><span class="legend-color"></span> ${getTranslation('analytics_developing_label')}</span>
                        <span class="legend-item needs-work"><span class="legend-color"></span> ${getTranslation('analytics_needs_work_label')}</span>
                    </div>
                </div>

                <div class="chart-container concept-chart-container">
                    <canvas id="concept-mastery-chart" width="400" height="200"></canvas>
                </div>

                <div class="concept-mastery-list">
                    ${conceptListHtml}
                </div>

                <div class="concept-insights-section">
                    <div class="insights-header">
                        <h3>${getTranslation('analytics_study_suggestions')}</h3>
                        <label class="toggle-switch">
                            <input type="checkbox" id="show-study-suggestions">
                            <span class="toggle-slider"></span>
                            <span class="toggle-label">${getTranslation('analytics_show_suggestions')}</span>
                        </label>
                    </div>
                    <div class="concept-insights-content" id="concept-insights-content" style="display: none;">
                        ${insightsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Create success rate bar chart using Chart.js
 * @param {Array} analytics - Question analytics array
 */
export function createSuccessRateChart(analytics) {
    const ctx = document.getElementById('success-rate-chart');
    if (!ctx || typeof Chart === 'undefined') {
        return null;
    }

    const theme = getChartTheme();
    // Unanswered questions have no rate to plot; a 0% bar would read as "everyone
    // got it wrong". They stay out of the chart and are listed in the Questions tab.
    const plotted = analytics.filter(q => !q.unanswered);
    const options = baseChartOptions(theme, getTranslation('chart_success_rate_by_question'));

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: plotted.map(q => `Q${q.questionNumber}`),
            datasets: [{
                label: getTranslation('chart_success_rate_pct'),
                data: plotted.map(q => q.successRate),
                // One colour for the series; emphasis only where it means something.
                backgroundColor: plotted.map(q => q.isPotentiallyProblematic ? theme.emphasis : theme.series),
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            ...options,
            plugins: {
                ...options.plugins,
                legend: { display: false }
            },
            scales: {
                x: themedScale(theme),
                y: themedScale(theme, {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                })
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
        return null;
    }

    const theme = getChartTheme();
    const options = baseChartOptions(theme, getTranslation('chart_time_vs_success'));

    // Only questions with timing data can be placed on the x-axis.
    const plotted = analytics.filter(q => !q.unanswered && q.timedResponses > 0);
    const toPoint = q => ({
        x: q.averageTime,
        y: q.successRate,
        questionNumber: q.questionNumber,
        text: q.text
    });

    // Two datasets rather than per-point colours: the legend then names what the
    // emphasis colour means, so the flag is not communicated by colour alone.
    const datasets = [
        {
            label: getTranslation('analytics_questions_tab'),
            data: plotted.filter(q => !q.isPotentiallyProblematic).map(toPoint),
            backgroundColor: theme.series,
            pointRadius: 5,
            borderWidth: 0
        },
        {
            label: getTranslation('analytics_questions_need_review'),
            data: plotted.filter(q => q.isPotentiallyProblematic).map(toPoint),
            backgroundColor: theme.emphasis,
            pointRadius: 5,
            borderWidth: 0
        }
    ];

    return new Chart(ctx, {
        type: 'scatter',
        data: { datasets },
        options: {
            ...options,
            plugins: {
                ...options.plugins,
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const point = context[0].raw;
                            return `Q${point.questionNumber}`;
                        },
                        label: function(context) {
                            const point = context.raw;
                            return [
                                `${getTranslation('analytics_success_rate')}: ${point.y.toFixed(1)}%`,
                                `${getTranslation('analytics_avg_time')}: ${point.x.toFixed(1)}s`,
                                point.text.length > 50 ? `${point.text.substring(0, 50)}...` : point.text
                            ];
                        }
                    }
                }
            },
            scales: {
                x: themedScale(theme, {
                    title: {
                        display: true,
                        text: getTranslation('chart_avg_time_seconds')
                    }
                }),
                y: themedScale(theme, {
                    title: {
                        display: true,
                        text: getTranslation('chart_success_rate_pct')
                    },
                    beginAtZero: true,
                    max: 100
                })
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
    // Scope to the analytics modal: a document-wide `.tab-content` query also
    // deactivates tab panels belonging to any other open modal.
    const button = event.currentTarget || event.target;
    const modal = button.closest('.analytics-modal-overlay') || document;

    modal.querySelectorAll('.analytics-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    modal.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    button.classList.add('active');
    const tabContent = modal.querySelector(`#${tabName}-tab`);
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
    const isPoll = questionAnalysis.isPoll === true;

    // The question carries the option list, so answers render as text rather
    // than as the raw indices actually stored in the result file.
    const correctLabel = question
        ? resolveCorrectAnswerLabel(question)
        : questionAnalysis.correctAnswerLabel || getTranslation('unknown');

    // Build answer distribution data
    const answerCounts = {};
    const timeBuckets = { '0-5s': 0, '5-10s': 0, '10-15s': 0, '15-20s': 0, '20s+': 0 };
    let correctCount = 0;
    let incorrectCount = 0;
    let timedCount = 0;
    let responseTotal = 0;

    playerAnswers.forEach(raw => {
        const pa = normalizeAnswerRecord(raw);
        if (!pa) return;

        // Count answers
        responseTotal++;
        const answerKey = formatAnswerLabel(pa.value, question);
        answerCounts[answerKey] = (answerCounts[answerKey] || 0) + 1;

        // Count correct/incorrect — a poll response is neither
        if (!isPoll && !pa.isPoll) {
            if (pa.isCorrect) {
                correctCount++;
            } else {
                incorrectCount++;
            }
        }

        // Time buckets (legacy records have no timing at all)
        if (pa.timeMs === null) return;
        timedCount++;
        const timeSec = pa.timeMs / 1000;
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
        const percentage = responseTotal > 0 ? ((count / responseTotal) * 100).toFixed(1) : '0.0';
        // A poll bar is neither correct nor incorrect — it gets neutral styling
        const isCorrect = !isPoll && answer === correctLabel;
        const barClass = isPoll ? 'neutral' : (isCorrect ? 'correct' : 'incorrect');

        return `
            <div class="answer-dist-row">
                <div class="answer-text ${isCorrect ? 'correct' : ''}">${escapeHtml(answer.substring(0, 50))}${answer.length > 50 ? '...' : ''}</div>
                <div class="answer-bar-container">
                    <div class="answer-bar ${barClass}" style="width: ${percentage}%;"></div>
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
                <span class="wrong-answer-count">${count} ${getTranslation('analytics_students')}</span>
            </div>
        `).join('')
        : `<p class="no-wrong-answers">${getTranslation('analytics_all_answers_correct')}</p>`;

    modal.innerHTML = `
        <div class="modal-content drilldown-modal-content">
            <div class="modal-header">
                <h2>${getTranslation('analytics_question_num_details', [qNum])}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>

            <div class="drilldown-body">
                <div class="drilldown-question-text">
                    <span class="question-type-badge">${qType}</span>
                    ${escapeHtml(qText)}
                </div>

                <div class="drilldown-correct-answer">
                    <span class="drilldown-correct-label">${getTranslation('analytics_correct_answer')}:</span>
                    <span class="drilldown-correct-value">${escapeHtml(correctLabel)}</span>
                </div>

                <div class="drilldown-stats">
                    ${isPoll ? `
                        <div class="drilldown-stat">
                            <div class="stat-value">${responseTotal}</div>
                            <div class="stat-label">${getTranslation('analytics_responses')}</div>
                        </div>
                    ` : `
                        <div class="drilldown-stat">
                            <div class="stat-value ${questionAnalysis.successRate >= 60 ? 'good' : 'poor'}">${questionAnalysis.successRate.toFixed(1)}%</div>
                            <div class="stat-label">${getTranslation('analytics_success_rate')}</div>
                        </div>
                    `}
                    <div class="drilldown-stat">
                        <div class="stat-value">${questionAnalysis.averageTime.toFixed(1)}s</div>
                        <div class="stat-label">${getTranslation('analytics_avg_time')}</div>
                    </div>
                    ${isPoll ? '' : `
                        <div class="drilldown-stat">
                            <div class="stat-value correct">${correctCount}</div>
                            <div class="stat-label">${getTranslation('analytics_correct')}</div>
                        </div>
                        <div class="drilldown-stat">
                            <div class="stat-value incorrect">${incorrectCount}</div>
                            <div class="stat-label">${getTranslation('analytics_incorrect')}</div>
                        </div>
                    `}
                </div>

                <div class="drilldown-section">
                    <h4>${getTranslation('analytics_answer_distribution')}</h4>
                    <div class="answer-distribution">
                        ${answerDistHtml}
                    </div>
                </div>

                ${timedCount > 0 ? `
                    <div class="drilldown-section">
                        <h4>${getTranslation('analytics_response_time_dist')}</h4>
                        <div class="time-distribution">
                            ${timeDistHtml}
                        </div>
                    </div>
                ` : ''}

                ${isPoll ? '' : `
                    <div class="drilldown-section">
                        <h4>${getTranslation('analytics_common_wrong')}</h4>
                        <div class="wrong-answers-list">
                            ${wrongAnswersHtml}
                        </div>
                    </div>
                `}

                ${questionAnalysis.problemFlags && questionAnalysis.problemFlags.length > 0 ? `
                    <div class="drilldown-section">
                        <h4>${getTranslation('analytics_issues_detected')}</h4>
                        <div class="problem-flags">
                            ${questionAnalysis.problemFlags.map(flag =>
        `<span class="flag ${flag.severity}">${escapeHtml(flag.message)}</span>`
    ).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>

            <div class="modal-footer">
                <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">${getTranslation('close')}</button>
            </div>
        </div>
    `;

    return modal;
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
    const theme = getChartTheme();
    const colors = theme.categorical;

    // Overall average dataset (always shown)
    const avgData = sessionsData.map(s => {
        const analytics = s.questionAnalytics || [];
        if (analytics.length === 0) return 0;
        return analytics.reduce((sum, q) => sum + q.successRate, 0) / analytics.length;
    });

    // The average is the headline, so it reads as ink rather than as another
    // categorical series (and stays visible when the theme flips).
    datasets.push({
        label: getTranslation('chart_overall_average'),
        data: avgData,
        borderColor: theme.text,
        backgroundColor: theme.text,
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
            borderColor: colors[i],
            backgroundColor: colors[i],
            borderWidth: 2,
            tension: 0.3,
            fill: false
        });
    }

    const options = baseChartOptions(theme, getTranslation('chart_success_rate_comparison'));

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            ...options,
            plugins: {
                ...options.plugins,
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: themedScale(theme, {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: getTranslation('chart_success_rate_pct')
                    },
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }),
                x: themedScale(theme, {
                    title: {
                        display: true,
                        text: getTranslation('chart_session_date')
                    }
                })
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

// ============================================================================
// Concept Mastery Analytics
// ============================================================================

/**
 * Calculate per-concept mastery levels from quiz results
 * @param {Object} result - Quiz result data with questions and player answers
 * @returns {Object} Concept mastery data with per-concept stats
 */
export function calculateConceptMastery(result) {
    if (!result.questions || !result.results) {
        return { concepts: {}, hasConcepts: false };
    }

    const conceptStats = {};

    // Analyze each question's performance by concept
    result.questions.forEach((question, qIndex) => {
        const concepts = question.concepts || [];
        if (concepts.length === 0) return;
        // Poll questions carry no verdict; mastery cannot be measured from them
        if (question.isPoll === true) return;

        // Get performance data for this question
        let correct = 0;
        let total = 0;
        let totalTime = 0;

        result.results.forEach(player => {
            const answer = player.answers && player.answers[qIndex];
            if (answer) {
                total++;
                if (answer.isCorrect) correct++;
                totalTime += (answer.timeMs || 0) / 1000;
            }
        });

        // Attribute to each concept
        concepts.forEach(concept => {
            if (!conceptStats[concept]) {
                conceptStats[concept] = {
                    name: concept,
                    questionCount: 0,
                    totalResponses: 0,
                    correctResponses: 0,
                    totalTime: 0,
                    questionIndices: []
                };
            }

            conceptStats[concept].questionCount++;
            conceptStats[concept].totalResponses += total;
            conceptStats[concept].correctResponses += correct;
            conceptStats[concept].totalTime += totalTime;
            conceptStats[concept].questionIndices.push(qIndex);
        });
    });

    // Calculate derived metrics for each concept
    Object.values(conceptStats).forEach(concept => {
        concept.masteryRate = concept.totalResponses > 0
            ? (concept.correctResponses / concept.totalResponses) * 100
            : 0;
        concept.averageTime = concept.totalResponses > 0
            ? concept.totalTime / concept.totalResponses
            : 0;
        concept.masteryLevel = getMasteryLevel(concept.masteryRate);
    });

    return {
        concepts: conceptStats,
        hasConcepts: Object.keys(conceptStats).length > 0
    };
}

/**
 * Get mastery level category from percentage
 * @param {number} rate - Mastery percentage
 * @returns {string} Mastery level category
 */
function getMasteryLevel(rate) {
    if (rate >= 80) return 'mastered';
    if (rate >= 60) return 'proficient';
    if (rate >= 40) return 'developing';
    return 'needs-work';
}

/**
 * Get icon for mastery level display
 * @param {number} rate - Mastery percentage
 * @returns {string} Icon character
 */
function getMasteryIcon(rate) {
    if (rate >= 80) return '✓';
    if (rate >= 60) return '○';
    if (rate >= 40) return '△';
    return '!';
}

/**
 * Infer concept dependencies based on co-occurrence patterns
 * Uses correlation between concept performance to suggest dependencies
 * @param {Object} conceptMastery - Concept mastery data
 * @param {Object} result - Original quiz result
 * @returns {Array} Array of dependency insights
 */
export function inferConceptDependencies(conceptMastery, result) {
    const { concepts } = conceptMastery;
    const conceptNames = Object.keys(concepts);
    const dependencies = [];

    if (conceptNames.length < 2) return dependencies;

    // Build per-player performance matrix for each concept
    const playerConceptPerformance = {};

    result.results.forEach((player, playerIdx) => {
        playerConceptPerformance[playerIdx] = {};

        conceptNames.forEach(concept => {
            const conceptData = concepts[concept];
            let correct = 0;
            let total = 0;

            conceptData.questionIndices.forEach(qIdx => {
                const answer = player.answers && player.answers[qIdx];
                if (answer) {
                    total++;
                    if (answer.isCorrect) correct++;
                }
            });

            playerConceptPerformance[playerIdx][concept] = total > 0 ? correct / total : null;
        });
    });

    // Find correlations between concept pairs
    for (let i = 0; i < conceptNames.length; i++) {
        for (let j = i + 1; j < conceptNames.length; j++) {
            const conceptA = conceptNames[i];
            const conceptB = conceptNames[j];
            const statsA = concepts[conceptA];
            const statsB = concepts[conceptB];

            // Skip if both are well-mastered or both are weak
            if ((statsA.masteryRate >= 70 && statsB.masteryRate >= 70) ||
                (statsA.masteryRate < 40 && statsB.masteryRate < 40)) {
                continue;
            }

            // Check correlation: when one is weak, is the other also weak?
            let bothWeak = 0;
            let validPairs = 0;

            Object.values(playerConceptPerformance).forEach(playerPerf => {
                const perfA = playerPerf[conceptA];
                const perfB = playerPerf[conceptB];

                if (perfA !== null && perfB !== null) {
                    validPairs++;
                    if (perfA < 0.5 && perfB < 0.5) bothWeak++;
                }
            });

            // If significant correlation found
            if (validPairs >= 3 && bothWeak / validPairs > 0.4) {
                // Determine which is likely foundational (lower mastery often = foundational gap)
                const weaker = statsA.masteryRate < statsB.masteryRate ? conceptA : conceptB;
                const stronger = weaker === conceptA ? conceptB : conceptA;

                dependencies.push({
                    type: 'correlation',
                    foundational: weaker,
                    dependent: stronger,
                    confidence: (bothWeak / validPairs * 100).toFixed(0),
                    message: getTranslation('analytics_dependency_suggestion', [weaker, stronger]),
                    severity: statsA.masteryRate < 50 || statsB.masteryRate < 50 ? 'high' : 'medium'
                });
            }
        }
    }

    return dependencies;
}

/**
 * Generate study insights based on concept mastery data
 * @param {Object} conceptMastery - Concept mastery data
 * @param {Array} dependencies - Inferred dependencies
 * @returns {Array} Array of insight objects
 */
export function generateConceptInsights(conceptMastery, dependencies) {
    const { concepts } = conceptMastery;
    const insights = [];

    // Sort concepts by mastery rate
    const sortedConcepts = Object.values(concepts)
        .sort((a, b) => a.masteryRate - b.masteryRate);

    // Identify concepts needing work
    const needsWork = sortedConcepts.filter(c => c.masteryRate < 60);
    if (needsWork.length > 0) {
        insights.push({
            type: 'focus-areas',
            title: getTranslation('analytics_focus_areas'),
            message: getTranslation('analytics_concepts_need_work', [needsWork.length]),
            concepts: needsWork.map(c => c.name),
            severity: needsWork.some(c => c.masteryRate < 40) ? 'high' : 'medium'
        });
    }

    // Identify strengths
    const strengths = sortedConcepts.filter(c => c.masteryRate >= 80);
    if (strengths.length > 0) {
        insights.push({
            type: 'strengths',
            title: getTranslation('analytics_strong_areas'),
            message: getTranslation('analytics_concepts_mastered', [strengths.length]),
            concepts: strengths.map(c => c.name),
            severity: 'success'
        });
    }

    // Add dependency insights
    dependencies.forEach(dep => {
        insights.push({
            type: 'dependency',
            title: getTranslation('analytics_study_suggestion'),
            message: dep.message,
            severity: dep.severity
        });
    });

    return insights;
}

/**
 * Create horizontal bar chart for concept mastery visualization
 * @param {string} canvasId - Canvas element ID
 * @param {Object} conceptMastery - Concept mastery data
 */
export function createConceptMasteryChart(canvasId, conceptMastery) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') {
        return null;
    }

    const { concepts } = conceptMastery;
    if (!concepts || Object.keys(concepts).length === 0) {
        return null;
    }

    // Sort by mastery rate descending
    const sortedConcepts = Object.values(concepts)
        .sort((a, b) => b.masteryRate - a.masteryRate);

    const theme = getChartTheme();
    const options = baseChartOptions(theme, getTranslation('chart_concept_mastery_levels'));

    const labels = sortedConcepts.map(c => c.name.length > 25 ? c.name.substring(0, 22) + '...' : c.name);
    const data = sortedConcepts.map(c => c.masteryRate);

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: getTranslation('analytics_concept_mastery'),
                // Bar length already encodes mastery; a colour ramp on top of it
                // adds no information. The mastery *bands* stay in the list below,
                // where each row carries a level icon and a legend entry.
                data: data,
                backgroundColor: theme.series,
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            ...options,
            indexAxis: 'y',
            plugins: {
                ...options.plugins,
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const concept = sortedConcepts[context.dataIndex];
                            return [
                                `${getTranslation('analytics_questions_tab')}: ${concept.questionCount}`,
                                `${getTranslation('analytics_responses')}: ${concept.totalResponses}`,
                                `${getTranslation('analytics_avg_time')}: ${concept.averageTime.toFixed(1)}s`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: themedScale(theme),
                x: themedScale(theme, {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                })
            }
        }
    });
}

