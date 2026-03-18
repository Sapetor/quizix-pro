// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * Visual Regression Tests
 *
 * Walks through a full game with all 5 question types, taking toHaveScreenshot()
 * snapshot assertions at each key state. Tests 1 host + 1 player on both desktop
 * and mobile viewports.
 *
 * Run:   npx playwright test tests/e2e/visual-regression.spec.js --project=chromium
 * Debug: npx playwright test tests/e2e/visual-regression.spec.js --project=chromium --headed
 * Update snapshots: npx playwright test tests/e2e/visual-regression.spec.js --project=chromium --update-snapshots
 */

// ---------------------------------------------------------------------------
// Inline test quiz — all 5 question types, 60s timers for screenshot safety
// ---------------------------------------------------------------------------
const VISUAL_TEST_QUIZ = {
    quiz: {
        title: 'Visual Regression Test',
        randomizeAnswers: false,
        powerUpsEnabled: false,
        questions: [
            {
                question: 'What is the capital of France?',
                type: 'multiple-choice',
                options: ['London', 'Paris', 'Berlin', 'Madrid'],
                correctAnswer: 1,
                timeLimit: 60,
            },
            {
                question: 'Water boils at 100 degrees Celsius.',
                type: 'true-false',
                options: ['True', 'False'],
                correctAnswer: true,
                timeLimit: 60,
            },
            {
                question: 'Select all even numbers:',
                type: 'multiple-correct',
                options: ['2', '3', '4', '5'],
                correctIndices: [0, 2],
                correctAnswers: [0, 2],
                timeLimit: 60,
            },
            {
                question: 'What is 7 times 8?',
                type: 'numeric',
                correctAnswer: 56,
                tolerance: 0.5,
                timeLimit: 60,
            },
            {
                question: 'Order from smallest to largest:',
                type: 'ordering',
                options: ['Hundred', 'One', 'Ten', 'Thousand'],
                correctOrder: [1, 2, 0, 3],
                timeLimit: 60,
            },
        ],
    },
};

// Device profiles
const DEVICE_DESKTOP = devices['Desktop Chrome'];
const DEVICE_MOBILE = devices['iPhone 12'];

// Question type -> player container ID mapping
const CONTAINER_IDS = {
    'multiple-choice': 'player-multiple-choice',
    'true-false': 'player-true-false',
    'multiple-correct': 'player-multiple-correct',
    'numeric': 'player-numeric',
    'ordering': 'player-ordering',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a browser context with optional device emulation.
 * Pre-seeds localStorage to skip onboarding and language dialogs.
 */
async function createContext(browser, device) {
    const options = device ? { ...device } : {};
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

/**
 * Wait for a screen to become active.
 */
async function waitForScreen(page, screenId, timeout = 30000) {
    await page.waitForSelector(`#${screenId}.active`, { timeout });
}

/**
 * Host: emit host-join via Socket.IO and return the game PIN.
 */
async function hostCreateGame(page) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });

    await page.waitForFunction(() => {
        return window.game?.socket?.connected === true;
    }, { timeout: 15000 });

    await page.evaluate((quizData) => {
        window.game.socket.emit('host-join', quizData);
    }, VISUAL_TEST_QUIZ);

    await waitForScreen(page, 'game-lobby');

    const pin = await page.locator('#game-pin .pin-digits').textContent();
    if (!pin || pin.includes('-')) {
        throw new Error(`Invalid PIN extracted: "${pin}"`);
    }
    return pin.trim();
}

/**
 * Player: navigate to join screen, fill PIN + name, click Join.
 */
async function joinAsPlayer(page, pin, name) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });

    await page.waitForFunction(() => {
        return window.game?.socket?.connected === true;
    }, { timeout: 15000 });

    // Desktop uses #join-btn, mobile uses #join-btn-mobile
    const mobileJoin = page.locator('#join-btn-mobile');
    const desktopJoin = page.locator('#join-btn');
    if (await mobileJoin.isVisible().catch(() => false)) {
        await mobileJoin.click();
    } else {
        await desktopJoin.click();
    }
    await waitForScreen(page, 'join-screen');

    await page.fill('#game-pin-input', pin);
    await page.fill('#player-name', name);
    await page.click('#join-game');
    await waitForScreen(page, 'player-lobby');
}

/**
 * Wait for a specific number of players in the host lobby.
 */
async function waitForPlayerCount(page, count, timeout = 15000) {
    await page.waitForFunction(
        (expected) => {
            const list = document.querySelector('#players-list');
            if (!list) return false;
            const items = list.querySelectorAll('.player-item, .player-card, [class*="player"]');
            return items.length >= expected;
        },
        count,
        { timeout }
    );
}

/**
 * Wait for a question type container to be visible on a player page.
 */
async function waitForQuestionType(page, type, questionNumber, timeout = 30000) {
    const containerId = CONTAINER_IDS[type];

    await page.waitForFunction(
        ({ n, cid }) => {
            const counter = document.querySelector('#player-question-counter');
            if (!counter || !counter.textContent) return false;
            if (!counter.textContent.includes(`Question ${n} `)) return false;

            const container = document.getElementById(cid);
            if (!container || container.classList.contains('hidden')) return false;

            const qText = document.querySelector('#player-question-text');
            if (!qText || !qText.textContent) return false;
            if (qText.textContent.trim() === 'Question will appear here') return false;

            return true;
        },
        { n: questionNumber, cid: containerId },
        { timeout }
    );
}

/**
 * Wait for host question to be displayed on the host-game-screen.
 */
async function waitForHostQuestion(page, questionNumber, timeout = 30000) {
    await page.waitForFunction(
        (n) => {
            const screen = document.getElementById('host-game-screen');
            if (!screen || !screen.classList.contains('active')) return false;

            const counter = document.querySelector('#question-counter');
            if (!counter || !counter.textContent) return false;
            if (!counter.textContent.includes(`Question ${n} `)) return false;

            const qText = document.querySelector('#current-question');
            if (!qText || !qText.textContent) return false;
            if (qText.textContent.trim() === 'Question will appear here') return false;

            return true;
        },
        questionNumber,
        { timeout }
    );
}

/**
 * Wait for host answer statistics to appear (question ended).
 */
async function waitForHostStats(page, timeout = 20000) {
    await page.waitForFunction(
        () => {
            const stats = document.querySelector('#answer-statistics');
            return stats && !stats.classList.contains('hidden');
        },
        null,
        { timeout }
    );
}

/**
 * Wait for the leaderboard screen to become active on the host page.
 */
async function waitForLeaderboard(page, timeout = 20000) {
    await page.waitForSelector('#leaderboard-screen.active', { timeout });
}

/**
 * Wait for the player to receive result feedback (modal overlay appears).
 */
async function waitForPlayerResult(page, timeout = 15000) {
    await page.waitForFunction(
        () => {
            // Check for modal feedback overlay
            const overlay = document.getElementById('feedback-modal-overlay');
            if (overlay && !overlay.classList.contains('hidden') && overlay.style.display !== 'none') {
                return true;
            }
            // Fallback: check for correct-answer-highlight on options
            const highlight = document.querySelector('.correct-answer-highlight');
            return !!highlight;
        },
        null,
        { timeout }
    ).catch(() => {
        // Non-fatal: result display may vary by question type
    });
}

/**
 * Reorder ordering items in the DOM to match correctOrder, then submit.
 */
async function submitOrderingAnswer(page, correctOrder) {
    await page.waitForSelector('#player-ordering-container .ordering-display-item', { timeout: 10000 });

    await page.evaluate((order) => {
        const container = document.getElementById('player-ordering-container');
        const items = Array.from(container.querySelectorAll('.ordering-display-item'));
        const byOriginal = {};
        items.forEach(item => {
            byOriginal[parseInt(item.dataset.originalIndex)] = item;
        });
        order.forEach((origIdx, pos) => {
            const item = byOriginal[origIdx];
            container.appendChild(item);
            item.dataset.orderIndex = pos;
            const numEl = item.querySelector('.ordering-item-number');
            if (numEl) numEl.textContent = pos + 1;
        });
    }, correctOrder);

    await page.click('#submit-ordering');
}

/**
 * Return common mask locators for dynamic elements that change between runs.
 * Masking prevents false positives from timers, PINs, scores, QR codes, etc.
 */
function getDynamicMasks(page) {
    return [
        page.locator('#game-pin'),
        page.locator('#qr-code-container'),
        page.locator('#qr-code-image'),
        page.locator('#timer'),
        page.locator('#timer-circle'),
        page.locator('.timer-display'),
        page.locator('.countdown'),
        page.locator('#lobby-player-count'),
        page.locator('#player-question-counter'),
        page.locator('#question-counter'),
        page.locator('#responses-count'),
        page.locator('#total-players'),
        page.locator('.player-score'),
        page.locator('#player-score'),
        page.locator('#final-score'),
        page.locator('#final-position'),
        page.locator('#game-url'),
        page.locator('.game-url'),
        page.locator('#lobby-pin-display'),
        page.locator('#app-version'),
        page.locator('.leaderboard-entry .score'),
        page.locator('.stat-count'),
        page.locator('.stat-fill'),
        page.locator('#modal-score-display'),
    ];
}

/**
 * Screenshot options with common defaults.
 */
function screenshotOpts(page, name, extraMasks = []) {
    return [
        `${name}.png`,
        {
            mask: [...getDynamicMasks(page), ...extraMasks],
            maxDiffPixelRatio: 0.02,
        },
    ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Visual Regression', () => {
    test.describe.configure({ mode: 'default', retries: 1 });
    test.setTimeout(300000); // 5 min — walking through 5 questions with screenshots

    test.describe('Desktop viewport', () => {
        test('full game — all 5 question types', async ({ browser }) => {
            test.slow(); // Mark as slow for extra timeout allowance

            const hostCtx = await createContext(browser, DEVICE_DESKTOP);
            const playerCtx = await createContext(browser, DEVICE_DESKTOP);

            const hostPage = await hostCtx.newPage();
            const playerPage = await playerCtx.newPage();

            const errors = [];
            hostPage.on('pageerror', (err) => errors.push(`[host] ${err.message}`));
            playerPage.on('pageerror', (err) => errors.push(`[player] ${err.message}`));

            try {
                // ==================================================================
                // SETUP: Host creates game
                // ==================================================================
                const pin = await hostCreateGame(hostPage);
                expect(pin).toMatch(/^\d{6}$/);

                // Screenshot: host lobby (before player joins)
                await expect(hostPage).toHaveScreenshot(
                    ...screenshotOpts(hostPage, 'desktop-lobby-host-empty')
                );

                // Player joins
                await joinAsPlayer(playerPage, pin, 'Tester');
                await waitForPlayerCount(hostPage, 1);

                // Screenshot: host lobby with player
                await expect(hostPage).toHaveScreenshot(
                    ...screenshotOpts(hostPage, 'desktop-lobby-host')
                );

                // Screenshot: player lobby
                await expect(playerPage).toHaveScreenshot(
                    ...screenshotOpts(playerPage, 'desktop-lobby-player')
                );

                // ==================================================================
                // START GAME
                // ==================================================================
                await hostPage.evaluate(() => {
                    window.game.socket.emit('start-game');
                });

                await Promise.all([
                    waitForScreen(hostPage, 'host-game-screen'),
                    waitForScreen(playerPage, 'player-game-screen'),
                ]);

                // ==================================================================
                // Q1: Multiple Choice
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 1),
                        waitForQuestionType(playerPage, 'multiple-choice', 1),
                    ]);

                    // Wait for options to be ready
                    await playerPage.waitForSelector(
                        '#player-multiple-choice .player-option:not(.disabled)',
                        { timeout: 10000 }
                    );

                    // Screenshot: question displayed
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-mc-question-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-mc-question-player')
                    );

                    // Player selects correct answer (Paris = index 1)
                    await playerPage.click('#player-multiple-choice .player-option[data-option="1"]');

                    // Wait for selected state
                    await playerPage.waitForSelector(
                        '#player-multiple-choice .player-option.selected',
                        { timeout: 5000 }
                    );

                    // Screenshot: answer selected
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-mc-selected-player')
                    );

                    // Wait for host to show all responses answered
                    await hostPage.waitForFunction(
                        () => {
                            const el = document.querySelector('#responses-count');
                            return el && parseInt(el.textContent) >= 1;
                        },
                        null,
                        { timeout: 15000 }
                    );

                    // Wait for question end / stats phase
                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    // Screenshot: answer reveal
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-mc-reveal-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-mc-reveal-player')
                    );

                    // Wait for leaderboard
                    await waitForLeaderboard(hostPage);

                    // Screenshot: leaderboard
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-mc-leaderboard-host')
                    );
                }

                // ==================================================================
                // Q2: True/False
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 2),
                        waitForQuestionType(playerPage, 'true-false', 2),
                    ]);

                    // Screenshot: question displayed
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-tf-question-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-tf-question-player')
                    );

                    // Player selects correct answer (True)
                    await playerPage.click('#player-true-false .tf-option[data-answer="true"]');

                    await playerPage.waitForSelector(
                        '#player-true-false .tf-option.selected',
                        { timeout: 5000 }
                    );

                    // Screenshot: answer selected
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-tf-selected-player')
                    );

                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    // Screenshot: answer reveal
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-tf-reveal-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-tf-reveal-player')
                    );

                    await waitForLeaderboard(hostPage);

                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-tf-leaderboard-host')
                    );
                }

                // ==================================================================
                // Q3: Multiple Correct
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 3),
                        waitForQuestionType(playerPage, 'multiple-correct', 3),
                    ]);

                    // Screenshot: question displayed
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-mcc-question-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-mcc-question-player')
                    );

                    // Player selects correct answers (index 0 = "2", index 2 = "4")
                    await playerPage.click('#player-multiple-correct .checkbox-option[data-option="0"]');
                    await playerPage.click('#player-multiple-correct .checkbox-option[data-option="2"]');

                    // Screenshot: checkboxes selected before submit
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-mcc-selected-player')
                    );

                    // Submit
                    await playerPage.click('#submit-multiple');

                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    // Screenshot: answer reveal
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-mcc-reveal-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-mcc-reveal-player')
                    );

                    await waitForLeaderboard(hostPage);

                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-mcc-leaderboard-host')
                    );
                }

                // ==================================================================
                // Q4: Numeric
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 4),
                        waitForQuestionType(playerPage, 'numeric', 4),
                    ]);

                    // Screenshot: question displayed
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-num-question-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-num-question-player')
                    );

                    // Player enters correct answer
                    await playerPage.fill('#numeric-answer-input', '56');

                    // Screenshot: input filled before submit
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-num-filled-player')
                    );

                    await playerPage.click('#submit-numeric');

                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    // Screenshot: answer reveal
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-num-reveal-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-num-reveal-player')
                    );

                    await waitForLeaderboard(hostPage);

                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-num-leaderboard-host')
                    );
                }

                // ==================================================================
                // Q5: Ordering
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 5),
                        waitForQuestionType(playerPage, 'ordering', 5),
                    ]);

                    // Screenshot: question displayed (initial shuffled order)
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-ord-question-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-ord-question-player')
                    );

                    // Reorder via DOM manipulation and submit
                    // correctOrder: [1, 2, 0, 3] = One, Ten, Hundred, Thousand
                    await submitOrderingAnswer(playerPage, [1, 2, 0, 3]);

                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    // Screenshot: answer reveal
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-ord-reveal-host')
                    );
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'desktop-ord-reveal-player')
                    );
                }

                // ==================================================================
                // FINAL RESULTS
                // ==================================================================
                {
                    // Host sees final leaderboard, player sees final results screen
                    await Promise.all([
                        hostPage.waitForSelector('#final-results:not(.hidden)', { timeout: 30000 })
                            .catch(() => waitForLeaderboard(hostPage, 30000)),
                        playerPage.waitForSelector('#player-final-screen.active', { timeout: 30000 })
                            .catch(() => {}),
                    ]);

                    // Brief pause for animations to settle
                    await hostPage.waitForTimeout(1000);

                    // Screenshot: final results
                    await expect(hostPage).toHaveScreenshot(
                        ...screenshotOpts(hostPage, 'desktop-final-host')
                    );

                    // Player final screen may or may not be visible depending on game flow
                    const playerFinalActive = await playerPage.locator('#player-final-screen.active')
                        .isVisible().catch(() => false);
                    if (playerFinalActive) {
                        await expect(playerPage).toHaveScreenshot(
                            ...screenshotOpts(playerPage, 'desktop-final-player')
                        );
                    }
                }

            } finally {
                if (errors.length > 0) {
                    console.warn('Page errors during test:', errors);
                }
                await hostCtx.close();
                await playerCtx.close();
            }
        });
    });

    test.describe('Mobile viewport', () => {
        test('full game — all 5 question types', async ({ browser }) => {
            test.slow();

            const hostCtx = await createContext(browser, DEVICE_DESKTOP);
            const playerCtx = await createContext(browser, DEVICE_MOBILE);

            const hostPage = await hostCtx.newPage();
            const playerPage = await playerCtx.newPage();

            const errors = [];
            hostPage.on('pageerror', (err) => errors.push(`[host] ${err.message}`));
            playerPage.on('pageerror', (err) => errors.push(`[player] ${err.message}`));

            try {
                // ==================================================================
                // SETUP: Host creates game, mobile player joins
                // ==================================================================
                const pin = await hostCreateGame(hostPage);
                expect(pin).toMatch(/^\d{6}$/);

                await joinAsPlayer(playerPage, pin, 'MobilePlayer');
                await waitForPlayerCount(hostPage, 1);

                // Screenshot: mobile player lobby
                await expect(playerPage).toHaveScreenshot(
                    ...screenshotOpts(playerPage, 'mobile-lobby-player')
                );

                // ==================================================================
                // START GAME
                // ==================================================================
                await hostPage.evaluate(() => {
                    window.game.socket.emit('start-game');
                });

                await Promise.all([
                    waitForScreen(hostPage, 'host-game-screen'),
                    waitForScreen(playerPage, 'player-game-screen'),
                ]);

                // ==================================================================
                // Q1: Multiple Choice
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 1),
                        waitForQuestionType(playerPage, 'multiple-choice', 1),
                    ]);

                    await playerPage.waitForSelector(
                        '#player-multiple-choice .player-option:not(.disabled)',
                        { timeout: 10000 }
                    );

                    // Screenshot: mobile question
                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-mc-question-player')
                    );

                    await playerPage.click('#player-multiple-choice .player-option[data-option="1"]');

                    await playerPage.waitForSelector(
                        '#player-multiple-choice .player-option.selected',
                        { timeout: 5000 }
                    );

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-mc-selected-player')
                    );

                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-mc-reveal-player')
                    );

                    await waitForLeaderboard(hostPage);
                }

                // ==================================================================
                // Q2: True/False
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 2),
                        waitForQuestionType(playerPage, 'true-false', 2),
                    ]);

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-tf-question-player')
                    );

                    await playerPage.click('#player-true-false .tf-option[data-answer="true"]');

                    await playerPage.waitForSelector(
                        '#player-true-false .tf-option.selected',
                        { timeout: 5000 }
                    );

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-tf-selected-player')
                    );

                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-tf-reveal-player')
                    );

                    await waitForLeaderboard(hostPage);
                }

                // ==================================================================
                // Q3: Multiple Correct
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 3),
                        waitForQuestionType(playerPage, 'multiple-correct', 3),
                    ]);

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-mcc-question-player')
                    );

                    await playerPage.click('#player-multiple-correct .checkbox-option[data-option="0"]');
                    await playerPage.click('#player-multiple-correct .checkbox-option[data-option="2"]');

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-mcc-selected-player')
                    );

                    await playerPage.click('#submit-multiple');

                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-mcc-reveal-player')
                    );

                    await waitForLeaderboard(hostPage);
                }

                // ==================================================================
                // Q4: Numeric
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 4),
                        waitForQuestionType(playerPage, 'numeric', 4),
                    ]);

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-num-question-player')
                    );

                    await playerPage.fill('#numeric-answer-input', '56');

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-num-filled-player')
                    );

                    await playerPage.click('#submit-numeric');

                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-num-reveal-player')
                    );

                    await waitForLeaderboard(hostPage);
                }

                // ==================================================================
                // Q5: Ordering
                // ==================================================================
                {
                    await Promise.all([
                        waitForHostQuestion(hostPage, 5),
                        waitForQuestionType(playerPage, 'ordering', 5),
                    ]);

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-ord-question-player')
                    );

                    await submitOrderingAnswer(playerPage, [1, 2, 0, 3]);

                    await waitForHostStats(hostPage);
                    await waitForPlayerResult(playerPage);

                    await expect(playerPage).toHaveScreenshot(
                        ...screenshotOpts(playerPage, 'mobile-ord-reveal-player')
                    );
                }

                // ==================================================================
                // FINAL RESULTS
                // ==================================================================
                {
                    await Promise.all([
                        hostPage.waitForSelector('#final-results:not(.hidden)', { timeout: 30000 })
                            .catch(() => waitForLeaderboard(hostPage, 30000)),
                        playerPage.waitForSelector('#player-final-screen.active', { timeout: 30000 })
                            .catch(() => {}),
                    ]);

                    await playerPage.waitForTimeout(1000);

                    const playerFinalActive = await playerPage.locator('#player-final-screen.active')
                        .isVisible().catch(() => false);
                    if (playerFinalActive) {
                        await expect(playerPage).toHaveScreenshot(
                            ...screenshotOpts(playerPage, 'mobile-final-player')
                        );
                    }
                }

            } finally {
                if (errors.length > 0) {
                    console.warn('Page errors during test:', errors);
                }
                await hostCtx.close();
                await playerCtx.close();
            }
        });
    });
});
