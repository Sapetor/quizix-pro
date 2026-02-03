/**
 * AI Batch Processor Module
 * Handles batch processing for AI question generation
 *
 * Extracted from generator.js for better maintainability
 */

import { logger } from '../core/config.js';
import { showAlert } from '../utils/translation-manager.js';
import { unifiedErrorHandler as errorHandler } from '../utils/unified-error-handler.js';

// Import extracted services
import { excelQuestionParser } from './excel-question-parser.js';

/**
 * AIBatchProcessor class handles batch processing of AI-generated questions
 * including Excel file conversion and multi-batch generation
 */
export class AIBatchProcessor {
    /**
     * @param {Object} generator - Reference to the main AIQuestionGenerator instance
     */
    constructor(generator) {
        this.generator = generator;
    }

    /**
     * Process batched generation for large Excel files
     */
    async processBatchedGeneration() {
        if (!this.generator.batchInfo) {
            logger.warn('processBatchedGeneration called without batch info');
            return;
        }

        const { totalBatches, currentBatch, originalData, filename, batchSize } = this.generator.batchInfo;

        // Update status to show batch progress
        const statusDiv = document.getElementById('generation-status');
        if (statusDiv) {
            // Ensure status div is visible for batch processing
            statusDiv.style.display = 'block';

            const statusText = statusDiv.querySelector('span');
            if (statusText) {
                statusText.textContent = `Processing batch ${currentBatch} of ${totalBatches}...`;
            } else {
                // Create status text if it doesn't exist
                const newStatusText = document.createElement('span');
                newStatusText.textContent = `Processing batch ${currentBatch} of ${totalBatches}...`;
                statusDiv.appendChild(newStatusText);
            }
        }

        // Process next batch
        const batchStart = (currentBatch - 1) * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, this.generator.batchInfo.totalQuestions);
        logger.debug(`Processing batch ${currentBatch}: questions ${batchStart + 1}-${batchEnd}`);

        const structuredText = this.generator.convertExcelToStructuredText(
            originalData,
            filename,
            batchStart,
            batchSize
        );

        logger.debug(`Batch ${currentBatch} structured text length:`, structuredText.length);

        // Get form values
        const provider = document.getElementById('ai-provider')?.value || 'ollama';
        const difficulty = document.getElementById('difficulty-level')?.value || 'medium';
        const selectedTypes = ['multiple-choice']; // Default for Excel conversion

        // Build prompt and generate
        const prompt = this.generator.buildPrompt(structuredText, batchSize, difficulty, selectedTypes);

        // Generate questions for this batch with error handling
        const questions = await errorHandler.wrapAsyncOperation(
            async () => await this.generateWithProvider(provider, prompt),
            {
                context: { operation: 'batch-generation', batch: currentBatch },
                retryable: false,
                fallback: () => {
                    showAlert(`Batch ${currentBatch} failed. Please try again.`, 'error');
                    return [];
                }
            }
        );

        if (questions && questions.length > 0) {
            // Process questions for this batch
            await this.generator.processGeneratedQuestions(questions, false);

            logger.debug(`Batch ${currentBatch} completed: ${questions.length} questions processed`);

            // Check if we have more batches
            if (currentBatch < totalBatches) {
                // Prepare next batch
                this.generator.batchInfo.currentBatch++;

                // Add delay between batches to be respectful to APIs
                setTimeout(() => {
                    this.processBatchedGeneration();
                }, 2000); // 2-second delay between batches
            } else {
                // All batches complete!
                this.playCompletionChime();
                this.generator.closeModalMethod();
                showAlert(`All ${totalBatches} batches completed! ${this.generator.batchInfo.totalQuestions} questions generated successfully.`, 'success');

                // Reset batch info
                this.generator.batchInfo = null;
                this.generator.isGenerating = false;

                // Reset UI
                const generateBtn = document.getElementById('generate-questions');
                const statusDiv = document.getElementById('generation-status');
                if (generateBtn) generateBtn.disabled = false;
                if (statusDiv) statusDiv.style.display = 'none';
            }
        } else {
            showAlert(`Batch ${currentBatch} generated no questions`, 'warning');
            this.generator.batchInfo = null;
            this.generator.isGenerating = false;
        }
    }

    /**
     * Generate questions using the specified provider
     * Consolidates provider dispatch logic into a single method
     * @param {string} provider - Provider name ('ollama', 'openai', 'claude', 'gemini')
     * @param {string} prompt - The prompt to send
     * @returns {Promise<Array>} - Generated questions
     */
    async generateWithProvider(provider, prompt) {
        switch (provider) {
            case 'ollama':
                return await this.generator.generateWithOllama(prompt);
            case 'openai':
                return await this.generator.generateWithOpenAI(prompt);
            case 'claude':
                return await this.generator.generateWithClaude(prompt);
            case 'gemini':
                return await this.generator.generateWithGemini(prompt);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * Play completion chime when generation is complete
     * Creates a pleasant audio notification using Web Audio API
     */
    playCompletionChime() {
        // Create and play completion sound similar to Claude Code's hook chime
        errorHandler.safeExecute(
            () => {
                // Create a pleasant completion chime using Web Audio API
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();

                // Create a sequence of pleasant tones
                const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 - major chord
                const duration = 0.3;

                frequencies.forEach((frequency, index) => {
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();

                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);

                    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + index * 0.15);
                    oscillator.type = 'sine';

                    gainNode.gain.setValueAtTime(0, audioContext.currentTime + index * 0.15);
                    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + index * 0.15 + 0.05);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + index * 0.15 + duration);

                    oscillator.start(audioContext.currentTime + index * 0.15);
                    oscillator.stop(audioContext.currentTime + index * 0.15 + duration);
                });

                logger.debug('Completion chime played');
            },
            { operation: 'audio-completion-chime' },
            // Fallback: try to play a system beep
            () => errorHandler.safeExecute(
                () => {
                    const utterance = new SpeechSynthesisUtterance('');
                    utterance.volume = 0;
                    speechSynthesis.speak(utterance);
                },
                { operation: 'audio-fallback-beep' }
            )
        );
    }
}
