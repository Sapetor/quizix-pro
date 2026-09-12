/**
 * Atomic file write helper.
 *
 * Writes `body` to a sibling temp file and then renames it into place.
 * rename(2) is atomic on POSIX filesystems, so a crash mid-write leaves the
 * original file intact instead of a truncated/corrupt store — as opposed to a
 * plain fs.writeFile, which can leave a half-written file if the process dies.
 *
 * Extracted from the pattern originally inlined in user-service.js so quiz,
 * metadata, and results persistence can share one implementation.
 */

const fs = require('fs').promises;
const crypto = require('crypto');

/**
 * @param {string} finalPath - Destination path.
 * @param {string} body - File contents (already serialized).
 */
async function atomicWriteFile(finalPath, body) {
    // Unique per call: a shared `${finalPath}.tmp` lets two concurrent writes to
    // the same target interleave into one temp file, and the second rename then
    // promotes the mixed body into place.
    const tmp = `${finalPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
        await fs.writeFile(tmp, body, 'utf8');
        await fs.rename(tmp, finalPath);
    } catch (err) {
        try {
            await fs.unlink(tmp);
        } catch {
            // Temp file may never have been created; the original error wins.
        }
        throw err;
    }
}

module.exports = { atomicWriteFile };
