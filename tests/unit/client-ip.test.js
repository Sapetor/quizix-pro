const { getClientIp } = require('../../middleware/client-ip');

// A co-located Cloudflare tunnel connects to the origin over loopback, so the
// direct TCP peer (socket.remoteAddress) is 127.0.0.1. Model that explicitly.
const LOOPBACK = { remoteAddress: '127.0.0.1' };

describe('getClientIp', () => {
    afterEach(() => { delete process.env.TRUSTED_PROXY_IPS; });

    test('(a) prefers cf-connecting-ip when the peer is a trusted (loopback) proxy', () => {
        const req = { headers: { 'cf-connecting-ip': '203.0.113.7' }, socket: LOOPBACK, ip: '127.0.0.1' };
        expect(getClientIp(req)).toBe('203.0.113.7');
    });

    test('takes the first value when cf-connecting-ip is comma-joined', () => {
        const req = { headers: { 'cf-connecting-ip': '203.0.113.7, 70.0.0.1' }, socket: LOOPBACK, ip: '127.0.0.1' };
        expect(getClientIp(req)).toBe('203.0.113.7');
    });

    test('(b) falls back to req.ip when header absent', () => {
        const req = { headers: {}, ip: '198.51.100.4', socket: { remoteAddress: '10.0.0.1' } };
        expect(getClientIp(req)).toBe('198.51.100.4');
    });

    test('falls back to socket.remoteAddress then unknown', () => {
        expect(getClientIp({ headers: {}, socket: { remoteAddress: '10.0.0.9' } })).toBe('10.0.0.9');
        expect(getClientIp({ headers: {} })).toBe('unknown');
    });

    // SECURITY regression (Finding A): a DIRECT client (peer is not a trusted
    // proxy) cannot spoof its rate-limit bucket by sending CF-Connecting-IP.
    // The header is ignored and we key on the real socket address / req.ip.
    test('ignores cf-connecting-ip from an untrusted (non-loopback) peer', () => {
        const attacker = {
            headers: { 'cf-connecting-ip': '203.0.113.7' },
            socket: { remoteAddress: '198.51.100.50' },
            ip: '198.51.100.50',
        };
        expect(getClientIp(attacker)).toBe('198.51.100.50');
        // A rotated header from the same direct peer stays in the same bucket.
        const attacker2 = { ...attacker, headers: { 'cf-connecting-ip': '203.0.113.99' } };
        expect(getClientIp(attacker2)).toBe('198.51.100.50');
    });

    test('honors cf-connecting-ip from a configured non-loopback proxy', () => {
        process.env.TRUSTED_PROXY_IPS = '172.18.0.1';
        const req = { headers: { 'cf-connecting-ip': '203.0.113.7' }, socket: { remoteAddress: '172.18.0.1' }, ip: '172.18.0.1' };
        expect(getClientIp(req)).toBe('203.0.113.7');
    });

    // (c) Regression: behind the Cloudflare tunnel every request shares ONE
    // connector socket / req.ip (the loopback tunnel). Before getClientIp,
    // per-IP rate limiters keyed on req.ip collapsed all remote users into a
    // single bucket. Assert two requests with the same connector but different
    // CF-Connecting-IP now land in DIFFERENT buckets.
    test('(c) separates rate-limit buckets for distinct clients sharing one connector', () => {
        const reqA = { headers: { 'cf-connecting-ip': '203.0.113.10' }, socket: LOOPBACK, ip: '127.0.0.1' };
        const reqB = { headers: { 'cf-connecting-ip': '203.0.113.20' }, socket: LOOPBACK, ip: '127.0.0.1' };

        const buckets = new Map();
        const bump = (req) => {
            const key = getClientIp(req);
            buckets.set(key, (buckets.get(key) || 0) + 1);
            return key;
        };

        const keyA = bump(reqA);
        const keyB = bump(reqB);

        expect(keyA).not.toBe(keyB);
        expect(buckets.get(keyA)).toBe(1);
        expect(buckets.get(keyB)).toBe(1);

        // Pre-fix collapse: keying on req.ip alone would merge them.
        expect(reqA.ip).toBe(reqB.ip);
    });
});
