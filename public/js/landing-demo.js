/**
 * Landing live demo card (#lp-demo) — the signature element.
 *
 * Renders a real, answerable question on the landing page: MathJax typesets the
 * equation, highlight.js colors the code, the answer keys are real <button>s.
 *
 * Cadence is driven by the CSS animation on .lp-demo-fill (6s), not by a JS
 * timer: the global `prefers-reduced-motion` rule in landing.css kills that
 * animation, so under reduced motion nothing advances on its own and the card
 * becomes click-only. The `reduceMotion` guard below makes that explicit.
 */
import { logger } from './core/config.js';
import { escapeHtml } from './utils/dom.js';
import { simpleMathJaxService } from './utils/simple-mathjax-service.js';

const MATHJAX_WAIT_MS = 4000;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Slides. `key`/`es` pairs are an i18n key plus its Spanish fallback (the
 * inline convention used by index.html). Text with no key is language-neutral.
 */
const SLIDES = [
    {
        cc: 'a',
        chip: { key: 'landing_qtype1_title', es: 'Opción múltiple' },
        stem: { key: 'landing_qpreview_qtext', es: '¿Cuál es la solución real de la ecuación' },
        math: 'x^{2} + 4x - 5 = 0',
        tail: '?',
        options: [
            { math: 'x = 1,\\ x = -5', pct: 64, correct: true },
            { math: 'x = 1,\\ x = 5', pct: 22 },
            { math: 'x = -1,\\ x = 5', pct: 9 },
            { key: 'landing_qpreview_no_solution', es: 'Sin solución real', pct: 5 }
        ]
    },
    {
        cc: 'e',
        chip: { key: 'landing_qtype1_title', es: 'Opción múltiple' },
        stem: { key: 'landing_demo_code_q', es: '¿Qué imprime este programa?' },
        code: {
            lang: 'python',
            src: 'scores = [90, 75, 88]\ntop = max(scores, key=lambda s: s % 10)\nprint(top)'
        },
        options: [
            { text: '88', mono: true, pct: 52, correct: true },
            { text: '90', mono: true, pct: 28 },
            { text: '75', mono: true, pct: 12 },
            { text: '8', mono: true, pct: 8 }
        ]
    },
    {
        cc: 'd',
        chip: { key: 'landing_qtype3_title', es: 'Verdadero / Falso' },
        stem: {
            key: 'landing_demo_tf_q',
            es: 'Toda función continua en un intervalo cerrado [a, b] alcanza un valor máximo en ese intervalo.'
        },
        options: [
            { key: 'true_display', es: 'Verdadero', pct: 71, correct: true },
            { key: 'false_display', es: 'Falso', pct: 29 }
        ]
    },
    {
        cc: 'f',
        chip: { key: 'landing_qtype4_title', es: 'Entrada numérica' },
        stem: {
            key: 'landing_demo_num_q',
            es: 'Un cuerpo parte del reposo y acelera a 9.8 m/s². ¿Qué rapidez alcanza a los 3.0 s?'
        },
        numeric: { answer: 29.4, tolerance: 0.5, unit: 'm/s' }
    }
];

const state = { index: 0, taken: false, token: 0 };
let inited = false;
let reduceMotion = false;

function t(key, fallback) {
    if (!key) return fallback || '';
    const value = window.__lpT ? window.__lpT(key) : key;
    return (!value || value === key) ? (fallback || key) : value;
}

// True only while the landing screen is the visible, foreground screen.
function landingActive() {
    const root = document.getElementById('main-menu');
    return !!root && root.classList.contains('active') && !document.hidden;
}

// Set text on an element and keep its data-translate in sync so a later
// language switch re-translates it (translation-manager assigns textContent).
function setText(el, key, fallback) {
    if (!el) return;
    if (key) {
        el.setAttribute('data-translate', key);
    } else {
        el.removeAttribute('data-translate');
    }
    el.textContent = t(key, fallback);
}

function buildOption(index, opt) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lp-demo-opt';
    btn.dataset.i = String(index);
    btn.style.setProperty('--pct', `${opt.pct}%`);
    // Fixed skeleton, no data.
    btn.innerHTML = '<span class="lp-demo-letter" aria-hidden="true"></span>' +
        '<span class="lp-demo-label"></span>' +
        '<span class="lp-demo-mark" aria-hidden="true"></span>' +
        '<span class="lp-demo-pct"></span>';

    btn.querySelector('.lp-demo-letter').textContent = LETTERS[index] || '';
    btn.querySelector('.lp-demo-pct').textContent = `${opt.pct}%`;

    const label = btn.querySelector('.lp-demo-label');
    if (opt.math) {
        label.innerHTML = `<span class="tex2jax_process">\\(${escapeHtml(opt.math)}\\)</span>`;
    } else {
        label.classList.toggle('is-mono', !!opt.mono);
        setText(label, opt.key, opt.text || opt.es);
    }
    return btn;
}

function renderStem(qEl, slide) {
    qEl.innerHTML = '';

    const stem = document.createElement('span');
    setText(stem, slide.stem.key, slide.stem.es);
    qEl.appendChild(stem);

    if (slide.math) {
        const math = document.createElement('span');
        math.className = 'tex2jax_process';
        math.textContent = `\\( ${slide.math} \\)`;
        qEl.appendChild(document.createTextNode(' '));
        qEl.appendChild(math);
    }
    if (slide.tail) {
        qEl.appendChild(document.createTextNode(slide.tail));
    }
    if (slide.code) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = `language-${slide.code.lang}`;
        code.textContent = slide.code.src;
        pre.appendChild(code);
        qEl.appendChild(pre);
        if (window.hljs && window.hljs.highlightElement) {
            try {
                window.hljs.highlightElement(code);
            } catch (err) {
                logger.warn('Landing demo: highlight.js failed', err);
            }
        }
    }
}

function slideHasMath(slide) {
    if (slide.math) return true;
    return !!(slide.options && slide.options.some(o => o.math));
}

// Reveal any LaTeX that MathJax never processed, so the raw source is at least
// readable (index.html hides .tex2jax_process until MathJax_Processed lands).
function unhideMath(root) {
    root.querySelectorAll('.tex2jax_process:not(.MathJax_Processed)')
        .forEach(el => el.classList.add('MathJax_Processed'));
}

async function typeset(root, token) {
    try {
        await simpleMathJaxService.waitForMathJax(MATHJAX_WAIT_MS);
        if (token !== state.token) return;
        await simpleMathJaxService.render([root]);
    } catch (err) {
        logger.warn('Landing demo: MathJax typeset failed', err);
    }
    if (token === state.token) unhideMath(root);
}

function restartTrack(card) {
    const track = card && card.querySelector('.lp-demo-track');
    if (!track) return;
    track.innerHTML = '<span class="lp-demo-fill"></span>';
    if (reduceMotion) return;
    const fill = track.firstElementChild;
    if (fill) fill.addEventListener('animationend', onTick);
}

function onTick(event) {
    if (event.animationName !== 'lp-demo-tick') return;
    if (state.taken) return;
    // Off-screen (another screen is active, or the tab is backgrounded): do not
    // advance, just re-arm. Browsers pause animations in hidden tabs, so this
    // costs nothing there and resumes cleanly when the landing is shown again.
    if (!landingActive()) {
        restartTrack(document.getElementById('lp-demo-card'));
        return;
    }
    renderSlide(state.index + 1);
}

function renderSlide(rawIndex) {
    const card = document.getElementById('lp-demo-card');
    if (!card) return;

    const index = ((rawIndex % SLIDES.length) + SLIDES.length) % SLIDES.length;
    const slide = SLIDES[index];
    state.index = index;
    state.taken = false;
    state.token += 1;
    const token = state.token;

    card.classList.remove('is-taken', 'is-revealed');

    // HUD
    const n = document.getElementById('lp-demo-n');
    if (n) n.textContent = String(index + 1);
    const chip = document.getElementById('lp-demo-chip');
    if (chip) chip.dataset.cc = slide.cc;
    setText(document.getElementById('lp-demo-chip-label'), slide.chip.key, slide.chip.es);

    const pips = document.getElementById('lp-demo-pips');
    if (pips) {
        Array.from(pips.children).forEach((pip, i) => pip.classList.toggle('is-on', i === index));
    }

    // Question
    const qEl = document.getElementById('lp-demo-q');
    if (qEl) renderStem(qEl, slide);

    // Answer area
    const opts = document.getElementById('lp-demo-opts');
    const numeric = document.getElementById('lp-demo-numeric');
    if (opts) {
        opts.innerHTML = '';
        opts.classList.toggle('hidden', !slide.options);
        if (slide.options) {
            slide.options.forEach((opt, i) => opts.appendChild(buildOption(i, opt)));
        }
    }
    if (numeric) {
        numeric.classList.toggle('hidden', !slide.numeric);
        numeric.classList.remove('is-correct', 'is-wrong');
        if (slide.numeric) {
            const input = document.getElementById('lp-demo-num-input');
            if (input) {
                input.value = '';
                input.disabled = false;
            }
            const submit = document.getElementById('lp-demo-submit');
            if (submit) submit.disabled = false;
            const tol = document.getElementById('lp-demo-tol-n');
            if (tol) tol.textContent = String(slide.numeric.tolerance);
            const unit = document.getElementById('lp-demo-unit');
            if (unit) unit.textContent = slide.numeric.unit || '';
            const answer = document.getElementById('lp-demo-answer');
            if (answer) {
                answer.textContent = `= ${slide.numeric.answer} ${slide.numeric.unit || ''}`.trim();
                answer.classList.add('hidden');
            }
        }
    }

    // Foot
    setText(document.getElementById('lp-demo-status'), 'landing_qpreview_responses', '24 respuestas recibidas');
    const dist = document.getElementById('lp-demo-dist');
    if (dist) dist.classList.add('hidden');

    restartTrack(card);

    if (slideHasMath(slide)) typeset(card, token);
}

function reveal(verdictKey, verdictEs) {
    const card = document.getElementById('lp-demo-card');
    if (!card) return;
    state.taken = true;
    card.classList.add('is-taken', 'is-revealed');
    setText(document.getElementById('lp-demo-status'), verdictKey, verdictEs);
    const dist = document.getElementById('lp-demo-dist');
    if (dist) dist.classList.remove('hidden');
}

function answerOption(index) {
    if (state.taken) return;
    const slide = SLIDES[state.index];
    const opts = document.getElementById('lp-demo-opts');
    if (!slide.options || !opts) return;

    const buttons = Array.from(opts.children);
    const correctIndex = slide.options.findIndex(o => o.correct);
    const isCorrect = index === correctIndex;

    buttons.forEach((btn, i) => {
        btn.disabled = true;
        if (i === correctIndex) btn.classList.add('is-correct');
        if (i === index && !isCorrect) btn.classList.add('is-wrong');
    });

    reveal(
        isCorrect ? 'landing_demo_correct' : 'landing_demo_wrong',
        isCorrect ? '¡Correcto!' : 'Incorrecto — la respuesta marcada es la correcta.'
    );
}

function answerNumeric() {
    if (state.taken) return;
    const slide = SLIDES[state.index];
    const numeric = document.getElementById('lp-demo-numeric');
    const input = document.getElementById('lp-demo-num-input');
    if (!slide.numeric || !numeric || !input) return;

    const value = parseFloat(String(input.value).replace(',', '.'));
    if (!Number.isFinite(value)) return;

    const isCorrect = Math.abs(value - slide.numeric.answer) <= slide.numeric.tolerance;
    numeric.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
    input.disabled = true;
    const submit = document.getElementById('lp-demo-submit');
    if (submit) submit.disabled = true;
    const answer = document.getElementById('lp-demo-answer');
    if (answer) answer.classList.remove('hidden');

    reveal(
        isCorrect ? 'landing_demo_correct' : 'landing_demo_wrong',
        isCorrect ? '¡Correcto!' : 'Incorrecto — la respuesta marcada es la correcta.'
    );
}

export function initDemo() {
    const card = document.getElementById('lp-demo-card');
    if (!card || inited) return;
    inited = true;

    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // One delegated listener for the option grid; it is rebuilt on every slide.
    const opts = document.getElementById('lp-demo-opts');
    if (opts) {
        opts.addEventListener('click', (e) => {
            const btn = e.target.closest('.lp-demo-opt');
            if (!btn || btn.disabled) return;
            answerOption(Number(btn.dataset.i));
        });
    }

    const submit = document.getElementById('lp-demo-submit');
    if (submit) submit.addEventListener('click', answerNumeric);

    const input = document.getElementById('lp-demo-num-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                answerNumeric();
            }
        });
    }

    const next = document.getElementById('lp-demo-next');
    if (next) next.addEventListener('click', () => renderSlide(state.index + 1));

    const total = card.querySelector('.lp-demo-total');
    if (total) total.textContent = String(SLIDES.length);

    renderSlide(0);
    logger.debug('Landing demo initialized', { slides: SLIDES.length, reduceMotion });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDemo);
} else {
    initDemo();
}
