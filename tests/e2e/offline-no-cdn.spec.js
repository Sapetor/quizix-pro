// @ts-check
const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Offline acceptance: the app must work on a classroom network with no internet.
 *
 * Every request to a host other than localhost is aborted and recorded, so a
 * library that is still fetched from a CDN both fails to load (its feature
 * assertion fails) and shows up in the recorded list. Same-origin responses with
 * status >= 400 are recorded too: a vendored file that is referenced but missing
 * is a local 404, which "zero external requests" alone would not catch.
 *
 * Contexts block service workers. Playwright routes do not see fetches made by a
 * service worker, so with one active the recorder would miss requests. The
 * service-worker path is covered by sw-cdn-csp.spec.js.
 *
 * Run: PW_PORT=3511 npx playwright test tests/e2e/offline-no-cdn.spec.js --project=chromium --reporter=line
 */

const PORT = process.env.PW_PORT || 3000;
const ORIGIN = `http://localhost:${PORT}`;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

const QUIZ_TITLE = `Offline E2E ${Date.now()}`;
const QUIZ = {
    quiz: {
        title: QUIZ_TITLE,
        randomizeAnswers: false,
        powerUpsEnabled: false,
        questions: [
            {
                question: 'Simplify $\\frac{a x}{b x} + \\sqrt{2}$',
                type: 'multiple-choice',
                options: ['$\\frac{a}{b} + \\sqrt{2}$', '$a$', '$b$', '$x$'],
                correctAnswer: 0,
                timeLimit: 20,
            },
            {
                question: 'What does this print?\n```python\nfor i in range(3):\n    print(i)\n```',
                type: 'multiple-choice',
                options: ['0 1 2', '1 2 3', '3', 'Nothing'],
                correctAnswer: 0,
                timeLimit: 20,
            },
        ],
    },
};

/**
 * New context with service workers blocked, first-visit dialogs skipped, and a
 * recorder attached. Returns the context and its log.
 */
async function createRecordedContext(browser, device) {
    const context = await browser.newContext({
        ...(device || {}),
        serviceWorkers: 'block',
        acceptDownloads: true,
        storageState: {
            cookies: [],
            origins: [{
                origin: ORIGIN,
                localStorage: [
                    { name: 'language', value: 'en' },
                    { name: 'quiz_onboarding_complete', value: JSON.stringify({ completed: true, version: 3 }) },
                    { name: 'quiz_player_first_game', value: 'true' },
                ],
            }],
        },
    });

    const log = { external: [], localErrors: [], csp: [] };

    await context.route('**/*', (route) => {
        const url = route.request().url();
        if (!/^https?:/i.test(url)) return route.continue();
        if (LOCAL_HOSTS.has(new URL(url).hostname)) return route.continue();
        log.external.push(`${route.request().resourceType()} ${url}`);
        return route.abort('internetdisconnected');
    });

    context.on('response', (response) => {
        const url = new URL(response.url());
        if (!LOCAL_HOSTS.has(url.hostname)) return;
        if (response.status() >= 400 && !url.pathname.includes('/api/')) {
            log.localErrors.push(`${response.status()} ${url.pathname}`);
        }
    });

    // Chromium reports every CSP violation as a console error.
    context.on('console', (message) => {
        if (/Content Security Policy/i.test(message.text())) log.csp.push(message.text());
    });

    return { context, log };
}

/** URLs the page itself reports having fetched from another origin. */
async function crossOriginResourceEntries(page) {
    return page.evaluate(() =>
        window.performance.getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => /^https?:/i.test(name) && new URL(name).origin !== window.location.origin)
    );
}

/** Print what the recorder saw, so a failed feature assertion still shows the cause. */
function reportLog(label, log) {
    const hosts = [...new Set(log.external.map((entry) => new URL(entry.split(' ')[1]).host))];
    if (hosts.length > 0) console.log(`[${label}] external hosts requested: ${hosts.join(', ')}`);
    if (log.localErrors.length > 0) console.log(`[${label}] same-origin errors: ${log.localErrors.join(', ')}`);
    if (log.csp.length > 0) console.log(`[${label}] CSP violations: ${log.csp.join(' | ')}`);
}

function expectClean(label, log) {
    expect(log.external, `${label}: requests to external hosts:\n${log.external.join('\n')}`).toEqual([]);
    expect(log.localErrors, `${label}: same-origin error responses:\n${log.localErrors.join('\n')}`).toEqual([]);
    expect(log.csp, `${label}: CSP violations:\n${log.csp.join('\n')}`).toEqual([]);
}

async function waitForScreen(page, screenId, timeout = 30000) {
    await page.waitForSelector(`#${screenId}.active`, { timeout });
}

async function waitForApp(page) {
    await page.goto('/');
    await page.waitForSelector('body.loaded', { timeout: 15000 });
    await page.waitForFunction(() => window.game?.socket?.connected === true, null, { timeout: 15000 });
}

async function waitForMathJax(page) {
    await page.waitForFunction(
        () => !!(window.MathJax && window.MathJax.typesetPromise),
        null,
        { timeout: 20000 }
    );
}

/** MathJax webfonts by load status, after pending font loads settle. */
async function mathJaxFontStatus(page) {
    return page.evaluate(async () => {
        await document.fonts.ready;
        const faces = [...document.fonts].filter((face) => /^MJX/i.test(face.family));
        return {
            loaded: faces.filter((face) => face.status === 'loaded').length,
            failed: faces.filter((face) => face.status === 'error').map((face) => face.family),
        };
    });
}

test.describe('offline: no request leaves the local server', () => {
    test.skip(({ isMobile }) => isMobile, 'Hosting is desktop-only; the spec creates its own contexts.');
    test.setTimeout(180000);

    test('the Content-Security-Policy allows no external host', async ({ request }) => {
        const response = await request.get('/');
        const csp = response.headers()['content-security-policy'];
        expect(csp).toBeTruthy();
        expect(csp).not.toMatch(/https?:\/\//);
    });

    test('landing page loads every library and font locally', async ({ browser }) => {
        const { context, log } = await createRecordedContext(browser, devices['Desktop Chrome']);
        const page = await context.newPage();

        try {
            await waitForApp(page);
            await waitForMathJax(page);
            await page.waitForLoadState('networkidle');

            // Deferred classic scripts in <head>: each defines one global.
            const globals = await page.evaluate(() => ({
                io: typeof window.io,
                hljs: typeof window.hljs,
                Chart: typeof window.Chart,
                confetti: typeof window.confetti,
                XLSX: typeof window.XLSX,
            }));
            expect(globals).toEqual({
                io: 'function',
                hljs: 'object',
                Chart: 'function',
                confetti: 'function',
                XLSX: 'object',
            });

            // The four web font families index.html declares must resolve to a
            // face that loads. document.fonts.load() returns [] for a family with
            // no @font-face rule and rejects or reports 'error' if the file fails.
            const fonts = await page.evaluate(async () => {
                const families = ['Inter', 'Space Grotesk', 'JetBrains Mono', 'Source Serif 4'];
                const result = {};
                for (const family of families) {
                    const faces = await document.fonts.load(`400 16px "${family}"`, 'Quiz');
                    result[family] = faces.map((face) => face.status);
                }
                return result;
            });
            for (const [family, statuses] of Object.entries(fonts)) {
                expect(statuses.length, `${family}: no @font-face matched`).toBeGreaterThan(0);
                expect(statuses.every((status) => status === 'loaded'), `${family}: ${statuses}`).toBe(true);
            }

            // The atom-one-dark highlight.js theme is a separate stylesheet. The app's
            // own CSS overrides some of its declarations, so check the sheet itself.
            const themeRules = await page.evaluate(() => {
                const sheet = [...document.styleSheets].find((s) => (s.href || '').includes('atom-one-dark'));
                return sheet ? sheet.cssRules.length : 0;
            });
            expect(themeRules).toBeGreaterThan(0);

            // \cancel is not in the combined MathJax component. The autoloader fetches
            // input/tex/extensions/cancel.js (which pulls in enclose.js) at typeset
            // time, so this checks that the extensions directory was vendored and
            // that MathJax resolves it relative to its own script.
            const extensionResponse = page.waitForResponse(
                (response) => response.url().includes('/libs/mathjax/es5/input/tex/extensions/cancel.js'),
                { timeout: 15000 }
            );
            const cancelled = await page.evaluate(async () => {
                const el = document.createElement('div');
                el.textContent = '$\\cancel{x} + \\sqrt{2}$';
                document.body.appendChild(el);
                await window.MathJax.typesetPromise([el]);
                return {
                    menclose: el.querySelectorAll('mjx-menclose').length,
                    errors: el.querySelectorAll('mjx-merror, [data-mjx-error]').length,
                };
            });
            expect((await extensionResponse).status()).toBe(200);
            expect(cancelled).toEqual({ menclose: 1, errors: 0 });

            const mathFonts = await mathJaxFontStatus(page);
            expect(mathFonts.failed, `MathJax webfonts failed: ${mathFonts.failed.join(', ')}`).toEqual([]);
            expect(mathFonts.loaded).toBeGreaterThan(0);

            expect(await crossOriginResourceEntries(page)).toEqual([]);
            expectClean('landing', log);
        } finally {
            reportLog('landing', log);
            await context.close();
        }
    });

    test('host and one player reach results with LaTeX, code, chart, PDF and mermaid working', async ({ browser }) => {
        const host = await createRecordedContext(browser, devices['Desktop Chrome']);
        const player = await createRecordedContext(browser, devices['Pixel 7']);
        const hostPage = await host.context.newPage();
        const playerPage = await player.context.newPage();
        let resultFilename = null;

        try {
            // --- Host creates the game, player joins ---
            await waitForApp(hostPage);
            await hostPage.evaluate((quiz) => window.game.socket.emit('host-join', quiz), QUIZ);
            await waitForScreen(hostPage, 'game-lobby');
            const pin = (await hostPage.locator('#game-pin .pin-digits').textContent() || '').trim();
            expect(pin).toMatch(/^\d{6}$/);

            await waitForApp(playerPage);
            const mobileJoin = playerPage.locator('#join-btn-mobile');
            if (await mobileJoin.isVisible().catch(() => false)) {
                await mobileJoin.click();
            } else {
                await playerPage.locator('#join-btn').click();
            }
            await waitForScreen(playerPage, 'join-screen');
            await playerPage.fill('#game-pin-input', pin);
            await playerPage.fill('#player-name', 'Offline Ana');
            await playerPage.click('#join-game');
            await waitForScreen(playerPage, 'player-lobby');
            await hostPage.waitForSelector('#players-list .player-item:not(.placeholder)', { timeout: 15000 });

            await hostPage.evaluate(() => window.game.socket.emit('start-game'));
            await Promise.all([
                waitForScreen(hostPage, 'host-game-screen'),
                waitForScreen(playerPage, 'player-game-screen'),
            ]);

            // --- Question 1: LaTeX ---
            await expect(hostPage.locator('#current-question mjx-container').first()).toBeVisible({ timeout: 30000 });
            await expect(playerPage.locator('#player-question-text mjx-container').first()).toBeVisible({ timeout: 30000 });
            await expect(hostPage.locator('#current-question mjx-merror')).toHaveCount(0);
            await expect(playerPage.locator('#player-multiple-choice .player-option mjx-container').first()).toBeVisible();

            for (const [label, page] of [['host', hostPage], ['player', playerPage]]) {
                const status = await mathJaxFontStatus(page);
                expect(status.failed, `${label}: MathJax webfonts failed: ${status.failed.join(', ')}`).toEqual([]);
                expect(status.loaded, `${label}: no MathJax webfont loaded`).toBeGreaterThan(0);
            }

            await playerPage.click('#player-multiple-choice .player-option[data-option="0"]');
            const nextButton = hostPage.locator('#next-question-stats');
            await expect(nextButton).toBeVisible({ timeout: 30000 });
            await nextButton.click();

            // --- Question 2: code block ---
            await playerPage.waitForFunction(
                () => (document.querySelector('#player-question-counter')?.textContent || '').includes('2'),
                null,
                { timeout: 30000 }
            );
            for (const selector of ['#current-question', '#player-question-text']) {
                const page = selector === '#current-question' ? hostPage : playerPage;
                await expect(page.locator(`${selector} pre code.hljs`)).toBeVisible({ timeout: 30000 });
                // Token spans prove the grammar ran, not just that a class was set.
                await expect(page.locator(`${selector} pre code.hljs span[class^="hljs-"]`).first()).toBeAttached();
            }

            await playerPage.waitForSelector(
                '#player-multiple-choice .player-option:not(.disabled):not(.selected)',
                { timeout: 10000 }
            );
            await playerPage.click('#player-multiple-choice .player-option[data-option="0"]');
            await expect(nextButton).toBeVisible({ timeout: 30000 });
            await nextButton.click();

            // --- Game end ---
            await waitForScreen(hostPage, 'leaderboard-screen', 30000);
            await expect(hostPage.locator('#leaderboard-screen')).toContainText('Offline Ana');

            // --- Results: analytics chart ---
            await hostPage.evaluate(() => window.game.openResultsViewer());
            await hostPage.waitForSelector('#results-list .result-item', { timeout: 15000 });
            await hostPage.fill('#search-results', QUIZ_TITLE);
            const item = hostPage.locator('#results-list .result-item:visible').first();
            await expect(item).toContainText(QUIZ_TITLE);
            resultFilename = await item.getAttribute('data-filename');
            await item.locator('[data-action="analytics"]').click();

            const modal = hostPage.locator('#analytics-modal');
            await expect(modal).toBeVisible();
            await expect(modal.locator('#success-rate-chart')).toBeVisible();
            // The <canvas> is in the modal template whether or not Chart.js loaded;
            // a registered Chart instance is the evidence that it drew.
            await hostPage.waitForFunction(
                () => !!(window.Chart && window.Chart.getChart('success-rate-chart')),
                null,
                { timeout: 10000 }
            );

            // --- PDF export: lazy-loads jsPDF ---
            const [download] = await Promise.all([
                hostPage.waitForEvent('download', { timeout: 30000 }),
                modal.locator('[data-action="export-pdf"]').click(),
            ]);
            expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
            expect(await hostPage.evaluate(() => typeof window.jspdf?.jsPDF)).toBe('function');

            // --- Mermaid: lazy-loaded by the AI generator's diagram renderer ---
            const mermaidDataUrl = await hostPage.evaluate(async () => {
                const moduleUrl = new URL('js/ai/generator.js', document.baseURI).href;
                const { AIQuestionGenerator } = await import(moduleUrl);
                const proto = AIQuestionGenerator.prototype;
                return proto.renderMermaidToSVG.call(
                    { svgToDataURL: proto.svgToDataURL },
                    'graph TD; A[Start] --> B[End];'
                );
            });
            expect(mermaidDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);

            for (const [label, page, log] of [['host', hostPage, host.log], ['player', playerPage, player.log]]) {
                expect(await crossOriginResourceEntries(page), `${label}: cross-origin resource entries`).toEqual([]);
                expectClean(label, log);
            }
        } finally {
            reportLog('host', host.log);
            reportLog('player', player.log);
            await host.context.close();
            await player.context.close();
            if (resultFilename) {
                await fs.promises.rm(path.join(process.cwd(), 'results', path.basename(resultFilename)), { force: true });
            }
        }
    });
});
