// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * Drag-to-reorder in the editor's question sidebar.
 *
 * The unit tests (question-sidebar-reorder.dom.test.js) cover the index math
 * and the node move. These cover what only a real browser can: that a pointer
 * gesture actually reorders, that touch drags from the grip, that a plain
 * click still navigates instead of reordering, and that Alt+Arrow works.
 *
 * Contexts are built explicitly (desktop / touch) rather than using the
 * project's device, so the file behaves the same under every --project.
 */

const DEVICE_DESKTOP = devices['Desktop Chrome'];
const PORT = process.env.PW_PORT || 3000;

const FIXTURE_QUIZ = {
    title: 'Reorder Fixture',
    randomizeQuestions: false,
    randomizeAnswers: false,
    questions: ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((q) => ({
        question: q,
        type: 'multiple-choice',
        difficulty: 'medium',
        timeLimit: 20,
        image: '',
        options: ['a', 'b', 'c', 'd'],
        correctAnswer: 1,
    })),
};

async function createContext(browser, { touch = false } = {}) {
    return browser.newContext({
        ...DEVICE_DESKTOP,
        hasTouch: touch,
        reducedMotion: 'reduce',
        storageState: {
            cookies: [],
            origins: [{
                origin: `http://localhost:${PORT}`,
                localStorage: [
                    { name: 'language', value: 'en' },
                    { name: 'quiz_onboarding_complete', value: JSON.stringify({ completed: true, version: 3 }) },
                    { name: 'quiz_player_first_game', value: 'true' },
                ],
            }],
        },
    });
}

async function openEditorWithFixture(page) {
    await page.goto('/');
    // The ES-module bootstrap publishes these asynchronously; without the wait
    // the first evaluate can land before window.game exists.
    await page.waitForFunction(() => !!(window.game?.uiManager && window.quizManager), null,
        { timeout: 20000 });
    await page.evaluate(() => window.game.uiManager.showScreen('host-screen'));
    await page.waitForSelector('#host-screen.active', { timeout: 15000 });
    await page.waitForSelector('#questions-container .question-item', { timeout: 15000 });
    await page.evaluate(async (quiz) => {
        await window.quizManager.populateQuizBuilder(quiz);
        if (window.showQuestion) window.showQuestion(0);
    }, FIXTURE_QUIZ);
    await page.waitForSelector('#question-sidebar .qs-row', { timeout: 15000 });
    await expect.poll(() => questionOrder(page)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    await waitForStableRows(page);
}

/**
 * Wait until the sidebar rows stop moving.
 *
 * Seeding the editor kicks off async work (preview render, MathJax) that
 * settles the layout a frame or two later — enough to shift the list by a row
 * height. A drag computed from coordinates measured before that lands
 * somewhere else entirely.
 */
async function waitForStableRows(page) {
    await page.waitForFunction(() => {
        const top = () => document.querySelector('#question-sidebar .qs-row')
            ?.getBoundingClientRect().top;
        const first = top();
        if (first === undefined) return false;
        return new Promise(resolve => requestAnimationFrame(() => setTimeout(() => {
            resolve(Math.abs(top() - first) < 0.5);
        }, 250)));
    }, null, { timeout: 15000 });
}

/** Question order read the way every consumer reads it: document order. */
function questionOrder(page) {
    return page.$$eval('#questions-container .question-item .question-text',
        els => els.map(el => el.value));
}

function sidebarLabels(page) {
    return page.$$eval('#question-sidebar .qs-row .qs-row-text',
        els => els.map(el => el.textContent.trim()));
}

/** Drag `fromRow` so it lands past `toRow`, in small steps so pointermove fires. */
async function dragRow(page, fromIndex, toIndex, { fromGrip = false } = {}) {
    const rows = page.locator('#question-sidebar .qs-row');
    const source = fromGrip
        ? rows.nth(fromIndex).locator('.qs-grip')
        : rows.nth(fromIndex);
    const start = await source.boundingBox();
    const target = await rows.nth(toIndex).boundingBox();

    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    // Past the target row's midpoint, so the drop gap resolves to its slot.
    const endY = toIndex > fromIndex
        ? target.y + target.height * 0.8
        : target.y + target.height * 0.2;
    for (let step = 1; step <= 6; step++) {
        const y = start.y + (endY - start.y) * (step / 6);
        await page.mouse.move(start.x + start.width / 2, y);
    }
    await page.mouse.up();
}

test.describe('Editor — reorder questions from the sidebar', () => {
    test.setTimeout(90000);

    test('mouse drag moves a question down', async ({ browser }) => {
        const ctx = await createContext(browser);
        const page = await ctx.newPage();
        await openEditorWithFixture(page);

        await dragRow(page, 0, 2);

        await expect.poll(() => questionOrder(page))
            .toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);
        // The sidebar is a derived view — it must agree with the model.
        await expect.poll(() => sidebarLabels(page))
            .toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);
        await ctx.close();
    });

    test('mouse drag moves a question up', async ({ browser }) => {
        const ctx = await createContext(browser);
        const page = await ctx.newPage();
        await openEditorWithFixture(page);

        await dragRow(page, 3, 0);

        await expect.poll(() => questionOrder(page))
            .toEqual(['Delta', 'Alpha', 'Bravo', 'Charlie']);
        await ctx.close();
    });

    test('a plain click still navigates instead of reordering', async ({ browser }) => {
        const ctx = await createContext(browser);
        const page = await ctx.newPage();
        await openEditorWithFixture(page);

        await page.locator('#question-sidebar .qs-row').nth(2).click();

        await expect.poll(() => questionOrder(page))
            .toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        await expect(page.locator('#question-sidebar .qs-row').nth(2))
            .toHaveClass(/qs-row--active/);
        await ctx.close();
    });

    test('touch drag from the grip reorders', async ({ browser }) => {
        const ctx = await createContext(browser, { touch: true });
        const page = await ctx.newPage();
        await openEditorWithFixture(page);

        const rows = page.locator('#question-sidebar .qs-row');
        const grip = rows.nth(0).locator('.qs-grip');
        const start = await grip.boundingBox();
        const target = await rows.nth(2).boundingBox();

        // Raw CDP touch sequence: Playwright's tap() cannot express a drag.
        const cdp = await ctx.newCDPSession(page);
        const point = (x, y) => ({ x, y, radiusX: 5, radiusY: 5, force: 1 });
        const cx = start.x + start.width / 2;
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [point(cx, start.y + start.height / 2)],
        });
        const endY = target.y + target.height * 0.8;
        for (let step = 1; step <= 6; step++) {
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [point(cx, start.y + (endY - start.y) * (step / 6))],
            });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

        await expect.poll(() => questionOrder(page))
            .toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);
        await ctx.close();
    });

    test('Alt+ArrowDown moves the focused question down', async ({ browser }) => {
        const ctx = await createContext(browser);
        const page = await ctx.newPage();
        await openEditorWithFixture(page);

        await page.locator('#question-sidebar .qs-row').nth(0).focus();
        await page.keyboard.press('Alt+ArrowDown');

        await expect.poll(() => questionOrder(page))
            .toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta']);
        // Focus follows the question so the shortcut can be repeated.
        await expect.poll(() => page.evaluate(
            () => document.activeElement?.querySelector('.qs-row-text')?.textContent.trim()
        )).toBe('Alpha');
        await ctx.close();
    });

    test('Alt+ArrowUp at the top does nothing', async ({ browser }) => {
        const ctx = await createContext(browser);
        const page = await ctx.newPage();
        await openEditorWithFixture(page);

        await page.locator('#question-sidebar .qs-row').nth(0).focus();
        await page.keyboard.press('Alt+ArrowUp');

        await expect.poll(() => questionOrder(page))
            .toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        await ctx.close();
    });

    test('a reorder schedules an autosave (a node move fires no input)', async ({ browser }) => {
        const ctx = await createContext(browser);
        const page = await ctx.newPage();
        await openEditorWithFixture(page);

        const pending = page.evaluate(() => new Promise((resolve) => {
            document.addEventListener('editorAutosavePending', () => resolve(true), { once: true });
            setTimeout(() => resolve(false), 5000);
        }));
        await page.locator('#question-sidebar .qs-row').nth(0).focus();
        await page.keyboard.press('Alt+ArrowDown');

        expect(await pending).toBe(true);
        await ctx.close();
    });
});
