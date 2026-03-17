// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * E2E Disconnect Stats Tests
 *
 * Verifies that final game stats are preserved when players disconnect.
 * Covers:
 *   1. Disconnected player still appears in host's final leaderboard
 *   2. Reconnecting player to a finished game receives final results
 *   3. All connected players see final stats screen
 *
 * Run: npx playwright test tests/e2e-disconnect-stats.spec.js --project=chromium
 */

const TEST_QUIZ = {
    quiz: {
        title: 'Disconnect Stats Test',
        randomizeAnswers: false,
        powerUpsEnabled: false,
        questions: [
            {
                question: 'What is 1+1?',
                type: 'multiple-choice',
                options: ['1', '2', '3', '4'],
                correctAnswer: 1,
                timeLimit: 10,
            },
            {
                question: 'What is 2+2?',
                type: 'multiple-choice',
                options: ['3', '4', '5', '6'],
                correctAnswer: 1,
                timeLimit: 10,
            },
        ],
    },
};

const DEVICE_HOST = devices['Desktop Chrome'];
const DEVICE_IPHONE = devices['iPhone 12'];
const DEVICE_GALAXY = devices['Galaxy S8'];
const DEVICE_PIXEL = devices['Pixel 7'];

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
            const items = list.querySelectorAll('.player-item, .player-card, [class*="player"]');
            return items.length >= expected;
        },
        count,
        { timeout }
    );
}

// ---------------------------------------------------------------------------
test.describe('Disconnect Stats', () => {
    test.setTimeout(180000);

    test('Disconnected player stats preserved in final leaderboard', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_IPHONE);
        const p2Ctx = await createContext(browser, DEVICE_GALAXY);
        const p3Ctx = await createContext(browser, DEVICE_PIXEL);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();
        const p2Page = await p2Ctx.newPage();
        const p3Page = await p3Ctx.newPage();

        try {
            const pin = await hostCreateGame(hostPage);

            // Join sequentially to avoid overloading
            await joinAsPlayer(p1Page, pin, 'Alice');
            await joinAsPlayer(p2Page, pin, 'Bob');
            await joinAsPlayer(p3Page, pin, 'Charlie');
            await waitForPlayerCount(hostPage, 3);

            // Start game
            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
                waitForScreen(p2Page, 'player-game-screen'),
                waitForScreen(p3Page, 'player-game-screen'),
            ]);

            // Wait for Q1 options to appear
            const waitForOptions = (page) => page.waitForSelector(
                '#player-multiple-choice .player-option[data-option="1"]',
                { timeout: 20000 }
            );
            await Promise.all([waitForOptions(p1Page), waitForOptions(p2Page), waitForOptions(p3Page)]);

            // Q1: All 3 click an answer
            await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await p2Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await p3Page.click('#player-multiple-choice .player-option[data-option="1"]');

            // Wait for Q1 to end on host
            await hostPage.waitForFunction(() => {
                const stats = document.querySelector('#answer-statistics');
                return stats && !stats.classList.contains('hidden');
            }, null, { timeout: 20000 });

            // Save Bob's reconnection data before disconnect
            const bobReconnectData = await p2Page.evaluate(() => {
                const raw = sessionStorage.getItem('quizix_reconnect');
                return raw ? JSON.parse(raw) : null;
            });
            expect(bobReconnectData).toBeTruthy();

            // --- DISCONNECT Bob ---
            await p2Page.evaluate(() => window.game.socket.disconnect());

            // Let Q2 timer expire naturally (10s + transitions).
            // Game ends automatically after last question.

            // Wait for final leaderboard on host
            await waitForScreen(hostPage, 'leaderboard-screen', 60000);

            // --- ASSERT 1: Bob appears in host leaderboard despite being disconnected ---
            const leaderboardText = await hostPage.locator('#leaderboard-list').textContent();
            expect(leaderboardText).toContain('Alice');
            expect(leaderboardText).toContain('Bob');
            expect(leaderboardText).toContain('Charlie');

            // --- ASSERT 2: Connected players eventually see player-final-screen ---
            await waitForScreen(p1Page, 'player-final-screen', 20000);
            await waitForScreen(p3Page, 'player-final-screen', 20000);

            const aliceScore = await p1Page.locator('#final-score').textContent();
            expect(aliceScore).toBeTruthy();

            // --- ASSERT 3: Bob reconnects to finished game and gets final results ---
            const p2ReconnectCtx = await createContext(browser, DEVICE_GALAXY);
            const p2ReconnectPage = await p2ReconnectCtx.newPage();

            try {
                await p2ReconnectPage.goto('/');
                await p2ReconnectPage.waitForSelector('body.loaded', { timeout: 15000 });
                await p2ReconnectPage.waitForFunction(
                    () => window.game?.socket?.connected === true,
                    { timeout: 15000 }
                );

                // Trigger rejoin to finished game
                await p2ReconnectPage.evaluate((data) => {
                    sessionStorage.setItem('quizix_reconnect', JSON.stringify(data));
                    window.game.socket.emit('player-rejoin', {
                        pin: data.pin,
                        sessionToken: data.sessionToken,
                    });
                }, bobReconnectData);

                // Bob should land on player-final-screen
                await waitForScreen(p2ReconnectPage, 'player-final-screen', 15000);

                const bobScore = await p2ReconnectPage.locator('#final-score').textContent();
                expect(bobScore).toBeTruthy();
            } finally {
                await p2ReconnectCtx.close();
            }
        } finally {
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close().catch(() => {});
            await p3Ctx.close();
        }
    });
});
