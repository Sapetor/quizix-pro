/**
 * @jest-environment jsdom
 *
 * Touch feedback in public/js/utils/mobile-enhancements.js.
 *
 * The tap ripple and the focused-mobile class were gated on this.isMobile,
 * which nothing set, so neither was ever applied. They are now gated on
 * isPhone() (dom.js: coarse primary pointer AND max-width 768px), evaluated
 * when the event fires.
 */

import '../../public/js/utils/mobile-enhancements.js';

const OPTIONS_HTML = `
    <div>
        <button class="btn">Join</button>
        <div class="player-option" tabindex="0">A</div>
    </div>
`;

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

function touchStart(element, clientX, clientY) {
    const event = new Event('touchstart', { bubbles: true });
    event.touches = [{ clientX, clientY }];
    element.dispatchEvent(event);
}

describe('MobileEnhancements touch feedback', () => {
    let button;
    let option;

    beforeEach(async () => {
        document.body.innerHTML = OPTIONS_HTML;
        // The module binds new elements from a MutationObserver callback.
        await Promise.resolve();
        button = document.querySelector('.btn');
        option = document.querySelector('.player-option');
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('a phone tap appends a ripple at the touch point', () => {
        setViewport(390, 'coarse');
        touchStart(button, 10, 12);

        const ripple = button.querySelector('.ripple-effect');
        expect(ripple).not.toBeNull();
        expect(ripple.style.left).toBe('10px');
        expect(ripple.style.top).toBe('12px');
    });

    test('the ripple is removed after its 600 ms animation', () => {
        jest.useFakeTimers();
        setViewport(390, 'coarse');
        touchStart(button, 10, 12);
        expect(button.querySelector('.ripple-effect')).not.toBeNull();

        jest.advanceTimersByTime(600);
        expect(button.querySelector('.ripple-effect')).toBeNull();
    });

    test.each([
        ['a narrow mouse-driven desktop', 683],
        ['a wide desktop', 1280]
    ])('%s gets no ripple and no focused-mobile class', (_label, width) => {
        setViewport(width, 'fine');
        button.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 12 }));
        button.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));

        expect(button.querySelector('.ripple-effect')).toBeNull();
        expect(button.classList.contains('focused-mobile')).toBe(false);
    });

    test('focus on a phone adds focused-mobile and blur removes it', () => {
        setViewport(390, 'coarse');
        button.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
        expect(button.classList.contains('focused-mobile')).toBe(true);

        button.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
        expect(button.classList.contains('focused-mobile')).toBe(false);
    });

    test('Enter on an option on a phone still clicks it and adds no unpositioned ripple', () => {
        // keydown is handled by a document-level listener, so currentTarget is
        // the document. The ripple code must not run against it.
        jest.useFakeTimers();
        setViewport(390, 'coarse');
        const onClick = jest.fn();
        option.addEventListener('click', onClick);

        option.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        jest.advanceTimersByTime(100);

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(option.querySelector('.ripple-effect')).toBeNull();
    });
});
