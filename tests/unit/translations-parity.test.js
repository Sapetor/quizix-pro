/**
 * @jest-environment node
 *
 * Translation key-set parity across every locale in
 * public/js/utils/translations/. English (en) is the reference set; every other
 * locale must define exactly the same keys — no missing keys (UI falls back to
 * the raw key or another language) and no orphan keys (dead translations).
 *
 * Locale modules are plain `export default {...}` objects, so this diff is cheap
 * and catches real drift the moment a key is added to one file but not the rest.
 *
 * If a key is ever legitimately locale-specific, add it to KNOWN_LOCALE_SPECIFIC
 * with a comment explaining why, so the drift is recorded rather than hidden.
 * (Static imports are used deliberately: Jest/Babel transforms them, whereas a
 * dynamic import() would need --experimental-vm-modules.)
 */

import en from '../../public/js/utils/translations/en.js';
import de from '../../public/js/utils/translations/de.js';
import es from '../../public/js/utils/translations/es.js';
import fr from '../../public/js/utils/translations/fr.js';
import it from '../../public/js/utils/translations/it.js';
import ja from '../../public/js/utils/translations/ja.js';
import pl from '../../public/js/utils/translations/pl.js';
import pt from '../../public/js/utils/translations/pt.js';
import zh from '../../public/js/utils/translations/zh.js';

// TODO(i18n drift): as of this writing, en and es are the complete key sets
// (1348 keys). The other seven locales are each missing the SAME 106 keys —
// the landing-page copy plus four lobby strings (students_connected,
// in_the_room, waiting, pin) that were added to en/es but never translated.
// This is real, recorded drift, not intentional locale-specific behaviour.
// When a locale gains these translations, delete them from this list; the test
// then enforces true parity for that locale. Do NOT add NEW keys here to make a
// failing test pass — a fresh divergence means a key was added to some files
// but not others, which is the bug this test exists to catch.
const UNTRANSLATED_LANDING_AND_LOBBY_KEYS = [
    'students_connected', 'in_the_room', 'waiting', 'pin',
    'landing_hero_eyebrow', 'landing_hero_title_lead', 'landing_hero_title_tail',
    'landing_hero_lede', 'landing_cta_create_quiz', 'landing_cta_quick_start',
    'landing_cta_note', 'landing_stat_languages', 'landing_stat_qtypes',
    'landing_stat_players', 'landing_stat_local', 'landing_joiners_suffix',
    'landing_pin_title_em', 'landing_pin_title_tail', 'landing_pin_live',
    'landing_pin_name_placeholder', 'landing_pin_join', 'landing_pin_or',
    'landing_pin_qr_title', 'landing_pin_qr_desc', 'landing_pin_qr_none_title',
    'landing_pin_qr_none_desc', 'landing_pin_qr_live_desc', 'landing_ticker_players',
    'landing_howto_kicker', 'landing_howto_title_lead', 'landing_howto_title_em',
    'landing_howto_title_tail', 'landing_howto_aside', 'landing_step1_title',
    'landing_step1_body', 'landing_step2_title', 'landing_step2_body',
    'landing_step3_title', 'landing_step3_body', 'landing_step4_title',
    'landing_step4_body', 'landing_qpreview_question', 'landing_qpreview_qtext',
    'landing_qpreview_no_solution', 'landing_qpreview_responses',
    'landing_qpreview_live_distribution', 'landing_features_kicker',
    'landing_features_title_lead', 'landing_features_title_em',
    'landing_features_aside', 'landing_feature1_title', 'landing_feature1_body',
    'landing_feature2_title', 'landing_feature2_body', 'landing_feature3_title',
    'landing_feature3_body', 'landing_feature4_title', 'landing_feature4_body',
    'landing_feature5_title', 'landing_feature5_body', 'landing_feature6_title',
    'landing_feature6_body', 'landing_qtypes_kicker', 'landing_qtypes_title',
    'landing_qtypes_aside', 'landing_qtype1_title', 'landing_qtype1_body',
    'landing_qtype2_title', 'landing_qtype2_body', 'landing_qtype3_title',
    'landing_qtype3_body', 'landing_qtype4_title', 'landing_qtype4_body',
    'landing_qtype4_tolerance', 'landing_qtype5_title', 'landing_qtype5_body',
    'landing_ai_eyebrow', 'landing_ai_title_1', 'landing_ai_title_em',
    'landing_ai_title_2', 'landing_ai_title_3', 'landing_ai_body',
    'landing_ai_prompt_label', 'landing_ai_prompt_text', 'landing_ai_output_label',
    'landing_ai_output_text', 'landing_ai_output_equals',
    'landing_cta_block_title_lead', 'landing_cta_block_title_em',
    'landing_cta_block_body', 'landing_cta_block_primary', 'landing_cta_block_github',
    'landing_footer_about_title', 'landing_footer_about_body',
    'landing_footer_product_title', 'landing_footer_host', 'landing_footer_join',
    'landing_footer_ai', 'landing_footer_qtypes', 'landing_footer_resources_title',
    'landing_footer_docs', 'landing_footer_issues', 'landing_footer_features',
    'landing_footer_howto', 'landing_footer_connect_title', 'landing_footer_license'
];

// Keys allowed to differ from English, per locale. Keep this as tight as
// possible; every entry is documented drift, not a license to diverge.
// Shape: { localeCode: Set(['key']) }.
const KNOWN_LOCALE_SPECIFIC = {
    de: new Set(UNTRANSLATED_LANDING_AND_LOBBY_KEYS),
    fr: new Set(UNTRANSLATED_LANDING_AND_LOBBY_KEYS),
    it: new Set(UNTRANSLATED_LANDING_AND_LOBBY_KEYS),
    ja: new Set(UNTRANSLATED_LANDING_AND_LOBBY_KEYS),
    pl: new Set(UNTRANSLATED_LANDING_AND_LOBBY_KEYS),
    pt: new Set(UNTRANSLATED_LANDING_AND_LOBBY_KEYS),
    zh: new Set(UNTRANSLATED_LANDING_AND_LOBBY_KEYS)
};

const LOCALES = { de, es, fr, it, ja, pl, pt, zh };
const enKeys = new Set(Object.keys(en));

describe('translation key-set parity vs English', () => {
    test('English has a non-trivial key set (sanity)', () => {
        expect(enKeys.size).toBeGreaterThan(50);
    });

    test.each(Object.keys(LOCALES))('%s matches the English key set', (code) => {
        const keys = new Set(Object.keys(LOCALES[code]));
        const whitelist = KNOWN_LOCALE_SPECIFIC[code] || new Set();

        const missing = [...enKeys].filter(k => !keys.has(k) && !whitelist.has(k));
        const extra = [...keys].filter(k => !enKeys.has(k) && !whitelist.has(k));

        expect({ locale: code, missing, extra })
            .toEqual({ locale: code, missing: [], extra: [] });
    });
});
