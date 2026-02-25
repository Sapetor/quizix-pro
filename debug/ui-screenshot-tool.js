#!/usr/bin/env node

/**
 * QuizMaster Pro UI Screenshot Tool
 * Captures screenshots of all app screens for visual debugging
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
    baseUrl: 'http://localhost:3000',
    outputDir: './debug/screenshots',
    viewports: {
        mobile: { width: 375, height: 667 },
        tablet: { width: 768, height: 1024 },
        desktop: { width: 1920, height: 1080 }
    },
    themes: ['light', 'dark'],
    screens: [
        { id: 'main-menu', name: 'Main Menu' },
        { id: 'host-screen', name: 'Quiz Creation' },
        { id: 'game-lobby', name: 'Host Lobby' },
        { id: 'host-game-screen', name: 'Host Game Control' },
        { id: 'join-screen', name: 'Player Entry' },
        { id: 'game-browser', name: 'Game Browser' },
        { id: 'player-lobby', name: 'Player Lobby' },
        { id: 'player-game-screen', name: 'Player Game' },
        { id: 'leaderboard-screen', name: 'Leaderboard' },
        { id: 'player-final-screen', name: 'Final Results' }
    ]
};

async function ensureOutputDir() {
    try {
        await fs.mkdir(CONFIG.outputDir, { recursive: true });
        console.log(`✅ Output directory created: ${CONFIG.outputDir}`);
    } catch (error) {
        console.error('❌ Failed to create output directory:', error.message);
        process.exit(1);
    }
}

async function captureScreenshots() {
    console.log('🚀 Starting QuizMaster Pro UI Screenshot Tool...');
    
    await ensureOutputDir();
    
    let browser;
    try {
        // Launch browser with minimal options to work in WSL
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-default-apps',
                '--disable-extensions'
            ]
        });
        
        console.log('✅ Browser launched successfully');
        
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Navigate to the app
        console.log(`🌐 Navigating to ${CONFIG.baseUrl}...`);
        await page.goto(CONFIG.baseUrl, { waitUntil: 'networkidle' });
        
        // Wait for app to initialize
        await page.waitForTimeout(2000);
        
        const screenshots = [];
        
        // For each viewport size
        for (const [viewportName, viewport] of Object.entries(CONFIG.viewports)) {
            console.log(`📱 Testing ${viewportName} viewport (${viewport.width}x${viewport.height})`);
            await page.setViewportSize(viewport);
            
            // For each theme
            for (const theme of CONFIG.themes) {
                console.log(`🎨 Testing ${theme} theme`);
                
                // Set theme
                await page.evaluate((themeName) => {
                    document.documentElement.setAttribute('data-theme', themeName);
                }, theme);
                
                await page.waitForTimeout(500); // Allow theme to apply
                
                // For each screen
                for (const screen of CONFIG.screens) {
                    try {
                        console.log(`📸 Capturing ${screen.name} (${screen.id})...`);
                        
                        // Navigate to screen using the app's navigation system
                        await page.evaluate((screenId) => {
                            if (window.uiManager && typeof window.uiManager.showScreen === 'function') {
                                window.uiManager.showScreen(screenId);
                            } else {
                                console.warn('UIManager not available, trying direct DOM manipulation');
                                // Fallback: hide all screens and show target
                                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                                const target = document.getElementById(screenId);
                                if (target) target.classList.add('active');
                            }
                        }, screen.id);
                        
                        await page.waitForTimeout(1000); // Wait for screen transition

                        // Enable screenshot mode to disable stacking context properties
                        await page.evaluate(() => {
                            document.documentElement.classList.add('screenshot-mode');
                        });
                        await page.waitForTimeout(100); // Allow styles to apply

                        // Take screenshot
                        const filename = `${screen.id}_${viewportName}_${theme}.png`;
                        const filepath = path.join(CONFIG.outputDir, filename);

                        await page.screenshot({
                            path: filepath,
                            fullPage: true
                        });

                        // Disable screenshot mode
                        await page.evaluate(() => {
                            document.documentElement.classList.remove('screenshot-mode');
                        });
                        
                        screenshots.push({
                            screen: screen.name,
                            screenId: screen.id,
                            viewport: viewportName,
                            theme: theme,
                            filename: filename,
                            dimensions: viewport
                        });
                        
                        console.log(`✅ Saved: ${filename}`);
                        
                    } catch (error) {
                        console.error(`❌ Failed to capture ${screen.id}:`, error.message);
                    }
                }
            }
        }
        
        // Generate HTML gallery
        await generateHTMLGallery(screenshots);
        
        console.log(`🎉 Screenshot capture complete! Generated ${screenshots.length} screenshots.`);
        console.log(`📂 View results: ${path.resolve(CONFIG.outputDir)}/gallery.html`);
        
    } catch (error) {
        console.error('❌ Screenshot capture failed:', error.message);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function generateHTMLGallery(screenshots) {
    const galleryHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QuizMaster Pro - UI Debug Gallery</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header h1 {
            color: #333;
            margin: 0 0 10px 0;
        }
        .header p {
            color: #666;
            margin: 0;
        }
        .filters {
            text-align: center;
            margin-bottom: 20px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .filter-group {
            display: inline-block;
            margin: 0 15px;
        }
        .filter-group label {
            font-weight: bold;
            margin-right: 10px;
        }
        .filter-group select {
            padding: 5px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .gallery {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        .screenshot-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
            transition: transform 0.2s ease;
        }
        .screenshot-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .screenshot-card img {
            width: 100%;
            height: auto;
            display: block;
        }
        .card-info {
            padding: 15px;
        }
        .card-title {
            font-weight: bold;
            color: #333;
            margin-bottom: 8px;
        }
        .card-details {
            color: #666;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .theme-badge {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
        }
        .theme-light {
            background: #e8f4fd;
            color: #1e88e5;
        }
        .theme-dark {
            background: #424242;
            color: #ffffff;
        }
        .viewport-badge {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            background: #f0f0f0;
            color: #333;
        }
        .stats {
            text-align: center;
            margin-top: 30px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎮 QuizMaster Pro - UI Debug Gallery</h1>
        <p>Visual debugging interface showing all app screens across different viewports and themes</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    </div>

    <div class="filters">
        <div class="filter-group">
            <label for="viewport-filter">Viewport:</label>
            <select id="viewport-filter">
                <option value="all">All Viewports</option>
                <option value="mobile">Mobile (375×667)</option>
                <option value="tablet">Tablet (768×1024)</option>
                <option value="desktop">Desktop (1920×1080)</option>
            </select>
        </div>
        <div class="filter-group">
            <label for="theme-filter">Theme:</label>
            <select id="theme-filter">
                <option value="all">All Themes</option>
                <option value="light">Light Theme</option>
                <option value="dark">Dark Theme</option>
            </select>
        </div>
        <div class="filter-group">
            <label for="screen-filter">Screen:</label>
            <select id="screen-filter">
                <option value="all">All Screens</option>
                ${CONFIG.screens.map(screen => `<option value="${screen.id}">${screen.name}</option>`).join('')}
            </select>
        </div>
    </div>

    <div class="gallery" id="gallery">
        ${screenshots.map(shot => `
            <div class="screenshot-card" 
                 data-viewport="${shot.viewport}" 
                 data-theme="${shot.theme}" 
                 data-screen="${shot.screenId}">
                <img src="${shot.filename}" alt="${shot.screen} - ${shot.viewport} - ${shot.theme}" loading="lazy">
                <div class="card-info">
                    <div class="card-title">${shot.screen}</div>
                    <div class="card-details">
                        <span class="viewport-badge">${shot.viewport} (${shot.dimensions.width}×${shot.dimensions.height})</span>
                        <span class="theme-badge theme-${shot.theme}">${shot.theme}</span>
                    </div>
                </div>
            </div>
        `).join('')}
    </div>

    <div class="stats">
        <p><strong>Total Screenshots:</strong> ${screenshots.length} | 
           <strong>Screens:</strong> ${CONFIG.screens.length} | 
           <strong>Viewports:</strong> ${Object.keys(CONFIG.viewports).length} | 
           <strong>Themes:</strong> ${CONFIG.themes.length}</p>
    </div>

    <script>
        // Filter functionality
        const viewportFilter = document.getElementById('viewport-filter');
        const themeFilter = document.getElementById('theme-filter');
        const screenFilter = document.getElementById('screen-filter');
        const gallery = document.getElementById('gallery');

        function filterScreenshots() {
            const viewportValue = viewportFilter.value;
            const themeValue = themeFilter.value;
            const screenValue = screenFilter.value;
            
            const cards = gallery.querySelectorAll('.screenshot-card');
            
            cards.forEach(card => {
                const viewport = card.dataset.viewport;
                const theme = card.dataset.theme;
                const screen = card.dataset.screen;
                
                const viewportMatch = viewportValue === 'all' || viewport === viewportValue;
                const themeMatch = themeValue === 'all' || theme === themeValue;
                const screenMatch = screenValue === 'all' || screen === screenValue;
                
                if (viewportMatch && themeMatch && screenMatch) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        viewportFilter.addEventListener('change', filterScreenshots);
        themeFilter.addEventListener('change', filterScreenshots);
        screenFilter.addEventListener('change', filterScreenshots);
    </script>
</body>
</html>`;

    const galleryPath = path.join(CONFIG.outputDir, 'gallery.html');
    await fs.writeFile(galleryPath, galleryHTML);
    console.log('✅ Generated HTML gallery: gallery.html');
}

// Run the screenshot tool
if (require.main === module) {
    captureScreenshots().catch(console.error);
}

module.exports = { captureScreenshots, CONFIG };