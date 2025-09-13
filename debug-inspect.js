const { chromium } = require('playwright');

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
    console.log('Navigating to localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    await page.waitForTimeout(3000);
    
    // Get computed styles for both carousel types
    console.log('Inspecting top carousel dots...');
    const topDots = await page.locator('.carousel-dot').first();
    if (await topDots.isVisible()) {
      const topStyles = await topDots.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          width: computed.width,
          height: computed.height,
          background: computed.background,
          padding: computed.padding,
          margin: computed.margin,
          className: el.className,
          inlineStyle: el.style.cssText
        };
      });
      console.log('Top carousel dot styles:', JSON.stringify(topStyles, null, 2));
    }
    
    console.log('Inspecting bottom carousel dots...');
    const bottomDots = await page.locator('.preview-carousel-dot').first();
    if (await bottomDots.isVisible()) {
      const bottomStyles = await bottomDots.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          width: computed.width,
          height: computed.height,
          background: computed.background,
          padding: computed.padding,
          margin: computed.margin,
          className: el.className,
          inlineStyle: el.style.cssText
        };
      });
      console.log('Bottom carousel dot styles:', JSON.stringify(bottomStyles, null, 2));
    }
    
    // Check if there are any inline styles being applied
    const allBottomDots = await page.locator('.preview-carousel-dot').all();
    for (let i = 0; i < allBottomDots.length; i++) {
      const dotInfo = await allBottomDots[i].evaluate((el, index) => ({
        index,
        className: el.className,
        inlineStyle: el.style.cssText,
        dataAttributes: Array.from(el.attributes).filter(attr => attr.name.startsWith('data-')).map(attr => `${attr.name}="${attr.value}"`).join(' ')
      }), i);
      console.log(`Bottom dot ${i}:`, JSON.stringify(dotInfo, null, 2));
    }
    
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();