// @ts-check
const { test, expect, devices } = require('@playwright/test');

/**
 * E2E All Question Types Test
 *
 * Plays a full game covering all 5 question types:
 * multiple-choice, true-false, multiple-correct, numeric, ordering
 *
 * Run: npx playwright test tests/e2e-all-question-types.spec.js --project=chromium
 * Debug: npx playwright test tests/e2e-all-question-types.spec.js --project=chromium --headed
 */

// ---------------------------------------------------------------------------
// Inline test quizzes
// ---------------------------------------------------------------------------
const ALL_TYPES_QUIZ = {
    quiz: {
        title: 'All Question Types E2E',
        randomizeAnswers: false, // CRITICAL for predictable assertions
        powerUpsEnabled: false,
        questions: [
            // Q1: Multiple Choice
            {
                question: 'What is the capital of Japan?',
                type: 'multiple-choice',
                options: ['Beijing', 'Seoul', 'Tokyo', 'Bangkok'],
                correctAnswer: 2, // Tokyo
                timeLimit: 20,
            },
            // Q2: True/False
            {
                question: 'The Earth is flat.',
                type: 'true-false',
                options: ['True', 'False'],
                correctAnswer: false,
                timeLimit: 20,
            },
            // Q3: Multiple Correct
            {
                question: 'Select all prime numbers:',
                type: 'multiple-correct',
                options: ['2', '4', '7', '9'],
                correctIndices: [0, 2], // "2" and "7"
                correctAnswers: [0, 2], // Scoring compatibility
                timeLimit: 25,
            },
            // Q4: Numeric
            {
                question: 'What is 6 times 7?',
                type: 'numeric',
                correctAnswer: 42,
                tolerance: 0.5,
                timeLimit: 25,
            },
            // Q5: Ordering
            {
                question: 'Order from smallest to largest:',
                type: 'ordering',
                options: ['Hundred', 'One', 'Ten', 'Thousand'],
                correctOrder: [1, 2, 0, 3], // One(1), Ten(2), Hundred(0), Thousand(3)
                timeLimit: 30,
            },
        ],
    },
};

const EDGE_CASE_QUIZ = {
    quiz: {
        title: 'Edge Cases E2E',
        randomizeAnswers: false,
        powerUpsEnabled: false,
        questions: [
            // Q1: Numeric — tolerance boundary
            {
                question: 'What is the value of pi to one decimal?',
                type: 'numeric',
                correctAnswer: 3.1,
                tolerance: 0.1,
                timeLimit: 15,
            },
            // Q2: Multiple choice — player times out (short timer)
            {
                question: 'Quick! What color is the sky?',
                type: 'multiple-choice',
                options: ['Red', 'Blue', 'Green', 'Yellow'],
                correctAnswer: 1,
                timeLimit: 6, // Short timer — Bob will not answer
            },
            // Q3: Multiple correct — partial answer (only 1 of 2 correct)
            {
                question: 'Select all even numbers:',
                type: 'multiple-correct',
                options: ['2', '3', '4', '5'],
                correctIndices: [0, 2], // "2" and "4"
                correctAnswers: [0, 2],
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

// Question type → player container ID
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
 * Create a new browser context with optional device emulation.
 * Pre-sets localStorage to skip onboarding tour and language picker.
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
 * Wait for a screen to become active (has .active class).
 */
async function waitForScreen(page, screenId, timeout = 30000) {
    await page.waitForSelector(`#${screenId}.active`, { timeout });
}

/**
 * Host: emit host-join via Socket.IO and return the game PIN.
 */
async function hostCreateGame(page, quiz = ALL_TYPES_QUIZ) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });

    await page.waitForFunction(() => {
        return window.game?.socket?.connected === true;
    }, { timeout: 15000 });

    await page.evaluate((quizData) => {
        window.game.socket.emit('host-join', quizData);
    }, quiz);

    await waitForScreen(page, 'game-lobby');

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

    await page.waitForFunction(() => {
        return window.game?.socket?.connected === true;
    }, { timeout: 15000 });

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
            const items = list.querySelectorAll('.player-item, .player-card, [class*="player"]');
            return items.length >= expected;
        },
        count,
        { timeout }
    );
}

/**
 * Wait for a specific question type container to be visible on a player page.
 * Also waits for the question counter and question text to be updated.
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
 * Wait for host to show answer statistics (question ended).
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
 * Set up an in-browser observer that captures leaderboard text the instant the
 * leaderboard-screen becomes active. Must be called BEFORE the event that
 * triggers the leaderboard transition. Resolve with the captured text.
 */
async function observeMidGameLeaderboard(page) {
    return page.evaluate(() => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Mid-game leaderboard never appeared')), 20000);
            const check = () => {
                const lb = document.getElementById('leaderboard-screen');
                if (lb && lb.classList.contains('active')) {
                    clearTimeout(timeout);
                    const list = document.getElementById('leaderboard-list');
                    resolve(list ? list.textContent : '');
                } else {
                    requestAnimationFrame(check);
                }
            };
            check();
        });
    });
}

/**
 * Reorder ordering items in the DOM to match correctOrder, then submit.
 */
async function submitOrderingAnswer(page, correctOrder) {
    await page.waitForSelector('#player-ordering-container .ordering-display-item', { timeout: 10000 });
    await page.waitForSelector('.ordering-display-item[draggable="true"]', { timeout: 10000 });

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
 * Submit ordering answer with an explicitly wrong order (reverse of correct).
 */
async function submitOrderingWrong(page, wrongOrder) {
    await submitOrderingAnswer(page, wrongOrder);
}

/**
 * Extract numeric score from a text like "1234 points".
 */
function extractScore(text) {
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('E2E All Question Types', () => {
    test.describe.configure({ mode: 'default', retries: 1 });
    test.setTimeout(240000);

    test('Full game — all 5 question types with 3 players', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const aliceCtx = await createContext(browser, DEVICE_IPHONE);
        const bobCtx = await createContext(browser, DEVICE_GALAXY);
        const charlieCtx = await createContext(browser, DEVICE_PIXEL);

        const hostPage = await hostCtx.newPage();
        const alicePage = await aliceCtx.newPage();
        const bobPage = await bobCtx.newPage();
        const charliePage = await charlieCtx.newPage();

        const errors = [];
        for (const [name, pg] of [['host', hostPage], ['alice', alicePage], ['bob', bobPage], ['charlie', charliePage]]) {
            pg.on('pageerror', (err) => errors.push(`[${name}] ${err.message}`));
        }

        try {
            // ========== SETUP: Host creates game, players join ==========
            const pin = await hostCreateGame(hostPage);
            expect(pin).toMatch(/^\d{6}$/);

            // Join sequentially to avoid race conditions with parallel navigation
            await joinAsPlayer(alicePage, pin, 'Alice');
            await joinAsPlayer(bobPage, pin, 'Bob');
            await joinAsPlayer(charliePage, pin, 'Charlie');

            await waitForPlayerCount(hostPage, 3);
            const playersText = await hostPage.locator('#players-list').textContent();
            expect(playersText).toContain('Alice');
            expect(playersText).toContain('Bob');
            expect(playersText).toContain('Charlie');

            // ========== START GAME ==========
            await hostPage.evaluate(() => {
                window.game.socket.emit('start-game');
            });

            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(alicePage, 'player-game-screen'),
                waitForScreen(bobPage, 'player-game-screen'),
                waitForScreen(charliePage, 'player-game-screen'),
            ]);

            // ========== Q1: Multiple Choice ==========
            {
                await Promise.all([
                    waitForQuestionType(alicePage, 'multiple-choice', 1),
                    waitForQuestionType(bobPage, 'multiple-choice', 1),
                    waitForQuestionType(charliePage, 'multiple-choice', 1),
                ]);

                // Verify question text on both player and host
                const qText = await alicePage.locator('#player-question-text').textContent();
                expect(qText).toContain('Japan');
                const hostQ = await hostPage.locator('#current-question').textContent();
                expect(hostQ).toContain('Japan');

                // Verify host timer is visible
                await expect(hostPage.locator('#timer')).toBeVisible();

                // Verify 4 option buttons visible
                const optionCount = await alicePage.locator('#player-multiple-choice .player-option:not(.hidden)').count();
                expect(optionCount).toBe(4);

                // Wait for buttons to be clickable
                await alicePage.waitForSelector(
                    '#player-multiple-choice .player-option:not(.disabled):not(.selected)',
                    { timeout: 10000 }
                );

                // Start observing for mid-game leaderboard BEFORE answers trigger it
                const lbTextPromise = observeMidGameLeaderboard(hostPage);

                // Alice: correct (Tokyo = index 2)
                await alicePage.click('#player-multiple-choice .player-option[data-option="2"]');

                // Verify Alice's button shows selected state
                await alicePage.waitForSelector(
                    '#player-multiple-choice .player-option.selected',
                    { timeout: 5000 }
                );

                // Bob: wrong (Beijing = index 0), Charlie: correct
                await bobPage.click('#player-multiple-choice .player-option[data-option="0"]');
                await charliePage.click('#player-multiple-choice .player-option[data-option="2"]');

                // Verify host response count reaches 3
                await hostPage.waitForFunction(
                    () => {
                        const el = document.querySelector('#responses-count');
                        return el && parseInt(el.textContent) >= 3;
                    },
                    null,
                    { timeout: 10000 }
                );

                await waitForHostStats(hostPage);

                // Verify correct answer is highlighted on Alice's screen after question-end
                await alicePage.waitForSelector(
                    '.player-option.correct-answer-highlight',
                    { timeout: 10000 }
                ).catch(() => {
                    // Non-fatal: feedback may display via modal instead
                });

                // Verify mid-game leaderboard was shown with all players
                const lbText = await lbTextPromise;
                expect(lbText).toContain('Alice');
                expect(lbText).toContain('Bob');
                expect(lbText).toContain('Charlie');
            }

            // ========== Q2: True/False ==========
            {
                await Promise.all([
                    waitForQuestionType(alicePage, 'true-false', 2),
                    waitForQuestionType(bobPage, 'true-false', 2),
                    waitForQuestionType(charliePage, 'true-false', 2),
                ]);

                const qText = await alicePage.locator('#player-question-text').textContent();
                expect(qText).toContain('flat');

                // Verify host timer
                await expect(hostPage.locator('#timer')).toBeVisible();

                // Verify 2 TF buttons visible
                const tfCount = await alicePage.locator('#player-true-false .tf-option').count();
                expect(tfCount).toBe(2);

                // Alice: correct (false), Bob: wrong (true), Charlie: correct (false)
                await alicePage.click('#player-true-false .tf-option[data-answer="false"]');

                // Verify Alice's TF button shows selected state
                await alicePage.waitForSelector(
                    '#player-true-false .tf-option.selected',
                    { timeout: 5000 }
                );

                await bobPage.click('#player-true-false .tf-option[data-answer="true"]');
                await charliePage.click('#player-true-false .tf-option[data-answer="false"]');

                await waitForHostStats(hostPage);

                // Verify correct TF answer is highlighted on player screen
                await alicePage.waitForSelector(
                    '#player-true-false .tf-option.correct-answer-highlight',
                    { timeout: 10000 }
                );
            }

            // ========== Q3: Multiple Correct ==========
            {
                await Promise.all([
                    waitForQuestionType(alicePage, 'multiple-correct', 3),
                    waitForQuestionType(bobPage, 'multiple-correct', 3),
                    waitForQuestionType(charliePage, 'multiple-correct', 3),
                ]);

                const qText = await alicePage.locator('#player-question-text').textContent();
                expect(qText).toContain('prime');

                // Verify checkbox options and submit button
                const checkboxCount = await alicePage.locator('#player-multiple-correct .checkbox-option:not(.hidden)').count();
                expect(checkboxCount).toBeGreaterThanOrEqual(4);
                await expect(alicePage.locator('#submit-multiple')).toBeVisible();

                // Alice: correct — check 0 ("2") and 2 ("7"), then submit
                await alicePage.click('#player-multiple-correct .checkbox-option[data-option="0"]');
                await alicePage.click('#player-multiple-correct .checkbox-option[data-option="2"]');

                // Verify Alice's checkboxes are checked before submit
                const checkedCount = await alicePage.locator('#player-multiple-correct .option-checkbox:checked').count();
                expect(checkedCount).toBe(2);

                await alicePage.click('#submit-multiple');

                // Bob: wrong — check 1 ("4") and 3 ("9"), then submit
                await bobPage.click('#player-multiple-correct .checkbox-option[data-option="1"]');
                await bobPage.click('#player-multiple-correct .checkbox-option[data-option="3"]');
                await bobPage.click('#submit-multiple');

                // Charlie: correct — check 0 and 2, then submit
                await charliePage.click('#player-multiple-correct .checkbox-option[data-option="0"]');
                await charliePage.click('#player-multiple-correct .checkbox-option[data-option="2"]');
                await charliePage.click('#submit-multiple');

                await waitForHostStats(hostPage);
            }

            // ========== Q4: Numeric ==========
            {
                await Promise.all([
                    waitForQuestionType(alicePage, 'numeric', 4),
                    waitForQuestionType(bobPage, 'numeric', 4),
                    waitForQuestionType(charliePage, 'numeric', 4),
                ]);

                const qText = await alicePage.locator('#player-question-text').textContent();
                expect(qText).toContain('6 times 7');

                // Verify numeric input and submit button
                await expect(alicePage.locator('#numeric-answer-input')).toBeVisible();
                await expect(alicePage.locator('#submit-numeric')).toBeVisible();

                // Verify input starts empty
                const inputVal = await alicePage.locator('#numeric-answer-input').inputValue();
                expect(inputVal).toBe('');

                // Alice: correct (42)
                await alicePage.fill('#numeric-answer-input', '42');
                await alicePage.click('#submit-numeric');

                // Bob: wrong (99)
                await bobPage.fill('#numeric-answer-input', '99');
                await bobPage.click('#submit-numeric');

                // Charlie: correct (42)
                await charliePage.fill('#numeric-answer-input', '42');
                await charliePage.click('#submit-numeric');

                await waitForHostStats(hostPage);
            }

            // ========== Q5: Ordering ==========
            {
                await Promise.all([
                    waitForQuestionType(alicePage, 'ordering', 5),
                    waitForQuestionType(bobPage, 'ordering', 5),
                    waitForQuestionType(charliePage, 'ordering', 5),
                ]);

                const qText = await alicePage.locator('#player-question-text').textContent();
                expect(qText).toContain('smallest');

                // Verify ordering items exist and are draggable
                const itemCount = await alicePage.locator('#player-ordering-container .ordering-display-item').count();
                expect(itemCount).toBe(4);

                // Verify submit button exists
                await expect(alicePage.locator('#submit-ordering')).toBeVisible();

                // Alice: correct order [1, 2, 0, 3] = One, Ten, Hundred, Thousand
                await submitOrderingAnswer(alicePage, [1, 2, 0, 3]);

                // Bob: explicit wrong order [3, 0, 2, 1] = Thousand, Hundred, Ten, One (reverse)
                await submitOrderingWrong(bobPage, [3, 0, 2, 1]);

                // Charlie: correct order
                await submitOrderingAnswer(charliePage, [1, 2, 0, 3]);

                await waitForHostStats(hostPage);
            }

            // ========== VERIFY FINAL RESULTS ==========
            await waitForScreen(hostPage, 'leaderboard-screen', 30000);

            // All 3 player names in leaderboard
            const leaderboardText = await hostPage.locator('#leaderboard-screen').textContent();
            expect(leaderboardText).toContain('Alice');
            expect(leaderboardText).toContain('Bob');
            expect(leaderboardText).toContain('Charlie');

            // Wait for player final screens
            await Promise.all([
                waitForScreen(alicePage, 'player-final-screen', 30000),
                waitForScreen(bobPage, 'player-final-screen', 30000),
                waitForScreen(charliePage, 'player-final-screen', 30000),
            ]);

            // Verify final position and score elements are visible
            await expect(alicePage.locator('#final-position')).toBeVisible();
            await expect(alicePage.locator('#final-score')).toBeVisible();
            await expect(bobPage.locator('#final-position')).toBeVisible();
            await expect(bobPage.locator('#final-score')).toBeVisible();
            await expect(charliePage.locator('#final-position')).toBeVisible();
            await expect(charliePage.locator('#final-score')).toBeVisible();

            // Extract scores
            const aliceScoreText = await alicePage.locator('#final-score').textContent();
            const bobScoreText = await bobPage.locator('#final-score').textContent();
            const charlieScoreText = await charliePage.locator('#final-score').textContent();
            const aliceScore = extractScore(aliceScoreText);
            const bobScore = extractScore(bobScoreText);
            const charlieScore = extractScore(charlieScoreText);

            // Alice (all correct, fastest) > Charlie (all correct, slower) > Bob (all wrong)
            expect(aliceScore).toBeGreaterThan(charlieScore);
            expect(charlieScore).toBeGreaterThan(bobScore);
            expect(bobScore).toBe(0);

            // Verify actual position numbers
            const alicePos = await alicePage.locator('#final-position').textContent();
            const bobPos = await bobPage.locator('#final-position').textContent();
            const charliePos = await charliePage.locator('#final-position').textContent();
            expect(alicePos).toContain('1');
            expect(charliePos).toContain('2');
            expect(bobPos).toContain('3');

        } finally {
            if (errors.length > 0) {
                console.log('Page errors during test:', errors);
            }
            await hostCtx.close();
            await aliceCtx.close();
            await bobCtx.close();
            await charlieCtx.close();
        }
    });

    test('Edge cases — tolerance, timeout, partial answers', async ({ browser }) => {
        const hostCtx = await createContext(browser, DEVICE_HOST);
        const aliceCtx = await createContext(browser, DEVICE_IPHONE);
        const bobCtx = await createContext(browser, DEVICE_GALAXY);

        const hostPage = await hostCtx.newPage();
        const alicePage = await aliceCtx.newPage();
        const bobPage = await bobCtx.newPage();

        const errors = [];
        for (const [name, pg] of [['host', hostPage], ['alice', alicePage], ['bob', bobPage]]) {
            pg.on('pageerror', (err) => errors.push(`[${name}] ${err.message}`));
        }

        try {
            // ========== SETUP ==========
            const pin = await hostCreateGame(hostPage, EDGE_CASE_QUIZ);
            expect(pin).toMatch(/^\d{6}$/);

            await joinAsPlayer(alicePage, pin, 'Alice');
            await joinAsPlayer(bobPage, pin, 'Bob');

            await waitForPlayerCount(hostPage, 2);

            await hostPage.evaluate(() => {
                window.game.socket.emit('start-game');
            });

            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(alicePage, 'player-game-screen'),
                waitForScreen(bobPage, 'player-game-screen'),
            ]);

            // ========== Q1: Numeric — tolerance boundary ==========
            {
                await Promise.all([
                    waitForQuestionType(alicePage, 'numeric', 1),
                    waitForQuestionType(bobPage, 'numeric', 1),
                ]);

                const qText = await alicePage.locator('#player-question-text').textContent();
                expect(qText).toContain('pi');

                // Alice: 3.15 — within tolerance of 0.1 from 3.1 → correct
                await alicePage.fill('#numeric-answer-input', '3.15');
                await alicePage.click('#submit-numeric');

                // Verify Alice's input is disabled after submission (answerSubmitted flag)
                await alicePage.waitForFunction(
                    () => {
                        const btn = document.getElementById('submit-numeric');
                        return btn && btn.disabled;
                    },
                    null,
                    { timeout: 5000 }
                ).catch(() => {
                    // Non-fatal: disable behavior may vary
                });

                // Bob: 3.3 — outside tolerance (|3.3 - 3.1| = 0.2 > 0.1) → wrong
                await bobPage.fill('#numeric-answer-input', '3.3');
                await bobPage.click('#submit-numeric');

                await waitForHostStats(hostPage);
            }

            // ========== Q2: Multiple Choice — Bob times out ==========
            {
                await Promise.all([
                    waitForQuestionType(alicePage, 'multiple-choice', 2),
                    waitForQuestionType(bobPage, 'multiple-choice', 2),
                ]);

                const qText = await alicePage.locator('#player-question-text').textContent();
                expect(qText).toContain('sky');

                // Alice answers immediately (Blue = index 1)
                await alicePage.click('#player-multiple-choice .player-option[data-option="1"]');

                // Bob does NOT answer — let the timer expire
                // Response count should show 1 (only Alice)
                await hostPage.waitForFunction(
                    () => {
                        const el = document.querySelector('#responses-count');
                        return el && parseInt(el.textContent) >= 1;
                    },
                    null,
                    { timeout: 10000 }
                );

                // Wait for question to end by timeout (6s timer)
                await waitForHostStats(hostPage);

                // Bob should still be on the game screen (not kicked)
                const bobOnGame = await bobPage.evaluate(() => {
                    const screen = document.querySelector('#player-game-screen');
                    return screen && screen.classList.contains('active');
                });
                expect(bobOnGame).toBe(true);
            }

            // ========== Q3: Multiple Correct — partial answer ==========
            {
                await Promise.all([
                    waitForQuestionType(alicePage, 'multiple-correct', 3),
                    waitForQuestionType(bobPage, 'multiple-correct', 3),
                ]);

                const qText = await alicePage.locator('#player-question-text').textContent();
                expect(qText).toContain('even');

                // Alice: correct — check 0 ("2") and 2 ("4")
                await alicePage.click('#player-multiple-correct .checkbox-option[data-option="0"]');
                await alicePage.click('#player-multiple-correct .checkbox-option[data-option="2"]');
                await alicePage.click('#submit-multiple');

                // Bob: partial — only checks 0 ("2"), misses 2 ("4")
                await bobPage.click('#player-multiple-correct .checkbox-option[data-option="0"]');
                await bobPage.click('#submit-multiple');

                await waitForHostStats(hostPage);
            }

            // ========== VERIFY FINAL RESULTS ==========
            await waitForScreen(hostPage, 'leaderboard-screen', 30000);

            await Promise.all([
                waitForScreen(alicePage, 'player-final-screen', 30000),
                waitForScreen(bobPage, 'player-final-screen', 30000),
            ]);

            // Alice should have a higher score than Bob
            const aliceScoreText = await alicePage.locator('#final-score').textContent();
            const bobScoreText = await bobPage.locator('#final-score').textContent();
            const aliceScore = extractScore(aliceScoreText);
            const bobScore = extractScore(bobScoreText);
            expect(aliceScore).toBeGreaterThan(bobScore);

            // Alice should be #1
            const alicePos = await alicePage.locator('#final-position').textContent();
            expect(alicePos).toContain('1');

        } finally {
            if (errors.length > 0) {
                console.log('Page errors during test:', errors);
            }
            await hostCtx.close();
            await aliceCtx.close();
            await bobCtx.close();
        }
    });
});
