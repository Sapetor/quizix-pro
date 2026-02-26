import { logger } from '../core/config.js';
import { APIHelper } from '../utils/api-helper.js';
import { imagePathResolver } from '../utils/image-path-resolver.js';
import { openModal, closeModal, createModalBindings } from '../utils/modal-utils.js';
import { getTranslation } from '../utils/translation-manager.js';
import { manimAIGenerator } from './manim-ai-generator.js';

/**
 * ManimEditor - Manages Manim animation code editing for quiz questions
 */
export class ManimEditor {
    constructor() {
        this.manimAvailable = null;
        this._statusPromise = null;
    }

    /**
     * Check whether the Manim render service is available.
     * Result is cached after the first call.
     * @returns {Promise<boolean>}
     */
    checkManimStatus() {
        if (this._statusPromise) {
            return this._statusPromise;
        }

        this._statusPromise = (async () => {
            try {
                const response = await fetch(APIHelper.getApiUrl('api/manim/status'));
                if (!response.ok) {
                    this.manimAvailable = false;
                    return false;
                }
                const data = await response.json();
                this.manimAvailable = data.available === true;
            } catch (err) {
                logger.warn('ManimEditor: status check failed', err);
                this.manimAvailable = false;
            }
            logger.debug(`ManimEditor: status resolved — available=${this.manimAvailable}`);
            this.initModeToggle();
            return this.manimAvailable;
        })();

        return this._statusPromise;
    }

    /**
     * Initialise the video section for a question element.
     * Must be called whenever a question is added or loaded into the editor.
     * @param {HTMLElement} questionElement
     */
    async initVideoSection(questionElement) {
        await this.checkManimStatus();

        const videoSection = questionElement.querySelector('.video-section');
        if (!videoSection) {
            return;
        }

        if (!this.manimAvailable) {
            videoSection.classList.add('hidden');
            return;
        }

        videoSection.classList.remove('hidden');

        this.setupTabSwitching(videoSection);

        // Render buttons — one per panel (question / explanation)
        videoSection.querySelectorAll('.render-manim-btn').forEach(btn => {
            const placement = btn.dataset.placement;
            if (!placement) {
                logger.warn('ManimEditor: .render-manim-btn missing data-placement attribute');
                return;
            }
            btn.addEventListener('click', () => this.handleRender(questionElement, placement));
        });

        // Remove-video buttons
        videoSection.querySelectorAll('.remove-video').forEach(btn => {
            const placement = btn.dataset.placement;
            if (!placement) {
                logger.warn('ManimEditor: .remove-video missing data-placement attribute');
                return;
            }
            btn.addEventListener('click', () => this.handleRemoveVideo(questionElement, placement));
        });

        // Help button
        const helpBtn = videoSection.querySelector('.manim-help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.openTutorial());
        }

        // AI generation — one per panel
        videoSection.querySelectorAll('.video-panel').forEach(panel => {
            this.initAIGeneration(panel, questionElement);
        });
    }

    /**
     * Wire up tab switching inside a video section.
     * @param {HTMLElement} videoSection
     */
    setupTabSwitching(videoSection) {
        videoSection.querySelectorAll('.video-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.target; // 'question' or 'explanation'

                // Toggle active class on tabs
                videoSection.querySelectorAll('.video-tab').forEach(t => {
                    t.classList.toggle('active', t === tab);
                });

                // Show the matching panel, hide the other
                videoSection.querySelectorAll('.video-panel').forEach(panel => {
                    if (panel.dataset.panel === target) {
                        panel.classList.remove('hidden');
                    } else {
                        panel.classList.add('hidden');
                    }
                });
            });
        });
    }

    /**
     * Render a Manim animation for the given placement.
     * @param {HTMLElement} questionElement
     * @param {'question'|'explanation'} placement
     */
    async handleRender(questionElement, placement) {
        const panel = questionElement.querySelector(`.video-panel[data-panel="${placement}"]`);
        if (!panel) {
            logger.error(`ManimEditor: panel not found for placement "${placement}"`);
            return;
        }

        const textarea = panel.querySelector(`.${placement}-manim-code`);
        if (!textarea) {
            logger.error(`ManimEditor: textarea .${placement}-manim-code not found`);
            return;
        }

        const code = textarea.value.trim();
        if (!code) {
            const statusEl = panel.querySelector('.render-status');
            if (statusEl) {
                statusEl.textContent = getTranslation('manim_enter_code_first');
                statusEl.className = 'render-status error';
            }
            return;
        }

        const statusEl = panel.querySelector('.render-status');
        const renderBtn = panel.querySelector('.render-manim-btn');

        if (statusEl) {
            statusEl.textContent = getTranslation('manim_rendering');
            statusEl.className = 'render-status rendering';
        }
        if (renderBtn) {
            renderBtn.disabled = true;
        }

        try {
            const response = await fetch(APIHelper.getApiUrl('api/manim/render'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, quality: 'low' })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Server error ${response.status}`);
            }

            const result = await response.json();

            const videoEl = panel.querySelector(`.${placement}-video`);
            if (videoEl) {
                videoEl.src = imagePathResolver.toDisplayPath(result.videoPath);
                videoEl.dataset.videoUrl = result.videoPath;
            }

            const preview = panel.querySelector('.video-preview');
            if (preview) {
                preview.classList.remove('hidden');
            }

            if (statusEl) {
                statusEl.textContent = getTranslation('manim_rendered_successfully');
                statusEl.className = 'render-status success';
            }

            logger.info(`ManimEditor: render complete for placement "${placement}"`);
        } catch (err) {
            logger.error('ManimEditor: render failed', err);
            if (statusEl) {
                statusEl.textContent = `${getTranslation('manim_render_failed')}: ${err.message}`;
                statusEl.className = 'render-status error';
            }
        } finally {
            if (renderBtn) {
                renderBtn.disabled = false;
            }
        }
    }

    /**
     * Remove the rendered video for the given placement.
     * The Manim code textarea is preserved so the user can re-render.
     * @param {HTMLElement} questionElement
     * @param {'question'|'explanation'} placement
     */
    handleRemoveVideo(questionElement, placement) {
        const panel = questionElement.querySelector(`.video-panel[data-panel="${placement}"]`);
        if (!panel) {
            return;
        }

        const videoEl = panel.querySelector(`.${placement}-video`);
        if (videoEl) {
            videoEl.src = '';
            delete videoEl.dataset.videoUrl;
        }

        const preview = panel.querySelector('.video-preview');
        if (preview) {
            preview.classList.add('hidden');
        }

        logger.debug(`ManimEditor: video removed for placement "${placement}"`);
    }

    // -------------------------------------------------------------------------
    // AI-assisted code generation
    // -------------------------------------------------------------------------

    /**
     * Initialise AI generation controls for a single video panel.
     * @param {HTMLElement} panel - A .video-panel element
     * @param {HTMLElement} questionElement - The parent .question-item
     */
    initAIGeneration(panel, questionElement) {
        const placement = panel.dataset.panel; // 'question' or 'explanation'

        // Generate button
        const generateBtn = panel.querySelector('.generate-manim-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.handleAIGenerate(panel, questionElement, placement));
        }

        // Regenerate button (same handler)
        const regenerateBtn = panel.querySelector('.regenerate-manim-btn');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', () => this.handleAIGenerate(panel, questionElement, placement));
        }

        // Config toggle
        const configToggle = panel.querySelector('.manim-ai-config-toggle');
        const configPanel = panel.querySelector('.manim-ai-config');
        if (configToggle && configPanel) {
            configToggle.addEventListener('click', () => {
                configPanel.classList.toggle('hidden');
                if (!configPanel.classList.contains('hidden')) {
                    this.updateAIConfigUI(panel);
                }
            });
        }

        // Provider change
        const providerSelect = panel.querySelector('.manim-ai-provider-select');
        if (providerSelect) {
            providerSelect.value = manimAIGenerator.getProvider();
            providerSelect.addEventListener('change', () => {
                manimAIGenerator.setProvider(providerSelect.value);
                this.updateAIConfigUI(panel);
            });
        }

        // Model change
        const modelSelect = panel.querySelector('.manim-ai-model-select');
        if (modelSelect) {
            modelSelect.addEventListener('change', () => {
                manimAIGenerator.setModel(modelSelect.value);
            });
        }
    }

    /**
     * Handle the "Generate with AI" / "Regenerate" button click.
     * @param {HTMLElement} panel
     * @param {HTMLElement} questionElement
     * @param {'question'|'explanation'} placement
     */
    async handleAIGenerate(panel, questionElement, placement) {
        const input = panel.querySelector('.manim-ai-input');
        const description = input?.value?.trim();

        if (!description) {
            this.setAIStatus(panel, 'error', getTranslation('manim_ai_enter_description'));
            return;
        }

        const generateBtn = panel.querySelector('.generate-manim-btn');
        const regenerateBtn = panel.querySelector('.regenerate-manim-btn');

        // Gather question context
        const questionText = questionElement.querySelector('.question-text')?.value || '';
        const questionType = questionElement.querySelector('.question-type')?.value || 'multiple-choice';
        const options = Array.from(questionElement.querySelectorAll('.multiple-choice-options .option'))
            .map(o => o.value).filter(Boolean);
        const correctSelect = questionElement.querySelector('.multiple-choice-options .correct-answer');
        const correctAnswer = correctSelect ? options[parseInt(correctSelect.value, 10)] || '' : '';

        // Disable buttons, show status
        if (generateBtn) generateBtn.disabled = true;
        if (regenerateBtn) regenerateBtn.disabled = true;
        this.setAIStatus(panel, 'generating', getTranslation('manim_ai_generating'));

        try {
            const code = await manimAIGenerator.generateCode(description, {
                questionText,
                questionType,
                options,
                correctAnswer,
                placement
            });

            // Populate the code textarea
            const textarea = panel.querySelector(`.${placement}-manim-code`);
            if (textarea) {
                textarea.value = code;
            }

            // Show regenerate, update status
            if (regenerateBtn) regenerateBtn.classList.remove('hidden');
            this.setAIStatus(panel, 'success', getTranslation('manim_ai_generated'));
        } catch (err) {
            logger.error('ManimEditor: AI generation failed', err);
            this.setAIStatus(panel, 'error', `${getTranslation('manim_ai_failed')}: ${err.message}`);
        } finally {
            if (generateBtn) generateBtn.disabled = false;
            if (regenerateBtn) regenerateBtn.disabled = false;
        }
    }

    /**
     * Update the AI config UI (model dropdown, API key hint) for the current provider.
     * @param {HTMLElement} panel
     */
    async updateAIConfigUI(panel) {
        const provider = manimAIGenerator.getProvider();
        const modelSelect = panel.querySelector('.manim-ai-model-select');
        const keyRow = panel.querySelector('.manim-ai-key-row');

        // Show/hide API key hint + check if key is stored (client OR server)
        if (keyRow) {
            if (manimAIGenerator.requiresApiKey(provider)) {
                keyRow.classList.remove('hidden');
                const hintEl = keyRow.querySelector('.manim-ai-key-hint');
                if (hintEl) {
                    let hasKey = await manimAIGenerator.hasApiKey(provider);

                    // Also check if server has the key configured via env var
                    if (!hasKey) {
                        try {
                            if (!this._serverAIConfig) {
                                const resp = await fetch(APIHelper.getApiUrl('api/ai/config'));
                                if (resp.ok) this._serverAIConfig = await resp.json();
                            }
                            const cfg = this._serverAIConfig;
                            if (cfg) {
                                if (provider === 'claude' && cfg.claudeKeyConfigured) hasKey = true;
                                if (provider === 'gemini' && cfg.geminiKeyConfigured) hasKey = true;
                            }
                        } catch (_) { /* ignore — indicator just stays ✘ */ }
                    }

                    hintEl.textContent = hasKey
                        ? `\u2714 ${getTranslation('manim_ai_key_shared')}`
                        : `\u2718 ${getTranslation('manim_ai_key_shared')}`;
                    hintEl.style.color = hasKey ? 'var(--color-accent, #10b981)' : 'var(--color-error, #ef4444)';
                }
            } else {
                keyRow.classList.add('hidden');
            }
        }

        // Populate model dropdown
        if (modelSelect) {
            modelSelect.innerHTML = '';
            const models = await manimAIGenerator.getModelsForProvider(provider);
            const currentModel = manimAIGenerator.getModel();

            if (models.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = provider === 'ollama' ? 'No models found' : 'Loading...';
                modelSelect.appendChild(opt);
            } else {
                models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.name;
                    if (m.id === currentModel) opt.selected = true;
                    modelSelect.appendChild(opt);
                });
            }
        }
    }

    /**
     * Set AI generation status message.
     * @param {HTMLElement} panel
     * @param {'generating'|'success'|'error'} type
     * @param {string} message
     */
    setAIStatus(panel, type, message) {
        const statusEl = panel.querySelector('.manim-ai-status');
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.className = `manim-ai-status ${type}`;
        statusEl.classList.remove('hidden');
    }

    // -------------------------------------------------------------------------
    // Tutorial
    // -------------------------------------------------------------------------

    /**
     * Open the Manim tutorial modal.
     */
    openTutorial() {
        const modal = document.getElementById('manim-tutorial-modal');
        if (!modal) {
            logger.warn('ManimEditor: tutorial modal not found');
            return;
        }

        openModal(modal);

        // Only bind handlers once
        if (!this._tutorialBound) {
            this._tutorialBound = true;

            const close = () => closeModal(modal);

            document.getElementById('close-manim-tutorial')?.addEventListener('click', close);
            document.getElementById('close-manim-tutorial-btn')?.addEventListener('click', close);

            createModalBindings(modal, close);

            // Copy-to-clipboard on code examples
            modal.querySelectorAll('.tutorial-code').forEach(pre => {
                pre.addEventListener('click', () => {
                    const code = pre.textContent;
                    navigator.clipboard.writeText(code).then(() => {
                        const original = pre.dataset.originalLabel || '';
                        pre.dataset.originalLabel = original;
                        pre.classList.add('copied');
                        setTimeout(() => pre.classList.remove('copied'), 1500);
                    }).catch(err => {
                        logger.warn('ManimEditor: clipboard write failed', err);
                    });
                });
            });
        }
    }

    // -------------------------------------------------------------------------
    // Editor mode toggle (basic / advanced)
    // -------------------------------------------------------------------------

    /**
     * Wire up the editor mode pill toggle. Called once after status check.
     */
    initModeToggle() {
        const toggle = document.getElementById('editor-mode-toggle');
        const btn = document.getElementById('editor-mode-btn');
        if (!toggle || !btn) return;

        // Only show the toggle when manim is actually available
        if (!this.manimAvailable) {
            toggle.classList.add('hidden');
            return;
        }
        toggle.classList.remove('hidden');

        const mode = window.game?.settingsManager?.getEditorMode?.() || 'basic';
        this._applyModeUI(mode);

        btn.addEventListener('click', () => {
            const current = window.game?.settingsManager?.getEditorMode?.() || 'basic';
            const next = current === 'basic' ? 'advanced' : 'basic';
            window.game?.settingsManager?.setEditorMode?.(next);
            this._applyModeUI(next);
        });
    }

    /**
     * Update the pill button appearance and body attribute for the given mode.
     * @param {'basic'|'advanced'} mode
     */
    _applyModeUI(mode) {
        document.body.setAttribute('data-editor-mode', mode);

        const btn = document.getElementById('editor-mode-btn');
        const label = document.getElementById('editor-mode-label');
        if (btn) btn.classList.toggle('advanced', mode === 'advanced');
        if (label) {
            const key = mode === 'advanced' ? 'editor_mode_advanced' : 'editor_mode_basic';
            label.setAttribute('data-translate', key);
            label.textContent = getTranslation(key);
        }
    }

    /**
     * Collect video-related fields from the question element for quiz save.
     * Only fields that have values are included.
     * @param {HTMLElement} questionElement
     * @returns {{video?: string, videoManimCode?: string, explanationVideo?: string, explanationVideoManimCode?: string}}
     */
    collectVideoData(questionElement) {
        const data = {};

        const questionVideoEl = questionElement.querySelector('.question-video');
        if (questionVideoEl?.dataset.videoUrl) {
            data.video = imagePathResolver.toStoragePath(questionVideoEl.dataset.videoUrl);
        }

        const questionCodeEl = questionElement.querySelector('.question-manim-code');
        const questionCode = questionCodeEl?.value?.trim();
        if (questionCode) {
            data.videoManimCode = questionCode;
        }

        const explanationVideoEl = questionElement.querySelector('.explanation-video');
        if (explanationVideoEl?.dataset.videoUrl) {
            data.explanationVideo = imagePathResolver.toStoragePath(explanationVideoEl.dataset.videoUrl);
        }

        const explanationCodeEl = questionElement.querySelector('.explanation-manim-code');
        const explanationCode = explanationCodeEl?.value?.trim();
        if (explanationCode) {
            data.explanationVideoManimCode = explanationCode;
        }

        return data;
    }

    /**
     * Populate the editor from saved quiz data, then initialise handlers.
     * @param {HTMLElement} questionElement
     * @param {object} questionData
     */
    async populateVideoData(questionElement, questionData) {
        if (questionData.video) {
            const videoEl = questionElement.querySelector('.question-video');
            if (videoEl) {
                videoEl.src = imagePathResolver.toDisplayPath(questionData.video);
                videoEl.dataset.videoUrl = questionData.video;
            }
            const preview = questionElement.querySelector('.video-panel[data-panel="question"] .video-preview');
            if (preview) {
                preview.classList.remove('hidden');
            }
        }

        if (questionData.videoManimCode) {
            const textarea = questionElement.querySelector('.question-manim-code');
            if (textarea) {
                textarea.value = questionData.videoManimCode;
            }
        }

        if (questionData.explanationVideo) {
            const videoEl = questionElement.querySelector('.explanation-video');
            if (videoEl) {
                videoEl.src = imagePathResolver.toDisplayPath(questionData.explanationVideo);
                videoEl.dataset.videoUrl = questionData.explanationVideo;
            }
            const preview = questionElement.querySelector('.video-panel[data-panel="explanation"] .video-preview');
            if (preview) {
                preview.classList.remove('hidden');
            }
        }

        if (questionData.explanationVideoManimCode) {
            const textarea = questionElement.querySelector('.explanation-manim-code');
            if (textarea) {
                textarea.value = questionData.explanationVideoManimCode;
            }
        }

        await this.initVideoSection(questionElement);
    }
}

export const manimEditor = new ManimEditor();

// Eagerly start status check so it's ready by the time initVideoSection is called
manimEditor.checkManimStatus();
