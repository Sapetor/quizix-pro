/* global FormData, Blob */
/**
 * POST /api/extract-pptx returns the slide text of a .pptx upload, in slide
 * order, and rejects anything that is not a .pptx zip without parsing it.
 */

const express = require('express');
const JSZip = require('jszip');
const { createFileUploadRoutes } = require('../../routes/file-uploads');

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function slideXml(paragraphs) {
    const body = paragraphs.map(p => `<a:p><a:r><a:t>${p}</a:t></a:r></a:p>`).join('');
    return '<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>' +
        body + '</p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
}

// slides: array of slides, each an array of paragraph strings (already XML-escaped)
async function buildPptx(slides) {
    const zip = new JSZip();
    const overrides = slides.map((_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
    zip.file('[Content_Types].xml',
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
        overrides + '</Types>');
    slides.forEach((paragraphs, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(paragraphs)));
    return zip.generateAsync({ type: 'nodebuffer' });
}

describe('POST /api/extract-pptx', () => {
    let server;
    let baseUrl;

    beforeAll(() => new Promise((resolve) => {
        const noop = () => {};
        const logger = { debug: noop, info: noop, warn: noop, error: noop };
        const app = express();
        app.use(createFileUploadRoutes({ logger, CONFIG: { LIMITS: { MAX_FILE_SIZE: 5 * 1024 * 1024 } } }));
        server = app.listen(0, '127.0.0.1', () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    }));

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    test('returns the slide text of an uploaded PPTX', async () => {
        const buffer = await buildPptx([['Photosynthesis converts light to chemical energy']]);
        const form = new FormData();
        form.append('pptx', new Blob([buffer], { type: PPTX_MIME }), 'slides.pptx');

        const res = await fetch(`${baseUrl}/api/extract-pptx`, { method: 'POST', body: form });
        const body = await res.json();

        // Compare {status, body} so a failure prints the server error body.
        expect({ status: res.status, body }).toEqual(expect.objectContaining({ status: 200 }));
        expect(typeof body.text).toBe('string');
        expect(body.text).toContain('Photosynthesis converts light to chemical energy');
        expect(body.slideCount).toBeGreaterThanOrEqual(1);
    });

    async function upload(buffer, filename = 'slides.pptx') {
        const form = new FormData();
        form.append('pptx', new Blob([buffer], { type: PPTX_MIME }), filename);
        const res = await fetch(`${baseUrl}/api/extract-pptx`, { method: 'POST', body: form });
        return { status: res.status, body: await res.json() };
    }

    test('returns slides in numeric order with an exact slide count', async () => {
        // slide10 must come after slide2, which a plain string sort gets wrong
        const slides = Array.from({ length: 11 }, (_, i) => [`Slide number ${i + 1}`]);
        const { status, body } = await upload(await buildPptx(slides));

        expect(status).toBe(200);
        expect(body.slideCount).toBe(11);
        const positions = slides.map(([text]) => (body.text + '\n').indexOf(text + '\n'));
        expect(positions.every(p => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    test('decodes XML entities and keeps paragraphs on separate lines', async () => {
        const { status, body } = await upload(await buildPptx([['Q &amp; A', 'x &lt; y &#8804; z']]));

        expect(status).toBe(200);
        expect(body.text).toContain('Q & A\nx < y \u2264 z');
    });

    test('rejects a PDF sent with a PPTX mimetype instead of parsing it', async () => {
        const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
        const { status, body } = await upload(pdf, 'slides.pptx');

        expect(status).toBe(400);
        expect(body.messageKey).toBe('error_pptx_extraction_failed');
    });
});
