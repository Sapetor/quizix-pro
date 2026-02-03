/**
 * Game Context - Dependency Injection Container
 *
 * Centralizes all game dependencies and provides a single injection point.
 * Simplifies GameManager construction and makes it testable.
 *
 * Benefits:
 * - Single source of truth for game module configuration
 * - Easier to test (mock dependencies by replacing context)
 * - Reduces GameManager constructor complexity
 * - Easier to add/remove dependencies globally
 */

import { logger } from '../core/config.js';
import { translationManager } from '../utils/translation-manager.js';
import { simpleMathJaxService } from '../utils/simple-mathjax-service.js';
import { modalFeedback } from '../utils/modal-feedback.js';
import { simpleResultsDownloader } from '../utils/simple-results-downloader.js';
import { APIHelper } from '../utils/api-helper.js';
import { unifiedErrorHandler } from '../utils/unified-error-handler.js';
import { EventListenerManager } from '../utils/event-listener-manager.js';
import QuestionTypeRegistry from '../utils/question-type-registry.js';
import { GameDisplayManager } from './modules/game-display-manager.js';
import { GameStateManager } from './modules/game-state-manager.js';
import { PlayerInteractionManager } from './modules/player-interaction-manager.js';
import { TimerManager } from './modules/timer-manager.js';
import { QuestionRenderer } from './modules/question-renderer.js';
import { AnswerRevealManager } from './modules/answer-reveal-manager.js';
import { LeaderboardManager } from './modules/leaderboard-manager.js';
import { PowerUpManager } from './modules/power-up-manager.js';
import { ConsensusManager } from './modules/consensus-manager.js';
import { DiscussionManager } from './modules/discussion-manager.js';

/**
 * GameContext - Provides all dependencies for game modules
 */
export class GameContext {
    constructor() {
        // Utility services (singletons)
        this.translationManager = translationManager;
        this.mathJaxService = simpleMathJaxService;
        this.modalFeedback = modalFeedback;
        this.resultsDownloader = simpleResultsDownloader;
        this.apiHelper = APIHelper;
        this.errorHandler = unifiedErrorHandler;
        this.questionTypeRegistry = QuestionTypeRegistry;

        // Game managers (instantiated per game)
        this.displayManager = null;
        this.stateManager = null;
        this.playerInteractionManager = null;
        this.timerManager = null;
        this.questionRenderer = null;
        this.answerRevealManager = null;
        this.leaderboardManager = null;
        this.powerUpManager = null;
        this.consensusManager = null;
        this.discussionManager = null;
        this.eventListenerManager = null;

        logger.debug('GameContext initialized');
    }

    /**
     * Initialize all game managers for a new game session
     * Called by GameManager constructor
     */
    initializeManagers() {
        try {
            // Create managers in dependency order
            this.eventListenerManager = new EventListenerManager();
            this.stateManager = new GameStateManager();
            this.displayManager = new GameDisplayManager();

            // Managers that depend on state/display
            this.playerInteractionManager = new PlayerInteractionManager(
                this.stateManager,
                this.displayManager,
                null, // soundManager - injected separately
                null  // socketManager - injected separately
            );

            this.timerManager = new TimerManager(this.stateManager, this.displayManager);
            this.questionRenderer = new QuestionRenderer(
                this.displayManager,
                this.stateManager,
                null, // uiManager - injected separately
                null  // gameManager - injected separately
            );

            this.answerRevealManager = new AnswerRevealManager(
                this.displayManager,
                this.stateManager
            );

            this.leaderboardManager = new LeaderboardManager(this.stateManager);
            this.powerUpManager = new PowerUpManager(this.stateManager);
            this.consensusManager = new ConsensusManager(this.stateManager);
            this.discussionManager = new DiscussionManager(this.stateManager);

            logger.debug('All game managers initialized');
        } catch (error) {
            logger.error('Error initializing game managers:', error);
            throw error;
        }
    }

    /**
     * Inject external dependencies (e.g., socket manager, sound manager)
     * Called by GameManager after construction
     */
    injectExternalDependencies(soundManager, socketManager, uiManager, gameManager) {
        this.playerInteractionManager.soundManager = soundManager;
        this.playerInteractionManager.socketManager = socketManager;
        this.questionRenderer.uiManager = uiManager;
        this.questionRenderer.gameManager = gameManager;
    }

    /**
     * Cleanup all managers
     * Called by GameManager.cleanup()
     */
    cleanup() {
        try {
            // Cleanup managers in reverse order
            if (this.discussionManager?.cleanup) this.discussionManager.cleanup();
            if (this.consensusManager?.cleanup) this.consensusManager.cleanup();
            if (this.powerUpManager?.cleanup) this.powerUpManager.cleanup();
            if (this.leaderboardManager?.cleanup) this.leaderboardManager.cleanup();
            if (this.answerRevealManager?.cleanup) this.answerRevealManager.cleanup();
            if (this.questionRenderer?.cleanup) this.questionRenderer.cleanup();
            if (this.timerManager?.cleanup) this.timerManager.cleanup();
            if (this.playerInteractionManager?.cleanup) this.playerInteractionManager.cleanup();
            if (this.displayManager?.cleanup) this.displayManager.cleanup();
            if (this.stateManager?.cleanup) this.stateManager.cleanup();
            if (this.eventListenerManager?.cleanup) this.eventListenerManager.cleanup();

            // Reset all references
            this.displayManager = null;
            this.stateManager = null;
            this.playerInteractionManager = null;
            this.timerManager = null;
            this.questionRenderer = null;
            this.answerRevealManager = null;
            this.leaderboardManager = null;
            this.powerUpManager = null;
            this.consensusManager = null;
            this.discussionManager = null;
            this.eventListenerManager = null;

            logger.debug('GameContext cleaned up');
        } catch (error) {
            logger.error('Error during GameContext cleanup:', error);
        }
    }

    /**
     * Get a manager by type (useful for testing/debugging)
     */
    getManager(managerType) {
        const managers = {
            'display': this.displayManager,
            'state': this.stateManager,
            'interaction': this.playerInteractionManager,
            'timer': this.timerManager,
            'renderer': this.questionRenderer,
            'reveal': this.answerRevealManager,
            'leaderboard': this.leaderboardManager,
            'powerup': this.powerUpManager,
            'consensus': this.consensusManager,
            'discussion': this.discussionManager,
            'events': this.eventListenerManager
        };

        const manager = managers[managerType];
        if (!manager) {
            logger.warn(`Unknown manager type: ${managerType}`);
        }
        return manager;
    }

    /**
     * Verify all required managers are initialized
     */
    verifyInitialization() {
        const requiredManagers = [
            'displayManager',
            'stateManager',
            'playerInteractionManager',
            'timerManager',
            'questionRenderer',
            'answerRevealManager',
            'leaderboardManager',
            'eventListenerManager'
        ];

        const uninitialized = requiredManagers.filter(mgr => !this[mgr]);
        if (uninitialized.length > 0) {
            logger.error('Uninitialized managers:', uninitialized);
            return false;
        }

        return true;
    }
}

export default new GameContext();
