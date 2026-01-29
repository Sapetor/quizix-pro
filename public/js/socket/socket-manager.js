/**
 * Socket Manager Module
 * Handles all socket.io event listeners and socket communication
 */

import { translationManager } from '../utils/translation-manager.js';
import { unifiedErrorHandler as errorBoundary } from '../utils/unified-error-handler.js';
import { logger, UI } from '../core/config.js';
import { uiStateManager } from '../utils/ui-state-manager.js';

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
     * Initialize all socket event listeners
     */
    initializeSocketListeners() {
        // Connection events
        this.socket.on('connect', () => {
            logger.debug('Connected to server');
        });

        this.socket.on('disconnect', () => {
            logger.debug('Disconnected from server');
            // Stop active timers to prevent phantom timer updates while disconnected
            if (this.gameManager) {
                this.gameManager.stopTimer();
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

            this.uiManager.showScreen('game-lobby');
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

            // Set player info correctly - player is NOT a host
            logger.debug('PlayerJoined', { playerName: data.playerName, gamePin: data.gamePin });
            if (data.playerName && data.gamePin) {
                this.gameManager.setPlayerInfo(data.playerName, false);
                this.gameManager.setGamePin(data.gamePin);

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

            // Switch to playing state for immersive gameplay
            uiStateManager?.setState?.('playing');

            this.gameManager.displayQuestion(data);

            // Ensure timer has valid duration (convert seconds to ms)
            const timeLimit = data.timeLimit && !isNaN(data.timeLimit) ? data.timeLimit : UI.DEFAULT_TIMER_SECONDS;
            this.gameManager.startTimer(timeLimit * 1000);

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
                nextButton.style.display = 'block';
                nextButton.textContent = buttonText;
                this._resetButtonStyles(nextButton);
            }

            // Also show buttons in host-game-screen (for statistics phase)
            const statsControls = this._getElementBySelector('.stats-controls');
            const nextButtonStats = this._getElement('next-question-stats');
            if (statsControls && nextButtonStats) {
                statsControls.style.display = 'flex';
                nextButtonStats.style.display = 'block';
                nextButtonStats.textContent = buttonText;
            }
        });

        this.socket.on('hide-next-button', () => {
            logger.debug('Hiding next question button');

            // Hide button in leaderboard screen
            const nextButton = this._getElement('next-question');
            if (nextButton) {
                nextButton.style.display = 'none';
                nextButton.onclick = null;
            }

            // Hide buttons in host-game-screen
            const statsControls = this._getElementBySelector('.stats-controls');
            const nextButtonStats = this._getElement('next-question-stats');
            if (statsControls) statsControls.style.display = 'none';
            if (nextButtonStats) nextButtonStats.style.display = 'none';
        });

        this.socket.on('game-end', (data) => {
            logger.debug('Game ended - triggering final results:', data);

            // Switch to results state for leaderboard and celebration
            if (window.uiStateManager?.setState) {
                window.uiStateManager.setState('results');
            }

            // Hide manual advancement button
            const nextButton = this._getElement('next-question');
            if (nextButton) {
                nextButton.style.display = 'none';
                nextButton.onclick = null;
            }

            // Clear any remaining timers and show final results
            this.gameManager.stopTimer();
            this.gameManager.showFinalResults(data.finalLeaderboard);
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
            this.gameManager.showAnswerRejected(data.message || 'Answer could not be submitted');
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

        // Error handling
        this.socket.on('error', (data) => {
            logger.error('Socket error:', data);
            translationManager.showAlert('error', data.message || 'An error occurred');
        });

        this.socket.on('game-not-found', (data) => {
            logger.error('Game not found:', data);
            translationManager.showAlert('error', data.message || 'Game not found');
        });

        this.socket.on('player-limit-reached', (data) => {
            logger.error('Player limit reached:', data);
            translationManager.showAlert('error', data.message || 'Player limit reached');
        });

        this.socket.on('invalid-pin', (data) => {
            logger.error('Invalid PIN:', data);
            translationManager.showAlert('error', data.message || 'Invalid game PIN');
        });

        this.socket.on('name-taken', (data) => {
            logger.error('Name taken:', data);
            translationManager.showAlert('error', data.message || 'Name is already taken');
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

        // Special events
        this.socket.on('force-disconnect', (data) => {
            logger.debug('Force disconnect:', data);
            translationManager.showAlert('info', data.message || 'You have been disconnected');
            this.uiManager.showScreen('main-menu');
        });

        this.socket.on('reconnect', (attemptNumber) => {
            logger.debug('Reconnecting attempt:', attemptNumber);
        });

        this.socket.on('reconnect_error', (error) => {
            logger.error('Reconnection error:', error);
        });

        this.socket.on('reconnect_failed', () => {
            logger.error('Reconnection failed');
            translationManager.showAlert('error', 'Failed to reconnect to server');
        });
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
            lobbyInfo.style.display = 'flex';
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

        if (displaySection) displaySection.classList.add('hidden');
        if (editSection) editSection.classList.remove('hidden');

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

        if (displaySection) displaySection.classList.remove('hidden');
        if (editSection) editSection.classList.add('hidden');
    }

    /**
     * Initialize language change listener for updating personalized messages
     */
    initializeLanguageListener() {
        // Listen for language change events to update personalized messages
        // Use AbortController signal for proper cleanup on disconnect
        document.addEventListener('languageChanged', (_event) => {
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
     * Disconnect from server
     */
    disconnect() {
        // Clean up event listeners
        this.abortController.abort();

        // Clean up game state when intentionally disconnecting
        if (this.gameManager) {
            this.gameManager.cleanup();
        }

        this.socket.disconnect();
    }
}