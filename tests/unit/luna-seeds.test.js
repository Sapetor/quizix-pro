/**
 * tools/luna-e2e/seeds.py: the results-analytics flow must be seeded without
 * POST /api/save-results, which refuses a request with no session and no
 * host token. The seed writes the results file directly; this test runs it
 * with a fake app whose HTTP helper raises, then reads the file back through
 * the real ResultsService.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ResultsService } = require('../../services/results-service');

const SEEDS_DIR = path.resolve(__dirname, '../../tools/luna-e2e');

const SCRIPT = `
import sys
sys.path.insert(0, sys.argv[1])
import seeds

class FakeApp:
    tmpdir = sys.argv[2]
    def save_results(self, payload):
        raise RuntimeError("HTTP Error 401: Unauthorized")
    def save_quiz(self, title, questions):
        raise RuntimeError("not used")

seeds.SEEDS["results-analytics"](FakeApp(), None, None)
`;

describe('luna-e2e results-analytics seed', () => {
    let tmpdir;

    beforeEach(() => {
        tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'luna-seed-'));
        fs.mkdirSync(path.join(tmpdir, 'results'));
    });

    afterEach(() => {
        fs.rmSync(tmpdir, { recursive: true, force: true });
    });

    test('writes an ownerless results file that a signed-in user can list and open', async () => {
        execFileSync('python3', ['-I', '-c', SCRIPT, SEEDS_DIR, tmpdir], { stdio: 'pipe', timeout: 30000 });

        const logger = { debug() {}, info() {}, warn() {}, error() {} };
        const service = new ResultsService(logger, path.join(tmpdir, 'results'));

        const listed = await service.listResults({ userId: 'lunatester-id' });
        expect(listed).toHaveLength(1);
        expect(service.validateFilename(listed[0].filename)).toBeTruthy();
        expect(listed[0].filename).toMatch(/^results_424242_\d+\.json$/);
        expect(listed[0].quizTitle).toBe('Seeded History Game');
        expect(listed[0].participantCount).toBe(2);

        const record = await service.getResult(listed[0].filename, { userId: 'lunatester-id' });
        expect(record.results.map(r => [r.name, r.score])).toEqual([['Alice', 1850], ['Bob', 900]]);
        expect(record.questions).toHaveLength(3);
        expect(typeof record.saved).toBe('string');
        expect(record.hostUserId).toBeUndefined();
        expect(record.hostTokenHash).toBeUndefined();
    });
});
