/**
 * @jest-environment jsdom
 *
 * Tests for APIHelper URL construction (public/js/utils/api-helper.js).
 *
 * The K8s path-based routing gotcha: all API URLs must be built relative to the
 * <base href> tag, never as absolute "/api/..." paths, or deployments served
 * under a sub-path (e.g. /quizix/) break. These tests pin that behaviour.
 *
 * jsdom serves window.location as http://localhost/ by default; only the base
 * path varies across the cases below (driven by the <base> tag).
 */

import { APIHelper } from '../../public/js/utils/api-helper.js';

function setBaseHref(href) {
    document.querySelectorAll('base').forEach(b => b.remove());
    if (href !== null) {
        const base = document.createElement('base');
        base.setAttribute('href', href);
        document.head.appendChild(base);
    }
}

describe('APIHelper.getBaseUrl', () => {
    afterEach(() => setBaseHref(null));

    test('defaults to root "/" when no <base> tag is present', () => {
        setBaseHref(null);
        expect(APIHelper.getBaseUrl()).toBe('http://localhost/');
    });

    test('honours a sub-path <base href> (K8s path routing)', () => {
        setBaseHref('/quizix/');
        expect(APIHelper.getBaseUrl()).toBe('http://localhost/quizix/');
    });
});

describe('APIHelper.getApiUrl', () => {
    afterEach(() => setBaseHref(null));

    describe('root deployment (no base path)', () => {
        beforeEach(() => setBaseHref(null));

        test('builds an absolute URL from a bare endpoint', () => {
            expect(APIHelper.getApiUrl('api/quiz/file.json'))
                .toBe('http://localhost/api/quiz/file.json');
        });

        test('strips a leading slash to avoid a double slash', () => {
            expect(APIHelper.getApiUrl('/api/quiz/file.json'))
                .toBe('http://localhost/api/quiz/file.json');
        });
    });

    describe('/quizix/ sub-path deployment (K8s)', () => {
        beforeEach(() => setBaseHref('/quizix/'));

        test('prefixes the endpoint with the base path', () => {
            expect(APIHelper.getApiUrl('api/quiz/file.json'))
                .toBe('http://localhost/quizix/api/quiz/file.json');
        });

        test('leading slash on the endpoint does not escape the sub-path', () => {
            expect(APIHelper.getApiUrl('/api/quiz/file.json'))
                .toBe('http://localhost/quizix/api/quiz/file.json');
        });

        test('never produces a double slash between base and endpoint', () => {
            expect(APIHelper.getApiUrl('/api/x')).not.toContain('//api');
            expect(APIHelper.getApiUrl('api/x')).not.toContain('quizix//');
        });
    });

    test('base path without a trailing slash still joins cleanly', () => {
        setBaseHref('/quizix');
        // base "/quizix" (no trailing slash) + endpoint -> single joining slash
        expect(APIHelper.getApiUrl('api/x')).toBe('http://localhost/quizix/api/x');
    });
});
