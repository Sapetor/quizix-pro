/**
 * @jest-environment jsdom
 *
 * Phone gate on the quiz editor (UIManager.showScreen).
 *
 * showScreen() is the single choke point that keeps a phone out of the editor;
 * everything else (host buttons, onboarding, the empty-state "create first
 * quiz" button, window.game.showScreen) funnels through it. The gate is
 * UX-level and keyed on isPhone() (dom.js — coarse primary pointer AND
 * max-width 768px), so a "Request desktop site" reload bypasses it.
 */

import { UIManager } from '../../public/js/ui/ui-manager.js';
import { dom } from '../../public/js/utils/dom.js';

function buildScreens() {
    dom.clearCache();
    document.body.innerHTML = `
        <div id="main-menu" class="screen active"></div>
        <div id="host-screen" class="screen"></div>
        <div id="game-lobby" class="screen"></div>
        <div id="join-screen" class="screen"></div>
    `;
}

/**
 * jsdom implements no matchMedia, so stub the one query isPhone() asks for.
 * @param {number} width - viewport width in CSS px
 * @param {'coarse'|'fine'} pointer - primary pointer type
 */
function setViewport(width, pointer) {
    window.innerWidth = width;
    window.matchMedia = (query) => ({
        media: query,
        matches: query === '(pointer: coarse) and (max-width: 768px)'
            ? (pointer === 'coarse' && width <= 768)
            : false
    });
}

const isActive = (id) => document.getElementById(id).classList.contains('active');

describe('UIManager.showScreen — phone gate on the editor', () => {
    let ui;

    beforeEach(() => {
        jest.useFakeTimers();
        buildScreens();
        setViewport(1280, 'fine');
        ui = new UIManager();
        // showHostScreen() is async and pulls in translations + editor layout;
        // stub it with the one side effect the assertions care about.
        ui.showHostScreen = (targetScreen) => targetScreen.classList.add('active');
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test('a phone asking for host-screen lands on the join screen', () => {
        setViewport(390, 'coarse');
        ui.showScreen('host-screen');

        expect(isActive('join-screen')).toBe(true);
        expect(isActive('host-screen')).toBe(false);
        expect(ui.currentScreen).toBe('join-screen');
    });

    test('a desktop viewport reaches the host screen', () => {
        ui.showScreen('host-screen');

        expect(isActive('host-screen')).toBe(true);
        expect(isActive('join-screen')).toBe(false);
    });

    test('a narrow mouse-driven desktop still reaches the host screen', () => {
        // 1366px at 200% zoom, or a half-snapped 1280px window: width alone
        // says "phone", the pointer says otherwise. GOTCHAS #5.
        setViewport(683, 'fine');
        ui.showScreen('host-screen');

        expect(isActive('host-screen')).toBe(true);
        expect(isActive('join-screen')).toBe(false);
    });

    test('the lobby is not gated — it is entered by server push, not a gesture', () => {
        setViewport(390, 'coarse');
        ui.showScreen('game-lobby');

        expect(isActive('game-lobby')).toBe(true);
        expect(isActive('join-screen')).toBe(false);
        expect(ui.currentScreen).toBe('game-lobby');
    });
});
