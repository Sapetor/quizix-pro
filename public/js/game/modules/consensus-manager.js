/**
 * Consensus Manager Module
 * Handles consensus mode UI for players and hosts:
 * - Proposal distribution display
 * - Consensus progress tracking
 * - Team score display
 */

import { logger } from '../../core/config.js';
import { escapeHtml } from '../../utils/dom.js';
import { getTranslation } from '../../utils/translation-manager.js';

export class ConsensusManager {
    /**
     * Create a ConsensusManager
     * @param {Object} stateManager - Game state manager
     * @param {Object} socketManager - Socket manager for sending proposals
     */
    constructor(stateManager, socketManager) {
        this.stateManager = stateManager;
        this.socketManager = socketManager;
        this.enabled = false;
        this.threshold = 66;
        this.currentProposal = null;

        // Cache DOM elements
        this._cachedElements = {};
    }

    /**
     * Initialize consensus mode for a game
     * @param {Object} config - Consensus configuration
     */
    initialize(config) {
        this.enabled = true;
        this.threshold = parseInt(config.threshold || '66', 10);
        this.allowChat = config.allowChat || false;
        this.currentProposal = null;

        this._showConsensusUI();
        this._updateThresholdDisplay();

        logger.debug('ConsensusManager initialized', { threshold: this.threshold, allowChat: this.allowChat });
    }

    /**
     * Reset for new game
     */
    reset() {
        this.enabled = false;
        this.currentProposal = null;
        this._hideConsensusUI();
    }

    /**
     * Reset for new question
     */
    resetForQuestion() {
        this.currentProposal = null;
        this._clearProposalDistribution();
        this._updateConsensusPercent(0);
    }

    /**
     * Get cached DOM element
     * @param {string} id - Element ID
     * @returns {HTMLElement|null}
     */
    _getElement(id) {
        if (!this._cachedElements[id]) {
            this._cachedElements[id] = document.getElementById(id);
        }
        return this._cachedElements[id];
    }

    /**
     * Show consensus UI elements
     */
    _showConsensusUI() {
        const gameState = this.stateManager.getGameState();

        if (gameState.isHost) {
            const hostView = this._getElement('host-consensus-view');
            if (hostView) hostView.classList.remove('hidden');
        } else {
            const playerView = this._getElement('player-consensus-view');
            if (playerView) playerView.classList.remove('hidden');

            // Show chat input if allowed
            const chatContainer = this._getElement('chat-input-container');
            if (chatContainer && this.allowChat) {
                chatContainer.classList.remove('hidden');
            }
        }
    }

    /**
     * Hide consensus UI elements
     */
    _hideConsensusUI() {
        const hostView = this._getElement('host-consensus-view');
        const playerView = this._getElement('player-consensus-view');

        if (hostView) hostView.classList.add('hidden');
        if (playerView) playerView.classList.add('hidden');
    }

    /**
     * Update threshold display
     */
    _updateThresholdDisplay() {
        const playerDisplay = this._getElement('consensus-threshold-display');
        const hostDisplay = this._getElement('host-consensus-threshold');

        const thresholdText = `${this.threshold}%`;
        if (playerDisplay) playerDisplay.textContent = thresholdText;
        if (hostDisplay) hostDisplay.textContent = thresholdText;
    }

    /**
     * Submit a proposal for an answer
     * @param {number} answer - Answer index
     */
    submitProposal(answer) {
        if (!this.enabled) return;

        this.currentProposal = answer;

        // Emit proposal to server
        if (this.socketManager?.socket) {
            this.socketManager.socket.emit('propose-answer', { answer });
        }

        logger.debug('Proposal submitted', { answer });
    }

    /**
     * Handle proposal update from server
     * @param {Object} data - Proposal distribution data
     */
    handleProposalUpdate(data) {
        if (!this.enabled) return;

        logger.debug('Proposal update received', data);

        const gameState = this.stateManager.getGameState();

        if (gameState.isHost) {
            this._renderHostProposalView(data);
        } else {
            this._renderPlayerProposalDistribution(data);
        }

        this._updateConsensusPercent(data.consensusPercent || 0);
        this._updateLockButton(data.consensusPercent >= this.threshold);
    }

    /**
     * Render proposal distribution for players
     * @param {Object} data - Proposal distribution data
     */
    _renderPlayerProposalDistribution(data) {
        const container = this._getElement('proposal-distribution');
        if (!container) return;

        const proposals = data.proposals || {};
        const totalPlayers = data.totalPlayers || 1;
        const currentQuestion = this.stateManager.getGameState().currentQuestion;
        const options = currentQuestion?.options || [];

        let html = '';

        options.forEach((option, index) => {
            const proposalData = proposals[index] || { count: 0, players: [] };
            const percentage = totalPlayers > 0
                ? Math.round((proposalData.count / totalPlayers) * 100)
                : 0;
            const isMyProposal = this.currentProposal === index;
            const optionLetter = String.fromCharCode(65 + index); // A, B, C, D...

            html += `
                <div class="proposal-bar ${isMyProposal ? 'my-proposal' : ''}"
                     data-answer="${index}"
                     onclick="window.consensusManager?.submitProposal(${index})">
                    <div class="proposal-option-label">${optionLetter}</div>
                    <div class="proposal-bar-container">
                        <div class="proposal-bar-fill" style="width: ${percentage}%"></div>
                        <span class="proposal-bar-text">${escapeHtml(option.substring(0, 30))}</span>
                    </div>
                    <div class="proposal-count">${proposalData.count}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * Render proposal view for host (shows player names)
     * @param {Object} data - Proposal distribution data
     */
    _renderHostProposalView(data) {
        const container = this._getElement('host-proposal-grid');
        if (!container) return;

        const proposals = data.proposals || {};
        const currentQuestion = this.stateManager.getGameState().currentQuestion;
        const options = currentQuestion?.options || [];

        let html = '';

        options.forEach((option, index) => {
            const proposalData = proposals[index] || { count: 0, players: [] };
            const optionLetter = String.fromCharCode(65 + index);
            const playerList = proposalData.players?.join(', ') || '';

            html += `
                <div class="host-proposal-item ${data.leadingAnswer === index ? 'leading' : ''}">
                    <div class="host-proposal-header">
                        <span class="host-proposal-option">${optionLetter}</span>
                        <span class="host-proposal-count">${proposalData.count}</span>
                    </div>
                    <div class="host-proposal-text">${escapeHtml(option.substring(0, 50))}</div>
                    <div class="host-proposal-players">${escapeHtml(playerList) || '-'}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * Clear proposal distribution display
     */
    _clearProposalDistribution() {
        const playerContainer = this._getElement('proposal-distribution');
        const hostContainer = this._getElement('host-proposal-grid');

        if (playerContainer) playerContainer.innerHTML = '';
        if (hostContainer) hostContainer.innerHTML = '';
    }

    /**
     * Update consensus percentage display
     * @param {number} percent - Current consensus percentage
     */
    _updateConsensusPercent(percent) {
        const playerPercent = this._getElement('consensus-percent');
        const hostPercent = this._getElement('host-consensus-percent');
        const playerBar = this._getElement('consensus-bar');
        const hostBar = this._getElement('host-consensus-bar');

        const percentText = `${Math.round(percent)}%`;

        if (playerPercent) playerPercent.textContent = percentText;
        if (hostPercent) hostPercent.textContent = percentText;
        if (playerBar) playerBar.style.width = `${Math.min(percent, 100)}%`;
        if (hostBar) hostBar.style.width = `${Math.min(percent, 100)}%`;

        // Add threshold-met class for visual feedback
        const thresholdMet = percent >= this.threshold;
        [playerBar, hostBar].forEach(bar => {
            if (bar) {
                bar.classList.toggle('threshold-met', thresholdMet);
            }
        });
    }

    /**
     * Update lock consensus button state
     * @param {boolean} enabled - Whether button should be enabled
     */
    _updateLockButton(enabled) {
        const lockBtn = this._getElement('lock-consensus-btn');
        if (lockBtn) {
            lockBtn.disabled = !enabled;
        }
    }

    /**
     * Handle consensus reached event
     * @param {Object} data - Consensus result data
     */
    showConsensusReached(data) {
        logger.debug('Consensus reached', data);

        const isCorrect = data.isCorrect;
        const teamPoints = data.teamPoints || 0;

        // Update team score display
        this._updateTeamScore(data.totalTeamScore || teamPoints);

        // Show celebration or result feedback
        const feedbackClass = isCorrect ? 'consensus-correct' : 'consensus-incorrect';
        const message = isCorrect
            ? `${getTranslation('consensus_correct') || 'Correct!'} +${teamPoints} ${getTranslation('team_points') || 'team points'}`
            : getTranslation('consensus_incorrect') || 'Incorrect - no points';

        this._showConsensusFeedback(message, feedbackClass);
    }

    /**
     * Update team score display
     * @param {number} score - Team score
     */
    _updateTeamScore(score) {
        const playerScore = this._getElement('player-team-score');
        const hostScore = this._getElement('host-team-score');

        if (playerScore) playerScore.textContent = score;
        if (hostScore) hostScore.textContent = score;
    }

    /**
     * Show consensus feedback message
     * @param {string} message - Feedback message
     * @param {string} className - CSS class for styling
     */
    _showConsensusFeedback(message, className) {
        // Use existing modal feedback if available
        if (window.modalFeedback) {
            if (className === 'consensus-correct') {
                window.modalFeedback.showCorrect(message, 0, 3000);
            } else {
                window.modalFeedback.showIncorrect(message, 0, 3000);
            }
        }
    }

    /**
     * Handle team score update event
     * @param {Object} data - Team score update data
     */
    handleTeamScoreUpdate(data) {
        this._updateTeamScore(data.teamScore || 0);
    }

    /**
     * Bind event listeners for consensus UI
     */
    bindEventListeners() {
        // Lock consensus button (host only)
        const lockBtn = this._getElement('lock-consensus-btn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => {
                if (this.socketManager?.socket) {
                    this.socketManager.socket.emit('lock-consensus');
                }
            });
        }

        // Make this manager accessible globally for onclick handlers
        window.consensusManager = this;
    }

    /**
     * Clean up
     */
    cleanup() {
        this.reset();
        if (window.consensusManager === this) {
            delete window.consensusManager;
        }
    }
}
