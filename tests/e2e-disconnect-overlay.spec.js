// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * E2E: client-side disconnect bookkeeping (public/js/socket/socket-manager.js).
 *
 * - Player: the reconnection overlay appears on transport loss and goes away
 *   once the automatic rejoin succeeds.
 * - Host: sessionStorage['quizix_host_reconnect'] is written on disconnect and
 *   consumed on reconnect; players see the host-waiting overlay meanwhile.
 *
 * The drop is a transport close (socket.io.engine.close()), not
 * socket.disconnect(): a manual disconnect disables auto-reconnect, so the
 * manager 'reconnect' handler would never run. The reconnection delay is
 * raised first so the overlay stays up long enough to observe.
 *
 * The player and host-waiting cases start the game first: in the lobby the
 * server removes a disconnected player immediately (player-management-service
 * handlePlayerDisconnect) and sends host-disconnected only outside the lobby,
 * so the rejoin and the waiting overlay exist only for an active game.
 *
 * Run: PW_PORT=3214 npx playwright test tests/e2e-disconnect-overlay.spec.js --project=chromium
 */

const QUIZ = {
    quiz: {
        title: 'Disconnect Overlay E2E',
        randomizeAnswers: false,
        powerUpsEnabled: false,
        questions: [
            {
                question: 'What is 1+1?',
                type: 'multiple-choice',
                options: ['1', '2', '3', '4'],
                correctAnswer: 1,
                timeLimit: 60,
            },
        ],
    },
};

const RECONNECT_DELAY_MS = 3000;

async function createContext(browser, device) {
    return browser.newContext({
        ...device,
        storageState: {
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
        },
    });
}

async function waitForScreen(page, screenId, timeout = 30000) {
    await page.waitForSelector(`#${screenId}.active`, { timeout });
}

async function hostCreateGame(page) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });
    await page.waitForFunction(() => window.game?.socket?.connected === true, { timeout: 15000 });
    await page.evaluate((quizData) => window.game.socket.emit('host-join', quizData), QUIZ);
    await waitForScreen(page, 'game-lobby');
    return (await page.locator('#game-pin .pin-digits').textContent()).trim();
}

async function joinAsPlayer(page, pin, name) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });
    await page.waitForFunction(() => window.game?.socket?.connected === true, { timeout: 15000 });
    await page.locator('#join-btn-mobile, #join-btn').locator('visible=true').first().click();
    await waitForScreen(page, 'join-screen');
    await page.fill('#game-pin-input', pin);
    await page.fill('#player-name', name);
    await page.click('#join-game');
    await waitForScreen(page, 'player-lobby');
}

async function startGame(hostPage, playerPage) {
    await hostPage.evaluate(() => window.game.socket.emit('start-game'));
    await Promise.all([
        waitForScreen(hostPage, 'host-game-screen'),
        waitForScreen(playerPage, 'player-game-screen'),
    ]);
}

async function waitForPlayerCount(page, count, timeout = 15000) {
    await page.waitForFunction((expected) => {
        const list = document.querySelector('#players-list');
        // `:not(.placeholder)`: the empty-state chip is a .player-item too.
        return !!list && list.querySelectorAll('.player-item:not(.placeholder), .player-card').length >= expected;
    }, count, { timeout });
}

/**
 * Drop the transport but let socket.io auto-reconnect, after a delay long
 * enough to observe the disconnected state.
 */
async function dropTransport(page, delayMs = RECONNECT_DELAY_MS) {
    await page.evaluate((delay) => {
        const manager = window.game.socket.io;
        manager.reconnectionDelay(delay);
        manager.reconnectionDelayMax(delay);
        manager.randomizationFactor(0);
        manager.engine.close();
    }, delayMs);
}

const overlayVisible = (page) => page.locator('#reconnection-overlay').evaluate(
    (el) => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none'
);

async function waitOverlay(page, visible, timeout) {
    await page.waitForFunction((want) => {
        const el = document.getElementById('reconnection-overlay');
        const shown = !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
        return shown === want;
    }, visible, { timeout });
}

test.describe('Disconnect overlay and host reconnect bookkeeping', () => {
    test.setTimeout(90000);

    test('player: overlay appears on transport loss', async ({ browser }) => {
        const hostCtx = await createContext(browser, devices['Desktop Chrome']);
        const playerCtx = await createContext(browser, devices['Galaxy S8']);
        const hostPage = await hostCtx.newPage();
        const playerPage = await playerCtx.newPage();

        try {
            const pin = await hostCreateGame(hostPage);
            await joinAsPlayer(playerPage, pin, 'Dana');
            await waitForPlayerCount(hostPage, 1);
            await startGame(hostPage, playerPage);
            expect(await overlayVisible(playerPage)).toBe(false);

            await dropTransport(playerPage);

            await waitOverlay(playerPage, true, 5000);
            await expect(playerPage.locator('#reconnection-context')).toContainText(pin);
            await expect(playerPage.locator('#reconnection-context')).toContainText('Dana');
        } finally {
            await hostCtx.close();
            await playerCtx.close();
        }
    });

    // Regression: _attemptRejoin() used to call socket.connect() from the manager
    // 'reconnect' event, before the namespace CONNECT was acknowledged. That sent
    // a second CONNECT ("40" twice on the wire), the server closed the transport,
    // and after 10 s the rejoin timeout sent the player to the main menu.
    test('player: overlay clears and player returns to the game after auto-rejoin', async ({ browser }) => {
        const hostCtx = await createContext(browser, devices['Desktop Chrome']);
        const playerCtx = await createContext(browser, devices['Galaxy S8']);
        const hostPage = await hostCtx.newPage();
        const playerPage = await playerCtx.newPage();

        try {
            const pin = await hostCreateGame(hostPage);
            await joinAsPlayer(playerPage, pin, 'Dana');
            await waitForPlayerCount(hostPage, 1);
            await startGame(hostPage, playerPage);

            await dropTransport(playerPage);
            await waitOverlay(playerPage, true, 5000);

            // Auto-reconnect fires after RECONNECT_DELAY_MS, then player-rejoin.
            await waitOverlay(playerPage, false, 20000);
            await waitForScreen(playerPage, 'player-game-screen', 10000);
            await expect(playerPage.locator('#reconnection-context')).toHaveText('');
            expect(await playerPage.evaluate(() => window.game.socket.connected)).toBe(true);
        } finally {
            await hostCtx.close();
            await playerCtx.close();
        }
    });

    test('host: quizix_host_reconnect is written on disconnect and consumed on reconnect', async ({ browser }) => {
        const hostCtx = await createContext(browser, devices['Desktop Chrome']);
        const hostPage = await hostCtx.newPage();

        try {
            const pin = await hostCreateGame(hostPage);
            // Nothing stored while connected.
            expect(await hostPage.evaluate(() => sessionStorage.getItem('quizix_host_reconnect'))).toBeNull();

            const before = Date.now();
            await dropTransport(hostPage);

            // The disconnect handler may trail the transport close: poll.
            await hostPage.waitForFunction(() => !!sessionStorage.getItem('quizix_host_reconnect'), null, { timeout: 5000 });
            const stored = await hostPage.evaluate(() => JSON.parse(sessionStorage.getItem('quizix_host_reconnect')));
            expect(stored.pin).toBe(pin);
            expect(typeof stored.token).toBe('string');
            expect(stored.token.length).toBeGreaterThan(0);
            expect(stored.savedAt).toBeGreaterThanOrEqual(before - 1000);
            expect(stored.savedAt).toBeLessThanOrEqual(Date.now());

            // Reconnect consumes the entry and host-rejoin restores the lobby.
            await hostPage.waitForFunction(() => sessionStorage.getItem('quizix_host_reconnect') === null, null, { timeout: 20000 });
            await waitForScreen(hostPage, 'game-lobby', 10000);
            expect(await hostPage.evaluate(() => window.game.socket.connected)).toBe(true);
            await expect(hostPage.locator('#game-pin .pin-digits')).toHaveText(pin);
        } finally {
            await hostCtx.close();
        }
    });

    test('players see the host-waiting overlay while the host is disconnected', async ({ browser }) => {
        const hostCtx = await createContext(browser, devices['Desktop Chrome']);
        const playerCtx = await createContext(browser, devices['iPhone 12']);
        const hostPage = await hostCtx.newPage();
        const playerPage = await playerCtx.newPage();

        try {
            const pin = await hostCreateGame(hostPage);
            await joinAsPlayer(playerPage, pin, 'Eli');
            await waitForPlayerCount(hostPage, 1);
            await startGame(hostPage, playerPage);

            await dropTransport(hostPage);

            await waitOverlay(playerPage, true, 8000);
            await expect(playerPage.locator('#reconnection-context')).toContainText(/host/i);

            await waitOverlay(playerPage, false, 20000);
            await expect(playerPage.locator('#reconnection-context')).toHaveText('');
        } finally {
            await hostCtx.close();
            await playerCtx.close();
        }
    });
});
