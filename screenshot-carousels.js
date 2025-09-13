const { chromium } = require('playwright');

async function captureCarouselScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }, // iPhone SE size
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
  });
  
  const page = await context.newPage();
  
  try {
    console.log('Navigating to QuizMaster Pro...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Wait for page to load completely
    await page.waitForTimeout(2000);
    
    console.log('Taking screenshot of main page with top carousel...');
    await page.screenshot({
      path: '/mnt/c/Users/sapet/quizmaster-pro/carousel-quickstart-dots.png',
      fullPage: false
    });
    
    // Try to find and click on a preview button to open the modal with bottom carousel
    console.log('Looking for preview buttons...');
    
    // Look for preview buttons or elements that might open the modal
    const previewSelectors = [
      'button[data-action="preview"]',
      '.preview-btn',
      '.preview-button',
      '[onclick*="preview"]',
      'button:has-text("Preview")',
      'button:has-text("Mostrar")', // Spanish
      'button:has-text("Aperçu")', // French
      '.quiz-card button',
      '.sample-quiz button'
    ];
    
    let previewFound = false;
    for (const selector of previewSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.log(`Found preview element with selector: ${selector}`);
          await element.click();
          previewFound = true;
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!previewFound) {
      // Try to find any quiz cards and click on them
      console.log('Trying to find quiz cards...');
      const quizCards = await page.$$('.quiz-card, .sample-quiz, [data-quiz-id]');
      if (quizCards.length > 0) {
        console.log(`Found ${quizCards.length} quiz cards, clicking the first one...`);
        await quizCards[0].click();
        previewFound = true;
      }
    }
    
    if (previewFound) {
      // Wait for modal to open
      await page.waitForTimeout(1000);
      
      console.log('Taking screenshot of modal with bottom carousel...');
      await page.screenshot({
        path: '/mnt/c/Users/sapet/quizmaster-pro/carousel-preview-dots.png',
        fullPage: false
      });
      
      // Try to capture just the modal area if possible
      const modal = await page.$('.modal, .preview-modal, .image-preview');
      if (modal) {
        console.log('Taking focused screenshot of modal...');
        await modal.screenshot({
          path: '/mnt/c/Users/sapet/quizmaster-pro/carousel-preview-modal-focused.png'
        });
      }
    } else {
      console.log('Could not find preview button. Taking screenshot of current state...');
      await page.screenshot({
        path: '/mnt/c/Users/sapet/quizmaster-pro/current-state.png',
        fullPage: true
      });
      
      // Log the page content to understand what's available
      const buttons = await page.$$eval('button', buttons => 
        buttons.map(btn => ({
          text: btn.textContent?.trim(),
          className: btn.className,
          onclick: btn.getAttribute('onclick'),
          dataAction: btn.getAttribute('data-action')
        }))
      );
      console.log('Available buttons:', buttons);
    }
    
    console.log('Screenshots saved successfully!');
    
  } catch (error) {
    console.error('Error during screenshot capture:', error);
  } finally {
    await browser.close();
  }
}

captureCarouselScreenshots();