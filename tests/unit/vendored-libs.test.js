/**
 * Offline guard: the browser must not be told to fetch anything from another host.
 *
 * Static checks only. The behavioural proof (a real browser with every external
 * request aborted) is tests/e2e/offline-no-cdn.spec.js; this file catches the
 * common regressions (a new CDN tag, a moved or edited vendored file) in `npm test`.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const LIBS = path.join(PUBLIC, 'libs');

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

// Files that put a URL in front of the browser: the page, and the scripts that
// inject a <script> element at runtime.
const LOADER_FILES = [
    'public/index.html',
    'public/js/core/boot-head.js',
    'public/js/utils/results-viewer/results-exporter.js',
    'public/js/ai/generator.js'
];

describe('vendored libraries', () => {
    test('index.html loads no script, stylesheet or resource hint from another host', () => {
        const html = read('public/index.html');
        const tags = html.match(/<(script|link)\b[^>]*>/g) || [];
        const external = tags.filter((tag) => /\b(src|href)\s*=\s*["'](https?:)?\/\//i.test(tag));
        expect(external).toEqual([]);
    });

    test('every libs/ path referenced by the page and the lazy loaders exists', () => {
        const referenced = new Set();
        for (const file of LOADER_FILES) {
            for (const match of read(file).matchAll(/["'`](libs\/[^"'`?]+)/g)) {
                referenced.add(match[1]);
            }
        }
        // MathJax, six tags in index.html, the two lazy loaders.
        expect(referenced.size).toBeGreaterThanOrEqual(8);
        const missing = [...referenced].filter((ref) => !fs.existsSync(path.join(PUBLIC, ref)));
        expect(missing).toEqual([]);
    });

    test('the lazy loaders and the service worker name no CDN host', () => {
        const cdnHost = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|cdn\.socket\.io|fonts\.googleapis\.com|fonts\.gstatic\.com/;
        const offenders = [...LOADER_FILES.slice(1), 'public/sw.js'].filter((file) => cdnHost.test(read(file)));
        expect(offenders).toEqual([]);
    });

    test('fonts.css points only at files that exist next to it', () => {
        const css = read('public/libs/fonts/fonts.css');
        const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]);
        expect(urls.length).toBeGreaterThan(0);
        expect(urls.filter((url) => /^(https?:)?\/\//.test(url))).toEqual([]);
        const missing = [...new Set(urls)].filter((url) => !fs.existsSync(path.join(LIBS, 'fonts', url)));
        expect(missing).toEqual([]);
    });

    test('every vendored file matches SHA256SUMS and no file is unlisted', () => {
        const listed = new Map(
            fs.readFileSync(path.join(LIBS, 'SHA256SUMS'), 'utf8')
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const [digest, name] = line.split(/\s{2}/);
                    return [name, digest];
                })
        );

        const mismatched = [];
        for (const [name, digest] of listed) {
            const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(LIBS, name))).digest('hex');
            if (actual !== digest) mismatched.push(name);
        }
        expect(mismatched).toEqual([]);

        const onDisk = fs.readdirSync(LIBS, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => path.relative(LIBS, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
            .filter((name) => name !== 'SHA256SUMS' && path.basename(name) !== 'README.md');
        expect(onDisk.filter((name) => !listed.has(name))).toEqual([]);
    });
});
