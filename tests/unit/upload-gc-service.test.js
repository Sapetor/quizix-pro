/**
 * UploadGCService tests (mocked fs).
 *
 * Verifies the sweep keeps referenced files, deletes unreferenced-and-old
 * files, keeps unreferenced-but-young files (grace window), and survives
 * malformed/unreadable quiz JSON without crashing.
 */

const { UploadGCService, GRACE_MS } = require('../../services/upload-gc-service');
const fs = require('fs').promises;

jest.mock('fs', () => ({
    promises: {
        readdir: jest.fn(),
        readFile: jest.fn(),
        stat: jest.fn(),
        unlink: jest.fn()
    }
}));

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const NOW = 1_700_000_000_000;
const OLD_MTIME = NOW - (GRACE_MS + 60_000);   // older than grace
const YOUNG_MTIME = NOW - 60_000;               // within grace

function fileStat(size, mtimeMs) {
    return { size, mtimeMs, isFile: () => true };
}

/**
 * Wire the mocks: `refFiles` maps referenceDir -> { filename: rawJsonText },
 * `uploads` maps upload filename -> stat (or null to make stat throw).
 */
function setup({ refFiles = {}, uploads = {} }) {
    fs.readdir.mockImplementation(async (dir) => {
        if (dir === 'public/uploads') return Object.keys(uploads);
        if (refFiles[dir]) return Object.keys(refFiles[dir]);
        return [];
    });
    fs.readFile.mockImplementation(async (filePath) => {
        for (const dir of Object.keys(refFiles)) {
            for (const name of Object.keys(refFiles[dir])) {
                if (filePath === `${dir}/${name}`) {
                    const val = refFiles[dir][name];
                    if (val instanceof Error) throw val;
                    return val;
                }
            }
        }
        throw new Error(`unexpected readFile ${filePath}`);
    });
    fs.stat.mockImplementation(async (filePath) => {
        const name = filePath.replace('public/uploads/', '');
        const st = uploads[name];
        if (!st) throw new Error(`ENOENT ${filePath}`);
        return st;
    });
    fs.unlink.mockResolvedValue();
}

describe('UploadGCService.sweep', () => {
    let dateSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        dateSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
        dateSpy.mockRestore();
    });

    test('keeps referenced files even when old', async () => {
        setup({
            refFiles: {
                quizzes: { 'q1.json': JSON.stringify({ questions: [{ image: '/uploads/keep.png' }] }) },
                results: {}
            },
            uploads: { 'keep.png': fileStat(100, OLD_MTIME) }
        });

        const svc = new UploadGCService(mockLogger);
        const summary = await svc.sweep();

        expect(fs.unlink).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ referencedCount: 1, deleted: 0, bytesFreed: 0 });
    });

    test('deletes unreferenced files older than the grace age', async () => {
        setup({
            refFiles: { quizzes: {}, results: {} },
            uploads: { 'orphan.png': fileStat(500, OLD_MTIME) }
        });

        const svc = new UploadGCService(mockLogger);
        const summary = await svc.sweep();

        expect(fs.unlink).toHaveBeenCalledWith('public/uploads/orphan.png');
        expect(summary).toMatchObject({ deleted: 1, bytesFreed: 500, keptYoung: 0 });
    });

    test('keeps unreferenced files that are younger than the grace age', async () => {
        setup({
            refFiles: { quizzes: {}, results: {} },
            uploads: { 'fresh.png': fileStat(500, YOUNG_MTIME) }
        });

        const svc = new UploadGCService(mockLogger);
        const summary = await svc.sweep();

        expect(fs.unlink).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ deleted: 0, keptYoung: 1 });
    });

    test('references saved inside result files are honored', async () => {
        setup({
            refFiles: {
                quizzes: {},
                results: { 'results_123456_1.json': JSON.stringify({ questions: [{ image: '/uploads/inresult.png' }] }) }
            },
            uploads: { 'inresult.png': fileStat(300, OLD_MTIME) }
        });

        const svc = new UploadGCService(mockLogger);
        await svc.sweep();

        expect(fs.unlink).not.toHaveBeenCalled();
    });

    test('malformed / unreadable quiz JSON is skipped without crashing; other orphans still collected', async () => {
        setup({
            refFiles: {
                quizzes: {
                    'good.json': JSON.stringify({ questions: [{ image: '/uploads/keep.png' }] }),
                    'bad.json': new Error('EACCES: permission denied')
                },
                results: {}
            },
            uploads: {
                'keep.png': fileStat(100, OLD_MTIME),
                'orphan.png': fileStat(200, OLD_MTIME)
            }
        });

        const svc = new UploadGCService(mockLogger);
        const summary = await svc.sweep();

        // keep.png referenced by the good file -> kept; orphan.png -> deleted.
        expect(fs.unlink).toHaveBeenCalledTimes(1);
        expect(fs.unlink).toHaveBeenCalledWith('public/uploads/orphan.png');
        expect(summary.deleted).toBe(1);
    });

    test('dry-run reports would-be deletions but deletes nothing', async () => {
        setup({
            refFiles: { quizzes: {}, results: {} },
            uploads: { 'orphan.png': fileStat(700, OLD_MTIME) }
        });

        const svc = new UploadGCService(mockLogger);
        const summary = await svc.sweep({ dryRun: true });

        expect(fs.unlink).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ deleted: 1, bytesFreed: 700, dryRun: true });
    });

    test('missing uploads dir is handled gracefully', async () => {
        fs.readdir.mockImplementation(async (dir) => {
            if (dir === 'public/uploads') throw new Error('ENOENT');
            return [];
        });

        const svc = new UploadGCService(mockLogger);
        const summary = await svc.sweep();

        expect(summary).toMatchObject({ deleted: 0, bytesFreed: 0 });
        expect(mockLogger.warn).toHaveBeenCalled();
    });
});
