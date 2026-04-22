/**
 * Editorial landing page behaviors.
 * - Hydrates the live rooms ticker from /api/active-games (hides if empty)
 * - PIN card: decorative cycling animation on the trailing digit
 * - "Entrar al juego" in the hero PIN card routes to the existing join screen
 */
import { APIHelper } from './utils/api-helper.js';
import { logger } from './core/config.js';

const TICKER_REFRESH_MS = 30_000;
const PIN_CYCLE_MS = 1400;
const PIN_CYCLE_CHARS = ['_', '8', '3', '6', '_'];

function getLandingRoot() {
    return document.getElementById('main-menu');
}

function renderTicker(games) {
    const strip = document.getElementById('lp-rooms-strip');
    const track = document.getElementById('lp-rooms-track');
    if (!strip || !track) return;

    if (!Array.isArray(games) || games.length === 0) {
        strip.style.display = 'none';
        track.innerHTML = '';
        return;
    }

    const pillsHtml = games.map(g => {
        const title = String(g.title || 'Quiz').replace(/</g, '&lt;');
        const pin = String(g.pin || '').replace(/</g, '&lt;');
        const count = Number(g.playerCount ?? g.players ?? 0);
        const playersLabel = window.__lpT ? window.__lpT('landing_ticker_players', count) : `${count} players`;
        return `<div class="lp-room-pill">
            <span class="lp-dot-g"></span>
            <span>${title}</span>
            <span class="lp-pin">#${pin}</span>
            <span class="lp-players">${playersLabel}</span>
        </div>`;
    }).join('');

    track.innerHTML = pillsHtml + pillsHtml;
    strip.style.display = '';
}

function t(key, ...params) {
    return window.__lpT ? window.__lpT(key, ...params) : key;
}

function renderQrMock() {
    const visual = document.getElementById('lp-qr-visual');
    if (visual) visual.innerHTML = '<div class="lp-qr-mock"></div>';
}

function renderQrEmpty() {
    const title = document.getElementById('lp-qr-title');
    const desc = document.getElementById('lp-qr-desc');
    if (!title || !desc) return;
    renderQrMock();
    title.setAttribute('data-translate', 'landing_pin_qr_none_title');
    desc.setAttribute('data-translate', 'landing_pin_qr_none_desc');
    title.textContent = t('landing_pin_qr_none_title');
    desc.textContent = t('landing_pin_qr_none_desc');
}

async function renderQrForGame(game) {
    const visual = document.getElementById('lp-qr-visual');
    const title = document.getElementById('lp-qr-title');
    const desc = document.getElementById('lp-qr-desc');
    if (!visual || !title || !desc) return;

    const pin = String(game.pin || '');
    if (!/^\d{6}$/.test(pin)) { renderQrEmpty(); return; }

    try {
        const res = await fetch(APIHelper.getApiUrl(`api/qr/${pin}`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !data.qrCode) throw new Error('no qrCode in response');

        const img = new Image();
        img.className = 'lp-qr-img';
        img.alt = `QR · ${pin}`;
        img.src = data.qrCode;
        visual.innerHTML = '';
        visual.appendChild(img);

        const safeTitle = String(game.title || '').trim() || `PIN ${pin}`;
        title.removeAttribute('data-translate');
        desc.removeAttribute('data-translate');
        title.textContent = safeTitle;
        desc.textContent = t('landing_pin_qr_live_desc', pin);
    } catch (err) {
        logger.warn('Landing: QR fetch failed, showing empty state', err);
        renderQrEmpty();
    }
}

async function fetchActiveGames() {
    try {
        const res = await fetch(APIHelper.getApiUrl('api/active-games'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const games = data.games || [];
        renderTicker(games);
        if (games.length > 0) {
            const featured = games[0];
            renderPinDigits(featured.pin);
            renderJoiners(featured.playerCount ?? 0);
            await renderQrForGame(featured);
        } else {
            startPinAnim();
            renderJoiners(null);
            renderQrEmpty();
        }
    } catch (err) {
        logger.warn('Landing: active games fetch failed', err);
        renderTicker([]);
        startPinAnim();
        renderJoiners(null);
        renderQrEmpty();
    }
}

let pinAnimTimer = null;

function stopPinAnim() {
    if (pinAnimTimer) {
        window.clearInterval(pinAnimTimer);
        pinAnimTimer = null;
    }
}

function startPinAnim() {
    stopPinAnim();
    const digits = document.querySelectorAll('#lp-pin-digits .lp-pin-digit');
    if (digits.length < 6) return;
    const initial = ['7', '4', '9', '2', '1', '_'];
    digits.forEach((d, i) => {
        d.textContent = initial[i];
        d.classList.toggle('filled', i < 4);
        d.classList.toggle('active', i === 4);
    });
    let cur = 0;
    pinAnimTimer = window.setInterval(() => {
        const prev = digits[4];
        const last = digits[5];
        const ch = PIN_CYCLE_CHARS[cur % PIN_CYCLE_CHARS.length];
        last.textContent = ch;
        last.classList.toggle('active', ch !== '_');
        last.classList.toggle('filled', ch !== '_');
        prev.classList.toggle('active', ch === '_');
        cur++;
    }, PIN_CYCLE_MS);
}

function renderPinDigits(pin) {
    stopPinAnim();
    const digits = document.querySelectorAll('#lp-pin-digits .lp-pin-digit');
    if (digits.length < 6) return;
    const chars = String(pin).padStart(6, '_').slice(0, 6).split('');
    digits.forEach((d, i) => {
        d.textContent = chars[i];
        d.classList.toggle('filled', chars[i] !== '_');
        d.classList.remove('active');
    });
}

function renderJoiners(count) {
    const joiners = document.querySelector('#main-menu.landing-v2 .lp-joiners');
    if (!joiners) return;
    if (count == null) {
        joiners.style.display = 'none';
        return;
    }
    joiners.style.display = '';
    const strong = joiners.querySelector('strong');
    if (strong) strong.textContent = String(count);
}

function wireHeroJoin() {
    const join = document.getElementById('lp-hero-join');
    if (!join) return;
    join.addEventListener('click', (e) => {
        e.preventDefault();
        const joinBtn = document.getElementById('join-btn') || document.getElementById('join-btn-mobile');
        if (joinBtn) joinBtn.click();
    });
}

function wireSectionLinks() {
    // Smooth-scroll in-page anchors without touching the global router/screen system.
    document.querySelectorAll('#main-menu.landing-v2 a[data-lp-scroll]').forEach(a => {
        a.addEventListener('click', (e) => {
            const id = a.getAttribute('data-lp-scroll');
            const tgt = id && document.getElementById(id);
            if (!tgt) return;
            e.preventDefault();
            tgt.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

let tickerTimer = null;

export function initLanding() {
    const root = getLandingRoot();
    if (!root || !root.classList.contains('landing-v2')) return;

    // Start decorative animation immediately; fetchActiveGames will override with live data.
    startPinAnim();

    // Expose a tiny translation shim for strings rendered from JS (ticker pills).
    import('./utils/translation-manager.js').then(({ translationManager }) => {
        window.__lpT = (key, ...params) => translationManager.getTranslationSync(key, params);
        // Re-render once the language loads so player count label localizes.
        fetchActiveGames();
    }).catch(() => {
        window.__lpT = (key) => key;
    });

    fetchActiveGames();
    if (tickerTimer) clearInterval(tickerTimer);
    tickerTimer = window.setInterval(fetchActiveGames, TICKER_REFRESH_MS);

    wireHeroJoin();
    wireSectionLinks();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanding);
} else {
    initLanding();
}
