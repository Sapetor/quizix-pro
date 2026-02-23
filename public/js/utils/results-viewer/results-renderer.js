/**
 * Results Renderer - HTML generation and template rendering for results viewer
 * Handles all DOM content generation for the results viewer modal
 */

import { escapeHtml } from '../dom.js';
import { translationManager, getTranslation } from '../translation-manager.js';

/**
 * SVG icons used in empty states and UI elements
 */
const SVG_ICONS = {
    error: `
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M60 20L15 100h90L60 20z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2.5" opacity="0.5"/>
            <line x1="60" y1="45" x2="60" y2="70" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
            <circle cx="60" cy="82" r="3" fill="currentColor" opacity="0.7"/>
            <circle cx="25" cy="95" r="2" fill="currentColor" opacity="0.3"/>
            <circle cx="95" cy="95" r="2" fill="currentColor" opacity="0.3"/>
        </svg>`,

    noResults: `
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="15" y="70" width="18" height="35" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" opacity="0.3"/>
            <rect x="40" y="50" width="18" height="55" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" opacity="0.3"/>
            <rect x="65" y="60" width="18" height="45" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" opacity="0.3"/>
            <rect x="90" y="40" width="18" height="65" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" opacity="0.3"/>
            <circle cx="55" cy="35" r="18" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.6"/>
            <line x1="68" y1="48" x2="82" y2="62" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
            <text x="55" y="42" text-anchor="middle" font-size="18" font-weight="bold" fill="currentColor" opacity="0.5">?</text>
            <line x1="10" y1="105" x2="110" y2="105" stroke="currentColor" stroke-width="2" opacity="0.3"/>
        </svg>`,

    noParticipants: `
        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="35" cy="40" r="12" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.4"/>
            <path d="M20 80c0-12 7-20 15-20s15 8 15 20" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.4"/>
            <circle cx="60" cy="35" r="14" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.5"/>
            <path d="M42 85c0-14 8-23 18-23s18 9 18 23" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.5"/>
            <circle cx="85" cy="40" r="12" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.4"/>
            <path d="M70 80c0-12 7-20 15-20s15 8 15 20" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.4"/>
            <text x="35" y="22" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.4">?</text>
            <text x="60" y="16" text-anchor="middle" font-size="14" fill="currentColor" opacity="0.5">?</text>
            <text x="85" y="22" text-anchor="middle" font-size="12" fill="currentColor" opacity="0.4">?</text>
            <line x1="15" y1="95" x2="105" y2="95" stroke="currentColor" stroke-width="2" opacity="0.2"/>
        </svg>`
};

/**
 * Render an empty state message with icon
 * @param {string} iconKey - Key for SVG_ICONS
 * @param {string} title - Title text
 * @param {string} message - Description message
 * @returns {string} HTML string
 */
export function renderEmptyState(iconKey, title, message) {
    const icon = SVG_ICONS[iconKey] || SVG_ICONS.noResults;
    return `
        <div class="empty-results empty-state">
            <div class="empty-state-illustration">${icon}</div>
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

/**
 * Render a single result item for the list
 * @param {Object} result - Result data object
 * @param {string} formattedDate - Pre-formatted date string
 * @param {number} avgScore - Calculated average score percentage
 * @returns {string} HTML string
 */
export function renderResultItem(result, formattedDate, avgScore) {
    const participantCount = result.results?.length || 0;
    const safeFilename = escapeHtml(result.filename);

    return `
        <div class="result-item" data-filename="${safeFilename}">
            <div class="swipe-delete-action">
                <div class="swipe-delete-icon">
                    <span>${getTranslation('delete')}</span>
                </div>
            </div>
            <div class="result-info">
                <div class="result-title">${escapeHtml(result.quizTitle || getTranslation('untitled_quiz'))}</div>
                <div class="result-meta">
                    <span>${formattedDate}</span>
                    <span>${getTranslation('analytics_pin_label')}: ${escapeHtml(result.gamePin)}</span>
                    <span>${participantCount} ${getTranslation('analytics_participants_label').toLowerCase()}</span>
                    <span>${avgScore}% ${getTranslation('analytics_avg').toLowerCase()}</span>
                </div>
            </div>
            <div class="result-actions">
                <button class="result-action-btn analytics" data-action="analytics" data-filename="${safeFilename}" title="${getTranslation('analytics_overview_tab')}">
                    ${getTranslation('analytics_overview_tab')}
                </button>
                <div class="download-options">
                    <button class="result-action-btn download" data-action="download" data-filename="${safeFilename}">
                        ${getTranslation('download_btn')}
                    </button>
                </div>
                <button class="result-action-btn delete" data-action="delete" data-filename="${safeFilename}">
                    ${getTranslation('delete')}
                </button>
            </div>
            <span class="swipe-hint">${getTranslation('results_swipe')}</span>
        </div>
    `;
}

/**
 * Render the results list HTML
 * @param {Array} results - Array of result objects
 * @param {Function} calculateAvgScore - Function to calculate average score
 * @param {Function} formatDate - Function to format dates
 * @returns {string} HTML string
 */
export function renderResultsList(results, calculateAvgScore, formatDate) {
    if (!results || results.length === 0) {
        return renderEmptyState('noResults', getTranslation('results_no_results_title'), getTranslation('results_no_results_message'));
    }

    return results.map(result => {
        const avgScore = calculateAvgScore(result);
        const formattedDate = formatDate(result.saved);
        return renderResultItem(result, formattedDate, avgScore);
    }).join('');
}

/**
 * Render participant row for detail view
 * @param {Object} player - Player data
 * @param {Function} getScoreClass - Function to get CSS class for score
 * @param {Function} formatTime - Function to format time
 * @returns {string} HTML string
 */
export function renderParticipantRow(player, getScoreClass, formatTime) {
    const playerScore = player.score || 0;
    const totalQuestions = player.answers?.length || 0;
    const correctAnswers = player.answers?.filter(a => a?.isCorrect).length || 0;
    const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    const scoreClass = getScoreClass(percentage);
    const timeDisplay = player.completedAt ? formatTime(player.completedAt) : 'N/A';

    return `
        <div class="participant-row">
            <div class="participant-name">${escapeHtml(player.name || getTranslation('anonymous_player'))}</div>
            <div class="participant-score ${scoreClass}">${playerScore} ${getTranslation('pts')}</div>
            <div class="participant-percentage ${scoreClass}">${percentage}%</div>
            <div class="participant-time">${timeDisplay}</div>
        </div>
    `;
}

/**
 * Render participants list for detail modal
 * @param {Array} results - Array of player results
 * @param {Function} getScoreClass - Function to get CSS class for score
 * @param {Function} formatTime - Function to format time
 * @returns {string} HTML string
 */
export function renderParticipantsList(results, getScoreClass, formatTime) {
    if (!results || results.length === 0) {
        return renderEmptyState('noParticipants', getTranslation('results_no_participants_title'), getTranslation('results_no_participants_message'));
    }

    const sortedResults = [...results].sort((a, b) => (b.score || 0) - (a.score || 0));

    return `
        <div class="participant-header">${getTranslation('results_participant_results_header')}</div>
        ${sortedResults.map(player => renderParticipantRow(player, getScoreClass, formatTime)).join('')}
    `;
}

/**
 * Render format selection modal for downloads
 * @param {string} filename - Result filename
 * @param {Array} formats - Available export formats
 * @param {string} currentFormat - Currently selected format
 * @returns {HTMLElement} Modal element
 */
export function createFormatSelectionModal(filename, formats, currentFormat) {
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
        <h3>${getTranslation('results_select_export_format')}</h3>
        <p>${getTranslation('results_choose_download_format')}</p>
        <div class="format-options" style="margin: 15px 0;">
            ${formats.map(format => `
                <label style="display: block; margin: 8px 0; cursor: pointer;">
                    <input type="radio" name="export-format" value="${format.key}"
                           ${format.key === currentFormat ? 'checked' : ''}>
                    <strong>${format.name}</strong><br>
                    <small style="color: #666; margin-left: 20px;">${format.description}</small>
                </label>
            `).join('')}
        </div>
        <div style="text-align: right; margin-top: 20px;">
            <button id="format-cancel-btn" style="margin-right: 10px; padding: 8px 16px;">${getTranslation('cancel')}</button>
            <button id="format-download-btn" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px;">${getTranslation('download_btn')}</button>
        </div>
    `;

    modal.appendChild(content);
    return modal;
}

/**
 * Render analytics unavailable modal
 * @param {Object} result - Result data
 * @returns {HTMLElement} Modal element
 */
export function createAnalyticsUnavailableModal(result) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.zIndex = '1050';

    const safeFilename = escapeHtml(result.filename);
    const untitledQuiz = translationManager.getTranslationSync('untitled_quiz') || 'Untitled Quiz';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>${getTranslation('analytics_not_available')}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>

            <div class="modal-body" style="padding: 20px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 4rem; margin-bottom: 16px;">📈</div>
                    <h3>${getTranslation('analytics_not_available_title')}</h3>
                    <p>${getTranslation('analytics_not_available_desc')}</p>
                </div>

                <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <h4 style="margin: 0 0 12px 0; color: #374151;">${getTranslation('analytics_still_see')}:</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #6b7280;">
                        <li>${getTranslation('analytics_player_scores')}</li>
                        <li>${getTranslation('analytics_completion_data')}</li>
                        <li>${getTranslation('analytics_participation_stats')}</li>
                        <li>${getTranslation('analytics_performance_summary')}</li>
                    </ul>
                </div>

                <div style="background: #dbeafe; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <h4 style="margin: 0 0 12px 0; color: #1e40af;">${getTranslation('analytics_why_not_available')}?</h4>
                    <p style="margin: 0 0 12px 0; color: #1e40af;">
                        ${getTranslation('analytics_why_not_available_desc')}
                    </p>
                    <p style="margin: 0; color: #1e40af;">
                        <strong>${getTranslation('analytics_future_games')}:</strong><br>
                        ${getTranslation('analytics_future_games_desc')}
                    </p>
                </div>

                <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #6b7280; font-size: 0.9rem;">
                        <strong>${getTranslation('analytics_quiz_label')}:</strong> ${escapeHtml(result.quizTitle || untitledQuiz)}<br>
                        <strong>${getTranslation('analytics_pin_label')}:</strong> ${escapeHtml(result.gamePin)}<br>
                        <strong>${getTranslation('analytics_participants_label')}:</strong> ${result.results?.length || 0}
                    </p>
                </div>
            </div>

            <div class="modal-footer">
                <button class="btn secondary" onclick="this.closest('.modal-overlay').remove()">${getTranslation('close')}</button>
                <button class="btn primary" data-filename="${safeFilename}" data-action="view-basic">${getTranslation('analytics_view_basic')}</button>
            </div>
        </div>
    `;

    return modal;
}

export default {
    renderEmptyState,
    renderResultItem,
    renderResultsList,
    renderParticipantRow,
    renderParticipantsList,
    createFormatSelectionModal,
    createAnalyticsUnavailableModal
};
