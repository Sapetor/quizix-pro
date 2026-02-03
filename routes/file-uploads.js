const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

/**
 * File Upload Routes
 * Handles image, PDF, DOCX, and PPTX uploads with processing
 *
 * Factory function to create file upload routes with dependencies
 * @param {Object} options - Configuration options
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.CONFIG - Configuration object (requires LIMITS.MAX_FILE_SIZE)
 * @returns {express.Router} Configured router
 */
function createFileUploadRoutes(options) {
    const { logger, CONFIG } = options;

    if (!logger) {
        throw new Error('logger is required for file upload routes');
    }

    if (!CONFIG || !CONFIG.LIMITS || !CONFIG.LIMITS.MAX_FILE_SIZE) {
        throw new Error('CONFIG.LIMITS.MAX_FILE_SIZE is required for file upload routes');
    }

    const router = express.Router();

    // ==================== IMAGE UPLOAD ====================

    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'public/uploads/');
        },
        filename: (req, file, cb) => {
            const randomBytes = crypto.randomBytes(16).toString('hex');
            cb(null, Date.now() + '-' + randomBytes + path.extname(file.originalname));
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

    router.post('/upload', upload.single('image'), async (req, res) => {
        try {
            if (!req.file) {
                logger.warn('Upload attempt with no file');
                return res.status(400).json({ error: 'No file uploaded' });
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
                return res.status(500).json({ error: 'File upload failed - file not saved' });
            }

            logger.debug(`File verification: ${stats.size} bytes on disk`);

            if (stats.size === 0) {
                logger.error('WARNING: Uploaded file is empty (0 bytes)!');
                await fs.promises.unlink(req.file.path); // Clean up empty file
                return res.status(500).json({ error: 'File upload failed - empty file' });
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
                return res.status(400).json({ error: 'Invalid image file content' });
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
            res.status(500).json({ error: 'Upload failed' });
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

    // Helper to add timeout to async operations
    function withTimeout(promise, timeoutMs, errorMessage) {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
            )
        ]);
    }

    router.post('/api/extract-pdf', pdfUpload.single('pdf'), async (req, res) => {
        const PDF_PARSE_TIMEOUT_MS = 30000; // 30 second timeout for PDF parsing

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No PDF file uploaded' });
            }

            // Reject very large files early (before parsing)
            const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
            if (req.file.size > MAX_PDF_SIZE) {
                return res.status(413).json({
                    error: 'PDF too large',
                    message: 'PDF file exceeds 10MB limit. Please use a smaller file or copy text manually.'
                });
            }

            // Dynamic import of pdf-parse (optional dependency)
            let pdfParse;
            try {
                pdfParse = require('pdf-parse');
            } catch (err) {
                logger.warn('pdf-parse not installed. Run: npm install pdf-parse');
                return res.status(501).json({
                    error: 'PDF extraction not available',
                    message: 'Server does not have PDF parsing capability. Please copy and paste the text content manually.'
                });
            }

            // Parse with timeout to prevent hanging on malformed PDFs
            const pdfData = await withTimeout(
                pdfParse(req.file.buffer),
                PDF_PARSE_TIMEOUT_MS,
                'PDF parsing timed out. The file may be too complex or corrupted.'
            );

            logger.info(`PDF extracted: ${req.file.originalname}, ${pdfData.numpages} pages, ${pdfData.text.length} chars`);

            res.json({
                text: pdfData.text,
                pages: pdfData.numpages,
                info: pdfData.info
            });
        } catch (error) {
            logger.error('PDF extraction error:', error);

            // Provide user-friendly error messages
            if (error.message.includes('timed out')) {
                return res.status(408).json({ error: error.message });
            }

            res.status(500).json({ error: 'Failed to extract text from PDF: ' + error.message });
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

    router.post('/api/extract-docx', docxUpload.single('docx'), async (req, res) => {
        const DOCX_PARSE_TIMEOUT_MS = 30000;

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No DOCX file uploaded' });
            }

            // Dynamic import of mammoth
            let mammoth;
            try {
                mammoth = require('mammoth');
            } catch (err) {
                logger.warn('mammoth not installed. Run: npm install mammoth');
                return res.status(501).json({
                    error: 'DOCX extraction not available',
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
                return res.status(408).json({ error: error.message });
            }

            res.status(500).json({ error: 'Failed to extract text from DOCX: ' + error.message });
        }
    });

    // ==================== PPTX UPLOAD & EXTRACTION ====================

    const pptxUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit (slides can have images)
        fileFilter: (req, file, cb) => {
            const validMimes = [
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/vnd.ms-powerpoint'
            ];
            cb(null, validMimes.includes(file.mimetype));
        }
    });

    router.post('/api/extract-pptx', pptxUpload.single('pptx'), async (req, res) => {
        const PPTX_PARSE_TIMEOUT_MS = 60000; // Longer timeout for large presentations

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No PowerPoint file uploaded' });
            }

            // Dynamic import of officeparser
            let officeparser;
            try {
                officeparser = require('officeparser');
            } catch (err) {
                logger.warn('officeparser not installed. Run: npm install officeparser');
                return res.status(501).json({
                    error: 'PowerPoint extraction not available',
                    message: 'Server does not have PowerPoint parsing capability.'
                });
            }

            // Parse with timeout
            const text = await withTimeout(
                officeparser.parseOfficeAsync(req.file.buffer),
                PPTX_PARSE_TIMEOUT_MS,
                'PowerPoint parsing timed out. The file may be too complex.'
            );

            // Estimate slide count from content structure (rough approximation)
            const slideCount = Math.max(1, Math.floor(text.length / 500));

            logger.info(`PPTX extracted: ${req.file.originalname}, ~${slideCount} slides, ${text.length} chars`);

            res.json({
                text: text,
                slideCount: slideCount
            });
        } catch (error) {
            logger.error('PPTX extraction error:', error);

            if (error.message.includes('timed out')) {
                return res.status(408).json({ error: error.message });
            }

            res.status(500).json({ error: 'Failed to extract text from PowerPoint: ' + error.message });
        }
    });

    return router;
}

module.exports = { createFileUploadRoutes };
