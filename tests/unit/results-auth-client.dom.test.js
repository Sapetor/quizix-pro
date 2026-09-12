/**
 * @jest-environment jsdom
 *
 * Client half of results access control: the host token store that lets a host
 * open its own past results after the tab (and the in-memory socket state) is
 * gone. Storage is localStorage, keyed by game PIN, so several past games each
 * keep their own token.
 */

import {
    rememberHostToken,
    captureLiveHostToken,
    hostTokenForFilename,
    hostTokenHeaders,
    isAccessDenied
} from '../../public/js/services/results-manager-service.js';

const TOKEN_A = '11111111-2222-3333-4444-555555555555';
const TOKEN_B = '99999999-8888-7777-6666-555555555555';

beforeEach(() => {
    localStorage.clear();
    delete window.game;
});

test('a stored token is matched to a results file by its PIN', () => {
    rememberHostToken('123456', TOKEN_A);

    expect(hostTokenForFilename('results_123456_1704067200000.json')).toBe(TOKEN_A);
    expect(hostTokenForFilename('results_999999_1704067200000.json')).toBeNull();
    expect(hostTokenHeaders('results_123456_1704067200000.json')).toEqual({ 'X-Host-Token': TOKEN_A });
});

test('the listing header carries every token this browser holds', () => {
    rememberHostToken('111111', TOKEN_A);
    rememberHostToken('222222', TOKEN_B);

    const sent = hostTokenHeaders()['X-Host-Token'].split(',');
    expect(sent.sort()).toEqual([TOKEN_A, TOKEN_B].sort());
});

test('no token stored means no credential header, and the request is not blocked here', () => {
    expect(hostTokenHeaders()).toEqual({});
    expect(hostTokenHeaders('results_123456_1704067200000.json')).toEqual({});
});

test('the live game token is captured from the socket layer and outlives it', () => {
    window.game = {
        socketManager: { _hostToken: TOKEN_A },
        gameManager: { stateManager: { getGameState: () => ({ gamePin: '123456', isHost: true }) } }
    };

    captureLiveHostToken();
    delete window.game; // tab closed: only storage is left

    expect(hostTokenForFilename('results_123456_1704067200000.json')).toBe(TOKEN_A);
});

test('a player device (no host token) stores nothing', () => {
    window.game = {
        socketManager: {},
        gameManager: { stateManager: { getGameState: () => ({ gamePin: '123456', isHost: false }) } }
    };

    captureLiveHostToken();

    expect(hostTokenHeaders()).toEqual({});
});

test('401 and 403 are reported as access denied, other failures are not', () => {
    expect(isAccessDenied({ status: 401 })).toBe(true);
    expect(isAccessDenied({ status: 403 })).toBe(true);
    expect(isAccessDenied({ status: 500 })).toBe(false);
    expect(isAccessDenied(undefined)).toBe(false);
});
