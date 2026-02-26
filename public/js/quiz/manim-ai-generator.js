/**
 * Manim AI Generator
 * Handles AI-assisted generation of Manim animation code from natural language descriptions.
 * Independent AI provider/model config from the question generator.
 */

import { logger, AI } from '../core/config.js';
import { secureStorage } from '../services/secure-storage-service.js';
import { aiProviderService } from '../ai/ai-provider-service.js';
import { APIHelper } from '../utils/api-helper.js';
import { getTranslation } from '../utils/translation-manager.js';
import { getItem, setItem } from '../utils/storage-utils.js';

/** Default models per provider (first model from aiProviderService list) */
const DEFAULT_MODELS = {
    ollama: 'llama3.2:latest',
    openai: 'gpt-4o-mini',
    claude: 'claude-sonnet-4-5',
    gemini: 'gemini-2.5-flash'
};

/** System prompt for Manim code generation */
const MANIM_SYSTEM_PROMPT = `You are an expert Manim animation coder. Given a description of a mathematical animation, generate working Manim Community Edition Python code.

STRICT RULES:
1. Output ONLY valid Python code. No explanations, no markdown.
2. Always start with: from manim import *
3. Define exactly ONE class that inherits from Scene.
4. The class MUST have a construct(self) method.
5. Keep animations between 3-10 seconds total duration.
6. Use only safe, standard Manim APIs: Create, Write, FadeIn, FadeOut, Transform, MoveToTarget, Indicate, self.play(), self.wait(), etc.
7. Use Text() for labels (NOT MathTex — LaTeX may not be installed).
8. Do NOT use external files, network calls, or os/subprocess imports.
9. Do NOT use deprecated APIs.

EXAMPLE OUTPUT:
from manim import *

class MyScene(Scene):
    def construct(self):
        circle = Circle(radius=2, color=BLUE)
        self.play(Create(circle))
        self.wait(1)
`;

class ManimAIGenerator {
    /**
     * Get the saved AI provider for Manim generation.
     * @returns {string}
     */
    getProvider() {
        return getItem('manim_ai_provider') || 'ollama';
    }

    /**
     * Set the AI provider for Manim generation.
     * @param {string} provider
     */
    setProvider(provider) {
        setItem('manim_ai_provider', provider);
    }

    /**
     * Get the saved model for the current provider.
     * @returns {string}
     */
    getModel() {
        const provider = this.getProvider();
        return getItem(`manim_ai_model_${provider}`) || DEFAULT_MODELS[provider] || '';
    }

    /**
     * Set the model for the current provider.
     * @param {string} model
     */
    setModel(model) {
        const provider = this.getProvider();
        setItem(`manim_ai_model_${provider}`, model);
    }

    /**
     * Get the list of available models for a provider.
     * For Ollama, fetches dynamically.
     * @param {string} provider
     * @returns {Promise<Array<{id: string, name: string}>>}
     */
    async getModelsForProvider(provider) {
        if (provider === 'ollama') {
            const models = await aiProviderService.loadOllamaModels();
            return models.map(name => ({ id: name, name }));
        }
        // Pull canonical model list from aiProviderService (single source of truth)
        const config = aiProviderService.getProviderConfig(provider);
        const models = config?.models || [];
        return models.map(m => typeof m === 'string' ? { id: m, name: m } : m);
    }

    /**
     * Check if the provider requires an API key.
     * @param {string} provider
     * @returns {boolean}
     */
    requiresApiKey(provider) {
        return provider !== 'ollama';
    }

    /**
     * Check if an API key is stored for the given provider.
     * @param {string} provider
     * @returns {Promise<boolean>}
     */
    async hasApiKey(provider) {
        if (!this.requiresApiKey(provider)) return true;
        const key = await secureStorage.getSecureItem(`api_key_${provider}`);
        return !!key;
    }

    /**
     * Build the user prompt from description + question context.
     * @param {string} description - Natural language description
     * @param {object} context - Question context
     * @param {string} context.questionText
     * @param {string} context.questionType
     * @param {string[]} [context.options]
     * @param {string} [context.correctAnswer]
     * @param {'question'|'explanation'} context.placement
     * @returns {string}
     */
    buildUserPrompt(description, context) {
        let prompt = `Create a Manim animation: ${description}\n\n`;
        prompt += `Context — this animation is for the ${context.placement === 'explanation' ? 'explanation' : 'question display'} of a quiz question.\n`;
        prompt += `Question type: ${context.questionType}\n`;
        prompt += `Question text: ${context.questionText}\n`;

        if (context.options && context.options.length > 0) {
            prompt += `Answer options: ${context.options.join(', ')}\n`;
        }
        if (context.correctAnswer) {
            prompt += `Correct answer: ${context.correctAnswer}\n`;
        }

        return prompt;
    }

    /**
     * Generate Manim code from a description.
     * @param {string} description - Natural language description
     * @param {object} questionContext - Question context for the prompt
     * @returns {Promise<string>} Generated Manim Python code
     */
    async generateCode(description, questionContext) {
        const provider = this.getProvider();
        const model = this.getModel();
        const userPrompt = this.buildUserPrompt(description, questionContext);

        logger.info(`ManimAI: generating with provider=${provider}, model=${model}`);

        let rawText;

        if (provider === 'ollama') {
            rawText = await this._generateWithOllama(userPrompt, model);
        } else if (provider === 'openai') {
            rawText = await this._generateWithOpenAI(userPrompt, model);
        } else if (provider === 'claude' || provider === 'gemini') {
            rawText = await this._generateViaProxy(provider, userPrompt, model);
        } else {
            throw new Error(`Unknown AI provider: ${provider}`);
        }

        return this._extractCode(rawText);
    }

    /**
     * Generate via Ollama (direct, no proxy needed).
     * @param {string} prompt
     * @param {string} model
     * @returns {Promise<string>}
     */
    async _generateWithOllama(prompt, model) {
        const response = await fetch(AI.OLLAMA_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model || 'llama3.2:latest',
                prompt: MANIM_SYSTEM_PROMPT + '\n\n' + prompt,
                stream: false,
                options: { temperature: 0.7 }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status}`);
        }

        const data = await response.json();
        return data.response;
    }

    /**
     * Generate via OpenAI (direct from browser).
     * @param {string} prompt
     * @param {string} model
     * @returns {Promise<string>}
     */
    async _generateWithOpenAI(prompt, model) {
        const apiKey = await secureStorage.getSecureItem('api_key_openai');
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || 'gpt-4o',
                messages: [
                    { role: 'system', content: MANIM_SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI error (${response.status}): ${err}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Generate via server proxy for Claude/Gemini (avoids CORS + hardcoded quiz prompts).
     * Uses the new /api/ai/complete general-purpose route.
     * @param {'claude'|'gemini'} provider
     * @param {string} prompt
     * @param {string} model
     * @returns {Promise<string>}
     */
    async _generateViaProxy(provider, prompt, model) {
        const apiKey = await secureStorage.getSecureItem(`api_key_${provider}`);

        const response = await fetch(APIHelper.getApiUrl('api/ai/complete'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider,
                prompt,
                system: MANIM_SYSTEM_PROMPT,
                model: model || undefined,
                apiKey: apiKey || undefined,
                maxTokens: 4096
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `AI proxy error (${response.status})`);
        }

        const data = await response.json();
        return data.text;
    }

    /**
     * Extract clean Manim Python code from raw AI response.
     * Strips markdown fences, finds the `from manim import` start marker,
     * validates basic structure.
     * @param {string} raw
     * @returns {string}
     */
    _extractCode(raw) {
        if (!raw || typeof raw !== 'string') {
            throw new Error('Empty response from AI');
        }

        let code = raw.trim();

        // Strip markdown code fences
        code = code.replace(/^```(?:python)?\s*\n?/gm, '');
        code = code.replace(/^```\s*$/gm, '');
        code = code.trim();

        // Find the start of Manim code
        const importIndex = code.indexOf('from manim import');
        if (importIndex === -1) {
            // Try to find just a class definition
            const classIndex = code.indexOf('class ');
            if (classIndex !== -1) {
                code = 'from manim import *\n\n' + code.substring(classIndex);
            } else {
                throw new Error('Generated code does not contain a valid Manim scene');
            }
        } else {
            code = code.substring(importIndex);
        }

        // Validate basic structure
        if (!code.includes('class ') || !code.includes('def construct')) {
            throw new Error('Generated code missing Scene class or construct method');
        }

        return code;
    }
}

export const manimAIGenerator = new ManimAIGenerator();
