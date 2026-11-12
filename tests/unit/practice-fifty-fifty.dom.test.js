/**
 * @jest-environment jsdom
 */
import { LocalGameSession } from '../../public/js/practice/local-game-session.js';

describe('practice 50-50 with correctIndex-only questions', () => {
    test('never hides the option named by correctIndex', () => {
        const session = Object.create(LocalGameSession.prototype);
        const q = { type: 'multiple-choice', options: ['a', 'b', 'c', 'd'], correctIndex: 2 };
        for (let n = 0; n < 50; n++) {
            const hidden = session.calculateHiddenOptions(q);
            expect(hidden).toHaveLength(2);
            expect(hidden).not.toContain(2);
        }
    });
});
