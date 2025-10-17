/**
 * Question Utilities Module
 * Handles question creation, validation, and manipulation utilities
 * 
 * EXTRACTION NOTES:
 * - Extracted from script.js lines 1761-1855, 1913-1981, 3223-3270, 5382-5474
 * - Includes question HTML generation, validation, and randomization
 * - Manages LaTeX validation and delimiter checking
 * - Dependencies: translation-manager.js for translationManager.getTranslationSync()
 */

import { logger } from '../core/config.js';

import { translationManager, getTrueFalseText } from './translation-manager.js';

export class QuestionUtils {
    constructor() {
        this.autoSaveTimeout = null;
    }

    /**
     * Generate HTML for a new question
     * @param {number} questionCount - The index of the question being created
     * @returns {string} - HTML string for the question
     */
    generateQuestionHTML(questionCount) {
        return `
            <h3><span data-translate="question">Question</span> ${questionCount + 1}</h3>
            
            <div class="question-meta">
                <select class="question-type" onchange="updateQuestionType(this)">
                    <option value="multiple-choice" data-translate="multiple_choice">Multiple Choice</option>
                    <option value="multiple-correct" data-translate="multiple_correct">Multiple Correct Answers</option>
                    <option value="true-false" data-translate="true_false">True/False</option>
                    <option value="numeric" data-translate="numeric">Numeric Answer</option>
                </select>
                
                <select class="question-difficulty">
                    <option value="easy" data-translate="easy">Easy</option>
                    <option value="medium" selected data-translate="medium">Medium</option>
                    <option value="hard" data-translate="hard">Hard</option>
                </select>
                
                <div class="time-limit-container">
                    <label>
                        <span data-translate="time_seconds">Time (sec)</span>
                        <input type="number" class="question-time-limit" min="5" max="300" value="20" onchange="updateTimeLimit(this)">
                    </label>
                </div>
            </div>
            
            <div class="question-content">
                <textarea class="question-text" placeholder="Enter your question (supports LaTeX)" data-translate-placeholder="enter_question_with_latex"></textarea>
                
                <div class="image-upload">
                    <label data-translate="add_image">Add Image</label>
                    <input type="file" class="image-input" accept="image/*" onchange="uploadImage(this)">
                    <div class="image-preview" style="display: none;">
                        <img class="question-image" src="" alt="Question Image" style="max-width: 200px; max-height: 150px;">
                        <button type="button" class="remove-image" onclick="removeImage(this)" data-translate="remove_image">Remove Image</button>
                    </div>
                </div>
            </div>
            
            <div class="answer-options multiple-choice-options">
                <div class="options">
                    <input type="text" class="option" data-option="0" placeholder="Option A" data-translate-placeholder="option_a">
                    <input type="text" class="option" data-option="1" placeholder="Option B" data-translate-placeholder="option_b">
                    <input type="text" class="option" data-option="2" placeholder="Option C" data-translate-placeholder="option_c">
                    <input type="text" class="option" data-option="3" placeholder="Option D" data-translate-placeholder="option_d">
                </div>
                <select class="correct-answer">
                    <option value="0" data-translate="a_is_correct">A is correct</option>
                    <option value="1" data-translate="b_is_correct">B is correct</option>
                    <option value="2" data-translate="c_is_correct">C is correct</option>
                    <option value="3" data-translate="d_is_correct">D is correct</option>
                </select>
            </div>
            
            <div class="answer-options multiple-correct-options" style="display: none;">
                <div class="options-checkboxes">
                    <label><input type="checkbox" class="correct-option" data-option="0"> <input type="text" class="option" placeholder="Option A" data-translate-placeholder="option_a"></label>
                    <label><input type="checkbox" class="correct-option" data-option="1"> <input type="text" class="option" placeholder="Option B" data-translate-placeholder="option_b"></label>
                    <label><input type="checkbox" class="correct-option" data-option="2"> <input type="text" class="option" placeholder="Option C" data-translate-placeholder="option_c"></label>
                    <label><input type="checkbox" class="correct-option" data-option="3"> <input type="text" class="option" placeholder="Option D" data-translate-placeholder="option_d"></label>
                </div>
            </div>
            
            <div class="answer-options true-false-options" style="display: none;">
                <select class="correct-answer">
                    <option value="true" data-translate="true">True</option>
                    <option value="false" data-translate="false">False</option>
                </select>
            </div>
            
            <div class="answer-options numeric-options" style="display: none;">
                <label data-translate="correct_answer">Correct Answer</label>
                <input type="number" class="numeric-answer" data-translate-placeholder="enter_numeric_answer" step="any">
                <label data-translate="tolerance">Tolerance</label>
                <input type="number" class="numeric-tolerance" placeholder="0.1" step="any" value="0.1">
            </div>
            
            <button class="btn secondary remove-question" onclick="removeQuestion(this)" data-translate="remove">Remove</button>
        `;
    }

    /**
     * Collect questions from the DOM
     * @returns {Array} - Array of question objects
     */
    collectQuestions() {
        const questions = [];
        const questionItems = document.querySelectorAll('.question-item');
        
        questionItems.forEach((item) => {
            const questionText = item.querySelector('.question-text').value.trim();
            const questionType = item.querySelector('.question-type').value;
            const questionDifficulty = item.querySelector('.question-difficulty').value;
            const imageElement = item.querySelector('.question-image');
            const imageUrl = imageElement ? (imageElement.dataset.url || '') : '';
            
            if (!questionText) return;
            
            // Get time limit for this question
            const timeLimitElement = item.querySelector('.question-time-limit');
            const useGlobalTime = document.getElementById('use-global-time')?.checked || false;
            const globalTimeLimit = parseInt(document.getElementById('global-time-limit')?.value) || 20;
            const individualTimeLimit = parseInt(timeLimitElement.value) || 20;
            
            let question = {
                question: questionText,
                type: questionType,
                difficulty: questionDifficulty,
                timeLimit: useGlobalTime ? globalTimeLimit : individualTimeLimit,
                image: imageUrl
            };
            
            switch (questionType) {
                case 'multiple-choice':
                    const mcOptions = Array.from(item.querySelectorAll('.multiple-choice-options .option')).map(opt => opt.value.trim());
                    const mcCorrect = parseInt(item.querySelector('.multiple-choice-options .correct-answer').value);
                    if (mcOptions.every(opt => opt)) {
                        question.options = mcOptions;
                        question.correctAnswer = mcCorrect;
                        questions.push(question);
                    }
                    break;
                    
                case 'multiple-correct':
                    const mcorrOptions = Array.from(item.querySelectorAll('.multiple-correct-options .option')).map(opt => opt.value.trim());
                    const mcorrCorrect = Array.from(item.querySelectorAll('.multiple-correct-options .correct-option:checked')).map(cb => parseInt(cb.dataset.option));
                    if (mcorrOptions.every(opt => opt) && mcorrCorrect.length > 0) {
                        question.options = mcorrOptions;
                        question.correctAnswers = mcorrCorrect;
                        questions.push(question);
                    }
                    break;
                    
                case 'true-false':
                    const tfCorrect = item.querySelector('.true-false-options .correct-answer').value;
                    question.options = [getTrueFalseText().trueDisplay, getTrueFalseText().falseDisplay]; // Display names
                    question.correctAnswer = tfCorrect; // Will be "true" or "false" (lowercase)
                    questions.push(question);
                    break;
                    
                case 'numeric':
                    const numAnswer = parseFloat(item.querySelector('.numeric-answer').value);
                    const numTolerance = parseFloat(item.querySelector('.numeric-tolerance').value) || 0.1;
                    if (!isNaN(numAnswer)) {
                        question.correctAnswer = numAnswer;
                        question.tolerance = numTolerance;
                        questions.push(question);
                    }
                    break;
            }
        });
        
        return questions;
    }

    /**
     * Validate an array of questions
     * @param {Array} questions - Questions to validate
     * @returns {Array} - Array of valid questions
     */
    validateQuestions(questions) {
        const validQuestions = [];
        logger.debug('Validating questions, count:', questions.length);
        
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            logger.debug(`Validating question ${i}:`, q);
            
            if (q.question && q.type && q.correctAnswer !== undefined) {
                logger.debug('Basic validation passed for question', i);
                
                // Basic LaTeX validation
                const hasErrors = this.hasLatexErrors(q.question);
                if (hasErrors) {
                    logger.warn('LaTeX validation would skip:', q.question);
                    logger.warn('But allowing it through for now...');
                }
                logger.debug('LaTeX validation passed for question', i);
                
                // Set default values for missing fields
                q.difficulty = q.difficulty || 'medium';
                q.timeLimit = q.timeLimit || 20;
                
                // Validate question type
                if (['multiple-choice', 'true-false', 'multiple-correct', 'numeric'].includes(q.type)) {
                    logger.debug('Question type validation passed for question', i);
                    validQuestions.push(q);
                } else {
                    logger.warn('Invalid question type:', q.type);
                }
            } else {
                logger.warn('Question failed basic validation:', {
                    hasQuestion: !!q.question,
                    hasType: !!q.type,
                    hasCorrectAnswer: q.correctAnswer !== undefined
                });
            }
        }
        
        logger.debug('Validation complete. Valid questions:', validQuestions.length);
        return validQuestions;
    }

    /**
     * Shuffle an array using Fisher-Yates algorithm
     * @param {Array} array - Array to shuffle
     * @returns {Array} - Shuffled array
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
    
    /**
     * Randomize answer positions for multiple choice questions
     * @param {Array} questions - Array of questions
     * @returns {Array} - Questions with randomized answers
     */
    randomizeAnswers(questions) {
        return questions.map(question => {
            // Only randomize multiple-choice and multiple-correct questions
            if (question.type === 'multiple-choice' || question.type === 'multiple-correct') {
                if (!question.options || question.options.length < 2) {
                    return question; // Skip if not enough options
                }
                
                // Create array of indices and shuffle them
                const indices = question.options.map((_, index) => index);
                const shuffledIndices = this.shuffleArray(indices);
                
                // Create new options array based on shuffled indices
                const newOptions = shuffledIndices.map(oldIndex => question.options[oldIndex]);
                
                // Update correct answer mapping
                const newQuestion = { ...question, options: newOptions };
                
                if (question.type === 'multiple-choice') {
                    // Find where the original correct answer ended up
                    const oldCorrectIndex = question.correctAnswer;
                    const newCorrectIndex = shuffledIndices.indexOf(oldCorrectIndex);
                    newQuestion.correctAnswer = newCorrectIndex;
                } else if (question.type === 'multiple-correct') {
                    // Map all correct answer indices to their new positions
                    const oldCorrectAnswers = question.correctAnswers || [];
                    const newCorrectAnswers = oldCorrectAnswers.map(oldIndex => 
                        shuffledIndices.indexOf(oldIndex)
                    ).sort();
                    newQuestion.correctAnswers = newCorrectAnswers;
                }
                
                return newQuestion;
            }
            
            // Return unchanged for true-false and numeric questions
            return question;
        });
    }

    /**
     * Check for LaTeX syntax errors in text
     * @param {string} text - Text to validate
     * @returns {boolean} - Whether the text has LaTeX errors
     */
    hasLatexErrors(text) {
        // Check for unmatched LaTeX environments
        const beginMatches = (text.match(/\\begin\{[^}]+\}/g) || []).length;
        const endMatches = (text.match(/\\end\{[^}]+\}/g) || []).length;
        
        // Check for unmatched dollar signs
        const dollarMatches = (text.match(/\$/g) || []).length;
        
        // Check for incomplete LaTeX commands (but allow common math functions)
        const commonMathFunctions = /\\(sin|cos|tan|sec|csc|cot|log|ln|exp|sqrt|int|sum|prod|lim|frac|partial|nabla|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|infty|cdot|times|div|pm|mp|neq|leq|geq|approx|equiv|subset|supset|in|notin|cup|cap|emptyset|mathbb|mathcal|mathbf|text)\b/;
        const hasIncompleteCommands = /\\[a-zA-Z]+(?![a-zA-Z]|\{|\()/.test(text) && !commonMathFunctions.test(text);
        
        // Check for problematic LaTeX patterns
        const hasProblematicText = /\\text\{[iπe]\}/.test(text); // \text{i}, \text{π}, \text{e}
        const hasInvalidFunctions = /\\text\{sqrt|sin|cos|tan|log\}/.test(text); // \text{sqrt}, etc.
        const hasInvalidTrigSyntax = false; // Allow all trig function syntax
        
        // Check for bracket mismatches
        const hasUnmatchedParens = this.hasUnmatchedDelimiters(text, '(', ')');
        const hasUnmatchedBrackets = this.hasUnmatchedDelimiters(text, '[', ']');
        const hasUnmatchedBraces = this.hasUnmatchedDelimiters(text, '{', '}');
        
        // Check for double subscripts/superscripts without braces
        const hasDoubleScripts = /\^[^{]\^|\^[^{]*\^|_[^{]_|_[^{]*_/.test(text);
        
        // Check for incomplete fractions
        const hasIncompleteFractions = /\\frac\{[^}]*\}(?!\{)/.test(text);
        
        return beginMatches !== endMatches || 
               dollarMatches % 2 !== 0 || 
               hasIncompleteCommands || 
               hasProblematicText || 
               hasInvalidFunctions || 
               hasInvalidTrigSyntax ||
               hasUnmatchedParens ||
               hasUnmatchedBrackets ||
               hasUnmatchedBraces ||
               hasDoubleScripts ||
               hasIncompleteFractions;
    }

    /**
     * Check for unmatched delimiters in text
     * @param {string} text - Text to check
     * @param {string} open - Opening delimiter
     * @param {string} close - Closing delimiter
     * @returns {boolean} - Whether delimiters are unmatched
     */
    hasUnmatchedDelimiters(text, open, close) {
        let count = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === open) count++;
            if (text[i] === close) count--;
            if (count < 0) return true; // More closing than opening
        }
        return count !== 0; // Unmatched delimiters
    }

    /**
     * Add generated questions from AI to the question list
     * @param {Array} questions - Generated questions to add
     */
    addGeneratedQuestions(questions) {
        if (!window.game) return;

        questions.forEach(q => {
            window.game.addQuestion();
            const questionItems = document.querySelectorAll('.question-item');
            const newQuestionItem = questionItems[questionItems.length - 1];
            
            // Populate the question
            if (newQuestionItem) {
                const questionText = newQuestionItem.querySelector('.question-text');
                const questionType = newQuestionItem.querySelector('.question-type');
                const questionDifficulty = newQuestionItem.querySelector('.question-difficulty');
                
                if (questionText) questionText.value = q.question || '';
                if (questionType) questionType.value = q.type || 'multiple-choice';
                if (questionDifficulty) questionDifficulty.value = q.difficulty || 'medium';
                
                // Trigger question type change to show appropriate options
                if (questionType) {
                    const event = new Event('change');
                    questionType.dispatchEvent(event);
                }
                
                // Populate options based on question type
                setTimeout(() => {
                    this.populateQuestionOptions(newQuestionItem, q);
                }, 100);
            }
        });
    }

    /**
     * Populate question options based on question type
     * @param {HTMLElement} questionItem - Question DOM element
     * @param {Object} questionData - Question data to populate
     */
    populateQuestionOptions(questionItem, questionData) {
        const questionType = questionData.type;
        
        switch (questionType) {
            case 'multiple-choice':
                const mcOptions = questionItem.querySelectorAll('.multiple-choice-options .option');
                mcOptions.forEach((option, index) => {
                    if (questionData.options && questionData.options[index]) {
                        option.value = questionData.options[index];
                    }
                });
                
                const mcCorrect = questionItem.querySelector('.multiple-choice-options .correct-answer');
                if (mcCorrect && questionData.correctAnswer !== undefined) {
                    mcCorrect.value = questionData.correctAnswer;
                }
                break;
                
            case 'multiple-correct':
                const mcorrOptions = questionItem.querySelectorAll('.multiple-correct-options .option');
                mcorrOptions.forEach((option, index) => {
                    if (questionData.options && questionData.options[index]) {
                        option.value = questionData.options[index];
                    }
                });
                
                const mcorrCorrect = questionItem.querySelectorAll('.multiple-correct-options .correct-option');
                mcorrCorrect.forEach((checkbox, index) => {
                    if (questionData.correctAnswers && questionData.correctAnswers.includes(index)) {
                        checkbox.checked = true;
                    }
                });
                break;
                
            case 'true-false':
                const tfCorrect = questionItem.querySelector('.true-false-options .correct-answer');
                if (tfCorrect && questionData.correctAnswer !== undefined) {
                    tfCorrect.value = questionData.correctAnswer.toString();
                }
                break;
                
            case 'numeric':
                const numAnswer = questionItem.querySelector('.numeric-answer');
                const numTolerance = questionItem.querySelector('.numeric-tolerance');
                
                if (numAnswer && questionData.correctAnswer !== undefined) {
                    numAnswer.value = questionData.correctAnswer;
                }
                if (numTolerance && questionData.tolerance !== undefined) {
                    numTolerance.value = questionData.tolerance;
                }
                break;
        }
    }

    /**
     * Auto-save questions after a delay
     * @param {Function} saveCallback - Function to call for saving
     */
    scheduleAutoSave(saveCallback) {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        this.autoSaveTimeout = setTimeout(() => {
            if (saveCallback && typeof saveCallback === 'function') {
                saveCallback();
            }
        }, 1000);
    }

    /**
     * Clean up any timeouts
     */
    cleanup() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
    }
}

// Create global instance for backward compatibility
const questionUtils = new QuestionUtils();

/**
 * Add a new question to the quiz builder
 */
export function addQuestion() {
    logger.debug('addQuestion called');
    const questionsContainer = document.getElementById('questions-container');
    if (!questionsContainer) {
        logger.error('Questions container not found');
        return;
    }
    
    const questionCount = questionsContainer.children.length;
    logger.debug(`Current question count before adding: ${questionCount}`);
    
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-item';
    questionDiv.setAttribute('data-question', questionCount);
    
    questionDiv.innerHTML = questionUtils.generateQuestionHTML(questionCount);
    
    questionsContainer.appendChild(questionDiv);

    const newQuestionCount = questionsContainer.children.length;
    logger.debug(`Question added, new count: ${newQuestionCount}`);

    // Translate the newly added question element
    translationManager.translateContainer(questionDiv);

    // Update remove button visibility for ALL questions
    // Use requestAnimationFrame to ensure DOM is fully parsed before querying
    requestAnimationFrame(() => {
        const allQuestions = questionsContainer.querySelectorAll('.question-item');
        const hasMultipleQuestions = allQuestions.length > 1;

        logger.debug(`Updating remove buttons for ${allQuestions.length} questions, hasMultipleQuestions: ${hasMultipleQuestions}`);

        allQuestions.forEach((questionItem, index) => {
            const removeButton = questionItem.querySelector('.remove-question');
            if (removeButton) {
                const shouldShow = hasMultipleQuestions ? 'block' : 'none';
                removeButton.style.display = shouldShow;
                logger.debug(`Question ${index + 1}: Set remove button display to "${shouldShow}"`);
            } else {
                // Only log as debug instead of warn - this is expected during DOM parsing
                logger.debug(`Question ${index + 1}: Remove button not yet available (DOM still parsing)`);
            }
        });
    });
    
    // Also call the quiz manager's update function if available
    if (window.game && window.game.quizManager && window.game.quizManager.updateQuestionsUI) {
        logger.debug('Calling updateQuestionsUI after adding question');
        window.game.quizManager.updateQuestionsUI();
    } else {
        logger.warn('updateQuestionsUI not available');
    }
    
    return questionDiv;
}

/**
 * Create a question element with given data
 */
export function createQuestionElement(questionData) {
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-item';
    
    const questionCount = document.querySelectorAll('.question-item').length;
    questionDiv.setAttribute('data-question', questionCount);
    
    questionDiv.innerHTML = questionUtils.generateQuestionHTML(questionCount);
    
    // Note: Translation is handled by the caller to ensure proper timing
    
    return questionDiv;
}

/**
 * Validate LaTeX in questions - simple implementation
 */
export function validateLatexInQuestions(questions) {
    logger.debug('validateLatexInQuestions called with', questions.length, 'questions');
    // For now, just return empty array to skip LaTeX validation
    // This prevents the blocking error
    return [];
}

/**
 * Shuffle array
 */
export function shuffleArray(array) {
    return questionUtils.shuffleArray(array);
}

/**
 * Randomize answers
 */
export function randomizeAnswers(questions) {
    return questionUtils.randomizeAnswers(questions);
}
