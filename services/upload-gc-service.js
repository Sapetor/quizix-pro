/**
 * Upload Garbage Collection Service
 *
 * public/uploads/ accumulates images and videos forever: quiz deletes and edits
 * never remove the files they referenced. This sweep deletes upload files that
 * are (a) not referenced by any quiz or result store AND (b) older than a grace
 * age, so an in-progress editor session that uploaded a file but hasn't saved
 * the quiz yet is not raced.
 *
 * References are found by scanning the raw JSON text of quizzes/*.json and
 * results/*.json for `/uploads/<filename>` substrings (the storage-path format
 * from image-path-resolver.js). Raw-text scanning is schema-agnostic — it
 * covers image, video, explanationVideo, per-option images, backgrounds, and
 * the question copies saved inside result files — and it naturally survives
 * malformed JSON without a parse step. Any match keeps the file, so the sweep
 * errs toward keeping: it never deletes a file it is unsure about.
 *
 * Dotfiles are skipped outright — they are directory markers, not uploads.
 */

const fs = require('fs').promises;
const path = require('path');

const GRACE_MS = 24 * 60 * 60 * 1000; // 24h — don't touch recently uploaded files
const UPLOAD_REF_REGEX = /\/uploads\/([A-Za-z0-9._-]+)/g;

class UploadGCService {
    /**
     * @param {Object} logger
     * @param {Object} [options]
     * @param {string} [options.uploadsDir='public/uploads']
     * @param {string[]} [options.referenceDirs=['quizzes','results']] - dirs whose
     *        *.json files may reference /uploads/ paths.
     * @param {number} [options.graceMs=24h] - minimum file age before deletion.
     */
    constructor(logger, options = {}) {
        this.logger = logger;
        this.uploadsDir = options.uploadsDir || path.join('public', 'uploads');
        this.referenceDirs = options.referenceDirs || ['quizzes', 'results'];
        this.graceMs = options.graceMs != null ? options.graceMs : GRACE_MS;
    }

    /**
     * Build the set of upload filenames referenced by any store.
     * @returns {Promise<Set<string>>}
     */
    async collectReferenced() {
        const referenced = new Set();

        for (const dir of this.referenceDirs) {
            let files;
            try {
                files = await fs.readdir(dir);
            } catch (err) {
                this.logger.debug(`Upload GC: cannot read ${dir}: ${err.message}`);
                continue;
            }

            for (const name of files) {
                if (!name.endsWith('.json')) continue;
                const filePath = path.join(dir, name);

                let text;
                try {
                    text = await fs.readFile(filePath, 'utf8');
                } catch (err) {
                    // Malformed/unreadable file: skip it, don't crash the sweep.
                    this.logger.debug(`Upload GC: skipping unreadable ${filePath}: ${err.message}`);
                    continue;
                }

                let m;
                UPLOAD_REF_REGEX.lastIndex = 0;
                while ((m = UPLOAD_REF_REGEX.exec(text)) !== null) {
                    referenced.add(m[1]);
                }
            }
        }

        return referenced;
    }

    /**
     * Run one sweep: delete unreferenced upload files older than the grace age.
     * @param {Object} [opts]
     * @param {boolean} [opts.dryRun=false] - when true, log but delete nothing.
     * @returns {Promise<{referencedCount:number, deleted:number, bytesFreed:number, keptYoung:number, dryRun:boolean}>}
     */
    async sweep({ dryRun = false } = {}) {
        const referenced = await this.collectReferenced();

        let uploadFiles;
        try {
            uploadFiles = await fs.readdir(this.uploadsDir);
        } catch (err) {
            this.logger.warn(`Upload GC: cannot read uploads dir ${this.uploadsDir}: ${err.message}`);
            return { referencedCount: referenced.size, deleted: 0, bytesFreed: 0, keptYoung: 0, dryRun };
        }

        const now = Date.now();
        let deleted = 0;
        let bytesFreed = 0;
        let keptYoung = 0;

        for (const name of uploadFiles) {
            // Dotfiles are infrastructure markers (.gitkeep, .DS_Store), never
            // uploads, so no quiz ever references them and they always look like
            // old orphans. Never sweep them.
            if (name.startsWith('.')) continue;
            if (referenced.has(name)) continue;

            const filePath = path.join(this.uploadsDir, name);

            let stat;
            try {
                stat = await fs.stat(filePath);
            } catch (err) {
                this.logger.debug(`Upload GC: cannot stat ${filePath}: ${err.message}`);
                continue;
            }
            if (!stat.isFile()) continue;

            const age = now - stat.mtimeMs;
            if (age < this.graceMs) {
                // Uploaded recently — may belong to an editor session that hasn't
                // saved the quiz yet. Leave it.
                keptYoung++;
                continue;
            }

            if (dryRun) {
                this.logger.debug(`Upload GC: would delete ${name} (${stat.size} bytes)`);
                deleted++;
                bytesFreed += stat.size;
                continue;
            }

            try {
                await fs.unlink(filePath);
                this.logger.debug(`Upload GC: deleted ${name} (${stat.size} bytes)`);
                deleted++;
                bytesFreed += stat.size;
            } catch (err) {
                this.logger.warn(`Upload GC: failed to delete ${filePath}: ${err.message}`);
            }
        }

        this.logger.info(
            `Upload GC${dryRun ? ' (dry-run)' : ''}: ${referenced.size} referenced, ` +
            `${deleted} ${dryRun ? 'deletable' : 'deleted'} (${bytesFreed} bytes freed), ` +
            `${keptYoung} kept (too new)`
        );

        return { referencedCount: referenced.size, deleted, bytesFreed, keptYoung, dryRun };
    }
}

module.exports = { UploadGCService, GRACE_MS };
