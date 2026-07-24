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

module.exports = { getClientIp };
