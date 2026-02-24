import { logger } from '../core/config.js';
import { APIHelper } from '../utils/api-helper.js';
import { imagePathResolver } from '../utils/image-path-resolver.js';
import { openModal, closeModal, createModalBindings } from '../utils/modal-utils.js';
import { getTranslation } from '../utils/translation-manager.js';

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
