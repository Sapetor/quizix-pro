const express = require('express');
const dns = require('dns').promises;
const { requireUser } = require('../middleware/attach-user');

/**
 * POST to an upstream AI provider and normalize the outcome.
 *
 * Returns { ok: true, data } when the provider responds 2xx (body parsed as
 * JSON), or { ok: false, status, errorText } for a non-2xx response so the
 * caller can map status -> message. Network/parse failures throw and are
 * handled by each route's try/catch (-> 500). This is pure transport: status
 * mapping and response extraction stay in the routes because they differ per
 * endpoint. Exported for unit testing.
 *
 * @param {Object} opts
 * @param {string} opts.url - Provider endpoint.
 * @param {Object} opts.headers - Request headers.
 * @param {Object} opts.body - Request body (JSON-serialized here).
 * @returns {Promise<{ok: true, data: any} | {ok: false, status: number, errorText: string}>}
 */
async function callProvider({ url, headers, body }) {
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        return { ok: false, status: response.status, errorText };
    }

    const data = await response.json();
    return { ok: true, data };
}

/**
 * AI Generation Routes
 * Handles Ollama, Claude, and Gemini AI generation endpoints with BYOK rate limiting
 *
 * Factory function to create AI generation routes with dependencies
 * @param {Object} options - Configuration options
 * @param {Object} options.logger - Logger instance
 * @param {Function} options.validateBody - Request body validation middleware factory
 * @param {Object} options.claudeGenerateSchema - Validation schema for Claude endpoint
 * @param {Object} options.geminiGenerateSchema - Validation schema for Gemini endpoint
 * @param {Object} options.extractUrlSchema - Validation schema for URL extraction endpoint
 * @param {boolean} options.isProduction - Production environment flag
 * @returns {express.Router} Configured router
 */
function createAIGenerationRoutes(options) {
    const {
        logger,
        validateBody,
        claudeGenerateSchema,
        geminiGenerateSchema,
        extractUrlSchema,
        aiCompleteSchema,
        isProduction
    } = options;

    const required = { logger, validateBody, claudeGenerateSchema, geminiGenerateSchema, extractUrlSchema, aiCompleteSchema };
    for (const [name, value] of Object.entries(required)) {
        if (!value) throw new Error(`${name} is required for AI generation routes`);
    }
    if (typeof isProduction !== 'boolean') {
        throw new Error('isProduction flag is required for AI generation routes');
    }

    const router = express.Router();

    // ==================== RATE LIMITING ====================

    /**
     * Generic per-IP rate limiter factory.
     * Returns a check function and a cleanup interval.
     */
    function createRateLimiter(maxPerMinute) {
        const limits = new Map();
        const windowMs = 60 * 1000;

        function check(ip) {
            const now = Date.now();
            const limit = limits.get(ip);

            if (!limit || now > limit.resetTime) {
                limits.set(ip, { count: 1, resetTime: now + windowMs });
                return { allowed: true, remaining: maxPerMinute - 1 };
            }

            if (limit.count >= maxPerMinute) {
                const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
                return { allowed: false, retryAfter, remaining: 0 };
            }

            limit.count++;
            return { allowed: true, remaining: maxPerMinute - limit.count };
        }

        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [ip, limit] of limits.entries()) {
                if (now > limit.resetTime + 60000) {
                    limits.delete(ip);
                }
            }
        }, 5 * 60 * 1000);

        return { check, cleanupInterval };
    }

    // ==================== DYNAMIC SYSTEM PROMPT ====================

    /**
     * Build a system prompt for AI quiz generation based on content flags.
     * When contentFlags is null (old client or unknown content), include ALL rules
     * for backward compatibility. When flags are provided, include only relevant rules.
     * @param {Object|null} contentFlags - { needsLatex, needsCodeBlocks, language }
     * @returns {string} System prompt
     */
    function buildSystemPrompt(contentFlags) {
        const parts = ['You are a quiz question generator.'];

        // Always include JSON output rule
        parts.push('OUTPUT FORMAT: Always output valid JSON arrays starting with [ and ending with ].');

        const includeAll = !contentFlags;
        const needsLatex = includeAll || contentFlags?.needsLatex;
        const needsCode = includeAll || contentFlags?.needsCodeBlocks;

        if (needsLatex) {
            parts.push('MATHEMATICAL EXPRESSIONS: For ALL mathematical expressions, equations, formulas, or symbols, you MUST use LaTeX syntax wrapped in $ or $$ delimiters. Examples: inline math like $E = mc^2$ or $\\frac{x+1}{2}$, display math like $$\\int_0^\\infty e^{-x} dx = 1$$. NEVER output math as plain text.');
        }

        if (needsCode) {
            const langHint = contentFlags?.language ? ` Primary language: ${contentFlags.language}.` : '';
            parts.push(`CODE SNIPPETS: For ALL code snippets, you MUST use markdown code blocks with language specification. Format: \`\`\`language\\ncode here\\n\`\`\`. Use inline code \`like this\` for variable names, function names, and keywords. NEVER output code as plain text.${langHint}`);
        }

        return parts.join('\n\n');
    }

    const byokLimiter = createRateLimiter(10);
    const urlLimiter = createRateLimiter(5);
    const ollamaLimiter = createRateLimiter(20);

    // ==================== SSRF PROTECTION ====================

    // Check a dotted-quad IPv4 string against private/loopback/link-local ranges
    function isPrivateIPv4(ip) {
        const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
        if (!m) return false;
        const [, a, b] = m.map(Number);
        if (a === 10) return true;                       // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
        if (a === 192 && b === 168) return true;         // 192.168.0.0/16
        if (a === 127) return true;                      // 127.0.0.0/8 loopback
        if (a === 169 && b === 254) return true;         // 169.254.0.0/16 link-local
        if (a === 0) return true;                        // 0.0.0.0/8
        if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
        return false;
    }

    // Check if a hostname/IP literal is private (SSRF protection).
    // Covers IPv4 (incl. private/loopback/link-local), IPv6 loopback/ULA/link-local,
    // and IPv4-mapped IPv6. DNS resolution is handled separately in isBlockedHost.
    function isPrivateIP(hostname) {
        if (!hostname) return true;
        let host = String(hostname).trim().toLowerCase();
        // Strip brackets from IPv6 literals e.g. [::1]
        if (host.startsWith('[') && host.endsWith(']')) {
            host = host.slice(1, -1);
        }

        if (host === 'localhost') return true;

        // IPv6
        if (host.includes(':')) {
            if (host === '::1' || host === '::') return true;
            // IPv4-mapped IPv6 (::ffff:a.b.c.d)
            const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
            if (mapped) return isPrivateIPv4(mapped[1]);
            const firstHextet = host.split(':')[0];
            // Unique local fc00::/7 (fc.. or fd..)
            if (/^f[cd][0-9a-f]{0,2}$/.test(firstHextet)) return true;
            // Link-local fe80::/10
            if (/^fe[89ab][0-9a-f]$/.test(firstHextet)) return true;
            return false;
        }

        return isPrivateIPv4(host);
    }

    // Resolve a hostname and reject if the literal OR any resolved address is
    // private. DNS resolution also normalizes alternate IPv4 encodings
    // (decimal/octal/hex), closing those bypasses. Fails closed on resolution error.
    async function isBlockedHost(hostname) {
        if (isPrivateIP(hostname)) return true;
        try {
            const addresses = await dns.lookup(hostname, { all: true });
            return addresses.some(a => isPrivateIP(a.address));
        } catch (err) {
            logger.warn(`DNS resolution failed for ${hostname}: ${err.message}`);
            return true;
        }
    }

    // ==================== OLLAMA ROUTES ====================

    // Ollama endpoint is configurable via OLLAMA_URL env var or runtime API
    let ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    let ollamaEnabled = true;

    // Runtime Ollama configuration endpoints
    router.get('/ollama/config', (req, res) => {
        res.json({ url: ollamaUrl, enabled: ollamaEnabled });
    });

    router.post('/ollama/config', requireUser, (req, res) => {
        const { url, enabled } = req.body;
        if (typeof url === 'string' && url.trim()) {
            let parsed;
            try {
                parsed = new URL(url.trim());
            } catch {
                return res.status(400).json({ error: 'Invalid URL', messageKey: 'error_invalid_url' });
            }
            // SSRF protection: reject non-http(s) protocols and private/internal hosts
            if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateIP(parsed.hostname)) {
                logger.warn(`Blocked Ollama URL config: ${url}`);
                return res.status(403).json({ error: 'URL blocked', messageKey: 'error_url_blocked' });
            }
            ollamaUrl = url.trim().replace(/\/+$/, ''); // strip trailing slashes
            logger.info('Ollama URL updated to:', ollamaUrl);
        }
        if (typeof enabled === 'boolean') {
            ollamaEnabled = enabled;
            logger.info('Ollama enabled:', ollamaEnabled);
        }
        res.json({ url: ollamaUrl, enabled: ollamaEnabled });
    });

    // Fetch available Ollama models endpoint
    router.get('/ollama/models', async (req, res) => {
        if (!ollamaEnabled) {
            return res.json({ models: [] });
        }
        try {
            const response = await fetch(`${ollamaUrl}/api/tags`);

            if (!response.ok) {
                return res.status(500).json({ error: 'Failed to fetch Ollama models', messageKey: 'error_ollama_fetch_models' });
            }

            const data = await response.json();
            const models = data.models || [];

            res.json({
                models: models.map(model => ({
                    name: model.name,
                    size: model.size,
                    modified_at: model.modified_at
                }))
            });
        } catch (error) {
            logger.error('Ollama models fetch error:', error);
            res.status(500).json({ error: 'Failed to connect to Ollama', messageKey: 'error_ollama_connect' });
        }
    });

    // Ollama generate proxy endpoint - forwards generation requests to Ollama server
    router.post('/ollama/generate', async (req, res) => {
        if (!ollamaEnabled) {
            return res.status(503).json({ error: 'Ollama is disabled', messageKey: 'error_ollama_disabled' });
        }
        try {
            const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
            const rateCheck = ollamaLimiter.check(clientIP);

            if (!rateCheck.allowed) {
                logger.warn(`Ollama rate limit exceeded for IP: ${clientIP}`);
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    messageKey: 'error_rate_limited',
                    message: `Too many requests. Please wait ${rateCheck.retryAfter} seconds.`,
                    retryAfter: rateCheck.retryAfter
                });
            }

            res.set('X-RateLimit-Remaining', rateCheck.remaining.toString());

            const { model, prompt, stream, options } = req.body;

            if (!model || !prompt) {
                return res.status(400).json({ error: 'model and prompt are required', messageKey: 'error_invalid_request' });
            }

            const response = await fetch(`${ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, prompt, stream: stream ?? false, options })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Ollama generate error:', response.status);
                return res.status(response.status).json({
                    error: `Ollama error: ${response.status}`,
                    messageKey: 'error_ollama_generate',
                    details: isProduction ? undefined : errorText
                });
            }

            const data = await response.json();
            res.json(data);
        } catch (error) {
            logger.error('Ollama generate proxy error:', error.message);
            res.status(500).json({
                error: 'Failed to connect to Ollama',
                messageKey: 'error_ollama_connect',
                details: isProduction ? undefined : error.message
            });
        }
    });

    // Ollama health check endpoint
    router.get('/ollama/health', async (req, res) => {
        if (!ollamaEnabled) {
            return res.json({ running: false });
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`${ollamaUrl}/api/tags`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            res.json({ running: response.ok });
        } catch {
            res.json({ running: false });
        }
    });

    // ==================== CLAUDE ROUTES ====================

    // Claude API proxy endpoint
    // Supports two modes:
    // 1. Server-side key: Set CLAUDE_API_KEY env var (recommended for production)
    // 2. BYOK (Bring Your Own Key): Client provides key in request body
    router.post('/claude/generate', validateBody(claudeGenerateSchema), async (req, res) => {
        try {
            const { prompt, apiKey: clientApiKey, numQuestions, model, contentFlags } = req.validatedBody;

            // Use server-side API key if available, otherwise require client key
            const serverApiKey = process.env.CLAUDE_API_KEY;
            const apiKey = serverApiKey || clientApiKey;

            // Apply rate limiting for BYOK mode only (server key has no limit)
            if (!serverApiKey && clientApiKey) {
                const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
                const rateCheck = byokLimiter.check(clientIP);

                if (!rateCheck.allowed) {
                    logger.warn(`BYOK rate limit exceeded for IP: ${clientIP}`);
                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        messageKey: 'error_rate_limited',
                        message: `Too many requests. Please wait ${rateCheck.retryAfter} seconds.`,
                        retryAfter: rateCheck.retryAfter
                    });
                }

                res.set('X-RateLimit-Remaining', rateCheck.remaining.toString());
            }

            if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
                return res.status(400).json({
                    error: 'API key is required',
                    messageKey: 'error_api_key_required',
                    hint: serverApiKey ? undefined : 'Set CLAUDE_API_KEY environment variable or provide key in request'
                });
            }

            logger.debug(`Using ${serverApiKey ? 'server-side' : 'client-provided'} Claude API key`);

            // Calculate max_tokens based on number of questions
            // ~2000 tokens per question to allow for LaTeX, explanations, and safety margin
            const questionCount = Math.max(1, Math.min(numQuestions || 5, 20));
            const calculatedMaxTokens = Math.max(8192, questionCount * 2000);

            // Use model from request, fall back to env var, then default (using alias for auto-updates)
            const selectedModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
            logger.info(`Using Claude model: ${selectedModel}`);

            const requestBody = {
                model: selectedModel,
                max_tokens: calculatedMaxTokens,
                system: buildSystemPrompt(contentFlags || null),
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    },
                    {
                        role: 'assistant',
                        content: '['  // Prefill technique: force JSON array output
                    }
                ]
            };

            const result = await callProvider({
                url: 'https://api.anthropic.com/v1/messages',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: requestBody
            });

            if (!result.ok) {
                logger.error('Claude API error:', result.status);

                let errorMessage = `Claude API error: ${result.status}`;
                let messageKey = 'error_claude_api';
                if (result.status === 401) {
                    errorMessage = 'Invalid API key. Please check your Claude API key and try again.';
                    messageKey = 'error_invalid_api_key';
                } else if (result.status === 429) {
                    errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
                    messageKey = 'error_rate_limited';
                } else if (result.status === 400) {
                    errorMessage = 'Invalid request. Please check your input and try again.';
                    messageKey = 'error_invalid_request';
                }

                return res.status(result.status).json({
                    error: errorMessage,
                    messageKey,
                    details: isProduction ? undefined : result.errorText // Hide details in production
                });
            }

            res.json(result.data);
        } catch (error) {
            logger.error('Claude proxy error:', error.message);
            res.status(500).json({
                error: 'Failed to connect to Claude API',
                messageKey: 'error_claude_connect',
                details: isProduction ? undefined : error.message // Hide details in production
            });
        }
    });

    // ==================== GEMINI ROUTES ====================

    // Gemini API proxy endpoint
    // Supports two modes:
    // 1. Server-side key: Set GEMINI_API_KEY env var (recommended for production)
    // 2. BYOK (Bring Your Own Key): Client provides key in request body
    router.post('/gemini/generate', validateBody(geminiGenerateSchema), async (req, res) => {
        try {
            const { prompt, apiKey: clientApiKey, numQuestions, model, contentFlags } = req.validatedBody;

            // Use server-side API key if available, otherwise require client key
            const serverApiKey = process.env.GEMINI_API_KEY;
            const apiKey = serverApiKey || clientApiKey;

            // Apply rate limiting for BYOK mode only (server key has no limit)
            if (!serverApiKey && clientApiKey) {
                const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
                const rateCheck = byokLimiter.check(clientIP);

                if (!rateCheck.allowed) {
                    logger.warn(`BYOK rate limit exceeded for IP: ${clientIP}`);
                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        messageKey: 'error_rate_limited',
                        message: `Too many requests. Please wait ${rateCheck.retryAfter} seconds.`,
                        retryAfter: rateCheck.retryAfter
                    });
                }

                res.set('X-RateLimit-Remaining', rateCheck.remaining.toString());
            }

            if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
                return res.status(400).json({
                    error: 'API key is required',
                    messageKey: 'error_api_key_required',
                    hint: serverApiKey ? undefined : 'Set GEMINI_API_KEY environment variable or provide key in request'
                });
            }

            logger.debug(`Using ${serverApiKey ? 'server-side' : 'client-provided'} Gemini API key`);

            // Calculate max_tokens based on number of questions
            // ~3500 tokens per question for LaTeX, explanations, optionFeedback, concepts
            const questionCount = Math.max(1, Math.min(numQuestions || 5, 20));
            const calculatedMaxTokens = Math.max(16384, questionCount * 3500);

            // Use model from request, fall back to env var, then default
            const selectedModel = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            logger.info(`Using Gemini model: ${selectedModel}, maxOutputTokens: ${calculatedMaxTokens}`);

            // Gemini API request format
            const requestBody = {
                systemInstruction: {
                    parts: [
                        {
                            text: buildSystemPrompt(contentFlags || null)
                        }
                    ]
                },
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: calculatedMaxTokens
                }
            };

            // For thinking models (2.5+, 3.x), constrain thinking so it doesn't
            // squeeze output token space. Gemini 2.5 uses thinkingBudget (int),
            // Gemini 3.x uses thinkingLevel (string). Cannot mix them.
            const isGemini3 = /gemini-3/.test(selectedModel);
            const isGemini25 = /gemini-2\.5/.test(selectedModel);
            if (isGemini3) {
                requestBody.generationConfig.thinkingConfig = {
                    thinkingLevel: 'low'
                };
            } else if (isGemini25) {
                requestBody.generationConfig.thinkingConfig = {
                    thinkingBudget: 2048
                };
            }

            const result = await callProvider({
                url: `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`,
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: requestBody
            });

            if (!result.ok) {
                logger.error('Gemini API error:', result.status);

                let errorMessage = `Gemini API error: ${result.status}`;
                let messageKey = 'error_gemini_api';
                if (result.status === 401) {
                    errorMessage = 'Invalid API key. Please check your Gemini API key and try again.';
                    messageKey = 'error_invalid_api_key';
                } else if (result.status === 429) {
                    errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
                    messageKey = 'error_rate_limited';
                } else if (result.status === 400) {
                    errorMessage = 'Invalid request. Please check your input and try again.';
                    messageKey = 'error_invalid_request';
                } else if (result.status === 403) {
                    errorMessage = 'Access forbidden. Please check your API key permissions or account quotas.';
                    messageKey = 'error_api_forbidden';
                } else if (result.status === 402) {
                    errorMessage = 'Quota exceeded. Please check your account billing and quotas.';
                    messageKey = 'error_api_quota_exceeded';
                }

                return res.status(result.status).json({
                    error: errorMessage,
                    messageKey,
                    details: isProduction ? undefined : result.errorText // Hide details in production
                });
            }

            const data = result.data;

            // Check finishReason — if MAX_TOKENS, the response was truncated
            const finishReason = data.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== 'STOP') {
                logger.warn(`Gemini finishReason: ${finishReason} (model: ${selectedModel}, maxOutputTokens: ${calculatedMaxTokens})`);
            }
            // Relay finishReason to client so it can detect truncation
            data._finishReason = finishReason || null;

            res.json(data);
        } catch (error) {
            logger.error('Gemini proxy error:', error.message);
            res.status(500).json({
                error: 'Failed to connect to Gemini API',
                messageKey: 'error_gemini_connect',
                details: isProduction ? undefined : error.message // Hide details in production
            });
        }
    });

    // ==================== URL EXTRACTION ROUTE ====================

    router.post('/extract-url', validateBody(extractUrlSchema), async (req, res) => {
        const URL_FETCH_TIMEOUT_MS = 10000;
        const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB

        try {
            const { url } = req.validatedBody;

            // Rate limiting
            const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
            const rateCheck = urlLimiter.check(clientIP);

            if (!rateCheck.allowed) {
                logger.warn(`URL rate limit exceeded for IP: ${clientIP}`);
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    messageKey: 'error_rate_limited',
                    message: `Too many requests. Please wait ${rateCheck.retryAfter} seconds.`,
                    retryAfter: rateCheck.retryAfter
                });
            }

            res.set('X-RateLimit-Remaining', rateCheck.remaining.toString());

            // Parse and validate URL
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                return res.status(400).json({ error: 'Invalid URL format', messageKey: 'error_invalid_url' });
            }

            // SSRF protection is enforced per-hop below (DNS-resolved) so that
            // redirects and hostnames pointing at private IPs cannot bypass it.
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                return res.status(403).json({
                    error: 'URL blocked',
                    messageKey: 'error_url_blocked',
                    message: 'This URL cannot be accessed for security reasons.'
                });
            }

            // Dynamic import of cheerio
            let cheerio;
            try {
                cheerio = require('cheerio');
            } catch (err) {
                logger.warn('cheerio not installed for URL extraction');
                return res.status(501).json({
                    error: 'URL extraction not available',
                    messageKey: 'error_url_extraction_not_available',
                    message: 'Server does not have URL fetching capability.'
                });
            }

            // Fetch the URL with timeout, manual redirect handling, and SSRF
            // re-validation (DNS-resolved) on every hop.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
            const MAX_REDIRECTS = 5;
            const fetchHeaders = {
                'User-Agent': 'Mozilla/5.0 (compatible; QuizixBot/1.0; +https://quizix.pro)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            };

            try {
                let currentUrl = url;
                let response;

                for (let hop = 0; ; hop++) {
                    const hopUrl = new URL(currentUrl);
                    if (!['http:', 'https:'].includes(hopUrl.protocol) || await isBlockedHost(hopUrl.hostname)) {
                        clearTimeout(timeoutId);
                        logger.warn(`Blocked private/internal URL request: ${currentUrl}`);
                        return res.status(403).json({
                            error: 'URL blocked',
                            messageKey: 'error_url_blocked',
                            message: 'This URL cannot be accessed for security reasons.'
                        });
                    }

                    response = await fetch(currentUrl, {
                        signal: controller.signal,
                        redirect: 'manual',
                        headers: fetchHeaders
                    });

                    // Follow 3xx redirects manually so each hop is re-validated
                    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
                        if (hop >= MAX_REDIRECTS) {
                            clearTimeout(timeoutId);
                            return res.status(400).json({
                                error: 'Too many redirects',
                                messageKey: 'error_url_fetch_failed',
                                message: 'The URL redirected too many times.'
                            });
                        }
                        currentUrl = new URL(response.headers.get('location'), currentUrl).toString();
                        continue;
                    }
                    break;
                }

                if (!response.ok) {
                    clearTimeout(timeoutId);
                    return res.status(response.status).json({
                        error: 'Failed to fetch URL',
                        messageKey: 'error_url_fetch_failed',
                        message: `Server returned status ${response.status}`
                    });
                }

                // Check content type
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
                    clearTimeout(timeoutId);
                    return res.status(400).json({
                        error: 'Unsupported content type',
                        messageKey: 'error_unsupported_content_type',
                        message: 'URL must point to an HTML or text document.'
                    });
                }

                // Fast-fail on declared size, then enforce the cap while streaming
                // (Content-Length may be absent or spoofed). Keep the timeout armed
                // until the body is fully read so download time is also bounded.
                const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
                if (contentLength > MAX_RESPONSE_SIZE) {
                    clearTimeout(timeoutId);
                    return res.status(413).json({
                        error: 'Response too large',
                        messageKey: 'error_url_too_large',
                        message: 'The URL response exceeds the 5MB limit.'
                    });
                }

                let html;
                if (response.body && typeof response.body.getReader === 'function') {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    html = '';
                    let received = 0;
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        received += value.byteLength;
                        if (received > MAX_RESPONSE_SIZE) {
                            controller.abort();
                            clearTimeout(timeoutId);
                            return res.status(413).json({
                                error: 'Response too large',
                                messageKey: 'error_url_too_large',
                                message: 'The URL response exceeds the 5MB limit.'
                            });
                        }
                        html += decoder.decode(value, { stream: true });
                    }
                    html += decoder.decode();
                } else {
                    html = await response.text();
                }
                clearTimeout(timeoutId);

                // Parse HTML and extract text
                const $ = cheerio.load(html);

                // Get the page title BEFORE removing elements
                const title = $('title').first().text().trim() ||
                             $('h1').first().text().trim() ||
                             'Untitled';

                // Remove script, style, nav, footer, and other non-content elements
                $('script, style, nav, footer, header, aside, noscript, iframe, svg, form, button, input, select, textarea').remove();
                $('.sidebar, .menu, .navigation, .nav, .comments, .advertisement, .ad, .ads, .share, .social, .related, .cookie, .popup, .modal').remove();

                // Try to find the main content area
                let mainContent = $('main, article, [role="main"], .content, .post, .entry, .article, #content, #main, #article').first();
                if (mainContent.length === 0 || mainContent.text().trim().length < 100) {
                    // Fall back to body if main content is too short
                    mainContent = $('body');
                }

                // Extract text with better paragraph handling
                // Replace block elements with newlines for better formatting
                mainContent.find('p, div, h1, h2, h3, h4, h5, h6, li, br, tr').each((i, el) => {
                    $(el).append('\n');
                });

                let text = mainContent.text();

                // Clean up whitespace while preserving paragraph breaks
                text = text
                    .replace(/[ \t]+/g, ' ')           // Collapse horizontal whitespace
                    .replace(/\n[ \t]+/g, '\n')        // Remove leading whitespace on lines
                    .replace(/[ \t]+\n/g, '\n')        // Remove trailing whitespace on lines
                    .replace(/\n{3,}/g, '\n\n')        // Max 2 consecutive newlines
                    .trim();

                const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

                logger.info(`URL extracted: ${url}, ${wordCount} words, ${text.length} chars`);

                // Debug: log first 200 chars if extraction seems to have failed
                if (wordCount < 10) {
                    logger.debug(`URL extraction low word count. First 200 chars: ${text.substring(0, 200)}`);
                    logger.debug(`HTML length: ${html.length}, Body text length: ${$('body').text().length}`);
                }

                res.json({
                    text: text,
                    title: title,
                    wordCount: wordCount,
                    sourceUrl: url
                });
            } catch (fetchError) {
                clearTimeout(timeoutId);

                if (fetchError.name === 'AbortError') {
                    return res.status(408).json({
                        error: 'Request timeout',
                        messageKey: 'error_url_timeout',
                        message: 'The URL took too long to respond.'
                    });
                }

                throw fetchError;
            }
        } catch (error) {
            logger.error('URL extraction error:', error);
            res.status(500).json({ error: 'Failed to extract content from URL: ' + error.message, messageKey: 'error_url_extraction_failed' });
        }
    });

    // ==================== GENERAL-PURPOSE AI COMPLETION ====================

    router.post('/ai/complete', validateBody(aiCompleteSchema), async (req, res) => {
        try {
            const { provider, prompt, system, model, apiKey: clientApiKey, maxTokens } = req.validatedBody;

            // Determine API key: server-side env var, then client-provided
            const envKeyName = provider === 'claude' ? 'CLAUDE_API_KEY' : 'GEMINI_API_KEY';
            const serverApiKey = process.env[envKeyName];
            const apiKey = serverApiKey || clientApiKey;

            // BYOK rate limiting
            if (!serverApiKey && clientApiKey) {
                const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
                const rateCheck = byokLimiter.check(clientIP);

                if (!rateCheck.allowed) {
                    logger.warn(`BYOK rate limit exceeded for IP: ${clientIP}`);
                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        messageKey: 'error_rate_limited',
                        message: `Too many requests. Please wait ${rateCheck.retryAfter} seconds.`,
                        retryAfter: rateCheck.retryAfter
                    });
                }

                res.set('X-RateLimit-Remaining', rateCheck.remaining.toString());
            }

            if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
                return res.status(400).json({
                    error: 'API key is required',
                    messageKey: 'error_api_key_required',
                    hint: serverApiKey ? undefined : `Set ${envKeyName} environment variable or provide key in request`
                });
            }

            logger.debug(`AI complete: provider=${provider}, model=${model || 'default'}`);

            let responseText;

            if (provider === 'claude') {
                const selectedModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

                const requestBody = {
                    model: selectedModel,
                    max_tokens: maxTokens,
                    system: system,
                    messages: [
                        { role: 'user', content: prompt }
                    ]
                };

                const result = await callProvider({
                    url: 'https://api.anthropic.com/v1/messages',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: requestBody
                });

                if (!result.ok) {
                    logger.error('Claude AI complete error:', result.status);
                    return res.status(result.status).json({
                        error: `Claude API error: ${result.status}`,
                        messageKey: 'error_claude_api',
                        details: isProduction ? undefined : result.errorText
                    });
                }

                responseText = result.data.content?.[0]?.text || '';

            } else if (provider === 'gemini') {
                const selectedModel = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

                const requestBody = {
                    systemInstruction: {
                        parts: [{ text: system }]
                    },
                    contents: [
                        { parts: [{ text: prompt }] }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: maxTokens
                    }
                };

                const result = await callProvider({
                    url: `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey
                    },
                    body: requestBody
                });

                if (!result.ok) {
                    logger.error('Gemini AI complete error:', result.status);
                    return res.status(result.status).json({
                        error: `Gemini API error: ${result.status}`,
                        messageKey: 'error_gemini_api',
                        details: isProduction ? undefined : result.errorText
                    });
                }

                const data = result.data;
                // For thinking models, skip thought parts and get the actual output
                const parts = data.candidates?.[0]?.content?.parts || [];
                responseText = '';
                for (let i = parts.length - 1; i >= 0; i--) {
                    if (!parts[i].thought && parts[i].text) {
                        responseText = parts[i].text;
                        break;
                    }
                }
                if (!responseText) responseText = parts[0]?.text || '';
            }

            res.json({ text: responseText });
        } catch (error) {
            logger.error('AI complete proxy error:', error.message);
            res.status(500).json({
                error: 'Failed to complete AI request',
                messageKey: 'error_ai_complete',
                details: isProduction ? undefined : error.message
            });
        }
    });

    // ==================== AI CONFIG ROUTE ====================

    // Check if server has configured API keys (for client UI)
    router.get('/ai/config', (req, res) => {
        res.json({
            claudeKeyConfigured: !!process.env.CLAUDE_API_KEY,
            geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
            ollamaAvailable: ollamaEnabled
            // Don't expose actual keys, just whether they're configured
        });
    });

    // Cleanup intervals on router destruction (prevents memory leaks)
    router._cleanupIntervals = [byokLimiter.cleanupInterval, urlLimiter.cleanupInterval, ollamaLimiter.cleanupInterval];

    return router;
}

module.exports = { createAIGenerationRoutes, callProvider };
