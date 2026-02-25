/**
 * Results Exporter - Export and download functionality for quiz results
 * Handles format selection, downloads, PDF generation, and export operations
 */

import { logger } from '../../core/config.js';
import { resultsManagerService } from '../../services/results-manager-service.js';
import { getTranslation, showErrorAlert, showSuccessAlert } from '../translation-manager.js';
import { createFormatSelectionModal } from './results-renderer.js';
import { calculateQuestionAnalytics, getQuizSummaryStats } from './results-analytics.js';

// jsPDF CDN URL for lazy loading
const JSPDF_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// Cache the loading promise to avoid duplicate loads
let jsPDFLoadPromise = null;

/**
 * Lazy-load jsPDF library on demand
 * @returns {Promise<Object>} jsPDF constructor
 */
async function loadJsPDF() {
    // Already loaded
    if (typeof window.jspdf !== 'undefined') {
        return window.jspdf;
    }

    // Loading in progress
    if (jsPDFLoadPromise) {
        return jsPDFLoadPromise;
    }

    // Start loading
    jsPDFLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = JSPDF_CDN_URL;
        script.async = true;
        script.onload = () => {
            logger.debug('jsPDF loaded successfully');
            resolve(window.jspdf);
        };
        script.onerror = () => {
            jsPDFLoadPromise = null;
            reject(new Error('Failed to load jsPDF library'));
        };
        document.head.appendChild(script);
    });

    return jsPDFLoadPromise;
}

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
            showErrorAlert(getTranslation('export_failed_download'));
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
            showErrorAlert(getTranslation('export_failed_analytics'));
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
            // Lazy-load jsPDF
            const jspdfLib = await loadJsPDF();
            const { jsPDF } = jspdfLib;
            const doc = new jsPDF();

            const quizTitle = resultData.quizTitle || getTranslation('untitled_quiz');
            const gamePin = resultData.gamePin || getTranslation('unknown');
            const savedDate = resultData.saved ? new Date(resultData.saved).toLocaleDateString() : getTranslation('unknown');
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
            doc.text(getTranslation('export_quiz_results_report'), pageWidth / 2, yPos, { align: 'center' });
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
            doc.text(`${getTranslation('export_game_pin_label')}: ${gamePin}`, margin + 5, yPos);
            doc.text(`${getTranslation('export_date_label')}: ${savedDate}`, margin + 70, yPos);
            doc.text(`${getTranslation('export_participants_label')}: ${participants}`, margin + 130, yPos);
            yPos += 25;

            // Summary statistics header
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(getTranslation('export_summary_stats'), margin, yPos);
            yPos += 10;

            // Summary stats
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');

            const avgSuccessRate = summary.avgSuccessRate?.toFixed(1) || '0';
            const avgTime = summary.avgTime?.toFixed(1) || '0';
            const problematicCount = summary.problematicCount || 0;
            const totalQuestions = summary.totalQuestions || questionAnalytics.length;

            doc.text(`${getTranslation('analytics_avg_success_rate')}: ${avgSuccessRate}%`, margin, yPos);
            yPos += 7;
            doc.text(`${getTranslation('analytics_avg_response_time')}: ${avgTime}s`, margin, yPos);
            yPos += 7;
            doc.text(`${getTranslation('export_total_questions')}: ${totalQuestions}`, margin, yPos);
            yPos += 7;
            doc.text(`${getTranslation('export_questions_needing_review')}: ${problematicCount}`, margin, yPos);
            yPos += 15;

            // Hardest/Easiest questions
            if (summary.hardestQuestion) {
                doc.setFont('helvetica', 'bold');
                doc.text(`${getTranslation('export_most_challenging')}:`, margin, yPos);
                yPos += 7;
                doc.setFont('helvetica', 'normal');
                const hardestText = `Q${summary.hardestQuestion.number}: ${summary.hardestQuestion.text.substring(0, 60)}...`;
                doc.text(hardestText, margin + 5, yPos);
                yPos += 7;
                doc.text(`${getTranslation('export_success_rate_label')}: ${summary.hardestQuestion.successRate.toFixed(1)}%`, margin + 5, yPos);
                yPos += 12;
            }

            if (summary.easiestQuestion) {
                doc.setFont('helvetica', 'bold');
                doc.text(`${getTranslation('export_easiest_question')}:`, margin, yPos);
                yPos += 7;
                doc.setFont('helvetica', 'normal');
                const easiestText = `Q${summary.easiestQuestion.number}: ${summary.easiestQuestion.text.substring(0, 60)}...`;
                doc.text(easiestText, margin + 5, yPos);
                yPos += 7;
                doc.text(`${getTranslation('export_success_rate_label')}: ${summary.easiestQuestion.successRate.toFixed(1)}%`, margin + 5, yPos);
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
                doc.text(getTranslation('export_question_by_question'), margin, yPos);
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
                    const qText = this._sanitizePdfText(q.text || getTranslation('export_question_text_not_available'));
                    const truncatedQText = qText.length > 80 ? qText.substring(0, 77) + '...' : qText;
                    doc.text(truncatedQText, margin + 55, yPos + 3);

                    // Metrics
                    yPos += 12;
                    doc.setFontSize(9);
                    doc.text(`${getTranslation('export_responses_label')}: ${q.totalResponses}`, margin + 5, yPos);
                    doc.text(`${getTranslation('export_avg_time_label')}: ${q.averageTime.toFixed(1)}s`, margin + 50, yPos);
                    doc.text(`${getTranslation('export_avg_points_label')}: ${q.averagePoints.toFixed(0)}`, margin + 100, yPos);

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
                    doc.text(getTranslation('export_more_questions_csv', [questionAnalytics.length - maxQuestions]), margin, yPos);
                }
            }

            // === Footer on last page ===
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(128, 128, 128);
                doc.text(`${getTranslation('generated_by_quizix')} | ${getTranslation('export_page_of', [i, pageCount])}`, pageWidth / 2, 287, { align: 'center' });
                doc.setTextColor(0, 0, 0);
            }

            // Generate filename and save
            const safeTitle = quizTitle.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
            const filename = `${safeTitle}-results-${gamePin}.pdf`;
            doc.save(filename);

            logger.info('PDF report generated:', filename);
            showSuccessAlert(getTranslation('export_pdf_downloaded', [filename]));

        } catch (error) {
            logger.error('Failed to generate PDF:', error);
            showErrorAlert(getTranslation('export_failed_pdf'));
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
     * Export results to Excel (XLSX) format
     * @param {Object} resultData - Full result data object
     * @returns {Promise<void>}
     */
    async exportToExcel(resultData) {
        try {
            // Check if SheetJS is available
            if (typeof XLSX === 'undefined') {
                showErrorAlert(getTranslation('export_excel_not_loaded'));
                return;
            }

            const quizTitle = resultData.quizTitle || getTranslation('untitled_quiz');
            const gamePin = resultData.gamePin || getTranslation('unknown');
            const savedDate = resultData.saved ? new Date(resultData.saved).toLocaleDateString() : getTranslation('unknown');

            // Calculate analytics
            const questionAnalytics = calculateQuestionAnalytics(resultData);
            const summary = getQuizSummaryStats(questionAnalytics);

            // Create workbook
            const wb = XLSX.utils.book_new();

            // === Sheet 1: Summary ===
            const summaryData = [
                [getTranslation('export_quiz_results_report')],
                [],
                [getTranslation('export_quiz_title_label'), quizTitle],
                [getTranslation('export_game_pin_label'), gamePin],
                [getTranslation('export_date_label'), savedDate],
                [getTranslation('export_participants_label'), resultData.results?.length || 0],
                [],
                [getTranslation('export_summary_stats')],
                [getTranslation('analytics_avg_success_rate'), `${(summary.avgSuccessRate || 0).toFixed(1)}%`],
                [getTranslation('analytics_avg_response_time'), `${(summary.avgTime || 0).toFixed(1)}s`],
                [getTranslation('export_total_questions'), summary.totalQuestions || questionAnalytics.length],
                [getTranslation('export_questions_needing_review'), summary.problematicCount || 0],
                [],
                [getTranslation('analytics_hardest_question'), summary.hardestQuestion ? `Q${summary.hardestQuestion.number}: ${summary.hardestQuestion.successRate.toFixed(1)}%` : 'N/A'],
                [getTranslation('analytics_easiest_question'), summary.easiestQuestion ? `Q${summary.easiestQuestion.number}: ${summary.easiestQuestion.successRate.toFixed(1)}%` : 'N/A']
            ];
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            summarySheet['!cols'] = [{ wch: 25 }, { wch: 50 }];
            XLSX.utils.book_append_sheet(wb, summarySheet, getTranslation('export_summary_sheet'));

            // === Sheet 2: Question Analysis ===
            const questionHeaders = [getTranslation('export_question_num', ['#']), getTranslation('export_question_text'), getTranslation('export_type_label'), getTranslation('export_success_rate_label'), getTranslation('export_avg_time_label'), getTranslation('export_responses_label'), getTranslation('export_avg_points_label'), getTranslation('export_problematic'), getTranslation('export_issues')];
            const questionRows = questionAnalytics.map(q => [
                q.questionNumber,
                this._sanitizeExcelText(q.text || ''),
                q.type || 'multiple-choice',
                `${q.successRate.toFixed(1)}%`,
                q.averageTime.toFixed(1),
                q.totalResponses,
                q.averagePoints.toFixed(0),
                q.isPotentiallyProblematic ? getTranslation('export_yes') : getTranslation('export_no'),
                q.problemFlags?.map(f => f.message).join('; ') || ''
            ]);
            const questionData = [questionHeaders, ...questionRows];
            const questionSheet = XLSX.utils.aoa_to_sheet(questionData);
            questionSheet['!cols'] = [
                { wch: 12 }, { wch: 50 }, { wch: 15 }, { wch: 12 },
                { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 40 }
            ];
            XLSX.utils.book_append_sheet(wb, questionSheet, getTranslation('export_questions_sheet'));

            // === Sheet 3: Player Results ===
            if (resultData.results && resultData.results.length > 0) {
                const playerHeaders = [getTranslation('export_rank_label'), getTranslation('export_player_label'), getTranslation('export_score_label'), getTranslation('export_correct_answers'), getTranslation('export_total_questions'), getTranslation('export_success_rate_label'), getTranslation('export_completed_at')];
                const sortedPlayers = [...resultData.results].sort((a, b) => (b.score || 0) - (a.score || 0));
                const playerRows = sortedPlayers.map((player, idx) => {
                    const totalQ = player.answers?.length || 0;
                    const correctQ = player.answers?.filter(a => a?.isCorrect).length || 0;
                    const rate = totalQ > 0 ? ((correctQ / totalQ) * 100).toFixed(1) : '0';
                    return [
                        idx + 1,
                        player.name || getTranslation('anonymous_player'),
                        player.score || 0,
                        correctQ,
                        totalQ,
                        `${rate}%`,
                        player.completedAt ? new Date(player.completedAt).toLocaleTimeString() : 'N/A'
                    ];
                });
                const playerData = [playerHeaders, ...playerRows];
                const playerSheet = XLSX.utils.aoa_to_sheet(playerData);
                playerSheet['!cols'] = [
                    { wch: 6 }, { wch: 20 }, { wch: 10 }, { wch: 15 },
                    { wch: 15 }, { wch: 12 }, { wch: 15 }
                ];
                XLSX.utils.book_append_sheet(wb, playerSheet, getTranslation('export_players_sheet'));
            }

            // === Sheet 4: Common Wrong Answers ===
            const wrongAnswerHeaders = [getTranslation('export_question_num_header'), getTranslation('export_question_text_header'), getTranslation('export_wrong_answer'), getTranslation('export_count')];
            const wrongAnswerRows = [];
            questionAnalytics.forEach(q => {
                const entries = Object.entries(q.commonWrongAnswers || {});
                entries.sort((a, b) => b[1] - a[1]);
                entries.slice(0, 5).forEach(([answer, count]) => {
                    wrongAnswerRows.push([
                        q.questionNumber,
                        this._sanitizeExcelText((q.text || '').substring(0, 50)),
                        this._sanitizeExcelText(answer),
                        count
                    ]);
                });
            });
            if (wrongAnswerRows.length > 0) {
                const wrongAnswerData = [wrongAnswerHeaders, ...wrongAnswerRows];
                const wrongAnswerSheet = XLSX.utils.aoa_to_sheet(wrongAnswerData);
                wrongAnswerSheet['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 30 }, { wch: 8 }];
                XLSX.utils.book_append_sheet(wb, wrongAnswerSheet, getTranslation('export_wrong_answers_sheet'));
            }

            // Generate filename and save
            const safeTitle = quizTitle.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
            const filename = `${safeTitle}-results-${gamePin}.xlsx`;
            XLSX.writeFile(wb, filename);

            logger.info('Excel report generated:', filename);
            showSuccessAlert(getTranslation('export_excel_downloaded', [filename]));

        } catch (error) {
            logger.error('Failed to generate Excel:', error);
            showErrorAlert(getTranslation('export_failed_excel'));
        }
    }

    /**
     * Sanitize text for Excel output
     * @param {string} text - Text to sanitize
     * @returns {string} Sanitized text
     */
    _sanitizeExcelText(text) {
        if (!text) return '';
        return text
            .replace(/\$[^$]*\$/g, '[math]')
            .replace(/\\[a-zA-Z]+/g, '')
            .replace(/[\x00-\x1F]/g, '')
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
            // Lazy-load jsPDF
            const jspdfLib = await loadJsPDF();
            const { jsPDF } = jspdfLib;
            const doc = new jsPDF();

            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 20;
            let yPos = margin;

            // Title
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text(getTranslation('export_session_comparison_report'), pageWidth / 2, yPos, { align: 'center' });
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
            doc.text(`${getTranslation('export_sessions_compared')}: ${comparisonData.sessionCount}`, margin + 5, yPos);
            doc.text(`${getTranslation('export_avg_participants')}: ${comparisonData.averageParticipants}`, margin + 80, yPos);

            const trendText = comparisonData.trendDirection === 'improving' ? getTranslation('export_improving') :
                comparisonData.trendDirection === 'declining' ? getTranslation('export_declining') : getTranslation('export_stable');
            doc.text(`${getTranslation('export_overall_trend')}: ${trendText} (${comparisonData.overallTrend > 0 ? '+' : ''}${comparisonData.overallTrend.toFixed(1)}%)`, margin + 150, yPos);
            yPos += 20;

            // Session details
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(getTranslation('export_session_details'), margin, yPos);
            yPos += 8;

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');

            comparisonData.sessions.forEach((session, idx) => {
                if (yPos > 260) {
                    doc.addPage();
                    yPos = margin;
                }

                const date = new Date(session.date).toLocaleDateString();
                doc.text(`${getTranslation('export_session_label', [idx + 1])}: ${date} | ${session.participantCount} ${getTranslation('analytics_participants_label').toLowerCase()} | ${session.overallSuccessRate.toFixed(1)}% ${getTranslation('export_success_rate_label').toLowerCase()}`, margin, yPos);
                yPos += 6;
            });

            yPos += 10;

            // Question trends
            if (comparisonData.questionTrends && comparisonData.questionTrends.length > 0) {
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text(getTranslation('export_question_trends'), margin, yPos);
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
            doc.text(getTranslation('generated_by_quizix'), pageWidth / 2, 287, { align: 'center' });

            const safeTitle = quizTitle.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
            const filename = `${safeTitle}-comparison.pdf`;
            doc.save(filename);

            logger.info('Comparison PDF generated:', filename);
            showSuccessAlert(getTranslation('export_comparison_downloaded', [filename]));

        } catch (error) {
            logger.error('Failed to generate comparison PDF:', error);
            showErrorAlert(getTranslation('export_failed_comparison'));
        }
    }
}

export const resultsExporter = new ResultsExporter();

export default resultsExporter;
