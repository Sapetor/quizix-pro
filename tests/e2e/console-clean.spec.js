const { test, expect } = require('@playwright/test');

/**
 * Regressions for three console messages seen in a real host session.
 *
 * 1. canvas-confetti builds its worker from a blob: URL. worker-src was unset, so
 *    it fell back to script-src (no blob:) and every celebration logged a CSP
 *    violation. Fixed by the explicit worker-src in server.js.
 * 2. connection-status.js never read the /api/ping response body, so the request
 *    was still open when its own 5s AbortSignal fired and killed it —
 *    "Fetch failed loading: GET /api/ping" on every load.
 * 3. app.js / translation-manager.js were preloaded with `as="script"` and a ?v=
 *    query, but main.js imports them as modules with no query, so the preloads
 *    never matched ("preloaded but not used"). Now rel="modulepreload".
 */
test.describe('console hygiene', () => {
    test('confetti fires without a CSP violation (service worker controlling)', async ({ page }) => {
        await page.addInitScript(() => {
            window.__csp = [];
            document.addEventListener('securitypolicyviolation', e =>
                window.__csp.push(`${e.violatedDirective} <- ${e.blockedURI}`));
        });

        await page.goto('/', { waitUntil: 'load' });
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
        // The SW inherits the page CSP, so the repeat load is the one that matters.
        await page.reload({ waitUntil: 'load' });

        await page.waitForFunction(() => typeof window.confetti === 'function', null, { timeout: 20000 });
        // Don't await the returned promise — it only settles when the animation ends.
        await page.evaluate(() => { window.confetti({ particleCount: 40, spread: 60 }); });
        await page.waitForTimeout(500);

        expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBeGreaterThan(0);
        expect(await page.evaluate(() => window.__csp)).toEqual([]);
    });

    test('no failed /api/ping and no unused preloads on a normal load', async ({ page }) => {
        const pingFailures = [];
        const preloadWarnings = [];
        page.on('requestfailed', r => {
            if (r.url().includes('/api/ping')) pingFailures.push(`${r.url()} :: ${r.failure()?.errorText}`);
        });
        page.on('console', m => {
            if (/preloaded using link preload but not used/.test(m.text())) preloadWarnings.push(m.text());
        });

        await page.goto('/', { waitUntil: 'load' });
        // The ping abort landed 5s after the request; the preload warning a few
        // seconds after the load event. Both need the wait to be observable.
        await page.waitForTimeout(8000);

        expect(pingFailures).toEqual([]);
        expect(preloadWarnings).toEqual([]);
    });
});
