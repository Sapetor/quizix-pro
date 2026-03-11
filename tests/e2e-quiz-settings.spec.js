// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * E2E Quiz Settings Tests
 *
 * Verifies the settings button visibility on the vertical toolbar,
 * the settings modal open/close behaviour, and all toggles/options inside.
 *
 * Run: npx playwright test tests/e2e-quiz-settings.spec.js --project=chromium
 * Debug: npx playwright test tests/e2e-quiz-settings.spec.js --project=chromium --headed
 */

const DEVICE_HOST = devices['Desktop Chrome'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createContext(browser) {
    const options = { ...DEVICE_HOST };
    options.storageState = {
        cookies: [],
        origins: [{
            origin: 'http://localhost:3000',
            localStorage: [
                { name: 'language', value: 'en' },
                { name: 'quiz_onboarding_complete', value: JSON.stringify({ completed: true, version: 3 }) },
                { name: 'quiz_player_first_game', value: 'true' },
            ],
        }],
    };
    return browser.newContext(options);
}

async function navigateToHostScreen(page) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 20000 });
    await page.waitForFunction(() => window.game?.uiManager?.showScreen != null, { timeout: 15000 });

    // Navigate to host screen via JS — retry until screen is active
    await page.waitForFunction(() => {
        if (!document.querySelector('#host-screen.active')) {
            window.game.uiManager.showScreen('host-screen');
        }
        return document.querySelector('#host-screen.active') !== null;
    }, { timeout: 15000 });
}

async function openSettings(page) {
    const modal = page.locator('#quiz-settings-modal');
    // If modal is already open, nothing to do
    const isOpen = await modal.evaluate(el => el.classList.contains('visible'));
    if (isOpen) return;

    await page.locator('#vtoolbar-settings-direct').click();
    await expect(modal).toHaveClass(/visible/);
}

async function closeSettings(page) {
    await page.locator('.settings-modal-close').click();
    await expect(page.locator('#quiz-settings-modal')).not.toHaveClass(/visible/);
}

// ---------------------------------------------------------------------------
// Tests — each describe block shares one page to reduce server load
// ---------------------------------------------------------------------------

test.describe('Quiz Settings — button and modal', () => {
    test.describe.configure({ mode: 'serial' });

    /** @type {import('@playwright/test').BrowserContext} */
    let ctx;
    /** @type {import('@playwright/test').Page} */
    let page;

    test.beforeAll(async ({ browser }) => {
        ctx = await createContext(browser);
        page = await ctx.newPage();
        await navigateToHostScreen(page);
    });

    test.afterAll(async () => { await ctx?.close(); });

    test('Settings button is visible on the vertical toolbar', async () => {
        await expect(page.locator('#vtoolbar-settings-direct')).toBeVisible();

        // Should NOT require opening the More menu
        await expect(page.locator('#vtoolbar-more-menu')).toHaveClass(/hidden/);
    });

    test('Clicking settings button opens the modal', async () => {
        const modal = page.locator('#quiz-settings-modal');
        await expect(modal).not.toHaveClass(/visible/);

        await page.locator('#vtoolbar-settings-direct').click();
        await expect(modal).toHaveClass(/visible/);
    });

    test('Modal closes via close button', async () => {
        // Modal is open from previous test — reopen if needed
        await openSettings(page);

        await page.locator('.settings-modal-close').click();
        await expect(page.locator('#quiz-settings-modal')).not.toHaveClass(/visible/);
    });

    test('Modal closes via Escape key', async () => {
        await openSettings(page);

        await page.keyboard.press('Escape');
        await expect(page.locator('#quiz-settings-modal')).not.toHaveClass(/visible/);
    });

    test('Modal closes via overlay click', async () => {
        await openSettings(page);

        // Click the overlay (the modal-overlay element itself, not the inner .settings-modal)
        await page.locator('#quiz-settings-modal').click({ position: { x: 5, y: 5 } });
        await expect(page.locator('#quiz-settings-modal')).not.toHaveClass(/visible/);
    });
});

test.describe('Quiz Settings — General Options', () => {
    test.describe.configure({ mode: 'serial' });

    let ctx;
    let page;

    test.beforeAll(async ({ browser }) => {
        ctx = await createContext(browser);
        page = await ctx.newPage();
        await navigateToHostScreen(page);
    });

    test.afterAll(async () => { await ctx?.close(); });

    test('Randomize questions toggle works and persists', async () => {
        await openSettings(page);

        const checkbox = page.locator('#modal-randomize-questions');
        await expect(checkbox).not.toBeChecked();

        await checkbox.check();
        await expect(checkbox).toBeChecked();

        // Close and reopen — value should persist via sync
        await closeSettings(page);
        await openSettings(page);
        await expect(checkbox).toBeChecked();

        // Reset for next test
        await checkbox.uncheck();
        await closeSettings(page);
    });

    test('Randomize answers toggle works and persists', async () => {
        await openSettings(page);

        const checkbox = page.locator('#modal-randomize-answers');
        await expect(checkbox).not.toBeChecked();

        await checkbox.check();
        await expect(checkbox).toBeChecked();

        await closeSettings(page);
        await openSettings(page);
        await expect(checkbox).toBeChecked();

        await checkbox.uncheck();
        await closeSettings(page);
    });

    test('Global time toggle reveals time input', async () => {
        await openSettings(page);

        const timeToggle = page.locator('#modal-use-global-time');
        const timeContainer = page.locator('#modal-global-time-container');

        // Initially hidden
        await expect(timeContainer).not.toBeVisible();

        // Enable global time
        await timeToggle.check();
        await expect(timeContainer).toBeVisible();

        // Verify default value
        const timeInput = page.locator('#modal-global-time-limit');
        await expect(timeInput).toHaveValue('20');

        // Change and verify
        await timeInput.fill('45');
        await expect(timeInput).toHaveValue('45');

        // Disable — container hides again
        await timeToggle.uncheck();
        await expect(timeContainer).not.toBeVisible();

        await closeSettings(page);
    });

    test('Global time value persists through modal close/reopen', async () => {
        await openSettings(page);

        await page.locator('#modal-use-global-time').check();
        await page.locator('#modal-global-time-limit').fill('60');

        await closeSettings(page);
        await openSettings(page);

        await expect(page.locator('#modal-use-global-time')).toBeChecked();
        await expect(page.locator('#modal-global-time-limit')).toHaveValue('60');

        // Reset
        await page.locator('#modal-use-global-time').uncheck();
        await closeSettings(page);
    });
});

test.describe('Quiz Settings — Advanced Options', () => {
    test.describe.configure({ mode: 'serial' });

    let ctx;
    let page;

    test.beforeAll(async ({ browser }) => {
        ctx = await createContext(browser);
        page = await ctx.newPage();
        await navigateToHostScreen(page);
    });

    test.afterAll(async () => { await ctx?.close(); });

    test('Manual advancement toggle works', async () => {
        await openSettings(page);

        const checkbox = page.locator('#modal-manual-advancement');
        await expect(checkbox).not.toBeChecked();

        await checkbox.check();
        await expect(checkbox).toBeChecked();

        await closeSettings(page);
        await openSettings(page);
        await expect(checkbox).toBeChecked();

        await checkbox.uncheck();
        await closeSettings(page);
    });

    test('Power-ups toggle works', async () => {
        await openSettings(page);

        const checkbox = page.locator('#modal-enable-power-ups');
        await expect(checkbox).not.toBeChecked();

        await checkbox.check();
        await expect(checkbox).toBeChecked();

        await closeSettings(page);
        await openSettings(page);
        await expect(checkbox).toBeChecked();

        await checkbox.uncheck();
        await closeSettings(page);
    });

    test('Consensus mode toggle reveals sub-settings', async () => {
        await openSettings(page);

        const consensusToggle = page.locator('#modal-consensus-mode');
        const consensusSettings = page.locator('#modal-consensus-settings');

        // Initially hidden
        await expect(consensusSettings).toHaveClass(/hidden/);

        // Enable consensus
        await consensusToggle.check();
        await expect(consensusSettings).not.toHaveClass(/hidden/);

        // Verify defaults
        await expect(page.locator('#modal-consensus-threshold')).toHaveValue('66');
        await expect(page.locator('#modal-discussion-time')).toHaveValue('30');
        await expect(page.locator('#modal-allow-chat')).not.toBeChecked();

        // Disable — sub-settings hide
        await consensusToggle.uncheck();
        await expect(consensusSettings).toHaveClass(/hidden/);

        await closeSettings(page);
    });

    test('Consensus sub-settings can be modified and persist', async () => {
        await openSettings(page);
        await page.locator('#modal-consensus-mode').check();

        // Change threshold
        await page.locator('#modal-consensus-threshold').selectOption('75');
        await expect(page.locator('#modal-consensus-threshold')).toHaveValue('75');

        // Change discussion time
        await page.locator('#modal-discussion-time').fill('60');
        await expect(page.locator('#modal-discussion-time')).toHaveValue('60');

        // Enable chat
        await page.locator('#modal-allow-chat').check();
        await expect(page.locator('#modal-allow-chat')).toBeChecked();

        // Close and reopen — values persist
        await closeSettings(page);
        await openSettings(page);

        await expect(page.locator('#modal-consensus-mode')).toBeChecked();
        await expect(page.locator('#modal-consensus-threshold')).toHaveValue('75');
        await expect(page.locator('#modal-discussion-time')).toHaveValue('60');
        await expect(page.locator('#modal-allow-chat')).toBeChecked();

        // Reset
        await page.locator('#modal-consensus-mode').uncheck();
        await closeSettings(page);
    });
});

test.describe('Quiz Settings — Scoring Options', () => {
    test.describe.configure({ mode: 'serial' });

    let ctx;
    let page;

    test.beforeAll(async ({ browser }) => {
        ctx = await createContext(browser);
        page = await ctx.newPage();
        await navigateToHostScreen(page);
    });

    test.afterAll(async () => { await ctx?.close(); });

    test('Time bonus is enabled by default', async () => {
        await openSettings(page);
        await expect(page.locator('#modal-time-bonus-enabled')).toBeChecked();
        await closeSettings(page);
    });

    test('Score breakdown is enabled by default', async () => {
        await openSettings(page);
        await expect(page.locator('#modal-show-score-breakdown')).toBeChecked();
        await closeSettings(page);
    });

    test('Time bonus can be disabled and persists', async () => {
        await openSettings(page);

        const checkbox = page.locator('#modal-time-bonus-enabled');
        await checkbox.uncheck();
        await expect(checkbox).not.toBeChecked();

        await closeSettings(page);
        await openSettings(page);
        await expect(checkbox).not.toBeChecked();

        // Reset
        await checkbox.check();
        await closeSettings(page);
    });

    test('Difficulty multipliers have correct defaults', async () => {
        await openSettings(page);

        await expect(page.locator('#modal-easy-multiplier')).toHaveValue('1');
        await expect(page.locator('#modal-medium-multiplier')).toHaveValue('2');
        await expect(page.locator('#modal-hard-multiplier')).toHaveValue('3');

        await closeSettings(page);
    });

    test('Difficulty multipliers can be changed and persist', async () => {
        await openSettings(page);

        await page.locator('#modal-easy-multiplier').fill('1.5');
        await page.locator('#modal-medium-multiplier').fill('2.5');
        await page.locator('#modal-hard-multiplier').fill('4');

        await closeSettings(page);
        await openSettings(page);

        await expect(page.locator('#modal-easy-multiplier')).toHaveValue('1.5');
        await expect(page.locator('#modal-medium-multiplier')).toHaveValue('2.5');
        await expect(page.locator('#modal-hard-multiplier')).toHaveValue('4');

        await closeSettings(page);
    });
});

test.describe('Quiz Settings — Modal sync with inline settings', () => {
    test.describe.configure({ mode: 'serial' });

    let ctx;
    let page;

    test.beforeAll(async ({ browser }) => {
        ctx = await createContext(browser);
        page = await ctx.newPage();
        await navigateToHostScreen(page);
    });

    test.afterAll(async () => { await ctx?.close(); });

    test('Modal changes sync back to inline checkboxes on close', async () => {
        // Verify inline defaults are unchecked (via JS — may be hidden in layout)
        const inlineDefaults = await page.evaluate(() => ({
            q: document.getElementById('randomize-questions').checked,
            a: document.getElementById('randomize-answers').checked,
        }));
        expect(inlineDefaults.q).toBe(false);
        expect(inlineDefaults.a).toBe(false);

        // Open modal, check both, close
        await openSettings(page);
        await page.locator('#modal-randomize-questions').check();
        await page.locator('#modal-randomize-answers').check();
        await closeSettings(page);

        // Inline settings should now be checked (verify via JS)
        const inlineAfter = await page.evaluate(() => ({
            q: document.getElementById('randomize-questions').checked,
            a: document.getElementById('randomize-answers').checked,
        }));
        expect(inlineAfter.q).toBe(true);
        expect(inlineAfter.a).toBe(true);
    });

    test('Inline settings sync to modal on open', async () => {
        // Reset inline checkboxes first
        await page.evaluate(() => {
            document.getElementById('randomize-questions').checked = false;
            document.getElementById('randomize-answers').checked = false;
        });

        // Set one inline checkbox via JS (it may be hidden in always-preview layout)
        await page.evaluate(() => {
            document.getElementById('randomize-questions').checked = true;
        });

        // Open modal — modal checkbox should reflect inline state
        await openSettings(page);
        await expect(page.locator('#modal-randomize-questions')).toBeChecked();
        await expect(page.locator('#modal-randomize-answers')).not.toBeChecked();

        await closeSettings(page);
    });
});
