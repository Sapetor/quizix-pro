/**
 * Results Comparison - Modal HTML/DOM builders for cross-session comparison
 *
 * Pure DOM builders extracted from the ResultsViewer coordinator. Each function
 * returns a fully populated modal element; event wiring and orchestration
 * (data fetching, chart creation) stay in the ResultsViewer facade, mirroring
 * the analytics modal pattern.
 */

import { COLORS } from '../../core/config.js';
import { escapeHtml } from '../dom.js';
import { getTranslation } from '../translation-manager.js';

/**
 * Build the "select a quiz to compare" modal.
 * @param {Array} quizzesWithSessions - Quizzes that have multiple sessions
 * @returns {HTMLElement} Modal overlay element (not yet attached to the DOM)
 */
export function createComparisonSelectorModal(quizzesWithSessions) {
    const modal = document.createElement('div');
    modal.id = 'comparison-selector-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '1050';

    const quizListHtml = quizzesWithSessions.map(quiz => `
        <div class="comparison-quiz-item" data-quiz-title="${escapeHtml(quiz.title)}">
            <div class="quiz-info">
                <div class="quiz-title">${escapeHtml(quiz.title)}</div>
                <div class="quiz-meta">${quiz.sessionCount} ${getTranslation('compare_sessions_count')} | ${quiz.totalParticipants} ${getTranslation('compare_total_participants')}</div>
            </div>
            <button class="btn primary compare-btn">${getTranslation('compare_btn')}</button>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>${getTranslation('compare_quiz_sessions')}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px; max-height: 400px; overflow-y: auto;">
                <p style="margin-bottom: 16px; color: #6b7280;">
                    ${getTranslation('compare_select_quiz_desc')}
                </p>
                <div class="comparison-quiz-list">
                    ${quizListHtml}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">${getTranslation('close')}</button>
            </div>
        </div>
    `;

    return modal;
}

/**
 * Build the "select sessions" checkbox modal for a specific quiz.
 * @param {string} quizTitle - Title of the quiz
 * @param {Object} quiz - Quiz record with a `sessions` array
 * @returns {HTMLElement} Modal overlay element (not yet attached to the DOM)
 */
export function createSessionSelectorModal(quizTitle, quiz) {
    const modal = document.createElement('div');
    modal.id = 'session-selector-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '1050';

    const sessionListHtml = quiz.sessions.map((session, idx) => {
        const date = new Date(session.saved).toLocaleDateString();
        const participants = session.participantCount ?? session.results?.length ?? 0;
        return `
            <label class="session-checkbox-item">
                <input type="checkbox" value="${session.filename}" ${idx < 3 ? 'checked' : ''}>
                <span class="session-info">
                    <span class="session-date">${date}</span>
                    <span class="session-meta">${getTranslation('analytics_pin_label')}: ${session.gamePin} | ${participants} ${getTranslation('analytics_participants_label').toLowerCase()}</span>
                </span>
            </label>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>${getTranslation('compare_select_sessions')}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <p style="margin-bottom: 8px;"><strong>${quizTitle}</strong></p>
                <p style="margin-bottom: 16px; color: #6b7280; font-size: 0.9rem;">
                    ${getTranslation('compare_select_sessions_desc')}
                </p>
                <div class="session-checkbox-list" style="max-height: 300px; overflow-y: auto;">
                    ${sessionListHtml}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">${getTranslation('compare_cancel')}</button>
                <button class="btn primary" id="run-comparison-btn">${getTranslation('compare_selected')}</button>
            </div>
        </div>
    `;

    return modal;
}

/**
 * Build the comparison results modal (summary cards, chart canvas, insights).
 * @param {string} quizTitle - Title of the quiz
 * @param {Object} comparisonData - Calculated comparison metrics
 * @returns {HTMLElement} Modal overlay element (not yet attached to the DOM)
 */
export function createComparisonResultsModal(quizTitle, comparisonData) {
    const modal = document.createElement('div');
    modal.id = 'comparison-results-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '1050';

    const trendIcon = comparisonData.trendDirection === 'improving' ? '📈' :
        comparisonData.trendDirection === 'declining' ? '📉' : '➡️';
    const trendColor = comparisonData.trendDirection === 'improving' ? COLORS.SUCCESS :
        comparisonData.trendDirection === 'declining' ? COLORS.ERROR : '#6b7280';

    let insightsHtml = '';
    if (comparisonData.mostImproved) {
        insightsHtml += `<p style="color: ${COLORS.SUCCESS};"><strong>${getTranslation('compare_most_improved')}:</strong> Q${comparisonData.mostImproved.questionNumber} (+${comparisonData.mostImproved.trend.toFixed(1)}%)</p>`;
    }
    if (comparisonData.mostDeclined) {
        insightsHtml += `<p style="color: ${COLORS.ERROR};"><strong>${getTranslation('compare_needs_attention')}:</strong> Q${comparisonData.mostDeclined.questionNumber} (${comparisonData.mostDeclined.trend.toFixed(1)}%)</p>`;
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h2>${getTranslation('compare_quiz_sessions')}: ${escapeHtml(quizTitle)}</h2>
                <button class="modal-close" data-action="close-comparison">&times;</button>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <div class="comparison-summary" style="display: flex; gap: 20px; margin-bottom: 20px;">
                    <div class="stat-card" style="flex: 1; background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 2rem;">${comparisonData.sessionCount}</div>
                        <div style="color: #6b7280;">${getTranslation('compare_sessions_title')}</div>
                    </div>
                    <div class="stat-card" style="flex: 1; background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 2rem;">${comparisonData.averageParticipants}</div>
                        <div style="color: #6b7280;">${getTranslation('compare_avg_participants')}</div>
                    </div>
                    <div class="stat-card" style="flex: 1; background: ${trendColor}15; padding: 16px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 2rem;">${trendIcon}</div>
                        <div style="color: ${trendColor};">${getTranslation('compare_' + comparisonData.trendDirection)} (${comparisonData.overallTrend > 0 ? '+' : ''}${comparisonData.overallTrend.toFixed(1)}%)</div>
                    </div>
                </div>

                <div class="chart-container" style="height: 300px; margin-bottom: 20px;">
                    <canvas id="comparison-chart"></canvas>
                </div>

                <div class="comparison-insights" style="background: #f9fafb; padding: 16px; border-radius: 8px;">
                    <h4 style="margin: 0 0 12px 0;">${getTranslation('compare_key_insights')}</h4>
                    ${insightsHtml || `<p style="color: #6b7280;">${getTranslation('compare_stable_performance')}</p>`}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn secondary" data-action="close-comparison">${getTranslation('close')}</button>
                <button class="btn primary" id="export-comparison-pdf">${getTranslation('export_pdf_btn')}</button>
            </div>
        </div>
    `;

    return modal;
}

export default {
    createComparisonSelectorModal,
    createSessionSelectorModal,
    createComparisonResultsModal
};
