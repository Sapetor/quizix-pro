/**
 * Post-game analytics end-to-end wiring.
 *
 * Seeds one result through POST /api/save-results, then drives the real UI:
 * results viewer → analytics modal → tabs → question drill-down → detail modal
 * entry point. Deletes the seeded file afterwards so the results directory is
 * left as it was found.
 *
 * Assertions are on rendered text and element presence, not on pixels, so the
 * spec stays stable while the analytics styling evolves.
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Skip the onboarding overlay and the language dialog; both cover the toolbar
// and the modals under test. Mirrors createContext() in visual-static.spec.js.
test.use({
    storageState: {
        cookies: [],
        origins: [{
            origin: `http://localhost:${process.env.PW_PORT || 3000}`,
            localStorage: [
                { name: 'language', value: 'en' },
                { name: 'quiz_onboarding_complete', value: JSON.stringify({ completed: true, version: 3 }) },
                { name: 'quiz_player_first_game', value: 'true' }
            ]
        }]
    }
});

const QUIZ_TITLE = 'E2E Analytics Fixture';
const GAME_PIN = '987654';

const QUESTIONS = [
    {
        questionNumber: 1,
        text: 'What is the capital of France?',
        type: 'multiple-choice',
        options: ['London', 'Paris', 'Berlin', 'Madrid'],
        correctAnswer: 1,
        difficulty: 'medium',
        timeLimit: 30,
        concepts: ['Geography']
    },
    {
        questionNumber: 2,
        text: 'Order these planets by distance from the Sun',
        type: 'ordering',
        options: ['Earth', 'Mercury', 'Venus'],
        correctOrder: [1, 2, 0],
        difficulty: 'hard',
        timeLimit: 45,
        concepts: ['Astronomy']
    },
    {
        questionNumber: 3,
        text: 'Nobody reached this question',
        type: 'multiple-choice',
        options: ['Yes', 'No'],
        correctAnswer: 0,
        difficulty: 'easy',
        timeLimit: 20,
        concepts: ['Geography']
    }
];

const PLAYERS = [
    {
        name: 'Ana',
        score: 2400,
        answers: [
            { answer: 1, isCorrect: true, points: 1400, timeMs: 4200 },
            { answer: [1, 2, 0], isCorrect: true, points: 1000, timeMs: 17000 }
        ]
    },
    {
        name: 'Ben',
        score: 300,
        answers: [
            { answer: 0, isCorrect: false, points: 0, timeMs: 9100 },
            { answer: [0, 1, 2], isCorrect: false, points: 300, timeMs: 21000 }
        ]
    },
    {
        name: 'Cleo',
        score: 900,
        answers: [
            { answer: 0, isCorrect: false, points: 0, timeMs: 7300 },
            { answer: [1, 2, 0], isCorrect: true, points: 900, timeMs: 19500 }
        ]
    }
];

let seededFilename = null;

test.beforeAll(async ({ request }) => {
    const response = await request.post('/api/save-results', {
        data: {
            quizTitle: QUIZ_TITLE,
            gamePin: GAME_PIN,
            results: PLAYERS,
            startTime: new Date(Date.now() - 600000).toISOString(),
            endTime: new Date().toISOString(),
            questions: QUESTIONS
        }
    });
    expect(response.ok()).toBeTruthy();
    seededFilename = (await response.json()).filename;
});

test.afterAll(async () => {
    if (!seededFilename) return;
    const filePath = path.join(process.cwd(), 'results', seededFilename);
    await fs.promises.rm(filePath, { force: true });
});

/**
 * Open the results viewer filtered down to the seeded fixture.
 * Goes through the real toolbar entry point, which lazy-loads the viewer module.
 * @param {import('@playwright/test').Page} page
 */
async function openSeededResult(page) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });
    await page.waitForFunction(() => !!window.game, { timeout: 15000 });

    // Same entry point the toolbar button calls; it lazy-loads the viewer module.
    await page.evaluate(() => window.game.openResultsViewer());

    await page.waitForSelector('#results-list .result-item', { timeout: 15000 });
    await page.fill('#search-results', QUIZ_TITLE);
    const item = page.locator(`.result-item[data-filename="${seededFilename}"]`);
    await expect(item).toBeVisible();
    return item;
}

test('results list shows the participant count from the listing payload', async ({ page }) => {
    const item = await openSeededResult(page);
    // The listing API omits the per-player array; the row must still say 3.
    await expect(item.locator('.result-meta')).toContainText('3');
});

test('analytics modal opens with charts, real labels and an unanswered question', async ({ page }) => {
    const item = await openSeededResult(page);
    await item.locator('[data-action="analytics"]').click();

    const modal = page.locator('#analytics-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal-header h2')).toContainText(QUIZ_TITLE);

    // Charts are created on a short delay after the modal mounts.
    await expect(modal.locator('#success-rate-chart')).toBeVisible();
    const chartsRendered = await modal.locator('#success-rate-chart').evaluate(
        canvas => canvas.width > 0 && canvas.height > 0
    );
    expect(chartsRendered).toBe(true);

    // Questions tab: the third question was never answered.
    await modal.locator('.tab-btn[data-tab="questions"]').click();
    const questions = modal.locator('.question-analytics-item');
    await expect(questions).toHaveCount(3);
    await expect(questions.nth(2)).toHaveClass(/unanswered/);
    await expect(questions.nth(2)).not.toContainText('0.0%');

    // Drill-down renders option text, never the stored index.
    await questions.nth(0).click();
    const drilldown = page.locator('#question-drilldown-modal');
    await expect(drilldown).toBeVisible();
    await expect(drilldown.locator('.drilldown-correct-value')).toHaveText('Paris');
    await expect(drilldown.locator('.answer-dist-row .answer-text').first()).toHaveText('London');
});

test('escape closes the analytics modal', async ({ page }) => {
    const item = await openSeededResult(page);
    await item.locator('[data-action="analytics"]').click();

    const modal = page.locator('#analytics-modal');
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
});

test('the detail modal offers an analytics entry point', async ({ page }) => {
    const item = await openSeededResult(page);
    await item.locator('.result-info').click();

    await expect(page.locator('#result-detail-modal')).toBeVisible();
    await expect(page.locator('#detail-participants')).toHaveText('3');

    await page.locator('#view-result-analytics').click();
    await expect(page.locator('#analytics-modal')).toBeVisible();
});
