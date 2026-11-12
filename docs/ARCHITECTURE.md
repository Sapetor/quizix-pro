# Quizix Pro Architecture

Comprehensive technical documentation for the Quizix Pro codebase.

## Table of Contents

- [Project Structure](#project-structure)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [CSS Architecture](#css-architecture)
- [State Management](#state-management)
- [Memory Management](#memory-management)
- [Security](#security)
- [Testing](#testing)

---

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
│   │   ├── ai/            # AI question generation
│   │   ├── services/      # Frontend services
│   │   ├── practice/      # Single-player practice mode
│   │   ├── events/        # Local/socket event bus adapters
│   │   └── utils/         # Utilities and helpers
│   ├── images/            # Media assets
│   ├── libs/              # Vendored third-party libraries and fonts (see public/libs/README.md)
│   ├── uploads/           # User-uploaded quiz images
│   └── index.html         # SPA entry point
├── services/              # Backend Node.js services
├── routes/                # Express routers (quiz management, uploads, AI, auth, health, manim)
├── socket/                # Socket.IO event handlers (registered from socket/index.js)
├── middleware/            # Express middleware (client IP, user session, caching, static files)
├── config/                # Resource limits (config/limits.js)
├── utils/                 # Server helpers (shutdown, rate limiters, password hashing, PDF and DOCX workers)
├── scripts/               # Build helpers (cache-bust.js)
├── tests/                 # Test suites (unit + integration)
├── quizzes/              # Saved quiz files (JSON)
├── results/              # Quiz game results archives
├── docs/                 # Documentation
├── debug/                # Debug UI tools
├── k8s/                  # Kubernetes manifests
└── server.js             # Express backend entry point
```

---

## Backend Architecture

### Core Server (server.js)

~885 lines. `server.js` creates the services and wires middleware, routers and Socket.IO; most logic lives elsewhere:
- Socket.IO real-time multiplayer: handlers in `socket/` (game, player, gameplay and consensus events)
- REST API: routers in `routes/` plus `POST /api/save-quiz` and `GET /api/ping` in `server.js`
- Multer file upload with security validation (`routes/file-uploads.js`)
- Compression middleware for mobile optimization
- AI integration proxy for Claude, Gemini and Ollama (`routes/ai-generation.js`); OpenAI is called directly from the browser

Other server behaviour:
- `app.set('trust proxy', 'loopback')`: `req.ip` trusts only a loopback proxy such as a co-located Cloudflare tunnel.
- `middleware/client-ip.js` (`getClientIp`) is the single source of the caller IP for rate limiting. It reads `CF-Connecting-IP` only when the direct peer is loopback or listed in `TRUSTED_PROXY_IPS`, otherwise it falls back to `req.ip`.
- Debug and diagnostic endpoints (`/metrics`, `/debug/config`, `/api/debug/files`, `/api/debug/directory` and the `/debug` static tools) are registered only when `ENABLE_DEBUG_ROUTES=true`.
- Document text extraction (`routes/file-uploads.js`): PDF uses `pdfjs-dist` (`utils/pdf-text-worker.mjs`) and DOCX uses `mammoth` (`utils/docx-text-worker.js`), each inside a worker thread with a heap cap, a timeout, at most 2 concurrent workers in total and one in-flight request per client; PPTX is read with `jszip`.
- `/sw.js` and `index.html` are served through routes that inject a per-start `ASSET_VERSION` for cache busting.

### Backend Services

| Service | File | Responsibility |
|---------|------|----------------|
| QuizService | `services/quiz-service.js` | Quiz CRUD operations |
| Game | `services/game.js` | Per-game state, timers, answer recording |
| ScoringService | `services/scoring-service.js` | Points, time bonus, consensus team points |
| ResultsService | `services/results-service.js` | Results management, CSV/JSON export |
| QRService | `services/qr-service.js` | QR code generation with caching |
| CORSValidationService | `services/cors-validation-service.js` | CORS for local/cloud |
| QuestionTypeService | `services/question-type-service.js` | Question validation |
| GameSessionService | `services/game-session-service.js` | Game lifecycle, PIN management |
| PlayerManagementService | `services/player-management-service.js` | Player join/leave handling |
| QuestionFlowService | `services/question-flow-service.js` | Answer submission, statistics |
| ConsensusFlowService | `services/consensus-flow-service.js` | Consensus mode proposals and locking |
| SocketBatchService | `services/socket-batch-service.js` | Batches high-frequency socket emits |
| UserService / SessionService | `services/user-service.js`, `services/session-service.js` | Optional user accounts and login sessions |
| ManimRenderService | `services/manim-render-service.js` | Manim animation rendering |
| UploadGCService | `services/upload-gc-service.js` | Cleanup of unreferenced uploads |
| MetadataService | `services/metadata-service.js` | Folders, quiz metadata, passwords |
| MetricsService | `services/metrics-service.js` | Prometheus metrics |

### API Endpoints

**Quiz Management:**
- `POST /api/save-quiz` - Save quiz (supports optional password)
- `GET /api/quizzes` - List all quizzes
- `GET /api/quiz/:filename` - Load specific quiz
- `DELETE /api/quiz/:filename` - Delete quiz

**Results:**
- `POST /api/save-results` - Archive game results
- `GET /api/results` - List saved results
- `GET /api/results/:filename/export/:format` - Export CSV/JSON

**File Management:**
- `GET /api/quiz-tree` - Get folder/quiz tree structure
- `POST /api/folders` - Create folder
- `PATCH /api/folders/:id/rename` - Rename folder
- `PATCH /api/folders/:id/move` - Move folder
- `DELETE /api/folders/:id` - Delete folder
- `POST /api/unlock` - Verify password, get session token

**Other:**
- `GET /health` - Kubernetes liveness probe
- `GET /ready` - Kubernetes readiness probe
- `POST /upload` - Secure image upload
- `GET /api/qr/:pin` - Generate QR code
- `POST /api/claude/generate`, `POST /api/gemini/generate`, `/api/ollama/*` - AI question generation proxy
- `POST /api/extract-pdf`, `/api/extract-docx`, `/api/extract-pptx` - Document text extraction
- `POST /api/auth/signup`, `/login`, `/logout`, `GET /api/auth/me` - Optional user accounts

See `docs/API_REFERENCE.md` for complete API documentation.

---

## Frontend Architecture

### Core Managers

| Manager | File | Lines | Responsibility |
|---------|------|-------|----------------|
| QuizGame | `public/js/core/app.js` | 1,712 | Application initialization |
| GameManager | `public/js/game/game-manager.js` | 1,714 | Game flow, player interaction |
| QuizManager | `public/js/quiz/quiz-manager.js` | - | Quiz creation, editing |
| UIManager | `public/js/ui/ui-manager.js` | - | Screen navigation, modals |
| SocketManager | `public/js/socket/socket-manager.js` | 1,606 | WebSocket event handling |
| SettingsManager | `public/js/settings/settings-manager.js` | - | Theme, settings persistence |
| SoundManager | `public/js/audio/sound-manager.js` | - | Audio effects |

### Game Submodules

Located in `public/js/game/modules/`:

| Module | Responsibility |
|--------|----------------|
| `game-display-manager.js` | Question rendering, DOM updates |
| `game-state-manager.js` | Centralized state tracking |
| `player-interaction-manager.js` | Player answer handling |
| `timer-manager.js` | Question timer logic |
| `question-renderer.js` | Dynamic question display |
| `power-up-manager.js` | Power-up logic and UI |
| `answer-reveal-manager.js` | Correct-answer reveal and player feedback |
| `leaderboard-manager.js` | Leaderboard display |
| `statistics-manager.js` | Host answer statistics and score breakdown |
| `consensus-manager.js` | Consensus mode UI |
| `discussion-manager.js` | Discussion phase and chat UI |

### Utility Modules

Located in `public/js/utils/`:

| Module | Purpose |
|--------|---------|
| `question-type-registry.js` | Centralized question type definitions |
| `unified-error-handler.js` | Error boundary system |
| `translation-manager.js` | i18n with 9 languages |
| `math-renderer.js` | LaTeX/MathJax rendering |
| `image-path-resolver.js` | K8s-compatible image paths |
| `api-helper.js` | K8s-compatible API URLs |
| `dom.js` | Safe DOM manipulation, XSS prevention |
| `storage-utils.js` | Safe localStorage wrappers |
| `modal-utils.js` | Shared modal helpers |

### AI Generator

Located in `public/js/ai/`:

| Module | Purpose |
|--------|---------|
| `generator.js` | AI question generation (Claude, Gemini, OpenAI, Ollama) |
| `prompts.js` | AI prompt templates |
| `generator-templates.js` | HTML template functions |

### Frontend Services

| Service | File | Purpose |
|---------|------|---------|
| ResultsManagerService | `public/js/services/results-manager-service.js` | Results data management |
| SecureStorageService | `public/js/services/secure-storage-service.js` | AES-GCM encrypted storage |

---

## CSS Architecture

### File Structure

| File | Purpose |
|------|---------|
| `main.css` | Entry point with @import statements |
| `main.bundle.css` | Optimized production bundle (PostCSS) |
| `variables.css` | Design system (colors, spacing, typography) |
| `base.css` | Global styles, reset, utility classes |
| `layout.css` | Grid/flex layouts, responsive breakpoints |
| `responsive.css` | Mobile optimizations (768px breakpoint) |
| `game.css` | Game-specific styling |
| `components.css` | Reusable component styles |
| `animations.css` | Keyframe animations and transitions |
| `utilities.css` | `.hidden` / `.visible-*` classes, imported last in `layer(utilities)` |
| `mobile-gate.css` | Phone join-only gate (see `docs/MOBILE_JOIN_ONLY.md`) |

Other modules (header, modals, preview, toolbar, landing, auth, and more) are listed in the `@import` order in `main.css`.

### Utility Classes

Visibility classes are in `utilities.css` (imported last, in `layer(utilities)`):
- `.hidden` - Hide element
- `.visible-flex`, `.visible-block`, `.visible-inline-block` - Show element

Defined in `base.css`:
- `.correct-answer-highlight` - Correct answer styling
- `.host-correct-answer` - Host view correct answer
- `.scale-pulse` - Animation class
- `.error-bg` - Error state background

### Build Process

```bash
npm run build  # PostCSS with autoprefixer + cssnano
```

**Important:** Always run `npm run build` after editing CSS files.

---

## State Management

### Single Source of Truth

| Manager | Owns | Storage Key |
|---------|------|-------------|
| TranslationManager | Language preference | `language` |
| SoundManager | Audio settings | `quizAudioSettings` |
| SettingsManager | Theme, general settings | `quizSettings` |
| GameStateManager | Game state flags | In-memory |
| UIStateManager | UI state tracking | In-memory |

### Theme Management

- Emoji convention: ☀️ (light mode), 🌙 (dark mode)
- Synchronized across header, mobile, and settings toggles
- Persisted in `quizSettings` localStorage

---

## Memory Management

### Event Listener Cleanup

- `GameManager.addEventListenerTracked()` - Tracks listeners for cleanup
- AbortController pattern in SocketManager
- `clearTimers()` method in Game class

### Timer Tracking

Game class tracks and cleans up:
- `questionTimer`
- `advanceTimer`
- `earlyEndTimer`
- `startTimer`
- `leaderboardTimer`
- `answerCountTimer`

### Best Practices

1. Always use tracked event listeners
2. Clear timers on game end/reset
3. Release DOM references when elements removed
4. Proper Socket.IO disconnection handling

---

## Security

### Input Validation

- `escapeHtml()` in `dom.js` for XSS prevention
- `escapeHtmlPreservingLatex()` for math content
- Socket.IO event validation with try-catch
- Quiz data validation on save/load

### File Upload Security

- 5MB size limit
- Image-only file type validation
- Cryptographic file naming (`crypto.randomBytes()`)
- Path traversal prevention

### Password Protection

- PBKDF2 with SHA-512 (100,000 iterations)
- 32-byte random salt per password
- Timing-safe comparison
- Rate limiting: 5 attempts/minute/IP
- Session tokens: 1-hour expiry

### Content Security Policy and third-party code

- The CSP set in `server.js` allows no external host in any directive
- MathJax, Chart.js, highlight.js, canvas-confetti, jsPDF, mermaid, SheetJS and the web fonts are vendored under `public/libs/` at pinned versions with checksums (`public/libs/README.md`); the Socket.IO client is served by the server from its own package
- Loading the page and hosting or playing a game requests nothing from another host, so the app runs on a network with no internet access. The external URLs left in client code are the GitHub links on the landing page and the cloud AI endpoints in `public/js/ai/ai-provider-service.js` and `public/js/quiz/manim-ai-generator.js`; `connect-src` lists none of those hosts. Cloud AI generation goes through the server (`routes/ai-generation.js`), which then needs internet access
- `tests/e2e/offline-no-cdn.spec.js` hosts a game with every non-local request aborted; `tests/unit/vendored-libs.test.js` verifies the vendored files

### API Security

- AES-GCM encryption for client-side API keys
- Server-side API key support via environment variables
- Rate limiting on Socket.IO events (10/second/client by default)
- HTTP rate limits key on `getClientIp()` (`middleware/client-ip.js`)

---

## Testing

### Unit Tests

Located in `tests/unit/`:
- 1,307 tests across 75 test suites (measured 2026-11-12)
- Coverage is collected over `services/` and `socket/`; thresholds are in `jest.config.js`
- Run with `npm test`

### Integration Tests

- Playwright tests in `tests/` and `tests/e2e/` (visual regression: `npm run test:visual`)
- Debug tools at `/debug/ui-debug-showcase.html` (only with `ENABLE_DEBUG_ROUTES=true`)

### Test Considerations

1. Test theme toggles across desktop/mobile
2. Test at 150%+ zoom levels
3. Validate translations in all 9 languages
4. Test Socket.IO with concurrent players
5. Verify LaTeX rendering across browsers
6. Test mobile gestures on real devices

---

## Socket.IO Events

### Key Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `host-join` | Client→Server | Host creates game |
| `player-join` | Client→Server | Player joins |
| `start-game` | Client→Server | Host starts game |
| `submit-answer` | Client→Server | Player submits answer |
| `next-question` | Client→Server | Advance to next question |
| `game-ended` | Server→Client | Game completion |
| `use-power-up` | Client→Server | Player uses power-up |

### Error Handling

- All handlers wrapped in try-catch
- Errors surfaced to UI with user-friendly messages
- Rate limiting with `rate-limited` event notification

---

## Internationalization

### Supported Languages

EN, ES, FR, DE, IT, PT, PL, JA, ZH (9 languages)

### Translation Files

Located in `public/js/utils/translations/`:
- About 1,100 translation keys per locale
- Lazy loading
- Fallback to English for missing keys

---

## Performance Optimizations

- CSS bundling with PostCSS
- Static file caching with ETags
- QR code caching
- MathJax smart loading (FOUC prevention)
- Service worker serves the vendored libraries (`/libs/`) cache-first
- Lazy loading for AI generator and results viewer
- Gzip compression middleware
