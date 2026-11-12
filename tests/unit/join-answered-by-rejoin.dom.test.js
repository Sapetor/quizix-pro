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
});
