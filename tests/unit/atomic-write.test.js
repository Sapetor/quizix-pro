/**
 * Atomic Write Helper Tests
 *
 * Uses a real temp directory so the temp-file + rename behavior is exercised
 * end-to-end (same style as the user-service tests).
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const { atomicWriteFile } = require('../../services/atomic-write');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
}

async function cleanup(dir) {
    try {
        await fs.rm(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
}

describe('atomicWriteFile', () => {
    let tmpDir;

    beforeEach(async () => {
        tmpDir = await makeTempDir();
    });

    afterEach(async () => {
        await cleanup(tmpDir);
    });

    test('writes the body to the destination path', async () => {
        const dest = path.join(tmpDir, 'store.json');
        await atomicWriteFile(dest, '{"a":1}');
        expect(await fs.readFile(dest, 'utf8')).toBe('{"a":1}');
    });

    test('leaves no .tmp file behind on success', async () => {
        const dest = path.join(tmpDir, 'store.json');
        await atomicWriteFile(dest, '{"a":1}');

        const entries = await fs.readdir(tmpDir);
        expect(entries).toEqual(['store.json']);
        expect(entries).not.toContain('store.json.tmp');
    });

    test('overwrites an existing file', async () => {
        const dest = path.join(tmpDir, 'store.json');
        await fs.writeFile(dest, 'old', 'utf8');
        await atomicWriteFile(dest, 'new');
        expect(await fs.readFile(dest, 'utf8')).toBe('new');
    });

    test('does not corrupt the existing file when the write fails (rename never runs)', async () => {
        const dest = path.join(tmpDir, 'store.json');
        await fs.writeFile(dest, 'original', 'utf8');

        // Point the destination at a path whose .tmp parent does not exist so the
        // temp write fails before any rename can touch the real file.
        const bad = path.join(tmpDir, 'no-such-dir', 'store.json');
        await expect(atomicWriteFile(bad, 'garbage')).rejects.toThrow();

        // The pre-existing file is untouched.
        expect(await fs.readFile(dest, 'utf8')).toBe('original');
    });
});
