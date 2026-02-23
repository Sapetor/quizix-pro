/**
 * Service Worker for Quizix Pro
 * Provides static asset caching for faster repeat loads
 *
 * Strategy:
 * - Cache-first for static assets (JS, CSS, images, sounds, fonts)
 * - Cache-first for CDN resources (MathJax, Chart.js, etc.)
 * - Network-only for API calls, Socket.IO, and user uploads
 */

// IMPORTANT: Update this version when deploying new code to force cache refresh
// Format: YYYYMMDD-HHMM or use a build hash
const CACHE_VERSION = 'v20260222-manim-editor-init';
const CACHE_NAME = `quizix-static-${CACHE_VERSION}`;
const OFFLINE_CACHE_NAME = 'quizix-offline-data';

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

// Single pattern for cacheable static assets (JS, CSS, images, fonts, audio)
const CACHEABLE_ASSET_PATTERN = /\.(js|css|png|jpe?g|gif|webp|svg|woff2?|ttf|mp3|wav|ico)(\?.*)?$/;

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
    // Cache assets from our origin that match the pattern
    if (url.origin === self.location.origin) {
        return CACHEABLE_ASSET_PATTERN.test(url.pathname);
    }
    // Cache all resources from trusted CDNs
    return CACHEABLE_CDN_HOSTS.includes(url.host);
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
        return cachedResponse;
    }

    const networkResponse = await fetch(request);

    // Cache successful responses (clone since response can only be consumed once)
    // Skip 206 partial responses - Cache API doesn't support them
    if (networkResponse.ok && networkResponse.status !== 206) {
        cache.put(request, networkResponse.clone());
    }

    return networkResponse;
}

/**
 * Network-first strategy
 * Tries network first, falls back to cache if offline
 */
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
        const networkResponse = await fetch(request);

        // Cache successful responses (skip 206 partial responses)
        if (networkResponse.ok && networkResponse.status !== 206) {
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
 * Message handler for cache management and offline features
 */
self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};

    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CLEAR_CACHE':
            caches.delete(CACHE_NAME).then(() => {
                console.log('[SW] Cache cleared');
            });
            break;

        case 'CACHE_QUIZ':
            // Cache a quiz for offline access
            cacheQuizData(payload);
            break;

        case 'GET_CACHED_QUIZZES':
            // Return cached quiz list
            getCachedQuizzes().then(quizzes => {
                event.ports[0].postMessage({ quizzes });
            });
            break;

        case 'SYNC_STATUS':
            // Report sync status
            event.ports[0].postMessage({
                online: self.navigator?.onLine ?? true,
                cacheVersion: CACHE_VERSION
            });
            break;
    }
});

/**
 * Cache quiz data for offline access
 */
async function cacheQuizData(quiz) {
    if (!quiz) return;

    try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const response = new Response(JSON.stringify(quiz), {
            headers: { 'Content-Type': 'application/json' }
        });
        await cache.put(`/offline/quiz/${quiz.id}`, response);
        console.log('[SW] Quiz cached for offline:', quiz.title);
    } catch (error) {
        console.error('[SW] Failed to cache quiz:', error);
    }
}

/**
 * Get cached quizzes
 */
async function getCachedQuizzes() {
    try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const keys = await cache.keys();
        const quizKeys = keys.filter(req => req.url.includes('/offline/quiz/'));

        const quizzes = await Promise.all(
            quizKeys.map(async (key) => {
                const response = await cache.match(key);
                return response.json();
            })
        );

        return quizzes;
    } catch (error) {
        console.error('[SW] Failed to get cached quizzes:', error);
        return [];
    }
}

/**
 * Background sync for queued saves
 */
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-quizzes') {
        event.waitUntil(syncQuizzes());
    }
});

/**
 * Sync queued quizzes to server
 */
async function syncQuizzes() {
    console.log('[SW] Background sync triggered');

    // Notify clients that sync is happening
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({ type: 'SYNC_STARTED' });
    });

    // Actual sync is handled by the OfflineStorageService in the main thread
    // This just notifies that we're back online

    clients.forEach(client => {
        client.postMessage({ type: 'SYNC_COMPLETED' });
    });
}
