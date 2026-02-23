/**
 * Manim Render Service
 * Renders Manim animation code to MP4 video files.
 * Executes inside a Python venv — no npm dependencies required.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

// Patterns that indicate dangerous code — blocked unconditionally.
// The one exception: "self.play(Open" is a Manim animation call, not a file open.
const BLOCKLIST_PATTERNS = [
    { pattern: /os\.system\s*\(/i,       label: 'os.system' },
    { pattern: /os\.popen\s*\(/i,        label: 'os.popen' },
    { pattern: /subprocess/i,            label: 'subprocess' },
    { pattern: /\beval\s*\(/,            label: 'eval(' },
    { pattern: /\bexec\s*\(/,            label: 'exec(' },
    { pattern: /__import__\s*\(/,        label: '__import__' },
    { pattern: /\bimportlib\b/i,         label: 'importlib' },
    { pattern: /\bshutil\b/i,            label: 'shutil' },
    // Allow self.play(Open(...)) — a Manim animation — but block bare open(
    { pattern: /(?<!self\.play\s*\()(?<!\.play\s*\()\bopen\s*\(/,  label: 'open(' },
    { pattern: /\bsocket\b/i,            label: 'socket' },
    { pattern: /\brequests\b/i,          label: 'requests' },
    { pattern: /\burllib\b/i,            label: 'urllib' },
    { pattern: /http\.client/i,          label: 'http.client' },
];

class ManimRenderService {
    /**
     * @param {object} logger  - Logger with .info/.warn/.error/.debug methods
     * @param {object} config  - Application config object
     */
    constructor(logger, config = {}) {
        this.logger = logger;

        this.venvPath = config.MANIM_VENV_PATH
            || process.env.MANIM_VENV_PATH
            || path.join(os.homedir(), 'manim-env');

        this.outputDir = path.join(__dirname, '..', 'public', 'uploads');

        this.renderTimeout = config.MANIM_RENDER_TIMEOUT
            || parseInt(process.env.MANIM_RENDER_TIMEOUT, 10)
            || 60000;

        this.maxCodeLength = 10000;
        this.maxOutputSize = 50 * 1024 * 1024; // 50 MB

        this.enabled = config.MANIM_ENABLED !== false
            && process.env.MANIM_ENABLED !== 'false';

        this.logger.info(
            `ManimRenderService initialised — enabled=${this.enabled}, ` +
            `venv=${this.venvPath}, timeout=${this.renderTimeout}ms`
        );
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Validate Manim Python code without executing it.
     *
     * @param {string} code
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validateCode(code) {
        const errors = [];

        if (typeof code !== 'string') {
            errors.push('Code must be a string');
            return { valid: false, errors };
        }

        if (code.trim().length === 0) {
            errors.push('Code must not be empty');
            return { valid: false, errors };
        }

        if (code.length > this.maxCodeLength) {
            errors.push(
                `Code exceeds maximum length of ${this.maxCodeLength} characters ` +
                `(got ${code.length})`
            );
        }

        // Security blocklist
        for (const { pattern, label } of BLOCKLIST_PATTERNS) {
            if (pattern.test(code)) {
                errors.push(`Forbidden pattern detected: ${label}`);
            }
        }

        // Must import manim
        const hasManinImport = /from\s+manim\s+import/.test(code)
            || /import\s+manim/.test(code);
        if (!hasManinImport) {
            errors.push('Code must contain "from manim import" or "import manim"');
        }

        // Must define at least one Scene subclass
        const hasScene = /class\s+\w+\s*\(\s*\w*Scene\s*\)/.test(code);
        if (!hasScene) {
            errors.push('Code must define at least one class that extends a Scene');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Check whether Manim is available in the configured venv.
     *
     * @returns {Promise<{ available: boolean, version: string|null, error: string|null }>}
     */
    async checkAvailability() {
        const manimBin = path.join(this.venvPath, 'bin', 'manim');

        if (!fs.existsSync(manimBin)) {
            this.logger.warn(`Manim binary not found at: ${manimBin}`);
            return { available: false, version: null, error: `Manim binary not found: ${manimBin}` };
        }

        return new Promise((resolve) => {
            execFile(manimBin, ['--version'], { timeout: 5000 }, (err, stdout, stderr) => {
                if (err) {
                    const msg = err.message || String(err);
                    this.logger.warn(`Manim version check failed: ${msg}`);
                    resolve({ available: false, version: null, error: msg });
                    return;
                }

                // Manim prints e.g. "Manim Community v0.18.0" or "manim 0.18.0"
                const output = (stdout || stderr || '').trim();
                const match = output.match(/v?(\d+\.\d+[\.\d]*)/);
                const version = match ? match[1] : output || null;

                this.logger.info(`Manim available — version: ${version}`);
                resolve({ available: true, version, error: null });
            });
        });
    }

    /**
     * Render a Manim animation to MP4 and copy it to the uploads directory.
     *
     * @param {string} manimCode      - Python source code with a Manim Scene class
     * @param {object} [options]
     * @param {'low'|'medium'|'high'} [options.quality='low'] - Render quality
     * @returns {Promise<{ videoPath: string, duration: null }>}
     */
    async renderAnimation(manimCode, options = {}) {
        if (!this.enabled) {
            throw new Error('Manim rendering is disabled');
        }

        // Validate code before touching the filesystem
        const { valid, errors } = this.validateCode(manimCode);
        if (!valid) {
            throw new Error(`Invalid Manim code: ${errors.join('; ')}`);
        }

        // Extract the first Scene class name
        const sceneMatch = manimCode.match(/class\s+(\w+)\s*\(\s*\w*Scene\s*\)/);
        if (!sceneMatch) {
            // validateCode already catches this but belt-and-suspenders
            throw new Error('No Scene subclass found in code');
        }
        const sceneClassName = sceneMatch[1];

        // Quality flag mapping
        const qualityMap = { low: '-ql', medium: '-qm', high: '-qh' };
        const quality = options.quality && qualityMap[options.quality]
            ? options.quality
            : 'low';
        const qualityFlag = qualityMap[quality];

        this.logger.info(
            `Rendering scene "${sceneClassName}" at quality="${quality}"`
        );

        // Create isolated temp directory for this render
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manim-'));
        this.logger.debug(`Temp dir: ${tempDir}`);

        try {
            // Write source to file
            const sourceFile = path.join(tempDir, 'scene.py');
            fs.writeFileSync(sourceFile, manimCode, 'utf8');

            // Build args for: python -m manim render <quality> --format mp4 --media_dir <dir> scene.py <ClassName>
            const args = [
                '-m', 'manim',
                'render',
                qualityFlag,
                '--format', 'mp4',
                '--media_dir', tempDir,
                'scene.py',
                sceneClassName,
            ];

            const pythonBin = path.join(this.venvPath, 'bin', 'python');
            this.logger.debug(`Executing: ${pythonBin} ${args.join(' ')}`);

            // Spawn the render process
            await new Promise((resolve, reject) => {
                const proc = execFile(
                    pythonBin,
                    args,
                    { timeout: this.renderTimeout, cwd: tempDir },
                    (err, stdout, stderr) => {
                        if (err) {
                            // execFile sets err.killed = true on timeout
                            if (err.killed || err.signal === 'SIGKILL') {
                                reject(new Error(
                                    `Manim render timed out after ${this.renderTimeout}ms`
                                ));
                            } else {
                                const detail = (stderr || err.message || '').slice(0, 500);
                                reject(new Error(`Manim render failed: ${detail}`));
                            }
                            return;
                        }

                        this.logger.debug(`Manim stdout: ${stdout}`);
                        if (stderr) {
                            this.logger.debug(`Manim stderr: ${stderr}`);
                        }

                        resolve();
                    }
                );

                // Ensure SIGKILL on timeout (belt-and-suspenders over execFile's timeout)
                const killTimer = setTimeout(() => {
                    try { proc.kill('SIGKILL'); } catch (_) { /* already dead */ }
                }, this.renderTimeout + 2000);

                proc.on('close', () => clearTimeout(killTimer));
            });

            // Locate the output MP4
            const mp4Path = this._findMp4(tempDir);
            if (!mp4Path) {
                throw new Error('Manim render completed but no MP4 output was found');
            }

            // Guard against absurdly large output files
            const { size } = fs.statSync(mp4Path);
            if (size > this.maxOutputSize) {
                throw new Error(
                    `Rendered video (${size} bytes) exceeds maximum allowed size ` +
                    `(${this.maxOutputSize} bytes)`
                );
            }

            // Ensure uploads directory exists
            fs.mkdirSync(this.outputDir, { recursive: true });

            // Copy to uploads with a unique filename
            const filename = `manim-${crypto.randomBytes(8).toString('hex')}.mp4`;
            const destPath = path.join(this.outputDir, filename);
            fs.copyFileSync(mp4Path, destPath);

            this.logger.info(`Manim render complete — output: /uploads/${filename} (${size} bytes)`);

            return { videoPath: '/uploads/' + filename, duration: null };

        } finally {
            this._cleanupTempDir(tempDir);
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Recursively find the first .mp4 file under `dir`.
     *
     * @param {string} dir
     * @returns {string|null} Absolute path to the first MP4 found, or null
     */
    _findMp4(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (err) {
            this.logger.warn(`_findMp4: cannot read directory ${dir}: ${err.message}`);
            return null;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = this._findMp4(fullPath);
                if (found) return found;
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')) {
                return fullPath;
            }
        }

        return null;
    }

    /**
     * Remove a temporary directory, swallowing any errors.
     *
     * @param {string} tempDir
     */
    _cleanupTempDir(tempDir) {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
            this.logger.debug(`Cleaned up temp dir: ${tempDir}`);
        } catch (err) {
            this.logger.warn(`Failed to clean up temp dir ${tempDir}: ${err.message}`);
        }
    }
}

module.exports = { ManimRenderService };
