const { test, expect } = require('@playwright/test');

/**
 * Regression: the service worker inherits the CSP of its own script (/sw.js).
 * Inside a worker EVERY fetch is governed by connect-src — script-src/font-src
 * do not apply. sw.js routes CACHEABLE_CDN_HOSTS through cacheFirst(), so if
 * connect-src omits those hosts the worker's fetch throws, respondWith()
 * rejects, and every CDN asset fails with ERR_FAILED once the SW controls the
 * page. MathJax is a CDN asset, so LaTeX stops rendering everywhere.
 *
 * The first page load is NOT affected (the SW has not claimed the client yet),
 * so these tests must reload before asserting.
 */
test.describe('service worker CDN fetches under CSP', () => {
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

        const cdnFailures = failed.filter(f => /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(f));
        expect(cdnFailures, `CDN requests blocked by the service worker:\n${cdnFailures.join('\n')}`).toEqual([]);
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
