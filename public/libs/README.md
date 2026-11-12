# Vendored third-party libraries

Every library and font the browser loads is served from this directory, so the
app works on a network with no internet access. `index.html` and three lazy
loaders reference these files relative to `<base href>`; nothing here is an npm
dependency and nothing is fetched at install or build time.

`tests/e2e/offline-no-cdn.spec.js` aborts every request to a host other than
localhost and fails if one is attempted. `tests/unit/vendored-libs.test.js`
checks that each referenced file exists and that every file matches
`SHA256SUMS`.

Vendored 2026-11-12. `sha256sum -c SHA256SUMS` (run in this directory) verifies
every file listed below plus SheetJS.

## Libraries

Files were taken unmodified from the npm registry tarball named in each row
(`npm pack <name>@<version>`). The sha256 in the table is that of the tarball;
per-file hashes are in `SHA256SUMS`.

| Library | Version | Licence | Source tarball | Tarball sha256 |
|---|---|---|---|---|
| MathJax | 3.2.2 | Apache-2.0 (`mathjax/LICENSE`) | https://registry.npmjs.org/mathjax/-/mathjax-3.2.2.tgz | `1b9c0a1c44df864e915690558e72adb9cc5203360daefd385084ced3b6c64c09` |
| canvas-confetti | 1.6.0 | ISC (`canvas-confetti/LICENSE`) | https://registry.npmjs.org/canvas-confetti/-/canvas-confetti-1.6.0.tgz | `225c7b03a2d7b354c3f10cc4675cc8ab57bdefe0109a1c7d6b3b28c350d00c75` |
| Chart.js | 4.4.0 | MIT (`chartjs/LICENSE.md`) | https://registry.npmjs.org/chart.js/-/chart.js-4.4.0.tgz | `5563cc3d87d1ddda7190f56b9a689e30da95c3fde7c7a94e8b566f85b47e6667` |
| highlight.js | 11.9.0 | BSD-3-Clause (`highlightjs/LICENSE`) | https://registry.npmjs.org/@highlightjs/cdn-assets/-/cdn-assets-11.9.0.tgz | `62b15dbb4430b9692eb864e99393f4578646da1b25d437fc9e10a79786330dd0` |
| jsPDF | 2.5.1 | MIT (`jspdf/LICENSE`) | https://registry.npmjs.org/jspdf/-/jspdf-2.5.1.tgz | `106070cae9e15de91e02ad40fdbf5cda97d41f390f06d46f5b06c2a623b09e97` |
| mermaid | 10.9.8 | MIT (`mermaid/LICENSE`) | https://registry.npmjs.org/mermaid/-/mermaid-10.9.8.tgz | `d41f5a1593dcca5a04d44618089b72dbfb2b3b750bd5c3f20927579312c6d692` |
| SheetJS | 0.20.3 | Apache-2.0 | see `sheetjs/README.md` | |

Files copied from each tarball, and where they are loaded:

| Library | Path in tarball | Path here | File sha256 | Loaded by |
|---|---|---|---|---|
| MathJax | `package/es5/tex-mml-chtml.js` | `mathjax/es5/tex-mml-chtml.js` | `300480069078b5892d2363a2b65e2dfbbf30fe5c80f83edbfecf4610fd093862` | `index.html`, `js/core/boot-head.js` |
| MathJax | `package/es5/input/tex/extensions/` (35 files) | `mathjax/es5/input/tex/extensions/` | `SHA256SUMS` | MathJax, on demand |
| MathJax | `package/es5/output/chtml/fonts/woff-v2/` (23 files) | `mathjax/es5/output/chtml/fonts/woff-v2/` | `SHA256SUMS` | MathJax, on demand |
| canvas-confetti | `package/dist/confetti.browser.js` | `canvas-confetti/confetti.browser.js` | `eb3a35255ffa9d5d1b05b292f9a3b140a0120dfe3176b0fb1dc4f3e0306ca99c` | `index.html` |
| Chart.js | `package/dist/chart.umd.js` | `chartjs/chart.umd.js` | `321e3a3fa98da4aaa957d10be57cbb514de0989eed8f9d726b5d05902cd01904` | `index.html` |
| highlight.js | `package/highlight.min.js` | `highlightjs/highlight.min.js` | `837a6fa5b0c736b52bbde2b2b6190f305da3fc9ed41681db5321507057b5c846` | `index.html` |
| highlight.js | `package/styles/atom-one-dark.min.css` | `highlightjs/styles/atom-one-dark.min.css` | `4237ffca7ce6aadb438c457e0a675b125c534bbdda5b87f41f3a1495603bcc9b` | `index.html` |
| jsPDF | `package/dist/jspdf.umd.min.js` | `jspdf/jspdf.umd.min.js` | `98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875` | `js/utils/results-viewer/results-exporter.js`, on first PDF export |
| mermaid | `package/dist/mermaid.min.js` | `mermaid/mermaid.min.js` | `8d607d7ef1d077a8aa202e18e62212bfa992c68bfeabc5cf45d51a128fe6675d` | `js/ai/generator.js`, on first diagram |

Notes:

- MathJax: the `es5/` layout must be kept. MathJax takes the directory of its
  own script as its root and loads `input/tex/extensions/<name>.js` (the TeX
  autoloader, for macros such as `\cancel` or `\ce`) and the webfonts from
  paths relative to it. The speech, SVG-output and accessibility components are
  not vendored; the app does not load them. `mathjax@3` on the CDN was a
  floating major version that resolved to 3.2.2.
- canvas-confetti: the tarball ships `confetti.browser.js` only. The
  `confetti.browser.min.js` the app used before was minified by jsDelivr.
- highlight.js: the npm package `highlight.js` has no browser build. The
  project publishes it as `@highlightjs/cdn-assets`, which is also what cdnjs
  mirrors.
- mermaid: `mermaid.min.js` is the single-file build (3.3 MB). The ESM entry
  the app used before (`mermaid.esm.min.mjs`) imports 44 further chunks,
  5.0 MB in total. The tarball has no licence file; `mermaid/LICENSE` is from
  https://raw.githubusercontent.com/mermaid-js/mermaid/v10.9.8/LICENSE.
  `mermaid@10` on the CDN was a floating major version; 10.9.8 was the newest
  10.x release on the vendoring date.
- The Socket.IO client is not vendored. `index.html` loads
  `socket.io/socket.io.min.js`, which the socket.io server serves from its own
  npm package, so the client always matches the server.

## Fonts

`fonts/fonts.css` is the stylesheet Google Fonts returned (Chrome user agent)
for the request `index.html` used to make:

    https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400..600&display=swap

Its 77 `@font-face` rules are unchanged except that each `src` URL points at a
local file. The 22 woff2 files are the ones those URLs served, renamed
`<family>-<subset>.woff2`. Each family directory holds its SIL Open Font
License text (`OFL.txt`), from `ofl/<family>/OFL.txt` in
https://github.com/google/fonts.

| Local file | Source |
|---|---|
| `fonts/inter/inter-cyrillic-ext.woff2` | https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7SUc.woff2 |
| `fonts/inter/inter-cyrillic.woff2` | https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa0ZL7SUc.woff2 |
| `fonts/inter/inter-greek-ext.woff2` | https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2ZL7SUc.woff2 |
| `fonts/inter/inter-greek.woff2` | https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1pL7SUc.woff2 |
| `fonts/inter/inter-latin-ext.woff2` | https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7SUc.woff2 |
| `fonts/inter/inter-latin.woff2` | https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2 |
| `fonts/inter/inter-vietnamese.woff2` | https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2pL7SUc.woff2 |
| `fonts/jetbrains-mono/jetbrains-mono-cyrillic-ext.woff2` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx3cwhsk.woff2 |
| `fonts/jetbrains-mono/jetbrains-mono-cyrillic.woff2` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxTcwhsk.woff2 |
| `fonts/jetbrains-mono/jetbrains-mono-greek.woff2` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxPcwhsk.woff2 |
| `fonts/jetbrains-mono/jetbrains-mono-latin-ext.woff2` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx7cwhsk.woff2 |
| `fonts/jetbrains-mono/jetbrains-mono-latin.woff2` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwg.woff2 |
| `fonts/jetbrains-mono/jetbrains-mono-vietnamese.woff2` | https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx_cwhsk.woff2 |
| `fonts/source-serif-4/source-serif-4-cyrillic-ext.woff2` | https://fonts.gstatic.com/s/sourceserif4/v15/vEFI2_tTDB4M7-auWDN0ahZJW1gW8tenXg.woff2 |
| `fonts/source-serif-4/source-serif-4-cyrillic.woff2` | https://fonts.gstatic.com/s/sourceserif4/v15/vEFI2_tTDB4M7-auWDN0ahZJW1gf8tenXg.woff2 |
| `fonts/source-serif-4/source-serif-4-greek.woff2` | https://fonts.gstatic.com/s/sourceserif4/v15/vEFI2_tTDB4M7-auWDN0ahZJW1gY8tenXg.woff2 |
| `fonts/source-serif-4/source-serif-4-latin-ext.woff2` | https://fonts.gstatic.com/s/sourceserif4/v15/vEFI2_tTDB4M7-auWDN0ahZJW1gV8tenXg.woff2 |
| `fonts/source-serif-4/source-serif-4-latin.woff2` | https://fonts.gstatic.com/s/sourceserif4/v15/vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2 |
| `fonts/source-serif-4/source-serif-4-vietnamese.woff2` | https://fonts.gstatic.com/s/sourceserif4/v15/vEFI2_tTDB4M7-auWDN0ahZJW1gU8tenXg.woff2 |
| `fonts/space-grotesk/space-grotesk-latin-ext.woff2` | https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPb94C-s0.woff2 |
| `fonts/space-grotesk/space-grotesk-latin.woff2` | https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPbF4Cw.woff2 |
| `fonts/space-grotesk/space-grotesk-vietnamese.woff2` | https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPb54C-s0.woff2 |

## Upgrading a library

1. `npm pack <name>@<version>` in an empty temporary directory and unpack it.
2. Copy the files listed above over the ones here, plus the licence file.
3. Regenerate the checksums, from this directory:
   `find . -type f ! -name README.md ! -name SHA256SUMS | LC_ALL=C sort | sed 's|^\./||' | xargs -d '\n' sha256sum > SHA256SUMS`
4. Update the version and hashes in this file.
5. Run `npx jest tests/unit/vendored-libs.test.js` and
   `PW_PORT=3511 npx playwright test tests/e2e/offline-no-cdn.spec.js --project=chromium`.
