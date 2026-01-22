/**
 * UI Manager Module
 * Handles all user interface operations, screen management, and visual updates
 */

import { translationManager } from '../utils/translation-manager.js';
import { TIMING, logger } from '../core/config.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';
import { uiStateManager } from '../utils/ui-state-manager.js';
import { APIHelper } from '../utils/api-helper.js';
import { initializeAutoHideToolbar, disableAutoHideToolbar, isAutoHideToolbarActive } from '../utils/auto-hide-toolbar-manager.js';
import { updateMobileReturnButtonVisibility } from '../utils/globals.js';
import { escapeHtml } from '../utils/dom.js';

export class UIManager {
    constructor() {
        this.currentScreen = 'main-menu';
        this.errorHandler = errorHandler; // Add ErrorHandler for future use
    }

    showScreen(screenId) {
        logger.debug('Switching to screen:', screenId);

        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show target screen
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;
            logger.debug('Successfully switched to screen:', screenId);

            // Update mobile return button visibility
            updateMobileReturnButtonVisibility(screenId);

            // Container layout handled automatically

            // Show/hide header elements based on screen
            const headerStartBtn = document.getElementById('start-hosting-header-small');
            const horizontalToolbar = document.getElementById('horizontal-toolbar');
            const header = document.querySelector('header');

            if (screenId === 'host-screen') {
                // Show toolbar and start button for host screen
                if (headerStartBtn) headerStartBtn.style.display = 'block';
                if (horizontalToolbar) horizontalToolbar.style.display = 'flex';

                // Translate toolbar tooltips after making it visible
                setTimeout(() => {
                    if (horizontalToolbar) {
                        translationManager.translateContainer(horizontalToolbar);
                    }
                    // Also translate header controls that become visible
                    const header = document.querySelector('header');
                    if (header) {
                        translationManager.translateContainer(header);
                    }
                }, 50);

                // Remove any transition classes when returning to host screen
                const container = document.querySelector('.container');
                if (container) {
                    container.classList.remove('game-state-transition-host');
                }

                // Set editing state for quiz creation
                uiStateManager.setState('editing');

                // Initialize first question if questions container is empty
                this.initializeQuizEditor();
            } else if (screenId === 'game-lobby') {
                // Hide editing toolbar on lobby screen, but enable header auto-hide
                if (headerStartBtn) headerStartBtn.style.display = 'none';
                if (horizontalToolbar) horizontalToolbar.style.display = 'none';

                // Initialize auto-hide functionality for HEADER on lobby screen
                setTimeout(() => {
                    if (!isAutoHideToolbarActive()) {
                        initializeAutoHideToolbar();
                    }
                }, 100); // Small delay to ensure DOM is ready
            } else {
                // Hide toolbar and start button for other screens
                if (headerStartBtn) headerStartBtn.style.display = 'none';
                if (horizontalToolbar) horizontalToolbar.style.display = 'none';

                // Disable auto-hide when leaving lobby/host screens
                if (isAutoHideToolbarActive()) {
                    disableAutoHideToolbar();
                } else {
                    // Remove transition classes for non-game screens
                    if (!['host-game-screen', 'player-game-screen'].includes(screenId)) {
                        const container = document.querySelector('.container');
                        if (container) {
                            container.classList.remove('game-state-transition-host');
                        }
                    }
                }
            }

            // Set appropriate game state based on screen
            switch (screenId) {
                case 'main-menu':
                    uiStateManager.setState('lobby');
                    // Force retranslation of main menu to ensure Quick Start Guide is translated
                    setTimeout(() => {
                        const mainMenuScreen = document.getElementById('main-menu');
                        if (mainMenuScreen) {
                            translationManager.translateContainer(mainMenuScreen);
                            logger.debug('🔄 Force translated main menu screen');
                        }
                    }, 50);
                    break;
                case 'host-lobby':
                case 'player-lobby':
                    uiStateManager.setState('lobby');
                    break;
                case 'host-game-screen':
                    // Apply game-transition class to mimic game-state-playing appearance
                    // without conflicts with actual playing state
                    const container = document.querySelector('.container');
                    if (container) {
                        container.classList.add('game-state-transition-host');
                    }
                    break;
                case 'player-game-screen':
                    // Player game screen gets standard treatment
                    if (header) {
                        header.style.transform = 'translateY(-100%)';
                        header.style.opacity = '0';
                        header.style.pointerEvents = 'none';
                        header.style.transition = 'all 0.3s ease-in-out';
                    }

                    setTimeout(() => {
                        if (header && this.currentScreen === 'player-game-screen') {
                            header.style.position = 'absolute';
                            header.style.top = '-100px';
                            header.style.zIndex = '-1';
                        }
                    }, 300);
                    break;
                case 'player-final-screen':
                case 'leaderboard-screen':
                    // Restore header for final results screens to prevent blank gap
                    if (header) {
                        header.style.transform = '';
                        header.style.opacity = '';
                        header.style.pointerEvents = '';
                        header.style.position = '';
                        header.style.top = '';
                        header.style.zIndex = '';
                        header.style.transition = 'all 0.3s ease-in-out';
                    }
                    break;
                case 'game-browser':
                case 'join-screen':
                    uiStateManager.setState('lobby');
                    break;
                default:
                    // Default to lobby state for other screens
                    if (screenId !== 'host-screen') {
                        uiStateManager.setState('lobby');
                    }
                    break;
            }

            // Translate the new screen
            setTimeout(() => {
                translationManager.translatePage();
            }, TIMING.DOM_UPDATE_DELAY);
        } else {
            logger.error('Screen not found:', screenId);
            // List available screens for debugging
            const availableScreens = Array.from(document.querySelectorAll('.screen')).map(s => s.id);
            logger.debug('Available screens:', availableScreens);
        }
    }

    /**
     * Initialize quiz editor with first question if empty
     */
    initializeQuizEditor() {
        const questionsContainer = document.getElementById('questions-container');
        if (questionsContainer && questionsContainer.children.length === 0) {
            // Add first question only if container is empty
            if (window.game && window.game.addQuestion) {
                window.game.addQuestion();
                logger.debug('Initialized quiz editor with first question');

                // Ensure remove button visibility is properly set for initial question
                setTimeout(() => {
                    if (window.game.quizManager && window.game.quizManager.updateQuestionsUI) {
                        logger.debug('Running updateQuestionsUI after initial question creation');
                        window.game.quizManager.updateQuestionsUI();
                    }
                }, 100);
            }
        }
    }

    updateGamePin(gamePin) {
        const pinElement = document.getElementById('game-pin');
        if (pinElement && gamePin) {
            const pinDigitsElement = pinElement.querySelector('.pin-digits');
            if (pinDigitsElement) {
                pinDigitsElement.textContent = gamePin;
            } else {
                // Fallback for old structure
                pinElement.textContent = gamePin;
            }
        }
    }

    updateQuizTitle(title) {
        const titleElement = document.getElementById('lobby-quiz-title');
        logger.debug('updateQuizTitle called with:', title);
        logger.debug('Title element found:', !!titleElement);
        if (titleElement && title) {
            // Remove translation attribute to prevent override
            titleElement.removeAttribute('data-translate');
            titleElement.textContent = title;
            logger.debug('Updated quiz title in lobby:', title);
            logger.debug('Title element text after update:', titleElement.textContent);
        } else {
            logger.warn('Failed to update quiz title - element or title missing');
        }
    }

    async loadQRCode(pin) {
        try {
            const data = await APIHelper.fetchAPIJSON(`api/qr/${pin}`);

            if (data.qrCode) {
                const qrImage = document.getElementById('qr-code-image');
                const qrLoading = document.querySelector('.qr-loading');
                const gameUrl = document.getElementById('game-url');

                if (qrImage) {
                    qrImage.src = data.qrCode;
                    qrImage.style.display = 'block';
                }
                if (qrLoading) qrLoading.style.display = 'none';
                if (gameUrl) gameUrl.textContent = data.gameUrl;
            }
        } catch (error) {
            logger.error('Failed to load QR code:', error);
            const qrLoading = document.querySelector('.qr-loading');
            if (qrLoading) {
                qrLoading.textContent = translationManager.getTranslationSync('failed_generate_qr_code');
            }
        }
    }

    // Game browser functionality
    async showGameBrowser() {
        this.showScreen('game-browser');
        await this.refreshActiveGames();
    }

    async refreshActiveGames() {
        const gamesContainer = document.getElementById('games-list');
        if (!gamesContainer) return;

        gamesContainer.innerHTML = `<div class="loading-games">${translationManager.getTranslationSync('loading_games')}</div>`;

        try {
            // Use API helper to ensure proper URL handling across different network configurations
            const data = await APIHelper.fetchAPIJSON('api/active-games');

            if (data.games && data.games.length > 0) {
                gamesContainer.innerHTML = '';
                data.games.forEach(game => this.createGameCard(game));
            } else {
                gamesContainer.innerHTML = `
                    <div class="no-games">
                        <div class="empty-state-illustration">
                            <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <!-- Game/Quiz cards stacked -->
                                <rect x="25" y="35" width="50" height="60" rx="6" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2" opacity="0.3"/>
                                <rect x="30" y="30" width="50" height="60" rx="6" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2" opacity="0.4"/>
                                <rect x="35" y="25" width="50" height="60" rx="6" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="2" opacity="0.5"/>
                                <!-- Question mark on top card -->
                                <text x="60" y="62" text-anchor="middle" font-size="28" font-weight="bold" fill="currentColor" opacity="0.6">?</text>
                                <!-- Magnifying glass searching -->
                                <circle cx="85" cy="80" r="16" fill="none" stroke="currentColor" stroke-width="3" opacity="0.7"/>
                                <line x1="96" y1="91" x2="108" y2="103" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
                                <!-- Empty indicator dots -->
                                <circle cx="50" cy="105" r="3" fill="currentColor" opacity="0.3"/>
                                <circle cx="60" cy="105" r="3" fill="currentColor" opacity="0.3"/>
                                <circle cx="70" cy="105" r="3" fill="currentColor" opacity="0.3"/>
                            </svg>
                        </div>
                        <h3>${translationManager.getTranslationSync('no_games_found')}</h3>
                        <p>${translationManager.getTranslationSync('ask_someone_host')}</p>
                    </div>
                `;
            }
        } catch (error) {
            logger.error('Failed to fetch active games:', error);

            // Show detailed error information for debugging
            const errorMessage = error.message || 'Unknown error';
            const isNetworkError = error.name === 'TypeError' && error.message.includes('fetch');

            gamesContainer.innerHTML = `
                <div class="no-games">
                    <div class="empty-state-illustration">
                        <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <!-- Cloud with X mark for connection error -->
                            <path d="M85 65c8.284 0 15-6.716 15-15 0-7.18-5.044-13.178-11.786-14.647C87.412 25.726 79.18 18 69.167 18c-8.58 0-15.91 5.44-18.697 13.05C45.913 29.366 40.615 28 35 28c-13.807 0-25 11.193-25 25s11.193 25 25 25h50z" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="2.5" opacity="0.5"/>
                            <!-- X mark on cloud -->
                            <line x1="50" y1="40" x2="70" y2="60" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
                            <line x1="70" y1="40" x2="50" y2="60" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
                            <!-- Broken connection lines below -->
                            <line x1="35" y1="80" x2="45" y2="90" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 4" opacity="0.4"/>
                            <line x1="60" y1="75" x2="60" y2="95" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 4" opacity="0.4"/>
                            <line x1="85" y1="80" x2="75" y2="90" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 4" opacity="0.4"/>
                            <!-- Warning triangle -->
                            <path d="M60 98l-8 14h16l-8-14z" fill="currentColor" opacity="0.6"/>
                            <text x="60" y="110" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor" opacity="0.3">!</text>
                        </svg>
                    </div>
                    <h3>${translationManager.getTranslationSync('failed_load_games')}</h3>
                    <p>${translationManager.getTranslationSync('check_connection')}</p>
                    <details style="margin-top: 10px; font-size: 0.8em; opacity: 0.7;">
                        <summary>Debug Info (tap to expand)</summary>
                        <p><strong>Error:</strong> ${errorMessage}</p>
                        <p><strong>Host:</strong> ${window.location.host}</p>
                        <p><strong>Network Error:</strong> ${isNetworkError ? 'Yes' : 'No'}</p>
                        <p><strong>Time:</strong> ${new Date().toLocaleTimeString()}</p>
                    </details>
                </div>
            `;
        }
    }

    createGameCard(game) {
        const gamesContainer = document.getElementById('games-list');
        const gameCard = document.createElement('div');
        gameCard.className = 'game-card';

        // Make the entire card clickable
        gameCard.style.cursor = 'pointer';
        gameCard.addEventListener('click', (e) => {
            // Prevent double-click if user clicks the button specifically
            e.preventDefault();
            window.game.joinGameByPin(game.pin);
        });

        gameCard.innerHTML = `
            <div class="game-title">${this.escapeHtml(game.title)}</div>
            <div class="game-info">
                <div class="game-detail">
                    <span class="game-detail-icon">🎯</span>
                    <span>PIN: <strong>${game.pin}</strong></span>
                </div>
                <div class="game-detail">
                    <span class="game-detail-icon">👥</span>
                    <span class="game-players-count">${game.playerCount}</span> ${translationManager.getTranslationSync('players')}
                </div>
                <div class="game-detail">
                    <span class="game-detail-icon">❓</span>
                    <span>${game.questionCount}</span> ${translationManager.getTranslationSync('questions')}
                </div>
                <div class="game-detail">
                    <span class="game-detail-icon">🟢</span>
                    <span class="game-status waiting">${translationManager.getTranslationSync('waiting_for_players') || 'Waiting'}</span>
                </div>
            </div>
            <div class="game-pin-display">${game.pin}</div>
        `;

        gamesContainer.appendChild(gameCard);
    }

    joinGameByPin(pin) {
        const pinInput = document.getElementById('game-pin-input');
        const nameInput = document.getElementById('player-name');

        if (pinInput) {
            pinInput.value = pin;
            this.showScreen('join-screen');

            // If player name is already entered, auto-join the game
            if (nameInput && nameInput.value.trim()) {
                logger.debug('Auto-joining game with existing player name');
                // Small delay to ensure screen transition completes
                setTimeout(() => {
                    window.game.joinGame();
                }, 100);
            }
        }
    }
}