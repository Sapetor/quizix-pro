/**
 * Results Manager Service
 * Centralized service for managing quiz results operations
 * Provides unified API for fetching, caching, exporting, and managing quiz results
 */

import { logger } from '../core/config.js';
import { APIHelper } from '../utils/api-helper.js';

export class ResultsManagerService {
    constructor() {
        this.resultsCache = new Map();
        this.lastFetchTime = null;
        this.cacheTimeout = 30000; // 30 seconds cache
        this.isLoading = false;
        this.listeners = new Set();

        logger.debug('🔧 ResultsManagerService initialized');
    }

    /**
     * Add listener for results updates
     */
    addListener(callback) {
        this.listeners.add(callback);
    }

    /**
     * Remove listener
     */
    removeListener(callback) {
        this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of updates
     */
    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                logger.error('Error notifying results listener:', error);
            }
        });
    }

    /**
     * Fetch with retry logic for handling temporary server issues
     */
    async fetchWithRetry(url, options = {}, maxRetries = 3, delay = 1000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.debug(`📊 Fetch attempt ${attempt}/${maxRetries} for ${url}`);
                const response = await fetch(url, options);

                if (response.ok) {
                    logger.debug(`📊 Fetch successful on attempt ${attempt}`);
                    return response;
                }

                if (response.status === 404 && attempt < maxRetries) {
                    logger.warn(`📊 404 error on attempt ${attempt}, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                return response;

            } catch (error) {
                logger.error(`📊 Fetch attempt ${attempt} failed:`, error);

                if (attempt === maxRetries) {
                    throw error;
                }

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Check if cache is valid
     */
    isCacheValid() {
        return this.lastFetchTime &&
               (Date.now() - this.lastFetchTime < this.cacheTimeout) &&
               this.resultsCache.size > 0;
    }

    /**
     * Fetch all results with caching
     */
    async fetchResults(forceRefresh = false) {
        if (!forceRefresh && this.isCacheValid()) {
            logger.debug('📊 Using cached results');
            return Array.from(this.resultsCache.values());
        }

        if (this.isLoading) {
            logger.debug('📊 Already loading results, waiting...');
            // Wait for current load to complete with timeout to prevent infinite loop
            const maxWaitTime = 30000; // 30 seconds max
            const startTime = Date.now();
            while (this.isLoading) {
                if (Date.now() - startTime > maxWaitTime) {
                    logger.warn('📊 Timeout waiting for results load, resetting state');
                    this.isLoading = false;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return Array.from(this.resultsCache.values());
        }

        this.isLoading = true;
        this.notifyListeners('loadingStart');

        try {
            logger.debug('📊 Fetching results from /api/results...');
            const response = await this.fetchWithRetry(APIHelper.getApiUrl('api/results'));

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch results: ${response.status} - ${errorText}`);
            }

            const results = await response.json();

            // Update cache
            this.resultsCache.clear();
            results.forEach(result => {
                this.resultsCache.set(result.filename, result);
            });

            this.lastFetchTime = Date.now();

            logger.debug(`📊 Fetched and cached ${results.length} results`);
            this.notifyListeners('resultsUpdated', results);

            return results;

        } catch (error) {
            logger.error('❌ Error fetching results:', error);
            this.notifyListeners('error', error);
            throw error;
        } finally {
            this.isLoading = false;
            this.notifyListeners('loadingEnd');
        }
    }

    /**
     * Get single result with detailed data
     */
    async getResultDetails(filename) {
        try {
            // Check cache first
            const cached = this.resultsCache.get(filename);
            if (cached && cached.results) {
                return cached;
            }

            logger.debug(`📊 Fetching detailed result for ${filename}`);
            const response = await this.fetchWithRetry(APIHelper.getApiUrl(`api/results/${filename}`));

            if (!response.ok) {
                throw new Error(`Failed to fetch result details: ${response.status}`);
            }

            const detailedResult = await response.json();
            detailedResult.filename = filename;

            // Update cache with detailed data
            this.resultsCache.set(filename, detailedResult);

            return detailedResult;

        } catch (error) {
            logger.error(`❌ Error fetching result details for ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Export result in specified format
     */
    async exportResult(filename, format = 'analytics', type = 'csv') {
        try {
            logger.debug(`📊 Exporting result ${filename} in ${format} format as ${type}`);

            let url;
            if (format === 'analytics') {
                // Current comprehensive analytics format
                url = APIHelper.getApiUrl(`api/results/${filename}/export/${type}`);
            } else {
                // Simple player-centric format
                url = APIHelper.getApiUrl(`api/results/${filename}/export/${type}?type=simple`);
            }

            const response = await this.fetchWithRetry(url);

            if (!response.ok) {
                throw new Error(`Failed to export result: ${response.status}`);
            }

            return response;

        } catch (error) {
            logger.error(`❌ Error exporting result ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Download result file
     */
    async downloadResult(filename, format = 'analytics', type = 'csv') {
        try {
            const response = await this.exportResult(filename, format, type);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            // Extract game PIN from filename for better naming
            const gamePin = filename.match(/results_(\d+)_/)?.[1] || 'unknown';
            const formatSuffix = format === 'analytics' ? '_analytics' : '_simple';
            const downloadFilename = `quiz_results_${gamePin}${formatSuffix}.${type}`;

            // Create download link
            const link = document.createElement('a');
            link.href = url;
            link.download = downloadFilename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Cleanup
            window.URL.revokeObjectURL(url);

            logger.debug(`📊 Result downloaded successfully as ${downloadFilename}`);
            this.notifyListeners('downloadComplete', { filename, format, type, downloadFilename });

            return downloadFilename;

        } catch (error) {
            logger.error(`❌ Error downloading result ${filename}:`, error);
            this.notifyListeners('error', error);
            throw error;
        }
    }

    /**
     * Delete result
     */
    async deleteResult(filename) {
        try {
            logger.debug(`📊 Deleting result: ${filename}`);

            // Include confirm=true parameter required by server for security
            const response = await this.fetchWithRetry(APIHelper.getApiUrl(`api/results/${filename}?confirm=true`), {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to delete result: ${response.status} - ${errorText}`);
            }

            // Remove from cache
            this.resultsCache.delete(filename);

            logger.debug(`📊 Result deleted successfully: ${filename}`);
            this.notifyListeners('resultDeleted', filename);

            return true;

        } catch (error) {
            logger.error(`❌ Error deleting result ${filename}:`, error);
            this.notifyListeners('error', error);
            throw error;
        }
    }

    /**
     * Get available export formats for a result
     */
    getAvailableFormats(result) {
        const formats = [];

        // Analytics format is always available if we have question data
        if (result.questions || (result.results && result.results[0]?.answers)) {
            formats.push({
                key: 'analytics',
                name: 'Analytics (Question-centric)',
                description: 'Comprehensive analytics with success rates, timing, and common mistakes'
            });
        }

        // Simple format is always available if we have player results
        if (result.results && result.results.length > 0) {
            formats.push({
                key: 'simple',
                name: 'Simple (Player-centric)',
                description: 'Basic player results with answers per question'
            });
        }

        return formats;
    }

    /**
     * Calculate summary statistics for results
     * Uses correct answer percentage (not raw scores) to avoid inflated percentages
     * from difficulty multipliers and time bonuses
     */
    calculateSummaryStats(results) {
        if (!results || results.length === 0) {
            return {
                totalQuizzes: 0,
                totalParticipants: 0,
                averageScore: 0,
                averageParticipants: 0
            };
        }

        let totalParticipants = 0;
        let totalCorrectAnswers = 0;
        let totalQuestions = 0;
        let scoreSum = 0;
        let scoreCount = 0;

        results.forEach(result => {
            if (result.results && Array.isArray(result.results)) {
                // Detail object with full per-player data (exact computation)
                totalParticipants += result.results.length;

                let quizCorrect = 0;
                let quizQuestions = 0;
                result.results.forEach(player => {
                    const answers = player.answers || [];
                    quizQuestions += answers.length;
                    quizCorrect += answers.filter(a => a?.isCorrect).length;
                });
                totalCorrectAnswers += quizCorrect;
                totalQuestions += quizQuestions;
                if (quizQuestions > 0) {
                    scoreSum += (quizCorrect / quizQuestions) * 100;
                    scoreCount += 1;
                }
            } else {
                // Listing payload: server drops the heavy per-player array and provides
                // participantCount + averageScore summary fields instead.
                totalParticipants += result.participantCount ?? 0;
                if (typeof result.averageScore === 'number') {
                    scoreSum += result.averageScore;
                    scoreCount += 1;
                }
            }
        });

        const averageScore = scoreCount > 0 ?
            Math.round(scoreSum / scoreCount) :
            (totalQuestions > 0 ? Math.round((totalCorrectAnswers / totalQuestions) * 100) : 0);
        const averageParticipants = results.length > 0 ?
            Math.round(totalParticipants / results.length) : 0;

        return {
            totalQuizzes: results.length,
            totalParticipants,
            averageScore,
            averageParticipants
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.resultsCache.clear();
        this.lastFetchTime = null;
        logger.debug('📊 Results cache cleared');
    }

    /**
     * Get cache status
     */
    getCacheStatus() {
        return {
            size: this.resultsCache.size,
            lastFetchTime: this.lastFetchTime,
            isValid: this.isCacheValid(),
            isLoading: this.isLoading
        };
    }
}

// Create and export singleton instance
export const resultsManagerService = new ResultsManagerService();

// Make available globally for debugging
if (typeof window !== 'undefined') {
    window.resultsManagerService = resultsManagerService;
}

export default resultsManagerService;