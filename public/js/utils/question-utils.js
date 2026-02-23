/**
 * Question Utilities Module
 * Handles question creation and manipulation utilities
 *
 * Note: Extraction/population logic has been moved to QuestionTypeRegistry
 * This file now only contains utilities for question HTML generation and answer randomization
 */

import { logger } from '../core/config.js';

export class QuestionUtils {
    /**
     * Generate HTML for a new question
     * @param {number} questionCount - The index of the question being created
     * @returns {string} - HTML string for the question
     */
    generateQuestionHTML(questionCount) {
        return `
            <div class="question-header" onclick="toggleQuestionCollapse(this.parentElement)">
                <span class="collapse-indicator"></span>
                <h3><span data-translate="question">Question</span> ${questionCount + 1}</h3>
                <div class="collapsed-meta">
                    <span class="collapsed-type-badge">Multiple</span>
                    <span class="collapsed-difficulty-badge">M</span>
                </div>
                <div class="question-header-actions">
                    <button type="button" class="btn-icon btn-remove" onclick="event.stopPropagation(); removeQuestion(this)" title="Remove question" data-translate-title="remove_question_tooltip">✕</button>
                </div>
            </div>
            <div class="question-body">
            <div class="question-meta">
                <select class="question-type" onchange="updateQuestionType(this)">
                    <option value="multiple-choice" data-translate="multiple_choice">Multiple Choice</option>
                    <option value="multiple-correct" data-translate="multiple_correct">Multiple Correct Answers</option>
                    <option value="true-false" data-translate="true_false">True/False</option>
                    <option value="numeric" data-translate="numeric_answer">Numeric Answer</option>
                    <option value="ordering" data-translate="ordering">Ordering</option>
                </select>

                <select class="question-difficulty">
                    <option value="easy" data-translate="easy">Easy</option>
                    <option value="medium" selected data-translate="medium">Medium</option>
                    <option value="hard" data-translate="hard">Hard</option>
                </select>

                <div class="concept-tags-container">
                    <label data-translate="concepts">Concepts</label>
                    <div class="concept-tags-input">
                        <div class="concept-tags-list"></div>
                        <input type="text" class="concept-input" placeholder="Add concept..." data-translate-placeholder="add_concept" maxlength="30">
                    </div>
                    <div class="concept-hint" data-translate="concept_hint">Press Enter to add (max 5)</div>
                </div>

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

                <div class="video-section hidden">
                    <div class="video-tabs">
                        <button type="button" class="video-tab active" data-target="question">Question Animation</button>
                        <button type="button" class="video-tab" data-target="explanation">Explanation Animation</button>
                    </div>
                    <div class="video-panel" data-panel="question">
                        <div class="manim-code-editor">
                            <label>Manim Code:</label>
                            <textarea class="manim-code question-manim-code" placeholder="from manim import *&#10;class MyScene(Scene):&#10;    def construct(self):&#10;        ..." rows="6"></textarea>
                            <div class="manim-actions">
                                <button type="button" class="render-manim-btn" data-placement="question">Render Animation</button>
                                <span class="render-status hidden"></span>
                            </div>
                        </div>
                        <div class="video-preview hidden">
                            <video class="question-video" controls preload="metadata"></video>
                            <button type="button" class="remove-video" data-placement="question">Remove Video</button>
                        </div>
                    </div>
                    <div class="video-panel hidden" data-panel="explanation">
                        <div class="manim-code-editor">
                            <label>Manim Code:</label>
                            <textarea class="manim-code explanation-manim-code" placeholder="from manim import *&#10;class ExplainScene(Scene):&#10;    def construct(self):&#10;        ..." rows="6"></textarea>
                            <div class="manim-actions">
                                <button type="button" class="render-manim-btn" data-placement="explanation">Render Animation</button>
                                <span class="render-status hidden"></span>
                            </div>
                        </div>
                        <div class="video-preview hidden">
                            <video class="explanation-video" controls preload="metadata"></video>
                            <button type="button" class="remove-video" data-placement="explanation">Remove Video</button>
                        </div>
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

            <div class="answer-options ordering-options" style="display: none;">
                <div class="ordering-instruction" data-translate="ordering_instruction">Enter items in the correct order (top to bottom):</div>
                <div class="ordering-items">
                    <div class="ordering-item" data-order="0">
                        <span class="ordering-handle">☰</span>
                        <input type="text" class="ordering-option" data-option="0" placeholder="First item" data-translate-placeholder="ordering_item_1">
                        <span class="ordering-number">1</span>
                    </div>
                    <div class="ordering-item" data-order="1">
                        <span class="ordering-handle">☰</span>
                        <input type="text" class="ordering-option" data-option="1" placeholder="Second item" data-translate-placeholder="ordering_item_2">
                        <span class="ordering-number">2</span>
                    </div>
                    <div class="ordering-item" data-order="2">
                        <span class="ordering-handle">☰</span>
                        <input type="text" class="ordering-option" data-option="2" placeholder="Third item" data-translate-placeholder="ordering_item_3">
                        <span class="ordering-number">3</span>
                    </div>
                    <div class="ordering-item" data-order="3">
                        <span class="ordering-handle">☰</span>
                        <input type="text" class="ordering-option" data-option="3" placeholder="Fourth item" data-translate-placeholder="ordering_item_4">
                        <span class="ordering-number">4</span>
                    </div>
                </div>
            </div>

            <div class="explanation-section">
                <details>
                    <summary data-translate="explanation_optional">Explanation (optional)</summary>
                    <textarea class="question-explanation" placeholder="Explain why the correct answer is correct..." data-translate-placeholder="explanation_placeholder"></textarea>
                </details>
            </div>
            </div>
        `;
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
                    // Support both correctAnswer and correctIndex (server prefers correctIndex)
                    const oldCorrectIndex = question.correctIndex !== undefined
                        ? question.correctIndex
                        : question.correctAnswer;
                    const newCorrectIndex = shuffledIndices.indexOf(oldCorrectIndex);
                    // Update BOTH fields to ensure consistency with server
                    newQuestion.correctAnswer = newCorrectIndex;
                    newQuestion.correctIndex = newCorrectIndex;
                } else if (question.type === 'multiple-correct') {
                    // Map all correct answer indices to their new positions
                    // Support both correctAnswers and correctIndices (server prefers correctIndices)
                    const oldCorrectAnswers = question.correctIndices || question.correctAnswers || [];
                    const newCorrectAnswers = oldCorrectAnswers.map(oldIndex =>
                        shuffledIndices.indexOf(oldIndex)
                    ).sort();
                    // Update BOTH fields to ensure consistency with server
                    newQuestion.correctAnswers = newCorrectAnswers;
                    newQuestion.correctIndices = newCorrectAnswers;
                }

                return newQuestion;
            }

            // Return unchanged for true-false and numeric questions
            return question;
        });
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

    // Trigger custom event
    const event = new CustomEvent('questionAdded', {
        detail: { questionCount: newQuestionCount }
    });
    document.dispatchEvent(event);

    // Navigate to the new question
    if (window.navigateToNewQuestion) {
        window.navigateToNewQuestion();
    }

    return questionDiv;
}

/**
 * Create a question element
 * @returns {HTMLElement} The created question element
 */
export function createQuestionElement() {
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-item';

    const questionCount = document.querySelectorAll('.question-item').length;
    questionDiv.setAttribute('data-question', questionCount);

    questionDiv.innerHTML = questionUtils.generateQuestionHTML(questionCount);

    // Note: Translation is handled by the caller to ensure proper timing

    return questionDiv;
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
