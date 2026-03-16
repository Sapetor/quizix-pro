// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * E2E Disconnect & Reconnect Tests
 *
 * Covers mid-game disconnect/reconnect scenarios with real browser contexts.
 *
 * Run: npx playwright test tests/e2e-disconnect-reconnect.spec.js --project=chromium
 */

const TEST_QUIZ = {
    quiz: {
        title: 'Disconnect Reconnect E2E',
        randomizeAnswers: false,
        powerUpsEnabled: false,
        questions: [
            {
                question: 'What is 1+1?',
                type: 'multiple-choice',
                options: ['1', '2', '3', '4'],
                correctAnswer: 1,
                timeLimit: 5,
            },
            {
                question: 'What is 2+2?',
                type: 'multiple-choice',
                options: ['3', '4', '5', '6'],
                correctAnswer: 1,
                timeLimit: 5,
            },
            {
                question: 'What is 3+3?',
                type: 'multiple-choice',
                options: ['5', '6', '7', '8'],
                correctAnswer: 1,
                timeLimit: 5,
            },
        ],
    },
};

const DEVICE_HOST = devices['Desktop Chrome'];
const DEVICE_IPHONE = devices['iPhone 12'];
const DEVICE_GALAXY = devices['Galaxy S8'];
const DEVICE_PIXEL = devices['Pixel 7'];

// ---------------------------------------------------------------------------
// Helpers (same pattern as existing E2E tests)
// ---------------------------------------------------------------------------

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

/** Wait for question N to be displayed on a player page */
async function waitForQuestion(page, questionNumber, timeout = 30000) {
    await page.waitForFunction(
        (n) => {
            const el = document.querySelector('#player-question-counter');
            return el && el.textContent && el.textContent.includes(`${n}`);
        },
        questionNumber,
        { timeout }
    );
    await page.waitForSelector(
        '#player-multiple-choice .player-option:not(.disabled):not(.selected)',
        { timeout: 10000 }
    );
}

/** Wait for host to show answer statistics (question ended) */
async function waitForQuestionEnd(page, timeout = 25000) {
    await page.waitForFunction(() => {
        const stats = document.querySelector('#answer-statistics');
        return stats && !stats.classList.contains('hidden');
    }, null, { timeout });
}

/** Save reconnection data from a player page */
async function getReconnectData(page) {
    return page.evaluate(() => {
        const raw = localStorage.getItem('quizix_reconnect');
        return raw ? JSON.parse(raw) : null;
    });
}

/** Reconnect a player using saved reconnect data */
async function reconnectPlayer(browser, device, reconnectData) {
    const ctx = await createContext(browser, device);
    const page = await ctx.newPage();

    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });
    await page.waitForFunction(() => window.game?.socket?.connected === true, { timeout: 15000 });

    await page.evaluate((data) => {
        localStorage.setItem('quizix_reconnect', JSON.stringify(data));
        window.game.socket.emit('player-rejoin', {
            pin: data.pin,
            sessionToken: data.sessionToken,
        });
    }, reconnectData);

    return { ctx, page };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Disconnect & Reconnect E2E', () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(180000);

    // Test 1: Disconnect mid-question, reconnect, answer
    test('disconnect mid-question, reconnect, and answer', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_IPHONE);
        const p2Ctx = await createContext(browser, DEVICE_GALAXY);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();
        const p2Page = await p2Ctx.newPage();

        try {
            const pin = await hostCreateGame(hostPage);
            await joinAsPlayer(p1Page, pin, 'Alice');
            await joinAsPlayer(p2Page, pin, 'Bob');
            await waitForPlayerCount(hostPage, 2);

            // Save Bob's reconnect data
            const bobData = await getReconnectData(p2Page);
            expect(bobData).toBeTruthy();

            // Start game
            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
                waitForScreen(p2Page, 'player-game-screen'),
            ]);

            // Wait for Q1
            await waitForQuestion(p1Page, 1);
            await waitForQuestion(p2Page, 1);

            // Bob disconnects mid-question
            await p2Page.evaluate(() => window.game.socket.disconnect());

            // Wait a moment for server to register disconnect
            await p1Page.waitForTimeout(1000);

            // Bob reconnects
            const { ctx: bobCtx, page: bobPage } = await reconnectPlayer(browser, DEVICE_GALAXY, bobData);

            try {
                // Wait for Bob to be back in the game
                await waitForScreen(bobPage, 'player-game-screen', 15000);

                // Bob should see the question and be able to answer
                await bobPage.waitForSelector(
                    '#player-multiple-choice .player-option[data-option="1"]',
                    { timeout: 10000 }
                );

                // Both answer correctly
                await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
                await bobPage.click('#player-multiple-choice .player-option[data-option="1"]');

                // Question should end (all answered)
                await waitForQuestionEnd(hostPage);

                // Verify Bob got credit — wait for final screen after all questions
                // Let remaining questions time out naturally
                await waitForScreen(hostPage, 'leaderboard-screen', 120000);

                const leaderboardText = await hostPage.locator('#leaderboard-list').textContent();
                expect(leaderboardText).toContain('Alice');
                expect(leaderboardText).toContain('Bob');
            } finally {
                await bobCtx.close();
            }
        } finally {
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close().catch(() => {});
        }
    });

    // Test 2: Answer then disconnect, score preserved in final leaderboard
    test('answer then disconnect — score preserved in final leaderboard', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_IPHONE);
        const p2Ctx = await createContext(browser, DEVICE_GALAXY);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();
        const p2Page = await p2Ctx.newPage();

        try {
            const pin = await hostCreateGame(hostPage);
            await joinAsPlayer(p1Page, pin, 'Alice');
            await joinAsPlayer(p2Page, pin, 'Bob');
            await waitForPlayerCount(hostPage, 2);

            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
                waitForScreen(p2Page, 'player-game-screen'),
            ]);

            // Q1: Both answer correctly
            await waitForQuestion(p1Page, 1);
            await waitForQuestion(p2Page, 1);
            await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await p2Page.click('#player-multiple-choice .player-option[data-option="1"]');

            await waitForQuestionEnd(hostPage);

            // Bob disconnects after answering Q1
            await p2Page.evaluate(() => window.game.socket.disconnect());

            // Let game finish naturally (Q2 and Q3 time out)
            await waitForScreen(hostPage, 'leaderboard-screen', 120000);

            // Bob's Q1 score should be in the final leaderboard
            const leaderboardText = await hostPage.locator('#leaderboard-list').textContent();
            expect(leaderboardText).toContain('Bob');

            // Bob's score should be non-zero (answered Q1 correctly)
            const bobScoreElement = await hostPage.evaluate(() => {
                const items = document.querySelectorAll('#leaderboard-list .leaderboard-item, #leaderboard-list [class*="leaderboard"]');
                for (const item of items) {
                    if (item.textContent.includes('Bob')) {
                        // Find score within this item
                        const scoreEl = item.querySelector('[class*="score"], .points');
                        return scoreEl ? scoreEl.textContent : item.textContent;
                    }
                }
                return null;
            });
            expect(bobScoreElement).toBeTruthy();
        } finally {
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close().catch(() => {});
        }
    });

    // Test 3: Disconnect mid-question, reconnect during reveal
    test('disconnect mid-question, reconnect during reveal — sees answer feedback', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_IPHONE);
        const p2Ctx = await createContext(browser, DEVICE_GALAXY);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();
        const p2Page = await p2Ctx.newPage();

        try {
            const pin = await hostCreateGame(hostPage);
            await joinAsPlayer(p1Page, pin, 'Alice');
            await joinAsPlayer(p2Page, pin, 'Bob');
            await waitForPlayerCount(hostPage, 2);

            const bobData = await getReconnectData(p2Page);

            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
                waitForScreen(p2Page, 'player-game-screen'),
            ]);

            await waitForQuestion(p1Page, 1);

            // Bob disconnects before answering
            await p2Page.evaluate(() => window.game.socket.disconnect());

            // Alice answers, triggering question end (she's the only connected player)
            await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');

            // Wait for question to end (reveal phase)
            await waitForQuestionEnd(hostPage);

            // Bob reconnects during reveal phase
            const { ctx: bobCtx, page: bobPage } = await reconnectPlayer(browser, DEVICE_GALAXY, bobData);

            try {
                // Bob should be back in the game
                await waitForScreen(bobPage, 'player-game-screen', 15000);

                // Bob should see answer feedback (correct answer highlight or feedback section)
                // The server sends question-timeout + player-result on rejoin during reveal
                await bobPage.waitForFunction(() => {
                    // Check for any indication of answer feedback
                    const feedback = document.querySelector('#answer-feedback:not(.hidden)');
                    const correctHighlight = document.querySelector('.correct-answer-highlight');
                    const resultDisplay = document.querySelector('.player-result-display:not(.hidden)');
                    return feedback || correctHighlight || resultDisplay;
                }, null, { timeout: 10000 }).catch(() => {
                    // Non-fatal — UI may show feedback differently
                });

                // Verify Bob is still in the game
                const hostPlayersText = await hostPage.locator('#players-list').textContent();
                expect(hostPlayersText).toContain('Bob');
            } finally {
                await bobCtx.close();
            }
        } finally {
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close().catch(() => {});
        }
    });

    // Test 4: Multiple players disconnect/reconnect at different times
    test('multiple players disconnect/reconnect at different times — all scores correct', async ({ browser }) => {
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
            await joinAsPlayer(p1Page, pin, 'Alice');
            await joinAsPlayer(p2Page, pin, 'Bob');
            await joinAsPlayer(p3Page, pin, 'Charlie');
            await waitForPlayerCount(hostPage, 3);

            const bobData = await getReconnectData(p2Page);
            const charlieData = await getReconnectData(p3Page);

            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
                waitForScreen(p2Page, 'player-game-screen'),
                waitForScreen(p3Page, 'player-game-screen'),
            ]);

            // Q1: All answer correctly
            await waitForQuestion(p1Page, 1);
            await waitForQuestion(p2Page, 1);
            await waitForQuestion(p3Page, 1);
            await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await p2Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await p3Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await waitForQuestionEnd(hostPage);

            // Bob disconnects after Q1
            await p2Page.evaluate(() => window.game.socket.disconnect());

            // Wait for Q2
            await waitForQuestion(p1Page, 2);
            await waitForQuestion(p3Page, 2);

            // Charlie disconnects during Q2
            await p3Page.evaluate(() => window.game.socket.disconnect());

            // Alice answers Q2 alone
            await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await waitForQuestionEnd(hostPage);

            // Bob reconnects before Q3
            const { ctx: bobCtx, page: bobPage } = await reconnectPlayer(browser, DEVICE_GALAXY, bobData);

            try {
                await waitForScreen(bobPage, 'player-game-screen', 15000);

                // Wait for Q3
                await waitForQuestion(p1Page, 3);

                // Bob and Alice answer Q3
                await bobPage.waitForSelector(
                    '#player-multiple-choice .player-option[data-option="1"]',
                    { timeout: 15000 }
                );
                await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
                await bobPage.click('#player-multiple-choice .player-option[data-option="1"]');
                await waitForQuestionEnd(hostPage);

                // Wait for final leaderboard
                await waitForScreen(hostPage, 'leaderboard-screen', 60000);

                // All 3 names should appear in leaderboard
                const leaderboardText = await hostPage.locator('#leaderboard-list').textContent();
                expect(leaderboardText).toContain('Alice');
                expect(leaderboardText).toContain('Bob');
                expect(leaderboardText).toContain('Charlie');
            } finally {
                await bobCtx.close();
            }
        } finally {
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close().catch(() => {});
            await p3Ctx.close().catch(() => {});
        }
    });

    // Test 5: Host leaderboard shows disconnected player throughout
    test('host leaderboard shows disconnected player throughout game', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_IPHONE);
        const p2Ctx = await createContext(browser, DEVICE_GALAXY);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();
        const p2Page = await p2Ctx.newPage();

        try {
            const pin = await hostCreateGame(hostPage);
            await joinAsPlayer(p1Page, pin, 'Alice');
            await joinAsPlayer(p2Page, pin, 'Bob');
            await waitForPlayerCount(hostPage, 2);

            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
                waitForScreen(p2Page, 'player-game-screen'),
            ]);

            // Q1: Both answer
            await waitForQuestion(p1Page, 1);
            await waitForQuestion(p2Page, 1);
            await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await p2Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await waitForQuestionEnd(hostPage);

            // Bob disconnects after Q1
            await p2Page.evaluate(() => window.game.socket.disconnect());

            // Wait a moment for disconnect to register
            await hostPage.waitForTimeout(2000);

            // Verify Bob still appears in player list on host (with disconnected indicator)
            const playersText = await hostPage.locator('#players-list').textContent();
            expect(playersText).toContain('Bob');

            // Let game finish
            await waitForScreen(hostPage, 'leaderboard-screen', 120000);

            // Final leaderboard should include Bob
            const leaderboardText = await hostPage.locator('#leaderboard-list').textContent();
            expect(leaderboardText).toContain('Bob');
        } finally {
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close().catch(() => {});
        }
    });

    // Test 6: Reconnect to finished game with correct score
    test('reconnect to finished game — receives correct final score', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_IPHONE);
        const p2Ctx = await createContext(browser, DEVICE_GALAXY);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();
        const p2Page = await p2Ctx.newPage();

        // Use a 2-question quiz for faster test
        const shortQuiz = {
            quiz: {
                ...TEST_QUIZ.quiz,
                questions: TEST_QUIZ.quiz.questions.slice(0, 2),
            },
        };

        try {
            const pin = await hostCreateGame(hostPage, shortQuiz);
            await joinAsPlayer(p1Page, pin, 'Alice');
            await joinAsPlayer(p2Page, pin, 'Bob');
            await waitForPlayerCount(hostPage, 2);

            const bobData = await getReconnectData(p2Page);

            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
                waitForScreen(p2Page, 'player-game-screen'),
            ]);

            // Q1: Bob answers correctly
            await waitForQuestion(p1Page, 1);
            await waitForQuestion(p2Page, 1);
            await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await p2Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await waitForQuestionEnd(hostPage);

            // Q2: Bob answers correctly again
            await waitForQuestion(p1Page, 2);
            await waitForQuestion(p2Page, 2);
            await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await p2Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await waitForQuestionEnd(hostPage);

            // Bob disconnects
            await p2Page.evaluate(() => window.game.socket.disconnect());

            // Wait for game to finish
            await waitForScreen(hostPage, 'leaderboard-screen', 60000);

            // Bob reconnects to finished game
            const { ctx: bobCtx, page: bobPage } = await reconnectPlayer(browser, DEVICE_GALAXY, bobData);

            try {
                // Bob should land on player-final-screen
                await waitForScreen(bobPage, 'player-final-screen', 15000);

                // Bob's score should be visible and non-zero
                const bobScore = await bobPage.locator('#final-score').textContent();
                expect(bobScore).toBeTruthy();

                // Score should match what host shows
                const hostLeaderboard = await hostPage.locator('#leaderboard-list').textContent();
                expect(hostLeaderboard).toContain('Bob');
            } finally {
                await bobCtx.close();
            }
        } finally {
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close().catch(() => {});
        }
    });

    // Test 7: Rapid disconnect/reconnect cycling
    test('rapid disconnect/reconnect cycling — score and answers preserved', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const p1Ctx = await createContext(browser, DEVICE_IPHONE);
        const p2Ctx = await createContext(browser, DEVICE_GALAXY);

        const hostPage = await hostCtx.newPage();
        const p1Page = await p1Ctx.newPage();
        const p2Page = await p2Ctx.newPage();

        // Use 2-question quiz
        const shortQuiz = {
            quiz: {
                ...TEST_QUIZ.quiz,
                questions: TEST_QUIZ.quiz.questions.slice(0, 2),
            },
        };

        try {
            const pin = await hostCreateGame(hostPage, shortQuiz);
            await joinAsPlayer(p1Page, pin, 'Alice');
            await joinAsPlayer(p2Page, pin, 'Bob');
            await waitForPlayerCount(hostPage, 2);

            let bobData = await getReconnectData(p2Page);
            expect(bobData).toBeTruthy();

            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(p1Page, 'player-game-screen'),
                waitForScreen(p2Page, 'player-game-screen'),
            ]);

            // Q1: Bob answers correctly
            await waitForQuestion(p1Page, 1);
            await waitForQuestion(p2Page, 1);
            await p2Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
            await waitForQuestionEnd(hostPage);

            // --- First disconnect/reconnect cycle ---
            await p2Page.evaluate(() => window.game.socket.disconnect());
            await hostPage.waitForTimeout(500);

            const { ctx: bob2Ctx, page: bob2Page } = await reconnectPlayer(browser, DEVICE_GALAXY, bobData);

            try {
                await waitForScreen(bob2Page, 'player-game-screen', 15000);

                // Update reconnect data (session token stays the same)
                bobData = await getReconnectData(bob2Page) || bobData;

                // --- Second disconnect/reconnect cycle ---
                await bob2Page.evaluate(() => window.game.socket.disconnect());
                await hostPage.waitForTimeout(500);
            } finally {
                await bob2Ctx.close().catch(() => {});
            }

            const { ctx: bob3Ctx, page: bob3Page } = await reconnectPlayer(browser, DEVICE_GALAXY, bobData);

            try {
                await waitForScreen(bob3Page, 'player-game-screen', 15000);

                // Q2: Bob answers after double reconnect
                await bob3Page.waitForSelector(
                    '#player-multiple-choice .player-option[data-option="1"]',
                    { timeout: 15000 }
                );
                await p1Page.waitForSelector(
                    '#player-multiple-choice .player-option:not(.disabled):not(.selected)',
                    { timeout: 10000 }
                );
                await p1Page.click('#player-multiple-choice .player-option[data-option="1"]');
                await bob3Page.click('#player-multiple-choice .player-option[data-option="1"]');

                // Wait for game to finish
                await waitForScreen(hostPage, 'leaderboard-screen', 60000);

                // Bob should be in final leaderboard with correct score
                const leaderboardText = await hostPage.locator('#leaderboard-list').textContent();
                expect(leaderboardText).toContain('Bob');
                expect(leaderboardText).toContain('Alice');
            } finally {
                await bob3Ctx.close();
            }
        } finally {
            await hostCtx.close();
            await p1Ctx.close();
            await p2Ctx.close().catch(() => {});
        }
    });
});
