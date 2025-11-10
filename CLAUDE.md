# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**Quizix Pro** - Advanced interactive quiz platform for local networks with mobile optimization, cloud deployment, and modern ES6 architecture.

**Status**: Production-ready with comprehensive mobile optimizations, unified theme management, enhanced carousel functionality, multi-language support, and Railway cloud deployment.

**Recent Refactoring**: Week 1-2 complete (~1,433 lines eliminated/refactored). See `REFACTORING_SUMMARY.md` for details.

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
- **Centralized configuration** in `public/js/core/config.js`
- **Unified error handling** via `unified-error-handler.js`
- **Encrypted security** layer for sensitive data

**Backend (Node.js/Express - server.js):**
- **1,845 lines** of production-grade server code (reduced 24% in Week 2 refactoring)
- Service-oriented architecture with dedicated backend services
- Socket.IO real-time multiplayer communication (100+ event handlers)
- RESTful API with 15+ endpoints for quiz/results management
- QR code generation with caching
- Multer file upload with security validation (5MB limit)
- Compression middleware for mobile optimization
- Advanced logging with performance monitoring
- AI integration proxy (Claude, Ollama, HuggingFace)

**Key API Endpoints:**
- `POST /upload` - Secure image upload for quiz questions
- `POST /api/save-quiz` - Persist quiz to disk as JSON
- `GET /api/quizzes` - List all available quizzes
- `GET /api/quiz/:filename` - Load specific quiz data
- `POST /api/save-results` - Archive game results with metadata
- `GET /api/results` - List saved results with filtering
- `GET /api/qr/:pin` - Generate QR code with caching
- `POST /api/claude/generate` - AI question generation proxy
- `GET /api/results/:filename/export/:format` - Export as CSV/JSON

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

**UI and Preview:**
- `public/js/ui/preview-manager.js` - Live preview modal with LaTeX rendering
- `public/js/ui/modules/preview-renderer.js` - Preview content generation

**Utility Modules:**
- `public/js/utils/question-type-registry.js` - **Centralized question type definitions** (validation, extraction, population, scoring)
- `public/js/utils/unified-error-handler.js` - Error boundary system
- `public/js/utils/translation-manager.js` - i18n with 9 languages
- `public/js/utils/math-renderer.js` - LaTeX/MathJax rendering
- `public/js/utils/image-path-resolver.js` - **Centralized image path handling for Kubernetes deployments**
- `public/js/utils/results-viewer.js` - Results viewing interface
- `public/js/utils/simple-results-downloader.js` - CSV/JSON export
- `public/js/utils/mobile-carousel.js` - Mobile quickstart carousel (6s intervals)
- `public/js/utils/main-menu-carousel.js` - Preview carousel (5s intervals)
- `public/js/utils/mobile-question-carousel.js` - Quiz editing carousel
- `public/js/utils/toast-notifications.js` - Toast notification system
- `public/js/utils/modal-feedback.js` - Modal result feedback
- `public/js/utils/ui-state-manager.js` - Game state UI tracking
- `public/js/utils/keyboard-shortcuts.js` - Keyboard command handling
- `public/js/utils/connection-status.js` - Network status indicator (32px circular)
- `public/js/utils/question-utils.js` - Question HTML generation and answer randomization
- `public/js/utils/dom.js` - Safe DOM manipulation wrapper

**Backend Services (Node.js):**
- `services/quiz-service.js` - Quiz CRUD operations (save, list, load)
- `services/results-service.js` - Results management with CSV/JSON export
- `services/qr-service.js` - QR code generation with caching
- `services/cors-validation-service.js` - CORS configuration for local/cloud
- `services/question-type-service.js` - Question type validation

**Frontend Services:**
- `public/js/services/results-manager-service.js` - Results data management
- `public/js/services/secure-storage-service.js` - AES-GCM encrypted storage

**CSS Architecture:**
- `public/css/main.css` - Entry point with @import statements
- `public/css/main.bundle.css` - Optimized production bundle (PostCSS)
- `public/css/variables.css` - Design system (colors, spacing, typography)
- `public/css/base.css` - Global styles, reset, utilities
- `public/css/layout.css` - Grid/flex layouts, responsive breakpoints
- `public/css/responsive.css` - Mobile optimizations (768px breakpoint)
- `public/css/game.css` - Game-specific styling
- `public/css/components.css` - Reusable component styles
- `public/css/animations.css` - Keyframe animations and transitions
- `public/css/toolbar.css` - Horizontal toolbar styling
- `public/css/preview.css` - Live preview modal
- `public/css/toasts.css` - Toast notification styles
- `public/css/analytics.css` - Results viewer and analytics
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

**Best Practices:**
- Keep functions focused on single responsibilities
- Use ES6 modules with proper imports/exports
- Preserve DOM structure in manipulations
- Document complex algorithms
- Use unified SettingsManager for all theme/settings operations
- Use ImagePathResolver for all image operations (centralized path handling for Kubernetes)
- Use QuestionTypeRegistry for all question type operations (Week 1 refactoring)
- Implement auto-play carousels with intelligent pause/resume
- Handle mobile viewport differences with responsive CSS
- Clean up event listeners and timers to prevent memory leaks
- Use try-catch blocks with unified error handler for critical operations

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
├── server.js             # Express backend (1,845 lines)
├── REFACTORING_SUMMARY.md  # Week 1-2 refactoring summary
├── REFACTORING_ROADMAP.md  # Future refactoring opportunities
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

**AI Integration:**
- Claude API for intelligent question generation
- Ollama local model support
- HuggingFace model integration
- Secure API key storage with AES-GCM encryption
- Question quality validation and formatting

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

## Theme Management

- **SettingsManager**: Centralized theme management across desktop and mobile
- **Consistent Emojis**: ☀️ for light mode, 🌙 for dark mode (showing current state)
- **Multi-Button Support**: Synchronized theme toggles in header, mobile, and settings
- **Persistent Storage**: Uses `quizSettings` localStorage format

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
- **CORS Validation**: Configurable via `cors-validation-service.js` for local network and cloud deployment
- **File Upload Security**:
  - 5MB size limit enforced
  - File type validation (images only)
  - Filename sanitization to prevent path traversal attacks
  - Multer middleware with security configuration
- **Input Validation**:
  - HTML escaping to prevent XSS attacks
  - Socket.IO event validation
  - Quiz data validation on save/load
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
- **Timer Management**: Proper cleanup of setInterval/setTimeout references
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
- **Player Management**: Real-time player join/leave notifications
- **Answer Statistics**: Live answer distribution and player response tracking
- **Automatic Advancement**: Optional auto-progression to next question
- **Connection Handling**: Reconnection logic with game state recovery
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