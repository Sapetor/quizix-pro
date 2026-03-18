/**
 * Socket Manager Module
 * Handles all socket.io event listeners and socket communication
 */

import { translationManager } from '../utils/translation-manager.js';
import { unifiedErrorHandler as errorBoundary } from '../utils/unified-error-handler.js';
import { logger, UI, TIMING } from '../core/config.js';
import { uiStateManager } from '../utils/ui-state-manager.js';
import { show, hide } from '../utils/dom.js';

const RECONNECT_KEY = 'quizix_reconnect';

export class SocketManager {
    constructor(socket, gameManager, uiManager, soundManager) {
        this.socket = socket;
        this.gameManager = gameManager;
        this.uiManager = uiManager;
        this.soundManager = soundManager;
        this.currentPlayerName = null; // Store current player name for language updates
        this.abortController = new AbortController(); // For cleanup of event listeners

        // Cached DOM element references (lazy-loaded)
        this._cachedElements = {};

        this.initializeSocketListeners();
        this.initializeLanguageListener();
    }

    /**
     * Get cached DOM element by ID (lazy-load and cache)
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
     * Get cached DOM element by selector (lazy-load and cache)
     * @param {string} selector - CSS selector
     * @returns {HTMLElement|null}
     */
    _getElementBySelector(selector) {
        const key = `sel:${selector}`;
        if (!this._cachedElements[key]) {
            this._cachedElements[key] = document.querySelector(selector);
        }
        return this._cachedElements[key];
    }

    /**
     * Clear cached DOM elements (call on screen transitions)
     */
    clearCache() {
        this._cachedElements = {};
        logger.debug('SocketManager cache cleared');
    }

    /**
     * Reset button to default styles (clear any inline overrides)
     * @param {HTMLElement} button - Button element to reset
     */
    _resetButtonStyles(button) {
        if (!button) return;
        button.onclick = null;
        const stylesToReset = [
            'position', 'bottom', 'right', 'zIndex', 'backgroundColor',
            'color', 'border', 'padding', 'borderRadius', 'fontSize',
            'cursor', 'boxShadow'
        ];
        stylesToReset.forEach(prop => { button.style[prop] = ''; });
    }

    /**
     * Resolve a server-sent message to a translated string.
     * Prefers data.messageKey (translation key) over data.message (raw string),
     * with an optional fallbackKey if neither produces a usable result.
     * @param {object} data - Socket event data object
     * @param {string} [fallbackKey] - Translation key to use as last resort
     * @returns {string}
     */
    _resolveServerMessage(data, fallbackKey) {
        if (data?.messageKey) {
            const translated = translationManager.getTranslationSync(data.messageKey);
            if (translated && translated !== data.messageKey) {
                return translated;
            }
        }
        if (fallbackKey) {
            const fallback = translationManager.getTranslationSync(fallbackKey);
            if (fallback && fallback !== fallbackKey) {
                return fallback;
            }
        }
        return data?.message || data?.error || translationManager.getTranslationSync('error_occurred') || 'An error occurred';
    }

    /**
     * Initialize all socket event listeners
     */
    initializeSocketListeners() {
        // Connection events
        this.socket.on('connect', () => {
            logger.debug('Connected to server');
        });

        this.socket.on('disconnect', (reason) => {
            logger.debug('Disconnected from server:', reason);
            // Stop active timers to prevent phantom timer updates while disconnected
            if (this.gameManager) {
                this.gameManager.stopTimer();
            }

            const gameState = this.gameManager?.stateManager?.getGameState();
            if (gameState && gameState.gamePin) {
                if (gameState.isHost) {
                    // Store host reconnection data for grace period rejoin
                    try {
                        localStorage.setItem('quizix_host_reconnect', JSON.stringify({
                            pin: gameState.gamePin,
                            savedAt: Date.now()
                        }));
                    } catch (e) {
                        logger.warn('Failed to store host reconnection data:', e);
                    }
                } else {
                    this._showReconnectionOverlay();
                }
            }
        });

        // Game creation and joining
        this.socket.on('game-created', (data) => {
            logger.debug('Game created:', data);
            logger.debug('Quiz title from server:', data.title);
            this.gameManager.setGamePin(data.pin);
            this.gameManager.setPlayerInfo('Host', true);
            this.uiManager.updateGamePin(data.pin);
            this.uiManager.loadQRCode(data.pin);

            // Update quiz title in lobby
            if (data.title) {
                logger.debug('Calling updateQuizTitle with:', data.title);
                this.uiManager.updateQuizTitle(data.title);
            } else {
                logger.warn('No quiz title received from server');
            }

            // 🔧 FIX: Initialize empty player list for new lobby to prevent phantom players
            this.gameManager.updatePlayersList([]);
            this._lastPlayerCount = 0; // Reset player count tracking for join sounds
            logger.debug('🧹 Initialized empty player list for new lobby');

            // Store PIN for migration (survives refresh — host can start new game after refresh)
            try {
                localStorage.setItem('quizix_migration_pin', data.pin);
            } catch (e) {
                logger.warn('Failed to store migration PIN:', e);
            }

            this.uiManager.showScreen('game-lobby');
        });

        this.socket.on('migration-token', (data) => {
            logger.debug('Received migration token for game:', data.pin);
            try {
                localStorage.setItem('quizix_migration_token', data.migrationToken);
            } catch (e) {
                logger.warn('Failed to store migration token:', e);
            }
        });

        // Listen for new games becoming available
        this.socket.on('game-available', (data) => {
            logger.debug('New game available:', data);
            // Refresh the active games list (will only have effect if games list is visible)
            this.uiManager.refreshActiveGames();
        });

        this.socket.on('player-joined', (data) => {
            logger.debug('Player joined:', data);
            logger.debug('data.players:', data.players);
            logger.debug('data keys:', Object.keys(data));

            // Dismiss migration toast if visible (player was migrated to new game)
            if (window.toastNotifications?.clearAll) {
                window.toastNotifications.clearAll();
            }

            // Set player info correctly - player is NOT a host
            logger.debug('PlayerJoined', { playerName: data.playerName, gamePin: data.gamePin });
            if (data.playerName && data.gamePin) {
                this.gameManager.setPlayerInfo(data.playerName, false);
                this.gameManager.setGamePin(data.gamePin);

                // Store reconnection info in localStorage
                if (data.sessionToken) {
                    try {
                        localStorage.setItem(RECONNECT_KEY, JSON.stringify({
                            pin: data.gamePin,
                            playerName: data.playerName,
                            sessionToken: data.sessionToken,
                            savedAt: Date.now()
                        }));
                    } catch (e) {
                        logger.warn('Failed to store reconnection data:', e);
                    }
                }

                // Update lobby display with game information
                this.updatePlayerLobbyDisplay(data.gamePin, data.players);

                // Update "You're in!" message with player name
                this.updatePlayerWelcomeMessage(data.playerName);
            } else {
                logger.warn('PlayerJoin failed', { playerName: data.playerName, gamePin: data.gamePin });
            }
            this.gameManager.updatePlayersList(data.players);
            this.uiManager.showScreen('player-lobby');
        });

        // Handle player name change response
        this.socket.on('name-changed', (data) => {
            logger.debug('Name changed:', data);
            if (data.success) {
                // Update local state
                this.currentPlayerName = data.newName;
                this.gameManager.setPlayerInfo(data.newName, false);

                // Update welcome message
                this.updatePlayerWelcomeMessage(data.newName);

                // Hide edit mode, show display mode
                this.hideNameEditMode();

                // Show success toast
                if (window.toastNotifications) {
                    const message = translationManager.getTranslationSync('name_changed_success') || 'Name updated!';
                    window.toastNotifications.show(message, 'success', 2000);
                }
            }
        });

        // Game flow events
        this.socket.on('game-started', (data) => {
            logger.debug('Game started:', data);
            const isHost = this.gameManager.stateManager?.getGameState()?.isHost ?? false;

            // Clear stale content from any previous game before showing game screen
            this.gameManager.clearGameDisplayContent();

            // Initialize power-ups for players (not host)
            if (!isHost && data.powerUpsEnabled) {
                this.gameManager.initializePowerUps(true);
            }

            if (isHost) {
                this.uiManager.showScreen('host-game-screen');
            } else {
                this.uiManager.showScreen('player-game-screen');
            }
        });

        // Power-up result handler
        this.socket.on('power-up-result', (data) => {
            logger.debug('Power-up result:', data);
            if (data.success) {
                // Handle specific power-up effects
                if (data.type === 'fifty-fifty' && data.hiddenOptions) {
                    // Apply 50-50 effect from server
                    this.gameManager.getPowerUpManager()?.applyFiftyFiftyToOptions(
                        this.gameManager.stateManager.getGameState().currentQuestion?.correctAnswer
                    );
                } else if (data.type === 'extend-time' && data.extraSeconds) {
                    // Extend time effect is handled locally
                    this.gameManager.timerManager?.extendTime(data.extraSeconds);
                }
                // double-points is handled automatically in scoring
            } else {
                logger.warn('Power-up failed:', data.error);
            }
        });

        this.socket.on('question-start', errorBoundary.safeSocketHandler((data) => {
            logger.debug('Question started:', data);

            // Show host-only buttons during active question
            const isHostForStop = this.gameManager.stateManager?.getGameState()?.isHost ?? false;
            if (isHostForStop) {
                const stopBtn = this._getElement('stop-quiz-btn');
                if (stopBtn) show(stopBtn);
                const endRoundContainer = this._getElement('end-round-container');
                if (endRoundContainer) show(endRoundContainer, 'visible-flex');
            }

            // Switch to playing state for immersive gameplay
            uiStateManager?.setState?.('playing');

            this.gameManager.displayQuestion(data);

            // Block answer clicks if player already answered (rejoin scenario)
            if (data.alreadyAnswered) {
                this.gameManager.stateManager.answerSubmitted = true;
            }

            // Ensure timer has valid duration (convert seconds to ms)
            const timeLimit = data.timeLimit && !isNaN(data.timeLimit) ? data.timeLimit : UI.DEFAULT_TIMER_SECONDS;
            // Use remaining time for rejoining players, full time for normal question start
            const timerDuration = data.remainingTimeMs != null
                ? data.remainingTimeMs
                : (timeLimit * 1000);
            this.gameManager.startTimer(timerDuration);

            if (this.soundManager?.isEnabled()) {
                this.soundManager.playQuestionStartSound();
            }
        }, 'question-start'));

        this.socket.on('question-end', (data) => {
            logger.debug('Question ended:', data);
            this.gameManager.stopTimer();

            // New flow: question-end now shows statistics first, not leaderboard
            if (data && data.showStatistics) {
                // Stay on host-game-screen to show statistics with new control buttons
                logger.debug('Question ended - statistics ready with control buttons');
            }
        });

        this.socket.on('question-timeout', (data) => {
            logger.debug('Question timed out:', data);
            this.gameManager.stopTimer();

            if (this.gameManager.timer) {
                clearInterval(this.gameManager.timer);
                this.gameManager.timer = null;
            }

            // Hide host-only buttons between questions
            const stopBtnTimeout = this._getElement('stop-quiz-btn');
            if (stopBtnTimeout) hide(stopBtnTimeout);
            const endRoundTimeout = this._getElement('end-round-container');
            if (endRoundTimeout) hide(endRoundTimeout);

            // Show correct answer on host side
            const isHost = this.gameManager.stateManager?.getGameState()?.isHost ?? false;
            if (isHost) {
                this.gameManager.showCorrectAnswer(data);
            }
        });

        this.socket.on('show-next-button', (data) => {
            logger.debug('Showing next question button', data);

            // Determine if this is the last question
            const gameState = this.gameManager.stateManager?.getGameState();
            const currentQuestion = gameState?.currentQuestion;
            const isLastQuestion = data?.isLastQuestion ||
                (currentQuestion?.questionNumber >= currentQuestion?.totalQuestions);

            const buttonText = isLastQuestion
                ? (translationManager.getTranslationSync('finish_quiz') || 'Finish Quiz')
                : (translationManager.getTranslationSync('next_question') || 'Next Question');

            // Show buttons in leaderboard screen
            const nextButton = this._getElement('next-question');
            if (nextButton) {
                show(nextButton, 'visible-block');
                nextButton.textContent = buttonText;
                this._resetButtonStyles(nextButton);
            }

            // Also show buttons in host-game-screen (for statistics phase)
            const statsControls = this._getElementBySelector('.stats-controls');
            const nextButtonStats = this._getElement('next-question-stats');
            if (statsControls && nextButtonStats) {
                show(statsControls, 'visible-flex');
                show(nextButtonStats, 'visible-block');
                nextButtonStats.textContent = buttonText;
            }
        });

        this.socket.on('hide-next-button', () => {
            logger.debug('Hiding next question button');

            // Hide button in leaderboard screen
            const nextButton = this._getElement('next-question');
            if (nextButton) {
                hide(nextButton);
                nextButton.onclick = null;
            }

            // Hide buttons in host-game-screen
            const statsControls = this._getElementBySelector('.stats-controls');
            const nextButtonStats = this._getElement('next-question-stats');
            if (statsControls) hide(statsControls);
            if (nextButtonStats) hide(nextButtonStats);
        });

        this.socket.on('game-end', (data) => {
            logger.debug('Game ended - triggering final results:', data);

            // Hide host game controls
            const stopBtnEnd = this._getElement('stop-quiz-btn');
            if (stopBtnEnd) hide(stopBtnEnd);

            // Clear reconnection data — game is over
            this._clearReconnectionData();
            this._hideRejoinBanner();

            // Switch to results state for leaderboard and celebration
            if (window.uiStateManager?.setState) {
                window.uiStateManager.setState('results');
            }

            // Hide manual advancement button
            const nextButton = this._getElement('next-question');
            if (nextButton) {
                hide(nextButton);
                nextButton.onclick = null;
            }

            // Clear any remaining timers and show final results
            this.gameManager.stopTimer();
            this.gameManager.showFinalResults(data.finalLeaderboard, data.conceptMastery);

            // Mark player as having completed a game (hides first-game hints on next visit)
            localStorage.setItem('quiz_player_first_game', 'done');
        });

        // Handle game reset for rematch
        this.socket.on('game-reset', (data) => {
            logger.debug('Game reset for rematch:', data);

            // Stop timers and reset game state
            this.gameManager.stopTimer();
            this.gameManager.resetGameState?.();

            // Determine if this client is the host
            const isHost = data.hostSocketId === this.socket.id;
            const uiState = isHost ? 'hostLobby' : 'playerWaiting';
            const screen = isHost ? 'game-lobby' : 'player-lobby';

            window.uiStateManager?.setState?.(uiState);

            if (isHost) {
                this.gameManager.stateManager?.updateState?.({ isHost: true });
                this.uiManager.updateQuizTitle(data.title);
                this._lastPlayerCount = data.players?.length || 0;
            } else {
                this.updatePlayerLobbyDisplay(data.pin, data.players);
            }

            this.gameManager.updatePlayersList(data.players);
            this.uiManager.showScreen(screen);

            logger.info(`Game reset for rematch (isHost: ${isHost})`);
        });

        // Player-specific events
        this.socket.on('player-result', errorBoundary.safeSocketHandler((data) => {
            logger.debug('Player result received:', data);
            this.gameManager.showPlayerResult(data);
        }, 'player-result'));

        this.socket.on('answer-submitted', (data) => {
            logger.debug('Answer submitted feedback:', data);
            this.gameManager.showAnswerSubmitted(data.answer);
        });

        this.socket.on('answer-rejected', (data) => {
            logger.warn('Answer rejected:', data);
            this.gameManager.showAnswerRejected(this._resolveServerMessage(data, 'error_answer_rejected'));
        });

        // Show leaderboard
        this.socket.on('show-leaderboard', (data) => {
            logger.debug('Showing leaderboard:', data);
            this.gameManager.showLeaderboard(data.leaderboard);
        });

        // Live answer count updates (during question)
        this.socket.on('answer-count-update', (data) => {
            logger.debug('Live answer count update:', data);
            this.gameManager.updateLiveAnswerCount(data);
        });

        // Answer statistics updates (after question ends)
        this.socket.on('answer-statistics', (data) => {
            logger.debug('Answer statistics received:', data);
            this.gameManager.updateAnswerStatistics(data);
        });

        this.socket.on('player-list-update', (data) => {
            logger.debug('Player list updated:', data);

            // Track previous count to detect new players
            const previousCount = this._lastPlayerCount || 0;
            const newCount = data.players ? data.players.length : 0;
            this._lastPlayerCount = newCount;

            // Play join sound if player count increased (only for host)
            if (newCount > previousCount && this.gameManager.stateManager?.getGameState().isHost) {
                if (this.soundManager && this.soundManager.isSoundsEnabled()) {
                    this.soundManager.playPlayerJoinSound();
                }
            }

            this.gameManager.updatePlayersList(data.players);

            // Update player count in lobby if we're in player lobby
            if (this.uiManager.currentScreen === 'player-lobby') {
                const lobbyPlayerCount = this._getElement('lobby-player-count');
                if (lobbyPlayerCount && data.players) {
                    lobbyPlayerCount.textContent = data.players.length;
                }
            }
        });

        // ==================== CONSENSUS MODE EVENTS ====================

        // Proposal distribution update
        this.socket.on('proposal-update', (data) => {
            logger.debug('Proposal update received:', data);
            if (this.gameManager.consensusManager) {
                this.gameManager.consensusManager.handleProposalUpdate(data);
            }
        });

        // Consensus threshold met notification
        this.socket.on('consensus-threshold-met', (data) => {
            logger.debug('Consensus threshold met:', data);
            // Visual feedback that threshold is met
        });

        // Consensus reached and locked
        this.socket.on('consensus-reached', (data) => {
            logger.debug('Consensus reached:', data);
            if (this.gameManager.consensusManager) {
                this.gameManager.consensusManager.showConsensusReached(data);
            }
        });

        // Quick response from another player
        this.socket.on('quick-response', (data) => {
            logger.debug('Quick response received:', data);
            if (this.gameManager.discussionManager) {
                this.gameManager.discussionManager.handleQuickResponse(data);
            }
        });

        // Chat message from another player
        this.socket.on('chat-message', (data) => {
            logger.debug('Chat message received:', data);
            if (this.gameManager.discussionManager) {
                this.gameManager.discussionManager.handleChatMessage(data);
            }
        });

        // Team score update
        this.socket.on('team-score-update', (data) => {
            logger.debug('Team score update:', data);
            if (this.gameManager.consensusManager) {
                this.gameManager.consensusManager.handleTeamScoreUpdate(data);
            }
        });

        // ==================== END CONSENSUS MODE EVENTS ====================

        // Error handling
        this.socket.on('error', (data) => {
            logger.error('Socket error:', data);
            translationManager.showAlert('error', this._resolveServerMessage(data, 'error_occurred'));
        });

        this.socket.on('game-not-found', (data) => {
            logger.error('Game not found:', data);
            translationManager.showAlert('error', this._resolveServerMessage(data, 'error_game_not_found'));
        });

        this.socket.on('player-limit-reached', (data) => {
            logger.error('Player limit reached:', data);
            translationManager.showAlert('error', this._resolveServerMessage(data, 'error_player_limit'));
        });

        this.socket.on('invalid-pin', (data) => {
            logger.error('Invalid PIN:', data);
            translationManager.showAlert('error', this._resolveServerMessage(data, 'error_invalid_pin'));
        });

        this.socket.on('name-taken', (data) => {
            logger.error('Name taken:', data);
            translationManager.showAlert('error', this._resolveServerMessage(data, 'error_name_taken'));
        });

        this.socket.on('player-disconnected', (data) => {
            logger.debug('Player disconnected:', data);

            // Play leave sound (only for host)
            if (this.gameManager.stateManager?.getGameState().isHost) {
                if (this.soundManager && this.soundManager.isSoundsEnabled()) {
                    this.soundManager.playPlayerLeaveSound();
                }
            }

            // Update player count tracking
            this._lastPlayerCount = data.players ? data.players.length : 0;

            this.gameManager.updatePlayersList(data.players);
        });

        // Handle game-ended (emitted when host disconnects mid-game)
        this.socket.on('game-ended', (data) => {
            logger.debug('Game ended (host disconnected):', data);
            const stopBtnEnded = this._getElement('stop-quiz-btn');
            if (stopBtnEnded) hide(stopBtnEnded);
            this._hideReconnectionOverlay();
            this._clearReconnectionData();
            this._hideRejoinBanner();
            this.gameManager.stopTimer();
            this.gameManager.resetGameState();
            this.uiManager.showScreen('main-menu');
            const reason = data?.reason || 'The game has ended';
            translationManager.showAlert('info', reason);
        });

        this.socket.on('host-preparing-new-game', (data) => {
            logger.info('Host is preparing a new game, waiting for migration...');

            // Stop active game state (timer, sounds)
            this.gameManager.stopTimer();
            this.gameManager.resetGameState();

            if (window.toastNotifications) {
                const msg = translationManager.getTranslationSync('host_preparing_new_game')
                    || 'Host is setting up the next game... Please wait.';
                window.toastNotifications.show(msg, 'info', data.graceMs || 120000);
            }

            if (window.uiStateManager?.setState) {
                window.uiStateManager.setState('playerWaiting');
            }

            this.uiManager.showScreen('player-lobby');
        });

        // Special events
        this.socket.on('force-disconnect', (data) => {
            logger.debug('Force disconnect:', data);
            this._clearReconnectionData();
            this._hideRejoinBanner();
            this.gameManager.stopTimer();
            this.gameManager.resetGameState();
            translationManager.showAlert('info', this._resolveServerMessage(data, 'error_host_disconnected'));
            this.uiManager.showScreen('main-menu');
        });

        this.socket.on('reconnect', (attemptNumber) => {
            logger.debug('Reconnected after attempt:', attemptNumber);

            // Try host rejoin first
            try {
                const hostData = JSON.parse(localStorage.getItem('quizix_host_reconnect') || 'null');
                if (hostData?.pin && (Date.now() - hostData.savedAt) < 30000) {
                    this.socket.emit('host-rejoin', { pin: hostData.pin });
                    localStorage.removeItem('quizix_host_reconnect');
                    return;
                }
            } catch (e) {
                logger.warn('Failed to read host reconnect data:', e);
            }
            localStorage.removeItem('quizix_host_reconnect');

            // Otherwise attempt player rejoin
            this._attemptRejoin();
        });

        this.socket.on('reconnect_error', (error) => {
            logger.error('Reconnection error:', error);
        });

        this.socket.on('reconnect_failed', () => {
            logger.error('Reconnection failed — preserving session data for manual rejoin');
            this._hideReconnectionOverlay();

            // DON'T clear reconnection data — player can still rejoin manually
            // Reset game state and go to main menu, then show rejoin banner
            this.gameManager.stopTimer();
            this.gameManager.resetGameState();
            this.uiManager.showScreen('main-menu');
            this._showRejoinBanner();
        });

        // Handle successful rejoin
        this.socket.on('rejoin-success', (data) => {
            logger.info('Rejoin successful:', data);
            this._hideReconnectionOverlay();
            this._hideRejoinBanner();

            // Restore player state
            this.gameManager.setPlayerInfo(data.playerName, false);
            this.gameManager.setGamePin(data.gamePin);
            this.currentPlayerName = data.playerName;

            // Refresh reconnection data with fresh timestamp
            try {
                localStorage.setItem(RECONNECT_KEY, JSON.stringify({
                    pin: data.gamePin,
                    playerName: data.playerName,
                    sessionToken: data.sessionToken,
                    savedAt: Date.now()
                }));
            } catch (e) {
                logger.warn('Failed to update reconnection data:', e);
            }

            // Show appropriate screen based on game status
            if (data.gameStatus === 'lobby') {
                this.uiManager.showScreen('player-lobby');
            } else {
                // Game is in progress — show game screen
                this.uiManager.showScreen('player-game-screen');
            }

            if (window.toastNotifications) {
                const msg = translationManager.getTranslationSync('reconnected_successfully') || 'Reconnected!';
                window.toastNotifications.show(msg, 'success', 2000);
            }
        });

        // Handle failed rejoin
        this.socket.on('rejoin-failed', (data) => {
            logger.warn('Rejoin failed:', data);
            this._hideReconnectionOverlay();
            this._clearReconnectionData();
            this._hideRejoinBanner();

            // Reset state and go to main menu
            this.gameManager.stopTimer();
            this.gameManager.resetGameState();
            this.uiManager.showScreen('main-menu');
        });

        // Handle successful host rejoin after disconnect
        this.socket.on('host-rejoin-success', (data) => {
            logger.info('Host rejoin successful:', data);
            this.gameManager.setGamePin(data.pin);
            this.gameManager.setPlayerInfo('Host', true);
            this.uiManager.updateGamePin(data.pin);

            if (data.gameState === 'lobby') {
                this.uiManager.showScreen('game-lobby');
            } else {
                this.uiManager.showScreen('host-game-screen');
            }

            this.gameManager.updatePlayersList(data.players);

            if (window.toastNotifications) {
                window.toastNotifications.show('Reconnected as host!', 'success', 2000);
            }
        });

        // Handle host temporarily disconnected (show waiting overlay to players)
        this.socket.on('host-disconnected', () => {
            const overlay = this._getElement('reconnection-overlay');
            if (overlay) {
                show(overlay);
                const contextEl = this._getElement('reconnection-context');
                if (contextEl) {
                    contextEl.textContent = translationManager.getTranslationSync('host_disconnected_waiting')
                        || 'Host disconnected — waiting for reconnection...';
                }
            }
        });

        // Handle host reconnected (hide waiting overlay)
        this.socket.on('host-reconnected', () => {
            this._hideReconnectionOverlay();
            if (window.toastNotifications) {
                window.toastNotifications.show(
                    translationManager.getTranslationSync('host_reconnected') || 'Host reconnected!',
                    'success', 2000
                );
            }
        });

        // Handle timer resync from server (after tab becomes visible)
        this.socket.on('time-sync', (data) => {
            if (data?.remainingMs != null && this.gameManager) {
                const remainingSec = Math.ceil(data.remainingMs / 1000);
                this.gameManager.updateTimerDisplay(remainingSec);
                logger.debug('Timer synced:', remainingSec, 'seconds remaining');
            }
        });

        // Rejoin banner button handlers (cleaned up via abortController on disconnect)
        const signal = this.abortController.signal;

        const rejoinBtn = this._getElement('rejoin-banner-btn');
        if (rejoinBtn) {
            rejoinBtn.addEventListener('click', () => this._handleRejoinClick(), { signal });
        }

        const dismissBtn = this._getElement('rejoin-dismiss-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => this._handleRejoinDismiss(), { signal });
        }

        // Reconnection overlay "Return to Menu" button
        const returnBtn = this._getElement('reconnection-return-btn');
        if (returnBtn) {
            returnBtn.addEventListener('click', () => {
                this._hideReconnectionOverlay();
                this.gameManager.stopTimer();
                this.gameManager.resetGameState();
                this.uiManager.showScreen('main-menu');
                this._showRejoinBanner();
            }, { signal });
        }
    }

    /**
     * Join game by PIN
     */
    joinGame(pin, playerName) {
        logger.debug('Joining game:', { pin, playerName });
        this.socket.emit('player-join', { pin, name: playerName });
    }

    /**
     * Request to change player name while in lobby
     * @param {string} newName - The new player name
     */
    changePlayerName(newName) {
        logger.debug('Requesting name change to:', newName);
        this.socket.emit('player-change-name', { newName });
    }

    /**
     * Update player lobby display with game information
     */
    updatePlayerLobbyDisplay(gamePin, players) {
        // Update game PIN display
        const lobbyPinDisplay = this._getElement('lobby-pin-display');
        if (lobbyPinDisplay && gamePin) {
            lobbyPinDisplay.textContent = gamePin;
        }

        // Update player count
        const lobbyPlayerCount = this._getElement('lobby-player-count');
        if (lobbyPlayerCount && players) {
            lobbyPlayerCount.textContent = players.length;
        }

        // Show the lobby info section
        const lobbyInfo = this._getElement('lobby-info');
        if (lobbyInfo) {
            show(lobbyInfo, 'visible-flex');
        }

        logger.debug('Updated player lobby display:', { gamePin, playerCount: players?.length });
    }

    /**
     * Update the "You're in!" message with the player name
     * @param {string} playerName - The name of the player who joined
     */
    updatePlayerWelcomeMessage(playerName) {
        const playerInfo = this._getElement('player-info');
        if (playerInfo && playerName && playerName !== 'Host') {
            // Store the player name for language updates
            this.currentPlayerName = playerName;

            // Remove the data-translate attribute to prevent automatic translation override
            playerInfo.removeAttribute('data-translate');

            // Use the already imported translation manager from the top of the file
            const translatedMessage = translationManager.getTranslationSync('you_are_in_name');
            if (translatedMessage && translatedMessage !== 'you_are_in_name') {
                // Replace {name} placeholder with actual player name
                playerInfo.textContent = translatedMessage.replace('{name}', playerName);
                logger.debug('Updated player welcome message:', { playerName, message: playerInfo.textContent });
            } else {
                // Fallback to basic message with name
                playerInfo.textContent = `You're in, ${playerName}!`;
                logger.debug('Used fallback player welcome message:', playerName);
            }
        }
    }

    /**
     * Show the name edit UI and hide display mode
     */
    showNameEditMode() {
        const displaySection = this._getElement('player-name-display');
        const editSection = this._getElement('player-name-edit');
        const editInput = this._getElement('edit-name-input');

        if (displaySection) hide(displaySection);
        if (editSection) show(editSection);

        // Pre-fill with current name and focus
        if (editInput && this.currentPlayerName) {
            editInput.value = this.currentPlayerName;
            editInput.focus();
            editInput.select();
        }
    }

    /**
     * Hide the name edit UI and show display mode
     */
    hideNameEditMode() {
        const displaySection = this._getElement('player-name-display');
        const editSection = this._getElement('player-name-edit');

        if (displaySection) show(displaySection);
        if (editSection) hide(editSection);
    }

    /**
     * Initialize language change listener for updating personalized messages
     */
    initializeLanguageListener() {
        // Listen for language change events to update personalized messages
        // Use AbortController signal for proper cleanup on disconnect
        document.addEventListener('languageChanged', () => {
            logger.debug('Language changed, updating personalized messages');

            // Update the player welcome message if we have a current player name
            if (this.currentPlayerName) {
                this.updatePlayerWelcomeMessage(this.currentPlayerName);
            }
        }, { signal: this.abortController.signal });
    }

    /**
     * Create game
     */
    createGame(quizData) {
        logger.debug('Creating game with quiz:', quizData?.quiz?.title);

        // Set quiz data in GameManager for results saving and analytics
        if (quizData?.quiz && this.gameManager) {
            this.gameManager.setQuizTitle(quizData.quiz.title);
            this.gameManager.setQuizData(quizData.quiz);
        }

        try {
            // Include migration data if host is coming from a previous game
            const previousPin = localStorage.getItem('quizix_migration_pin');
            const migrationToken = localStorage.getItem('quizix_migration_token');
            if (previousPin) {
                quizData.previousPin = previousPin;
                if (migrationToken) {
                    quizData.migrationToken = migrationToken;
                }
            }
            // Clear migration data after use
            localStorage.removeItem('quizix_migration_pin');
            localStorage.removeItem('quizix_migration_token');

            this.socket.emit('host-join', quizData);
        } catch (error) {
            logger.error('Error creating game:', error);
        }
    }

    /**
     * Start game
     */
    startGame() {
        logger.debug('Starting game');

        // Play game start sound
        if (this.soundManager?.isEnabled()) {
            this.soundManager.playGameStartSound();
        }

        // Mark game start time in GameManager for results saving
        this.gameManager?.markGameStartTime();

        try {
            this.socket.emit('start-game');
        } catch (error) {
            logger.error('Error starting game:', error);
        }
    }


    /**
     * Submit player answer
     */
    submitAnswer(answer) {
        this.socket.emit('submit-answer', {
            answer: answer,
            type: 'player-answer'
        });
    }

    /**
     * Request next question (manual advancement)
     */
    nextQuestion() {
        logger.debug('Requesting next question');
        this.socket.emit('next-question');
    }

    /**
     * Leave game
     */
    leaveGame() {
        this._clearReconnectionData();
        this.socket.emit('leave-game');
    }

    /**
     * Get socket connection status
     */
    isConnected() {
        return this.socket.connected;
    }

    /**
     * Reconnect to server
     */
    reconnect() {
        this.socket.connect();
    }

    /**
     * Read and validate reconnection data from localStorage.
     * Returns parsed data if valid and unexpired, or null otherwise.
     * @returns {{ pin: string, playerName: string, sessionToken: string, savedAt: number } | null}
     */
    _getValidReconnectData() {
        try {
            const raw = localStorage.getItem(RECONNECT_KEY);
            if (!raw) return null;

            const data = JSON.parse(raw);
            if (!data.pin || !data.sessionToken) return null;

            // Check expiry against server grace period
            if (data.savedAt && (Date.now() - data.savedAt) > TIMING.RECONNECT_GRACE_MS) {
                logger.info('Reconnect data expired, clearing');
                this._clearReconnectionData();
                return null;
            }

            return data;
        } catch (e) {
            logger.warn('Failed to read reconnection data:', e);
            this._clearReconnectionData();
            return null;
        }
    }

    /**
     * Attempt to rejoin a game using stored session token.
     * Reconnects socket first if disconnected.
     */
    _attemptRejoin() {
        const data = this._getValidReconnectData();
        if (!data) return;

        logger.info('Attempting rejoin with session token:', { pin: data.pin });

        // Set a 10-second timeout for the rejoin attempt
        const rejoinTimeout = setTimeout(() => {
            logger.warn('Rejoin attempt timed out after 10 seconds');
            this._hideReconnectionOverlay();
            this.gameManager.stopTimer();
            this.gameManager.resetGameState();
            this.uiManager.showScreen('main-menu');
            this._showRejoinBanner();

            if (window.toastNotifications) {
                const msg = translationManager.getTranslationSync('rejoin_timeout')
                    || 'Could not reconnect — game may have ended';
                window.toastNotifications.show(msg, 'warning', 4000);
            }
        }, 10000);

        // Clear timeout when we get a response (success or failure)
        const clearRejoinTimeout = () => clearTimeout(rejoinTimeout);
        this.socket.once('rejoin-success', clearRejoinTimeout);
        this.socket.once('rejoin-failed', clearRejoinTimeout);

        const emitRejoin = () => {
            this.socket.emit('player-rejoin', {
                pin: data.pin,
                sessionToken: data.sessionToken
            });
        };

        if (!this.socket.connected) {
            this.socket.connect();
            this.socket.once('connect', emitRejoin);
        } else {
            emitRejoin();
        }
    }

    /**
     * Clear stored reconnection data from localStorage
     */
    _clearReconnectionData() {
        try {
            localStorage.removeItem(RECONNECT_KEY);
        } catch (e) {
            logger.warn('Failed to clear reconnection data:', e);
        }
    }

    /**
     * Show the reconnection overlay with game context info
     */
    _showReconnectionOverlay() {
        const overlay = this._getElement('reconnection-overlay');
        if (!overlay) return;
        show(overlay);

        // Populate context from stored reconnection data
        const contextEl = this._getElement('reconnection-context');
        if (contextEl) {
            const data = this._getValidReconnectData();
            if (data) {
                const pinLabel = translationManager.getTranslationSync('rejoin_game_pin_label') || 'PIN:';
                contextEl.textContent = `${pinLabel} ${data.pin} — ${data.playerName}`;
            }
        }

        // Show "Return to Menu" button after a delay (give auto-reconnect a chance first)
        const returnBtn = this._getElement('reconnection-return-btn');
        if (returnBtn) {
            hide(returnBtn);
            this._reconnectionReturnTimeout = setTimeout(() => {
                show(returnBtn);
            }, 5000);
        }
    }

    /**
     * Hide the reconnection overlay and clean up timers
     */
    _hideReconnectionOverlay() {
        const overlay = this._getElement('reconnection-overlay');
        if (overlay) hide(overlay);

        // Clear the delayed "Return to Menu" timeout
        if (this._reconnectionReturnTimeout) {
            clearTimeout(this._reconnectionReturnTimeout);
            this._reconnectionReturnTimeout = null;
        }

        // Re-hide the return button for next time
        const returnBtn = this._getElement('reconnection-return-btn');
        if (returnBtn) hide(returnBtn);

        // Clear context text
        const contextEl = this._getElement('reconnection-context');
        if (contextEl) {
            contextEl.textContent = '';
        }
    }

    // ==================== REJOIN BANNER ====================

    /**
     * Show the rejoin banner on the main menu if valid reconnection data exists
     */
    _showRejoinBanner() {
        const banner = this._getElement('rejoin-game-banner');
        if (!banner) return;

        const data = this._getValidReconnectData();
        if (!data) return;

        // Populate banner with game info (textContent = XSS-safe)
        const pinEl = this._getElement('rejoin-banner-pin');
        const nameEl = this._getElement('rejoin-banner-name');
        if (pinEl) pinEl.textContent = data.pin;
        if (nameEl) nameEl.textContent = data.playerName;

        show(banner);
        logger.info('Rejoin banner shown', { pin: data.pin, playerName: data.playerName });
    }

    /**
     * Hide the rejoin banner
     */
    _hideRejoinBanner() {
        const banner = this._getElement('rejoin-game-banner');
        if (banner) hide(banner);
    }

    /**
     * Handle click on the "Rejoin" button in the banner
     */
    _handleRejoinClick() {
        const data = this._getValidReconnectData();
        if (!data) {
            this._clearReconnectionData();
            this._hideRejoinBanner();
            const msg = translationManager.getTranslationSync('rejoin_expired') || 'Session expired — please join a new game';
            if (window.toastNotifications) {
                window.toastNotifications.show(msg, 'warning', 3000);
            }
            return;
        }

        this._hideRejoinBanner();
        this._attemptRejoin();
        logger.info('Manual rejoin attempted', { pin: data.pin });
    }

    /**
     * Handle click on the "Dismiss" button in the banner
     */
    _handleRejoinDismiss() {
        this._clearReconnectionData();
        this._hideRejoinBanner();
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        // Clean up event listeners
        this.abortController.abort();

        // Clean up pending reconnection timer
        this._hideReconnectionOverlay();

        // Clean up game state when intentionally disconnecting
        if (this.gameManager) {
            this.gameManager.cleanup();
        }

        this.socket.disconnect();
    }
}