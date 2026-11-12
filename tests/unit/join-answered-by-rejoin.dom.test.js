/**
 * @jest-environment jsdom
 *
 * A join from the join screen can be answered with rejoin-success instead of
 * player-joined: the server resumes the entry of a player who left or was
 * dropped from the running game. The pending join and its retry timer have to
 * be cleared then too, or the retry resends player-join and the server's
 * "Already joined" error lands on the game screen as an alert.
 */

import { SocketManager } from '../../public/js/socket/socket-manager.js';
import { PowerUpManager } from '../../public/js/game/modules/power-up-manager.js';

function createFakeSocket() {
    return {
        connected: true,
        handlers: {},
        emits: [],
        on(event, handler) { this.handlers[event] = handler; },
        once() {},
        off() {},
        emit(event, data) { this.emits.push({ event, data }); },
        io: { on() {} }
    };
}

describe('join answered by rejoin-success', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        sessionStorage.clear();
    });

    test('clears the pending join, stores the new reconnect data and shows the game screen', () => {
        const socket = createFakeSocket();
        const gameManager = { setPlayerInfo: jest.fn(), setGamePin: jest.fn() };
        const uiManager = { showScreen: jest.fn() };
        const sm = new SocketManager(socket, gameManager, uiManager, null);

        sm.joinGame('123456', 'Al');
        expect(socket.emits.filter(e => e.event === 'player-join')).toHaveLength(1);

        socket.handlers['rejoin-success']({
            playerName: 'Al', score: 120, currentQuestion: 0,
            gameStatus: 'question', sessionToken: 'tok-new', gamePin: '123456'
        });

        expect(sm._pendingJoin).toBeNull();
        jest.advanceTimersByTime(20000);
        expect(socket.emits.filter(e => e.event === 'player-join')).toHaveLength(1);

        expect(JSON.parse(sessionStorage.getItem('quizix_reconnect'))).toMatchObject({
            pin: '123456', playerName: 'Al', sessionToken: 'tok-new'
        });
        expect(uiManager.showScreen).toHaveBeenLastCalledWith('player-game-screen');
    });

    // game-started (sent first on a resume) shows every power-up as available;
    // rejoin-success carries the server's state for this player.
    test('applies the power-up state carried by rejoin-success', () => {
        document.body.innerHTML = `
            <div id="power-ups-container" class="hidden">
                <button data-power-up="fifty-fifty"></button>
                <button data-power-up="extend-time"></button>
                <button data-power-up="double-points"></button>
            </div>`;
        const socket = createFakeSocket();
        const powerUpManager = new PowerUpManager();
        powerUpManager.setSocket(socket);
        const gameManager = { setPlayerInfo: jest.fn(), setGamePin: jest.fn(), getPowerUpManager: () => powerUpManager };
        const sm = new SocketManager(socket, gameManager, { showScreen: jest.fn() }, null);

        powerUpManager.initialize(true); // what game-started does
        socket.handlers['rejoin-success']({
            playerName: 'Al', score: 0, currentQuestion: 0, gameStatus: 'question', sessionToken: 't', gamePin: '123456',
            powerUps: {
                'fifty-fifty': { available: true, used: false },
                'extend-time': { available: false, used: true },
                'double-points': { available: false, used: true, active: true }
            }
        });
        void sm;

        const button = (type) => document.querySelector(`[data-power-up="${type}"]`);
        expect(button('extend-time').disabled).toBe(true);
        expect(button('extend-time').classList.contains('used')).toBe(true);
        expect(button('double-points').classList.contains('active')).toBe(true);
        expect(powerUpManager.isDoublePointsActive()).toBe(true);
        expect(button('fifty-fifty').classList.contains('used')).toBe(false);

        expect(powerUpManager.usePowerUp('extend-time')).toBe(false);
        expect(socket.emits.filter(e => e.event === 'use-power-up')).toHaveLength(0);
    });
});
