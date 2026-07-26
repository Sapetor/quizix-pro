/**
 * Question editing / DOM population
 *
 * Building, populating, and editing question DOM elements in the quiz builder:
 * add/remove question elements, per-type population, concept tags, image
 * handling, translation-key cleaning, and AI-generated question insertion.
 *
 * Extracted from quiz-manager.js as a move-and-delegate refactor. QuizManager
 * keeps thin methods that call these functions; functions that need shared
 * state or helpers on the manager take the manager instance as their first
 * argument. Cross-references between these functions call the module functions
 * directly (each is also mirrored by a manager delegate, so behavior matches).
 */

import { translationManager } from '../../utils/translation-manager.js';
import { createQuestionElement } from '../../utils/question-utils.js';
import { logger, TIMING } from '../../core/config.js';
import { imagePathResolver, loadImageWithRetry as sharedLoadImageWithRetry } from '../../utils/image-path-resolver.js';
import { QuestionTypeRegistry } from '../../utils/question-type-registry.js';
import { dom, escapeHtml, show, hide } from '../../utils/dom.js';
import { manimEditor } from '../manim-editor.js';

// Shared translation fallback map used for cleaning translation keys from loaded data
const TRANSLATION_FALLBACKS = {
    'multiple_choice': 'Multiple Choice',
    'multiple_correct': 'Multiple Correct Answers',
    'true_false': 'True/False',
    'numeric': 'Numeric Answer',
    'easy': 'Easy',
    'medium': 'Medium',
    'hard': 'Hard',
    'time_seconds': 'Time (sec)',
    'add_image': 'Add Image',
    'remove_image': 'Remove Image',
    'remove': 'Remove',
    'a_is_correct': 'A is correct',
    'b_is_correct': 'B is correct',
    'c_is_correct': 'C is correct',
    'd_is_correct': 'D is correct',
    'true': 'True',
    'false': 'False',
    'question': 'Question',
    'enter_question_preview': 'Enter your question above to see preview',
    'enter_question_with_latex': 'Enter your question (supports LaTeX and code blocks)',
    'toggle_live_preview': 'Live Preview',
    'close_live_preview': 'Close Live Preview'
};

/**
 * Combined update method for questions UI - prevents visual glitches
 * Updates both remove button visibility and question numbering in single operation
 */
export function updateQuestionsUI(_manager) {
    const questionsContainer = dom.get('questions-container');
    if (!questionsContainer) return;

    const questionItems = questionsContainer.querySelectorAll('.question-item');
    const hasMultipleQuestions = questionItems.length > 1;

    logger.debug(`updateQuestionsUI: Found ${questionItems.length} questions, hasMultipleQuestions: ${hasMultipleQuestions}`);

    questionItems.forEach((questionItem, index) => {
        // Update data-question attribute only if needed
        if (questionItem.getAttribute('data-question') !== index.toString()) {
            questionItem.setAttribute('data-question', index);

            // Update the question heading with proper translation
            const questionHeading = questionItem.querySelector('h3');
            if (questionHeading) {
                questionHeading.innerHTML = `<span data-translate="question">Question</span> ${index + 1}`;
                translationManager.translateContainer(questionHeading);
            }
        }

        // Header ✕ removes the question; hide it when it's the only one left
        const removeButton = questionItem.querySelector('.btn-remove');
        if (removeButton) {
            removeButton.classList.toggle('hidden', !hasMultipleQuestions);
        }
    });

    logger.debug(`Updated questions UI for ${questionItems.length} questions`);
}

/**
 * Add question from data object
 */
export function addQuestionFromData(manager, questionData) {
    const questionsContainer = dom.get('questions-container');
    if (!questionsContainer) return;

    const questionElement = createQuestionElement(questionData);
    questionsContainer.appendChild(questionElement);

    // Initialize video section for the new question element
    manimEditor.initVideoSection(questionElement);

    // Clean translation keys from text content WITHOUT using innerHTML
    // This preserves the DOM structure and form field values
    cleanTranslationKeysInElement(questionElement);

    logger.debug('Cleaned translation keys from question element');

    // Populate the question data
    populateQuestionElement(manager, questionElement, questionData);

    // Translate the individual question element after populating data
    translationManager.translateContainer(questionElement);
}

/**
 * Replace translation keys in text with fallback values
 * @returns {string|null} Replaced text if changes made, null otherwise
 */
export function replaceTranslationKeys(text) {
    if (!text) return null;

    let result = text;
    let changed = false;

    for (const [key, value] of Object.entries(TRANSLATION_FALLBACKS)) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        if (regex.test(result)) {
            result = result.replace(regex, value);
            changed = true;
        }
    }

    return changed ? result : null;
}

/**
 * Clean translation keys from an element without destroying DOM structure
 */
export function cleanTranslationKeysInElement(element) {
    // Clean text content in text nodes (preserving DOM structure)
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }

    textNodes.forEach(textNode => {
        const replaced = replaceTranslationKeys(textNode.textContent);
        if (replaced) {
            textNode.textContent = replaced;
        }
    });

    // Clean placeholder attributes
    element.querySelectorAll('[placeholder]').forEach(el => {
        const replaced = replaceTranslationKeys(el.getAttribute('placeholder'));
        if (replaced) {
            el.setAttribute('placeholder', replaced);
        }
    });
}

/**
 * Clean translation keys from loaded data (legacy method for backward compatibility)
 */
export function cleanTranslationKeys(htmlString) {
    return replaceTranslationKeys(htmlString) || htmlString;
}

/**
 * Populate question element with data
 */
export function populateQuestionElement(manager, questionElement, questionData) {
    logger.debug('Populating question element with data:', questionData);

    populateBasicQuestionData(manager, questionElement, questionData);
    populateQuestionImage(manager, questionElement, questionData);
    populateTypeSpecificData(manager, questionElement, questionData);

    // Populate video/Manim data
    if (questionData.video || questionData.videoManimCode || questionData.explanationVideo || questionData.explanationVideoManimCode) {
        manimEditor.populateVideoData(questionElement, questionData);
    }
}

/**
 * Populate basic question data (text, type, time, difficulty)
 */
export function populateBasicQuestionData(manager, questionElement, questionData) {
    // Set question text
    const questionText = questionElement.querySelector('.question-text');
    if (questionText) {
        questionText.value = questionData.question || '';
        logger.debug('Set question text:', questionData.question);
    } else {
        logger.warn('Question text element not found');
    }

    // Set question type
    const questionType = questionElement.querySelector('.question-type');
    if (questionType) {
        questionType.value = questionData.type || 'multiple-choice';
        // Trigger change event to update UI
        questionType.dispatchEvent(new Event('change'));
    }

    // Set question time (with NaN protection)
    // Match the selector used in extractQuestionData: .question-time-limit
    const questionTime = questionElement.querySelector('.question-time-limit');
    if (questionTime) {
        // Support both 'timeLimit' (new) and 'time' (old) for backward compatibility
        const timeValue = parseInt(questionData.timeLimit || questionData.time, 10);
        questionTime.value = !isNaN(timeValue) && timeValue > 0 ? timeValue : 30;
    }

    // Set question difficulty
    const questionDifficulty = questionElement.querySelector('.question-difficulty');
    if (questionDifficulty) {
        questionDifficulty.value = questionData.difficulty || 'medium';
    }

    // Set explanation (optional field from AI generator or manual entry)
    const questionExplanation = questionElement.querySelector('.question-explanation');
    if (questionExplanation && questionData.explanation) {
        questionExplanation.value = questionData.explanation;
        logger.debug('Set explanation:', questionData.explanation.substring(0, 50) + '...');
    }

    // Ensure concept container exists (for backward compatibility with old questions)
    // and populate concept tags if present
    ensureConceptTagsContainer(questionElement);
    if (questionData.concepts && Array.isArray(questionData.concepts)) {
        populateConceptTags(manager, questionElement, questionData.concepts);
    }
}

/**
 * Ensure concept tags container exists in question element
 * @param {HTMLElement} questionElement - The question DOM element
 * @returns {HTMLElement|null} The concept-tags-list element
 */
export function ensureConceptTagsContainer(questionElement) {
    let tagsList = questionElement.querySelector('.concept-tags-list');
    if (tagsList) return tagsList;

    // Container doesn't exist - inject it (for backward compatibility with old questions)
    const questionMeta = questionElement.querySelector('.question-meta');
    if (!questionMeta) return null;

    const container = document.createElement('div');
    container.className = 'concept-tags-container';
    container.innerHTML = `
        <label data-translate="concepts">Concepts</label>
        <div class="concept-tags-input">
            <div class="concept-tags-list"></div>
            <input type="text" class="concept-input" placeholder="Add concept..." data-translate-placeholder="add_concept" maxlength="30">
        </div>
        <div class="concept-hint" data-translate="concept_hint">Press Enter to add (max 5)</div>
    `;

    // Insert before time-limit-container
    const timeContainer = questionMeta.querySelector('.time-limit-container');
    if (timeContainer) {
        questionMeta.insertBefore(container, timeContainer);
    } else {
        questionMeta.appendChild(container);
    }

    // Note: Event handling uses document-level delegation (see setupEventDelegation)
    // so no specific listener setup needed for the new input

    logger.debug('Injected concept-tags-container for backward compatibility');
    return container.querySelector('.concept-tags-list');
}

/**
 * Populate concept tags in question element
 * @param {HTMLElement} questionElement - The question DOM element
 * @param {string[]} concepts - Array of concept strings
 */
export function populateConceptTags(manager, questionElement, concepts) {
    const tagsList = ensureConceptTagsContainer(questionElement);
    if (!tagsList) return;

    tagsList.innerHTML = '';
    concepts.slice(0, 5).forEach(concept => {
        createConceptTag(manager, tagsList, concept, false);
    });
    logger.debug('Populated concept tags:', concepts);
}

/**
 * Create a concept tag element and append to container
 * @param {HTMLElement} tagsList - The container for tags
 * @param {string} concept - The concept text
 * @param {boolean} triggerAutoSave - Whether to trigger auto-save on removal
 * @returns {HTMLElement} The created tag element
 */
export function createConceptTag(manager, tagsList, concept, triggerAutoSave = true) {
    const tag = document.createElement('span');
    tag.className = 'concept-tag';
    tag.dataset.concept = concept;
    tag.innerHTML = `${escapeHtml(concept)}<button type="button" class="concept-tag-remove" aria-label="Remove">×</button>`;

    tag.querySelector('.concept-tag-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        tag.remove();
        if (triggerAutoSave) {
            manager.scheduleAutoSave();
        }
    });

    tagsList.appendChild(tag);
    return tag;
}

/**
 * Populate question image data with proper error handling
 */
export function populateQuestionImage(manager, questionElement, questionData) {
    if (!questionData.image) return;

    logger.debug('Populating image for question:', questionData.image, 'WebP:', questionData.imageWebp);
    const imageElement = questionElement.querySelector('.question-image');
    const imagePreview = questionElement.querySelector('.image-preview');

    if (!imageElement || !imagePreview) {
        logger.debug('Image elements not found in question DOM');
        return;
    }

    // Use WebP version for display if available (better compression)
    const displayImage = questionData.imageWebp || questionData.image;
    const imageSrc = resolveImageSource(displayImage);
    setupImageElement(imageElement, imageSrc, questionData.image, questionData.imageWebp);
    setupImageHandlers(manager, imageElement, imagePreview, questionData.image);

    show(imagePreview, 'visible-block');
    logger.debug('Image populated:', imageElement.src);
}

/**
 * Resolve image source from various formats using centralized resolver
 * Delegates to imagePathResolver for consistent path handling
 */
export function resolveImageSource(imageData) {
    return imagePathResolver.toDisplayPath(imageData);
}

/**
 * Set up image element with source and data attributes
 * @param {HTMLImageElement} imageElement - The image element
 * @param {string} imageSrc - The display source URL
 * @param {string} originalImageData - The original image storage path
 * @param {string|null} webpImageData - The WebP image storage path (if available)
 */
export function setupImageElement(imageElement, imageSrc, originalImageData, webpImageData = null) {
    imageElement.src = imageSrc;
    imageElement.dataset.url = originalImageData;
    if (webpImageData) {
        imageElement.dataset.webpUrl = webpImageData;
    }
}

/**
 * Set up image error and load handlers
 */
export function setupImageHandlers(manager, imageElement, imagePreview, imageData) {
    // Add load success handler first
    imageElement.onload = () => {
        logger.debug('✅ Quiz builder image loaded successfully:', imageData);
        show(imagePreview, 'visible-block');
    };

    // Set up retry logic similar to preview renderer
    loadImageWithRetry(manager, imageElement, imageElement.src, 3, 1, imagePreview, imageData);
}

/**
 * Handle image load errors with user-friendly messaging
 */
export function handleImageLoadError(manager, imageElement, imagePreview, imageData) {
    // Prevent infinite loop - remove error handler after first failure
    imageElement.onerror = null;

    logger.warn('⚠️ Quiz builder image failed to load:', imageData);

    // Hide the broken image
    hide(imageElement);

    // Create or update error message
    showImageErrorMessage(imagePreview, imageData);

    // Keep preview visible with error message
    show(imagePreview, 'visible-block');
    logger.debug('Shown image error message in quiz builder');
}

/**
 * Load image with retry logic for WSL environments (delegates to shared utility)
 */
export function loadImageWithRetry(manager, img, src, maxRetries = 3, _attempt = 1, imagePreview = null, imageData = '') {
    sharedLoadImageWithRetry(img, src, {
        maxRetries,
        useCacheBuster: true,
        onError: () => {
            handleImageLoadError(manager, img, imagePreview, imageData || src);
        }
    });
}

/**
 * Show user-friendly image error message
 */
export function showImageErrorMessage(imagePreview, imageData) {
    let errorMsg = imagePreview.querySelector('.image-error-message');
    if (!errorMsg) {
        errorMsg = document.createElement('div');
        errorMsg.className = 'image-error-message';
        errorMsg.style.cssText = `
            padding: 15px;
            text-align: center;
            background: rgba(255, 255, 255, 0.05);
            border: 2px dashed rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            color: var(--text-primary);
            font-size: 0.85rem;
            margin: 5px 0;
        `;
        imagePreview.appendChild(errorMsg);
    }

    errorMsg.innerHTML = `
        <div style="margin-bottom: 6px;">📷 ${translationManager.getTranslationSync('image_not_found')}</div>
        <div style="font-size: 0.75rem; opacity: 0.7;">${imageData}</div>
        <div style="font-size: 0.7rem; opacity: 0.6; margin-top: 3px;">${translationManager.getTranslationSync('image_remove_or_upload')}</div>
    `;
}

/**
 * Populate type-specific question data with proper timing
 * Uses QuestionTypeRegistry for centralized population logic
 *
 * Note: AI generator may use different property names than QuestionTypeRegistry expects:
 * - AI uses correctAnswer/correctAnswers, registry expects correctIndex/correctIndices
 */
export function populateTypeSpecificData(manager, questionElement, questionData) {
    setTimeout(() => {
        logger.debug('Populating type-specific data for:', questionData.type);

        // Normalize property names from AI generator to match QuestionTypeRegistry expectations
        const normalizedData = normalizeQuestionData(questionData);

        QuestionTypeRegistry.populateQuestion(questionData.type, questionElement, normalizedData);
    }, TIMING.DOM_UPDATE_DELAY);
}

/**
 * Normalize question data property names
 * Maps AI generator output to QuestionTypeRegistry expected format
 */
export function normalizeQuestionData(questionData) {
    const normalized = { ...questionData };

    switch (questionData.type) {
        case 'multiple-choice':
            // AI uses correctAnswer (index), registry expects correctIndex
            if (normalized.correctAnswer !== undefined && normalized.correctIndex === undefined) {
                normalized.correctIndex = normalized.correctAnswer;
                logger.debug('Normalized correctAnswer -> correctIndex:', normalized.correctIndex);
            }
            break;

        case 'multiple-correct':
            // AI uses correctAnswers (array), registry expects correctIndices
            if (normalized.correctAnswers !== undefined && normalized.correctIndices === undefined) {
                normalized.correctIndices = normalized.correctAnswers;
                logger.debug('Normalized correctAnswers -> correctIndices:', normalized.correctIndices);
            }
            break;

        case 'true-false':
            // AI may use string "true"/"false", registry expects boolean
            if (typeof normalized.correctAnswer === 'string') {
                normalized.correctAnswer = normalized.correctAnswer.toLowerCase() === 'true';
                logger.debug('Normalized true-false correctAnswer string -> boolean:', normalized.correctAnswer);
            }
            break;

        // numeric already uses correctAnswer as number, which matches registry
    }

    return normalized;
}

/**
 * Add a generated question from AI generator
 * @param {Object} questionData - Generated question data
 * @param {boolean} showAlerts - Whether to show success alerts
 */
export function addGeneratedQuestion(manager, questionData, _showAlerts = true) {
    logger.debug('🔧 AddGeneratedQuestion - Starting with question:', {
        type: questionData.type,
        question: questionData.question?.substring(0, 50) + '...'
    });

    const questionElements = document.querySelectorAll('.question-item');

    // Check if there's an empty default question we can replace
    const firstQuestion = questionElements[0];
    if (firstQuestion && isEmptyQuestion(firstQuestion)) {
        logger.debug('🔧 AddGeneratedQuestion - Using existing empty question');

        // Use same processing as addQuestionFromData for consistency
        cleanTranslationKeysInElement(firstQuestion);
        populateQuestionElement(manager, firstQuestion, questionData);
        translationManager.translateContainer(firstQuestion);
        // Update preview after populating (programmatic value changes don't fire input events)
        manager.updatePreviewSafely();
        return Promise.resolve();
    }

    // Add a new question — return a Promise that resolves when population is done
    return new Promise((resolve, reject) => {
        logger.debug('🔧 AddGeneratedQuestion - Creating new question element');
        const addQuestion = manager._getAddQuestionFn();
        if (!addQuestion) {
            logger.error('addQuestion function not available');
            reject(new Error('addQuestion function not available'));
            return;
        }

        const initialCount = questionElements.length;
        addQuestion();

        // Use retry mechanism to find the newly added DOM element
        const maxRetries = 10;
        const retryDelay = TIMING.DOM_READY_CHECK;
        let retryCount = 0;

        const findAndPopulate = () => {
            const updatedQuestionElements = document.querySelectorAll('.question-item');

            if (updatedQuestionElements.length > initialCount) {
                const targetElement = updatedQuestionElements[updatedQuestionElements.length - 1];
                logger.debug('🔧 AddGeneratedQuestion - New element created, populating data');
                cleanTranslationKeysInElement(targetElement);
                populateQuestionElement(manager, targetElement, questionData);
                translationManager.translateContainer(targetElement);
                manager.updatePreviewSafely();
                resolve();
            } else if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(findAndPopulate, retryDelay);
            } else {
                logger.error('🔧 AddGeneratedQuestion - Failed to find new question element after retries');
                resolve(); // Resolve anyway to not block remaining questions
            }
        };

        // Start checking after initial delay
        setTimeout(findAndPopulate, TIMING.DOM_READY_CHECK);
    });
}

/**
 * Check if a question element is empty/default
 */
export function isEmptyQuestion(questionElement) {
    const questionText = questionElement.querySelector('.question-text')?.value?.trim();
    if (questionText) return false;

    const options = questionElement.querySelectorAll('.option');
    return Array.from(options).every(opt => !opt.value?.trim());
}
