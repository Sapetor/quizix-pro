/**
 * App version display and service worker registration.
 *
 * Externalised from an inline <script> in index.html so the CSP's script-src can
 * drop 'unsafe-inline'. Classic script, loaded with defer after the module bundle,
 * matching the end-of-body position the inline block had.
 */

// App version. The server rewrites __SW_VERSION__ to ASSET_VERSION in index.html
// only, so the placeholder travels in <meta name="app-version"> and is read from
// there; sw.js's CACHE_VERSION is derived from that same value, so there is
// nothing to fetch or parse. (This previously scraped sw.js for
// `CACHE_VERSION = '...'`, which stopped matching once sw.js computed that
// constant instead of assigning a literal — leaving the UI showing "Unknown".)
// A value still starting with '__' means index.html was served raw by
// express.static (e.g. a direct /index.html request) and never went through the
// Express route that substitutes it; that path must keep working, hence 'dev'.
const versionMeta = document.querySelector('meta[name="app-version"]');
const APP_VERSION_RAW = versionMeta?.getAttribute('content') || '__SW_VERSION__';
const APP_VERSION = APP_VERSION_RAW.startsWith('__') ? 'dev' : APP_VERSION_RAW;

window.addEventListener('load', () => {
    const versionText = document.getElementById('app-version-text');
    if (versionText) {
        versionText.textContent = APP_VERSION;
    }
});

// Service Worker registration (secure contexts only)
if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        const basePath = document.querySelector('base')?.getAttribute('href') || '/';
        const swPath = basePath + 'sw.js';
        const SW_VERSION = APP_VERSION_RAW;
        const storedVersion = localStorage.getItem('quizix-sw-version');

        // Detect stale SWs - check registrations (not just controller,
        // because hard refresh sets controller to null while SW stays registered)
        navigator.serviceWorker.getRegistrations().then(regs => {
            if (regs.length > 0 && storedVersion !== SW_VERSION) {
                console.log('[App] Stale service worker detected, cleaning up...');
                return Promise.all(regs.map(r => r.unregister()))
                    .then(() => window.caches.keys())
                    .then(names => Promise.all(names.map(n => window.caches.delete(n))))
                    .then(() => {
                        localStorage.setItem('quizix-sw-version', SW_VERSION);
                        console.log('[App] Cleanup done, re-registering SW (no reload needed)');
                        registerServiceWorker();
                    });
            }
            localStorage.setItem('quizix-sw-version', SW_VERSION);
            registerServiceWorker();
        });

        function registerServiceWorker() {
            const forceWorkerActivation = (worker) => {
                if (!worker || !navigator.serviceWorker.controller) {
                    return;
                }

                console.log('[App] Activating waiting service worker immediately');
                worker.postMessage({ type: 'SKIP_WAITING' });
            };

            // Only reload for SW updates, NOT for initial activation.
            // On first visit the SW activates via skipWaiting+clients.claim which
            // fires controllerchange — reloading here causes a visible blink.
            const hadControllerOnLoad = !!navigator.serviceWorker.controller;
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                if (!hadControllerOnLoad) {
                    // First-ever activation — no need to reload, page already has fresh content
                    console.log('[App] Initial service worker activated (no reload needed)');
                    return;
                }
                refreshing = true;
                console.log('[App] Service worker updated, reloading for fresh content...');
                window.location.reload();
            });

            navigator.serviceWorker.register(swPath, { scope: basePath, updateViaCache: 'none' })
                .then((registration) => {
                    console.log('[App] Service Worker registered with scope:', registration.scope);

                    if (registration.waiting) {
                        forceWorkerActivation(registration.waiting);
                    }

                    registration.addEventListener('updatefound', () => {
                        const installingWorker = registration.installing;
                        if (!installingWorker) {
                            return;
                        }

                        installingWorker.addEventListener('statechange', () => {
                            if (installingWorker.state === 'installed') {
                                forceWorkerActivation(installingWorker);
                            }
                        });
                    });

                    const checkForUpdates = () => registration.update()
                        .catch((error) => console.warn('[App] Service Worker update check failed:', error));

                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'visible') {
                            checkForUpdates();
                        }
                    });

                    window.addEventListener('focus', checkForUpdates);
                    setInterval(checkForUpdates, 60 * 60 * 1000);
                    checkForUpdates();
                })
                .catch((error) => {
                    console.warn('[App] Service Worker registration failed:', error);
                });
        }
    });
} else if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        console.warn('[App] Insecure context detected. Service workers are disabled on plain-HTTP LAN URLs, so this session relies on no-store HTTP headers. Use HTTPS to remove the browser security warning.');
    });
}
