const { test, expect } = require('@playwright/test');

/**
 * The vendored libraries (public/libs) under a controlling service worker.
 *
 * History: these assets used to come from CDNs, which sw.js served cache-first.
 * A service worker inherits the CSP of its own script (/sw.js), and inside a
 * worker EVERY fetch is governed by connect-src — script-src/font-src do not
 * apply. When connect-src omitted the CDN hosts the worker's fetch threw,
 * respondWith() rejected, and MathJax failed on every SW-controlled load.
 * The libraries are now same-origin, which connect-src 'self' covers, and sw.js
 * serves /libs/ cache-first. These tests keep checking the same outcome:
 * MathJax and its webfonts load once the worker controls the page.
 *
 * The first page load is NOT affected (the SW has not claimed the client yet),
 * so these tests must reload before asserting.
 */
test.describe('service worker serves the vendored libraries', () => {
    test('MathJax loads and typesets once the service worker controls the page', async ({ page }) => {
        await page.goto('/', { waitUntil: 'load' });
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });

        const failed = [];
        page.on('requestfailed', r => failed.push(`${r.resourceType()} ${r.url()} :: ${r.failure()?.errorText}`));

        await page.reload({ waitUntil: 'load' });
        expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

        await page.waitForFunction(
            () => !!(window.MathJax && window.MathJax.typesetPromise),
            null,
            { timeout: 20000 }
        );

        const rendered = await page.evaluate(async () => {
            const el = document.createElement('div');
            el.textContent = 'value $\\frac{a}{b}$ here';
            document.body.appendChild(el);
            await window.MathJax.typesetPromise([el]);
            return el.querySelectorAll('mjx-container').length;
        });
        expect(rendered).toBe(1);

        const libFailures = failed.filter(f => /\/libs\//.test(f));
        expect(libFailures, `Vendored library requests failed under the service worker:\n${libFailures.join('\n')}`).toEqual([]);

        // Nothing the page fetched came from another origin.
        const crossOrigin = await page.evaluate(() =>
            window.performance.getEntriesByType('resource')
                .map(entry => entry.name)
                .filter(name => /^https?:/i.test(name) && new URL(name).origin !== window.location.origin)
        );
        expect(crossOrigin).toEqual([]);

        // sw.js serves /libs/ cache-first, so the reload stored MathJax in its cache.
        const cachedLibs = await page.evaluate(async () => {
            const names = (await window.caches.keys()).filter(name => name.startsWith('quizix-static-'));
            const urls = [];
            for (const name of names) {
                const keys = await (await window.caches.open(name)).keys();
                urls.push(...keys.map(request => new URL(request.url).pathname));
            }
            return urls.filter(pathname => pathname.includes('/libs/'));
        });
        expect(cachedLibs).toContain('/libs/mathjax/es5/tex-mml-chtml.js');
    });

    test('MathJax CHTML webfonts load (glyphs need them, or math falls back to page fonts)', async ({ page }) => {
        await page.goto('/', { waitUntil: 'load' });
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
        await page.reload({ waitUntil: 'load' });

        await page.waitForFunction(
            () => !!(window.MathJax && window.MathJax.typesetPromise),
            null,
            { timeout: 20000 }
        );

        // Typeset a fraction + radical so MathJax requests its glyph fonts.
        await page.evaluate(async () => {
            const el = document.createElement('div');
            el.textContent = '$\\frac{a}{b} = \\sqrt{x^2+1}$';
            document.body.appendChild(el);
            await window.MathJax.typesetPromise([el]);
            await document.fonts.ready;
        });

        const badFonts = await page.evaluate(() =>
            [...document.fonts]
                .filter(f => /^MJX/i.test(f.family) && f.status === 'error')
                .map(f => f.family)
        );
        expect(badFonts, `MathJax webfonts failed to load: ${badFonts.join(', ')}`).toEqual([]);
    });
});
