/**
 * @jest-environment jsdom
 *
 * Editor round-trip fidelity: a question written into the editor by
 * populateQuestion and read back by extractData must carry the same meaning.
 *
 * Three silent data-loss defects are covered:
 *   - the JS question template (question-utils.js) shipped no `.tf-poll`
 *     checkbox, so after populateQuizBuilder rebuilt the DOM a poll question
 *     extracted as a graded true/false with correctAnswer:true,
 *   - ordering populateQuestion ignored data.correctOrder while extractData
 *     regenerated it as the identity permutation, flattening the answer key of
 *     AI-generated and imported ordering questions,
 *   - every editor option list is 4 rows wide and populateQuestion wrote only
 *     into the existing rows, so options 5+ were dropped on load and lost on
 *     the next save.
 */

import { QuestionUtils } from '../../public/js/utils/question-utils.js';
import QuestionTypeRegistry from '../../public/js/utils/question-type-registry.js';

const questionUtils = new QuestionUtils();

function buildQuestionElement() {
    const element = document.createElement('div');
    element.className = 'question-item';
    element.innerHTML = questionUtils.generateQuestionHTML(0);
    document.body.appendChild(element);
    return element;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('true/false poll mode', () => {
    test('the JS question template contains the poll checkbox', () => {
        const element = buildQuestionElement();
        expect(element.querySelector('.true-false-options .tf-poll')).not.toBeNull();
    });

    test('isPoll survives a populate/extract round trip', () => {
        const element = buildQuestionElement();

        QuestionTypeRegistry.populateQuestion('true-false', element, {
            isPoll: true,
            correctAnswer: null
        });
        const data = QuestionTypeRegistry.extractData('true-false', element);

        expect(data.isPoll).toBe(true);
        expect(data.correctAnswer).toBeNull();
    });

    test('a graded true/false still extracts its correct answer', () => {
        const element = buildQuestionElement();

        QuestionTypeRegistry.populateQuestion('true-false', element, {
            isPoll: false,
            correctAnswer: false
        });
        const data = QuestionTypeRegistry.extractData('true-false', element);

        expect(data.isPoll).toBe(false);
        expect(data.correctAnswer).toBe(false);
    });
});

describe('ordering answer key', () => {
    /** The item sequence a (options, correctOrder) pair actually encodes. */
    const correctSequence = (data) => data.correctOrder.map(index => data.options[index]);

    test('a real correctOrder permutation survives a round trip', () => {
        const element = buildQuestionElement();
        const input = {
            options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
            correctOrder: [2, 0, 3, 1]
        };

        QuestionTypeRegistry.populateQuestion('ordering', element, input);
        const data = QuestionTypeRegistry.extractData('ordering', element);

        expect(correctSequence(data)).toEqual(correctSequence(input));
    });

    test('a malformed correctOrder falls back to the given option order', () => {
        const element = buildQuestionElement();

        QuestionTypeRegistry.populateQuestion('ordering', element, {
            options: ['One', 'Two', 'Three'],
            correctOrder: [0, 0, 9]
        });
        const data = QuestionTypeRegistry.extractData('ordering', element);

        expect(data.options).toEqual(['One', 'Two', 'Three']);
        expect(data.correctOrder).toEqual([0, 1, 2]);
    });

    test('a missing correctOrder falls back to the given option order', () => {
        const element = buildQuestionElement();

        QuestionTypeRegistry.populateQuestion('ordering', element, {
            options: ['One', 'Two', 'Three']
        });
        const data = QuestionTypeRegistry.extractData('ordering', element);

        expect(data.options).toEqual(['One', 'Two', 'Three']);
    });
});

describe('option lists longer than the four shipped rows', () => {
    test('multiple-choice keeps a fifth option and its correct index', () => {
        const element = buildQuestionElement();
        const options = ['A', 'B', 'C', 'D', 'E'];

        QuestionTypeRegistry.populateQuestion('multiple-choice', element, {
            options,
            correctIndex: 4
        });
        const data = QuestionTypeRegistry.extractData('multiple-choice', element);

        expect(data.options).toEqual(options);
        expect(data.correctIndex).toBe(4);
    });

    test('multiple-correct keeps six options and the correct indices', () => {
        const element = buildQuestionElement();
        const options = ['A', 'B', 'C', 'D', 'E', 'F'];

        QuestionTypeRegistry.populateQuestion('multiple-correct', element, {
            options,
            correctIndices: [4, 5]
        });
        const data = QuestionTypeRegistry.extractData('multiple-correct', element);

        expect(data.options).toEqual(options);
        expect(data.correctIndices).toEqual([4, 5]);
    });

    test('ordering keeps six items in order', () => {
        const element = buildQuestionElement();
        const options = ['1', '2', '3', '4', '5', '6'];

        QuestionTypeRegistry.populateQuestion('ordering', element, {
            options,
            correctOrder: [0, 1, 2, 3, 4, 5]
        });
        const data = QuestionTypeRegistry.extractData('ordering', element);

        expect(data.options).toEqual(options);
        expect(data.correctOrder).toEqual([0, 1, 2, 3, 4, 5]);
    });
});
