/**
 * @jest-environment jsdom
 *
 * Verifies the event-bindings binder wires controls that were migrated off
 * inline HTML onclick/onchange attributes. Each assertion confirms a real
 * click/change on the element invokes the same delegate the inline attribute
 * used — either a window.game method (mocked) or the DOM side-effect the
 * handler produces.
 */

import { initEventBindings, EVENT_BINDINGS } from '../../public/js/core/event-bindings.js';
import { dom } from '../../public/js/utils/dom.js';

function fire(id, type) {
    const el = document.getElementById(id);
    const evt = new window.Event(type, { bubbles: true, cancelable: true });
    el.dispatchEvent(evt);
    return evt;
}

describe('event-bindings binder', () => {
    beforeEach(() => {
        dom.clearCache();
        document.body.innerHTML = `
            <a href="#" id="header-brand"></a>
            <button id="toolbar-settings"></button>
            <button id="toggle-preview"></button>
            <button id="scroll-to-question"></button>
            <div id="quiz-settings-modal"></div>
            <button id="settings-modal-close-btn"></button>
            <input type="checkbox" id="modal-consensus-mode">
            <div id="modal-consensus-settings" class="hidden"></div>
            <input type="checkbox" id="modal-use-global-time">
            <div id="modal-global-time-container" class="hidden"></div>
        `;
        window.game = {
            resetAndReturnToMenu: jest.fn(),
            previewManager: {
                togglePreviewMode: jest.fn(),
                scrollToCurrentQuestion: jest.fn()
            }
        };
        initEventBindings();
    });

    afterEach(() => {
        delete window.game;
    });

    test('binding table is non-empty and has unique element ids', () => {
        const ids = EVENT_BINDINGS.map(([id]) => id);
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('header brand click returns to main and prevents default navigation', () => {
        const evt = fire('header-brand', 'click');
        expect(window.game.resetAndReturnToMenu).toHaveBeenCalledTimes(1);
        expect(evt.defaultPrevented).toBe(true);
    });

    test('toggle-preview click delegates to previewManager.togglePreviewMode', () => {
        fire('toggle-preview', 'click');
        expect(window.game.previewManager.togglePreviewMode).toHaveBeenCalledTimes(1);
    });

    test('scroll-to-question click delegates to previewManager.scrollToCurrentQuestion', () => {
        fire('scroll-to-question', 'click');
        expect(window.game.previewManager.scrollToCurrentQuestion).toHaveBeenCalledTimes(1);
    });

    test('toolbar-settings click opens the quiz settings modal', () => {
        fire('toolbar-settings', 'click');
        expect(document.getElementById('quiz-settings-modal').classList.contains('visible')).toBe(true);
    });

    test('settings-modal-close click closes the quiz settings modal', () => {
        document.getElementById('quiz-settings-modal').classList.add('visible');
        fire('settings-modal-close-btn', 'click');
        expect(document.getElementById('quiz-settings-modal').classList.contains('visible')).toBe(false);
    });

    test('consensus-mode change toggles the consensus settings visibility', () => {
        const checkbox = document.getElementById('modal-consensus-mode');
        const settings = document.getElementById('modal-consensus-settings');
        checkbox.checked = true;
        fire('modal-consensus-mode', 'change');
        expect(settings.classList.contains('hidden')).toBe(false);

        checkbox.checked = false;
        fire('modal-consensus-mode', 'change');
        expect(settings.classList.contains('hidden')).toBe(true);
    });

    test('global-time change reveals the global time container', () => {
        const checkbox = document.getElementById('modal-use-global-time');
        checkbox.checked = true;
        fire('modal-use-global-time', 'change');
        expect(document.getElementById('modal-global-time-container').classList.contains('hidden')).toBe(false);
    });
});
