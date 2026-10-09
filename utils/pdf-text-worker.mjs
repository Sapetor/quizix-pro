// Extracts PDF text in a worker thread. pdf.js parses synchronously between
// awaits, so running it here lets routes/file-uploads.js cap its heap and
// terminate it on timeout without blocking the server's event loop.
// isEvalSupported: false keeps pdf.js from compiling font programs with new Function.
import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const { data, maxPages, maxChars } = workerData;

const doc = await getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0
}).promise;

const pageTexts = [];
let chars = 0;
for (let n = 1; n <= Math.min(doc.numPages, maxPages) && chars < maxChars; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const text = items.map(item => item.str + (item.hasEOL ? '\n' : '')).join('');
    pageTexts.push(text);
    chars += text.length;
}

parentPort.postMessage({ text: pageTexts.join('\n\n').slice(0, maxChars), pages: doc.numPages });
