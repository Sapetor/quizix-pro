const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const JSZip = require('jszip');
const { Worker } = require('worker_threads');
const { getClientIp } = require('../middleware/client-ip');

// Same guard the other route modules use to decide whether raw error text may
// go back to the client.
const isProduction = process.env.NODE_ENV === 'production';

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXmlText(text) {
    return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (match, entity) => {
        if (entity[0] !== '#') return XML_ENTITIES[entity] ?? match;
        const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return String.fromCodePoint(code);
    });
}

/**
 * Extract slide text from a .pptx buffer. A .pptx is a zip whose slides live at
 * ppt/slides/slideN.xml; text runs are <a:t> elements inside <a:p> paragraphs.
 * Throws if the buffer is not a zip or has no slides.
 * @returns {Promise<{text: string, slideCount: number}>}
 */
// A PDF under the upload cap can still declare thousands of pages or inflate
// its streams far past 10 MB, so extraction runs in a capped, killable worker.
const PDF_WORKER_PATH = path.join(__dirname, '..', 'utils', 'pdf-text-worker.mjs');
const PDF_MAX_PAGES = 500;
const PDF_MAX_CHARS = 1000000;
const PDF_WORKER_HEAP_MB = 256;
const PDF_MAX_CONCURRENT = 2;
let activePdfWorkers = 0;

function extractPdfText(buffer, timeoutMs) {
    return new Promise((resolve, reject) => {
        activePdfWorkers++;
        const worker = new Worker(PDF_WORKER_PATH, {
            workerData: { data: new Uint8Array(buffer), maxPages: PDF_MAX_PAGES, maxChars: PDF_MAX_CHARS },
            resourceLimits: { maxOldGenerationSizeMb: PDF_WORKER_HEAP_MB }
        });
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            activePdfWorkers--;
            worker.terminate();
            fn(value);
        };
        const timer = setTimeout(() => finish(reject, new Error('PDF parsing timed out. The file may be too complex or corrupted.')), timeoutMs);
        worker.once('message', result => finish(resolve, result));
        worker.once('error', error => finish(reject, error));
        worker.once('exit', code => finish(reject, new Error(`PDF worker exited with code ${code}`)));
    });
}

// Uploads are capped compressed (multer), so decompressed size needs its own cap.
const MAX_SLIDE_XML_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_XML_BYTES = 20 * 1024 * 1024;

function readZipEntryCapped(file, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        const stream = file.internalStream('uint8array');
        stream
            .on('data', (chunk) => {
                size += chunk.length;
                if (size > maxBytes) {
                    stream.pause();
                    reject(new Error('slide XML exceeds size limit'));
                    return;
                }
                chunks.push(chunk);
            })
            .on('error', reject)
            .on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
            .resume();
    });
}

async function extractPptxText(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files)
        .map(name => ({ name, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(name)?.[1]) }))
        .filter(f => f.n > 0)
        .sort((a, b) => a.n - b.n);
    if (slideFiles.length === 0) throw new Error('no slides found');

    const slideTexts = [];
    let remaining = MAX_TOTAL_XML_BYTES;
    for (const { name } of slideFiles) {
        const xml = await readZipEntryCapped(zip.file(name), Math.min(MAX_SLIDE_XML_BYTES, remaining));
        remaining -= Buffer.byteLength(xml);
        // Split on </a:p> and bound the attribute match: both keep parsing linear on hostile input.
        // <a:t> only occurs inside <a:p>, so text before a paragraph's opening tag is not lost.
        const paragraphs = xml.split('</a:p>').slice(0, -1)
            .map(p => [...p.matchAll(/<a:t(?:\s[^<>]{0,1000})?>([^<]*)<\/a:t>/g)].map(m => decodeXmlText(m[1])).join(''))
            .filter(p => p.trim());
        slideTexts.push(paragraphs.join('\n'));
    }
    return { text: slideTexts.join('\n\n'), slideCount: slideFiles.length };
}

/**
 * File Upload Routes
 * Handles image, PDF, DOCX, and PPTX uploads with processing
 *
 * Factory function to create file upload routes with dependencies
 * @param {Object} options - Configuration options
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.CONFIG - Configuration object (requires LIMITS.MAX_FILE_SIZE)
 * @param {number} [options.pdfTimeoutMs=30000] - PDF extraction timeout; the worker is terminated when it passes
 * @returns {express.Router} Configured router
 */
function createFileUploadRoutes(options) {
    const { logger, CONFIG, pdfTimeoutMs = 30000 } = options;

    if (!logger) {
        throw new Error('logger is required for file upload routes');
    }

    if (!CONFIG || !CONFIG.LIMITS || !CONFIG.LIMITS.MAX_FILE_SIZE) {
        throw new Error('CONFIG.LIMITS.MAX_FILE_SIZE is required for file upload routes');
    }

    const router = express.Router();

    // ==================== RATE LIMITING ====================
    // Image upload is unauthenticated (anonymous quiz editing is a supported
    // flow) and each request costs a disk write plus a sharp WebP conversion.
    // Cap per-IP request rate so an anonymous client can't flood disk / burn
    // CPU. Same idiom as the AI and Manim routes.

    const uploadRateLimits = new Map();
    const UPLOAD_MAX_REQUESTS_PER_MINUTE = 30;
    const UPLOAD_WINDOW_MS = 60 * 1000; // 1 minute

    function checkUploadRateLimit(ip) {
        const now = Date.now();
        const limit = uploadRateLimits.get(ip);

        if (!limit || now > limit.resetTime) {
            uploadRateLimits.set(ip, { count: 1, resetTime: now + UPLOAD_WINDOW_MS });
            return { allowed: true, remaining: UPLOAD_MAX_REQUESTS_PER_MINUTE - 1 };
        }

        if (limit.count >= UPLOAD_MAX_REQUESTS_PER_MINUTE) {
            const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
            return { allowed: false, retryAfter, remaining: 0 };
        }

        limit.count++;
        return { allowed: true, remaining: UPLOAD_MAX_REQUESTS_PER_MINUTE - limit.count };
    }

    // Cleanup stale rate limit entries every 5 minutes.
    // unref'd so the sweep never keeps the process alive on shutdown.
    const uploadRateLimitSweep = setInterval(() => {
        const now = Date.now();
        for (const [ip, limit] of uploadRateLimits.entries()) {
            if (now > limit.resetTime + 60000) {
                uploadRateLimits.delete(ip);
            }
        }
    }, 5 * 60 * 1000);
    if (uploadRateLimitSweep.unref) uploadRateLimitSweep.unref();

    // Guard placed BEFORE multer so a rejected request never touches disk.
    function uploadRateLimit(req, res, next) {
        const clientIP = getClientIp(req);
        const rateCheck = checkUploadRateLimit(clientIP);
        if (!rateCheck.allowed) {
            logger.warn(`Image upload rate limit exceeded for IP: ${clientIP}`);
            return res.status(429).json({
                error: 'Rate limit exceeded',
                messageKey: 'error_rate_limited',
                retryAfter: rateCheck.retryAfter
            });
        }
        return next();
    }

    // ==================== IMAGE UPLOAD ====================

    const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'public/uploads/');
        },
        filename: (req, file, cb) => {
            const randomBytes = crypto.randomBytes(16).toString('hex');
            // Never take the extension verbatim from the client: public/uploads is
            // served statically, so an ".html" (or ".svg") name whose bytes still
            // pass the image magic-byte check below would be served as markup on
            // this origin — stored XSS. Only image extensions are allowed through;
            // anything else is stored as .png (browsers decode <img> by content).
            const ext = path.extname(file.originalname).toLowerCase();
            const safeExt = ALLOWED_IMAGE_EXTENSIONS.includes(ext) ? ext : '.png';
            cb(null, Date.now() + '-' + randomBytes + safeExt);
        }
    });

    const upload = multer({
        storage: storage,
        limits: {
            fileSize: CONFIG.LIMITS.MAX_FILE_SIZE,
            files: 1 // Only allow 1 file at a time
        },
        fileFilter: (req, file, cb) => {
            logger.debug(`Upload filter check: ${file.originalname}, ${file.mimetype}, ${file.size || 'unknown size'}`);
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                logger.warn(`Rejected file: ${file.originalname} - invalid type: ${file.mimetype}`);
                cb(new Error('Only image files are allowed!'), false);
            }
        }
    });

    router.post('/upload', uploadRateLimit, upload.single('image'), async (req, res) => {
        try {
            if (!req.file) {
                logger.warn('Upload attempt with no file');
                return res.status(400).json({ error: 'No file uploaded', messageKey: 'error_no_file_uploaded' });
            }

            // Enhanced debugging for Ubuntu binary file issues
            logger.info(`File uploaded successfully: ${req.file.filename}`);
            logger.debug('Upload details:', {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                destination: req.file.destination,
                filename: req.file.filename,
                path: req.file.path
            });

            // Verify the file was actually written correctly (async)
            let stats;
            try {
                stats = await fs.promises.stat(req.file.path);
            } catch (statError) {
                logger.error(`File not found after upload: ${req.file.path}`);
                return res.status(500).json({ error: 'File upload failed - file not saved', messageKey: 'error_upload_not_saved' });
            }

            logger.debug(`File verification: ${stats.size} bytes on disk`);

            if (stats.size === 0) {
                logger.error('WARNING: Uploaded file is empty (0 bytes)!');
                await fs.promises.unlink(req.file.path); // Clean up empty file
                return res.status(500).json({ error: 'File upload failed - empty file', messageKey: 'error_upload_empty_file' });
            }

            if (stats.size !== req.file.size) {
                logger.warn(`File size mismatch: expected ${req.file.size}, got ${stats.size}`);
            }

            // Verify actual file content matches claimed type (magic byte check)
            // Use async file handle for non-blocking I/O
            const buffer = Buffer.alloc(12);
            const fileHandle = await fs.promises.open(req.file.path, 'r');
            try {
                await fileHandle.read(buffer, 0, 12, 0);
            } finally {
                await fileHandle.close();
            }

            // Detect image type from magic bytes
            const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
            const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
            const isGIF = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
            const isWebP = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
                     buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
            const isBMP = buffer[0] === 0x42 && buffer[1] === 0x4D;

            const isValidImage = isJPEG || isPNG || isGIF || isWebP || isBMP;

            if (!isValidImage) {
                logger.warn(`File content doesn't match image signature: ${req.file.filename}`);
                await fs.promises.unlink(req.file.path); // Delete suspicious file
                return res.status(400).json({ error: 'Invalid image file content', messageKey: 'error_invalid_image_content' });
            }

            // Convert to WebP for better compression (skip if already WebP or animated GIF)
            let webpUrl = null;
            let webpFilename = null;
            const originalUrl = `/uploads/${req.file.filename}`;

            // Skip WebP conversion for already-WebP files and GIFs (to preserve animations)
            if (!isWebP && !isGIF) {
                try {
                    // Generate WebP filename (replace extension with .webp)
                    const baseName = req.file.filename.replace(/\.[^.]+$/, '');
                    webpFilename = `${baseName}.webp`;
                    const webpPath = path.join(req.file.destination, webpFilename);

                    // Convert to WebP with quality setting (80 is a good balance)
                    await sharp(req.file.path)
                        .webp({ quality: 80 })
                        .toFile(webpPath);

                    const webpStats = await fs.promises.stat(webpPath);
                    const originalSize = stats.size;
                    const webpSize = webpStats.size;
                    const savings = ((originalSize - webpSize) / originalSize * 100).toFixed(1);

                    logger.info(`WebP conversion: ${req.file.filename} -> ${webpFilename} (${savings}% smaller)`);
                    webpUrl = `/uploads/${webpFilename}`;
                } catch (conversionError) {
                    // Log but don't fail - original file is still valid
                    logger.warn(`WebP conversion failed for ${req.file.filename}:`, conversionError.message);
                }
            } else if (isWebP) {
                // File is already WebP, use it directly
                webpUrl = originalUrl;
                webpFilename = req.file.filename;
                logger.debug(`File already WebP: ${req.file.filename}`);
            } else {
                logger.debug(`Skipping WebP conversion for GIF: ${req.file.filename}`);
            }

            // Return both URLs - client can choose which to use
            res.json({
                filename: req.file.filename,
                url: originalUrl,
                webpFilename: webpFilename,
                webpUrl: webpUrl
            });
        } catch (error) {
            logger.error('Upload error:', error);
            res.status(500).json({ error: 'Upload failed', messageKey: 'error_upload_failed' });
        }
    });

    // ==================== PDF UPLOAD & EXTRACTION ====================

    const pdfUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for PDFs
        fileFilter: (req, file, cb) => {
            if (file.mimetype === 'application/pdf') {
                cb(null, true);
            } else {
                cb(new Error('Only PDF files are allowed'), false);
            }
        }
    });

    // Helper to add timeout to async operations.
    // The timer is cleared once the race settles; without that every extraction
    // left a live 30-60s timer behind after the parse had already resolved.
    function withTimeout(promise, timeoutMs, errorMessage) {
        let timeoutId;
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
            })
        ]).finally(() => clearTimeout(timeoutId));
    }

    router.post('/api/extract-pdf', uploadRateLimit, pdfUpload.single('pdf'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No PDF file uploaded', messageKey: 'error_no_pdf_uploaded' });
            }

            // Reject very large files early (before parsing)
            const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
            if (req.file.size > MAX_PDF_SIZE) {
                return res.status(413).json({
                    error: 'PDF too large',
                    messageKey: 'error_pdf_too_large',
                    message: 'PDF file exceeds 10MB limit. Please use a smaller file or copy text manually.'
                });
            }

            if (activePdfWorkers >= PDF_MAX_CONCURRENT) {
                return res.status(503).json({ error: 'PDF extraction busy, try again shortly', messageKey: 'error_rate_limited' });
            }

            let text, pages;
            try {
                ({ text, pages } = await extractPdfText(req.file.buffer, pdfTimeoutMs));
            } catch (error) {
                if (error.message.includes('timed out')) throw error;
                logger.warn('PDF extraction failed:', error.message);
                return res.status(400).json({ error: 'Failed to extract text from PDF', messageKey: 'error_pdf_extraction_failed' });
            }

            logger.info(`PDF extracted: ${req.file.originalname}, ${pages} pages, ${text.length} chars`);

            res.json({ text, pages });
        } catch (error) {
            logger.error('PDF extraction error:', error);

            // Provide user-friendly error messages
            if (error.message.includes('timed out')) {
                return res.status(408).json({ error: error.message, messageKey: 'error_pdf_timeout' });
            }

            res.status(500).json({
                error: 'Failed to extract text from PDF',
                messageKey: 'error_pdf_extraction_failed',
                details: isProduction ? undefined : error.message
            });
        }
    });

    // ==================== DOCX UPLOAD & EXTRACTION ====================

    const docxUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
        fileFilter: (req, file, cb) => {
            const validMimes = [
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ];
            cb(null, validMimes.includes(file.mimetype));
        }
    });

    router.post('/api/extract-docx', uploadRateLimit, docxUpload.single('docx'), async (req, res) => {
        const DOCX_PARSE_TIMEOUT_MS = 30000;

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No DOCX file uploaded', messageKey: 'error_no_docx_uploaded' });
            }

            // Dynamic import of mammoth
            let mammoth;
            try {
                mammoth = require('mammoth');
            } catch (err) {
                logger.warn('mammoth not installed. Run: npm install mammoth');
                return res.status(501).json({
                    error: 'DOCX extraction not available',
                    messageKey: 'error_docx_not_available',
                    message: 'Server does not have DOCX parsing capability.'
                });
            }

            // Parse with timeout
            const result = await withTimeout(
                mammoth.extractRawText({ buffer: req.file.buffer }),
                DOCX_PARSE_TIMEOUT_MS,
                'DOCX parsing timed out. The file may be too complex.'
            );

            const text = result.value || '';
            const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

            logger.info(`DOCX extracted: ${req.file.originalname}, ${wordCount} words`);

            res.json({
                text: text,
                wordCount: wordCount
            });
        } catch (error) {
            logger.error('DOCX extraction error:', error);

            if (error.message.includes('timed out')) {
                return res.status(408).json({ error: error.message, messageKey: 'error_docx_timeout' });
            }

            res.status(500).json({
                error: 'Failed to extract text from DOCX',
                messageKey: 'error_docx_extraction_failed',
                details: isProduction ? undefined : error.message
            });
        }
    });

    // ==================== PPTX UPLOAD & EXTRACTION ====================

    const pptxUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit (slides can have images)
        fileFilter: (req, file, cb) => {
            const validMimes = [
                'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            ];
            cb(null, validMimes.includes(file.mimetype));
        }
    });

    router.post('/api/extract-pptx', uploadRateLimit, pptxUpload.single('pptx'), async (req, res) => {
        const PPTX_PARSE_TIMEOUT_MS = 60000; // Longer timeout for large presentations

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No PowerPoint file uploaded', messageKey: 'error_no_pptx_uploaded' });
            }

            let text, slideCount;
            try {
                ({ text, slideCount } = await withTimeout(
                    extractPptxText(req.file.buffer),
                    PPTX_PARSE_TIMEOUT_MS,
                    'PowerPoint parsing timed out. The file may be too complex.'
                ));
            } catch (error) {
                if (error.message.includes('timed out')) throw error;
                // Not a zip, or a zip without slides: the upload is not a .pptx
                logger.warn(`PPTX rejected: ${req.file.originalname}: ${error.message}`);
                return res.status(400).json({
                    error: 'Failed to extract text from PowerPoint',
                    messageKey: 'error_pptx_extraction_failed'
                });
            }

            logger.info(`PPTX extracted: ${req.file.originalname}, ${slideCount} slides, ${text.length} chars`);

            res.json({
                text: text,
                slideCount: slideCount
            });
        } catch (error) {
            logger.error('PPTX extraction error:', error);

            if (error.message.includes('timed out')) {
                return res.status(408).json({ error: error.message, messageKey: 'error_pptx_timeout' });
            }

            res.status(500).json({
                error: 'Failed to extract text from PowerPoint',
                messageKey: 'error_pptx_extraction_failed',
                details: isProduction ? undefined : error.message
            });
        }
    });

    // Router-scoped error handler so multer errors (oversized file, rejected
    // type) return the JSON {error, messageKey} shape instead of an HTML 500.
    // Covers all uploaders defined above.
    router.use((err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            logger.warn(`Upload rejected (${err.code}): ${req.path}`);
            const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            return res.status(status).json({
                error: err.message,
                messageKey: err.code === 'LIMIT_FILE_SIZE' ? 'error_file_too_large' : 'error_upload_failed'
            });
        }
        if (err) {
            logger.warn(`Upload rejected: ${err.message} (${req.path})`);
            return res.status(400).json({ error: err.message, messageKey: 'error_upload_failed' });
        }
        return next();
    });

    return router;
}

module.exports = { createFileUploadRoutes };
