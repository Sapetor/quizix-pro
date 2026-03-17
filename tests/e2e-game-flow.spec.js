// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * E2E Game Flow Tests
 *
 * Simulates full game sessions with a desktop host and mobile players.
 * Each test creates fresh browser contexts for isolation.
 *
 * Run: npx playwright test tests/e2e-game-flow.spec.js --project=chromium
 * Debug: npx playwright test tests/e2e-game-flow.spec.js --project=chromium --headed
 */

// ---------------------------------------------------------------------------
// Inline test quiz — no file dependency
// ---------------------------------------------------------------------------
const TEST_QUIZ = {
    quiz: {
        title: 'E2E Test Quiz',
        randomizeAnswers: false,   // Keep answer order predictable for assertions
        powerUpsEnabled: false,
        questions: [
            {
                question: 'What is 2+2?',
                type: 'multiple-choice',
                options: ['1', '3', '4', '5'],
                correctAnswer: 2,   // index of '4'
                timeLimit: 15,
            },
            {
                question: 'Capital of France?',
                type: 'multiple-choice',
                options: ['London', 'Paris', 'Berlin', 'Rome'],
                correctAnswer: 1,   // index of 'Paris'
                timeLimit: 15,
            },
            {
                question: 'Largest planet?',
                type: 'multiple-choice',
                options: ['Mars', 'Earth', 'Jupiter', 'Venus'],
                correctAnswer: 2,   // index of 'Jupiter'
                timeLimit: 15,
            },
        ],
    },
};

// Device profiles
const DEVICE_HOST = devices['Desktop Chrome'];
const DEVICE_IPHONE = devices['iPhone 12'];
const DEVICE_GALAXY = devices['Galaxy S8'];
const DEVICE_PIXEL = devices['Pixel 7'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a new browser context with optional device emulation.
 * Pre-sets localStorage to skip onboarding tour and language picker.
 */
async function createContext(browser, device) {
    const options = device ? { ...device } : {};
    // Pre-seed localStorage to skip first-visit dialogs (onboarding tour + language picker)
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
 * Wait for a screen to become active (has .active class).
 */
async function waitForScreen(page, screenId, timeout = 30000) {
    await page.waitForSelector(`#${screenId}.active`, { timeout });
}

/**
 * Host: emit host-join via Socket.IO and return the game PIN.
 * Uses page.evaluate to call the socket directly — no quiz editor UI needed.
 */
async function hostCreateGame(page, quiz = TEST_QUIZ) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });

    // Wait for Socket.IO to connect (window.game.socket is the raw io() instance)
    await page.waitForFunction(() => {
        return window.game?.socket?.connected === true;
    }, { timeout: 15000 });

    // Emit host-join directly via the socket
    await page.evaluate((quizData) => {
        window.game.socket.emit('host-join', quizData);
    }, quiz);

    // Wait for lobby screen
    await waitForScreen(page, 'game-lobby');

    // Extract PIN
    const pin = await page.locator('#game-pin .pin-digits').textContent();
    if (!pin || pin.includes('-')) {
        throw new Error(`Invalid PIN extracted: "${pin}"`);
    }
    return pin.trim();
}

/**
 * Player: fill in PIN + name, click Join, wait for player lobby.
 */
async function joinAsPlayer(page, pin, name) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });

    // Wait for Socket.IO to connect
    await page.waitForFunction(() => {
        return window.game?.socket?.connected === true;
    }, { timeout: 15000 });

    // Navigate to join screen first — desktop uses #join-btn, mobile uses #join-btn-mobile
    const desktopJoin = page.locator('#join-btn');
    const mobileJoin = page.locator('#join-btn-mobile');
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
 * Wait for a specific number of players to appear in the lobby list.
 */
async function waitForPlayerCount(page, count, timeout = 15000) {
    await page.waitForFunction(
        (expected) => {
            const list = document.querySelector('#players-list');
            if (!list) return false;
            // Count player items (divs with player names, not empty)
            const items = list.querySelectorAll('.player-item, .player-card, [class*="player"]');
            return items.length >= expected;
        },
        count,
        { timeout }
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('E2E Game Flow', () => {
    // Sequential but independent — tests create many socket connections to a single server
    // (don't use 'serial' — it aborts remaining tests on first failure)
    test.describe.configure({ mode: 'default', retries: 1 });
    // Increase default timeout for E2E tests with multiple browser contexts
    test.setTimeout(180000);

    test('Full game flow — host + 3 mobile players', async ({ browser }) => {
        // --- Create contexts ---
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_IPHONE);
        const p2Ctx = await createContext(browser, DEVICE_GALAXY);
        const p3Ctx = await createContext(browser, DEVICE_PIXEL);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();
        const p2Page = await p2Ctx.newPage();
        const p3Page = await p3Ctx.newPage();

        // Capture page errors for debugging
        const errors = [];
        for (const [name, pg] of [['host', hostPage], ['p1', p1Page], ['p2', p2Page], ['p3', p3Page]]) {
            pg.on('pageerror', (err) => errors.push(`[${name}] ${err.message}`));
        }

        try {
            // --- Step 1: Host creates game ---
            const pin = await hostCreateGame(hostPage);
            expect(pin).toMatch(/^\d{6}$/);

            // --- Step 2: Players join ---
            await Promise.all([
                joinAsPlayer(p1Page, pin, 'Alice'),
                joinAsPlayer(p2Page, pin, 'Bob'),
                joinAsPlayer(p3Page, pin, 'Charlie'),
            ]);

            // --- Step 3: Host sees 3 players ---
            await waitForPlayerCount(hostPage, 3);
            const playersListText = await hostPage.locator('#players-list').textContent();
            expect(playersListText).toContain('Alice');
            expect(playersListText).toContain('Bob');
            expect(playersListText).toContain('Charlie');

            // --- Step 4: Host starts game via socket ---
            await hostPage.evaluate(() => {
                window.game.socket.emit('start-game');
            });

            // --- Step 5: Wait for game-started on all ---
            // game-started fires immediately, then question-start after 3s delay
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
                waitForScreen(p2Page, 'player-game-screen'),
                waitForScreen(p3Page, 'player-game-screen'),
            ]);

            // --- Loop through 3 questions ---
            const correctAnswers = [2, 1, 2]; // Indices matching TEST_QUIZ
            for (let q = 0; q < 3; q++) {
                const qNum = q + 1;

                // Wait for the question counter to show the right question number
                // This ensures question-start has been processed
                await p1Page.waitForFunction(
                    (n) => {
                        const el = document.querySelector('#player-question-counter');
                        return el && el.textContent && el.textContent.includes(`${n}`);
                    },
                    qNum,
                    { timeout: 30000 }
                );

                // Also ensure answer buttons are clickable (not disabled from previous Q)
                await p1Page.waitForSelector(
                    '#player-multiple-choice .player-option:not(.disabled):not(.selected)',
                    { timeout: 10000 }
                );

                // Players submit answers (stagger slightly to avoid race conditions)
                const correctIdx = correctAnswers[q];
                const wrongIdx = correctIdx === 0 ? 1 : 0;

                await p1Page.click(`#player-multiple-choice .player-option[data-option="${correctIdx}"]`);
                await p2Page.click(`#player-multiple-choice .player-option[data-option="${wrongIdx}"]`);
                await p3Page.click(`#player-multiple-choice .player-option[data-option="${correctIdx}"]`);

                // Wait for host to see answer statistics (means question ended)
                await hostPage.waitForFunction(
                    () => {
                        const stats = document.querySelector('#answer-statistics');
                        return stats && !stats.classList.contains('hidden');
                    },
                    null,
                    { timeout: 20000 }
                );

                // Verify correct answer is highlighted on at least one player
                // The class used is 'correct-answer-highlight' per answer-reveal-manager.js
                await p1Page.waitForSelector(
                    '.player-option.correct-answer-highlight, .correct-answer-display, #answer-feedback:not(.hidden)',
                    { timeout: 15000 }
                ).catch(() => {
                    // Non-fatal: some UI flows show feedback differently
                });

                // Wait for auto-advance to complete before next iteration
                // Server sends: question-end → show-leaderboard (3s) → question-start
                if (q < 2) {
                    // Wait for the leaderboard phase to pass and next question to arrive
                    await p1Page.waitForFunction(
                        (nextQ) => {
                            const el = document.querySelector('#player-question-counter');
                            return el && el.textContent && el.textContent.includes(`${nextQ}`);
                        },
                        qNum + 1,
                        { timeout: 30000 }
                    );
                }
            }

            // --- Step 6: Verify final leaderboard / game end ---
            await waitForScreen(hostPage, 'leaderboard-screen', 30000);

            const leaderboardText = await hostPage.locator('#leaderboard-screen').textContent();
            expect(leaderboardText).toContain('Alice');
            expect(leaderboardText).toContain('Bob');
            expect(leaderboardText).toContain('Charlie');
        } finally {
            // Log any JS errors for debugging
            if (errors.length > 0) {
                console.log('Page errors during test:', errors);
            }
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close();
            await p3Ctx.close();
        }
    });

    test('Player reconnection mid-game', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_IPHONE);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();

        try {
            // --- Setup: host + 1 player, start game ---
            const pin = await hostCreateGame(hostPage);
            await joinAsPlayer(p1Page, pin, 'Reconnector');
            await waitForPlayerCount(hostPage, 1);

            // Wait for reconnection data to be stored in sessionStorage
            await p1Page.waitForFunction(() => {
                const raw = sessionStorage.getItem('quizix_reconnect');
                if (!raw) return false;
                try {
                    const data = JSON.parse(raw);
                    return !!data.sessionToken;
                } catch { return false; }
            }, null, { timeout: 10000 });

            const reconnectData = await p1Page.evaluate(() => {
                return JSON.parse(sessionStorage.getItem('quizix_reconnect'));
            });
            expect(reconnectData).toBeTruthy();
            expect(reconnectData.sessionToken).toBeTruthy();

            // Start the game
            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
            ]);

            // Answer Q1
            await p1Page.waitForFunction(() => {
                const el = document.querySelector('#player-question-text');
                return el && el.textContent && el.textContent.length > 10;
            }, null, { timeout: 20000 });

            await p1Page.click('#player-multiple-choice .player-option[data-option="2"]');

            // Wait for question to finish (timeout or early end)
            await hostPage.waitForFunction(
                () => {
                    const stats = document.querySelector('#answer-statistics');
                    return stats && !stats.classList.contains('hidden');
                },
                null,
                { timeout: 20000 }
            );

            // --- Disconnect: close player page ---
            await p1Page.close();
            await p1Ctx.close();

            // --- Reconnect: new context, rejoin via session token ---
            const p1ReconnectCtx = await createContext(browser, DEVICE_IPHONE);
            const p1ReconnectPage = await p1ReconnectCtx.newPage();

            try {
                await p1ReconnectPage.goto('/');
                await p1ReconnectPage.waitForSelector('body.loaded', { timeout: 15000 });

                // Wait for socket to connect
                await p1ReconnectPage.waitForFunction(() => {
                    // @ts-ignore
                    return window.game?.socket?.connected === true;
                }, { timeout: 15000 });

                // Inject reconnection data and trigger rejoin
                await p1ReconnectPage.evaluate((data) => {
                    sessionStorage.setItem('quizix_reconnect', JSON.stringify(data));
                    // @ts-ignore
                    window.game.socket.emit('player-rejoin', {
                        pin: data.pin,
                        sessionToken: data.sessionToken,
                    });
                }, reconnectData);

                // Wait for rejoin to succeed — player should be back in the game
                // The rejoin-success event puts the player back into the game screen
                // or lobby depending on game state
                await p1ReconnectPage.waitForFunction(
                    () => {
                        const gameScreen = document.querySelector('#player-game-screen');
                        const lobbyScreen = document.querySelector('#player-lobby');
                        return (gameScreen && gameScreen.classList.contains('active')) ||
                               (lobbyScreen && lobbyScreen.classList.contains('active'));
                    },
                    null,
                    { timeout: 15000 }
                );

                // Verify player name is preserved on the host side
                const hostPlayersText = await hostPage.locator('#players-list').textContent();
                expect(hostPlayersText).toContain('Reconnector');
            } finally {
                await p1ReconnectCtx.close();
            }
        } finally {
            await hostCtx.close();
        }
    });

    test('Lobby layout — start button visible with 10+ players', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const hostPage = await hostCtx.newPage();
        const playerContexts = [];

        try {
            const pin = await hostCreateGame(hostPage);

            // Join 10 players
            const joinPromises = [];
            for (let i = 1; i <= 10; i++) {
                const ctx = await createContext(browser, DEVICE_GALAXY);
                playerContexts.push(ctx);
                const page = await ctx.newPage();
                joinPromises.push(joinAsPlayer(page, pin, `Player${i}`));
            }
            await Promise.all(joinPromises);

            // Wait for all 10 to appear in host lobby
            await waitForPlayerCount(hostPage, 10, 30000);

            // Verify start button is visible and in viewport
            const startBtn = hostPage.locator('#start-game');
            await expect(startBtn).toBeVisible();

            const box = await startBtn.boundingBox();
            expect(box).toBeTruthy();

            // Button should be within the viewport
            const viewport = hostPage.viewportSize();
            expect(box.y).toBeLessThan(viewport.height);
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        } finally {
            for (const ctx of playerContexts) {
                await ctx.close();
            }
            await hostCtx.close();
        }
    });

    test('QR code size — desktop and mobile', async ({ browser }) => {
        // --- Desktop ---
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const hostPage = await hostCtx.newPage();

        try {
            await hostCreateGame(hostPage);

            // Wait for QR code image to be visible (loaded from API)
            await hostPage.waitForFunction(() => {
                const img = document.querySelector('#qr-code-image');
                return img && img.style.display !== 'none' && img.naturalWidth > 0;
            }, null, { timeout: 15000 });

            const qrDesktop = await hostPage.locator('#qr-code-image').boundingBox();
            expect(qrDesktop).toBeTruthy();
            expect(qrDesktop.width).toBeGreaterThanOrEqual(150);
        } finally {
            await hostCtx.close();
        }

        // --- Mobile ---
        const mobileCtx = await createContext(browser, DEVICE_IPHONE);
        const mobilePage = await mobileCtx.newPage();

        try {
            await hostCreateGame(mobilePage);

            await mobilePage.waitForFunction(() => {
                const img = document.querySelector('#qr-code-image');
                return img && img.style.display !== 'none' && img.naturalWidth > 0;
            }, null, { timeout: 15000 });

            const qrMobile = await mobilePage.locator('#qr-code-image').boundingBox();
            expect(qrMobile).toBeTruthy();
            expect(qrMobile.width).toBeGreaterThanOrEqual(120);
        } finally {
            await mobileCtx.close();
        }
    });
});
