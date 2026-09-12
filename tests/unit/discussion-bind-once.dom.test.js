/**
 * @jest-environment jsdom
 *
 * DiscussionManager.initialize() runs once per game, but the chat controls it
 * binds are static markup in index.html. Before the bind-once guard, a second
 * game re-attached every handler, so one click emitted the message twice.
 */

import { DiscussionManager } from '../../public/js/game/modules/discussion-manager.js';

describe('DiscussionManager listener binding', () => {
    let socket;
    let manager;

    beforeEach(() => {
        document.body.innerHTML = `
            <button class="quick-response-btn" data-type="agree"></button>
            <div id="chat-input-container" class="hidden">
                <input type="text" id="chat-input">
                <button id="send-chat-btn"></button>
            </div>
            <div id="discussion-feed"></div>
        `;
        socket = { emit: jest.fn() };
        manager = new DiscussionManager({}, { socket });
    });

    test('re-initializing does not double-emit quick responses', () => {
        manager.initialize(false);
        manager.initialize(false);

        document.querySelector('.quick-response-btn').click();

        const quickEmits = socket.emit.mock.calls.filter(c => c[0] === 'send-quick-response');
        expect(quickEmits).toHaveLength(1);
    });

    test('the global handle is restored after cleanup + re-initialize', () => {
        manager.initialize(true);
        manager.cleanup();
        expect(window.discussionManager).toBeUndefined();

        manager.initialize(true);
        expect(window.discussionManager).toBe(manager);
    });
});
