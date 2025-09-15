/**
 * Mobile Quiz Controls - Bottom Sheet and FAB Management for Mobile Quiz Editor
 * Provides mobile-friendly interface for quiz management actions
 */

// Mobile quiz sheet state management
let mobileQuizSheetVisible = false;
let isShowingSheet = false; // Prevent double-clicks

/**
 * Show the mobile quiz actions bottom sheet
 */
function showMobileQuizSheet() {
    // Prevent rapid successive clicks
    if (isShowingSheet) {
        console.debug('Sheet already opening, ignoring click');
        return;
    }
    
    const overlay = document.getElementById('mobile-quiz-sheet-overlay');
    const sheet = document.getElementById('mobile-quiz-sheet');
    const fab = document.getElementById('mobile-quiz-fab');
    
    if (!overlay || !sheet) {
        console.warn('Mobile quiz sheet elements not found');
        return;
    }
    
    // Mark as opening and disable FAB temporarily
    isShowingSheet = true;
    if (fab) {
        fab.classList.add('clicking');
    }
    
    // Show overlay first
    overlay.classList.add('active');
    
    // Add active class after a small delay for smooth animation
    setTimeout(() => {
        sheet.classList.add('active');
        
        // Reset the click protection after animation
        setTimeout(() => {
            isShowingSheet = false;
            if (fab) {
                fab.classList.remove('clicking');
            }
        }, 200);
    }, 10);
    
    mobileQuizSheetVisible = true;
    
    // Update translations for the mobile quiz sheet
    if (typeof translationManager !== 'undefined' && translationManager.updateGameTranslations) {
        // Use setTimeout to ensure DOM is fully rendered before translation updates
        setTimeout(() => {
            translationManager.updateGameTranslations();
        }, 50);
    }
    
    // Prevent body scroll when sheet is open
    document.body.style.overflow = 'hidden';
}

/**
 * Hide the mobile quiz actions bottom sheet
 */
function hideMobileQuizSheet() {
    const overlay = document.getElementById('mobile-quiz-sheet-overlay');
    const sheet = document.getElementById('mobile-quiz-sheet');
    const fab = document.getElementById('mobile-quiz-fab');
    
    if (!overlay || !sheet) return;
    
    // Reset click protection
    isShowingSheet = false;
    if (fab) {
        fab.classList.remove('clicking');
    }
    
    // Clear any active/focus states from buttons
    const activeButtons = sheet.querySelectorAll('.mobile-quiz-action-btn:focus, .mobile-quiz-secondary-btn:focus');
    activeButtons.forEach(btn => btn.blur());
    
    // Remove active class from sheet first
    sheet.classList.remove('active');
    
    // Remove overlay after animation completes
    setTimeout(() => {
        overlay.classList.remove('active');
    }, 300);
    
    mobileQuizSheetVisible = false;
    
    // Restore body scroll
    document.body.style.overflow = '';
}

/**
 * Toggle mobile quiz sheet visibility
 */
function toggleMobileQuizSheet() {
    if (mobileQuizSheetVisible) {
        hideMobileQuizSheet();
    } else {
        showMobileQuizSheet();
    }
}

/**
 * Clear button focus states to prevent persistent highlighting
 */
function clearButtonStates() {
    // Clear focus from all buttons in the sheet
    const allButtons = document.querySelectorAll('.mobile-quiz-action-btn, .mobile-quiz-secondary-btn');
    allButtons.forEach(btn => {
        btn.blur();
        btn.style.transform = '';
        btn.classList.remove('active');
    });
}

/**
 * Handle mobile load quiz action
 */
function handleMobileLoadQuiz() {
    clearButtonStates();
    hideMobileQuizSheet();
    
    // Small delay to ensure sheet is hidden before showing modal
    setTimeout(() => {
        // Use existing load quiz functionality
        if (typeof showLoadQuizModal === 'function') {
            showLoadQuizModal();
        } else if (document.getElementById('toolbar-load')) {
            // Trigger the existing load button click
            document.getElementById('toolbar-load').click();
        } else {
            console.warn('Load quiz functionality not available');
        }
    }, 100);
}

/**
 * Handle mobile save quiz action
 */
function handleMobileSaveQuiz() {
    clearButtonStates();
    hideMobileQuizSheet();
    
    // Use existing save quiz functionality
    if (typeof saveQuiz === 'function') {
        saveQuiz();
    } else if (document.getElementById('toolbar-save')) {
        // Trigger the existing save button click
        document.getElementById('toolbar-save').click();
    } else {
        console.warn('Save quiz functionality not available');
    }
}

/**
 * Handle mobile start game action
 */
function handleMobileStartGame() {
    clearButtonStates();
    hideMobileQuizSheet();
    
    // Check if we have questions first
    const questions = document.querySelectorAll('.question-item');
    if (questions.length === 0) {
        alert(translationManager.getTranslationSync('please_add_question_alert') || 'Please add at least one question before starting the game.');
        return;
    }
    
    // Check if quiz has a title
    const quizTitle = document.getElementById('quiz-title');
    if (quizTitle && !quizTitle.value.trim()) {
        if (!confirm(translationManager.getTranslationSync('confirm_start_without_title') || 'Your quiz doesn\'t have a title. Start anyway?')) {
            return;
        }
    }
    
    // Use existing start game functionality
    if (typeof startHosting === 'function') {
        startHosting();
    } else if (document.getElementById('start-hosting-header-small')) {
        // Trigger the existing start game button
        document.getElementById('start-hosting-header-small').click();
    } else {
        // Look for any start game button
        const startButton = document.querySelector('[data-translate="create_lobby"], [onclick*="startHosting"], .start-game-header');
        if (startButton) {
            startButton.click();
        } else {
            console.warn('Start game functionality not available');
        }
    }
}

/**
 * Handle mobile preview action
 */
function handleMobilePreview() {
    clearButtonStates();
    hideMobileQuizSheet();
    
    // Use existing preview functionality
    if (typeof togglePreviewMode === 'function') {
        togglePreviewMode();
    } else if (document.getElementById('toolbar-preview')) {
        document.getElementById('toolbar-preview').click();
    } else {
        console.warn('Preview functionality not available');
    }
}

/**
 * Handle mobile AI generator action
 */
function handleMobileAI() {
    clearButtonStates();
    hideMobileQuizSheet();
    
    // Use existing AI generator functionality
    if (document.getElementById('toolbar-ai-gen')) {
        document.getElementById('toolbar-ai-gen').click();
    } else {
        console.warn('AI generator not available');
    }
}

/**
 * Handle mobile import action
 */
function handleMobileImport() {
    clearButtonStates();
    hideMobileQuizSheet();
    
    // Use existing import functionality
    if (document.getElementById('toolbar-import')) {
        document.getElementById('toolbar-import').click();
    } else if (document.getElementById('import-file-input')) {
        document.getElementById('import-file-input').click();
    } else {
        console.warn('Import functionality not available');
    }
}

/**
 * Handle mobile export action
 */
function handleMobileExport() {
    clearButtonStates();
    hideMobileQuizSheet();
    
    // Use existing export functionality
    if (document.getElementById('toolbar-export')) {
        document.getElementById('toolbar-export').click();
    } else {
        console.warn('Export functionality not available');
    }
}

/**
 * Handle mobile results action
 */
function handleMobileResults() {
    clearButtonStates();
    hideMobileQuizSheet();
    
    // Use existing results functionality
    if (document.getElementById('toolbar-results')) {
        document.getElementById('toolbar-results').click();
    } else {
        console.warn('Results functionality not available');
    }
}

/**
 * Scroll to bottom of quiz editor
 */
function scrollToBottom() {
    clearButtonStates();
    hideMobileQuizSheet();
    
    // Scroll to the bottom of the page
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
    });
}

/**
 * Initialize mobile quiz controls
 */
function initializeMobileQuizControls() {
    // Add event listeners for swipe to close on the sheet
    const sheet = document.getElementById('mobile-quiz-sheet');
    if (sheet) {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        
        sheet.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            isDragging = true;
        }, { passive: true });
        
        sheet.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            
            // Only allow downward swipe to close
            if (deltaY > 0) {
                const progress = Math.min(deltaY / 100, 1);
                sheet.style.transform = `translateY(${deltaY}px)`;
                sheet.style.opacity = 1 - (progress * 0.3);
            }
        }, { passive: true });
        
        sheet.addEventListener('touchend', () => {
            if (!isDragging) return;
            
            const deltaY = currentY - startY;
            
            // If swiped down more than 80px, close the sheet
            if (deltaY > 80) {
                hideMobileQuizSheet();
            } else {
                // Snap back to original position
                sheet.style.transform = '';
                sheet.style.opacity = '';
            }
            
            isDragging = false;
            startY = 0;
            currentY = 0;
        }, { passive: true });
    }
    
    // Close sheet when clicking outside
    document.addEventListener('click', (e) => {
        if (mobileQuizSheetVisible && 
            !e.target.closest('#mobile-quiz-sheet') && 
            !e.target.closest('#mobile-quiz-fab')) {
            hideMobileQuizSheet();
        }
    });
    
    // Handle escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileQuizSheetVisible) {
            hideMobileQuizSheet();
        }
    });
}

// Make functions globally available
window.showMobileQuizSheet = showMobileQuizSheet;
window.hideMobileQuizSheet = hideMobileQuizSheet;
window.toggleMobileQuizSheet = toggleMobileQuizSheet;
window.handleMobileLoadQuiz = handleMobileLoadQuiz;
window.handleMobileSaveQuiz = handleMobileSaveQuiz;
window.handleMobileStartGame = handleMobileStartGame;
window.handleMobilePreview = handleMobilePreview;
window.handleMobileAI = handleMobileAI;
window.handleMobileImport = handleMobileImport;
window.handleMobileExport = handleMobileExport;
window.handleMobileResults = handleMobileResults;
window.scrollToBottom = scrollToBottom;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMobileQuizControls);
} else {
    initializeMobileQuizControls();
}

export {
    showMobileQuizSheet,
    hideMobileQuizSheet,
    toggleMobileQuizSheet,
    handleMobileLoadQuiz,
    handleMobileSaveQuiz,
    handleMobileStartGame,
    handleMobilePreview,
    handleMobileAI,
    handleMobileImport,
    handleMobileExport,
    handleMobileResults,
    scrollToBottom,
    initializeMobileQuizControls
};