# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**Quizix Pro** - Advanced interactive quiz platform for local networks with mobile optimization, cloud deployment, and modern ES6 architecture.

**Status**: Production-ready with comprehensive mobile optimizations, unified theme management, enhanced carousel functionality, multi-language support, and Railway cloud deployment.

**Recent Refactoring**:
- Weeks 1-3 and 5 complete (~1,466 lines removed/refactored). See `REFACTORING_ROADMAP.md` for details.
- Code simplification phase (SIMP-1 through SIMP-12) complete (~400 lines removed/refactored). See `simplify-tasks.md` for details.

## Commands

**Development:**
- `npm start` - Start production server
- `npm run dev` - Start development server with auto-restart

**Building:**
- `npm run build` - Build optimized CSS bundle
- `npm run build:prod` - Complete production build

**Debugging:**
- Logging controlled via `DEBUG.ENABLED` and `DEBUG.CURRENT_LEVEL` in `/public/js/core/config.js`
- Use `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()` instead of console statements
- Set `DEBUG.ENABLED = false` for production builds

## Architecture

**Core Structure:**
- **Modular ES6** with proper imports/exports
- **Service-oriented** architecture with dedicated services
- **Manager pattern** with single responsibility principle
- **Centralized configuration** in `public/js/core/config.js` (includes `COLORS` palette, `TIMING`, `SCORING`, `POWER_UPS` constants)
- **Unified error handling** via `unified-error-handler.js`
- **Encrypted security** layer for sensitive data

**Backend (Node.js/Express - server.js):**
- **1,229 lines** of production-grade server code (reduced 33% through refactoring)
- Service-oriented architecture with 8 dedicated backend services
- Socket.IO real-time multiplayer communication (100+ event handlers extracted to services)
- RESTful API with 15+ endpoints for quiz/results management
- QR code generation with caching
- Multer file upload with security validation (5MB limit)
- Compression middleware for mobile optimization
- Advanced logging with performance monitoring
- AI integration proxy (Claude, Ollama, HuggingFace)

**Key API Endpoints:**
- `POST /upload` - Secure image upload with cryptographic file naming
- `POST /api/save-quiz` - Persist quiz to disk as JSON (supports optional password)
- `GET /api/quizzes` - List all available quizzes
- `GET /api/quiz/:filename` - Load specific quiz data
- `POST /api/save-results` - Archive game results with metadata
- `GET /api/results` - List saved results with filtering
- `GET /api/qr/:pin` - Generate QR code with caching
- `POST /api/claude/generate` - AI question generation proxy (supports server-side API key)
- `GET /api/ai/config` - Check AI provider configuration status
- `GET /api/results/:filename/export/:format` - Export as CSV/JSON

**File Management API Endpoints:**
- `GET /api/quiz-tree` - Get full folder/quiz tree structure
- `POST /api/folders` - Create new folder
- `PATCH /api/folders/:id` - Rename folder
- `PATCH /api/folders/:id/move` - Move folder to different parent
- `DELETE /api/folders/:id` - Delete folder (with optional recursive delete)
- `POST /api/folders/:id/password` - Set/remove folder password
- `PATCH /api/quiz-metadata/:filename` - Update quiz display name or folder
- `POST /api/quiz-metadata/:filename/password` - Set/remove quiz password
- `DELETE /api/quiz/:filename` - Delete quiz file and metadata
- `POST /api/unlock` - Verify password and get session token
- `GET /api/requires-auth/:itemType/:itemId` - Check if item requires authentication

**Frontend Core Managers:**
- `public/js/core/app.js` - Application initialization (QuizGame class, 1193 lines)
- `public/js/game/game-manager.js` - Game flow and player interaction (1772 lines)
- `public/js/quiz/quiz-manager.js` - Quiz creation, editing, validation
- `public/js/ui/ui-manager.js` - Screen navigation and modal management
- `public/js/socket/socket-manager.js` - WebSocket event handling (633 lines)
- `public/js/settings/settings-manager.js` - Theme and settings persistence
- `public/js/audio/sound-manager.js` - Audio effects and notifications

**Game Submodules:**
- `public/js/game/modules/game-display-manager.js` - Question rendering and DOM updates
- `public/js/game/modules/game-state-manager.js` - Centralized state tracking
- `public/js/game/modules/player-interaction-manager.js` - Player answer handling
- `public/js/game/modules/timer-manager.js` - Question timer logic
- `public/js/game/modules/question-renderer.js` - Dynamic question display
- `public/js/game/modules/power-up-manager.js` - Power-up logic and UI management

**UI and Preview:**
- `public/js/ui/preview-manager.js` - Live preview modal with LaTeX rendering
- `public/js/ui/modules/preview-renderer.js` - Preview content generation

**Utility Modules:**
- `public/js/utils/question-type-registry.js` - **Centralized question type definitions** (validation, extraction, population, scoring)
- `public/js/utils/unified-error-handler.js` - Error boundary system with `wrapAsyncOperation()` and `safeExecute()` helpers
- `public/js/utils/translation-manager.js` - i18n with 9 languages
- `public/js/utils/math-renderer.js` - LaTeX/MathJax rendering
- `public/js/utils/image-path-resolver.js` - **Centralized image path handling for Kubernetes deployments**
- `public/js/utils/api-helper.js` - **Centralized API URL handling for Kubernetes path-based routing** (`getApiUrl`, `fetchAPI`, `fetchAPIJSON`)
- `public/js/utils/results-viewer.js` - Results viewing interface
- `public/js/utils/simple-results-downloader.js` - CSV/JSON export
- `public/js/utils/mobile-carousel.js` - Mobile quickstart carousel (6s intervals)
- `public/js/utils/main-menu-carousel.js` - Preview carousel (5s intervals)
- `public/js/utils/mobile-question-carousel.js` - Quiz editing carousel
- `public/js/utils/toast-notifications.js` - Toast notification system
- `public/js/utils/modal-feedback.js` - Modal result feedback
- `public/js/utils/modal-utils.js` - **SIMP-3**: Shared modal helper functions (`openModal`, `closeModal`, `bindOverlayClose`, etc.)
- `public/js/utils/ui-state-manager.js` - Game state UI tracking
- `public/js/utils/keyboard-shortcuts.js` - Keyboard command handling
- `public/js/utils/connection-status.js` - Network status indicator (32px circular)
- `public/js/utils/question-utils.js` - Question HTML generation and answer randomization
- `public/js/utils/storage-utils.js` - **SIMP-6**: Safe localStorage wrappers (`getItem`, `setItem`, `getJSON`, `setJSON`, etc.)
- `public/js/utils/dom.js` - **SIMP-5**: Safe DOM manipulation with `escapeHtml()`, `escapeHtmlPreservingLatex()`, and `bindElement()` helper

**File Management UI Components:**
- `public/js/ui/file-manager.js` - Coordinator for folder tree, context menu, and password modals
- `public/js/ui/components/folder-tree.js` - Expandable tree view with folder/quiz hierarchy
- `public/js/ui/components/context-menu.js` - Right-click menu for file operations
- `public/js/ui/components/password-modal.js` - Password entry and creation dialogs

**Backend Services (Node.js):**
- `services/quiz-service.js` - Quiz CRUD operations (save, list, load)
- `services/results-service.js` - Results management with CSV/JSON export
- `services/qr-service.js` - QR code generation with caching
- `services/cors-validation-service.js` - CORS configuration for local/cloud
- `services/question-type-service.js` - Question type validation
- `services/game-session-service.js` - **Week 3**: Game lifecycle, PIN management, question timing, power-up state
- `services/player-management-service.js` - **Week 3**: Player join/leave, disconnection handling
- `services/question-flow-service.js` - **Week 3**: Answer submission, statistics, early question ending
- `services/metadata-service.js` - **File Management**: Folder structure, quiz metadata, password protection

**Frontend Services:**
- `public/js/services/results-manager-service.js` - Results data management
- `public/js/services/secure-storage-service.js` - AES-GCM encrypted storage

**AI Generator Modules:**
- `public/js/ai/generator.js` - AI question generation (Claude, Ollama, HuggingFace)
- `public/js/ai/prompts.js` - **SIMP-1**: AI prompt templates (441 lines extracted)
- `public/js/ai/generator-templates.js` - **SIMP-2**: HTML template functions for AI generator (220 lines extracted)

**CSS Architecture:**
- `public/css/main.css` - Entry point with @import statements
- `public/css/main.bundle.css` - Optimized production bundle (PostCSS)
- `public/css/variables.css` - Design system (colors, spacing, typography)
- `public/css/base.css` - **SIMP-12**: Global styles, reset, utilities (`.hidden`, `.visible`, `.visible-flex`, `.correct-answer-highlight`, `.host-correct-answer`, `.scale-pulse`, `.error-bg`)
- `public/css/layout.css` - Grid/flex layouts, responsive breakpoints
- `public/css/responsive.css` - Mobile optimizations (768px breakpoint)
- `public/css/game.css` - Game-specific styling
- `public/css/components.css` - Reusable component styles
- `public/css/animations.css` - Keyframe animations and transitions
- `public/css/toolbar.css` - Horizontal toolbar styling
- `public/css/preview.css` - Live preview modal
- `public/css/toasts.css` - Toast notification styles
- `public/css/analytics.css` - Results viewer and analytics
- `public/css/file-manager.css` - File tree, context menu, and password modal styles
- `public/css/components/syntax-highlighting.css` - Code syntax highlighting
- `public/css/components/code-blocks.css` - LaTeX/code rendering

## Development Guidelines

**Critical Rules:**
1. **Always check imports/exports** before deleting functions
2. **Search entire codebase** for function usage before removing code
3. **Never clear innerHTML** of containers with required child elements
4. **Use logger instead of console** for all debugging
5. **Test imports after refactoring** utility files
6. **Check timing dependencies** - mobile carousels have delays for proper DOM population
7. **Validate translation keys** - ensure all UI elements have proper translations in all 9 languages (EN, ES, FR, DE, IT, PT, PL, JA, ZH)
8. **Test zoom compatibility** - buttons and layouts should work at 150%+ zoom levels
9. **Verify Socket.IO events** - check both client and server event handlers when modifying real-time features
10. **Test mobile carousels** - auto-play, pause/resume, gesture handling must work correctly
11. **Use ImagePathResolver for all image paths** - Never manually construct image paths; always use `imagePathResolver.toStoragePath()` for saving and `imagePathResolver.toDisplayPath()` for display
12. **Use theme-specific selectors for mobile CSS overrides** - Dark mode rules use `:not([data-theme="light"])` with `!important`, so mobile overrides must match this specificity pattern
13. **Use APIHelper for all API calls** - Never hardcode API paths like `/api/...`; always use `APIHelper.getApiUrl('api/...')` for K8s path-based routing compatibility

**Best Practices:**
- Keep functions focused on single responsibilities
- Use ES6 modules with proper imports/exports
- Preserve DOM structure in manipulations
- Document complex algorithms
- Use unified SettingsManager for all theme/settings operations
- Use ImagePathResolver for all image operations (centralized path handling for Kubernetes)
- Use QuestionTypeRegistry for all question type operations (Week 1 refactoring)
- Use `COLORS` constants from config.js instead of hardcoding color values (**SIMP-7**: includes `OPTION_COLORS`, `DIFFICULTY_COLORS`)
- Use `LANGUAGES` config from config.js for language metadata (**SIMP-8**)
- Use `escapeHtml()` from dom.js for XSS prevention (use `escapeHtmlPreservingLatex()` for math content)
- Use `bindElement()` from dom.js for safe event listener binding (**SIMP-5**)
- Use `storage-utils.js` for all localStorage operations (**SIMP-6**: `getItem`, `setItem`, `getJSON`, `setJSON`)
- Use `modal-utils.js` for all modal operations (**SIMP-3**: `openModal`, `closeModal`, `bindOverlayClose`)
- Use CSS classes instead of inline styles (**SIMP-12**: `.hidden`, `.visible-flex`, `.correct-answer-highlight`, etc.)
- Use `unifiedErrorHandler.wrapAsyncOperation()` for network operations (**SIMP-9**, **SIMP-10**)
- Use `unifiedErrorHandler.safeExecute()` for operations that should continue on error
- Implement auto-play carousels with intelligent pause/resume
- Handle mobile viewport differences with responsive CSS
- Clean up event listeners and timers to prevent memory leaks
- Use AbortController pattern for document-level event listeners

**Image Path Handling Pattern:**
```javascript
import { imagePathResolver } from '../utils/image-path-resolver.js';

// When saving quiz (store portable path)
const storagePath = imagePathResolver.toStoragePath(imageUrl);
imageElement.dataset.url = storagePath; // Save: /uploads/file.gif

// When displaying image (add environment base path)
const displayPath = imagePathResolver.toDisplayPath(storagePath);
imageElement.src = displayPath; // Display: /quizmaster/uploads/file.gif

// When rendering in game (full absolute URL)
const absoluteUrl = imagePathResolver.toAbsoluteUrl(storagePath);
imageElement.src = absoluteUrl; // Display: http://host/quizmaster/uploads/file.gif
```

**Theme-Specific CSS Override Pattern:**
```css
/* Problem: Dark mode rules use high-specificity selectors with !important */
:not([data-theme="light"]) #current-question pre {
    white-space: pre !important;  /* This blocks mobile overrides */
}

/* Solution: Mobile media queries MUST use the same theme selectors */
@media (max-width: 768px) {
    :not([data-theme="light"]) #current-question pre,
    [data-theme="light"] #current-question pre,
    #current-question pre {
        white-space: pre-wrap !important;  /* Now overrides dark mode */
        word-break: break-word !important;
    }
}
```

**API URL Pattern (K8s Compatibility):**
```javascript
import { APIHelper } from '../utils/api-helper.js';

// CORRECT - Uses APIHelper for K8s path-based routing
const response = await fetch(APIHelper.getApiUrl('api/quiz/filename.json'));
// In K8s: https://host/quizmaster/api/quiz/filename.json
// Local:  https://host/api/quiz/filename.json

// WRONG - Hardcoded path breaks K8s deployments
const response = await fetch('/api/quiz/filename.json');
// Always: https://host/api/quiz/filename.json (missing /quizmaster/ prefix)

// APIHelper methods:
APIHelper.getApiUrl('api/endpoint')     // Returns full URL with base path
APIHelper.getBaseUrl()                   // Returns base URL from <base href> tag
APIHelper.fetchAPI(endpoint, options)    // fetch() wrapper with logging
APIHelper.fetchAPIJSON(endpoint, options) // fetch() + JSON parsing
```

**IMPORTANT:** All `fetch()` calls to our server's API endpoints MUST use `APIHelper.getApiUrl()`. The only exceptions are:
- External APIs (Ollama, OpenAI, HuggingFace) - use their direct URLs
- The `APIHelper` class itself
- Fallback connectivity checks using `window.location.origin`

## Adding New Question Types

**📖 See: `/docs/ADD-QUESTION-TYPE.md` for comprehensive guide**

**Note**: Week 1 refactoring introduced `QuestionTypeRegistry` which centralizes validation, extraction, population, and scoring logic, reducing code duplication significantly.

Adding a new question type still requires changes across **40+ code locations in 13+ files**. Key areas:

**Critical Steps:**
1. **CSS Bundle** - ALWAYS run `npm run build` after editing `components.css`
   - Verify: `grep -c "your-class" public/css/main.bundle.css`
   - Stale bundle is the #1 source of "works locally but not in production" bugs

2. **Default Question (HTML)** - Update hardcoded question in `index.html` (~line 767-870)
   - Add dropdown option + answer options section
   - Otherwise new users won't see the type on first load

3. **Live Preview Updates** - Add input class to listener in `preview-manager.js` (~line 297)
   - Otherwise real-time preview won't update as users type

4. **Submit Button Pattern** - Wire up in setup method, NOT bindPlayerEventListeners()
   - Follow numeric question pattern: `gameManager.addEventListenerTracked()`

**Files Requiring Updates:**
- `public/js/utils/question-utils.js` (5 locations)
- `public/index.html` (3 locations - dropdown, default question, player container)
- `public/js/game/game-manager.js` (containerMap + submit method)
- `public/js/game/modules/question-renderer.js` (host + player setup methods)
- `public/js/game/modules/player-interaction-manager.js` (submit handlers)
- `server.js` (validation + scoring)
- `public/js/ui/preview-manager.js` (data extraction + input listener)
- `public/js/ui/modules/preview-renderer.js` (desktop + mobile renderers)
- `public/css/components.css` (full styling section + `npm run build`)
- `public/js/utils/translations/*.js` (all 9 languages)

**Common Pitfalls:**
- CSS bundle not rebuilt (stale styles)
- Preview data extraction missing (shows "no options")
- Input listener not updated (no real-time preview)
- Submit button not wired (button does nothing)
- Missing from default question (not visible on first load)
- containerMap entry missing ("unknown question type" error)

## Project Structure

```
quizix-pro/
├── public/                 # Frontend assets
│   ├── css/               # Modular CSS with PostCSS build
│   ├── js/                # ES6 modular JavaScript
│   │   ├── core/          # App initialization and config
│   │   ├── game/          # Game logic and modules
│   │   ├── quiz/          # Quiz creation and editing
│   │   ├── ui/            # UI management and preview
│   │   ├── socket/        # WebSocket communication
│   │   ├── settings/      # Settings and theme management
│   │   ├── audio/         # Sound effects
│   │   ├── services/      # Frontend services
│   │   └── utils/         # Utilities and helpers
│   ├── images/            # Media assets
│   ├── uploads/           # User-uploaded quiz images
│   └── index.html         # SPA entry point
├── services/              # Backend Node.js services (QuizService, ResultsService, QRService)
├── tests/                 # Playwright test suite
├── quizzes/              # Saved quiz files (JSON)
├── results/              # Quiz game results archives
├── docs/                 # Documentation
├── debug/                # Debug UI tools
├── server.js             # Express backend (1,229 lines)
├── REFACTORING_ROADMAP.md  # Refactoring status and roadmap
└── package.json          # Dependencies and scripts
```

## Key Features

**Quiz Creation:**
- Multiple question types: Multiple-choice, Multiple-correct, True/False, Numeric, Ordering
- Difficulty levels: Easy, Medium, Hard (with point multipliers 1x, 1.5x, 2x)
- LaTeX/MathJax support for mathematical equations
- Image upload and display (5MB limit)
- Question randomization and answer shuffling
- Global or per-question time settings
- AI question generation (Claude, Ollama, HuggingFace)

**File Management:**
- Virtual folder organization (metadata-based, no database required)
- Tree view with expandable folders in Load Quiz modal
- Right-click context menu for file operations (rename, move, delete)
- Optional password protection at quiz creation time
- Password-protected items show lock icon
- Session tokens for unlocked items (1hr expiry)
- Drag-and-drop organization (folders and quizzes)

**Password Protection Security:**
- PBKDF2 hashing with SHA-512 (100,000 iterations)
- 32-byte cryptographically random salt per password
- Timing-safe comparison to prevent timing attacks
- Rate limiting: 5 unlock attempts per minute per IP
- Passwords can only be set at quiz creation (not retroactively)
- Removing password requires current password verification

**Game Flow:**
1. Host creates quiz and enters lobby
2. QR code generation for mobile player joining
3. Players join via PIN or scan QR
4. Host starts game, questions displayed in sequence
5. Players submit answers, real-time statistics shown
6. Manual or automatic advancement to next question
7. Final leaderboard with confetti celebration
8. Results download in CSV/JSON format

**Analytics & Results:**
- Real-time answer statistics during gameplay
- Detailed CSV export with player-centric format
- Advanced analytics CSV with question breakdowns
- Success rate, average response time calculations
- Player performance tracking
- Most common wrong answers identification
- Results viewer interface with filtering and sorting

**Mobile Features:**
- Responsive design with 768px breakpoint
- Auto-playing carousels with gesture support (swipe, tap)
- Touch-friendly button sizing (44x44px minimum)
- Mobile-specific FAB for quiz editing tools
- Reduced MathJax rendering delays on mobile
- Zoom compatibility at 150%+ levels
- Compact connection status (32px circular)
- Code block line wrapping (`white-space: pre-wrap`) to prevent horizontal scroll

**AI Integration:**
- Claude API for intelligent question generation
- Server-side API key support via `CLAUDE_API_KEY` environment variable
- Ollama local model support
- HuggingFace model integration
- Secure client-side API key storage with AES-GCM encryption (BYOK pattern)
- Question quality validation and formatting
- `/api/ai/config` endpoint for checking provider availability

**Power-Ups (Optional):**
- **Host-configurable**: Enable/disable via checkbox in game settings
- **Three power-up types**:
  - **50-50**: Eliminates half of wrong answers (multiple-choice only)
  - **Extend Time**: Adds 10 seconds to question timer
  - **Double Points**: 2x score multiplier on next correct answer
- **Usage limits**: Each power-up can be used once per game
- **Works in both modes**: Multiplayer (Socket.IO) and Practice (local event bus)
- **Visual feedback**: Pulse animation for active state, disabled styling when used
- **Server-side validation**: Prevents double-use in multiplayer mode

**Scoring System:**
- **📖 See: `/docs/SCORING_SYSTEM.md` for comprehensive documentation**
- **Transparent**: Host sees score breakdown (base points, time bonus, difficulty)
- **Configurable**: Per-game session settings (not saved to quiz file)
- **Formula**: `basePoints = 100 × difficultyMultiplier`, `timeBonus = floor((10s - time) × multiplier / 10)`
- **Difficulty multipliers**: Easy (1×), Medium (2×), Hard (3×) - customizable
- **Time bonus toggle**: Enable/disable faster-answer bonus
- **Host breakdown display**: Shows scoring formula in answer statistics area
- **Practice mode alignment**: Uses identical formula to multiplayer

## Testing Infrastructure

**Playwright Tests:**
- Mobile quiz editor testing in light mode
- Test reports with screenshots and error context
- Located in `tests/` directory
- Artifacts saved to `test-results/`
- HTML reports in `playwright-report/`

**Debug Tools:**
- Real game state simulation
- Mobile viewport testing
- Theme switching validation
- Carousel auto-play testing
- Located at `/debug/ui-debug-showcase.html` and `/debug/advanced-ui-debugger.html`

## Production Deployment

**Pre-Production Checklist:**
- Set `DEBUG.ENABLED = false` in `/public/js/core/config.js`
- Run `npm run build` for optimized CSS
- Verify no console.log statements remain
- Test MathJax rendering on target browsers

## Cloud Deployment

**Railway Deployment:**
- Platform: Railway.app
- Deployment time: ~2-3 minutes
- Auto-deploys on push to configured branch

**Kubernetes Deployment:**
- Supports path-based routing (e.g., `/quizmaster/`)
- ImagePathResolver handles environment-aware paths
- QR codes generate correct URLs for cluster access

## Mobile Optimizations

**Key Features:**
- Responsive design with 768px breakpoint
- Auto-playing carousels (quickstart: 6s, preview: 5s intervals) with intelligent pause/resume
- Touch-friendly button sizing (44x44px minimum)
- Comprehensive swipe gesture handling for all carousels
- Mobile-specific FAB for quiz editing tools
- Compact connection status indicator (32px circular)
- Zoom compatibility at 150%+ levels

## Settings & State Management

**Single Source of Truth Architecture:**
- **SettingsManager**: Facade that delegates to specialized managers
- **TranslationManager**: Source of truth for language (stores in `language` key)
- **SoundManager**: Source of truth for audio settings (stores in `quizAudioSettings` key)
- **GameStateManager**: Source of truth for game state (`gameEnded`, `resultShown`, etc.)

**Theme Management:**
- Consistent Emojis: ☀️ for light mode, 🌙 for dark mode (showing current state)
- Multi-Button Support: Synchronized theme toggles in header, mobile, and settings
- Persistent Storage: Theme stored in `quizSettings` localStorage

## Internationalization

**Multi-Language Support:**
- **9 Languages**: English (EN), Spanish (ES), French (FR), German (DE), Italian (IT), Portuguese (PT), Polish (PL), Japanese (JA), Chinese (ZH)
- **Translation Files**: Located in `public/js/utils/translations/` (en.js, es.js, fr.js, de.js, it.js, pt.js, pl.js, ja.js, zh.js)
- **200+ Translation Keys**: Comprehensive coverage of all UI elements
- **Mobile Menu**: Complete translations for all mobile editor tools
- **Dynamic Updates**: Real-time language switching with UI updates
- **Placeholder Support**: Dynamic content formatting with translation placeholders

**Architecture:**
- Centralized TranslationManager for language switching
- LocalStorage persistence of language preference
- Lazy loading of translation files
- Fallback to English for missing keys

## Debug Tools

**Available Tools:**
- `http://localhost:3000/debug/ui-debug-showcase.html` - Primary debug tool
- `http://localhost:3000/debug/advanced-ui-debugger.html` - Advanced features

**Features:**
- Real game state simulation with `UIStateManager.setState()`
- Mobile viewport testing with zoom compatibility
- Theme switching validation
- Header visibility verification
- Carousel auto-play testing

## Security

**Security Measures:**
- **AES-GCM Encryption**: Secure storage for API keys via `secure-storage-service.js`
- **Server-Side API Keys**: Optional `CLAUDE_API_KEY` env var for production deployments
- **CORS Validation**: Configurable via `cors-validation-service.js` for local network and cloud deployment
- **File Upload Security**:
  - 5MB size limit enforced
  - File type validation (images only)
  - Cryptographically secure file naming (`crypto.randomBytes()`)
  - Filename sanitization to prevent path traversal attacks
  - Multer middleware with security configuration
- **Input Validation**:
  - HTML escaping via shared `escapeHtml()` utility in `dom.js`
  - Socket.IO event validation with try-catch error handling
  - Quiz data validation on save/load
- **Rate Limiting**:
  - Socket.IO event rate limiting (10 events/second per client)
  - Client notification via `rate-limited` event
- **Environment Variables**: Sensitive configuration via `.env` files
- **HTTPS Support**: Ready for SSL/TLS in production
- **Network Configuration**:
  - Local network IP detection with WSL compatibility
  - Railway cloud deployment with secure environment
  - Environment-aware CORS policies

## Server Operations

- Server runs on port 3000 by default
- No hot reload - refresh browser after JS changes
- User typically manages server restarts manually

## Performance & Memory Management

**Optimizations:**
- **CSS Bundling**: PostCSS with autoprefixer and cssnano for production
- **Static File Caching**: ETags and cache headers for efficient asset delivery
- **Mobile-Specific Caching**: Optimized cache headers for mobile browsers
- **QR Code Caching**: Reduces generation overhead for repeated PIN access
- **Connection Pooling**: Efficient file operations with connection reuse
- **MathJax Smart Loading**: FOUC prevention with intelligent loading strategy
- **Lazy Loading**: AI generator and results viewer loaded on demand
- **Compression Middleware**: Gzip compression for all responses

**Memory Management:**
- **Event Listener Tracking**: Cleanup tracked listeners to prevent memory leaks
- **AbortController Pattern**: Socket manager uses AbortController for automatic event listener cleanup
- **Timer Management**: Centralized `clearTimers()` method in Game class for proper cleanup
  - Tracks: `questionTimer`, `advanceTimer`, `earlyEndTimer`, `startTimer`
- **Player Reference Cleanup**: Game state reset and player data cleanup between games
- **DOM Reference Release**: Clear references to removed DOM elements
- **Socket.IO Cleanup**: Proper disconnection and event listener removal

**State Management Patterns:**
- Centralized state in dedicated managers (GameStateManager, UIStateManager)
- Immutable state updates where possible
- Event-driven architecture with clear data flow
- LocalStorage management with error boundaries
- Persistent settings with validation and fallbacks

## Known Patterns & Architecture Notes

**Timing Dependencies:**
- Mobile carousels require 150ms delays for proper DOM population before cloning
- Theme toggle requires DOM-based state checking for accuracy
- Auto-play carousels need proper pause/resume logic during user interactions

**File Organization:**
- Theme management centralized in `settings-manager.js`
- Mobile-specific carousels in separate utility files
- Translation files follow `/[language].js` naming convention
- All mobile UI components have corresponding CSS in `responsive.css`
- Game submodules organized by responsibility in `game/modules/`
- Services separated into frontend (`public/js/services/`) and backend (`services/`)

**Socket.IO Real-Time Communication:**
- **100+ Event Handlers**: Comprehensive client-server event system
- **Key Events**: `create-game`, `join-game`, `start-game`, `submit-answer`, `next-question`, `game-ended`
- **Power-Up Events**: `use-power-up`, `power-up-result` for real-time power-up actions
- **Player Management**: Real-time player join/leave notifications
- **Answer Statistics**: Live answer distribution and player response tracking
- **Automatic Advancement**: Optional auto-progression to next question
- **Connection Handling**: Reconnection logic with game state recovery
- **Error Handling**: All socket event handlers wrapped in try-catch blocks
- **Rate Limiting**: Per-client rate limiting with `rate-limited` event notification
- **Error Propagation**: Socket errors surfaced to UI with user-friendly messages

**Testing Considerations:**
- Always test theme toggles across desktop and mobile variants
- Verify carousel auto-play behavior during user interactions
- Test zoom compatibility at 150%+ levels for layout integrity
- Validate translation keys across all 9 supported languages (EN, ES, FR, DE, IT, PT, PL, JA, ZH)
- Test Socket.IO events with multiple concurrent players
- Verify LaTeX/MathJax rendering across different browsers
- Test mobile gestures (swipe, tap) on actual mobile devices
- Validate file uploads with different image types and sizes
- Test power-ups in both multiplayer and practice modes (each usable once per game)

## Future Enhancements

**AI Image Generation for Questions:**
- The AI generator previously supported image generation via Claude (SVG)
- Potential enhancements:
  - **SVG generation**: Claude can generate SVG diagrams for geometry, graphs, etc.
  - **TikZ/CircuiTikZ**: Server-side LaTeX rendering for precise technical diagrams
  - **Circuit diagrams**: CircuiTikZ for electronics questions
  - **Geometric figures**: TikZ for triangles, circles, coordinate planes
  - **Graphs and charts**: Data visualization for statistics questions
- Implementation considerations:
  - Server-side LaTeX to PNG/SVG conversion (requires texlive)
  - Claude prompt engineering for consistent SVG output
  - Automatic image upload to `/uploads/` directory
  - Preview rendering in AI generator modal

