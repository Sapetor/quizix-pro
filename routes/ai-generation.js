const express = require('express');

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
        isProduction
    } = options;

    if (!logger) {
        throw new Error('logger is required for AI generation routes');
    }
    if (!validateBody) {
        throw new Error('validateBody is required for AI generation routes');
    }
    if (!claudeGenerateSchema) {
        throw new Error('claudeGenerateSchema is required for AI generation routes');
    }
    if (!geminiGenerateSchema) {
        throw new Error('geminiGenerateSchema is required for AI generation routes');
    }
    if (!extractUrlSchema) {
        throw new Error('extractUrlSchema is required for AI generation routes');
    }
    if (typeof isProduction !== 'boolean') {
        throw new Error('isProduction flag is required for AI generation routes');
    }

    const router = express.Router();

    // ==================== BYOK RATE LIMITING ====================
    // BYOK (Bring Your Own Key) rate limiter for Claude/Gemini API
    // Prevents abuse when users provide their own API keys
    const byokRateLimits = new Map();
    const BYOK_MAX_REQUESTS_PER_MINUTE = 10;
    const BYOK_WINDOW_MS = 60 * 1000; // 1 minute

    function checkByokRateLimit(ip) {
        const now = Date.now();
        const limit = byokRateLimits.get(ip);

        if (!limit || now > limit.resetTime) {
            byokRateLimits.set(ip, { count: 1, resetTime: now + BYOK_WINDOW_MS });
            return { allowed: true, remaining: BYOK_MAX_REQUESTS_PER_MINUTE - 1 };
        }

        if (limit.count >= BYOK_MAX_REQUESTS_PER_MINUTE) {
            const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
            return { allowed: false, retryAfter, remaining: 0 };
        }

        limit.count++;
        return { allowed: true, remaining: BYOK_MAX_REQUESTS_PER_MINUTE - limit.count };
    }

    // Cleanup old BYOK rate limit entries every 5 minutes
    const byokCleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ip, limit] of byokRateLimits.entries()) {
            if (now > limit.resetTime + 60000) {
                byokRateLimits.delete(ip);
            }
        }
    }, 5 * 60 * 1000);

    // ==================== URL RATE LIMITING ====================
    // Rate limiting for URL extraction to prevent abuse
    const urlRateLimits = new Map();
    const URL_MAX_REQUESTS_PER_MINUTE = 5;

    function checkUrlRateLimit(ip) {
        const now = Date.now();
        const limit = urlRateLimits.get(ip);

        if (!limit || now > limit.resetTime) {
            urlRateLimits.set(ip, { count: 1, resetTime: now + 60000 });
            return { allowed: true, remaining: URL_MAX_REQUESTS_PER_MINUTE - 1 };
        }

        if (limit.count >= URL_MAX_REQUESTS_PER_MINUTE) {
            const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
            return { allowed: false, retryAfter, remaining: 0 };
        }

        limit.count++;
        return { allowed: true, remaining: URL_MAX_REQUESTS_PER_MINUTE - limit.count };
    }

    // Cleanup old URL rate limit entries every 5 minutes
    const urlCleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ip, limit] of urlRateLimits.entries()) {
            if (now > limit.resetTime + 60000) {
                urlRateLimits.delete(ip);
            }
        }
    }, 5 * 60 * 1000);

    // ==================== SSRF PROTECTION ====================
    // Check if an IP address is private (SSRF protection)
    function isPrivateIP(hostname) {
        // Block localhost
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
            return true;
        }

        // Parse IPv4 addresses
        const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
        if (ipv4Match) {
            const [, a, b, c] = ipv4Match.map(Number);

            // 10.0.0.0/8
            if (a === 10) return true;

            // 172.16.0.0/12
            if (a === 172 && b >= 16 && b <= 31) return true;

            // 192.168.0.0/16
            if (a === 192 && b === 168) return true;

            // 127.0.0.0/8 (loopback)
            if (a === 127) return true;

            // 169.254.0.0/16 (link-local)
            if (a === 169 && b === 254) return true;

            // 0.0.0.0/8 (current network)
            if (a === 0) return true;
        }

        return false;
    }

    // ==================== OLLAMA ROUTES ====================

    // Ollama endpoint is configurable via OLLAMA_URL env var for K8s deployments
    const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

    // Fetch available Ollama models endpoint
    router.get('/ollama/models', async (req, res) => {
        try {
            const { default: fetch } = await import('node-fetch');
            const response = await fetch(`${OLLAMA_URL}/api/tags`);

            if (!response.ok) {
                return res.status(500).json({ error: 'Failed to fetch Ollama models' });
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
            res.status(500).json({ error: 'Failed to connect to Ollama' });
        }
    });

    // ==================== CLAUDE ROUTES ====================

    // Claude API proxy endpoint
    // Supports two modes:
    // 1. Server-side key: Set CLAUDE_API_KEY env var (recommended for production)
    // 2. BYOK (Bring Your Own Key): Client provides key in request body
    router.post('/claude/generate', validateBody(claudeGenerateSchema), async (req, res) => {
        try {
            const { prompt, apiKey: clientApiKey, numQuestions, model } = req.validatedBody;

            // Use server-side API key if available, otherwise require client key
            const serverApiKey = process.env.CLAUDE_API_KEY;
            const apiKey = serverApiKey || clientApiKey;

            // Apply rate limiting for BYOK mode only (server key has no limit)
            if (!serverApiKey && clientApiKey) {
                const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
                const rateCheck = checkByokRateLimit(clientIP);

                if (!rateCheck.allowed) {
                    logger.warn(`BYOK rate limit exceeded for IP: ${clientIP}`);
                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        message: `Too many requests. Please wait ${rateCheck.retryAfter} seconds.`,
                        retryAfter: rateCheck.retryAfter
                    });
                }

                // Add rate limit headers
                res.set('X-RateLimit-Remaining', rateCheck.remaining.toString());
            }

            if (!apiKey) {
                return res.status(400).json({
                    error: 'API key is required',
                    hint: serverApiKey ? undefined : 'Set CLAUDE_API_KEY environment variable or provide key in request'
                });
            }

            if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
                return res.status(400).json({ error: 'Valid API key is required' });
            }

            // Log which mode is being used (without exposing key)
            if (serverApiKey) {
                logger.debug('Using server-side Claude API key');
            } else {
                logger.debug('Using client-provided Claude API key');
            }

            // Import node-fetch for HTTP requests
            const { default: fetchFunction } = await import('node-fetch');

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
                system: 'You are a quiz question generator. CRITICAL FORMATTING RULES:\n\n1. MATHEMATICAL EXPRESSIONS: For ALL mathematical expressions, equations, formulas, or symbols, you MUST use LaTeX syntax wrapped in $ or $$ delimiters. Examples: inline math like $E = mc^2$ or $\\frac{x+1}{2}$, display math like $$\\int_0^\\infty e^{-x} dx = 1$$. NEVER output math as plain text.\n\n2. CODE SNIPPETS: For ALL code snippets, you MUST use markdown code blocks with language specification. Format: ```language\\ncode here\\n```. Examples: ```python\\nprint("hello")\\n```, ```javascript\\nconst x = 5;\\n```. Use inline code `like this` for variable names, function names, and keywords. NEVER output code as plain text.\n\n3. OUTPUT FORMAT: Always output valid JSON arrays starting with [ and ending with ].',
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

            const response = await fetchFunction('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Claude API error:', response.status);

                let errorMessage = `Claude API error: ${response.status}`;
                if (response.status === 401) {
                    errorMessage = 'Invalid API key. Please check your Claude API key and try again.';
                } else if (response.status === 429) {
                    errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
                } else if (response.status === 400) {
                    errorMessage = 'Invalid request. Please check your input and try again.';
                }

                return res.status(response.status).json({
                    error: errorMessage,
                    details: isProduction ? undefined : errorText // Hide details in production
                });
            }

            const data = await response.json();
            res.json(data);
        } catch (error) {
            logger.error('Claude proxy error:', error.message);
            res.status(500).json({
                error: 'Failed to connect to Claude API',
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
            const { prompt, apiKey: clientApiKey, numQuestions, model } = req.validatedBody;

            // Use server-side API key if available, otherwise require client key
            const serverApiKey = process.env.GEMINI_API_KEY;
            const apiKey = serverApiKey || clientApiKey;

            // Apply rate limiting for BYOK mode only (server key has no limit)
            if (!serverApiKey && clientApiKey) {
                const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
                const rateCheck = checkByokRateLimit(clientIP);

                if (!rateCheck.allowed) {
                    logger.warn(`BYOK rate limit exceeded for IP: ${clientIP}`);
                    return res.status(429).json({
                        error: 'Rate limit exceeded',
                        message: `Too many requests. Please wait ${rateCheck.retryAfter} seconds.`,
                        retryAfter: rateCheck.retryAfter
                    });
                }

                // Add rate limit headers
                res.set('X-RateLimit-Remaining', rateCheck.remaining.toString());
            }

            if (!apiKey) {
                return res.status(400).json({
                    error: 'API key is required',
                    hint: serverApiKey ? undefined : 'Set GEMINI_API_KEY environment variable or provide key in request'
                });
            }

            if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
                return res.status(400).json({ error: 'Valid API key is required' });
            }

            // Log which mode is being used (without exposing key)
            if (serverApiKey) {
                logger.debug('Using server-side Gemini API key');
            } else {
                logger.debug('Using client-provided Gemini API key');
            }

            // Import node-fetch for HTTP requests
            const { default: fetchFunction } = await import('node-fetch');

            // Calculate max_tokens based on number of questions (matching Claude's allocation)
            // ~2000 tokens per question to allow for LaTeX, explanations, and safety margin
            const questionCount = Math.max(1, Math.min(numQuestions || 5, 20));
            const calculatedMaxTokens = Math.max(8192, questionCount * 2000);

            // Use model from request, fall back to env var, then default
            const selectedModel = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            logger.info(`Using Gemini model: ${selectedModel}`);

            // Gemini API request format
            const requestBody = {
                systemInstruction: {
                    parts: [
                        {
                            text: 'You are a quiz question generator. CRITICAL FORMATTING RULES:\n\n1. MATHEMATICAL EXPRESSIONS: For ALL mathematical expressions, equations, formulas, or symbols, you MUST use LaTeX syntax wrapped in $ or $$ delimiters. Examples: inline math like $E = mc^2$ or $\\frac{x+1}{2}$, display math like $$\\int_0^\\infty e^{-x} dx = 1$$. NEVER output math as plain text.\n\n2. CODE SNIPPETS: For ALL code snippets, you MUST use markdown code blocks with language specification. Format: ```language\\ncode here\\n```. Examples: ```python\\nprint("hello")\\n```, ```javascript\\nconst x = 5;\\n```. Use inline code `like this` for variable names, function names, and keywords. NEVER output code as plain text.\n\n3. OUTPUT FORMAT: Always output valid JSON arrays starting with [ and ending with ].'
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

            const response = await fetchFunction(
                `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Gemini API error:', response.status);

                let errorMessage = `Gemini API error: ${response.status}`;
                if (response.status === 401) {
                    errorMessage = 'Invalid API key. Please check your Gemini API key and try again.';
                } else if (response.status === 429) {
                    errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
                } else if (response.status === 400) {
                    errorMessage = 'Invalid request. Please check your input and try again.';
                } else if (response.status === 403) {
                    errorMessage = 'Access forbidden. Please check your API key permissions or account quotas.';
                } else if (response.status === 402) {
                    errorMessage = 'Quota exceeded. Please check your account billing and quotas.';
                }

                return res.status(response.status).json({
                    error: errorMessage,
                    details: isProduction ? undefined : errorText // Hide details in production
                });
            }

            const data = await response.json();
            res.json(data);
        } catch (error) {
            logger.error('Gemini proxy error:', error.message);
            res.status(500).json({
                error: 'Failed to connect to Gemini API',
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
            const rateCheck = checkUrlRateLimit(clientIP);

            if (!rateCheck.allowed) {
                logger.warn(`URL rate limit exceeded for IP: ${clientIP}`);
                return res.status(429).json({
                    error: 'Rate limit exceeded',
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
                return res.status(400).json({ error: 'Invalid URL format' });
            }

            // SSRF protection: Block private IPs
            if (isPrivateIP(parsedUrl.hostname)) {
                logger.warn(`Blocked private IP URL request: ${url}`);
                return res.status(403).json({
                    error: 'URL blocked',
                    message: 'This URL cannot be accessed for security reasons.'
                });
            }

            // Dynamic import of dependencies
            let fetchFunction, cheerio;
            try {
                const nodeFetch = await import('node-fetch');
                fetchFunction = nodeFetch.default;
                cheerio = require('cheerio');
            } catch (err) {
                logger.warn('Required packages not installed for URL extraction');
                return res.status(501).json({
                    error: 'URL extraction not available',
                    message: 'Server does not have URL fetching capability.'
                });
            }

            // Fetch the URL with timeout and redirect limits
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

            try {
                const response = await fetchFunction(url, {
                    signal: controller.signal,
                    redirect: 'follow',
                    follow: 3, // Max 3 redirects
                    size: MAX_RESPONSE_SIZE,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; QuizixBot/1.0; +https://quizix.pro)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5'
                    }
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    return res.status(response.status).json({
                        error: 'Failed to fetch URL',
                        message: `Server returned status ${response.status}`
                    });
                }

                // Check content type
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
                    return res.status(400).json({
                        error: 'Unsupported content type',
                        message: 'URL must point to an HTML or text document.'
                    });
                }

                const html = await response.text();

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
                        message: 'The URL took too long to respond.'
                    });
                }

                throw fetchError;
            }
        } catch (error) {
            logger.error('URL extraction error:', error);
            res.status(500).json({ error: 'Failed to extract content from URL: ' + error.message });
        }
    });

    // ==================== AI CONFIG ROUTE ====================

    // Check if server has configured API keys (for client UI)
    router.get('/ai/config', (req, res) => {
        res.json({
            claudeKeyConfigured: !!process.env.CLAUDE_API_KEY,
            geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
            ollamaAvailable: true // Ollama doesn't require API key
            // Don't expose actual keys, just whether they're configured
        });
    });

    // Cleanup intervals on router destruction (prevents memory leaks)
    router._cleanupIntervals = [byokCleanupInterval, urlCleanupInterval];

    return router;
}

module.exports = { createAIGenerationRoutes };
