/**
 * Dump the computed styles of every element matching a selector, in a phone
 * viewport. Useful for tracking down which rule wins on mobile.
 *
 * Usage: node debug/debug-inspect.js '<css-selector>' [url]
 *   node debug/debug-inspect.js '.player-option'
 *   node debug/debug-inspect.js '#mobile-preview-container .question-item' http://localhost:3010
 *
 * (Previously hard-coded .carousel-dot / .preview-carousel-dot. Both the
 * carousel JS and its markup were removed, so the selector is now an argument.)
 */
const { chromium } = require('playwright');

const selector = process.argv[2];
const url = process.argv[3] || 'http://localhost:3000';

if (!selector) {
  console.error("Usage: node debug/debug-inspect.js '<css-selector>' [url]");
  process.exit(1);
}

const PROPS = ['width', 'height', 'background', 'padding', 'margin', 'display', 'position'];

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
  });

  const page = await context.newPage();

  try {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const matches = await page.locator(selector).all();
    console.log(`${matches.length} element(s) match ${selector}`);

    for (let i = 0; i < matches.length; i++) {
      const info = await matches[i].evaluate((el, props) => {
        const computed = window.getComputedStyle(el);
        const styles = {};
        props.forEach(p => { styles[p] = computed[p]; });
        return {
          className: el.className,
          inlineStyle: el.style.cssText,
          dataAttributes: Array.from(el.attributes)
            .filter(attr => attr.name.startsWith('data-'))
            .map(attr => `${attr.name}="${attr.value}"`)
            .join(' '),
          styles
        };
      }, PROPS);
      console.log(`[${i}]`, JSON.stringify(info, null, 2));
    }

    await page.waitForTimeout(10000);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
