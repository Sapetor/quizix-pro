/**
 * Quiz settings persistence
 *
 * Serialization of host-screen game settings to/from the DOM. Extracted from
 * quiz-manager.js as a move-and-delegate refactor: QuizManager keeps thin
 * `collectSettings`/`restoreSettings` methods that call these functions.
 */

import { dom } from '../../utils/dom.js';
import { logger } from '../../core/config.js';
import { readScoringConfigFromDOM } from '../../utils/scoring-config.js';

/**
 * Collect game settings from host screen UI elements
 */
export function collectSettings() {
    return {
        randomizeQuestions: dom.get('randomize-questions')?.checked ?? false,
        randomizeAnswers: dom.get('randomize-answers')?.checked ?? false,
        useGlobalTime: dom.get('same-time-all')?.checked ?? false,
        globalTimeLimit: parseInt(dom.get('default-time')?.value) || 20,
        manualAdvance: dom.get('manual-advancement')?.checked ?? false,
        consensusMode: dom.get('consensus-mode')?.checked ?? false,
        consensusThreshold: dom.get('consensus-threshold')?.value ?? '66',
        discussionTime: parseInt(dom.get('discussion-time')?.value) || 30,
        allowChat: dom.get('allow-chat')?.checked ?? false,
        // Saved to the quiz file: keep the threshold in raw seconds so it
        // round-trips with the seconds-based UI input (see restoreSettings).
        scoringConfig: readScoringConfigFromDOM(dom, { thresholdToMs: false })
    };
}

/**
 * Restore saved game settings to host screen UI elements
 */
export function restoreSettings(settings) {
    if (!settings) return;

    const setChecked = (id, val) => { const el = dom.get(id); if (el) el.checked = !!val; };
    const setValue = (id, val) => { const el = dom.get(id); if (el) el.value = val; };

    setChecked('randomize-questions', settings.randomizeQuestions);
    setChecked('randomize-answers', settings.randomizeAnswers);
    setChecked('same-time-all', settings.useGlobalTime);
    setValue('default-time', settings.globalTimeLimit ?? 20);
    setChecked('manual-advancement', settings.manualAdvance);
    setChecked('consensus-mode', settings.consensusMode);
    setValue('consensus-threshold', settings.consensusThreshold ?? '66');
    setValue('discussion-time', settings.discussionTime ?? 30);
    setChecked('allow-chat', settings.allowChat);

    // Restore scoring config (backward-compatible: missing = defaults)
    const sc = settings.scoringConfig;
    if (sc) {
        setChecked('time-bonus-enabled', sc.timeBonusEnabled ?? true);
        setValue('time-bonus-threshold', sc.timeBonusThreshold ?? 0);
        const dm = sc.difficultyMultipliers;
        if (dm) {
            setValue('easy-multiplier', dm.easy ?? 1);
            setValue('medium-multiplier', dm.medium ?? 2);
            setValue('hard-multiplier', dm.hard ?? 3);
        }
    }

    logger.debug('Game settings restored from quiz file');
}
