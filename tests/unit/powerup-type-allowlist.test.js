/**
 * Power-up type allowlist — prototype pollution regression.
 *
 * `use-power-up` carries a client-controlled `type` string that was used
 * directly as a property key on `player.powerUps`. With "__proto__" the lookup
 * returned Object.prototype, the `.used` guard passed (undefined), and the
 * handler then wrote `used`/`available` onto Object.prototype, polluting every
 * object in the process.
 *
 * Covers both layers of the fix: the allowlist inside Game.usePowerUp (the
 * actual guard) and the schema wired through validateAndHandle (the consistent
 * path that stops the payload at the socket boundary).
 */

const { Game } = require('../../services/game');
const { validateSocketEvent } = require('../../services/validation-schemas');
const { registerGameplayEvents } = require('../../socket/gameplay-events');
const { createFakeSocket, createFakeIo, createOptions } = require('./helpers/socket-fakes');

const CONFIG = {
    SCORING: {
        BASE_POINTS: 100,
        MAX_BONUS_TIME: 10000,
        TIME_BONUS_DIVISOR: 10,
        DIFFICULTY_MULTIPLIERS: { easy: 1, medium: 2, hard: 3 },
        DEFAULT_TOLERANCE: 0.1
    },
    TIMING: { DEFAULT_QUESTION_TIME: 20 }
};

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeGame() {
    return new Game('host-1', {
        title: 'T',
        powerUpsEnabled: true,
        questions: [{ type: 'multiple-choice', question: 'q', options: ['A', 'B', 'C', 'D'], correctAnswer: 0 }]
    }, mockLogger, CONFIG, { MAX_PLAYERS_PER_GAME: 200 });
}

describe('Game.usePowerUp type allowlist', () => {
    afterEach(() => {
        // Undo any pollution so a failure here cannot cascade into other suites
        delete Object.prototype.used;
        delete Object.prototype.available;
    });

    it('rejects __proto__ without writing to Object.prototype', () => {
        const game = makeGame();
        game.addPlayer('p1', 'Al');

        const result = game.usePowerUp('p1', '__proto__');

        expect(result.success).toBe(false);
        expect(result.messageKey).toBe('error_unknown_powerup');
        expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'used')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'available')).toBe(false);
        expect({}.used).toBeUndefined();
    });

    it('rejects constructor and toString as power-up types', () => {
        const game = makeGame();
        game.addPlayer('p1', 'Al');

        expect(game.usePowerUp('p1', 'constructor').success).toBe(false);
        expect(game.usePowerUp('p1', 'toString').success).toBe(false);
    });

    it('still accepts the three real power-up types', () => {
        const game = makeGame();
        game.addPlayer('p1', 'Al');
        game.currentQuestion = 0;

        expect(game.usePowerUp('p1', 'extend-time').success).toBe(true);
        expect(game.usePowerUp('p1', 'double-points').success).toBe(true);
        expect(game.usePowerUp('p1', 'fifty-fifty').success).toBe(true);
    });
});

describe('use-power-up socket schema', () => {
    it('rejects an unknown type at the validation boundary', () => {
        expect(validateSocketEvent('use-power-up', { type: '__proto__' }).valid).toBe(false);
        expect(validateSocketEvent('use-power-up', { type: 'rocket' }).valid).toBe(false);
        expect(validateSocketEvent('use-power-up', {}).valid).toBe(false);
    });

    it('accepts the three real power-up types', () => {
        for (const type of ['fifty-fifty', 'extend-time', 'double-points']) {
            expect(validateSocketEvent('use-power-up', { type }).valid).toBe(true);
        }
    });
});

describe('gameplay-events: use-power-up handler', () => {
    function setup() {
        const socket = createFakeSocket('player-sock');
        const io = createFakeIo();
        const options = createOptions();
        registerGameplayEvents(io, socket, options);
        return { socket, io, options, h: socket.handlers };
    }

    it('never reaches the game for a polluting type', () => {
        const { socket, options, h } = setup();
        const game = { pin: '123456', usePowerUp: jest.fn() };
        options.playerManagementService.getPlayer.mockReturnValue({ name: 'Al', gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue(game);

        h['use-power-up']({ type: '__proto__' });

        expect(game.usePowerUp).not.toHaveBeenCalled();
        expect(socket.emits.length).toBeGreaterThan(0);
    });

    it('forwards a valid type to the game', () => {
        const { options, h } = setup();
        const game = { pin: '123456', usePowerUp: jest.fn(() => ({ success: true, type: 'double-points' })) };
        options.playerManagementService.getPlayer.mockReturnValue({ name: 'Al', gamePin: '123456' });
        options.gameSessionService.getGame.mockReturnValue(game);

        h['use-power-up']({ type: 'double-points' });

        expect(game.usePowerUp).toHaveBeenCalledWith('player-sock', 'double-points');
    });
});
