/**
 * Service Worker for Quizix Pro
 * Provides static asset caching for faster repeat loads
 *
 * Strategy:
 * - Cache-first for static assets (JS, CSS, images, sounds, fonts)
 * - Cache-first for CDN resources (MathJax, Chart.js, etc.)
 * - Network-only for API calls, Socket.IO, and user uploads
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `quizix-static-${CACHE_VERSION}`;

// Static assets to pre-cache on install (relative to service worker scope)
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './css/main.bundle.css',
    './js/main.js',
    './js/core/app.js',
    './js/core/config.js',
    './images/carrousel-main-menu-mobile-1.png',
    './images/carrousel-main-menu-mobile-2.png',
    './images/carrousel-main-menu-mobile-3.png',
    './images/mobile-question-preview.png'
];

// Patterns that should NEVER be cached (network-only)
const NETWORK_ONLY_PATTERNS = [
    /\/api\//,           // API endpoints
    /\/socket\.io\//,    // Socket.IO
    /\/uploads\//,       // User-uploaded content (changes frequently)
    /\/quizzes\//,       // Quiz data (should be fresh)
    /\/results\//,       // Results data
    /\/qr\//             // QR codes
];

// Patterns for cacheable static assets
const CACHEABLE_PATTERNS = [
    /\.js(\?.*)?$/,      // JavaScript files
    /\.css(\?.*)?$/,     // CSS files
    /\.png$/,            // PNG images
    /\.jpg$/,            // JPG images
    /\.jpeg$/,           // JPEG images
    /\.gif$/,            // GIF images
    /\.webp$/,           // WebP images
    /\.svg$/,            // SVG images
    /\.woff2?$/,         // Web fonts
    /\.ttf$/,            // TrueType fonts
    /\.mp3$/,            // Audio files
    /\.wav$/,            // Audio files
    /\.ico$/             // Favicon
];

// CDN hosts we trust and want to cache
const CACHEABLE_CDN_HOSTS = [
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

/**
 * Check if a request should never be cached
 */
function isNetworkOnly(url) {
    return NETWORK_ONLY_PATTERNS.some(pattern => pattern.test(url.pathname));
}

/**
 * Check if a request is for a cacheable static asset
 */
function isCacheableAsset(url) {
    // Check if it's from our origin
    if (url.origin === self.location.origin) {
        return CACHEABLE_PATTERNS.some(pattern => pattern.test(url.pathname));
    }

    // Check if it's from a trusted CDN
    if (CACHEABLE_CDN_HOSTS.includes(url.host)) {
        return true;
    }

    return false;
}

/**
 * Install event - pre-cache critical assets
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching critical assets');
                // Use addAll with error handling for individual failures
                return Promise.allSettled(
                    PRECACHE_ASSETS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn(`[SW] Failed to pre-cache: ${url}`, err);
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] Pre-caching complete');
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('quizix-') && name !== CACHE_NAME)
                        .map((name) => {
                            console.log(`[SW] Deleting old cache: ${name}`);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Claiming clients');
                // Take control of all pages immediately
                return self.clients.claim();
            })
    );
});

/**
 * Fetch event - implement caching strategies
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Network-only for API, Socket.IO, uploads, etc.
    if (isNetworkOnly(url)) {
        return;
    }

    // Cache-first strategy for static assets
    if (isCacheableAsset(url)) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    // For HTML pages (navigation requests), use network-first with cache fallback
    if (event.request.mode === 'navigate') {
        event.respondWith(networkFirst(event.request));
        return;
    }
});

/**
 * Cache-first strategy
 * Returns cached response if available, otherwise fetches from network and caches
 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        // Return cached response immediately
        // Optionally update cache in background (stale-while-revalidate)
        return cachedResponse;
    }

    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);

        // Only cache successful responses
        if (networkResponse.ok) {
            // Clone the response since it can only be consumed once
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.warn('[SW] Fetch failed:', request.url, error);
        // Could return a fallback here if needed
        throw error;
    }
}

/**
 * Network-first strategy
 * Tries network first, falls back to cache if offline
 */
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
        const networkResponse = await fetch(request);

        // Cache successful responses
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        // Network failed, try cache
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            console.log('[SW] Serving from cache (offline):', request.url);
            return cachedResponse;
        }

        // Nothing in cache either
        throw error;
    }
}

/**
 * Message handler for cache management
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('[SW] Cache cleared');
        });
    }
});
