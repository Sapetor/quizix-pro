/**
 * AI Provider Service
 * Handles AI provider configuration, initialization, and API calls
 * Extracted from generator.js for modularity and testability
 */

import { logger, AI } from '../core/config.js';
import { secureStorage } from '../services/secure-storage-service.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';
import { APIHelper } from '../utils/api-helper.js';
import { getItem } from '../utils/storage-utils.js';
import { buildOllamaEnhancedPrompt } from './prompts.js';

/**
 * Provider configurations with their endpoints and models
 */
const PROVIDERS = {
    ollama: {
        name: 'Ollama (Local)',
        apiKey: false,
        endpoint: AI.OLLAMA_ENDPOINT,
        models: ['llama3.2:latest', 'codellama:13b-instruct', 'codellama:7b-instruct', 'codellama:7b-code']
    },
    openai: {
        name: 'OpenAI',
        apiKey: true,
        endpoint: 'https://api.openai.com/v1/chat/completions',
        models: [AI.OPENAI_MODEL, 'gpt-4']
    },
    claude: {
        name: 'Anthropic Claude',
        apiKey: true,
        endpoint: 'https://api.anthropic.com/v1/messages',
        models: [
            { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (Recommended)' },
            { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (Fast & Cheap)' },
            { id: 'claude-opus-4-5', name: 'Claude Opus 4.5 (Most Capable)' },
            { id: 'claude-sonnet-4-0', name: 'Claude Sonnet 4 (Legacy)' }
        ]
    },
    gemini: {
        name: 'Google Gemini',
        apiKey: true,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        models: [
            { id: AI.GEMINI_MODEL, name: 'Gemini 2.5 Flash (Recommended)' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Most Capable)' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Fast & Cheap)' },
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview - Latest)' },
            { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview - Most Advanced)' }
        ]
    }
};

export class AIProviderService {
    constructor() {
        this.providers = PROVIDERS;
        this.isChangingProvider = false;
    }

    /**
     * Get provider configuration
     * @param {string} provider - Provider name
     * @returns {Object|null} Provider config or null
     */
    getProviderConfig(provider) {
        return this.providers[provider] || null;
    }

    /**
     * Get all available providers
     * @returns {Object} All provider configurations
     */
    getAllProviders() {
        return this.providers;
    }

    /**
     * Check if provider requires an API key
     * @param {string} provider - Provider name
     * @returns {boolean} True if API key required
     */
    requiresApiKey(provider) {
        return this.providers[provider]?.apiKey ?? false;
    }

    /**
     * Get API key for a provider
     * @param {string} provider - Provider name
     * @returns {Promise<string|null>} API key or null
     */
    async getApiKey(provider) {
        return await secureStorage.getSecureItem(`api_key_${provider}`);
    }

    /**
     * Generate content using the specified provider
     * @param {string} provider - Provider name
     * @param {string} prompt - The prompt to send
     * @param {Object} options - Generation options
     * @returns {Promise<string>} Raw response text
     */
    async generateWithProvider(provider, prompt, options = {}) {
        switch (provider) {
            case 'ollama':
                return await this.generateWithOllama(prompt, options);
            case 'openai':
                return await this.generateWithOpenAI(prompt, options);
            case 'claude':
                return await this.generateWithClaude(prompt, options);
            case 'gemini':
                return await this.generateWithGemini(prompt, options);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * Generate with Ollama (local)
     * @param {string} prompt - The prompt
     * @param {Object} options - Options
     * @returns {Promise<string>} Response text
     */
    async generateWithOllama(prompt, options = {}) {
        return await errorHandler.safeNetworkOperation(async () => {
            const model = getItem('ollama_selected_model') || AI.OLLAMA_DEFAULT_MODEL;
            const randomSeed = Math.floor(Math.random() * 10000);

            // Enhanced prompt specifically for Ollama
            const enhancedPrompt = buildOllamaEnhancedPrompt(prompt);

            const response = await fetch(AI.OLLAMA_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    prompt: enhancedPrompt,
                    stream: false,
                    options: {
                        temperature: AI.DEFAULT_TEMPERATURE,
                        seed: randomSeed
                    }
                })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Ollama server not running. Please start Ollama and try again.');
                } else if (response.status === 0) {
                    throw new Error('Cannot connect to Ollama. Make sure Ollama is running on localhost:11434');
                } else {
                    throw new Error(`Ollama error: ${response.status} - ${response.statusText}`);
                }
            }

            const data = await response.json();
            return data.response;
        }, {
            context: 'ollama-generation',
            userMessage: 'Failed to generate questions with Ollama. Please ensure Ollama is running and try again.',
            retryable: true
        });
    }

    /**
     * Generate with OpenAI
     * @param {string} prompt - The prompt
     * @param {Object} options - Options
     * @returns {Promise<string>} Response text
     */
    async generateWithOpenAI(prompt, options = {}) {
        return await errorHandler.safeNetworkOperation(async () => {
            const apiKey = await secureStorage.getSecureItem('api_key_openai');

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: options.model || AI.OPENAI_MODEL,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }],
                    temperature: options.temperature || AI.DEFAULT_TEMPERATURE
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid OpenAI API key. Please check your credentials.');
                } else if (response.status === 429) {
                    throw new Error('OpenAI rate limit exceeded. Please try again later.');
                } else if (response.status === 402) {
                    throw new Error('OpenAI billing issue. Please check your account balance and payment method.');
                } else if (response.status === 403) {
                    throw new Error('OpenAI API access forbidden. Please check your API key permissions.');
                } else {
                    const errorText = await response.text();
                    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
                }
            }

            const data = await response.json();
            return data.choices[0].message.content;
        }, {
            context: 'openai-generation',
            userMessage: 'Failed to generate questions with OpenAI. Please check your API key and try again.',
            retryable: true
        });
    }

    /**
     * Generate with Claude (via server proxy)
     * @param {string} prompt - The prompt
     * @param {Object} options - Options including model and numQuestions
     * @returns {Promise<string>} Response text
     */
    async generateWithClaude(prompt, options = {}) {
        logger.debug('generateWithClaude called');

        const apiKey = await secureStorage.getSecureItem('api_key_claude');
        logger.debug('Claude API key retrieved:', !!apiKey);

        // Get selected Claude model
        const selectedModel = options.model || 'claude-sonnet-4-5';
        logger.debug('Selected Claude model:', selectedModel);

        const response = await fetch(APIHelper.getApiUrl('api/claude/generate'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                apiKey: apiKey,
                numQuestions: options.numQuestions || 5,
                model: selectedModel
            })
        });

        logger.debug('Claude API response status:', response.status);

        if (!response.ok) {
            let errorMessage = `Claude API error (${response.status})`;

            if (response.status === 401) {
                errorMessage = 'Invalid Claude API key. Please check your credentials.';
            } else if (response.status === 429) {
                errorMessage = 'Claude rate limit exceeded. Please try again later.';
            } else if (response.status === 402) {
                errorMessage = 'Claude billing issue. Please check your account balance.';
            } else if (response.status === 403) {
                errorMessage = 'Claude API access forbidden. Please check your API key permissions.';
            } else {
                const errorText = await errorHandler.safeExecute(
                    async () => await response.text(),
                    { operation: 'parse-claude-error-text' },
                    () => ''
                );
                errorMessage = errorText
                    ? `Claude API error (${response.status}): ${errorText}`
                    : `Claude API error (${response.status})`;
            }

            logger.debug('Claude API error message:', errorMessage);
            throw new Error(errorMessage);
        }

        const data = await response.json();
        logger.debug('Claude API success, parsing response');

        // Claude API returns content in data.content[0].text format
        let content = '';
        if (data.content && Array.isArray(data.content) && data.content.length > 0) {
            content = data.content[0].text || data.content[0].content || '';
        } else if (data.content) {
            content = data.content;
        } else {
            throw new Error('Invalid Claude API response structure');
        }

        // Prepend '[' because we use prefill technique on the server
        if (!content.trim().startsWith('[')) {
            content = '[' + content;
            logger.debug('Prepended [ to Claude response (prefill technique)');
        }

        return content;
    }

    /**
     * Generate with Gemini
     * @param {string} prompt - The prompt
     * @param {Object} options - Options
     * @returns {Promise<string>} Response text
     */
    async generateWithGemini(prompt, options = {}) {
        return await errorHandler.safeNetworkOperation(async () => {
            const apiKey = await secureStorage.getSecureItem('api_key_gemini');
            const selectedModel = options.model || AI.GEMINI_MODEL || 'gemini-2.5-flash';

            logger.debug('Gemini API call starting');

            const response = await fetch(APIHelper.getApiUrl('api/gemini/generate'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    apiKey: apiKey,
                    numQuestions: options.numQuestions || 5,
                    model: selectedModel
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error || `HTTP ${response.status}`;
                logger.error('Gemini API error:', response.status, errorMessage);

                if (response.status === 401) {
                    throw new Error('Invalid Gemini API key. Please check your credentials.');
                } else if (response.status === 429) {
                    throw new Error('Gemini rate limit exceeded. Please try again later.');
                } else if (response.status === 403) {
                    throw new Error('Gemini API access forbidden. Please check your API key permissions.');
                } else if (response.status === 402) {
                    throw new Error('Gemini quota exceeded. Please check your account billing and quotas.');
                } else if (response.status === 400) {
                    throw new Error(`Invalid request: ${errorMessage}`);
                } else {
                    throw new Error(errorMessage);
                }
            }

            const data = await response.json();
            logger.debug('Gemini API response received');

            // Parse Gemini response format
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid Gemini API response structure');
            }

            const content = data.candidates[0].content.parts[0].text;

            if (!content) {
                throw new Error('No content received from Gemini API');
            }

            return content;

        }, {
            context: 'gemini-generation',
            userMessage: 'Failed to generate questions with Gemini. Please check your API key and try again.',
            retryable: true
        });
    }

    /**
     * Load available Ollama models
     * @returns {Promise<string[]>} Array of model names
     */
    async loadOllamaModels() {
        return await errorHandler.safeNetworkOperation(async () => {
            const response = await fetch(`${AI.OLLAMA_ENDPOINT.replace('/api/generate', '/api/tags')}`);

            if (!response.ok) {
                if (response.status === 404 || response.status === 0) {
                    logger.warn('Ollama server not running or not accessible');
                    return [];
                }
                throw new Error(`Failed to load Ollama models: ${response.status}`);
            }

            const data = await response.json();
            const models = data.models || [];

            logger.debug('Loaded Ollama models:', models.map(m => m.name));
            return models.map(m => m.name);

        }, {
            context: 'load-ollama-models',
            userMessage: null, // Silent failure
            retryable: false
        }) || [];
    }

    /**
     * Check if Ollama server is running
     * @returns {Promise<boolean>} True if running
     */
    async isOllamaRunning() {
        try {
            const response = await fetch(`${AI.OLLAMA_ENDPOINT.replace('/api/generate', '/api/tags')}`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

// Export singleton instance
export const aiProviderService = new AIProviderService();
