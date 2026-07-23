/**
 * callProvider() helper tests.
 *
 * The helper is pure transport: on 2xx it parses JSON and returns
 * { ok: true, data }; on non-2xx it reads the body text and returns
 * { ok: false, status, errorText } so routes can map status -> message.
 * Network/parse errors propagate (routes turn them into 500s).
 */

const { callProvider } = require('../../routes/ai-generation');

describe('callProvider', () => {
    afterEach(() => {
        delete global.fetch;
    });

    test('returns { ok: true, data } on a 2xx response', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ content: [{ text: 'hi' }] }),
            text: async () => { throw new Error('text() should not be called on success'); }
        });

        const result = await callProvider({
            url: 'https://api.example.com/v1/messages',
            headers: { 'x-api-key': 'k' },
            body: { model: 'm' }
        });

        expect(result).toEqual({ ok: true, data: { content: [{ text: 'hi' }] } });
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.example.com/v1/messages',
            {
                method: 'POST',
                headers: { 'x-api-key': 'k' },
                body: JSON.stringify({ model: 'm' })
            }
        );
    });

    test('returns { ok: false, status, errorText } on a non-2xx response', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => 'invalid key',
            json: async () => { throw new Error('json() should not be called on error'); }
        });

        const result = await callProvider({ url: 'u', headers: {}, body: {} });

        expect(result).toEqual({ ok: false, status: 401, errorText: 'invalid key' });
    });

    test('preserves the upstream status code (429) for the caller to map', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 429,
            text: async () => 'rate limited'
        });

        const result = await callProvider({ url: 'u', headers: {}, body: {} });

        expect(result.ok).toBe(false);
        expect(result.status).toBe(429);
    });

    test('propagates network failures (caller turns them into 500s)', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(callProvider({ url: 'u', headers: {}, body: {} }))
            .rejects.toThrow('ECONNREFUSED');
    });
});
