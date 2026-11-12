/**
 * @jest-environment jsdom
 *
 * The AI preview card builds innerHTML from question fields. The badges must
 * escape the type and difficulty labels and coerce the time limit.
 */

import { buildQuestionCardHtml } from '../../public/js/ai/generator-templates.js';

describe('buildQuestionCardHtml escaping', () => {
    test('hostile type, difficulty and timeLimit do not create elements', () => {
        const html = buildQuestionCardHtml({
            type: '<img src=x onerror=alert(1)>',
            difficulty: '<b id="d">hard</b>',
            timeLimit: '<i id="t"></i>',
            question: 'Q'
        }, 0, '');
        const host = document.createElement('div');
        host.innerHTML = html;

        expect(host.querySelector('img')).toBeNull();
        expect(host.querySelector('#d')).toBeNull();
        expect(host.querySelector('#t')).toBeNull();
        expect(host.querySelector('.ai-time-badge').textContent).toContain('30s');
    });

    test('normal values still render', () => {
        const host = document.createElement('div');
        host.innerHTML = buildQuestionCardHtml({ type: 'multiple-choice', difficulty: 'easy', timeLimit: 45, question: 'Q' }, 0, '');

        expect(host.querySelector('.ai-time-badge').textContent).toContain('45s');
        expect(host.querySelector('.ai-type-badge').textContent.length).toBeGreaterThan(0);
    });
});
