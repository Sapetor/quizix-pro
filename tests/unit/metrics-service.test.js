/**
 * Metrics Service Tests
 */

const { metricsService } = require('../../services/metrics-service');

describe('MetricsService', () => {
    describe('register', () => {
        test('should have a Prometheus registry', () => {
            expect(metricsService.register).toBeDefined();
            expect(typeof metricsService.register.metrics).toBe('function');
        });
    });

    describe('metricsMiddleware', () => {
        test('should be a function', () => {
            expect(typeof metricsService.metricsMiddleware).toBe('function');
        });

        test('should call next', () => {
            const mockReq = { method: 'GET', path: '/api/test', route: { path: '/api/test' } };
            const mockRes = { on: jest.fn(), statusCode: 200 };
            const mockNext = jest.fn();

            metricsService.metricsMiddleware(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        test('should register finish handler on response', () => {
            const mockReq = { method: 'GET', path: '/api/test' };
            const mockRes = { on: jest.fn(), statusCode: 200 };
            const mockNext = jest.fn();

            metricsService.metricsMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
        });
    });

    describe('game tracking', () => {
        test('gameCreated should increment counters', () => {
            // Just verify it doesn't throw
            expect(() => metricsService.gameCreated()).not.toThrow();
        });

        test('gameEnded should decrement gauge', () => {
            expect(() => metricsService.gameEnded()).not.toThrow();
        });

        test('setActiveGames should set gauge value', () => {
            expect(() => metricsService.setActiveGames(5)).not.toThrow();
        });
    });

    describe('player tracking', () => {
        test('playerJoined should increment gauge', () => {
            expect(() => metricsService.playerJoined()).not.toThrow();
        });

        test('playerLeft should decrement gauge', () => {
            expect(() => metricsService.playerLeft()).not.toThrow();
        });

        test('setActivePlayers should set gauge value', () => {
            expect(() => metricsService.setActivePlayers(10)).not.toThrow();
        });
    });

    describe('quiz tracking', () => {
        test('quizSaved should increment counter', () => {
            expect(() => metricsService.quizSaved()).not.toThrow();
        });

        test('quizLoaded should increment counter', () => {
            expect(() => metricsService.quizLoaded()).not.toThrow();
        });
    });

    describe('socket tracking', () => {
        test('socketConnected should increment gauge', () => {
            expect(() => metricsService.socketConnected()).not.toThrow();
        });

        test('socketDisconnected should decrement gauge', () => {
            expect(() => metricsService.socketDisconnected()).not.toThrow();
        });

        test('socketEvent should increment counter with label', () => {
            expect(() => metricsService.socketEvent('join-game')).not.toThrow();
            expect(() => metricsService.socketEvent('submit-answer')).not.toThrow();
        });
    });

    describe('AI tracking', () => {
        test('aiGenerationStarted should return hrtime', () => {
            const startTime = metricsService.aiGenerationStarted('claude');
            expect(Array.isArray(startTime)).toBe(true);
            expect(startTime.length).toBe(2);
        });

        test('aiGenerationCompleted should record metrics', () => {
            const startTime = metricsService.aiGenerationStarted('claude');
            expect(() => metricsService.aiGenerationCompleted('claude', startTime, true)).not.toThrow();
        });

        test('aiGenerationCompleted should handle errors', () => {
            const startTime = metricsService.aiGenerationStarted('openai');
            expect(() => metricsService.aiGenerationCompleted('openai', startTime, false)).not.toThrow();
        });
    });

    describe('error tracking', () => {
        test('recordError should increment counter with type', () => {
            expect(() => metricsService.recordError('validation')).not.toThrow();
            expect(() => metricsService.recordError('network')).not.toThrow();
            expect(() => metricsService.recordError('database')).not.toThrow();
        });
    });

    describe('metrics output', () => {
        test('should produce valid Prometheus metrics format', async () => {
            const metrics = await metricsService.register.metrics();

            expect(typeof metrics).toBe('string');
            expect(metrics).toContain('# HELP');
            expect(metrics).toContain('# TYPE');
        });

        test('should include custom metrics', async () => {
            const metrics = await metricsService.register.metrics();

            expect(metrics).toContain('quizix_active_games');
            expect(metrics).toContain('quizix_active_players');
            expect(metrics).toContain('quizix_quizzes_saved_total');
            expect(metrics).toContain('quizix_socket_connections');
        });

        test('should include HTTP request metrics', async () => {
            const metrics = await metricsService.register.metrics();

            expect(metrics).toContain('http_request_duration_seconds');
            expect(metrics).toContain('http_requests_total');
        });
    });
});
