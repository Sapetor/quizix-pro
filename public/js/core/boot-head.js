/**
 * Pre-paint boot script: FOUC prevention plus the MathJax configuration object.
 *
 * Externalised from an inline <script> in index.html so the CSP's script-src can
 * drop 'unsafe-inline'. Constraints this file inherits from that inline block:
 *   - It is a CLASSIC script, not a module. `markMathJaxReady` and `mathJaxConfig`
 *     are plain script-scope declarations and window.toggleTheme / applyThemeAttributes /
 *     toggleGlobalFontSize are global assignments that inline on* handlers call.
 *   - Its <script> tag carries NEITHER defer NOR async: it must be parser-blocking so
 *     the theme and font-scale custom properties are set before first paint.
 *   - Its tag sits BEFORE the async MathJax <script> in index.html's head. A
 *     parser-blocking script runs before the parser has inserted the elements that
 *     follow it, so window.MathJax is guaranteed to be configured before MathJax can
 *     execute. (While this code was inline it relied on the parser reaching it within
 *     the CDN's round-trip; an external file has its own fetch, so the ordering is made
 *     explicit instead.)
 */

// FOUC Prevention: Set font scale and theme immediately from localStorage
(function () {

    const savedFontSize = localStorage.getItem('globalFontSize') || 'medium';
    const scaleValues = { small: 0.9, medium: 1.0, large: 1.3, xlarge: 1.6 };
    document.documentElement.style.setProperty('--global-font-scale', scaleValues[savedFontSize]);

    // Get theme from unified quizSettings storage
    let initialTheme = 'light'; // default
    const savedQuizSettings = localStorage.getItem('quizSettings');
    if (savedQuizSettings) {
        try {
            const settings = JSON.parse(savedQuizSettings);
            initialTheme = settings.theme || 'light';
        } catch {
            // Fallback to old storage format if parsing fails
            initialTheme = localStorage.getItem('theme') || 'light';
        }
    } else {
        // Fallback to old storage format if quizSettings doesn't exist
        initialTheme = localStorage.getItem('theme') || 'light';
    }

    // Apply theme immediately to prevent color shift
    document.documentElement.setAttribute('data-theme', initialTheme);

    // FOUC: Editor Layout Split Ratio
    const savedRatioStr = localStorage.getItem('splitRatio');
    let ratio = 70; // Default fallback to 70/30
    if (savedRatioStr) {
        const parsed = parseFloat(savedRatioStr);
        // MIN_RATIO and MAX_RATIO from split-layout-manager.js
        if (!isNaN(parsed) && parsed >= 20 && parsed <= 85) {
            ratio = parsed;
        }
    }
    document.documentElement.style.setProperty('--split-left', `${ratio}fr`);
    document.documentElement.style.setProperty('--split-right', `${100 - ratio}fr`);

    // FOUC: Editor Mode
    let initialEditorMode = 'basic';
    if (savedQuizSettings) {
        try {
            const settings = JSON.parse(savedQuizSettings);
            if (settings.editorMode) initialEditorMode = settings.editorMode;
        } catch {
            // Ignore parse errors
        }
    }

    // Set theme, layout attributes, and update icons when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
            document.body.setAttribute('data-theme', initialTheme);
            document.body.setAttribute('data-editor-mode', initialEditorMode);
            // Ensure both html and body have the same theme for consistent CSS matching
            document.documentElement.setAttribute('data-theme', initialTheme);
        }


        // Initialize theme icon state (SVG swap is driven by data-icon-state; see header.css)
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.dataset.iconState = initialTheme === 'dark' ? 'dark' : 'light';
            themeToggle.setAttribute('aria-pressed', initialTheme === 'dark' ? 'true' : 'false');
        }

        const fontIcon = document.getElementById('font-size-icon');

        if (fontIcon) {
            const icons = { small: 'A⁻', medium: 'A', large: 'A⁺', xlarge: 'A⁺⁺' };
            fontIcon.textContent = icons[savedFontSize] || 'A';
        }

        // Synchronous language pre-set to avoid flash of wrong language
        const savedLang = localStorage.getItem('language');
        if (savedLang) {
            const langMap = {
                es: ['🇪🇸','Español'], en: ['🇺🇸','English'],
                fr: ['🇫🇷','Français'], de: ['🇩🇪','Deutsch'],
                it: ['🇮🇹','Italiano'], pt: ['🇵🇹','Português'],
                pl: ['🇵🇱','Polski'], ja: ['🇯🇵','日本語'],
                zh: ['🇨🇳','中文']
            };
            const info = langMap[savedLang];
            if (info) {
                document.querySelectorAll('.language-dropdown-selected').forEach(sel => {
                    const f = sel.querySelector('.language-flag');
                    const n = sel.querySelector('.language-name');
                    if (f) f.textContent = info[0];
                    if (n) n.textContent = info[1];
                });
            }
        }

        // Safety net: show body after max 3s even if JS init stalls
        setTimeout(() => {
            if (document.body && !document.body.classList.contains('loaded')) {
                document.body.classList.add('loaded');
            }
        }, 3000);
    });
})();

// Single writer for the data-theme attributes. Defined here (not in a
// module) because the pre-module fallback below needs it too.
// `.theme-switching` suppresses every CSS transition for the frame in
// which the theme flips — crossfading ~2100 elements' `color` costs
// 4 dropped frames per toggle (see the THEME SWAP GUARD note in
// css/main.css). Class and attribute land in the same style recalc,
// so no transition is ever generated.
window.applyThemeAttributes = function (theme) {
    const html = document.documentElement;
    html.classList.add('theme-switching');
    html.setAttribute('data-theme', theme);
    if (document.body) document.body.setAttribute('data-theme', theme);
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            html.classList.remove('theme-switching');
        });
    });
};

// Fallback theme toggle function for immediate use
window.toggleTheme = function () {
    const body = document.body;
    if (!body) return; // Safety check

    const currentTheme = body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    // Set theme on both html and body for consistent CSS matching
    window.applyThemeAttributes(newTheme);

    // Update the theme button's icon state and aria-pressed
    // (SVG swap is driven by CSS via [data-icon-state]; header-controller.js
    // also observes data-theme, but we update the button here for immediate feedback)
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.dataset.iconState = newTheme;
        themeToggle.setAttribute('aria-pressed', newTheme === 'dark' ? 'true' : 'false');
    }

    localStorage.setItem('theme', newTheme);
};

// Fallback font size toggle
window.toggleGlobalFontSize = function () {
    const scales = ['small', 'medium', 'large', 'xlarge'];
    const currentScale = localStorage.getItem('globalFontSize') || 'medium';
    const currentIndex = scales.indexOf(currentScale);
    const nextIndex = (currentIndex + 1) % scales.length;
    const newScale = scales[nextIndex];

    const scaleValues = { small: 0.9, medium: 1.0, large: 1.3, xlarge: 1.6 };
    document.documentElement.style.setProperty('--global-font-scale', scaleValues[newScale]);
    localStorage.setItem('globalFontSize', newScale);

    const fontIcon = document.getElementById('font-size-icon');
    if (fontIcon) {
        const icons = { small: 'A⁻', medium: 'A', large: 'A⁺', xlarge: 'A⁺⁺' };
        fontIcon.textContent = icons[newScale] || 'A';
    }
};

// REMOVED: F5 prevention was causing infinite reload loop

// Function to mark MathJax as ready for our application
function markMathJaxReady() {
    window.mathJaxReady = true;

    // FOUC Prevention: Add ready class and remove loading
    const addReadyClass = () => {
        if (document.body) {
            document.body.classList.remove('loading');
            document.body.classList.add('mathjax-ready');
        }
    };

    if (document.body) {
        addReadyClass();
    } else {
        document.addEventListener('DOMContentLoaded', addReadyClass);
    }

    // Dispatch custom event for SimpleMathJaxService
    document.dispatchEvent(new CustomEvent('mathjax-ready'));
}

// MathJax configuration object
const mathJaxConfig = {
    tex: {
        inlineMath: [['$', '$'], ['\\(', '\\)']],
        displayMath: [['$$', '$$'], ['\\[', '\\]']],
        packages: { '[+]': ['ams', 'newcommand', 'configmacros'] },
        processEscapes: true,
        processEnvironments: true,
        tags: 'none',
        autoload: {
            color: [],
            colorv2: ['color']
        }
    },
    chtml: {
        scale: window.innerWidth <= 768 ? 0.9 : 1, // Smaller scale on mobile for better fit
        minScale: 0.5,
        matchFontHeight: false,
        displayAlign: 'center',
        displayIndent: '0em',
        fontURL: 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2',
        // Mobile optimizations
        adaptiveCSS: true,
        mathmlSpacing: false,
        exFactor: window.innerWidth <= 768 ? 0.45 : 0.5 // Tighter spacing on mobile
    },
    startup: {
        ready: () => {
            MathJax.startup.defaultReady();
            // Faster ready signal on mobile, slower on desktop for stability
            const readyDelay = window.innerWidth <= 768 ? 50 : 100;
            setTimeout(markMathJaxReady, readyDelay);
        }
    },
    options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
        includeHtmlTags: { br: '\n', wbr: '', '#comment': '' },
        processHtmlClass: 'tex2jax_process',
        ignoreHtmlClass: 'tex2jax_ignore',
        renderActions: {
            addMenu: [0, '', '']
        }
    },
    loader: {
        load: ['[tex]/ams', '[tex]/newcommand', '[tex]/configmacros']
    }
};

// Handle cached MathJax - smart reload for reliability while preserving mobile cache benefits
if (window.MathJax) {
    // Clear cached MathJax and reload fresh
    delete window.MathJax;
    window.mathJaxReady = false;

    // Remove existing script
    const existingScript = document.getElementById('MathJax-script');
    if (existingScript) existingScript.remove();

    // Wait for DOM to be fully ready before reloading MathJax
    const reloadMathJax = () => {
        // Ensure there's a stylesheet for MathJax to insert CSS rules into
        if (!document.querySelector('style[id*="MathJax"]')) {
            const mathJaxStyle = document.createElement('style');
            mathJaxStyle.id = 'MathJax-styles';
            mathJaxStyle.textContent = '/* MathJax CSS insertion point */';
            document.head.appendChild(mathJaxStyle);
        }

        const newScript = document.createElement('script');
        newScript.id = 'MathJax-script';
        newScript.async = true;
        // Use version-based cache busting instead of timestamp for better mobile caching
        const version = '3.2.2'; // MathJax version for cache busting
        const sessionId = sessionStorage.getItem('mathJaxSessionId') || Date.now().toString();
        sessionStorage.setItem('mathJaxSessionId', sessionId);
        newScript.src = `https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js?v=${version}&sid=${sessionId}`;

        window.MathJax = mathJaxConfig;
        document.head.appendChild(newScript);
    };

    // Ensure DOM and stylesheets are ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reloadMathJax);
    } else {
        // DOM is ready, but wait a moment for stylesheets
        setTimeout(reloadMathJax, 100);
    }

} else {
    // Fresh MathJax initialization
    window.MathJax = mathJaxConfig;
}

// Fallback: Ensure content is visible even if MathJax fails
setTimeout(() => {
    if (!document.body.classList.contains('mathjax-ready')) {
        document.body.classList.add('mathjax-ready');
    }
}, 3000);
