/**
 * Game Manager Module
 * Handles game flow, question display, player results, and game state management
 */

import { translationManager, getTranslation, createQuestionCounter, getTrueFalseText } from '../utils/translation-manager.js';
import { TIMING, logger, UI, ANIMATION } from '../core/config.js';
// MathRenderer and mathJaxService now handled by GameDisplayManager
import { dom } from '../utils/dom.js';
import { unifiedErrorHandler as errorBoundary } from '../utils/unified-error-handler.js';
import { modalFeedback } from '../utils/modal-feedback.js';
import { uiStateManager } from '../utils/ui-state-manager.js';
import { simpleResultsDownloader } from '../utils/simple-results-downloader.js';
import { GameDisplayManager } from './modules/game-display-manager.js';
import { GameStateManager as ModularGameStateManager } from './modules/game-state-manager.js';
import { APIHelper } from '../utils/api-helper.js';
import { PlayerInteractionManager } from './modules/player-interaction-manager.js';
import { TimerManager } from './modules/timer-manager.js';
import { QuestionRenderer } from './modules/question-renderer.js';
import { NavigationService } from '../services/navigation-service.js';
import QuestionTypeRegistry from '../utils/question-type-registry.js';

export class GameManager {
    constructor(socket, uiManager, soundManager, socketManager = null) {
        this.socket = socket;
        this.uiManager = uiManager;
        this.soundManager = soundManager;
        this.socketManager = socketManager;
        // MathRenderer now handled by GameDisplayManager
        this.displayManager = new GameDisplayManager(uiManager);
        this.stateManager = new ModularGameStateManager();
        this.timerManager = new TimerManager();
        this.interactionManager = new PlayerInteractionManager(this.stateManager, this.displayManager, soundManager, socketManager);
        this.questionRenderer = new QuestionRenderer(this.displayManager, this.stateManager, uiManager, this);
        this.navigationService = new NavigationService(uiManager);
        
        // Initialize DOM Manager with common game elements
        dom.initializeGameElements();
        
        // Keep these specific to GameManager for now
        this.lastDisplayQuestionTime = 0; // Prevent rapid successive displayQuestion calls
        
        // Game state properties
        this.gameEnded = false;
        this.resultShown = false;
        this.currentQuizTitle = null;
        this.gameStartTime = null;
        
        
        // Memory management tracking
        this.eventListeners = new Map(); // Track all event listeners for cleanup
        this.timers = new Set(); // Track all timers for cleanup
        this.playerAnswers = new Map(); // Track player answers for cleanup
        
        // Bind cleanup methods
        this.cleanup = this.cleanup.bind(this);
        this.addEventListenerTracked = this.addEventListenerTracked.bind(this);
        this.createTimerTracked = this.createTimerTracked.bind(this);
        
        // Auto-cleanup on page unload
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this.cleanup);
            window.addEventListener('unload', this.cleanup);
        }
        

    }

    /**
     * Update socket manager reference (called after initialization)
     */
    setSocketManager(socketManager) {
        this.socketManager = socketManager;
        if (this.interactionManager) {
            this.interactionManager.socketManager = socketManager;
        }
    }


    /**
     * Display a question to the player or host
     */
    displayQuestion(data) {
        return errorBoundary.safeExecute(() => {
            // Prevent rapid successive calls that could interfere with MathJax rendering
            const now = Date.now();
            if (this.lastDisplayQuestion && (now - this.lastDisplayQuestionTime) < 500) {
                logger.debug('🚫 Ignoring rapid displayQuestion call to prevent MathJax interference');
                return;
            }
            this.lastDisplayQuestionTime = now;
            
            logger.debug('Displaying question:', data);
            
            // Initialize display state
            this.initializeQuestionDisplay(data);
            
            // Get DOM elements and containers
            const elements = this.getQuestionElements();
            const optionsContainer = this.setupQuestionContainers(data);
            
            // Update content based on host/player mode
            const gameState = this.stateManager.getGameState();
            if (gameState.isHost) {
                this.questionRenderer.updateHostDisplay(data, elements);
            } else {
                this.questionRenderer.updatePlayerDisplay(data, elements, optionsContainer);
            }
            
            // Finalize display
            this.finalizeQuestionDisplay(data);
        }, {
            type: 'game_logic',
            operation: 'question_display',
            questionId: data.questionId
        }, () => {
            // Fallback: show error message
            logger.error('Failed to display question, showing error state');
            this.showQuestionErrorState();
        });
    }

    /**
     * Initialize question display state and reset for new question
     */
    initializeQuestionDisplay(data) {
        const gameState = this.stateManager.getGameState();
        logger.debug('QuestionInit', { type: data.type, options: data.options?.length, isHost: gameState.isHost });
        
        // FIXED: Re-enable conservative element cleaning to prevent MathJax interference
        this.cleanGameElementsForFreshRendering();
        
        
        // Initialize question state using state manager
        this.stateManager.initializeQuestionState(data);
        
        // Reset button states for new question
        this.resetButtonStatesForNewQuestion();
        
        // Reset player interaction state (clear highlighting, etc.)
        this.interactionManager.reset();
        
    }

    /**
     * Get question display elements
     */
    getQuestionElements() {
        return this.displayManager.getQuestionElements();
    }

    /**
     * Setup question containers based on question type
     */
    setupQuestionContainers(data) {
        let optionsContainer = null;
        
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) {
            optionsContainer = this.setupPlayerContainers(data);
        } else {
            logger.debug('Host mode');
        }
        
        return optionsContainer;
    }

    /**
     * Setup player containers based on question type
     */
    setupPlayerContainers(data) {
        logger.debug('Player mode - setting up containers');

        // Hide all answer type containers
        dom.queryAll('.player-answer-type').forEach(type => type.style.display = 'none');

        // Get container configuration from registry
        const config = QuestionTypeRegistry.getPlayerContainerConfig(data.type);
        if (!config) {
            logger.warn('Unknown question type:', data.type);
            return null;
        }

        const container = dom.get(config.containerId);
        logger.debug(`${config.containerId} found:`, !!container);

        if (container) {
            container.style.display = 'block';
            const optionsContainer = container.querySelector(config.optionsSelector);
            logger.debug('Player optionsContainer set to:', optionsContainer);
            return optionsContainer;
        }

        return null;
    }













    /**
     * Finalize question display with common actions
     */
    finalizeQuestionDisplay(data) {
        logger.debug('Finalizing question display');
        
        // Play question start sound
        if (this.soundManager.soundsEnabled) {
            this.soundManager.playQuestionStartSound();
        }
        
        // Store current question data
        this.currentQuestion = data;
        
        // Trigger mobile layout adaptation for content-aware display
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('question-content-updated', {
                detail: { questionData: data, isHost: this.stateManager.getGameState().isHost }
            }));
        }, 250); // Delay to ensure DOM and MathJax rendering is complete
    }

    /**
     * Update the question counter display (host)
     */
    updateQuestionCounter(current, total) {
        this.displayManager.updateQuestionCounter(current, total);
    }

    /**
     * Update the question counter display (player)
     */
    updatePlayerQuestionCounter(current, total) {
        this.displayManager.updatePlayerQuestionCounter(current, total);
    }

    /**
     * Submit multiple correct answer
     */
    submitMultipleCorrectAnswer() {
        this.interactionManager.submitMultipleCorrectAnswer();
    }

    /**
     * Handle player selecting an answer
     */
    selectAnswer(answer) {
        this.interactionManager.selectAnswer(answer);
    }

    /**
     * Highlight selected answer and disable options (from monolithic version)
     */
    highlightSelectedAnswer(answer) {
        logger.debug('Highlighting selected answer:', answer);
        
        // Handle multiple choice options
        const options = document.querySelectorAll('.player-option');
        options.forEach(option => {
            option.disabled = true;
            option.classList.remove('selected');
            option.classList.add('disabled');
        });
        
        if (typeof answer === 'number' && options[answer]) {
            options[answer].classList.add('selected');
            logger.debug('Added selected class to option:', answer);
        }
        
        // Handle true/false options
        const tfOptions = document.querySelectorAll('.true-btn, .false-btn');
        tfOptions.forEach(option => {
            option.disabled = true;
            option.classList.remove('selected');
        });
        
        // Find and highlight the selected true/false option
        if (typeof answer === 'boolean') {
            // Convert boolean back to index for UI highlighting: true = 0, false = 1
            const index = answer === true ? 0 : 1;
            const selectedTFOption = document.querySelector(`[data-answer="${index}"]`);
            if (selectedTFOption && selectedTFOption.classList.contains('tf-option')) {
                selectedTFOption.classList.add('selected');
                logger.debug('Added selected class to T/F option:', answer, 'at index:', index);
            }
        } else if (typeof answer === 'number') {
            const selectedTFOption = document.querySelector(`[data-answer="${answer}"]`);
            if (selectedTFOption && (selectedTFOption.classList.contains('true-btn') || selectedTFOption.classList.contains('false-btn'))) {
                selectedTFOption.classList.add('selected');
                logger.debug('Added selected class to T/F option:', answer);
            }
        }
        
        // Handle multiple correct checkboxes
        const checkboxes = document.querySelectorAll('.multiple-correct-option');
        checkboxes.forEach(checkbox => {
            checkbox.disabled = true;
        });
    }

    /**
     * Submit numeric answer
     */
    submitNumericAnswer() {
        this.interactionManager.submitNumericAnswer();
    }

    /**
     * Submit ordering answer
     */
    submitOrderingAnswer() {
        this.interactionManager.submitOrderingAnswer();
    }

    // Answer submission feedback now handled by GameDisplayManager

    /**
     * Show player result (correct/incorrect) using modal feedback system
     */
    showPlayerResult(data) {
        return errorBoundary.safeExecute(() => {
            const gameState = this.stateManager.getGameState();
            
            // Prevent multiple displays of same result
            if (gameState.resultShown) {
                logger.debug('Result already shown, skipping');
                return;
            }
            this.stateManager.markResultShown();
            
            const isCorrect = data.isCorrect !== undefined ? data.isCorrect : data.correct;
            const earnedPoints = data.points || 0;
            
            // Prepare feedback message
            let feedbackMessage = isCorrect 
                ? getTranslation('correct_answer_msg')
                : getTranslation('incorrect_answer_msg');
            
            // Add total score to message if available
            if (earnedPoints > 0 && data.totalScore !== undefined) {
                feedbackMessage += ` (+${earnedPoints} ${getTranslation('points')})`;
            }
            
            // Show modal feedback instead of inline feedback
            if (isCorrect) {
                modalFeedback.showCorrect(feedbackMessage, earnedPoints, TIMING.RESULT_DISPLAY_DURATION);
            } else {
                modalFeedback.showIncorrect(feedbackMessage, earnedPoints, TIMING.RESULT_DISPLAY_DURATION);
            }
            
            // Show correct answer if player was wrong (preserve existing functionality)
            if (!isCorrect && data.correctAnswer !== undefined) {
                // Delay to allow modal to appear first
                setTimeout(() => {
                    this.showCorrectAnswerOnClient(data.correctAnswer);
                }, 500);
            }
            
            // Play result sound 
            if (isCorrect) {
                if (this.soundManager.soundsEnabled) {
                    this.soundManager.playCorrectAnswerSound();
                }
            } else {
                if (this.soundManager.soundsEnabled) {
                    this.soundManager.playIncorrectAnswerSound();
                }
            }
            
        }, {
            type: 'game_logic',
            operation: 'player_result',
            playerId: data.playerId
        }, () => {
            // Fallback: show basic modal feedback
            logger.error('Failed to show player result, using fallback modal');
            modalFeedback.show(false, 'Error displaying result', null, 2000);
        });
    }

    /**
     * Show answer submitted feedback using modal system
     */
    showAnswerSubmitted(answer) {
        logger.debug('showAnswerSubmitted called with:', answer);
        
        let displayText = '';
        if (typeof answer === 'number') {
            // Check the current question type to determine how to display the answer
            const gameState = this.stateManager.getGameState();
            const questionType = gameState.currentQuestion?.type;
            
            if (questionType === 'numeric') {
                // For numeric questions, always show the actual number
                displayText = `${getTranslation('answer_submitted')}: ${answer}`;
            } else if (Number.isInteger(answer) && answer >= 0 && answer <= 3) {
                // Multiple choice answer - convert to letter
                const letter = String.fromCharCode(65 + answer);
                displayText = `${getTranslation('answer_submitted')}: ${letter}`;
            } else {
                // Fallback for other numeric values
                displayText = `${getTranslation('answer_submitted')}: ${answer}`;
            }
        } else if (Array.isArray(answer)) {
            const letters = answer.map(a => String.fromCharCode(65 + a)).join(', ');
            displayText = `${getTranslation('answer_submitted')}: ${letters}`;
        } else if (typeof answer === 'boolean') {
            const translatedValue = answer ? getTranslation('true') : getTranslation('false');
            displayText = `${getTranslation('answer_submitted')}: ${translatedValue}`;
        } else if (typeof answer === 'string') {
            displayText = `${getTranslation('answer_submitted')}: ${answer.toUpperCase()}`;
        } else {
            displayText = `${getTranslation('answer_submitted')}: ${answer}`;
        }
        
        // Show modal feedback with submission-specific styling (original nice system)
        modalFeedback.showSubmission(displayText, 2000); // 2 seconds for submission confirmation
        
        logger.debug('Answer submission modal feedback shown:', displayText);
    }

    /**
     * Show correct answer on client side when player was wrong (from monolithic version)
     */
    showCorrectAnswerOnClient(correctAnswer) {
        logger.debug('Showing correct answer on client:', correctAnswer);
        
        // Handle multiple choice options
        const options = document.querySelectorAll('.player-option');
        if (typeof correctAnswer === 'number' && options[correctAnswer]) {
            options[correctAnswer].classList.add('correct-answer');
            options[correctAnswer].style.border = '3px solid #2ecc71';
            options[correctAnswer].style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
            logger.debug('Highlighted correct option:', correctAnswer);
        }
        
        // Handle true/false options
        if (typeof correctAnswer === 'boolean') {
            // Convert boolean to index for UI highlighting: true = 0, false = 1
            const index = correctAnswer === true ? 0 : 1;
            const correctTFOption = document.querySelector(`[data-answer="${index}"]`);
            if (correctTFOption && correctTFOption.classList.contains('tf-option')) {
                correctTFOption.classList.add('correct-answer');
                correctTFOption.style.border = '3px solid #2ecc71';
                correctTFOption.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
                logger.debug('Highlighted correct T/F option:', correctAnswer, 'at index:', index);
            }
        } else {
            const correctTFOption = document.querySelector(`[data-answer="${correctAnswer}"]`);
            if (correctTFOption && (correctTFOption.classList.contains('true-btn') || correctTFOption.classList.contains('false-btn'))) {
                correctTFOption.classList.add('correct-answer');
                correctTFOption.style.border = '3px solid #2ecc71';
                correctTFOption.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
                logger.debug('Highlighted correct T/F option:', correctAnswer);
            }
        }
    }

    /**
     * Reset button states for new question (fix for answer input bug)
     */
    resetButtonStatesForNewQuestion() {
        logger.debug('Resetting button states for new question');
        
        // Reset selected answer
        this.selectedAnswer = null;
        
        // Use centralized client selection clearing
        this.displayManager.clearClientSelections();
        
        logger.debug('Button states reset completed via centralized method');
    }

    /**
     * Clear previous question content to prevent flash during screen transitions
     */
    clearPreviousQuestionContent() {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;
        
        // Use centralized host content clearing from DisplayManager
        this.displayManager.clearHostQuestionContent(true); // true = show loading message
    }

    /**
     * Clean game elements of any MathJax contamination from loaded quizzes
     * This prevents conflicts when loaded quiz data has pre-processed MathJax content
     */
    cleanGameElementsForFreshRendering() {
        // Game elements that must be clean before MathJax rendering
        const gameElements = document.querySelectorAll([
            '#current-question',        // Host question display
            '#player-question-text',    // Player question display
            '.player-option',           // Player multiple choice options
            '.option-display',          // Host option displays
            '.tf-option',               // True/false options
            '.checkbox-option',         // Multiple correct options
            '.numeric-input-container'  // Numeric input area
        ].join(', '));
        
        gameElements.forEach(element => {
            if (element) {
                // SIMPLIFIED: Remove all MathJax containers that cause conflicts
                const existingMath = element.querySelectorAll('mjx-container');
                if (existingMath.length > 0) {
                    logger.debug('🧹 Removing existing MathJax containers');
                    existingMath.forEach(mjx => mjx.remove());
                }
                
                // Remove MathJax processing classes that could cause conflicts
                element.classList.remove('processing-math', 'math-ready', 'MathJax_Processed');
                
                // Remove any pointer-events none that might have been added
                if (element.style.pointerEvents === 'none') {
                    element.style.pointerEvents = '';
                }
            }
        });
        
        // Clear any lingering question images from previous questions
        this.clearAllQuestionImages();
        
        logger.debug('🧹 Cleaned game elements for fresh rendering');
    }

    /**
     * Clear all question images from both host and player displays
     */
    clearAllQuestionImages() {
        // Clear host question image
        const hostImageContainer = document.getElementById('question-image-display');
        if (hostImageContainer) {
            hostImageContainer.style.display = 'none';
            const hostImg = hostImageContainer.querySelector('img');
            if (hostImg) {
                hostImg.src = '';
                hostImg.removeAttribute('src');
            }
        }
        
        // Clear player question image
        const playerImageContainer = document.getElementById('player-question-image');
        if (playerImageContainer) {
            playerImageContainer.style.display = 'none';
            const playerImg = playerImageContainer.querySelector('img');
            if (playerImg) {
                playerImg.src = '';
                playerImg.removeAttribute('src');
            }
        }
        
        logger.debug('🖼️ Cleared all question images');
    }

    /**
     * Reset button styles (from monolithic version)
     */
    resetButtonStyles(options) {
        options.forEach(option => {
            option.style.border = '';
            option.style.backgroundColor = '';
            option.style.color = '';
            option.style.fontWeight = '';
            option.style.display = 'block';
        });
    }

    /**
     * Highlight correct answers on host display (original monolithic style)
     */
    highlightCorrectAnswers(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;
        
        const questionType = data.questionType || data.type;
        const options = document.querySelectorAll('.option-display');
        
        if (questionType === 'multiple-choice') {
            options.forEach((option, index) => {
                if (index === data.correctAnswer) {
                    option.style.border = '5px solid #2ecc71';
                    option.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
                    option.style.color = '#2ecc71';
                    option.style.fontWeight = 'bold';
                }
            });
        } else if (questionType === 'true-false') {
            // For true-false, correctAnswer is a string ("true" or "false")
            // Convert to index: "true" = 0, "false" = 1
            const correctIndex = (data.correctAnswer === true || data.correctAnswer === 'true') ? 0 : 1;
            if (options[correctIndex]) {
                options[correctIndex].style.border = '5px solid #2ecc71';
                options[correctIndex].style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
                options[correctIndex].style.color = '#2ecc71';
                options[correctIndex].style.fontWeight = 'bold';
            }
        } else if (questionType === 'multiple-correct') {
            // Highlight multiple correct answers
            if (data.correctAnswers && Array.isArray(data.correctAnswers)) {
                data.correctAnswers.forEach(index => {
                    if (options[index]) {
                        options[index].style.border = '5px solid #2ecc71';
                        options[index].style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
                        options[index].style.color = '#2ecc71';
                        options[index].style.fontWeight = 'bold';
                    }
                });
            }
        }
    }

    /**
     * Show correct answer (original monolithic style)
     */
    showCorrectAnswer(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;
        
        const questionType = data.questionType || data.type;
        
        if (questionType === 'numeric') {
            // Show numeric answer in options container (original style)
            this.showNumericCorrectAnswer(data.correctAnswer, data.tolerance);
        } else {
            // Highlight correct answers in the grid
            this.highlightCorrectAnswers(data);
        }
    }

    /**
     * Show numeric correct answer in top frame 
     */
    showNumericCorrectAnswer(correctAnswer, tolerance) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost) return;
        
        // Remove any existing correct answer display
        const existingAnswer = document.querySelector('.numeric-correct-answer-display');
        if (existingAnswer) {
            existingAnswer.remove();
        }
        
        // Show the answer in the question display area (top frame)
        const questionDisplay = document.getElementById('host-question-display');
        if (questionDisplay) {
            let answerText = `${getTranslation('correct_answer')}: ${correctAnswer}`;
            if (tolerance) {
                answerText += ` (±${tolerance})`;
            }
            
            // Create the correct answer display
            const correctAnswerDiv = document.createElement('div');
            correctAnswerDiv.className = 'numeric-correct-answer-display';
            correctAnswerDiv.innerHTML = `
                <div class="numeric-correct-answer-content">
                    <div class="correct-icon">✅</div>
                    <div class="correct-text">${answerText}</div>
                </div>
            `;
            
            // Insert after the question content
            questionDisplay.appendChild(correctAnswerDiv);
        }
        
        // Hide the bottom options container for numeric questions
        const optionsContainer = document.getElementById('answer-options');
        if (optionsContainer) {
            optionsContainer.style.display = 'none';
        }
        
        // Add class to hide the entire host-multiple-choice frame for numeric questions
        const hostMultipleChoice = document.getElementById('host-multiple-choice');
        if (hostMultipleChoice) {
            hostMultipleChoice.classList.add('numeric-question-type');
        }
    }

    /**
     * Update answer statistics for host display
     */
    updateAnswerStatistics(data) {
        const gameState = this.stateManager.getGameState();
        if (!gameState.isHost || !data) return;
        
        logger.debug('Answer statistics data received:', data);
        logger.debug('Data structure:', {
            answeredPlayers: data.answeredPlayers,
            totalPlayers: data.totalPlayers,
            answerCounts: data.answerCounts,
            questionType: data.questionType || data.type
        });
        
        // Get existing statistics container
        let statisticsContainer = document.getElementById('answer-statistics');
        if (!statisticsContainer) {
            logger.warn('Answer statistics container not found in HTML');
            return;
        }
        
        // Show statistics container
        if (statisticsContainer) {
            statisticsContainer.style.display = 'block';
            
            // Update response counts
            dom.setContent('responses-count', data.answeredPlayers || 0);
            dom.setContent('total-players', data.totalPlayers || 0);
            
            // Update individual answer statistics
            const questionType = data.questionType || data.type;
            logger.debug('Question type:', questionType, 'Answer counts:', data.answerCounts);
            
            if (questionType === 'multiple-choice' || questionType === 'multiple-correct') {
                this.showMultipleChoiceStatistics(4);
                for (let i = 0; i < 4; i++) {
                    const count = data.answerCounts[i] || 0;
                    logger.debug(`Updating option ${i}: ${count} answers`);
                    this.updateStatItem(i, count, data.answeredPlayers || 0);
                }
            } else if (questionType === 'true-false') {
                this.showTrueFalseStatistics();
                const trueCount = data.answerCounts['true'] || data.answerCounts[0] || 0;
                const falseCount = data.answerCounts['false'] || data.answerCounts[1] || 0;
                logger.debug(`True/False counts: true=${trueCount}, false=${falseCount}`);
                this.updateStatItem(0, trueCount, data.answeredPlayers || 0);
                this.updateStatItem(1, falseCount, data.answeredPlayers || 0);
            } else if (questionType === 'numeric') {
                this.showNumericStatistics(data.answerCounts);
            }
        }
    }


    /**
     * Show statistics for multiple choice questions
     */
    showMultipleChoiceStatistics(optionCount) {
        this.showHostStatistics('multiple-choice', { optionCount });
    }

    /**
     * Show statistics for true/false questions
     */
    showTrueFalseStatistics() {
        this.showHostStatistics('true-false');
    }

    /**
     * Show statistics for numeric questions
     */
    showNumericStatistics(answerCounts) {
        this.showHostStatistics('numeric', { answerCounts });
    }

    /**
     * Create custom statistics display for numeric answers
     */
    createNumericStatisticsDisplay(answerCounts, sortedAnswers) {
        const statsContent = document.getElementById('stats-grid');
        if (!statsContent) return;

        // Create or update numeric stats display
        let numericStatsDiv = document.getElementById('numeric-stats-display');
        if (!numericStatsDiv) {
            numericStatsDiv = document.createElement('div');
            numericStatsDiv.id = 'numeric-stats-display';
            numericStatsDiv.className = 'numeric-stats-display';
            statsContent.appendChild(numericStatsDiv);
        }

        // Clear previous content
        numericStatsDiv.innerHTML = '';

        if (sortedAnswers.length === 0) {
            numericStatsDiv.innerHTML = `<div class="no-answers">${getTranslation('no_answers_yet')}</div>`;
            return;
        }

        // Show up to 6 most common answers
        const maxDisplay = 6;
        const totalAnswers = Object.values(answerCounts).reduce((sum, count) => sum + count, 0);
        
        // Sort by count (descending) then by value (ascending)
        const sortedByCount = sortedAnswers.sort((a, b) => {
            const countDiff = answerCounts[b] - answerCounts[a];
            return countDiff !== 0 ? countDiff : parseFloat(a) - parseFloat(b);
        });

        const displayAnswers = sortedByCount.slice(0, maxDisplay);
        
        numericStatsDiv.innerHTML = `
            <div class="numeric-stats-header">
                <h4>${getTranslation('player_answers')}</h4>
            </div>
            <div class="numeric-answers-list">
                ${displayAnswers.map(answer => {
                    const count = answerCounts[answer];
                    const percentage = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
                    return `
                        <div class="numeric-answer-item">
                            <span class="answer-value">${answer}</span>
                            <div class="answer-bar-container">
                                <div class="answer-bar" style="width: ${percentage}%"></div>
                                <span class="answer-count">${count}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
                ${sortedAnswers.length > maxDisplay ? `
                    <div class="more-answers">
                        +${sortedAnswers.length - maxDisplay} ${getTranslation('more_answers')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Clear numeric statistics display when switching to non-numeric questions
     */
    clearNumericStatisticsDisplay() {
        const numericStatsDiv = document.getElementById('numeric-stats-display');
        if (numericStatsDiv) {
            numericStatsDiv.remove();
        }
    }

    /**
     * Show statistics for host display - consolidated method
     * @param {string} type - Question type: 'multiple-choice', 'true-false', or 'numeric'
     * @param {Object} options - Configuration object
     * @param {number} [options.optionCount] - Number of options for multiple choice
     * @param {Object} [options.answerCounts] - Answer counts for numeric questions
     */
    showHostStatistics(type, options = {}) {
        const statsContent = document.getElementById('stats-grid');
        if (!statsContent) return;

        // Always clear numeric display first
        this.clearNumericStatisticsDisplay();

        switch (type) {
            case 'multiple-choice':
                this.setupMultipleChoiceStats(options.optionCount);
                break;
            case 'true-false':
                this.setupTrueFalseStats();
                break;
            case 'numeric':
                this.setupNumericStats(options.answerCounts);
                break;
            default:
                logger.warn('Unknown statistics type:', type);
        }
    }

    /**
     * Setup multiple choice statistics display
     */
    setupMultipleChoiceStats(optionCount) {
        for (let i = 0; i < 4; i++) {
            const statItem = document.getElementById(`stat-item-${i}`);
            const optionLabel = statItem?.querySelector('.option-label');
            
            if (statItem && optionLabel) {
                if (i < optionCount) {
                    statItem.style.display = 'flex';
                    optionLabel.textContent = translationManager.getOptionLetter(i);
                    this.resetStatItemValues(statItem);
                } else {
                    statItem.style.display = 'none';
                }
            }
        }
    }

    /**
     * Setup true/false statistics display
     */
    setupTrueFalseStats() {
        const tfTexts = getTrueFalseText();
        for (let i = 0; i < 4; i++) {
            const statItem = document.getElementById(`stat-item-${i}`);
            const optionLabel = statItem?.querySelector('.option-label');
            
            if (statItem && optionLabel) {
                if (i === 0) {
                    statItem.style.display = 'flex';
                    optionLabel.textContent = tfTexts.true;
                    this.resetStatItemValues(statItem);
                } else if (i === 1) {
                    statItem.style.display = 'flex';
                    optionLabel.textContent = tfTexts.false;
                    this.resetStatItemValues(statItem);
                } else {
                    statItem.style.display = 'none';
                }
            }
        }
    }

    /**
     * Setup numeric statistics display
     */
    setupNumericStats(answerCounts) {
        // Hide all regular stat items
        for (let i = 0; i < 4; i++) {
            const statItem = document.getElementById(`stat-item-${i}`);
            if (statItem) {
                statItem.style.display = 'none';
            }
        }

        // Create custom numeric display
        const answers = Object.keys(answerCounts || {});
        const sortedAnswers = answers.sort((a, b) => parseFloat(a) - parseFloat(b));
        this.createNumericStatisticsDisplay(answerCounts, sortedAnswers);
    }

    /**
     * Reset stat item values to defaults
     */
    resetStatItemValues(statItem) {
        const statCount = statItem.querySelector('.stat-count');
        const statFill = statItem.querySelector('.stat-fill');
        if (statCount) statCount.textContent = '0';
        if (statFill) statFill.style.width = '0%';
    }

    /**
     * Update individual statistic item
     */
    updateStatItem(index, count, totalAnswered) {
        const statCount = document.getElementById(`stat-count-${index}`);
        const statFill = document.getElementById(`stat-fill-${index}`);
        
        logger.debug(`updateStatItem: index=${index}, count=${count}, totalAnswered=${totalAnswered}`);
        
        if (statCount) {
            statCount.textContent = count;
            logger.debug(`Updated stat count for index ${index}: ${count}`);
        } else {
            logger.warn(`stat-count-${index} element not found`);
        }
        
        if (statFill) {
            if (totalAnswered > 0) {
                const percentage = (count / totalAnswered) * ANIMATION.PERCENTAGE_CALCULATION_BASE;
                statFill.style.width = `${percentage}%`;
                logger.debug(`Updated stat fill for index ${index}: ${percentage}%`);
            } else {
                statFill.style.width = '0%';
            }
        } else {
            logger.warn(`stat-fill-${index} element not found`);
        }
    }

    /**
     * Hide answer statistics
     */
    hideAnswerStatistics() {
        const statisticsContainer = document.getElementById('answer-statistics');
        if (statisticsContainer) {
            statisticsContainer.style.display = 'none';
        }
    }

    /**
     * Show leaderboard
     */
    showLeaderboard(leaderboard) {
        // Use the updateLeaderboardDisplay method for consistency
        this.updateLeaderboardDisplay(leaderboard);
        
        // Show leaderboard screen
        const gameState = this.stateManager.getGameState();
        this.navigationService.navigateBasedOnState(gameState, 'leaderboard');
    }

    /**
     * Show final results
     */
    showFinalResults(leaderboard) {
        logger.debug('🎉 showFinalResults called with leaderboard:', leaderboard);
        logger.debug('🎉 isHost:', this.stateManager.getGameState().isHost, 'fanfarePlayed:', this.fanfarePlayed);
        
        // Prevent multiple fanfare plays
        if (this.fanfarePlayed) {
            logger.debug('🎉 Fanfare already played, skipping');
            return;
        }
        this.fanfarePlayed = true;
        
        // Update leaderboard display first
        this.updateLeaderboardDisplay(leaderboard);
        
        const gameState = this.stateManager.getGameState();
        if (gameState.isHost) {
            logger.debug('🎉 HOST: Showing final results with confetti');
            
            // Host gets full celebration with confetti and sounds
            const finalResults = document.getElementById('final-results');
            if (finalResults) {
                logger.debug('🎉 HOST: final-results element found, showing animation');
                finalResults.classList.remove('hidden');
                finalResults.classList.add('game-complete-animation');
                
                // Remove animation class after animation completes
                setTimeout(() => {
                    finalResults.classList.remove('game-complete-animation');
                }, 2000);
            } else {
                logger.error('🎉 HOST: final-results element NOT FOUND!');
            }
            
            // Switch to leaderboard screen first to ensure proper display context
            logger.debug('🎉 HOST: Switching to leaderboard-screen');
            this.navigationService.navigateTo('leaderboard-screen');
            
            // Show confetti celebration after screen switch with minimal delay
            setTimeout(() => {
                logger.debug('🎉 HOST: Triggering confetti...');
                this.showGameCompleteConfetti();
            }, 100); // Reduced from 200ms to 100ms for snappier response
            
            // Play special game ending fanfare
            logger.debug('🎉 HOST: Playing fanfare...');
            this.playGameEndingFanfare();
            
            // Save results to server for later download
            this.saveGameResults(leaderboard);
            
            // Show simple results downloader with longer delay to ensure results are saved
            setTimeout(() => {
                logger.debug('🎉 HOST: Initializing results downloader...');
                simpleResultsDownloader.showDownloadTool();
            }, 3000); // Wait for animations and results saving to complete
            
        } else {
            logger.debug('🎉 PLAYER: Showing player final screen with confetti');
            
            // Players get a dedicated final screen with special ending sound
            logger.debug('🎉 PLAYER: Player final screen - leaderboard:', leaderboard);
            this.playGameEndingFanfare();
            this.showPlayerFinalScreen(leaderboard);
        }
        
        // Mark game as ended
        this.gameEnded = true;
        logger.debug('🎉 Final results display completed');
    }

    /**
     * Update leaderboard display (from monolithic version)
     */
    updateLeaderboardDisplay(leaderboard) {
        const leaderboardList = dom.get('leaderboard-list');
        if (!leaderboardList) return;
        
        dom.clearContent('leaderboard-list');
        
        leaderboard.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            if (index === 0) item.classList.add('first');
            else if (index === 1) item.classList.add('second');
            else if (index === 2) item.classList.add('third');
            
            const position = index + 1;
            const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
            
            item.innerHTML = `
                <span>${medal} ${this.escapeHtml(player.name)}</span>
                <span>${player.score} pts</span>
            `;
            
            leaderboardList.appendChild(item);
        });
    }

    /**
     * Show player final screen (from monolithic version)
     */
    showPlayerFinalScreen(leaderboard) {
        logger.debug('showPlayerFinalScreen called with:', leaderboard);
        
        // Find player's position in the final leaderboard
        let playerPosition = -1;
        let playerScore = 0;
        
        // Get player's socket ID to find their position
        const playerId = this.socket.id;
        logger.debug('Player ID:', playerId);
        
        if (leaderboard && Array.isArray(leaderboard)) {
            leaderboard.forEach((player, index) => {
                if (player.id === playerId) {
                    playerPosition = index + 1;
                    playerScore = player.score;
                    logger.debug('Found player position:', playerPosition, 'score:', playerScore);
                }
            });
        }
        
        // Update final position display
        if (playerPosition > 0) {
            dom.setContent('final-position', `#${playerPosition}`);
        }
        dom.setContent('final-score', `${playerScore} ${getTranslation('points')}`);
        
        // Update top 3 players display
        this.updateFinalLeaderboard(leaderboard.slice(0, 3));
        
        // Add confetti celebration for all players
        this.showGameCompleteConfetti();
        
        logger.debug('Switching to player-final-screen');
        this.navigationService.navigateTo('player-final-screen');
    }

    /**
     * Update final leaderboard (top 3 players)
     */
    updateFinalLeaderboard(topPlayers) {
        const leaderboardContainer = document.getElementById('final-leaderboard');
        if (!leaderboardContainer) return;
        
        leaderboardContainer.innerHTML = '';
        
        topPlayers.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'final-leaderboard-item';
            
            const position = index + 1;
            const medal = ['🥇', '🥈', '🥉'][index] || '🏅';
            
            item.innerHTML = `
                <span class="medal">${medal}</span>
                <span class="player-name">${this.escapeHtml(player.name)}</span>
                <span class="player-score">${player.score} pts</span>
            `;
            
            if (position === 1) item.classList.add('first');
            else if (position === 2) item.classList.add('second');
            else if (position === 3) item.classList.add('third');
            
            leaderboardContainer.appendChild(item);
        });
    }

    // Image display now handled directly by GameDisplayManager

    /**
     * Show game complete confetti (from monolithic version)
     */
    showGameCompleteConfetti() {
        logger.debug('🎊 showGameCompleteConfetti called');
        
        if (!window.confetti) {
            logger.error('🎊 ERROR: Confetti library not loaded! Cannot show confetti.');
            return;
        }
        
        logger.debug('🎊 Confetti library loaded, starting celebration...');
        logger.debug('CONFETTI DEBUG: showGameCompleteConfetti() called');
        
        // Optimized confetti with timed bursts instead of continuous animation
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
        
        try {
            // Initial big burst
            logger.debug('🎊 Firing initial confetti burst...');
            confetti({
                particleCount: ANIMATION.CONFETTI_PARTICLE_COUNT,
                spread: ANIMATION.CONFETTI_SPREAD,
                origin: { y: ANIMATION.CONFETTI_ORIGIN_Y },
                colors: colors
            });
            
            // Reduced side bursts for better performance - only 3 bursts instead of 5
            const burstTimes = [400, 800, 1200]; // Fewer, well-timed confetti bursts
            logger.debug('🎊 Scheduling', burstTimes.length, 'additional confetti bursts...');
            
            burstTimes.forEach((time, index) => {
                setTimeout(() => {
                    logger.debug(`🎊 Firing confetti burst ${index + 1}/${burstTimes.length} at ${time}ms`);
                    confetti({
                        particleCount: ANIMATION.CONFETTI_BURST_PARTICLES,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0 },
                        colors: colors
                    });
                    confetti({
                        particleCount: ANIMATION.CONFETTI_BURST_PARTICLES,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1 },
                        colors: colors
                    });
                }, time);
            });
            
            logger.debug('🎊 All confetti bursts scheduled successfully!');
        } catch (error) {
            logger.error('🎊 ERROR: Failed to show confetti:', error);
        }
    }


    /**
     * Play game ending fanfare (from monolithic version)
     */
    playGameEndingFanfare() {
        if (this.soundManager.soundsEnabled) {
            this.soundManager.playVictorySound();
        }
    }

    /**
     * Update players list
     */
    updatePlayersList(players) {
        logger.debug('updatePlayersList called with:', players);
        const playersListElement = document.getElementById('players-list');
        logger.debug('playersListElement found:', !!playersListElement);
        if (!playersListElement) {
            logger.debug('players-list element not found');
            return;
        }
        
        // Handle case where players is undefined or not an array
        if (!players || !Array.isArray(players)) {
            logger.debug('Players list is undefined or not an array:', players);
            return;
        }
        
        playersListElement.innerHTML = '';
        
        players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            playerElement.innerHTML = `
                <div class="player-avatar">👤</div>
                <div class="player-name">${this.escapeHtml(player.name)}</div>
            `;
            playersListElement.appendChild(playerElement);
        });
        
        // Update player count in lobby with animation
        const lobbyPlayerCount = document.getElementById('lobby-player-count');
        if (lobbyPlayerCount) {
            // Add a simple scale animation for number changes
            const currentCount = parseInt(lobbyPlayerCount.textContent) || 0;
            const newCount = players.length;
            
            if (currentCount !== newCount) {
                lobbyPlayerCount.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    lobbyPlayerCount.textContent = newCount;
                    lobbyPlayerCount.style.transform = 'scale(1)';
                }, 150);
            }
        }
        
        // Update legacy player count (for compatibility) - but check if element exists
        const legacyPlayerCount = document.getElementById('player-count');
        if (legacyPlayerCount) {
            dom.setContent('player-count', players.length);
        }
    }

    /**
     * Update timer display
     */
    updateTimerDisplay(timeRemaining) {
        this.timerManager.updateTimerDisplay(timeRemaining);
    }

    /**
     * Start game timer
     */
    startTimer(duration, onTick = null, onComplete = null) {
        return this.timerManager.startTimer(duration, onTick, onComplete);
    }

    /**
     * Stop game timer
     */
    stopTimer() {
        this.timerManager.stopTimer();
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Reset game state
     */
    resetGameState() {
        // IMPORTANT: Preserve this.currentQuiz for analytics - DON'T reset it here!
        // The currentQuiz data contains question metadata needed for detailed analytics
        logger.debug('🔄 Resetting game state. Preserving currentQuiz for analytics:', {
            hasCurrentQuiz: !!this.currentQuiz,
            questionsCount: this.currentQuiz?.questions?.length
        });
        
        this.currentQuestion = null;
        this.selectedAnswer = null;
        this.playerAnswers.clear();
        this.gameEnded = false;
        this.resultShown = false;
        this.stopTimer();
        
        // CRITICAL FIX: Reset the modular state manager too!
        // This was causing the new game restart bug where stale state from
        // previous games would interfere with new games
        this.stateManager.reset();
        
        // Reset all game modules to ensure clean state for new games
        if (this.interactionManager) {
            this.interactionManager.reset();
        }
        // Timer is already reset by this.stopTimer() call above
        
        // Reset fanfare played flag for new games
        this.fanfarePlayed = false;
        
        // Hide the CSV download tool from previous game
        simpleResultsDownloader.hideDownloadTool();
        
        // Hide final results overlay from previous game
        const finalResults = document.getElementById('final-results');
        if (finalResults) {
            finalResults.classList.add('hidden');
            finalResults.classList.remove('game-complete-animation');
        }
        
        // 🔧 FIX: Clear player list UI to prevent phantom players from previous game
        const playersListElement = document.getElementById('players-list');
        if (playersListElement) {
            playersListElement.innerHTML = '';
            logger.debug('🧹 Cleared player list UI during game reset');
        }
        
        // Reset player count displays
        const lobbyPlayerCount = document.getElementById('lobby-player-count');
        if (lobbyPlayerCount) {
            lobbyPlayerCount.textContent = '0';
        }
        const legacyPlayerCount = document.getElementById('player-count');
        if (legacyPlayerCount) {
            legacyPlayerCount.textContent = '0';
        }
        
        // Clean up event listeners and timers when resetting game
        this.cleanup();
        
        logger.debug('🔄 Complete game state reset - both main and modular state managers');
    }

    /**
     * Set player info
     */
    setPlayerInfo(name, isHost = false) {
        this.stateManager.setPlayerName(name);
        this.stateManager.setHostMode(isHost);
        logger.debug('PlayerInfo', { name, isHost });
    }

    /**
     * Get player name from state manager
     */
    get playerName() {
        return this.stateManager.playerName;
    }

    /**
     * Set game pin
     */
    setGamePin(pin) {
        this.stateManager.setGamePin(pin);
    }

    /**
     * Set quiz title for results saving
     */
    setQuizTitle(title) {
        this.currentQuizTitle = title;
        logger.debug('Quiz title set:', title);
    }

    /**
     * Set quiz data for results export
     */
    setQuizData(quiz) {
        logger.debug('📊 setQuizData called:', {
            hasQuiz: !!quiz,
            questionsCount: quiz?.questions?.length,
            quizTitle: quiz?.title,
            quizId: quiz?.id
        });
        this.currentQuiz = quiz;
        
        // Store quiz title separately as backup for results
        if (quiz?.title) {
            this.currentQuizTitle = quiz.title;
        }
        
        logger.debug('📊 currentQuiz set successfully - analytics data preserved');
    }

    /**
     * Mark game start time for results saving
     */
    markGameStartTime() {
        this.gameStartTime = new Date().toISOString();
        logger.debug('Game start time marked:', this.gameStartTime);
    }

    // ==================== MEMORY MANAGEMENT METHODS ====================

    /**
     * Add event listener with automatic tracking for cleanup
     */
    addEventListenerTracked(element, event, handler, options = {}) {
        if (!element || typeof element.addEventListener !== 'function') {
            logger.warn('Invalid element passed to addEventListenerTracked:', element);
            return;
        }

        // Add the event listener
        element.addEventListener(event, handler, options);
        
        // Track for cleanup
        if (!this.eventListeners.has(element)) {
            this.eventListeners.set(element, []);
        }
        this.eventListeners.get(element).push({ event, handler, options });
        
        logger.debug(`Tracked event listener: ${event} on`, element);
    }

    /**
     * Create timer with automatic tracking for cleanup
     */
    createTimerTracked(callback, interval, isInterval = false) {
        const timer = isInterval ? setInterval(callback, interval) : setTimeout(callback, interval);
        this.timers.add(timer);
        
        // logger.debug(`Tracked ${isInterval ? 'interval' : 'timeout'}:`, timer);
        return timer;
    }


    /**
     * Remove tracked event listener
     */
    removeEventListenerTracked(element, event, handler) {
        if (!element) return;

        element.removeEventListener(event, handler);
        
        const listeners = this.eventListeners.get(element);
        if (listeners) {
            const index = listeners.findIndex(l => l.event === event && l.handler === handler);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this.eventListeners.delete(element);
                }
            }
        }
    }

    /**
     * Clear specific timer
     */
    clearTimerTracked(timer) {
        if (this.timers.has(timer)) {
            clearTimeout(timer); // Works for both setTimeout and setInterval
            clearInterval(timer);
            this.timers.delete(timer);
            // logger.debug('Cleared tracked timer:', timer);
        }
    }

    /**
     * Comprehensive cleanup method - removes all tracked event listeners, timers, and references
     */
    cleanup() {
        logger.debug('GameManager cleanup started');
        
        try {
            // Clear all tracked event listeners
            let listenerCount = 0;
            this.eventListeners.forEach((listeners, element) => {
                listeners.forEach(({ event, handler }) => {
                    try {
                        element.removeEventListener(event, handler);
                        listenerCount++;
                    } catch (error) {
                        logger.warn('Error removing event listener:', error);
                    }
                });
            });
            this.eventListeners.clear();
            logger.debug(`Cleaned up ${listenerCount} event listeners`);

            // Clear all tracked timers
            let timerCount = 0;
            this.timers.forEach(timer => {
                try {
                    clearTimeout(timer);
                    clearInterval(timer);
                    timerCount++;
                } catch (error) {
                    logger.warn('Error clearing timer:', error);
                }
            });
            this.timers.clear();
            // logger.debug(`Cleaned up ${timerCount} timers`);

            

            // Clear game state
            this.playerAnswers.clear();
            this.currentQuestion = null;
            this.selectedAnswer = null;

            // Clear main timer if it exists
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }

            // Remove page unload listeners
            if (typeof window !== 'undefined') {
                window.removeEventListener('beforeunload', this.cleanup);
                window.removeEventListener('unload', this.cleanup);
            }

            logger.debug('GameManager cleanup completed successfully');
        } catch (error) {
            logger.error('Error during GameManager cleanup:', error);
        }
    }

    /**
     * Safe DOM manipulation that doesn't destroy event listeners
     */
    safeSetContent(element, content) {
        if (!element) return;

        // Clear existing content while preserving structure
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }

        // Set new content
        if (typeof content === 'string') {
            element.innerHTML = content;
        } else if (content && content.nodeType) {
            element.appendChild(content);
        }
    }

    /**
     * Create element with tracked event listeners
     */
    createElementWithEvents(tagName, attributes = {}, events = {}) {
        const element = document.createElement(tagName);
        
        // Set attributes
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else {
                element.setAttribute(key, value);
            }
        });

        // Add tracked event listeners
        Object.entries(events).forEach(([event, handler]) => {
            this.addEventListenerTracked(element, event, handler);
        });

        return element;
    }

    // ==================== ERROR STATE METHODS ====================

    /**
     * Show error state when question display fails
     */
    showQuestionErrorState() {
        try {
            const containers = ['current-question', 'player-question-text'];
            containers.forEach(containerId => {
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = `
                        <div class="error-state">
                            <p>⚠️ ${getTranslation('question_load_error')}</p>
                            <p>Please wait for the next question...</p>
                        </div>
                    `;
                }
            });

            // Hide all option containers
            document.querySelectorAll('.player-options, .answer-options').forEach(container => {
                container.style.display = 'none';
            });
        } catch (error) {
            logger.error('Failed to show question error state:', error);
        }
    }

    /**
     * Show error state when player result display fails
     */
    showResultErrorState() {
        try {
            const resultElement = document.getElementById('answer-feedback');
            if (resultElement) {
                resultElement.classList.remove('hidden');
                resultElement.style.backgroundColor = '#f39c12'; // Orange for error
                
                const messageElement = document.getElementById('feedback-message');
                if (messageElement) {
                    messageElement.textContent = '⚠️ Result display error';
                }
                
                // Hide after delay
                setTimeout(() => {
                    resultElement.classList.add('hidden');
                }, 3000);
            }
        } catch (error) {
            logger.error('Failed to show result error state:', error);
        }
    }

    /**
     * Set static timer display when timer fails
     */
    setStaticTimerDisplay(seconds) {
        this.timerManager.setStaticTimerDisplay(seconds);
    }
    
    // ===============================
    // DEBUG METHODS - Call from browser console
    // ===============================
    
    /**
     * Debug game state - call debugGame() from console
     */

    
    /**
     * Debug MathJax state - call debugMathJax() from console
     */

    
    /**
     * Debug LaTeX elements - call debugLatex() from console
     */


    /**
     * Save game results to server for later download
     */
    async saveGameResults(leaderboard) {
        try {
            const gameState = this.stateManager.getGameState();
            
            // Only save results if we're the host and have game data
            if (!gameState.isHost || !gameState.gamePin) {
                logger.debug('📊 Not saving results - not host or no game PIN');
                return;
            }

            // Get quiz title from the game data (if available)
            const quizTitle = this.currentQuizTitle || gameState.quizTitle || 'Unknown Quiz';
            
            // Prepare results data for saving
            const resultsData = {
                quizTitle: quizTitle,
                gamePin: gameState.gamePin,
                results: leaderboard || [],
                startTime: this.gameStartTime || new Date().toISOString(),
                endTime: new Date().toISOString()
            };

            // Debug: Check what quiz data we have
            logger.debug('📊 Quiz data debug:', {
                hasCurrentQuiz: !!this.currentQuiz,
                currentQuizKeys: this.currentQuiz ? Object.keys(this.currentQuiz) : null,
                hasQuestions: !!(this.currentQuiz && this.currentQuiz.questions),
                questionsLength: this.currentQuiz?.questions?.length,
                sampleQuestion: this.currentQuiz?.questions?.[0]
            });

            // Add questions data if available for detailed analytics
            if (this.currentQuiz && this.currentQuiz.questions) {
                logger.debug('📊 Including questions data for analytics:', this.currentQuiz.questions.length, 'questions');
                resultsData.questions = this.currentQuiz.questions.map((q, index) => ({
                    questionNumber: index + 1,
                    text: q.question || q.text,
                    type: q.type || 'multiple-choice',
                    correctAnswer: q.correctAnswer || q.correctAnswers,
                    difficulty: q.difficulty || 'medium'
                }));
            } else {
                logger.debug('📊 No questions data available - CSV will use basic format');
            }

            logger.debug('📊 Saving game results:', {
                quizTitle: resultsData.quizTitle,
                gamePin: resultsData.gamePin,
                playerCount: resultsData.results.length
            });

            // Save results to server
            const response = await fetch(APIHelper.getApiUrl('api/save-results'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(resultsData)
            });

            if (response.ok) {
                const result = await response.json();
                logger.debug('📊 Results saved successfully:', result.filename);
            } else {
                const errorText = await response.text();
                logger.error('📊 Failed to save results:', response.status, errorText);
            }

        } catch (error) {
            logger.error('📊 Error saving game results:', error);
        }
    }
}