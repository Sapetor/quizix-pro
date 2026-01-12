/**
 * Results Filter Manager - Filtering, sorting, and utility functions for results
 * Handles search filtering, sorting, date formatting, and score calculations
 */

/**
 * Calculate average score for a result based on correct answer percentage
 * Uses correct answers instead of raw scores to avoid inflation from
 * difficulty multipliers and time bonuses
 * @param {Object} result - Result data with player results
 * @returns {number} Average score percentage (0-100)
 */
export function calculateAverageScore(result) {
    if (!result.results || result.results.length === 0) {
        return 0;
    }

    let totalCorrect = 0;
    let totalQuestions = 0;

    result.results.forEach(player => {
        const answers = player.answers || [];
        const playerQuestions = answers.length;
        const playerCorrect = answers.filter(a => a?.isCorrect).length;
        totalCorrect += playerCorrect;
        totalQuestions += playerQuestions;
    });

    return totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
}

/**
 * Format a date string for display
 * @param {string} dateString - ISO date string or date-parseable string
 * @returns {string} Formatted date and time string
 */
export function formatDate(dateString) {
    if (!dateString) {
        return 'Unknown';
    }

    try {
        const date = new Date(dateString);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${dateStr} ${timeStr}`;
    } catch (error) {
        return dateString;
    }
}

/**
 * Format a timestamp for time display only
 * @param {string|number} completedAt - Timestamp value
 * @returns {string} Formatted time string or 'N/A'
 */
export function formatTime(completedAt) {
    try {
        const date = new Date(completedAt);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        return 'N/A';
    }
}

/**
 * Get CSS class for score styling based on percentage
 * @param {number} percentage - Score percentage (0-100)
 * @returns {string} CSS class name
 */
export function getScoreClass(percentage) {
    if (percentage >= 90) return 'score-excellent';
    if (percentage >= 75) return 'score-good';
    if (percentage >= 60) return 'score-average';
    return 'score-poor';
}

/**
 * Get CSS class for success rate styling in analytics
 * @param {number} rate - Success rate percentage (0-100)
 * @returns {string} CSS class name
 */
export function getSuccessRateClass(rate) {
    if (rate >= 80) return 'excellent';
    if (rate >= 60) return 'good';
    if (rate >= 40) return 'fair';
    return 'poor';
}

/**
 * Filter results by search term
 * @param {Array} results - Array of result objects
 * @param {string} searchTerm - Search term to filter by
 * @returns {Array} Filtered results
 */
export function filterBySearch(results, searchTerm) {
    if (!searchTerm) {
        return results;
    }

    const term = searchTerm.toLowerCase();
    return results.filter(result =>
        result.quizTitle?.toLowerCase().includes(term) ||
        result.gamePin?.toString().includes(term)
    );
}

/**
 * Sort results by specified criteria
 * @param {Array} results - Array of result objects
 * @param {string} sortBy - Sort criteria
 * @returns {Array} Sorted results (mutates array)
 */
export function sortResults(results, sortBy) {
    switch (sortBy) {
        case 'date-desc':
            return results.sort((a, b) => new Date(b.saved || 0) - new Date(a.saved || 0));

        case 'date-asc':
            return results.sort((a, b) => new Date(a.saved || 0) - new Date(b.saved || 0));

        case 'title-asc':
            return results.sort((a, b) => (a.quizTitle || '').localeCompare(b.quizTitle || ''));

        case 'participants-desc':
            return results.sort((a, b) => {
                const aParticipants = a.results?.length || 0;
                const bParticipants = b.results?.length || 0;
                return bParticipants - aParticipants;
            });

        default:
            return results;
    }
}

/**
 * Apply both filter and sort to results
 * @param {Array} results - Array of result objects
 * @param {string} searchTerm - Search term to filter by
 * @param {string} sortBy - Sort criteria
 * @returns {Array} Filtered and sorted results
 */
export function filterAndSortResults(results, searchTerm, sortBy) {
    const filtered = filterBySearch([...results], searchTerm);
    return sortResults(filtered, sortBy);
}

export default {
    calculateAverageScore,
    formatDate,
    formatTime,
    getScoreClass,
    getSuccessRateClass,
    filterBySearch,
    sortResults,
    filterAndSortResults
};
