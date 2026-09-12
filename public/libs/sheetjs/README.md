# Vendored SheetJS

- Upstream: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- Version: 0.20.3
- sha256: cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41 (951904 bytes)
- Vendored: 2026-09-11

Reason: npm and cdnjs are frozen at 0.18.5, which has CVE-2023-30533 (prototype
pollution, fixed in 0.19.3) and CVE-2024-22363 (ReDoS, fixed in 0.20.2). Both are
in parse paths this app reaches via XLSX.read() in
public/js/ai/excel-question-parser.js. Patched builds ship only from
cdn.sheetjs.com, so upgrades must be re-downloaded from the URL above.
