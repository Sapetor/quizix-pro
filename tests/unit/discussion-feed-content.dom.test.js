/**
 * @jest-environment jsdom
 *
 * The server broadcasts discussion messages in the shape built by
 * Game.addDiscussionMessage: { id, playerId, playerName, type, content,
 * targetPlayer, timestamp }. For a quick response `type` is always 'quick' and
 * the response kind is in `content`; for chat the text is in `content`.
 * The feed used to read `data.type` and `data.text`, so it showed the word
 * "quick" for every quick response and an empty body for every chat message.
 */

import { DiscussionManager } from '../../public/js/game/modules/discussion-manager.js';

describe('DiscussionManager feed content', () => {
    let manager;
    let feed;

    beforeEach(() => {
        document.body.innerHTML = '<div id="discussion-feed"></div>';
        feed = document.getElementById('discussion-feed');
        const stateManager = { getGameState: () => ({ isHost: false }) };
        manager = new DiscussionManager(stateManager, { socket: { emit: jest.fn() } });
        manager.initialize(true);
    });

    const serverMessage = (type, content, targetPlayer = null) => ({
        id: '1700000000000',
        playerId: 'socket-1',
        playerName: 'Ana',
        type,
        content,
        targetPlayer,
        timestamp: 1700000000000
    });

    test('a quick response renders its own label, not the word "quick"', () => {
        manager.handleQuickResponse(serverMessage('quick', 'agree'));

        const content = feed.querySelector('.quick-response-content').textContent;
        // Untranslated in the test environment: the label key is returned as is.
        expect(content).toContain('i_agree');
        expect(content).toContain('👍');
        expect(content).not.toContain('quick');
    });

    test('each quick response kind renders a different label', () => {
        ['propose', 'agree', 'unsure', 'discuss', 'ready'].forEach(kind => {
            manager.handleQuickResponse(serverMessage('quick', kind));
        });

        const labels = [...feed.querySelectorAll('.quick-response-content')].map(el => el.textContent);
        expect(new Set(labels).size).toBe(5);
    });

    test('a chat message renders its text', () => {
        manager.handleChatMessage(serverMessage('chat', 'I think it is B'));

        expect(feed.querySelector('.message-text').textContent).toBe('I think it is B');
        expect(feed.textContent).toContain('Ana');
    });
});
