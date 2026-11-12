// Extracts DOCX text in a worker thread. mammoth inflates and parses each XML
// part synchronously, so running it here lets routes/file-uploads.js cap its
// heap and terminate it on timeout without blocking the server's event loop.
//
// The upload is capped compressed (multer), so the inflated size needs its own
// cap. mammoth takes the part paths from the package relationships, which the
// uploader controls, so a filter on entry names would miss a main part stored
// under another name. The cap is applied to every part mammoth reads instead.
const { parentPort, workerData } = require('node:worker_threads');
const JSZip = require('jszip');
const mammoth = require('mammoth');

const { data, maxPartBytes, maxTotalBytes } = workerData;

function readCapped(entry, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        const stream = entry.internalStream('uint8array');
        stream
            .on('data', (chunk) => {
                size += chunk.length;
                if (size > maxBytes) {
                    stream.pause();
                    reject(new Error('DOCX part exceeds size limit'));
                    return;
                }
                chunks.push(chunk);
            })
            .on('error', reject)
            .on('end', () => resolve(Buffer.concat(chunks)))
            .resume();
    });
}

(async () => {
    const zip = await JSZip.loadAsync(data);
    let remaining = maxTotalBytes;

    // The zip interface mammoth reads through (mammoth/lib/zipfile.js).
    const docxFile = {
        exists: name => zip.file(name) !== null,
        read: async (name, encoding) => {
            const bytes = await readCapped(zip.file(name), Math.min(maxPartBytes, remaining));
            remaining -= bytes.length;
            if (encoding === 'base64') return bytes.toString('base64');
            return encoding ? new TextDecoder(encoding).decode(bytes) : bytes;
        }
    };

    const result = await mammoth.extractRawText({ file: docxFile });
    parentPort.postMessage({ text: result.value || '' });
})();
