/**
 * Statistics Manager Module
 * Handles host-side answer statistics: live response counts, per-option/true-false
 * distributions, numeric and ordering breakdowns, and the editorial stat-bar overlay.
 * Extracted from game-manager.js for better separation of concerns.
 */

import { logger, UI, ANIMATION } from '../../core/config.js';
import { translationManager, getTranslation, getTrueFalseText } from '../../utils/translation-manager.js';
import { dom, escapeHtml, show, hide } from '../../utils/dom.js';

export class StatisticsManager {
    /**
     * @param {object} stateManager - shared game state manager (provides getGameState()).
     */
    constructor(stateManager) {
        this.stateManager = stateManager;
    }

    /**
     * Update live answer count for host display (counting-only mode)
     */
    updateLiveAnswerCount(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost || !data) return;

        logger.debug('Live answer count update:', data);

        // Use connectedPlayers (active) as the denominator, fall back to totalPlayers
        const connected = data.connectedPlayers ?? data.totalPlayers ?? 0;
        const total = data.totalPlayers ?? connected;
        const disconnected = total - connected;

        // Update response counts
        dom.setContent('responses-count', data.answeredPlayers || 0);
        dom.setContent('total-players', connected);
        dom.setContent('host-header-total', connected);

        // Show/hide disconnected indicator
        const indicator = dom.get('disconnected-indicator');
        if (indicator) {
            if (disconnected > 0) {
                indicator.textContent = translationManager.getTranslationSync('disconnected_count', [disconnected]) || `(${disconnected} disconnected)`;
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }

        // Show the statistics container in counting-only mode (hides stats grid, shows only response count)
        const container = dom.get('answer-statistics');
        if (container) {
            show(container);
            container.classList.add('counting-only');
        }
    }

    /**
     * Update answer statistics for host display
     */
    updateAnswerStatistics(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost || !data) return;

        // Get existing statistics container
        const statisticsContainer = dom.get('answer-statistics');
        if (!statisticsContainer) {
            logger.warn('Answer statistics container not found in HTML');
            return;
        }

        // Show full statistics (remove counting-only to reveal stats grid)
        show(statisticsContainer);
        statisticsContainer.classList.remove('counting-only');

        // Update response counts
        dom.setContent('responses-count', data.answeredPlayers || 0);
        dom.setContent('total-players', data.totalPlayers || 0);
        dom.setContent('host-header-total', data.totalPlayers || 0);

        // Update individual answer statistics
        const questionType = data.questionType || data.type;

        if (questionType === 'multiple-choice' || questionType === 'multiple-correct') {
            const optionCount = data.optionCount || Object.keys(data.answerCounts).length || 4;
            this.showMultipleChoiceStatistics(optionCount);
            for (let i = 0; i < optionCount; i++) {
                const count = data.answerCounts[i] || 0;
                this.updateStatItem(i, count, data.answeredPlayers || 0);
            }
        } else if (questionType === 'true-false') {
            this.showTrueFalseStatistics();
            const trueCount = data.answerCounts['true'] || data.answerCounts[0] || 0;
            const falseCount = data.answerCounts['false'] || data.answerCounts[1] || 0;
            this.updateStatItem(0, trueCount, data.answeredPlayers || 0);
            this.updateStatItem(1, falseCount, data.answeredPlayers || 0);
        } else if (questionType === 'numeric') {
            this.showNumericStatistics(data.answerCounts);
        } else if (questionType === 'ordering') {
            this.showOrderingStatistics(data.answerCounts);
        }

        // Render score breakdown for host (if enabled)
        if (data.scoringInfo) {
            this.renderHostBreakdown(data.scoringInfo);
        }
    }

    /**
     * Render score breakdown for host display
     * Shows the scoring formula used for the current question
     * @param {Object} scoringInfo - Scoring information object
     */
    renderHostBreakdown(scoringInfo) {
        const showBreakdown = dom.get('show-score-breakdown')?.checked ?? true;
        const container = dom.get('host-score-breakdown');
        const contentSpan = dom.get('breakdown-content');

        if (!showBreakdown || !scoringInfo || !container || !contentSpan) {
            if (container) hide(container);
            return;
        }

        const parts = [];

        // Base points with difficulty
        const difficultyLabel = getTranslation(scoringInfo.difficulty) || scoringInfo.difficulty;
        parts.push(`${getTranslation('base') || 'Base'}: ${scoringInfo.basePoints}pts (${difficultyLabel})`);

        // Time bonus status with optional threshold
        if (scoringInfo.timeBonusEnabled) {
            let timeBonusText = `${getTranslation('time_bonus') || 'Time bonus'}: ${getTranslation('enabled') || 'ON'}`;
            // Show threshold if set (convert from ms to seconds for display)
            if (scoringInfo.timeBonusThreshold > 0) {
                const thresholdSec = scoringInfo.timeBonusThreshold / 1000;
                timeBonusText += ` (${getTranslation('max_within') || 'max within'} ${thresholdSec}s)`;
            }
            parts.push(timeBonusText);
        } else {
            parts.push(`${getTranslation('time_bonus') || 'Time bonus'}: ${getTranslation('disabled') || 'OFF'}`);
        }

        contentSpan.textContent = parts.join(' | ');
        show(container, 'visible-flex');
    }


    /**
     * Show statistics for multiple choice questions
     */
    showMultipleChoiceStatistics(optionCount) {
        this.showHostStatistics('multiple-choice', { optionCount });
    }

    /**
     * Show statistics for true/false questions
     */
    showTrueFalseStatistics() {
        this.showHostStatistics('true-false');
    }

    /**
     * Show statistics for numeric questions
     */
    showNumericStatistics(answerCounts) {
        this.showHostStatistics('numeric', { answerCounts });
    }

    /**
     * Show statistics for ordering questions
     */
    showOrderingStatistics(answerCounts) {
        this.showHostStatistics('ordering', { answerCounts });
    }

    /**
     * Create custom statistics display for numeric answers
     */
    createNumericStatisticsDisplay(answerCounts, sortedAnswers) {
        const statsContent = dom.get('stats-grid');
        if (!statsContent) return;

        // Create or update numeric stats display
        let numericStatsDiv = dom.get('numeric-stats-display');
        if (!numericStatsDiv) {
            numericStatsDiv = document.createElement('div');
            numericStatsDiv.id = 'numeric-stats-display';
            numericStatsDiv.className = 'numeric-stats-display';
            statsContent.appendChild(numericStatsDiv);
        }

        // Clear previous content
        numericStatsDiv.innerHTML = '';

        if (sortedAnswers.length === 0) {
            numericStatsDiv.innerHTML = `<div class="no-answers">${escapeHtml(getTranslation('no_answers_yet'))}</div>`;
            return;
        }

        // Show up to max common answers
        const maxDisplay = UI.MAX_NUMERIC_DISPLAY;
        const totalAnswers = Object.values(answerCounts).reduce((sum, count) => sum + count, 0);

        // Sort by count (descending) then by value (ascending)
        const sortedByCount = sortedAnswers.sort((a, b) => {
            const countDiff = answerCounts[b] - answerCounts[a];
            return countDiff !== 0 ? countDiff : parseFloat(a) - parseFloat(b);
        });

        const displayAnswers = sortedByCount.slice(0, maxDisplay);

        numericStatsDiv.innerHTML = `
            <div class="numeric-stats-header">
                <h4>${getTranslation('player_answers')}</h4>
            </div>
            <div class="numeric-answers-list">
                ${displayAnswers.map(answer => {
        const count = answerCounts[answer];
        const percentage = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
        return `
                        <div class="numeric-answer-item">
                            <span class="answer-value ed-mono">${escapeHtml(String(answer))}</span>
                            <div class="answer-bar-container">
                                <div class="answer-bar" style="width: ${percentage}%"></div>
                                <span class="answer-count ed-mono">${count}</span>
                            </div>
                        </div>
                    `;
    }).join('')}
                ${sortedAnswers.length > maxDisplay ? `
                    <div class="more-answers">
                        +${sortedAnswers.length - maxDisplay} ${getTranslation('more_answers')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Clear custom statistics displays (numeric and ordering) when switching question types
     */
    clearNumericStatisticsDisplay() {
        const numericStatsDiv = dom.get('numeric-stats-display');
        if (numericStatsDiv) {
            numericStatsDiv.remove();
        }
        const orderingStatsDiv = dom.get('ordering-stats-display');
        if (orderingStatsDiv) {
            orderingStatsDiv.remove();
        }
    }

    /**
     * Show statistics for host display - consolidated method
     * @param {string} type - Question type: 'multiple-choice', 'true-false', or 'numeric'
     * @param {Object} options - Configuration object
     * @param {number} [options.optionCount] - Number of options for multiple choice
     * @param {Object} [options.answerCounts] - Answer counts for numeric questions
     */
    showHostStatistics(type, options = {}) {
        const statsContent = dom.get('stats-grid');
        if (!statsContent) return;

        // Always clear numeric display first
        this.clearNumericStatisticsDisplay();

        switch (type) {
            case 'multiple-choice':
                this.setupMultipleChoiceStats(options.optionCount);
                break;
            case 'true-false':
                this.setupTrueFalseStats();
                break;
            case 'numeric':
                this.setupNumericStats(options.answerCounts);
                break;
            case 'ordering':
                this.setupOrderingStats(options.answerCounts);
                break;
            default:
                logger.warn('Unknown statistics type:', type);
        }
    }

    /**
     * Setup multiple choice statistics display
     */
    setupMultipleChoiceStats(optionCount) {
        for (let i = 0; i < UI.MAX_STAT_ITEMS; i++) {
            const statItem = dom.get(`stat-item-${i}`);
            const optionLabel = statItem?.querySelector('.option-label');

            if (statItem && optionLabel) {
                if (i < optionCount) {
                    statItem.classList.remove('hidden');
                    statItem.classList.add('visible-flex');
                    optionLabel.textContent = translationManager.getOptionLetter(i);
                    // Drop any data-translate left by a previous true/false question
                    optionLabel.removeAttribute('data-translate');
                    this.resetStatItemValues(statItem);
                } else {
                    statItem.classList.add('hidden');
                    statItem.classList.remove('visible-flex');
                }
            }
        }
    }

    /**
     * Setup true/false statistics display
     */
    setupTrueFalseStats() {
        const tfTexts = getTrueFalseText();
        for (let i = 0; i < UI.MAX_STAT_ITEMS; i++) {
            const statItem = dom.get(`stat-item-${i}`);
            const optionLabel = statItem?.querySelector('.option-label');

            if (statItem && optionLabel) {
                if (i === 0) {
                    statItem.classList.remove('hidden');
                    statItem.classList.add('visible-flex');
                    optionLabel.textContent = tfTexts.true;
                    // data-translate so a mid-game language switch retranslates it
                    optionLabel.setAttribute('data-translate', 'true');
                    this.resetStatItemValues(statItem);
                } else if (i === 1) {
                    statItem.classList.remove('hidden');
                    statItem.classList.add('visible-flex');
                    optionLabel.textContent = tfTexts.false;
                    optionLabel.setAttribute('data-translate', 'false');
                    this.resetStatItemValues(statItem);
                } else {
                    statItem.classList.add('hidden');
                    statItem.classList.remove('visible-flex');
                }
            }
        }
    }

    /**
     * Setup numeric statistics display
     */
    setupNumericStats(answerCounts) {
        // Hide all regular stat items
        for (let i = 0; i < UI.MAX_STAT_ITEMS; i++) {
            const statItem = dom.get(`stat-item-${i}`);
            if (statItem) {
                statItem.classList.add('hidden');
                statItem.classList.remove('visible-flex');
            }
        }

        // Create custom numeric display
        const answers = Object.keys(answerCounts || {});
        const sortedAnswers = answers.sort((a, b) => parseFloat(a) - parseFloat(b));
        this.createNumericStatisticsDisplay(answerCounts, sortedAnswers);
    }

    /**
     * Setup ordering statistics display (shows most common sequence orders)
     */
    setupOrderingStats(answerCounts) {
        // Hide all regular stat items
        for (let i = 0; i < UI.MAX_STAT_ITEMS; i++) {
            const statItem = dom.get(`stat-item-${i}`);
            if (statItem) {
                statItem.classList.add('hidden');
                statItem.classList.remove('visible-flex');
            }
        }

        // Show most common ordering sequences
        const statsGrid = dom.get('stats-grid');
        if (!statsGrid) return;

        let orderingDisplay = dom.get('ordering-stats-display');
        if (!orderingDisplay) {
            orderingDisplay = document.createElement('div');
            orderingDisplay.id = 'ordering-stats-display';
            orderingDisplay.className = 'numeric-stats-display';
            statsGrid.appendChild(orderingDisplay);
        }

        orderingDisplay.innerHTML = '';

        const orderKeys = Object.keys(answerCounts || {});
        if (orderKeys.length === 0) {
            orderingDisplay.innerHTML = `<div class="no-answers">${escapeHtml(getTranslation('no_answers_yet'))}</div>`;
            return;
        }

        // Sort by count (most common first)
        const sortedOrders = orderKeys.sort((a, b) => answerCounts[b] - answerCounts[a]);
        const maxCount = answerCounts[sortedOrders[0]] || 1;

        sortedOrders.slice(0, UI.MAX_STAT_ITEMS).forEach(orderKey => {
            try {
                const count = answerCounts[orderKey] || 0;
                const percentage = Math.round((count / maxCount) * 100);
                const orderIndices = JSON.parse(orderKey);
                // Convert indices to letters (A, B, C, etc.) for display
                const orderDisplay = orderIndices.map(idx => translationManager.getOptionLetter(idx)).join(' → ');

                const orderItem = document.createElement('div');
                orderItem.className = 'numeric-stat-item';
                orderItem.innerHTML = `
                    <div class="numeric-stat-label">${orderDisplay}</div>
                    <div class="numeric-stat-bar">
                        <div class="numeric-stat-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="numeric-stat-count">${count}</div>
                `;
                orderingDisplay.appendChild(orderItem);
            } catch (e) {
                logger.warn('Failed to parse ordering answer:', orderKey, e);
            }
        });
    }

    /**
     * Reset stat item values to defaults
     */
    resetStatItemValues(statItem) {
        const statCount = statItem.querySelector('.stat-count');
        const statFill = statItem.querySelector('.stat-fill');
        if (statCount) statCount.textContent = '0';
        if (statFill) statFill.style.width = '0%';
    }

    /**
     * Update individual statistic item
     */
    updateStatItem(index, count, totalAnswered) {
        const statCount = dom.get(`stat-count-${index}`);
        const statFill = dom.get(`stat-fill-${index}`);

        logger.debug(`updateStatItem: index=${index}, count=${count}, totalAnswered=${totalAnswered}`);

        if (statCount) {
            statCount.textContent = count;
            logger.debug(`Updated stat count for index ${index}: ${count}`);
        } else {
            logger.warn(`stat-count-${index} element not found`);
        }

        let percentage = 0;
        if (statFill) {
            if (totalAnswered > 0) {
                percentage = (count / totalAnswered) * ANIMATION.PERCENTAGE_CALCULATION_BASE;
                statFill.style.width = `${percentage}%`;
                logger.debug(`Updated stat fill for index ${index}: ${percentage}%`);
            } else {
                statFill.style.width = '0%';
            }
        } else {
            logger.warn(`stat-fill-${index} element not found`);
        }

        // Mirror the distribution onto the matching host tile so the editorial
        // overlay (see app-screens.css) shows live percentages. Multi-choice /
        // multi-correct render `.option-display[data-option=N]`; true/false
        // renders `.tf-option[data-answer="true|false"]` with index 0 → true,
        // index 1 → false.
        const rounded = Math.round(percentage);
        let tile = document.querySelector(`#answer-options .option-display[data-option="${index}"]`);
        if (!tile) {
            const tfAnswer = index === 0 ? 'true' : index === 1 ? 'false' : null;
            if (tfAnswer) {
                tile = document.querySelector(`#answer-options .tf-option[data-answer="${tfAnswer}"]`);
            }
        }
        if (tile) {
            tile.style.setProperty('--pct', rounded);
            tile.setAttribute('data-pct', rounded);
            tile.setAttribute('data-count', count);
        }
    }

    /**
     * Hide answer statistics
     */
    hideAnswerStatistics() {
        const statisticsContainer = dom.get('answer-statistics');
        if (statisticsContainer) {
            statisticsContainer.classList.add('hidden');
            statisticsContainer.classList.remove('counting-only');
        }
    }
}
