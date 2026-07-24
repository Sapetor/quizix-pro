/**
 * Landing — #lp-ai section.
 *
 * Typesets the generated-question LaTeX with the same MathJax instance the game
 * uses, which is the whole point of the section: the output is real LaTeX, not a
 * picture of it.
 *
 * Why this file has to exist: base.css hides `.tex2jax_process` (opacity 0) until
 * something adds `MathJax_Processed`, and only the app adds that class — MathJax's
 * own startup typeset does not. Static LaTeX in index.html would therefore stay
 * invisible forever. simpleMathJaxService.render() adds the class on BOTH paths
 * (typeset succeeded, or MathJax unavailable), so a dead CDN degrades to visible
 * raw LaTeX rather than a blank card. waitForMathJax() is the 4s watchdog.
 */
import { simpleMathJaxService } from './utils/simple-mathjax-service.js';

const MATHJAX_WAIT_MS = 4000;

async function typesetAiSection() {
    const section = document.getElementById('lp-ai');
    if (!section) return;

    await simpleMathJaxService.waitForMathJax(MATHJAX_WAIT_MS);
    // Pass the section, not the individual spans: render() only marks a node's
    // descendants when the node itself still needs typesetting.
    await simpleMathJaxService.render([section]);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', typesetAiSection);
} else {
    typesetAiSection();
}
