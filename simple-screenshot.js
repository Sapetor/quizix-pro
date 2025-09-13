const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set mobile viewport
  await page.setViewportSize({ width: 375, height: 667 });
  
  console.log('Navigating to localhost:3000...');
  await page.goto('http://localhost:3000');
  
  console.log('Waiting for page load...');
  await page.waitForLoadState('networkidle');
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: 'mobile-view.png' });
  
  console.log('Screenshot saved as mobile-view.png');
  
  await browser.close();
})();