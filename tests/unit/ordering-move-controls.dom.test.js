/**
 * @jest-environment jsdom
 *
 * Player ordering reorder mechanics (OrderingDragDrop).
 *
 * Three defects are covered:
 *   - swapItems() renumbered from a stale snapshot, so after one reorder the
 *     visible 1..N badges and data-order-index disagreed with DOM order and
 *     the next drag resolved to the wrong element,
 *   - a phone had no way to reorder except a touch-drag that preventDefault()ed
 *     every touchmove, so a list taller than the viewport could not be scrolled,
 *   - there was no non-drag fallback at all.
 */

import { OrderingDragDrop } from '../../public/js/utils/ordering-drag-drop.js';

/**
 * jsdom implements no matchMedia; stub the one query isPhone() asks for.
 * @param {'coarse'|'fine'} pointer - primary pointer type
 */
function setPointer(pointer) {
    window.innerWidth = pointer === 'coarse' ? 390 : 1280;
    window.matchMedia = (query) => ({
        media: query,
        matches: query === '(pointer: coarse) and (max-width: 768px)' && pointer === 'coarse'
    });
}

function buildOrderingDom(count = 4) {
    let html = '<div class="ordering-display" id="player-ordering-container">';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="ordering-display-item" data-original-index="${i}" data-order-index="${i}">
                <div class="ordering-item-number">${i + 1}</div>
                <div class="ordering-item-content">Item ${i}</div>
                <div class="ordering-move-controls">
                    <button type="button" class="ordering-move-btn" data-move="up"></button>
                    <button type="button" class="ordering-move-btn" data-move="down"></button>
                </div>
            </div>`;
    }
    html += '</div>';
    document.body.innerHTML = html;
    return document.getElementById('player-ordering-container');
}

const domOrder = () => Array.from(document.querySelectorAll('.ordering-display-item'))
    .map(item => Number(item.dataset.originalIndex));

const badges = () => Array.from(document.querySelectorAll('.ordering-item-number'))
    .map(el => el.textContent);

const orderIndices = () => Array.from(document.querySelectorAll('.ordering-display-item'))
    .map(item => item.dataset.orderIndex);

const moveBtn = (position, direction) =>
    document.querySelectorAll('.ordering-display-item')[position]
        .querySelector(`.ordering-move-btn[data-move="${direction}"]`);

describe('OrderingDragDrop — position bookkeeping', () => {
    beforeEach(() => setPointer('fine'));

    test('renumbers from DOM order after a swap, not from the pre-move snapshot', () => {
        const container = buildOrderingDom(4);
        const dnd = new OrderingDragDrop(container);

        dnd.swapItems(0, 2); // move the first item below the third

        expect(domOrder()).toEqual([1, 2, 0, 3]);
        expect(badges()).toEqual(['1', '2', '3', '4']);
        expect(orderIndices()).toEqual(['0', '1', '2', '3']);
    });

    test('a second swap acts on the element the indices claim', () => {
        const container = buildOrderingDom(4);
        const dnd = new OrderingDragDrop(container);

        dnd.swapItems(0, 2);  // -> 1,2,0,3
        dnd.swapItems(3, 0);  // move the last item to the top

        expect(domOrder()).toEqual([3, 1, 2, 0]);
        expect(badges()).toEqual(['1', '2', '3', '4']);
    });
});

describe('OrderingDragDrop — up/down controls', () => {
    beforeEach(() => setPointer('coarse'));

    test('down moves an item one position later and renumbers', () => {
        const container = buildOrderingDom(3);
        const changes = [];
        new OrderingDragDrop(container, { onOrderChange: (order) => changes.push(order) });

        moveBtn(0, 'down').click();

        expect(domOrder()).toEqual([1, 0, 2]);
        expect(badges()).toEqual(['1', '2', '3']);
        expect(changes).toHaveLength(1);
    });

    test('up moves an item one position earlier', () => {
        const container = buildOrderingDom(3);
        new OrderingDragDrop(container);

        moveBtn(2, 'up').click();

        expect(domOrder()).toEqual([0, 2, 1]);
    });

    test('the boundary controls are disabled and stay in sync after a move', () => {
        const container = buildOrderingDom(3);
        new OrderingDragDrop(container);

        expect(moveBtn(0, 'up').disabled).toBe(true);
        expect(moveBtn(0, 'down').disabled).toBe(false);
        expect(moveBtn(2, 'down').disabled).toBe(true);

        moveBtn(0, 'down').click();

        // the item that is now first must own the disabled up control
        expect(moveBtn(0, 'up').disabled).toBe(true);
        expect(moveBtn(1, 'up').disabled).toBe(false);
    });
});

describe('OrderingDragDrop — touch drag is off on phones', () => {
    test('a touch on an item does not start a drag when the pointer is coarse', () => {
        setPointer('coarse');
        const container = buildOrderingDom(3);
        new OrderingDragDrop(container);

        const item = document.querySelectorAll('.ordering-display-item')[0];
        const touchStart = new Event('touchstart', { bubbles: true, cancelable: true });
        touchStart.touches = [{ clientX: 10, clientY: 10 }];
        item.dispatchEvent(touchStart);

        expect(item.classList.contains('dragging')).toBe(false);
    });

    test('a coarse-pointer touchmove is not preventDefault()ed, so the list can scroll', () => {
        setPointer('coarse');
        const container = buildOrderingDom(3);
        new OrderingDragDrop(container);

        const item = document.querySelectorAll('.ordering-display-item')[0];
        const touchMove = new Event('touchmove', { bubbles: true, cancelable: true });
        touchMove.touches = [{ clientX: 10, clientY: 40 }];
        item.dispatchEvent(touchMove);

        expect(touchMove.defaultPrevented).toBe(false);
    });
});
