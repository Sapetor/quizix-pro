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

// Keys allowed to differ from English, per locale. Keep this as tight as
// possible; every entry is documented drift, not a license to diverge.
// Shape: { localeCode: Set(['key']) }.
// Currently empty: all locales are at full parity with English. The landing-page
// copy and the four lobby strings (students_connected, in_the_room, waiting, pin)
// that once diverged have been translated into every locale, so the test now
// enforces true parity for all of them. If a key is ever legitimately
// locale-specific, add it here with a comment explaining why. Do NOT add NEW
// keys here to make a failing test pass — a fresh divergence means a key was
// added to some files but not others, which is the bug this test exists to catch.
const KNOWN_LOCALE_SPECIFIC = {};

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
