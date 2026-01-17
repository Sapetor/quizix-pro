/**
 * Leaderboard Manager Module
 * Handles leaderboard display, rankings, confetti, and end-game celebration
 * Extracted from game-manager.js for modularity
 */

import { getTranslation } from '../../utils/translation-manager.js';
import { logger, ANIMATION, TIMING } from '../../core/config.js';
import { dom } from '../../utils/dom.js';
import { simpleResultsDownloader } from '../../utils/simple-results-downloader.js';

export class LeaderboardManager {
    /**
     * Create a LeaderboardManager
     * @param {Object} stateManager - Game state manager
     * @param {Object} uiManager - UI manager
     * @param {Object} soundManager - Sound manager
     */
    constructor(stateManager, uiManager, soundManager) {
        this.stateManager = stateManager;
        this.uiManager = uiManager;
        this.soundManager = soundManager;
        this.fanfarePlayed = false;
    }

    /**
     * Reset state for new game
     */
    reset() {
        this.fanfarePlayed = false;
    }

    /**
     * Show leaderboard screen
     * @param {Array} leaderboard - Array of player scores
     */
    showLeaderboard(leaderboard) {
        this.updateLeaderboardDisplay(leaderboard);

        const gameState = this.stateManager.getGameState();
        this.uiManager.showScreen(gameState.isHost ? 'leaderboard-screen' : 'player-game-screen');
    }

    /**
     * Show final results with celebration
     * @param {Array} leaderboard - Final leaderboard
     * @param {Object} socket - Socket for player identification
     * @param {Function} saveResultsCallback - Callback to save results
     */
    showFinalResults(leaderboard, socket, saveResultsCallback) {
        logger.debug('showFinalResults called with leaderboard:', leaderboard);

        if (this.fanfarePlayed) {
            logger.debug('Fanfare already played, skipping');
            return;
        }
        this.fanfarePlayed = true;

        this.updateLeaderboardDisplay(leaderboard);

        const gameState = this.stateManager.getGameState();

        if (gameState.isHost) {
            this.showHostFinalResults(leaderboard, saveResultsCallback);
        } else {
            this.showPlayerFinalResults(leaderboard, socket);
        }

        this.stateManager.endGame();
        logger.debug('Final results display completed');
    }

    /**
     * Show host final results with confetti
     * @param {Array} leaderboard - Final leaderboard
     * @param {Function} saveResultsCallback - Callback to save results
     */
    showHostFinalResults(leaderboard, saveResultsCallback) {
        logger.debug('HOST: Showing final results with confetti');

        const finalResults = document.getElementById('final-results');
        if (finalResults) {
            finalResults.classList.remove('hidden');
            finalResults.classList.add('game-complete-animation');

            setTimeout(() => {
                finalResults.classList.remove('game-complete-animation');
            }, TIMING.ANIMATION_COMPLETE);
        }

        this.uiManager.showScreen('leaderboard-screen');

        setTimeout(() => {
            this.showGameCompleteConfetti();
        }, TIMING.CONFETTI_DELAY);

        this.playPlacementSounds(leaderboard);

        setTimeout(() => {
            this.playGameEndingFanfare();
        }, TIMING.ANIMATION_COMPLETE);

        if (saveResultsCallback) {
            saveResultsCallback(leaderboard);
        }

        setTimeout(() => {
            simpleResultsDownloader.showDownloadTool();
        }, TIMING.DOWNLOAD_TOOL_DELAY);
    }

    /**
     * Show player final screen
     * @param {Array} leaderboard - Final leaderboard
     * @param {Object} socket - Socket for player identification
     */
    showPlayerFinalResults(leaderboard, socket) {
        logger.debug('PLAYER: Showing player final screen with confetti');

        this.playGameEndingFanfare();
        this.showPlayerFinalScreen(leaderboard, socket);
    }

    /**
     * Play staggered placement sounds
     * @param {Array} leaderboard - Leaderboard for sound timing
     */
    playPlacementSounds(leaderboard) {
        if (!this.soundManager) return;

        // Third place
        if (leaderboard.length >= 3) {
            setTimeout(() => {
                if (this.soundManager?.isSoundsEnabled()) {
                    this.soundManager.playLeaderboardPlacement(3);
                }
            }, TIMING.PLACEMENT_SOUND_3RD);
        }

        // Second place
        if (leaderboard.length >= 2) {
            setTimeout(() => {
                if (this.soundManager?.isSoundsEnabled()) {
                    this.soundManager.playLeaderboardPlacement(2);
                }
            }, TIMING.PLACEMENT_SOUND_2ND);
        }

        // First place
        if (leaderboard.length >= 1) {
            setTimeout(() => {
                if (this.soundManager?.isSoundsEnabled()) {
                    this.soundManager.playLeaderboardPlacement(1);
                }
            }, TIMING.PLACEMENT_SOUND_1ST);
        }
    }

    /**
     * Update leaderboard display
     * @param {Array} leaderboard - Array of player scores
     */
    updateLeaderboardDisplay(leaderboard) {
        const leaderboardList = dom.get('leaderboard-list');
        if (!leaderboardList) return;

        dom.clearContent('leaderboard-list');

        leaderboard.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';

            if (index === 0) item.classList.add('first');
            else if (index === 1) item.classList.add('second');
            else if (index === 2) item.classList.add('third');

            const position = index + 1;
            const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;

            item.innerHTML = `
                <span>${medal} ${this.escapeHtml(player.name)}</span>
                <span>${player.score} pts</span>
            `;

            leaderboardList.appendChild(item);
        });
    }

    /**
     * Show player final screen
     * @param {Array} leaderboard - Final leaderboard
     * @param {Object} socket - Socket for player ID
     */
    showPlayerFinalScreen(leaderboard, socket) {
        logger.debug('showPlayerFinalScreen called with:', leaderboard);

        let playerPosition = -1;
        let playerScore = 0;

        const playerId = socket?.id;
        logger.debug('Player ID:', playerId);

        if (leaderboard && Array.isArray(leaderboard)) {
            leaderboard.forEach((player, index) => {
                if (player.id === playerId) {
                    playerPosition = index + 1;
                    playerScore = player.score;
                    logger.debug('Found player position:', playerPosition, 'score:', playerScore);
                }
            });
        }

        if (playerPosition > 0) {
            dom.setContent('final-position', `#${playerPosition}`);
        }
        dom.setContent('final-score', `${playerScore} ${getTranslation('points')}`);

        this.updateFinalLeaderboard(leaderboard.slice(0, 3));
        this.showGameCompleteConfetti();

        logger.debug('Switching to player-final-screen');
        this.uiManager.showScreen('player-final-screen');
    }

    /**
     * Update final leaderboard (top 3)
     * @param {Array} topPlayers - Top 3 players
     */
    updateFinalLeaderboard(topPlayers) {
        const leaderboardContainer = document.getElementById('final-leaderboard');
        if (!leaderboardContainer) return;

        leaderboardContainer.innerHTML = '';

        topPlayers.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'final-leaderboard-item';

            const position = index + 1;
            const medal = ['🥇', '🥈', '🥉'][index] || '🏅';

            item.innerHTML = `
                <span class="medal">${medal}</span>
                <span class="player-name">${this.escapeHtml(player.name)}</span>
                <span class="player-score">${player.score} pts</span>
            `;

            if (position === 1) item.classList.add('first');
            else if (position === 2) item.classList.add('second');
            else if (position === 3) item.classList.add('third');

            leaderboardContainer.appendChild(item);
        });
    }

    /**
     * Show game complete confetti celebration
     */
    showGameCompleteConfetti() {
        logger.debug('showGameCompleteConfetti called');

        if (!window.confetti) {
            logger.error('Confetti library not loaded!');
            return;
        }

        logger.debug('Confetti library loaded, starting celebration...');

        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

        try {
            // Initial big burst
            confetti({
                particleCount: ANIMATION.CONFETTI_PARTICLE_COUNT,
                spread: ANIMATION.CONFETTI_SPREAD,
                origin: { y: ANIMATION.CONFETTI_ORIGIN_Y },
                colors: colors
            });

            // Side bursts
            const burstTimes = [400, 800, 1200];
            burstTimes.forEach((time, index) => {
                setTimeout(() => {
                    confetti({
                        particleCount: ANIMATION.CONFETTI_BURST_PARTICLES,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0 },
                        colors: colors
                    });
                    confetti({
                        particleCount: ANIMATION.CONFETTI_BURST_PARTICLES,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1 },
                        colors: colors
                    });
                }, time);
            });

            logger.debug('All confetti bursts scheduled successfully!');
        } catch (error) {
            logger.error('Failed to show confetti:', error);
        }
    }

    /**
     * Play game ending fanfare
     */
    playGameEndingFanfare() {
        if (this.soundManager?.isSoundsEnabled()) {
            this.soundManager.playVictorySound();
        }
    }

    /**
     * Escape HTML for safe display
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
