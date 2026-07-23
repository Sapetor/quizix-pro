/**
 * Event Bindings
 *
 * Real addEventListener wiring for controls that previously used inline
 * HTML onclick/onchange attributes. Part of an INCREMENTAL effort to shrink
 * the window-global bridge layer in utils/globals.js: each entry delegates to
 * the same exported handler the inline attribute used, so behaviour is
 * unchanged while the matching `window.*` assignment can be removed.
 *
 * Only migrated controls live here. Handlers still reached from
 * dynamically-generated HTML strings (question-utils, results-viewer, etc.)
 * intentionally keep their window globals and their inline attributes.
 */

import { logger } from './config.js';
import { bindElement } from '../utils/dom.js';
import {
    returnToMainFromHeader,
    openQuizSettingsModal,
    closeQuizSettingsModal,
    goToPreviousQuestion,
    goToNextQuestion,
    togglePreviewMode,
    scrollToCurrentQuestion,
    updateGlobalTime,
    updateQuestionTypeFromPreview,
    toggleGlobalTimeModal,
    toggleConsensusModeModal
} from '../utils/globals.js';

// [elementId, eventType, handler]. Handler receives the DOM event.
export const EVENT_BINDINGS = [
    // Header / main menu
    ['header-brand', 'click', (e) => { e.preventDefault(); returnToMainFromHeader(); }],

    // Editor toolbar
    ['toolbar-settings', 'click', () => openQuizSettingsModal()],
    ['vtoolbar-settings-direct', 'click', () => openQuizSettingsModal()],
    ['prev-question-btn', 'click', () => goToPreviousQuestion()],
    ['next-question-btn', 'click', () => goToNextQuestion()],
    ['toggle-preview', 'click', () => togglePreviewMode()],
    ['scroll-to-question', 'click', () => scrollToCurrentQuestion()],
    ['global-time-limit', 'change', (e) => updateGlobalTime(e.target)],
    ['preview-question-type', 'change', (e) => updateQuestionTypeFromPreview(e.target)],

    // Quiz settings modal
    ['settings-modal-close-btn', 'click', () => closeQuizSettingsModal()],
    ['modal-use-global-time', 'change', () => toggleGlobalTimeModal()],
    ['modal-consensus-mode', 'change', () => toggleConsensusModeModal()]
];

/**
 * Attach all migrated event listeners. Safe to call once during app init.
 * Missing elements are skipped (logged at debug), mirroring the tolerant
 * behaviour inline handlers had when their target was absent.
 */
export function initEventBindings() {
    for (const [id, type, handler] of EVENT_BINDINGS) {
        if (!bindElement(id, type, handler)) {
            logger.debug(`event-bindings: #${id} not found, skipping`);
        }
    }
}
