/**
 * Manim render service — child process hygiene.
 *
 * Three properties, all only observable through the mocked child_process:
 *  1. The child gets an allowlisted environment, not the server's whole env
 *     (AI provider keys and the session secret must not reach user Python).
 *  2. The backup kill targets the child's process group, so the tools Manim
 *     spawns (ffmpeg, LaTeX) die with it. An already-dead group must not throw.
 *  3. A maxBuffer overflow is reported as an overflow, not as a timeout.
 */

jest.mock('child_process', () => ({ execFile: jest.fn() }));

const path = require('path');
// Imported explicitly: the test env's globals do not include setImmediate.
// Jest's fake timers leave it alone (see doNotFake below), so it stays the
// one way to yield to the event loop while timers are faked.
const { setImmediate: yieldToEventLoop } = require('timers');
const { execFile } = require('child_process');
const { ManimRenderService } = require('../../services/manim-render-service');

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

const VALID_CODE = [
    'from manim import *',
    '',
    'class Demo(Scene):',
    '    def construct(self):',
    '        self.add(Circle())'
].join('\n');

// Names grepped out of the repo: routes/ai-generation.js reads the two API
// keys, services/session-service.js reads the session secret.
const SECRET_VARS = ['CLAUDE_API_KEY', 'GEMINI_API_KEY', 'SESSION_SECRET'];

const CHILD_PID = 4242;

let service;
let capturedOptions;
let capturedCallback;
let proc;
let savedSecrets;

function makeProc() {
    return { pid: CHILD_PID, kill: jest.fn(), on: jest.fn() };
}

// Yield to the event loop until the mocked execFile has been reached. The fs
// promises in front of it (mkdtemp, writeFile) are real, so a fixed number of
// ticks would be a race.
async function flush() {
    for (let i = 0; i < 2000; i++) {
        if (capturedCallback) return;
        await new Promise(yieldToEventLoop);
    }
    throw new Error('execFile was never called');
}

beforeEach(() => {
    savedSecrets = {};
    for (const name of SECRET_VARS) {
        savedSecrets[name] = process.env[name];
        process.env[name] = `leaked-${name}`;
    }

    service = new ManimRenderService(silentLogger, { MANIM_ENABLED: true });
    capturedOptions = null;
    capturedCallback = null;
    proc = makeProc();

    execFile.mockImplementation((file, args, options, callback) => {
        capturedOptions = options;
        capturedCallback = callback;
        return proc;
    });
});

afterEach(() => {
    // The service cancels its backup kill timer on the child's 'close' event.
    // The mock never emits one, so fire it here or a 62s real timer leaks.
    const closeHandler = proc.on.mock.calls.find(([event]) => event === 'close');
    if (closeHandler) closeHandler[1]();

    for (const name of SECRET_VARS) {
        if (savedSecrets[name] === undefined) delete process.env[name];
        else process.env[name] = savedSecrets[name];
    }
    jest.useRealTimers();
});

describe('child environment allowlist', () => {
    test('render child env carries none of the server secrets', async () => {
        const settled = service.renderAnimation(VALID_CODE).catch(err => err);
        await flush();

        expect(execFile).toHaveBeenCalledTimes(1);
        const env = capturedOptions.env;

        for (const name of SECRET_VARS) {
            expect(env).not.toHaveProperty(name);
        }
        const leaked = Object.entries(env)
            .filter(([, value]) => String(value).includes('leaked-'))
            .map(([key]) => key);
        expect(leaked).toEqual([]);

        capturedCallback(new Error('stop the render'), '', '');
        await settled;
    });

    test('render child env still carries what the venv needs', async () => {
        const settled = service.renderAnimation(VALID_CODE).catch(err => err);
        await flush();

        const env = capturedOptions.env;
        expect(env.VIRTUAL_ENV).toBe(service.venvPath);
        expect(env.PATH).toContain(path.join(service.venvPath, 'bin'));
        expect(env).toHaveProperty('PYTHONPATH');
        expect(env.HOME).toBe(process.env.HOME);

        capturedCallback(new Error('stop the render'), '', '');
        await settled;
    });

    test('version check child env carries no server secrets', async () => {
        service._findSitePackages = () => '/fake/site-packages';

        const settled = service.checkAvailability();
        await flush();

        expect(execFile).toHaveBeenCalledTimes(1);
        const env = capturedOptions.env;
        for (const name of SECRET_VARS) {
            expect(env).not.toHaveProperty(name);
        }

        capturedCallback(new Error('no manim'), '', '');
        await settled;
    });
});

describe('process group kill', () => {
    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    });

    test('the child is spawned detached, with stdio still piped', async () => {
        const settled = service.renderAnimation(VALID_CODE).catch(err => err);
        await flush();

        expect(capturedOptions.detached).toBe(true);
        expect(capturedOptions).not.toHaveProperty('stdio');

        capturedCallback(new Error('stop the render'), '', '');
        await settled;
    });

    test('the backup kill signals the whole process group', async () => {
        const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

        const settled = service.renderAnimation(VALID_CODE).catch(err => err);
        await flush();

        jest.advanceTimersByTime(service.renderTimeout + 2001);

        expect(killSpy).toHaveBeenCalledWith(-CHILD_PID, 'SIGKILL');
        expect(proc.kill).not.toHaveBeenCalled();

        capturedCallback(Object.assign(new Error('killed'), { killed: true }), '', '');
        const err = await settled;
        expect(err.messageKey).toBe('error_manim_timeout');
        killSpy.mockRestore();
    });

    test('an already-exited process group does not throw', async () => {
        const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
            const err = new Error('kill ESRCH');
            err.code = 'ESRCH';
            throw err;
        });

        const settled = service.renderAnimation(VALID_CODE).catch(err => err);
        await flush();

        expect(() => jest.advanceTimersByTime(service.renderTimeout + 2001)).not.toThrow();
        expect(proc.kill).not.toHaveBeenCalled();

        capturedCallback(new Error('stop the render'), '', '');
        await settled;
        killSpy.mockRestore();
    });

    test('the successful path clears the backup kill', async () => {
        const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

        const settled = service.renderAnimation(VALID_CODE).catch(err => err);
        await flush();

        // execFile's consumer registers a close handler that cancels the timer.
        const closeHandler = proc.on.mock.calls.find(([event]) => event === 'close');
        expect(closeHandler).toBeDefined();
        closeHandler[1]();

        capturedCallback(null, 'rendered', '');
        await settled;

        jest.advanceTimersByTime(service.renderTimeout + 5000);
        expect(killSpy).not.toHaveBeenCalled();
        killSpy.mockRestore();
    });
});

describe('output buffer overflow', () => {
    test('maxBuffer is set well above the 1 MiB default', async () => {
        const settled = service.renderAnimation(VALID_CODE).catch(err => err);
        await flush();

        expect(capturedOptions.maxBuffer).toBeGreaterThan(1024 * 1024);

        capturedCallback(new Error('stop the render'), '', '');
        await settled;
    });

    test('an overflow is reported as an overflow, not as a timeout', async () => {
        const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

        const settled = service.renderAnimation(VALID_CODE).catch(err => err);
        await flush();

        // Measured on node v22.16.0: overflow leaves err.killed undefined and
        // sets err.code to ERR_CHILD_PROCESS_STDIO_MAXBUFFER.
        const overflow = new Error('stdout maxBuffer length exceeded');
        overflow.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
        capturedCallback(overflow, 'x'.repeat(16), '');

        const err = await settled;
        expect(err.message).toMatch(/output/i);
        expect(err.message).toMatch(/exceed/i);
        expect(err.message).not.toMatch(/tim(e|ed)\s*-?\s*out|timeout/i);
        expect(err.messageKey).not.toBe('error_manim_timeout');
        // Descendants must not outlive the aborted render either.
        expect(killSpy).toHaveBeenCalledWith(-CHILD_PID, 'SIGKILL');
        killSpy.mockRestore();
    });
});
