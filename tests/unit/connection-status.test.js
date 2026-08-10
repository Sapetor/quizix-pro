/**
 * @jest-environment jsdom
 *
 * Tests for the header connection badge (public/js/utils/connection-status.js).
 *
 * Regression context: during live localhost games the badge flipped to
 * "Offline" (and showed 3000ms+ latency) while the socket was demonstrably
 * delivering answers. Three defects caused it:
 *   1. a single failed/aborted HTTP probe set isOnline = false;
 *   2. the socket's own connected state was ignored by the probe path;
 *   3. the fallback probe reused the primary probe's start time, so its
 *      latency reading included the primary's full 5s timeout.
 * These tests pin the fixed behaviour.
 */

import { ConnectionStatus } from '../../public/js/utils/connection-status.js';

/** Minimal socket.io stub: records handlers so tests can fire them. */
function makeSocket(connected = true) {
    const handlers = {};
    return {
        connected,
        on: (event, fn) => { handlers[event] = fn; },
        fire: (event) => handlers[event] && handlers[event]()
    };
}

/**
 * The constructor fires one probe and starts a 30s interval. Stop the interval
 * and let that first probe settle, then reset to a clean baseline so each test
 * counts only its own probes.
 */
async function makeStatus() {
    const status = new ConnectionStatus();
    status.stopMonitoring();
    await new Promise(resolve => setTimeout(resolve, 0));
    status.consecutiveFailures = 0;
    status.isOnline = true;
    status.connectionQuality = 'unknown';
    status.lastPingTime = null;
    return status;
}

describe('ConnectionStatus probe failures', () => {
    afterEach(() => {
        delete global.fetch;
        jest.restoreAllMocks();
    });

    test('a single failed probe does not report Offline', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('aborted'));
        const status = await makeStatus();
        status.isOnline = true;

        await status.checkConnection();

        expect(status.isOnline).toBe(true);
        expect(status.consecutiveFailures).toBe(1);
    });

    test('two consecutive failed probes report Offline when no socket is attached', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('aborted'));
        const status = await makeStatus();

        await status.checkConnection();
        await status.checkConnection();

        expect(status.isOnline).toBe(false);
        expect(status.connectionQuality).toBe('offline');
        expect(status.lastPingTime).toBeNull();
    });

    test('repeated probe failures never report Offline while the socket is connected', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('aborted'));
        const status = await makeStatus();
        status.setSocket(makeSocket(true));

        await status.checkConnection();
        await status.checkConnection();
        await status.checkConnection();

        expect(status.isOnline).toBe(true);
        expect(status.lastPingTime).toBeNull(); // no bogus latency displayed
    });

    test('a successful probe clears the failure counter', async () => {
        const status = await makeStatus();
        global.fetch = jest.fn().mockRejectedValue(new Error('aborted'));
        await status.checkConnection();
        expect(status.consecutiveFailures).toBe(1);

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            arrayBuffer: async () => new ArrayBuffer(0)
        });
        await status.checkConnection();

        expect(status.consecutiveFailures).toBe(0);
        expect(status.isOnline).toBe(true);
    });
});

describe('ConnectionStatus socket authority', () => {
    afterEach(() => { delete global.fetch; });

    test('socket disconnect reports Offline immediately', async () => {
        const status = await makeStatus();
        const socket = makeSocket(true);
        status.setSocket(socket);

        socket.fire('disconnect');

        expect(status.isOnline).toBe(false);
        expect(status.connectionQuality).toBe('offline');
    });

    test('socket connect restores Online and clears failures', async () => {
        const status = await makeStatus();
        const socket = makeSocket(false);
        status.setSocket(socket);
        status.consecutiveFailures = 5;

        socket.fire('connect');

        expect(status.isOnline).toBe(true);
        expect(status.consecutiveFailures).toBe(0);
    });

    test("browser 'offline' event is ignored while the socket is connected", async () => {
        const status = await makeStatus();
        status.setSocket(makeSocket(true));
        status.isOnline = true;

        status.handleNetworkChange(false);

        expect(status.isOnline).toBe(true);
    });
});

describe('ConnectionStatus latency measurement', () => {
    // jsdom does not implement resource timing, so install a stub.
    let entries = [];
    beforeEach(() => { performance.getEntriesByName = () => entries; });
    afterEach(() => {
        delete global.fetch;
        delete performance.getEntriesByName;
        entries = [];
    });

    test('fallback latency excludes the failed primary attempt', async () => {
        const status = await makeStatus();
        let now = 1000;
        jest.spyOn(Date, 'now').mockImplementation(() => now);

        global.fetch = jest.fn()
            .mockImplementationOnce(async () => { now += 5000; throw new Error('timeout'); })
            .mockImplementationOnce(async () => { now += 12; return { ok: true, status: 200 }; });

        await status.checkConnection();

        // Pre-fix this was 5012ms — the primary's 5s timeout charged to the ping.
        expect(status.lastPingTime).toBe(12);
        expect(status.connectionQuality).toBe('excellent');
        Date.now.mockRestore();
    });

    test('network timing is preferred over the main-thread-blocked wall clock', async () => {
        const status = await makeStatus();
        entries = [{ duration: 7.4 }];

        // 3200ms wall clock (blocked main thread) must not be reported as latency.
        expect(status.measureNetworkTime('api/ping', 3200)).toBe(7);
    });

    test('falls back to wall clock when resource timing is unavailable', async () => {
        const status = await makeStatus();
        entries = [];

        expect(status.measureNetworkTime('api/ping', 42)).toBe(42);
    });
});
