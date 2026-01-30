/**
 * Results Exporter - Export and download functionality for quiz results
 * Handles format selection, downloads, PDF generation, and export operations
 */

import { logger } from '../../core/config.js';
import { resultsManagerService } from '../../services/results-manager-service.js';
import { showErrorAlert, showSuccessAlert } from '../translation-manager.js';
import { createFormatSelectionModal } from './results-renderer.js';
import { calculateQuestionAnalytics, getQuizSummaryStats } from './results-analytics.js';

export class ResultsExporter {
    constructor() {
        this.currentExportFormat = 'analytics';
    }

    /**
     * Set the current export format
     * @param {string} format - Export format key
     */
    setExportFormat(format) {
        this.currentExportFormat = format;
        logger.debug(`Export format changed to: ${this.currentExportFormat}`);
    }

    /**
     * Get the current export format
     * @returns {string} Current format key
     */
    getExportFormat() {
        return this.currentExportFormat;
    }

    /**
     * Download a result with the specified or current format
     * @param {string} filename - Result filename
     * @param {string} [format] - Export format (optional, uses current if not specified)
     * @returns {Promise<void>}
     */
    async downloadResult(filename, format = null) {
        const exportFormat = format || this.currentExportFormat;
        logger.debug(`Downloading result ${filename} as ${exportFormat}`);

        try {
            await resultsManagerService.downloadResult(filename, exportFormat, 'csv');
        } catch (error) {
            logger.error('Error downloading result:', error);
            showErrorAlert('Failed to download result');
        }
    }

    /**
     * Show download options modal for a result
     * @param {string} filename - Result filename
     * @param {Array} filteredResults - Current filtered results array
     * @returns {Promise<void>}
     */
    async showDownloadOptions(filename, filteredResults) {
        const result = filteredResults?.find(r => r.filename === filename);
        if (!result) {
            logger.error(`Result not found: ${filename}`);
            return;
        }

        const formats = resultsManagerService.getAvailableFormats(result);

        if (formats.length <= 1) {
            await this.downloadResult(filename, formats[0]?.key || 'analytics');
            return;
        }

        this.showFormatSelectionModal(filename, formats);
    }

    /**
     * Display the format selection modal
     * @param {string} filename - Result filename
     * @param {Array} formats - Available format options
     */
    showFormatSelectionModal(filename, formats) {
        const modal = createFormatSelectionModal(filename, formats, this.currentExportFormat);
        document.body.appendChild(modal);

        const content = modal.querySelector('div');
        const cancelBtn = content.querySelector('#format-cancel-btn');
        const downloadBtn = content.querySelector('#format-download-btn');

        const closeModal = () => {
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
        };

        cancelBtn.addEventListener('click', closeModal);

        downloadBtn.addEventListener('click', async () => {
            const selectedFormat = content.querySelector('input[name="export-format"]:checked')?.value || 'analytics';
            closeModal();
            await this.downloadResult(filename, selectedFormat);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    /**
     * Export analytics report for a result
     * @param {string} filename - Result filename
     * @returns {Promise<void>}
     */
    async exportAnalyticsReport(filename) {
        try {
            logger.info('Analytics export requested for:', filename);
            await resultsManagerService.downloadResult(filename, 'analytics', 'csv');
            logger.debug('Analytics report downloaded successfully');
        } catch (error) {
            logger.error('Failed to export analytics report:', error);
            showErrorAlert('Failed to export analytics report');
        }
    }

    /**
     * Export results to PDF format
     * @param {Object} resultData - Full result data object
     * @param {Object} options - PDF generation options
     * @returns {Promise<void>}
     */
    async exportToPDF(resultData, options = {}) {
        try {
            // Check if jsPDF is available
            if (typeof window.jspdf === 'undefined') {
                showErrorAlert('PDF export library not loaded. Please refresh and try again.');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const quizTitle = resultData.quizTitle || 'Untitled Quiz';
            const gamePin = resultData.gamePin || 'Unknown';
            const savedDate = resultData.saved ? new Date(resultData.saved).toLocaleDateString() : 'Unknown';
            const participants = resultData.results?.length || 0;

            // Calculate analytics
            const questionAnalytics = calculateQuestionAnalytics(resultData);
            const summary = getQuizSummaryStats(questionAnalytics);

            // Page dimensions
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;
            const contentWidth = pageWidth - (margin * 2);
            let yPos = margin;

            // === PAGE 1: Summary ===

            // Title
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text('Quiz Results Report', pageWidth / 2, yPos, { align: 'center' });
            yPos += 12;

            // Quiz title
            doc.setFontSize(16);
            doc.setFont('helvetica', 'normal');
            const truncatedTitle = quizTitle.length > 50 ? quizTitle.substring(0, 47) + '...' : quizTitle;
            doc.text(truncatedTitle, pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;

            // Meta info box
            doc.setFillColor(240, 240, 240);
            doc.rect(margin, yPos, contentWidth, 25, 'F');

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            yPos += 8;
            doc.text(`Game PIN: ${gamePin}`, margin + 5, yPos);
            doc.text(`Date: ${savedDate}`, margin + 70, yPos);
            doc.text(`Participants: ${participants}`, margin + 130, yPos);
            yPos += 25;

            // Summary statistics header
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Summary Statistics', margin, yPos);
            yPos += 10;

            // Summary stats
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');

            const avgSuccessRate = summary.avgSuccessRate?.toFixed(1) || '0';
            const avgTime = summary.avgTime?.toFixed(1) || '0';
            const problematicCount = summary.problematicCount || 0;
            const totalQuestions = summary.totalQuestions || questionAnalytics.length;

            doc.text(`Average Success Rate: ${avgSuccessRate}%`, margin, yPos);
            yPos += 7;
            doc.text(`Average Response Time: ${avgTime} seconds`, margin, yPos);
            yPos += 7;
            doc.text(`Total Questions: ${totalQuestions}`, margin, yPos);
            yPos += 7;
            doc.text(`Questions Needing Review: ${problematicCount}`, margin, yPos);
            yPos += 15;

            // Hardest/Easiest questions
            if (summary.hardestQuestion) {
                doc.setFont('helvetica', 'bold');
                doc.text('Most Challenging Question:', margin, yPos);
                yPos += 7;
                doc.setFont('helvetica', 'normal');
                const hardestText = `Q${summary.hardestQuestion.number}: ${summary.hardestQuestion.text.substring(0, 60)}...`;
                doc.text(hardestText, margin + 5, yPos);
                yPos += 7;
                doc.text(`Success Rate: ${summary.hardestQuestion.successRate.toFixed(1)}%`, margin + 5, yPos);
                yPos += 12;
            }

            if (summary.easiestQuestion) {
                doc.setFont('helvetica', 'bold');
                doc.text('Easiest Question:', margin, yPos);
                yPos += 7;
                doc.setFont('helvetica', 'normal');
                const easiestText = `Q${summary.easiestQuestion.number}: ${summary.easiestQuestion.text.substring(0, 60)}...`;
                doc.text(easiestText, margin + 5, yPos);
                yPos += 7;
                doc.text(`Success Rate: ${summary.easiestQuestion.successRate.toFixed(1)}%`, margin + 5, yPos);
                yPos += 15;
            }

            // === PAGE 2+: Per-Question Analysis ===

            // Limit to reasonable number for PDF
            const maxQuestions = Math.min(questionAnalytics.length, 20);

            if (maxQuestions > 0) {
                doc.addPage();
                yPos = margin;

                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text('Question-by-Question Analysis', margin, yPos);
                yPos += 12;

                for (let i = 0; i < maxQuestions; i++) {
                    const q = questionAnalytics[i];

                    // Check if we need a new page
                    if (yPos > 250) {
                        doc.addPage();
                        yPos = margin;
                    }

                    // Question header
                    doc.setFillColor(q.isPotentiallyProblematic ? 255 : 230, q.isPotentiallyProblematic ? 230 : 255, 230);
                    doc.rect(margin, yPos - 5, contentWidth, 30, 'F');

                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`Q${q.questionNumber}`, margin + 3, yPos + 3);

                    // Success rate badge
                    const successColor = q.successRate >= 80 ? [16, 185, 129] :
                        q.successRate >= 60 ? [245, 158, 11] :
                            q.successRate >= 40 ? [249, 115, 22] : [239, 68, 68];
                    doc.setFillColor(...successColor);
                    doc.rect(margin + 20, yPos - 3, 30, 10, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(9);
                    doc.text(`${q.successRate.toFixed(0)}%`, margin + 25, yPos + 4);
                    doc.setTextColor(0, 0, 0);

                    // Question text
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    const qText = this._sanitizePdfText(q.text || 'Question text not available');
                    const truncatedQText = qText.length > 80 ? qText.substring(0, 77) + '...' : qText;
                    doc.text(truncatedQText, margin + 55, yPos + 3);

                    // Metrics
                    yPos += 12;
                    doc.setFontSize(9);
                    doc.text(`Responses: ${q.totalResponses}`, margin + 5, yPos);
                    doc.text(`Avg Time: ${q.averageTime.toFixed(1)}s`, margin + 50, yPos);
                    doc.text(`Avg Points: ${q.averagePoints.toFixed(0)}`, margin + 100, yPos);

                    // Problem flags
                    if (q.problemFlags && q.problemFlags.length > 0) {
                        yPos += 7;
                        doc.setTextColor(180, 83, 9);
                        const flagText = q.problemFlags.map(f => f.message).join('; ').substring(0, 100);
                        doc.text(flagText, margin + 5, yPos);
                        doc.setTextColor(0, 0, 0);
                    }

                    yPos += 20;
                }

                if (questionAnalytics.length > maxQuestions) {
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'italic');
                    doc.text(`... and ${questionAnalytics.length - maxQuestions} more questions (see CSV export for full data)`, margin, yPos);
                }
            }

            // === Footer on last page ===
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(128, 128, 128);
                doc.text(`Generated by Quizix Pro | Page ${i} of ${pageCount}`, pageWidth / 2, 287, { align: 'center' });
                doc.setTextColor(0, 0, 0);
            }

            // Generate filename and save
            const safeTitle = quizTitle.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
            const filename = `${safeTitle}-results-${gamePin}.pdf`;
            doc.save(filename);

            logger.info('PDF report generated:', filename);
            showSuccessAlert(`PDF report downloaded: ${filename}`);

        } catch (error) {
            logger.error('Failed to generate PDF:', error);
            showErrorAlert('Failed to generate PDF report');
        }
    }

    /**
     * Sanitize text for PDF output (remove problematic characters)
     * @param {string} text - Text to sanitize
     * @returns {string} Sanitized text
     */
    _sanitizePdfText(text) {
        if (!text) return '';
        // Remove LaTeX commands and problematic characters
        return text
            .replace(/\$[^$]*\$/g, '[math]')  // Replace LaTeX math
            .replace(/\\[a-zA-Z]+/g, '')       // Remove LaTeX commands
            .replace(/[^\x20-\x7E]/g, '')      // Remove non-ASCII
            .trim();
    }

    /**
     * Export comparison results to PDF
     * @param {Object} comparisonData - Comparative analysis data
     * @param {string} quizTitle - Title of the quiz being compared
     * @returns {Promise<void>}
     */
    async exportComparisonToPDF(comparisonData, quizTitle) {
        try {
            if (typeof window.jspdf === 'undefined') {
                showErrorAlert('PDF export library not loaded. Please refresh and try again.');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;
            let yPos = margin;

            // Title
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('Session Comparison Report', pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;

            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            const truncatedTitle = quizTitle.length > 50 ? quizTitle.substring(0, 47) + '...' : quizTitle;
            doc.text(truncatedTitle, pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;

            // Summary box
            doc.setFillColor(240, 240, 240);
            doc.rect(margin, yPos, pageWidth - (margin * 2), 20, 'F');
            yPos += 8;

            doc.setFontSize(10);
            doc.text(`Sessions Compared: ${comparisonData.sessionCount}`, margin + 5, yPos);
            doc.text(`Average Participants: ${comparisonData.averageParticipants}`, margin + 80, yPos);

            const trendText = comparisonData.trendDirection === 'improving' ? 'Improving' :
                comparisonData.trendDirection === 'declining' ? 'Declining' : 'Stable';
            doc.text(`Overall Trend: ${trendText} (${comparisonData.overallTrend > 0 ? '+' : ''}${comparisonData.overallTrend.toFixed(1)}%)`, margin + 150, yPos);
            yPos += 20;

            // Session details
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Session Details', margin, yPos);
            yPos += 8;

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');

            comparisonData.sessions.forEach((session, idx) => {
                if (yPos > 260) {
                    doc.addPage();
                    yPos = margin;
                }

                const date = new Date(session.date).toLocaleDateString();
                doc.text(`Session ${idx + 1}: ${date} | ${session.participantCount} participants | ${session.overallSuccessRate.toFixed(1)}% success`, margin, yPos);
                yPos += 6;
            });

            yPos += 10;

            // Question trends
            if (comparisonData.questionTrends && comparisonData.questionTrends.length > 0) {
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text('Question Performance Trends', margin, yPos);
                yPos += 8;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');

                comparisonData.questionTrends.forEach(qt => {
                    if (yPos > 260) {
                        doc.addPage();
                        yPos = margin;
                    }

                    const trendSymbol = qt.trend > 2 ? '+' : qt.trend < -2 ? '' : '~';
                    const trendColor = qt.trend > 2 ? [16, 185, 129] : qt.trend < -2 ? [239, 68, 68] : [107, 114, 128];
                    doc.setTextColor(...trendColor);
                    doc.text(`Q${qt.questionNumber}: ${qt.firstRate.toFixed(0)}% → ${qt.lastRate.toFixed(0)}% (${trendSymbol}${qt.trend.toFixed(1)}%)`, margin, yPos);
                    doc.setTextColor(0, 0, 0);
                    yPos += 6;
                });
            }

            // Footer
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(128, 128, 128);
            doc.text('Generated by Quizix Pro', pageWidth / 2, 287, { align: 'center' });

            const safeTitle = quizTitle.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
            const filename = `${safeTitle}-comparison.pdf`;
            doc.save(filename);

            logger.info('Comparison PDF generated:', filename);
            showSuccessAlert(`Comparison report downloaded: ${filename}`);

        } catch (error) {
            logger.error('Failed to generate comparison PDF:', error);
            showErrorAlert('Failed to generate comparison report');
        }
    }
}

export const resultsExporter = new ResultsExporter();

export default resultsExporter;
