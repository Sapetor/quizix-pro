/**
 * Discussion Manager Module
 * Handles discussion functionality for consensus mode:
 * - Quick responses (predefined messages)
 * - Free-form chat (when enabled)
 * - Discussion feed rendering
 */

import { logger } from '../../core/config.js';
import { escapeHtml } from '../../utils/dom.js';
import { getTranslation } from '../../utils/translation-manager.js';

const QUICK_RESPONSE_LABELS = {
    propose: 'i_think_its',
    agree: 'i_agree',
    unsure: 'not_sure',
    discuss: 'lets_discuss',
    ready: 'ready_to_lock'
};

export class DiscussionManager {
    /**
     * Create a DiscussionManager
     * @param {Object} stateManager - Game state manager
     * @param {Object} socketManager - Socket manager for sending messages
     */
    constructor(stateManager, socketManager) {
        this.stateManager = stateManager;
        this.socketManager = socketManager;
        this.enabled = false;
        this.allowChat = false;
        this.messages = [];

        // Cache DOM elements
        this._cachedElements = {};
    }

    /**
     * Initialize discussion for a game
     * @param {boolean} allowChat - Whether free-form chat is allowed
     */
    initialize(allowChat = false) {
        this.enabled = true;
        this.allowChat = allowChat;
        this.messages = [];

        this._bindEventListeners();
        this._showChatInput(allowChat);

        logger.debug('DiscussionManager initialized', { allowChat });
    }

    /**
     * Reset for new game
     */
    reset() {
        this.enabled = false;
        this.messages = [];
        this._clearDiscussionFeed();
    }

    /**
     * Reset for new question
     */
    resetForQuestion() {
        this.messages = [];
        this._clearDiscussionFeed();
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
     * Show or hide chat input based on settings
     * @param {boolean} show - Whether to show chat input
     */
    _showChatInput(show) {
        const chatContainer = this._getElement('chat-input-container');
        if (chatContainer) {
            chatContainer.classList.toggle('hidden', !show);
        }
    }

    /**
     * Send a quick response
     * @param {string} type - Quick response type
     * @param {string} targetPlayer - Optional target player for "agree" type
     */
    sendQuickResponse(type, targetPlayer = null) {
        if (!this.enabled) return;

        if (this.socketManager?.socket) {
            this.socketManager.socket.emit('send-quick-response', {
                type,
                targetPlayer
            });
        }

        logger.debug('Quick response sent', { type, targetPlayer });
    }

    /**
     * Send a chat message
     * @param {string} text - Message text
     */
    sendChatMessage(text) {
        if (!this.enabled || !this.allowChat) return;

        const trimmedText = text.trim();
        if (!trimmedText || trimmedText.length > 200) return;

        if (this.socketManager?.socket) {
            this.socketManager.socket.emit('send-chat-message', { text: trimmedText });
        }

        // Clear input
        const chatInput = this._getElement('chat-input');
        if (chatInput) {
            chatInput.value = '';
        }

        logger.debug('Chat message sent', { text: trimmedText });
    }

    /**
     * Handle quick response received from server
     * @param {Object} data - Quick response data
     */
    handleQuickResponse(data) {
        if (!this.enabled) return;

        const message = {
            id: data.id || Date.now().toString(),
            playerName: data.playerName,
            type: 'quick',
            content: data.type,
            targetPlayer: data.targetPlayer,
            timestamp: data.timestamp || Date.now()
        };

        this.messages.push(message);
        this._renderMessage(message);
        this._scrollToBottom();
    }

    /**
     * Handle chat message received from server
     * @param {Object} data - Chat message data
     */
    handleChatMessage(data) {
        if (!this.enabled) return;

        const message = {
            id: data.id || Date.now().toString(),
            playerName: data.playerName,
            type: 'chat',
            content: data.text,
            timestamp: data.timestamp || Date.now()
        };

        this.messages.push(message);
        this._renderMessage(message);
        this._scrollToBottom();
    }

    /**
     * Render a message to the discussion feed
     * @param {Object} message - Message object
     */
    _renderMessage(message) {
        const gameState = this.stateManager.getGameState();
        const feedId = gameState.isHost ? 'host-discussion-feed' : 'discussion-feed';
        const feed = this._getElement(feedId);

        if (!feed) return;

        const messageEl = document.createElement('div');
        messageEl.className = `discussion-message ${message.type}-message`;
        messageEl.dataset.messageId = message.id;

        const playerNameHtml = `<span class="message-player">${escapeHtml(message.playerName)}</span>`;
        let contentHtml;

        if (message.type === 'quick') {
            contentHtml = this._formatQuickResponse(message.content, message.targetPlayer);
        } else {
            contentHtml = `<span class="message-text">${escapeHtml(message.content)}</span>`;
        }

        messageEl.innerHTML = `${playerNameHtml}: ${contentHtml}`;
        feed.appendChild(messageEl);

        // Limit messages displayed (keep last 30)
        while (feed.children.length > 30) {
            feed.removeChild(feed.firstChild);
        }
    }

    /**
     * Format a quick response for display
     * @param {string} type - Quick response type
     * @param {string} targetPlayer - Optional target player
     * @returns {string} Formatted HTML
     */
    _formatQuickResponse(type, targetPlayer = null) {
        const labelKey = QUICK_RESPONSE_LABELS[type] || type;
        let label = getTranslation(labelKey) || type;

        // Handle special cases
        if (type === 'agree' && targetPlayer) {
            label = (getTranslation('i_agree_with') || 'I agree with {player}')
                .replace('{player}', escapeHtml(targetPlayer));
        }

        const iconMap = {
            propose: '💡',
            agree: '👍',
            unsure: '🤔',
            discuss: '💬',
            ready: '✅'
        };

        const icon = iconMap[type] || '💬';

        return `<span class="quick-response-content">${icon} ${label}</span>`;
    }

    /**
     * Clear the discussion feed
     */
    _clearDiscussionFeed() {
        const playerFeed = this._getElement('discussion-feed');
        const hostFeed = this._getElement('host-discussion-feed');

        if (playerFeed) playerFeed.innerHTML = '';
        if (hostFeed) hostFeed.innerHTML = '';
    }

    /**
     * Scroll discussion feed to bottom
     */
    _scrollToBottom() {
        const gameState = this.stateManager.getGameState();
        const feedId = gameState.isHost ? 'host-discussion-feed' : 'discussion-feed';
        const feed = this._getElement(feedId);

        if (feed) {
            feed.scrollTop = feed.scrollHeight;
        }
    }

    /**
     * Bind event listeners for discussion UI
     */
    _bindEventListeners() {
        // Quick response buttons
        const quickButtons = document.querySelectorAll('.quick-response-btn');
        quickButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = btn.dataset.type;
                if (type) {
                    this.sendQuickResponse(type);
                }
            });
        });

        // Chat input and send button
        const chatInput = this._getElement('chat-input');
        const sendBtn = this._getElement('send-chat-btn');

        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendChatMessage(chatInput.value);
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                if (chatInput) {
                    this.sendChatMessage(chatInput.value);
                }
            });
        }

        // Make manager accessible globally for onclick handlers
        window.discussionManager = this;
    }

    /**
     * Clean up
     */
    cleanup() {
        this.reset();
        if (window.discussionManager === this) {
            delete window.discussionManager;
        }
    }
}
