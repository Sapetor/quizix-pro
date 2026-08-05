// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * E2E Rematch Tests
 *
 * Plays a quiz to the end, hits Rematch, then plays PAST question 1 of the
 * new game and asserts the second game behaves like a fresh one.
 *
 * Run: npx playwright test tests/e2e-rematch.spec.js --project=chromium
 */

const TEST_QUIZ = {
    quiz: {
        title: 'Rematch Test',
        randomizeAnswers: false,
        powerUpsEnabled: false,
        // Manual advancement is the default; leave it unset so the spec
        // exercises the default host-driven flow.
        questions: [
            {
                question: 'Q1: What is 1+1?',
                type: 'multiple-choice',
                options: ['1', '2', '3', '4'],
                correctAnswer: 1,
                timeLimit: 10,
            },
            {
                question: 'Q2: What is 2+2?',
                type: 'multiple-choice',
                options: ['3', '4', '5', '6'],
                correctAnswer: 1,
                timeLimit: 10,
            },
            {
                question: 'Q3: What is 3+3?',
                type: 'multiple-choice',
                options: ['5', '6', '7', '8'],
                correctAnswer: 1,
                timeLimit: 10,
            },
        ],
    },
};

const DEVICE_HOST = devices['Desktop Chrome'];

async function createContext(browser, device) {
    const options = device ? { ...device } : {};
    options.storageState = {
        cookies: [],
        origins: [{
            // localStorage is per-origin: a hardcoded 3000 makes the seed a no-op under PW_PORT.
            origin: `http://localhost:${process.env.PW_PORT || 3000}`,
            localStorage: [
                { name: 'language', value: 'en' },
                { name: 'quiz_onboarding_complete', value: JSON.stringify({ completed: true, version: 3 }) },
                { name: 'quiz_player_first_game', value: 'true' },
            ],
        }],
    };
    return browser.newContext(options);
}

async function waitForScreen(page, screenId, timeout = 30000) {
    await page.waitForSelector(`#${screenId}.active`, { timeout });
}

async function hostCreateGame(page, quiz = TEST_QUIZ) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });
    await page.waitForFunction(() => window.game?.socket?.connected === true, { timeout: 15000 });
    await page.evaluate((quizData) => window.game.socket.emit('host-join', quizData), quiz);
    await waitForScreen(page, 'game-lobby');
    const pin = await page.locator('#game-pin .pin-digits').textContent();
    return pin.trim();
}

async function joinAsPlayer(page, pin, name) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });
    await page.waitForFunction(() => window.game?.socket?.connected === true, { timeout: 15000 });

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

async function waitForPlayerCount(page, count, timeout = 15000) {
    await page.waitForFunction(
        (expected) => {
            const list = document.querySelector('#players-list');
            if (!list) return false;
            const items = list.querySelectorAll('.player-item:not(.placeholder), .player-card');
            return items.length >= expected;
        },
        count,
        { timeout }
    );
}

/** Question N is live on the player when its options are rendered. */
async function waitForPlayerOptions(page, timeout = 25000) {
    await page.waitForSelector('#player-multiple-choice .player-option[data-option="1"]', { timeout });
}

/**
 * Round is over on the host. `#answer-statistics` doubles as the live response
 * counter during the question (`.counting-only`), so both classes must be checked.
 */
async function waitForRoundEnd(page, timeout = 25000) {
    await page.waitForFunction(() => {
        const stats = document.querySelector('#answer-statistics');
        return stats
            && !stats.classList.contains('hidden')
            && !stats.classList.contains('counting-only');
    }, null, { timeout });
}

/** Host's manual-advance button (statistics phase). */
async function hostAdvance(page) {
    const btn = page.locator('#next-question-stats');
    await expect(btn).toBeVisible({ timeout: 25000 });
    await btn.click();
}

async function waitForFinalResults(page, timeout = 60000) {
    // `leaderboard-screen` is shown after EVERY question — only #final-results
    // means the game is actually over.
    await page.waitForFunction(() => {
        const el = document.querySelector('#final-results');
        return el && !el.classList.contains('hidden');
    }, null, { timeout });
}

/**
 * Play one full question: both players answer option 1 (correct), host waits
 * for the round to end and advances.
 */
async function playQuestion(hostPage, playerPages, { advance = true, expect: expectText } = {}) {
    for (const p of playerPages) await waitForPlayerOptions(p);
    if (expectText) {
        // The host projects the question — it must actually be rendered there.
        await hostPage.waitForFunction(
            (t) => (document.querySelector('#current-question')?.textContent || '').includes(t),
            expectText,
            { timeout: 20000 }
        );
    }
    for (const p of playerPages) {
        await p.click('#player-multiple-choice .player-option[data-option="1"]');
    }
    await waitForRoundEnd(hostPage);
    if (advance) await hostAdvance(hostPage);
}

// ---------------------------------------------------------------------------
test.describe('Rematch', () => {
    test.setTimeout(240000);

    test('second game runs past question 1 with a sane counter, screens and scores', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_HOST);
        const p2Ctx = await createContext(browser, DEVICE_HOST);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();
        const p2Page = await p2Ctx.newPage();
        const players = [p1Page, p2Page];

        try {
            const pin = await hostCreateGame(hostPage);
            await joinAsPlayer(p1Page, pin, 'Alice');
            await joinAsPlayer(p2Page, pin, 'Bob');
            await waitForPlayerCount(hostPage, 2);

            // ---------- GAME 1 ----------
            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await waitForScreen(hostPage, 'host-game-screen');
            await Promise.all(players.map(p => waitForScreen(p, 'player-game-screen')));

            await playQuestion(hostPage, players, { expect: 'Q1' });
            await playQuestion(hostPage, players, { expect: 'Q2' });
            await playQuestion(hostPage, players, { expect: 'Q3' });

            await waitForFinalResults(hostPage);
            await Promise.all(players.map(p => waitForScreen(p, 'player-final-screen', 30000)));

            // ---------- REMATCH ----------
            await hostPage.click('#rematch-game');
            await waitForScreen(hostPage, 'game-lobby', 20000);
            await Promise.all(players.map(p => waitForScreen(p, 'player-lobby', 20000)));

            // ---------- GAME 2 ----------
            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await waitForScreen(hostPage, 'host-game-screen');
            await Promise.all(players.map(p => waitForScreen(p, 'player-game-screen')));

            // Q1 of the rematch
            await playQuestion(hostPage, players, { expect: 'Q1' });

            // --- the reported symptom lives here: everything after Q1 of a rematch ---

            // Q2 must actually arrive for the players.
            await Promise.all(players.map(p => waitForPlayerOptions(p)));

            // Players are still on the game screen, not stranded on a leaderboard.
            for (const p of players) {
                await expect(p.locator('#player-game-screen')).toHaveClass(/active/);
            }

            // The question counter must have advanced, and the question text
            // must be Q2 — not a repeat of Q1 and not a skip to Q3.
            await hostPage.waitForFunction(
                () => /2\s*(of|\/)\s*3/i.test(document.querySelector('#question-counter')?.textContent || ''),
                null,
                { timeout: 20000 }
            );
            await expect(hostPage.locator('#host-game-screen')).toHaveClass(/active/);
            // Host question text lands one RENDER_DELAY tick after the counter.
            await expect(hostPage.locator('#current-question')).toHaveText(/Q2/, { timeout: 20000 });

            await expect(p1Page.locator('#player-question-text')).toHaveText(/Q2/, { timeout: 20000 });

            await playQuestion(hostPage, players, { expect: 'Q2' });

            await Promise.all(players.map(p => waitForPlayerOptions(p)));
            await hostPage.waitForFunction(
                () => /3\s*(of|\/)\s*3/i.test(document.querySelector('#question-counter')?.textContent || ''),
                null,
                { timeout: 20000 }
            );
            await expect(hostPage.locator('#current-question')).toHaveText(/Q3/, { timeout: 20000 });

            // Finish game 2.
            await playQuestion(hostPage, players, { expect: 'Q3', advance: false });
            await hostAdvance(hostPage);
            await waitForFinalResults(hostPage);

            const leaderboard = await hostPage.locator('#leaderboard-list').textContent();
            expect(leaderboard).toContain('Alice');
            expect(leaderboard).toContain('Bob');

            // All three answers were correct, so the rematch must have scored
            // them — a zeroed leaderboard means scoring broke after the reset.
            const points = (leaderboard.match(/(\d+)\s*pts/gi) || []).map(s => parseInt(s, 10));
            expect(points.length).toBeGreaterThanOrEqual(2);
            for (const pts of points) expect(pts).toBeGreaterThan(0);
        } finally {
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close();
        }
    });
});
