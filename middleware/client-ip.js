/**
 * getClientIp — single source of truth for the caller's IP address.
 *
 * Preference order: Cloudflare's CF-Connecting-IP header (set by the tunnel)
 * -> Express req.ip (populated from the trust-proxy setting) -> raw socket
 * address -> 'unknown'.
 *
 * SECURITY: CF-Connecting-IP is only trusted when the *direct* TCP peer is a
 * trusted proxy. A co-located Cloudflare tunnel connects from loopback, so the
 * default trusted set is loopback only. A direct LAN/internet client connects
 * from its own address, so its (spoofable) header is ignored and we fall back
 * to req.ip. This makes header trust correct regardless of how the origin is
 * bound — worst case the fallback is more conservative, never less safe.
 *
 * If the tunnel connector does NOT reach the origin over loopback (e.g. a
 * cloudflared sidecar over a docker bridge), set TRUSTED_PROXY_IPS to the
 * connector's source address(es), comma-separated.
 */

const LOOPBACK_PROXIES = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

function trustedProxies() {
    const extra = (process.env.TRUSTED_PROXY_IPS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    return LOOPBACK_PROXIES.concat(extra);
}

function getClientIp(req) {
    const cf = req.headers && req.headers['cf-connecting-ip'];
    if (cf) {
        const peer = (req.socket && req.socket.remoteAddress) ||
            (req.connection && req.connection.remoteAddress) || '';
        if (trustedProxies().includes(peer)) {
            const value = Array.isArray(cf) ? cf[0] : cf;
            if (typeof value === 'string' && value.length > 0) {
                return value.split(',')[0].trim();
            }
        }
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

const PROXY_HEADERS = ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'forwarded'];

function isPrivateAddress(addr) {
    if (typeof addr !== 'string') return false;
    const a = addr.toLowerCase();
    if (a === '::1') return true;
    const v4 = a.startsWith('::ffff:') ? a.slice(7) : a;
    const m = v4.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
    if (m) {
        const [o1, o2] = [Number(m[1]), Number(m[2])];
        return o1 === 127 || o1 === 10 ||
            (o1 === 172 && o2 >= 16 && o2 <= 31) ||
            (o1 === 192 && o2 === 168);
    }
    return /^f[cd][0-9a-f]{0,2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a);
}

/**
 * isDirectLocalClient — is the caller on the local network, with no proxy in
 * between? True when the direct TCP peer is a loopback or private address and
 * the request carries no forwarding header.
 *
 * Uses socket.remoteAddress, not req.ip or getClientIp: through the tunnel the
 * peer is loopback for every internet client, and behind a Docker or k8s proxy
 * it is a private address, so the address alone would pass both. Those
 * requests carry CF-Connecting-IP or X-Forwarded-For. A LAN client could only
 * add such a header, which makes it look remote, never local.
 */
function isDirectLocalClient(req) {
    const headers = req.headers || {};
    if (PROXY_HEADERS.some(h => headers[h] !== undefined)) return false;
    const peer = (req.socket && req.socket.remoteAddress) ||
        (req.connection && req.connection.remoteAddress);
    return isPrivateAddress(peer);
}

module.exports = { getClientIp, isDirectLocalClient };
