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
│   │   └── utils/         # Utilities and helpers
│   ├── images/            # Media assets
│   ├── uploads/           # User-uploaded quiz images
│   └── index.html         # SPA entry point
├── services/              # Backend Node.js services
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

~1,229 lines of production-grade Express server:
- Socket.IO real-time multiplayer (100+ event handlers)
- RESTful API with 15+ endpoints
- Multer file upload with security validation
- Compression middleware for mobile optimization
- AI integration proxy (Claude, Ollama, HuggingFace)

### Backend Services

| Service | File | Responsibility |
|---------|------|----------------|
| QuizService | `services/quiz-service.js` | Quiz CRUD operations |
| ResultsService | `services/results-service.js` | Results management, CSV/JSON export |
| QRService | `services/qr-service.js` | QR code generation with caching |
| CORSValidationService | `services/cors-validation-service.js` | CORS for local/cloud |
| QuestionTypeService | `services/question-type-service.js` | Question validation |
| GameSessionService | `services/game-session-service.js` | Game lifecycle, PIN management |
| PlayerManagementService | `services/player-management-service.js` | Player join/leave handling |
| QuestionFlowService | `services/question-flow-service.js` | Answer submission, statistics |
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
- `PATCH /api/folders/:id` - Rename folder
- `DELETE /api/folders/:id` - Delete folder
- `POST /api/unlock` - Verify password, get session token

**Other:**
- `GET /health` - Kubernetes liveness probe
- `GET /ready` - Kubernetes readiness probe
- `POST /upload` - Secure image upload
- `GET /api/qr/:pin` - Generate QR code
- `POST /api/claude/generate` - AI question generation proxy

See `docs/API_REFERENCE.md` for complete API documentation.

---

## Frontend Architecture

### Core Managers

| Manager | File | Lines | Responsibility |
|---------|------|-------|----------------|
| QuizGame | `public/js/core/app.js` | 1,193 | Application initialization |
| GameManager | `public/js/game/game-manager.js` | 1,772 | Game flow, player interaction |
| QuizManager | `public/js/quiz/quiz-manager.js` | - | Quiz creation, editing |
| UIManager | `public/js/ui/ui-manager.js` | - | Screen navigation, modals |
| SocketManager | `public/js/socket/socket-manager.js` | 633 | WebSocket event handling |
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
| `generator.js` | AI question generation (Claude, Ollama, HuggingFace) |
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

### Utility Classes

Defined in `base.css`:
- `.hidden` - Hide element
- `.visible`, `.visible-flex` - Show element
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

### API Security

- AES-GCM encryption for client-side API keys
- Server-side API key support via environment variables
- Rate limiting on Socket.IO events (10/second/client)

---

## Testing

### Unit Tests

Located in `tests/unit/`:
- 268 tests across 10 test suites
- ~53% statement coverage
- Run with `npx jest tests/unit/`

### Integration Tests

- Playwright tests in `tests/`
- Debug tools at `/debug/ui-debug-showcase.html`

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
| `create-game` | Client→Server | Host creates game |
| `join-game` | Client→Server | Player joins |
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
- 200+ translation keys
- Lazy loading
- Fallback to English for missing keys

---

## Performance Optimizations

- CSS bundling with PostCSS
- Static file caching with ETags
- QR code caching
- MathJax smart loading (FOUC prevention)
- Lazy loading for AI generator and results viewer
- Gzip compression middleware
