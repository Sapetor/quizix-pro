/**
 * atomicWriteFile temp-file isolation.
 *
 * A fixed `${finalPath}.tmp` means two concurrent writes to the same target
 * share one temp file: both write into it and both rename it, so the second
 * rename can promote a body that is a mix of the two writes. The temp name must
 * be unique per call, and a failed call must not leave the temp file behind.
 */

const fs = require('fs').promises;

jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
        rename: jest.fn(),
        unlink: jest.fn()
    }
}));

const { atomicWriteFile } = require('../../services/atomic-write');

describe('atomicWriteFile temp file isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        fs.writeFile.mockResolvedValue();
        fs.rename.mockResolvedValue();
        fs.unlink.mockResolvedValue();
    });

    test('two writes to the same target use distinct temp paths', async () => {
        await atomicWriteFile('/data/store.json', 'a');
        await atomicWriteFile('/data/store.json', 'b');

        const [first] = fs.writeFile.mock.calls[0];
        const [second] = fs.writeFile.mock.calls[1];

        expect(first).not.toBe(second);
        expect(first).toMatch(/^\/data\/store\.json\..+\.tmp$/);
        expect(second).toMatch(/^\/data\/store\.json\..+\.tmp$/);
    });

    test('each write renames its own temp file onto the destination', async () => {
        await atomicWriteFile('/data/store.json', 'a');

        const [written] = fs.writeFile.mock.calls[0];
        expect(fs.rename).toHaveBeenCalledWith(written, '/data/store.json');
    });

    test('removes the temp file when the rename fails', async () => {
        fs.rename.mockRejectedValue(new Error('EXDEV'));

        await expect(atomicWriteFile('/data/store.json', 'a')).rejects.toThrow('EXDEV');

        const [written] = fs.writeFile.mock.calls[0];
        expect(fs.unlink).toHaveBeenCalledWith(written);
    });

    test('removes the temp file when the write fails', async () => {
        fs.writeFile.mockRejectedValue(new Error('ENOSPC'));

        await expect(atomicWriteFile('/data/store.json', 'a')).rejects.toThrow('ENOSPC');

        expect(fs.unlink).toHaveBeenCalledTimes(1);
        expect(fs.rename).not.toHaveBeenCalled();
    });

    test('an unlink failure does not mask the original error', async () => {
        fs.rename.mockRejectedValue(new Error('EXDEV'));
        fs.unlink.mockRejectedValue(new Error('ENOENT'));

        await expect(atomicWriteFile('/data/store.json', 'a')).rejects.toThrow('EXDEV');
    });
});
