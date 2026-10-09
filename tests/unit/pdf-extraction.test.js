/* global FormData, Blob */
/**
 * POST /api/extract-pdf returns the text and page count of a PDF upload and
 * rejects input that is not a PDF with a 400.
 *
 * The route is run in a child process: pdfjs-dist is ESM-only and Jest's
 * CommonJS runtime cannot load it through dynamic import().
 */

const { spawn } = require('child_process');
const path = require('path');

const SERVER_SCRIPT = `
const express = require('express');
const { createFileUploadRoutes } = require(${JSON.stringify(path.join(__dirname, '../../routes/file-uploads'))});
const noop = () => {};
const app = express();
app.use(createFileUploadRoutes({
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    CONFIG: { LIMITS: { MAX_FILE_SIZE: 5 * 1024 * 1024 } }
}));
const server = app.listen(0, '127.0.0.1', () => console.log('PORT ' + server.address().port));
`;

// Minimal valid PDF: one Helvetica text line per page, correct xref offsets.
function buildPdf(pageTexts) {
    const objects = [];
    const pageIds = pageTexts.map((_, i) => 4 + i * 2);
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    pageTexts.forEach((text, i) => {
        const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
        objects[pageIds[i]] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
            `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
        objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    for (let id = 1; id < objects.length; id++) {
        offsets[id] = pdf.length;
        pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) {
        pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
}

describe('POST /api/extract-pdf', () => {
    let child;
    let baseUrl;

    beforeAll(() => new Promise((resolve, reject) => {
        child = spawn(process.execPath, ['-e', SERVER_SCRIPT], { stdio: ['ignore', 'pipe', 'inherit'] });
        child.on('error', reject);
        child.stdout.on('data', (chunk) => {
            const match = /PORT (\d+)/.exec(chunk.toString());
            if (match) {
                baseUrl = `http://127.0.0.1:${match[1]}`;
                resolve();
            }
        });
    }), 30000); // child startup loads express, sharp and multer from disk

    afterAll(() => child.kill());

    async function upload(buffer) {
        const form = new FormData();
        form.append('pdf', new Blob([buffer], { type: 'application/pdf' }), 'notes.pdf');
        const res = await fetch(`${baseUrl}/api/extract-pdf`, { method: 'POST', body: form });
        return { status: res.status, body: await res.json() };
    }

    test('returns the text and page count of a one-page PDF', async () => {
        const { status, body } = await upload(buildPdf(['Photosynthesis converts light']));

        expect({ status, body }).toEqual(expect.objectContaining({ status: 200 }));
        expect(body.pages).toBe(1);
        expect(body.text).toContain('Photosynthesis converts light');
    });

    test('returns pages in order', async () => {
        const { status, body } = await upload(buildPdf(['First page text', 'Second page text']));

        expect(status).toBe(200);
        expect(body.pages).toBe(2);
        expect(body.text.indexOf('First page text')).toBeGreaterThanOrEqual(0);
        expect(body.text.indexOf('Second page text')).toBeGreaterThan(body.text.indexOf('First page text'));
    });

    test('rejects input that is not a PDF with a 400', async () => {
        const { status, body } = await upload(Buffer.from('this is plain text, not a PDF'));

        expect(status).toBe(400);
        expect(body.messageKey).toBe('error_pdf_extraction_failed');
    });
});
