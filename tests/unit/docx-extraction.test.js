/* global FormData, Blob */
/**
 * POST /api/extract-docx returns the text of a .docx upload. The document is
 * parsed in a worker thread with a cap on the inflated size of every part
 * mammoth reads, so a small upload that inflates to a large XML part is
 * refused instead of being parsed on the server's main thread.
 */

const express = require('express');
const JSZip = require('jszip');
const { createFileUploadRoutes } = require('../../routes/file-uploads');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CONTENT_TYPES = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
const MAIN_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';

function documentXml(paragraphs) {
    const body = paragraphs.map(p => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('');
    return '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${body}</w:body></w:document>`;
}

// mainPath: where the main document part is stored. Anything other than
// word/document.xml is reached through the package relationships.
async function buildDocx(paragraphs, mainPath = 'word/document.xml') {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.file('_rels/.rels',
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${MAIN_REL_TYPE}" Target="${mainPath}"/></Relationships>`);
    zip.file(mainPath, documentXml(paragraphs));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('POST /api/extract-docx', () => {
    let server;
    let baseUrl;
    let slowServer;
    let slowUrl;

    function listen(options) {
        const noop = () => {};
        const logger = { debug: noop, info: noop, warn: noop, error: noop };
        const app = express();
        app.use(createFileUploadRoutes({ logger, CONFIG: { LIMITS: { MAX_FILE_SIZE: 5 * 1024 * 1024 } }, ...options }));
        return new Promise((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
    }

    beforeAll(async () => {
        server = await listen({});
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        slowServer = await listen({ docxTimeoutMs: 1 });
        slowUrl = `http://127.0.0.1:${slowServer.address().port}`;
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
        await new Promise((resolve) => slowServer.close(resolve));
    });

    async function upload(buffer, url = baseUrl) {
        const form = new FormData();
        form.append('docx', new Blob([buffer], { type: DOCX_MIME }), 'notes.docx');
        const res = await fetch(`${url}/api/extract-docx`, { method: 'POST', body: form });
        return { status: res.status, body: await res.json() };
    }

    test('returns the text and word count of a small DOCX', async () => {
        const { status, body } = await upload(await buildDocx(['Photosynthesis converts light', 'Second paragraph']));

        // Compare {status, body} so a failure prints the server error body.
        expect({ status, body }).toEqual(expect.objectContaining({ status: 200 }));
        expect(body.text).toContain('Photosynthesis converts light');
        expect(body.text).toContain('Second paragraph');
        expect(body.wordCount).toBe(5);
    }, 30000);

    test('rejects a main document part that inflates past the size cap', async () => {
        // about 6 KB compressed, 6 MB inflated
        const { status, body } = await upload(await buildDocx([' '.repeat(6 * 1024 * 1024)]));

        expect(status).toBe(400);
        expect(body.messageKey).toBe('error_docx_extraction_failed');
    }, 30000);

    test('applies the cap to a main part stored under a non-XML name', async () => {
        const buffer = await buildDocx([' '.repeat(6 * 1024 * 1024)], 'word/media/image1.png');
        const { status, body } = await upload(buffer);

        expect(status).toBe(400);
        expect(body.messageKey).toBe('error_docx_extraction_failed');
    }, 30000);

    test('rejects a file that is not a zip with a 400', async () => {
        const { status, body } = await upload(Buffer.from('this is plain text, not a DOCX'));

        expect(status).toBe(400);
        expect(body.messageKey).toBe('error_docx_extraction_failed');
    }, 30000);

    test('allows one extraction in flight per client', async () => {
        const docx = await buildDocx(['Concurrent upload']);
        const statuses = (await Promise.all([upload(docx), upload(docx)])).map(r => r.status).sort();

        expect(statuses).toEqual([200, 503]);
    }, 30000);

    test('returns 408 when extraction exceeds the timeout, and keeps serving', async () => {
        const slow = await upload(await buildDocx(['Timeout case']), slowUrl);
        expect(slow.status).toBe(408);
        expect(slow.body.messageKey).toBe('error_docx_timeout');

        const next = await upload(await buildDocx(['After timeout']));
        expect(next.status).toBe(200);
        expect(next.body.text).toContain('After timeout');
    }, 30000);
});
