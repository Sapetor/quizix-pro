/**
 * MetadataService write-serialization (mutex) tests.
 *
 * saveMetadata() writes via atomic-write (shared `${path}.tmp` + rename). Two
 * overlapping saves must not run concurrently, or they collide on that temp
 * file and one rename loses. The in-process promise-chain mutex serializes them.
 */

const { MetadataService } = require('../../services/metadata-service');
const fs = require('fs').promises;

jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
        rename: jest.fn(),
        readFile: jest.fn(),
        mkdir: jest.fn(),
        access: jest.fn(),
        unlink: jest.fn(),
        stat: jest.fn()
    }
}));

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
// wslMonitor.trackFileOperation just runs the op through.
const mockWslMonitor = { trackFileOperation: (fn) => fn() };

describe('MetadataService write serialization', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        fs.rename.mockResolvedValue();
        service = new MetadataService(mockLogger, mockWslMonitor, 'quizzes');
        service.metadata = { folders: {}, quizzes: {} };
    });

    test('two overlapping saves never write the temp file concurrently', async () => {
        let active = 0;
        let maxActive = 0;
        // Make each write take a macrotask so a naive (unserialized) impl would
        // overlap the two saves.
        fs.writeFile.mockImplementation(() => {
            active++;
            maxActive = Math.max(maxActive, active);
            return new Promise((resolve) => setTimeout(() => {
                active--;
                resolve();
            }, 5));
        });

        await Promise.all([service.saveMetadata(), service.saveMetadata()]);

        expect(fs.writeFile).toHaveBeenCalledTimes(2);
        expect(maxActive).toBe(1); // serialized, never concurrent
    });

    test('both overlapping saves land; the last write reflects both mutations', async () => {
        const bodies = [];
        fs.writeFile.mockImplementation((_path, body) => {
            bodies.push(body);
            return new Promise((resolve) => setTimeout(resolve, 5));
        });

        // Op A mutates then saves; op B mutates then saves, overlapping.
        service.metadata.quizzes.a = { title: 'A' };
        const saveA = service.saveMetadata();
        service.metadata.quizzes.b = { title: 'B' };
        const saveB = service.saveMetadata();

        await Promise.all([saveA, saveB]);

        // The final persisted body contains both updates (no lost update).
        const last = JSON.parse(bodies[bodies.length - 1]);
        expect(last.quizzes.a).toEqual({ title: 'A' });
        expect(last.quizzes.b).toEqual({ title: 'B' });
    });

    test('a failed write does not poison the chain for later saves', async () => {
        fs.writeFile
            .mockRejectedValueOnce(new Error('disk full'))
            .mockResolvedValue();

        await expect(service.saveMetadata()).rejects.toThrow('disk full');
        // Subsequent save still runs.
        await expect(service.saveMetadata()).resolves.toBeUndefined();
        expect(fs.writeFile).toHaveBeenCalledTimes(2);
    });
});
