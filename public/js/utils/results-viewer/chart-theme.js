/**
 * Chart Theme - Resolved colors for the analytics Chart.js visualizations
 *
 * Two jobs, kept separate:
 *  - chart *chrome* (tick text, gridlines, surface) follows the app's design
 *    tokens, so charts stay legible when the theme flips;
 *  - chart *data* colors come from the fixed pair below.
 *
 * The data palette is deliberately small. The previous four-step
 * green/amber/orange/red ramp double-encoded bar length as hue and its middle
 * two steps were indistinguishable — validated ΔE 4.1 (normal vision), 0.1
 * (deuteranopia), far under the ≥8 threshold. One series colour plus one
 * emphasis colour for questions flagged for review passes every check in both
 * modes (light #2563eb/#b91c1c, dark #3b82f6/#ef4444).
 *
 * Blue, not the brand green: green already means "correct answer" everywhere
 * else in this app, and a green bar that merely means "a question" would read
 * as a verdict.
 */

const PALETTE = {
    light: {
        series: '#2563eb',
        emphasis: '#b91c1c',
        // Fixed order, assigned by position and never cycled. Six slots is the
        // ceiling the comparison chart needs (5 questions + the average).
        categorical: ['#1d4ed8', '#b91c1c', '#047857', '#7c3aed', '#b45309', '#0891b2']
    },
    dark: {
        series: '#3b82f6',
        emphasis: '#ef4444',
        categorical: ['#3b82f6', '#ef4444', '#059669', '#a855f7', '#d97706', '#0891b2']
    }
};

/**
 * Read the active theme name.
 * @returns {'light'|'dark'} Current theme
 */
function currentMode() {
    const theme = document.documentElement?.dataset?.theme;
    return theme === 'dark' ? 'dark' : 'light';
}

/**
 * Get the chart colors for the current theme.
 * Call this at chart-creation time (not at module load) so a theme switch
 * between two openings of the analytics modal is picked up. Chrome colours come
 * from the design tokens; where those cannot be read (no CSS attached, as in a
 * unit-test DOM) the value is empty and Chart.js falls back to its own defaults.
 * @returns {Object} { series, emphasis, categorical, text, muted, grid }
 */
export function getChartTheme() {
    const mode = currentMode();
    const root = document.documentElement;
    const style = typeof getComputedStyle === 'function' && root ? getComputedStyle(root) : null;
    const token = (name) => style?.getPropertyValue(name).trim() || undefined;

    return {
        series: PALETTE[mode].series,
        emphasis: PALETTE[mode].emphasis,
        categorical: PALETTE[mode].categorical,
        text: token('--text-primary'),
        muted: token('--text-secondary'),
        grid: token('--border-color')
    };
}

/**
 * Shared Chart.js options that make chart chrome follow the theme.
 * @param {Object} theme - Result of getChartTheme()
 * @param {string} titleText - Chart title
 * @returns {Object} Partial Chart.js options
 */
export function baseChartOptions(theme, titleText) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: Boolean(titleText),
                text: titleText,
                color: theme.text
            },
            legend: {
                labels: { color: theme.text }
            }
        }
    };
}

/**
 * Theme-aware scale defaults (hairline grid, token-coloured ticks).
 * @param {Object} theme - Result of getChartTheme()
 * @param {Object} [extra] - Additional scale options merged in
 * @returns {Object} Chart.js scale options
 */
export function themedScale(theme, extra = {}) {
    return {
        ...extra,
        grid: { color: theme.grid, ...(extra.grid || {}) },
        border: { color: theme.grid },
        ticks: { color: theme.muted, ...(extra.ticks || {}) },
        title: extra.title ? { ...extra.title, color: theme.muted } : undefined
    };
}
