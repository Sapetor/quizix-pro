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
});
