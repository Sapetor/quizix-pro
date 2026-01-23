#!/usr/bin/env node
/**
 * Cache Busting Script for Quizix Pro
 *
 * Updates version strings in:
 * - public/sw.js (CACHE_VERSION)
 * - public/index.html (CSS/JS version query strings)
 *
 * Usage: node scripts/cache-bust.js
 *
 * This script is automatically run as part of `npm run build:prod`
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate version string: YYYYMMDD-HHMM or git short hash if available
function generateVersion() {
    // Try to get git short hash first
    try {
        const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        return `v${dateStr}-${gitHash}`;
    } catch {
        // Fallback to timestamp if git is not available
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toISOString().slice(11, 16).replace(':', '');
        return `v${dateStr}-${timeStr}`;
    }
}

// Update service worker cache version
function updateServiceWorker(version) {
    const swPath = path.join(__dirname, '..', 'public', 'sw.js');
    let content = fs.readFileSync(swPath, 'utf8');

    // Update CACHE_VERSION line
    const oldVersionMatch = content.match(/const CACHE_VERSION = '([^']+)'/);
    const oldVersion = oldVersionMatch ? oldVersionMatch[1] : 'unknown';

    content = content.replace(
        /const CACHE_VERSION = '[^']+'/,
        `const CACHE_VERSION = '${version}'`
    );

    fs.writeFileSync(swPath, content, 'utf8');
    console.log(`✓ sw.js: ${oldVersion} → ${version}`);
}

// Update version query strings in index.html
function updateIndexHtml(version) {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    let content = fs.readFileSync(htmlPath, 'utf8');

    // Simple numeric version for query strings (increment from existing or use timestamp)
    const existingMatch = content.match(/main\.bundle\.css\?v=(\d+\.?\d*)/);
    let numericVersion;
    if (existingMatch) {
        const existing = parseFloat(existingMatch[1]);
        numericVersion = (Math.floor(existing) + 1).toString();
    } else {
        numericVersion = Date.now().toString().slice(-6);
    }

    let changes = 0;

    // Update CSS version (already has ?v=)
    const cssPattern = /(main\.bundle\.css)\?v=[\d.]+/g;
    content = content.replace(cssPattern, (match, file) => {
        changes++;
        return `${file}?v=${numericVersion}`;
    });

    // Add or update version for preloaded JS files
    const jsPreloadPattern = /(<link rel="preload" href=")(js\/[^"?]+)(\.js)("|\?v=[\d.]+")( as="script")/g;
    content = content.replace(jsPreloadPattern, (match, prefix, path, ext, suffix, as) => {
        changes++;
        return `${prefix}${path}${ext}?v=${numericVersion}"${as}`;
    });

    // Add or update version for script src tags
    const scriptPattern = /(<script type="module" src=")(js\/[^"?]+)(\.js)("|\?v=[\d.]+")>/g;
    content = content.replace(scriptPattern, (match, prefix, path, ext, suffix) => {
        changes++;
        return `${prefix}${path}${ext}?v=${numericVersion}">`;
    });

    fs.writeFileSync(htmlPath, content, 'utf8');
    console.log(`✓ index.html: Updated ${changes} asset references to v=${numericVersion}`);
}

// Main
function main() {
    console.log('\n🔄 Cache Busting for Quizix Pro\n');

    const version = generateVersion();
    console.log(`Generated version: ${version}\n`);

    try {
        updateServiceWorker(version);
        updateIndexHtml(version);
        console.log('\n✅ Cache busting complete!\n');
        console.log('Note: Users will automatically get the new version on their next visit.');
        console.log('The service worker will detect the version change and refresh the cache.\n');
    } catch (error) {
        console.error('\n❌ Error during cache busting:', error.message);
        process.exit(1);
    }
}

main();
