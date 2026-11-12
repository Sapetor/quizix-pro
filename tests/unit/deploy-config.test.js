// Static consistency checks between deployment files and the code or
// manifests they refer to. Nothing here runs docker, kubectl or a script.
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('deployment config consistency', () => {
    // services/manim-render-service.js passes MANIM_RENDER_TIMEOUT to the
    // render timer in milliseconds, so a value such as 120 means 0.12 s.
    test.each(['.env.docker', '.env.example'])('%s gives MANIM_RENDER_TIMEOUT in milliseconds', (file) => {
        const match = read(file).match(/^#?\s*MANIM_RENDER_TIMEOUT=(\d+)\s*$/m);
        expect(match).not.toBeNull();
        expect(parseInt(match[1], 10)).toBeGreaterThanOrEqual(1000);
    });

    // k8s/cleanup.sh --delete-data skips any PVC name kubectl does not find,
    // so a name that differs from the manifest deletes nothing.
    test('k8s/cleanup.sh deletes the PVC names the manifest declares', () => {
        const manifestNames = [...read('k8s/01-quizix-pro.yaml')
            .matchAll(/^kind: PersistentVolumeClaim\nmetadata:\n {2}name: (\S+)$/gm)]
            .map((m) => m[1]);
        expect(manifestNames).toHaveLength(3);

        const loop = read('k8s/cleanup.sh').match(/^\s*for pvc in (.+); do$/m);
        expect(loop).not.toBeNull();
        expect(loop[1].split(/\s+/).sort()).toEqual([...manifestNames].sort());
    });

    // The server injects the live cache version into /sw.js at start, so the
    // only version literal in the file is the BUILD_STAMP fallback.
    test('prepare-prod.sh greps public/sw.js for a line that exists', () => {
        const grep = read('prepare-prod.sh').match(/grep -o "([^"]+)" public\/sw\.js/);
        expect(grep).not.toBeNull();
        expect(read('public/sw.js')).toMatch(new RegExp(grep[1]));
    });
});
