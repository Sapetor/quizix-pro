const { MetadataService } = require('../../services/metadata-service');
const { PlayerManagementService } = require('../../services/player-management-service');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const logger = { info() {}, debug() {}, warn() {}, error() {} };

test('a disclosed session ID cannot transfer host authority', () => {
    const service = new PlayerManagementService(logger, {});
    const original = service.createOrGetSession('host');
    const attacker = service.createOrGetSession('player', original.hostSessionId);
    expect(original.hostSocketId).toBe('host');
    expect(attacker).not.toBe(original);
    expect(service.createOrGetSession('returning-host', original.hostSessionId, original.hostSessionToken)).toBe(original);
});

test('deleting a folder removes private files rather than exposing them', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'quizix-security-'));
    try {
        const service = new MetadataService(logger, {}, dir);
        service.saveMetadata = async () => {};
        service.metadata = { folders: { f: { id: 'f', parentId: null } }, quizzes: {
            'secret.json': { folderId: 'f', ownerId: 'owner', visibility: 'private' }
        } };
        await fs.writeFile(path.join(dir, 'secret.json'), JSON.stringify({ questions: ['secret'] }));
        await service.deleteFolder('f', true, 'owner');
        await expect(fs.access(path.join(dir, 'secret.json'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(service.getQuizMetadata('secret.json')).toBeNull();
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('a failed file deletion preserves privacy metadata', async () => {
    const service = new MetadataService(logger, {}, 'unused');
    service.saveMetadata = async () => {};
    service.metadata = { folders: { f: { id: 'f', parentId: null } }, quizzes: {
        'secret.json': { folderId: 'f', ownerId: 'owner', visibility: 'private' }
    } };
    const unlink = jest.spyOn(fs, 'unlink').mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    try {
        await expect(service.deleteFolder('f', true, 'owner')).rejects.toThrow('denied');
        expect(service.isQuizVisibleToUser('secret.json', null)).toBe(false);
        expect(service.getFolder('f')).toBeDefined();
    } finally { unlink.mockRestore(); }
});

test('deleting a folder detaches quizzes owned by someone else instead of destroying them', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'quizix-security-'));
    try {
        const service = new MetadataService(logger, {}, dir);
        service.saveMetadata = async () => {};
        service.metadata = {
            folders: { top: { id: 'top', parentId: null }, f: { id: 'f', parentId: 'top', ownerId: 'owner' }, sub: { id: 'sub', parentId: 'f' } },
            quizzes: {
                'mine.json': { folderId: 'f', ownerId: 'owner' },
                'theirs.json': { folderId: 'f', ownerId: 'other' },
                'nested-theirs.json': { folderId: 'sub', ownerId: 'other' }
            }
        };
        for (const name of ['mine.json', 'theirs.json', 'nested-theirs.json']) {
            await fs.writeFile(path.join(dir, name), '{}');
        }
        await service.deleteFolder('f', true, 'owner');
        await expect(fs.access(path.join(dir, 'mine.json'))).rejects.toMatchObject({ code: 'ENOENT' });
        await fs.access(path.join(dir, 'theirs.json'));
        await fs.access(path.join(dir, 'nested-theirs.json'));
        expect(service.getQuizMetadata('theirs.json').folderId).toBe('top');
        expect(service.getQuizMetadata('nested-theirs.json').folderId).toBe('top');
        expect(service.getFolder('f')).toBeUndefined();
        expect(service.getFolder('sub')).toBeUndefined();
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('a quiz inside a password-protected folder unlocks with the folder password', async () => {
    const service = new MetadataService(logger, {}, 'unused');
    service.saveMetadata = async () => {};
    service.metadata = {
        folders: {
            top: { id: 'top', parentId: null, passwordHash: await service.hashPassword('folder-pw') },
            sub: { id: 'sub', parentId: 'top' }
        },
        quizzes: { 'inner.json': { folderId: 'sub', ownerId: 'owner' } }
    };
    expect(service.requiresAuth('inner.json', 'quiz', 'owner')).toBe(true);
    await expect(service.unlock('inner.json', 'quiz', 'wrong', '10.0.0.1')).rejects.toThrow('Incorrect password');
    const { token } = await service.unlock('inner.json', 'quiz', 'folder-pw', '10.0.0.1');
    expect(service.verifyToken(token, 'inner.json', 'quiz')).toBe(true);
    expect(service.verifyToken(token, 'top', 'folder')).toBe(false);
});
