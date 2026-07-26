// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * Static Visual Regression Tests
 *
 * Covers the non-game screens that visual-regression.spec.js does NOT touch:
 *   - Landing page (/) — desktop + mobile
 *   - Quiz editor (host-screen) — desktop empty, desktop 2-question fixture,
 *     desktop quiz-settings modal, mobile question carousel
 *   - Load-quiz modal chrome (quiz library — data-driven body masked)
 *
 * These are the prerequisite baselines for an upcoming CSS refactor.
 *
 * Run:    PW_PORT=3210 npx playwright test tests/e2e/visual-static.spec.js --project=chromium
 * Update: PW_PORT=3210 npx playwright test tests/e2e/visual-static.spec.js --project=chromium --update-snapshots
 *
 * IMPORTANT: always run with PW_PORT set — port 3000 is occupied on the dev
 * machine and the seeded localStorage origin (createContext) must match baseURL.
 */

const DEVICE_DESKTOP = devices['Desktop Chrome'];
const DEVICE_MOBILE = devices['iPhone 12'];

// Deterministic 2-question fixture: one multiple-choice + one true-false.
// Loaded via window.quizManager.populateQuizBuilder — no network, no randomness.
const FIXTURE_QUIZ = {
    title: 'Static Fixture Quiz',
    randomizeQuestions: false,
    randomizeAnswers: false,
    questions: [
        {
            question: 'What is the capital of France?',
            type: 'multiple-choice',
            difficulty: 'medium',
            timeLimit: 20,
            image: '',
            options: ['London', 'Paris', 'Berlin', 'Madrid'],
            correctAnswer: 1,
        },
        {
            question: 'Water boils at 100 degrees Celsius at sea level.',
            type: 'true-false',
            difficulty: 'easy',
            timeLimit: 20,
            image: '',
            options: ['True', 'False'],
            correctAnswer: 'true',
        },
    ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a browser context with optional device emulation.
 * Pre-seeds localStorage to skip onboarding and language dialogs.
 * Mirrors createContext() in visual-regression.spec.js.
 */
async function createContext(browser, device) {
    const options = device ? { ...device } : {};
    options.storageState = {
        cookies: [],
        origins: [{
            // Must match the origin the tests run on (PW_PORT) or the seeded
            // localStorage silently no-ops.
            origin: `http://localhost:${process.env.PW_PORT || 3000}`,
            localStorage: [
                { name: 'language', value: 'en' },
                { name: 'quiz_onboarding_complete', value: JSON.stringify({ completed: true, version: 3 }) },
                { name: 'quiz_player_first_game', value: 'true' },
            ],
        }],
    };
    // Freeze timed UI so every run captures the same frame. In particular the
    // landing demo card (#lp-demo) rotates through 4 slides of different
    // heights on a 6s CSS-animation cadence; under prefers-reduced-motion it
    // stays on slide 0 (landing-demo.js).
    options.reducedMotion = 'reduce';
    return browser.newContext(options);
}

/**
 * Dynamic / animated / data-driven elements that must be masked so they don't
 * cause false diffs. Not every selector exists on every screen — absent
 * locators mask nothing and are harmless.
 */
function getDynamicMasks(page, extra = []) {
    const selectors = [
        // Landing hero PIN card: trailing digit cycles on a timer (landing.js)
        '#lp-pin-digits',
        // Landing live-rooms ticker: hydrates from /api/active-games and scrolls
        '#lp-rooms-strip',
        // Landing QR panel: async mock/live render
        '#lp-qr-visual',
        // Landing "N joining" live counter
        '.lp-joiners',
        // App version string, set asynchronously from server
        '#app-version',
        // Load-quiz modal body: real quiz names from quizzes/ (non-deterministic)
        '#quiz-tree-container',
        '#quiz-list',
    ];
    return [...selectors.map(s => page.locator(s)), ...extra];
}

function screenshotOpts(page, name, extraMasks = []) {
    return [
        `${name}.png`,
        {
            mask: getDynamicMasks(page, extraMasks),
            maxDiffPixelRatio: 0.02,
            animations: 'disabled',
        },
    ];
}

/** Load '/' and wait for the app to be interactive. */
async function bootLanding(page) {
    // Landing hydrates the hero card, PIN, joiners and rooms ticker from
    // active games (landing.js fetchActiveGames). The game-flow spec runs in
    // parallel against the same server, so without this the hero card height
    // depends on whether a game happens to be live — pin the empty state.
    await page.route('**/api/active-games*', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ games: [] }),
    }));
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });
    await page.waitForFunction(() => !!window.game, { timeout: 15000 });
    // Let async landing hydration (ticker/QR fetch, translations) settle so the
    // page is in its steady empty-server state before we screenshot.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await page.waitForTimeout(800);
}

/** Navigate the booted app into the quiz editor (host-screen). */
async function gotoEditor(page) {
    await page.evaluate(() => window.game.uiManager.showScreen('host-screen'));
    await page.waitForSelector('#host-screen.active', { timeout: 15000 });
    await page.waitForSelector('#questions-container .question-item', { timeout: 15000 });
}

/** Seed the deterministic fixture into the editor. */
async function seedFixture(page) {
    await page.evaluate(async (quiz) => {
        await window.quizManager.populateQuizBuilder(quiz);
        // MEMORY: showQuestion(0) required after load so the active-question
        // class marks the (only) visible question in always-preview/carousel.
        if (window.showQuestion) window.showQuestion(0);
    }, FIXTURE_QUIZ);
    await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Static Visual Regression', () => {
    test.describe.configure({ mode: 'default', retries: 1 });
    test.setTimeout(120000);

    // -----------------------------------------------------------------------
    // Landing page
    // -----------------------------------------------------------------------
    test('landing page — desktop', async ({ browser }) => {
        const ctx = await createContext(browser, DEVICE_DESKTOP);
        const page = await ctx.newPage();
        try {
            await bootLanding(page);
            await expect(page).toHaveScreenshot(
                `landing-desktop.png`,
                {
                    mask: getDynamicMasks(page),
                    maxDiffPixelRatio: 0.02,
                    fullPage: true,
                    animations: 'disabled',
                }
            );
        } finally {
            await ctx.close();
        }
    });

    test('landing page — mobile', async ({ browser }) => {
        const ctx = await createContext(browser, DEVICE_MOBILE);
        const page = await ctx.newPage();
        try {
            await bootLanding(page);
            await expect(page).toHaveScreenshot(
                `landing-mobile.png`,
                {
                    mask: getDynamicMasks(page),
                    maxDiffPixelRatio: 0.02,
                    fullPage: true,
                    animations: 'disabled',
                }
            );
        } finally {
            await ctx.close();
        }
    });

    // -----------------------------------------------------------------------
    // Quiz editor — desktop
    // -----------------------------------------------------------------------
    test('quiz editor — desktop empty, fixture, settings modal', async ({ browser }) => {
        const ctx = await createContext(browser, DEVICE_DESKTOP);
        const page = await ctx.newPage();
        try {
            await bootLanding(page);
            await gotoEditor(page);
            // always-preview (split editor + live preview) settles ~200ms after
            // the transition; wait for the preview pane to be shown.
            await page.waitForSelector('.host-container.always-preview', { timeout: 10000 });
            await page.waitForTimeout(700);

            // Empty state: the default single blank question.
            await page.evaluate(() => window.showQuestion && window.showQuestion(0));
            await expect(page).toHaveScreenshot(
                ...screenshotOpts(page, 'editor-desktop-empty')
            );

            // 2-question fixture loaded.
            await seedFixture(page);
            await expect(page).toHaveScreenshot(
                ...screenshotOpts(page, 'editor-desktop-fixture')
            );

            // Quiz-settings modal open.
            await page.click('#vtoolbar-settings-direct');
            await page.waitForSelector('#quiz-settings-modal.visible', { timeout: 5000 });
            await page.waitForTimeout(400);
            await expect(page).toHaveScreenshot(
                ...screenshotOpts(page, 'editor-desktop-settings-modal')
            );
        } finally {
            await ctx.close();
        }
    });

    // -----------------------------------------------------------------------
    // Quiz editor — mobile viewport
    //
    // NOTE: The MobileQuestionCarousel (mobile-question-carousel.js) is dead
    // code — .mobile-carousel-container is `display:none !important` in BOTH
    // responsive.css breakpoints (max-width:768 line ~945, min-width:769 line
    // ~2061, "carousel removed for simplicity"). The real mobile editor renders
    // the plain stacked #questions-container. This captures that actual screen.
    // -----------------------------------------------------------------------
    test('quiz editor — mobile viewport', async ({ browser }) => {
        const ctx = await createContext(browser, DEVICE_MOBILE);
        const page = await ctx.newPage();
        try {
            await bootLanding(page);
            await gotoEditor(page);
            await seedFixture(page);
            await page.waitForSelector('#questions-container .question-item', { timeout: 10000 });
            await page.waitForTimeout(500);

            await expect(page).toHaveScreenshot(
                `editor-mobile.png`,
                {
                    mask: getDynamicMasks(page),
                    maxDiffPixelRatio: 0.02,
                    animations: 'disabled',
                }
            );
        } finally {
            await ctx.close();
        }
    });

    // -----------------------------------------------------------------------
    // Load-quiz modal (quiz library) — chrome only; data-driven body masked
    // -----------------------------------------------------------------------
    test('load-quiz modal — desktop chrome', async ({ browser }) => {
        const ctx = await createContext(browser, DEVICE_DESKTOP);
        const page = await ctx.newPage();
        try {
            await bootLanding(page);
            await gotoEditor(page);
            await page.waitForSelector('.host-container.always-preview', { timeout: 10000 });

            await page.evaluate(() => window.quizManager.showLoadQuizModal());
            await page.waitForSelector('#load-quiz-modal.visible-flex', { timeout: 5000 });
            // Let the tree body finish loading before we mask it (avoids a
            // half-rendered spinner leaking outside the mask on a slow load).
            await page.waitForTimeout(1200);

            await expect(page).toHaveScreenshot(
                ...screenshotOpts(page, 'load-quiz-modal-desktop')
            );
        } finally {
            await ctx.close();
        }
    });
});
