const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }, // iPhone SE size
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  
  const page = await context.newPage();
  
  try {
    console.log('Navigating to localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    console.log('Waiting for page to load...');
    await page.waitForTimeout(3000);
    
    // Take screenshot of the main page first
    console.log('Taking main page screenshot...');
    await page.screenshot({ path: '/tmp/mobile-main-page.png', fullPage: true });
    
    // Look for carousel elements
    console.log('Looking for carousel elements...');
    const topCarousel = await page.locator('.carousel-dots').first();
    const bottomCarousel = await page.locator('.preview-carousel-dots').first();
    
    if (await topCarousel.isVisible()) {
      console.log('Top carousel found, taking screenshot...');
      await topCarousel.screenshot({ path: '/tmp/top-carousel.png' });
    } else {
      console.log('Top carousel not visible');
    }
    
    if (await bottomCarousel.isVisible()) {
      console.log('Bottom carousel found, taking screenshot...');
      await bottomCarousel.screenshot({ path: '/tmp/bottom-carousel.png' });
      
      // Also take a wider screenshot to see all dots
      const previewSection = await page.locator('.mobile-preview-showcase').first();
      if (await previewSection.isVisible()) {
        console.log('Taking wider preview section screenshot...');
        await previewSection.screenshot({ path: '/tmp/preview-section.png' });
      }
    } else {
      console.log('Bottom carousel not visible, looking for preview modal...');
      
      // Try to find and click on a preview button
      const previewButton = await page.locator('button:has-text("Preview")').first();
      if (await previewButton.isVisible()) {
        console.log('Found preview button, clicking...');
        await previewButton.click();
        await page.waitForTimeout(2000);
        
        // Now look for bottom carousel again
        if (await bottomCarousel.isVisible()) {
          console.log('Bottom carousel now visible, taking screenshot...');
          await bottomCarousel.screenshot({ path: '/tmp/bottom-carousel.png' });
        }
      }
    }
    
    console.log('Screenshots saved to /tmp/');
    await page.waitForTimeout(5000); // Keep browser open for 5 seconds
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();