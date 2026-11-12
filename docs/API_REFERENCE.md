# Quizix Pro API Reference

This document provides comprehensive documentation for all REST API endpoints and Socket.IO events in Quizix Pro.

## Table of Contents

- [REST API Endpoints](#rest-api-endpoints)
  - [Health & Status](#health--status)
  - [Debug endpoints](#debug-endpoints)
  - [User accounts](#user-accounts)
  - [Quiz Management](#quiz-management)
  - [Folders and quiz metadata](#folders-and-quiz-metadata)
  - [Results Management](#results-management)
  - [Game Information](#game-information)
  - [File Upload](#file-upload)
  - [AI Integration](#ai-integration)
  - [Manim animations](#manim-animations)
- [Socket.IO Events](#socketio-events)
  - [Connection Events](#connection-events)
  - [Host Events](#host-events)
  - [Player Events](#player-events)
  - [Game Flow Events](#game-flow-events)
  - [Session events](#session-events)
  - [Consensus mode events](#consensus-mode-events)
  - [Other server-to-client events](#other-server-to-client-events)

---

## REST API Endpoints

### Health & Status

#### GET /health
Liveness probe for Kubernetes health checks.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### GET /ready
Readiness probe that checks if all required directories are accessible.

**Response:**
```json
{
  "status": "ready",
  "checks": {
    "quizzes": true,
    "results": true,
    "uploads": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

If any directory check fails, the route returns `503` with `"status": "not ready"` and the same `checks` object.

#### GET /api/ping
Simple ping endpoint for connection testing.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "server": "Quizix Pro",
  "clientType": "desktop"
}
```

`clientType` is `mobile` or `desktop`, derived from the `User-Agent` header.

---

### Debug endpoints

These routes are registered only when the environment variable `ENABLE_DEBUG_ROUTES` is exactly the string `"true"`. Otherwise they return 404. They have no authentication, so do not enable them on a server reachable from untrusted networks.

| Route | Returns |
|-------|---------|
| `GET /metrics` | Prometheus metrics in text exposition format |
| `GET /debug/config` | `BASE_PATH` diagnostics, `NODE_ENV` and `isProduction` |
| `GET /api/debug/files` | Existence and `fs.Stats` of a fixed list of files under `public/`, plus `cwd` and `__dirname` |
| `GET /api/debug/directory` | Recursive listing of `public/` (depth 2) with sizes and modification times |
| `GET /debug/*` | Static files from the `debug/` directory |

---

### User accounts

Mounted under `/api/auth`. A successful signup or login sets an HTTP-only session cookie named `quizix_session` (30-day lifetime). Every HTTP request and every Socket.IO connection reads this cookie; `req.user` is `null` when it is absent or invalid. Routes in this document that "require a signed-in user" return `401` with `messageKey: "error_auth_required"` otherwise.

Signup and login share a per-IP limit of 10 failed attempts per minute (`429`, `messageKey: "error_rate_limited"`).

#### POST /api/auth/signup
Create an account and sign in.

**Request Body:**
```json
{
  "username": "alice_1",
  "password": "at-least-8-chars"
}
```

`username`: 3 to 32 characters, letters, digits and underscore. `password`: 8 to 200 characters.

Signup is open only while the instance has no accounts. After the first account exists it returns `403` (`error_signup_disabled`) unless `ALLOW_SIGNUP=true`. A taken username returns `409` (`error_username_taken`).

**Response:** `{ "user": { ... } }`

#### POST /api/auth/login
**Request Body:** `{ "username": "...", "password": "..." }`

**Response:** `{ "user": { ... } }`, or `401` with `messageKey: "error_invalid_credentials"`.

#### POST /api/auth/logout
Clears the session cookie. **Response:** `{ "success": true }`

#### GET /api/auth/me
**Response:** `{ "user": { ... } }` when signed in, otherwise `{ "user": null }`.

---

### Quiz Management

#### POST /api/save-quiz
Save a quiz to the server.

**Request Body:**
```json
{
  "title": "My Quiz",
  "questions": [
    {
      "question": "What is 2+2?",
      "type": "multiple-choice",
      "options": ["3", "4", "5", "6"],
      "correctIndex": 1,
      "difficulty": "easy",
      "timeLimit": 20,
      "explanation": "Basic arithmetic"
    }
  ],
  "settings": { "randomizeQuestions": false },
  "password": null,
  "filename": "my_quiz_1705312200000.json"
}
```

The body is validated with zod (`saveQuizSchema`): `title` 1 to 200 characters, at least one question, question `type` one of the supported types, `timeLimit` 5 to 300. `settings`, `password` (4 to 100 characters) and `filename` are optional. Passing `filename` overwrites that quiz. A validation failure returns `400` with `messageKey: "error_validation_failed"` and a `details` array of `{field, message}`.

**Access rules:**
- Rate limited to 30 requests per minute per client IP (`429`, `retryAfter` in seconds).
- Setting a `password` requires a signed-in user (`401` otherwise).
- Overwriting an existing quiz that has an owner requires being that owner (`403`, `error_quiz_not_owner`). Overwriting an ownerless quiz requires a signed-in user or a direct LAN client (`401`, `error_auth_required`; same rule as `DELETE /api/quiz/:filename`).
- A quiz saved by a signed-in user is owned by that user and starts `private`. A quiz saved anonymously is ownerless and `public`.

**Response:**
```json
{
  "success": true,
  "filename": "my_quiz_1705312200000.json",
  "title": "My Quiz",
  "id": "uuid-v4-string"
}
```

#### GET /api/quizzes
List the quizzes visible to the requester. Private quizzes are listed only for their owner. Quizzes inside a password-protected folder are listed; loading one needs an unlock token.

**Response:**
```json
[
  {
    "filename": "my_quiz_1705312200000.json",
    "title": "My Quiz",
    "questionCount": 5,
    "created": "2024-01-15T10:30:00.000Z",
    "id": "uuid-v4-string",
    "ownerId": "user-id-or-null",
    "visibility": "private",
    "owned": true
  }
]
```

#### GET /api/quiz/:filename
Load a specific quiz by filename.

**Parameters:**
- `filename`: The quiz filename (e.g., `my_quiz_1705312200000.json`)

**Access rules:**
- `400` for an invalid filename.
- `403` (`error_quiz_forbidden`) for a private quiz the requester does not own. This check runs before the token check, so an unlock token does not open another user's private quiz.
- `401` (`error_auth_required`) when the quiz is password protected and the request has no valid unlock token in `Authorization: Bearer <token>`. A quiz with its own password is protected for everyone except its owner (passwords on ownerless legacy quizzes are not enforced). A quiz without its own password is protected, for its owner too, when any ancestor folder has a password. See [Authentication](#authentication).
- `404` when the file does not exist.

**Response:**
```json
{
  "title": "My Quiz",
  "questions": [...],
  "created": "2024-01-15T10:30:00.000Z",
  "id": "uuid-v4-string"
}
```

#### DELETE /api/quiz/:filename
Delete a quiz file and its metadata.

**Access rules, checked in this order:**
1. `400` for an invalid filename.
2. `400` (`error_confirm_required`) unless the query string has `confirm=true`.
3. `403` (`error_quiz_not_owner`) when the quiz has an owner and the requester is not that owner. For a quiz with no owner, `401` (`error_auth_required`) unless the requester is signed in or is a direct LAN client (loopback or private peer address and no `CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP` or `Forwarded` header).
4. When the quiz is password protected for this requester: `401` without an `Authorization: Bearer <token>` header, `403` (`error_invalid_token`) when the token is invalid, expired, or was issued for another item.

**Response:** `{ "success": true, "filename": "my_quiz_1705312200000.json" }`. `404` when the file does not exist.

---

### Folders and quiz metadata

Folders and per-quiz metadata (display name, folder, visibility, password) are stored in `quizzes/quiz-metadata.json`. Folder IDs are UUIDs; a malformed `:id` returns `400` with `messageKey: "error_invalid_parameters"`.

#### GET /api/quiz-tree
Folder tree with the quizzes the requester may see. A folder is omitted when no quiz in its subtree is visible to the requester; this also omits newly created empty folders.

**Response:** `{ "folders": [...], "quizzes": [...] }`, where `quizzes` are the root-level quizzes and each folder has `children` and `quizzes`.

#### POST /api/folders
Create a folder. Requires a signed-in user, who becomes the folder owner.

**Request Body:** `{ "name": "Algebra", "parentId": null }` (`name` 1 to 100 characters, `parentId` a folder UUID or `null`).

**Response:** `201` with the folder object.

#### PATCH /api/folders/:id/rename
**Request Body:** `{ "name": "New name" }`

#### PATCH /api/folders/:id/move
**Request Body:** `{ "parentId": "folder-uuid-or-null" }`

Rename and move require a signed-in user (`401`). Folders with an owner can be changed only by that owner (`403`, `error_folder_not_owner`); ownerless legacy folders can be changed by any signed-in user. Both return the updated folder, or `404` if it does not exist.

#### POST /api/folders/:id/password
Set or remove a folder password.

**Request Body:** `{ "password": "secret" }` to set (4 to 100 characters), `{ "password": null }` to remove.

Requires a signed-in user (`401`). Once a folder has a password, only the user who set it can change or remove it (`403`, `error_folder_not_password_owner`).

**Response:** `{ "success": true, "protected": true }`

#### DELETE /api/folders/:id
Delete a folder.

**Query Parameters:**
- `deleteContents`: `true` to delete subfolders and quiz files as well. Without it, a non-empty folder returns `400` (`error_folder_not_empty`).

**Access rules:** same owner checks as rename and move. When the folder has a password, the request also needs `Authorization: Bearer <token>` from unlocking that folder: `401` without the header, `403` (`error_invalid_token`) for an invalid or expired token.

With `deleteContents=true`, child folders are processed first, then each quiz file is removed from disk before its metadata entry. Quizzes owned by a different user are not deleted; they are moved to the deleted folder's parent. If a file cannot be removed, the operation stops with an error instead of leaving an ownerless copy.

**Response:** `{ "success": true }`

#### PATCH /api/quiz-metadata/:filename
Update a quiz's display name, folder, or visibility.

**Request Body (all fields optional):**
```json
{
  "displayName": "Week 3 quiz",
  "folderId": "folder-uuid-or-null",
  "visibility": "public"
}
```

Quizzes with an owner can be edited only by the owner (`403`, `error_quiz_not_owner`). Ownerless legacy quizzes can be edited by a signed-in user or a direct LAN client (`401` otherwise, same rule as `DELETE /api/quiz/:filename`), but their visibility cannot be changed (`400`, `error_quiz_legacy_public`).

**Response:** the updated metadata entry.

#### POST /api/quiz-metadata/:filename/password
Set or remove a quiz password.

**Request Body:** `{ "password": "secret" }` or `{ "password": null }`

Requires a signed-in user (`401`). Setting a password requires a quiz that has an owner (`400`, `error_quiz_password_requires_owner`), and the requester must be that owner (`403`). Clearing the password of an ownerless legacy quiz is allowed for any signed-in user.

**Response:** `{ "success": true, "protected": true }`

---

### Results Management

Each result file records who may read it back: the signed-in user who hosted the game (`hostUserId`) and a hash of the game's host token (the `hostToken` sent to the host in `game-created`). Reading, exporting or deleting a result requires one of:

- a session cookie for the user who hosted the game, or
- the host token, sent as `Authorization: Bearer <hostToken>` or in `X-Host-Token` (comma-separated, up to 25 tokens of at most 100 characters each).

Result files written before ownership tracking have neither field and are readable by any signed-in user. For list, read and export, a request with neither a session nor a host token gets `401` (`error_auth_required`). A request whose credentials do not match, and any delete without matching credentials, gets `403` (`error_access_forbidden`). Games that finish normally are saved by the server; `POST /api/save-results` is the client-side path.

#### POST /api/save-results
Save game results to the server.

**Request Body:**
```json
{
  "quizTitle": "My Quiz",
  "gamePin": "123456",
  "results": [
    {
      "name": "Player1",
      "score": 500,
      "answers": [...]
    }
  ],
  "startTime": "2024-01-15T10:00:00.000Z",
  "endTime": "2024-01-15T10:30:00.000Z",
  "questions": [...]
}
```

Validated with zod: `quizTitle` 1 to 200 characters, `gamePin` exactly 6 digits, at most 500 `results` entries (each `name` up to 100 characters, up to 100 `answers`), at most 100 `questions`. Rate limited to 30 requests per minute per client IP. The file is bound to the signed-in user, if any, and to the first host token presented.

**Response:**
```json
{
  "success": true,
  "filename": "results_123456_1705312200000.json"
}
```

#### GET /api/results
List the saved results the requester may access, newest first. The per-player `results` array is omitted from the listing.

**Response:**
```json
[
  {
    "filename": "results_123456_1705312200000.json",
    "quizTitle": "My Quiz",
    "gamePin": "123456",
    "participantCount": 10,
    "averageScore": 72,
    "startTime": "2024-01-15T10:00:00.000Z",
    "endTime": "2024-01-15T10:30:00.000Z",
    "saved": "2024-01-15T10:30:00.000Z",
    "fileSize": 2048
  }
]
```

#### GET /api/results/:filename
Get a specific result file.

**Response:** Full result JSON data.

#### GET /api/results/:filename/export/:format
Export results in CSV or JSON format.

**Parameters:**
- `filename`: The result filename
- `format`: `csv` or `json`

**Query Parameters:**
- `type`: `simple` (player-centric) or `analytics` (question breakdowns). Default `analytics`.

**Response:** CSV or JSON file download (`Content-Disposition: attachment`).

#### DELETE /api/results/:filename
Delete a result file.

Requires `confirm=true` (`400`, `error_confirm_required`). When an `Origin` or `Referer` header is present, its host must equal the `Host` header (`403`, `error_cross_origin`). The requester must have access to the file as described above (`403` otherwise).

**Response:**
```json
{
  "success": true,
  "message": "Result deleted successfully"
}
```

---

### Game Information

#### GET /api/active-games
List games that are not finished (for player discovery).

The list contains live PINs, so it is returned only to signed-in users and to a direct LAN client (loopback or private peer address and no `CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP` or `Forwarded` header). Every other request gets `200` with `{"games": []}`.

**Response:**
```json
{
  "games": [
    {
      "pin": "123456",
      "title": "My Quiz",
      "playerCount": 5,
      "questionCount": 10,
      "gameState": "lobby",
      "created": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

`created` is the time of the request, not the time the game was created.

#### GET /api/qr/:pin
Generate QR code for a game PIN.

**Parameters:**
- `pin`: 6-digit game PIN

**Response:**
```json
{
  "qrCode": "data:image/svg+xml;base64,...",
  "gameUrl": "https://quiz.example.com/?pin=123456",
  "pin": "123456"
}
```

`400` for a PIN that is not 6 digits, `404` when no game has that PIN. Responses are cached and carry cache headers.

---

### File Upload

All four upload routes need no sign-in and share one per-IP limit of 30 requests per minute, checked before the file is read (`429`, `messageKey: "error_rate_limited"`, `retryAfter` in seconds). A file over the size limit returns `413` (`error_file_too_large`). Failures return `{error, messageKey}` JSON.

#### POST /upload
Upload an image for a quiz question.

**Request:** `multipart/form-data` with `image` field.

**Constraints:**
- Max file size: 5MB
- Allowed types: `image/*` MIME type, and the file's first bytes must match JPEG, PNG, GIF, WebP or BMP (`400`, `error_invalid_image_content` otherwise)
- The stored extension is taken from an allowlist (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`); any other extension is stored as `.png`

JPEG, PNG and BMP uploads are also converted to WebP. GIF (to keep animation) and WebP files are not converted.

**Response:**
```json
{
  "filename": "1705312200000-a1b2c3d4e5f6.png",
  "url": "/uploads/1705312200000-a1b2c3d4e5f6.png",
  "webpFilename": "1705312200000-a1b2c3d4e5f6.webp",
  "webpUrl": "/uploads/1705312200000-a1b2c3d4e5f6.webp"
}
```

`webpFilename` and `webpUrl` are `null` for GIFs and when conversion fails.

#### POST /api/extract-pdf
Extract text from a PDF file (for AI quiz generation).

**Request:** `multipart/form-data` with `pdf` field. Max file size 10MB.

Extraction uses pdfjs-dist in a worker thread with a 256 MB heap cap and a 30-second timeout; the worker is terminated on timeout. Text is read from at most the first 500 pages and truncated to 1,000,000 characters.

**Response:**
```json
{
  "text": "Extracted PDF content...",
  "pages": 5
}
```

`pages` is the document's total page count, which can exceed the number of pages read.

**Errors:**
- `400`: no file, a MIME type other than `application/pdf` (`error_upload_failed`), or a file pdf.js cannot parse (`error_pdf_extraction_failed`)
- `408`: extraction timed out (`error_pdf_timeout`)
- `413`: file over 10MB
- `503`: two extractions are already running on the server, or this client IP already has one running (`messageKey: "error_rate_limited"`)

#### POST /api/extract-docx
Extract text from a Word document.

**Request:** `multipart/form-data` with `docx` field. Max file size 10MB. MIME type must be `application/vnd.openxmlformats-officedocument.wordprocessingml.document`; any other type is dropped and the route returns `400` (`error_no_docx_uploaded`).

Parsed with mammoth, 30-second timeout (`408`, `error_docx_timeout`). Returns `501` if mammoth is not installed.

**Response:** `{ "text": "...", "wordCount": 1234 }`

#### POST /api/extract-pptx
Extract slide text from a PowerPoint file.

**Request:** `multipart/form-data` with `pptx` field. Max file size 20MB. MIME type must be `application/vnd.openxmlformats-officedocument.presentationml.presentation`; any other type returns `400` (`error_no_pptx_uploaded`).

The file is opened as a zip with jszip and the `<a:t>` text runs of `ppt/slides/slideN.xml` are read in slide order. Decompressed slide XML is capped at 5MB per slide and 20MB in total. A file that is not a zip or has no slides returns `400` (`error_pptx_extraction_failed`). Timeout 60 seconds (`408`, `error_pptx_timeout`).

**Response:** `{ "text": "...", "slideCount": 12 }`. Slides are separated by a blank line.

---

### AI Integration

**Keys and rate limits for `POST /api/claude/generate`, `POST /api/gemini/generate` and `POST /api/ai/complete`:**
- A key in the request body (`apiKey`) is used in preference to the server key (`CLAUDE_API_KEY` or `GEMINI_API_KEY`).
- Every request is rate limited per client IP, whichever key it uses. The three routes share one counter of 10 requests per minute (`429`, `messageKey: "error_rate_limited"`, `retryAfter` in seconds). Allowed responses carry `X-RateLimit-Remaining`. The check runs after body validation.
- Spending the server key requires a signed-in user: a request without `apiKey` from an anonymous client gets `401` (`error_auth_required`) when a server key is configured.
- With no key from either source the route returns `400` (`error_api_key_required`).
- Provider errors are passed through with the provider's status code. The two generate routes map the `messageKey` (`error_invalid_api_key` for 401, `error_rate_limited` for 429, `error_invalid_request` for 400). Upstream requests time out after 120 seconds.

#### POST /api/claude/generate
Generate quiz questions using Claude AI.

**Request Body:**
```json
{
  "prompt": "Generate 5 questions about...",
  "apiKey": "optional-client-key",
  "numQuestions": 5,
  "model": "claude-sonnet-4-5",
  "contentFlags": { "needsLatex": false, "needsCodeBlocks": false, "language": null }
}
```

`prompt` must be at least 10 characters, `numQuestions` 1 to 50 (default 5), `model` matches `^[A-Za-z0-9._-]+$`. `contentFlags` selects which formatting rules go into the system prompt; when omitted, all rules are included.

**Response:** the Anthropic Messages API response body, unchanged. The request prefills the assistant turn with `[`, so the returned text continues a JSON array.

#### POST /api/gemini/generate
Generate quiz questions using Gemini.

**Request Body:** same fields as the Claude route; `model` defaults to `gemini-2.5-flash` (or `GEMINI_MODEL`).

**Response:** the Gemini `generateContent` response body, with an added `_finishReason` field (for example `"MAX_TOKENS"` when the output was truncated). Gemini 402 and 403 map to `error_api_quota_exceeded` and `error_api_forbidden`.

#### POST /api/ai/complete
General-purpose completion used by other client features.

**Request Body:**
```json
{
  "provider": "claude",
  "prompt": "User prompt",
  "system": "System prompt",
  "model": "optional-model-id",
  "apiKey": "optional-client-key",
  "maxTokens": 4096
}
```

`provider` is `claude` or `gemini`; `maxTokens` 100 to 32000.

**Response:** `{ "text": "..." }`

#### POST /api/extract-url
Fetch a web page and return its main text (for AI quiz generation).

**Request Body:** `{ "url": "https://quiz.example.com/article" }` (http or https only).

Rate limited to 5 requests per minute per client IP. The host is resolved through DNS on every redirect hop and private, loopback, link-local and CGNAT addresses are refused (`403`, `error_url_blocked`). At most 5 redirects, 10-second timeout (`408`), 5MB response cap (`413`), and the content type must be HTML or plain text (`400`).

**Response:** `{ "text": "...", "title": "...", "wordCount": 850, "sourceUrl": "..." }`

#### GET /api/ai/config
Check AI provider configuration status.

**Response:**
```json
{
  "claudeKeyConfigured": true,
  "geminiKeyConfigured": false,
  "ollamaAvailable": false
}
```

#### GET /api/ollama/config
**Response:** `{ "url": "http://localhost:11434", "enabled": false }`. Defaults come from `OLLAMA_URL` and `OLLAMA_ENABLED=true`.

#### POST /api/ollama/config
Change the Ollama URL or enable flag at runtime. Requires a signed-in user.

**Request Body:** `{ "url": "http://quiz.example.com:11434", "enabled": true }` (both optional).

A URL whose host resolves to a private or internal address is refused (`403`, `error_url_blocked`). A URL set this way is checked again on every later Ollama request.

#### GET /api/ollama/models
List available Ollama models. Returns `{ "models": [] }` when Ollama is disabled.

**Response:**
```json
{
  "models": [
    { "name": "llama3", "size": 4661224676, "modified_at": "2024-01-15T10:30:00.000Z" }
  ]
}
```

#### POST /api/ollama/generate
Proxy a generation request to Ollama's `/api/generate`.

**Request Body:** `{ "model": "llama3", "prompt": "...", "stream": false, "options": {} }`. `model` and `prompt` are required (`400`).

Returns `503` (`error_ollama_disabled`) when Ollama is disabled. Otherwise every request is rate limited per client IP to 20 per minute, on a counter separate from the Claude and Gemini routes. No API key is involved. **Response:** Ollama's response body.

#### GET /api/ollama/health
**Response:** `{ "running": true }`; `false` when disabled or unreachable (3-second timeout).

---

### Manim animations

#### POST /api/manim/render
Render a Manim animation from Python code. Requires a signed-in user, because the code is executed on the server.

**Request Body:** `{ "code": "...", "quality": "low" }` (`quality` is `low`, `medium` or `high`).

Rate limited to 2 requests per minute per client IP. Returns `400` for missing code, invalid quality or code rejected by validation, `408` on render timeout, `500` on other failures.

**Response:** `{ "videoPath": "...", "duration": 4.2 }`

#### GET /api/manim/status
Requires a signed-in user. **Response:** `{ "available": true, "version": "...", "enabled": true }`

---

## Socket.IO Events

All Socket.IO communication uses the default namespace (`/`). Handlers live in `socket/` and the services under `services/`. Each game has a room named `game-<pin>`. Payloads with a zod schema in `services/validation-schemas.js` are validated; an invalid payload gets `error` with `messageKey: "error_validation_failed"`. Most handler failures are reported as `error` events with `{ message, messageKey }`.

"Host only" below means the handler looks up the game by the sending socket's ID and silently ignores the event, or emits `error`, when that socket is not hosting a game.

### Connection Events

#### Client -> Server: `connection`
Automatically triggered when a client connects. A connection middleware reads the `quizix_session` cookie from the handshake and stores the signed-in user on the socket. It never rejects a connection; without a valid cookie the socket is anonymous. A game created by a signed-in host records `hostUserId`, which grants access to its results.

#### Server -> Client: `connect`
Confirms successful connection.

#### Client -> Server: `disconnect`
Triggered when client disconnects. Server handles:
- Player disconnect: in an active game the player is marked disconnected and kept for 2 minutes so `player-rejoin` can restore the score; in the lobby the player is removed. The room gets `player-list-update` and `player-disconnected` (`{ playerName }`).
- Host disconnect during an active game: players get `host-disconnected` (`{ graceMs: 30000 }`). If the host does not send `host-rejoin` within 30 seconds, the game moves to pending migration, players get `host-preparing-new-game` (`{ graceMs: 120000 }`), and after 2 more minutes without a new game they get `game-ended`.
- Host disconnect in the lobby: the game is deleted and players get `game-ended` (`{ reason: "Host disconnected" }`). Players registered in the host session wait in the session room for 2 minutes before `session-released`.
- Orphaned game cleanup.

---

### Host Events

#### Client -> Server: `host-join`
Host creates a game lobby. Rate limited to 5 per second.

**Payload:**
```json
{
  "quiz": {
    "title": "My Quiz",
    "questions": [...],
    "randomizeQuestions": false,
    "randomizeAnswers": false,
    "manualAdvancement": true,
    "powerUpsEnabled": false,
    "showLeaderboardBetweenQuestions": true,
    "sameTimeForAll": false,
    "questionTime": 20,
    "scoringConfig": {},
    "consensusMode": false,
    "consensusThreshold": "66",
    "discussionTime": 30,
    "allowChat": false
  },
  "previousPin": "654321",
  "migrationToken": "uuid",
  "hostSessionId": "uuid",
  "hostSessionToken": "uuid"
}
```

Game options are top-level keys of `quiz`. All keys except `quiz.title` and `quiz.questions` are optional.

- `hostSessionId` and `hostSessionToken` reuse an existing host session (and the players registered in it). The session is reused only when the socket is the session's current host socket or `hostSessionToken` matches. `hostSessionId` alone is not enough, because players receive it in `session-waiting`.
- `previousPin` and `migrationToken` move players from a game in pending migration (see `host-starting-new-game`). The token is not checked when the migration started from a host disconnect.
- If this socket already hosts a game, that game is ended (`game-ended` to its room) and deleted.

**Server Response Events:**
- `game-created` (to the host): Game successfully created
  ```json
  {
    "pin": "123456",
    "gameId": "uuid",
    "title": "My Quiz",
    "hostSessionId": "uuid",
    "hostSessionToken": "uuid",
    "hostToken": "uuid"
  }
  ```
  `hostToken` authenticates `host-rejoin` and grants access to this game's results over HTTP. `hostSessionToken` is required to reuse the host session from another socket. Both are secrets sent only to the host.
- `game-available` (to every other connected socket): `{ pin, title, questionCount, created }`
- `error`: Error creating game, e.g. `{ "message": "Failed to create game", "messageKey": "error_failed_create_game" }`

#### Client -> Server: `host-rejoin`
Host reconnects to a game after a disconnect.

**Payload:** `{ "pin": "123456", "token": "<hostToken from game-created>" }`

Fails with `error` when the game is not waiting for its host, or when `token` does not match (`error_not_authorized_host`). On success the room gets `host-reconnected` and the host gets `host-rejoin-success` (`{ pin, gameState, currentQuestion, players, leaderboard, quizTitle }`). If a question is running, the host also gets `question-start` (with `remainingTimeMs`) and `answer-count-update`; during a reveal it gets `question-timeout`, `answer-statistics` and, in manual mode, `show-next-button`.

#### Client -> Server: `host-starting-new-game`
Host only. Moves the current game to pending migration so its players can follow the host into a new game. Players get `host-preparing-new-game` (`{ graceMs: 120000 }`); the host gets `migration-token` (`{ pin, migrationToken }`) to pass in the next `host-join`, and leaves the old room.

#### Client -> Server: `rematch-game`
Host only, after the game has finished. Resets the game with the same PIN and players. The room gets `game-reset` (`{ pin, title, players, questionCount, hostSocketId }`) and players get `players-muted` (`{ muted: false }`).

#### Client -> Server: `stop-quiz`
Host only. Ends the game early. A running question is ended first (reveal events as on timeout), then the game ends with `game-end`.

#### Client -> Server: `set-players-muted`
Host only. **Payload:** `{ "muted": true }`. Players (not the host) get `players-muted` (`{ muted }`). Late joiners and rejoining players receive the current value.

---

### Player Events

#### Client -> Server: `player-join`
Player joins an existing game. Allowed while the game is in the lobby, a question, or a reveal. Rate limited to 5 per second.

**Payload:**
```json
{
  "pin": "123456",
  "name": "PlayerName",
  "deviceId": "optional-uuid"
}
```

A device that has a disconnected entry in the game resumes that entry, with its score, instead of creating a new one.

**Server Response Events:**
- `player-joined` (to the joining player): Successfully joined
  ```json
  {
    "gamePin": "123456",
    "playerName": "PlayerName",
    "players": [{ "id": "socket-id", "name": "PlayerName", "disconnected": false }],
    "sessionToken": "token-for-player-rejoin",
    "hostSessionId": "uuid"
  }
  ```
  Followed by `players-muted`. A player joining during a question or reveal also gets `game-started`, and during a question the current `question-start`.
- `error`: Failed to join, e.g. `{ "message": "Game not found", "messageKey": "error_game_not_found" }`. Other keys: `error_game_already_started`, `error_name_already_taken`, `error_name_length`, `error_name_invalid_chars`.

**Broadcast Events (to room):**
- `player-list-update`: Updated player list (debounced)
  ```json
  {
    "players": [
      { "id": "socket-id", "name": "Player1", "disconnected": false }
    ]
  }
  ```

#### Client -> Server: `player-rejoin`
Rejoin after a reconnect. **Payload:** `{ "pin": "123456", "sessionToken": "..." }`

On success the player gets `rejoin-success` (`{ playerName, score, currentQuestion, gameStatus, sessionToken, gamePin }`), `players-muted`, and the current question, reveal, or final `game-end` as applicable. On failure, including an invalid payload, the player gets `rejoin-failed` (`{ message, messageKey? }`).

#### Client -> Server: `player-change-name`
**Payload:** `{ "newName": "NewName" }` (1 to 50 characters). On success the player gets `name-changed` (`{ success, oldName, newName }`) and the room gets `player-list-update`.

#### Client -> Server: `request-time-sync`
Player asks for the remaining question time, for example after a phone wakes up. Reply: `time-sync` (`{ remainingMs }`), only while a question is running.

---

### Game Flow Events

#### Client -> Server: `start-game`
Host only, no payload. Starts the game. Rate limited to 3 per second.

**Server Broadcast Events:**
- `game-started`: Game is about to start
  ```json
  {
    "gamePin": "123456",
    "questionCount": 10,
    "manualAdvancement": true,
    "powerUpsEnabled": false,
    "consensusConfig": null
  }
  ```
- `question-start`: Question data
  ```json
  {
    "questionNumber": 1,
    "totalQuestions": 10,
    "question": "What is 2+2?",
    "type": "multiple-choice",
    "image": "",
    "video": "",
    "timeLimit": 20,
    "options": ["3", "4", "5", "6"]
  }
  ```
  With `randomizeAnswers`, each player gets an individually shuffled `options` array and the host gets the original order.
- `answer-count-update` (to host): `{ answeredPlayers, connectedPlayers, totalPlayers }`

#### Client -> Server: `submit-answer`
Player submits an answer. Rate limited to 3 per second.

**Payload:**
```json
{
  "answer": 1,
  "type": "multiple-choice"
}
```

`answer` is an integer 0 to 1000, a boolean, a string of up to 200 characters, or an array of up to 100 integers. Response time is measured on the server.

**Server Events:**
- `answer-submitted` (to the player): `{ "answer": 1 }`
- `answer-already-submitted` (to the player): duplicate submission, with the answer on record: `{ "reason": "duplicate", "answer": 1 }`
- `answer-rejected` (to the player): `{ reason, message, messageKey }`, e.g. `reason: "question_ended"` when the answer arrives after the question closed
- `answer-count-update` (to host): `{ answeredPlayers, connectedPlayers, totalPlayers }`

When the question ends (timer, all players answered, or `force-end-question`):
- `question-timeout` (to room): correct-answer data `{ correctAnswer, correctAnswers?, correctOrder?, correctOption, questionType, tolerance, explanation, isPoll }`
- `answer-statistics` (to host): `{ totalPlayers, answeredPlayers, answerCounts, questionType, ... }`
- `player-result` (to each player): `{ isPoll, isCorrect, points, partialScore, totalScore, explanation, questionType, correctAnswer, correctAnswers? }`. Indices are mapped into that player's shuffled order.
- `question-end` (to room): `{ "showStatistics": true }`
- In manual mode, `show-next-button` (to host): `{ "isLastQuestion": false }`. In automatic mode, `show-leaderboard` (to room, `{ leaderboard }` with the top 5) when `showLeaderboardBetweenQuestions` is on, then the next `question-start`.

#### Client -> Server: `use-power-up`
**Payload:** `{ "type": "fifty-fifty" }` (`fifty-fifty`, `extend-time` or `double-points`). Reply: `power-up-result` (`{ success, ... }` or `{ success: false, error, messageKey }`). A successful `extend-time` sends `timer-extended` (`{ remainingMs }`) to the room.

#### Client -> Server: `force-end-question`
Host only, no payload. Ends the running question early. Rate limited to 2 per second.

#### Client -> Server: `next-question`
Host only, no payload. Accepted only while the game is revealing a question (manual advancement); ignored in any other state.

**Server Broadcast Events:**
- `hide-next-button` (to host)
- `show-leaderboard` (to room) when `showLeaderboardBetweenQuestions` is on
- `question-start`: Next question data (same format as above)
- `game-end`: If no more questions. The host gets `{ "finalLeaderboard": [...] }`; each connected player gets `{ "finalLeaderboard": [...], "conceptMastery": {...} }`. Results are saved to `results/` at this point.

#### Client -> Server: `leave-game`
Player leaves the game voluntarily. The player is removed immediately.

**Server Events:**
- `player-list-update` (broadcast): Updated player list
- `player-disconnected` (broadcast): `{ "playerName": "PlayerName" }`
- `answer-count-update` (to host) when a question is running

---

### Session events

A host session groups the devices that joined a host's games, so players can follow the host from one game to the next.

#### Client -> Server: `session-check`
**Payload:** `{ "deviceId": "uuid", "hostSessionId": "uuid" }`. When the device is registered in the session: if the session's current game accepts joins, the player is joined to it (`player-joined`); otherwise the socket joins the session room and gets `session-waiting` (`{ hostSessionId }`). An unknown session or device gets `session-invalid`.

#### Client -> Server: `leave-session`
**Payload:** `{ "deviceId": "uuid", "hostSessionId": "uuid" }`. Removes the device from the session.

#### Client -> Server: `release-session`
**Payload:** `{ "hostSessionId": "uuid" }`. Only the session's current host socket may send it (`error` otherwise). Every socket in the session room gets `session-released`, and the session is destroyed.

---

### Consensus mode events

Used when the quiz has `consensusMode: true`. Players propose an answer and discuss; the host locks the team answer.

| Client -> Server | Payload | Server events |
|------------------|---------|---------------|
| `propose-answer` | `{ "answer": 2 }` | `proposal-update` (room); `consensus-threshold-met` (room, `{ answer, percentage, threshold }`) when the threshold is reached |
| `send-quick-response` | `{ "type": "agree", "targetPlayer": "optional" }`, type one of `propose`, `agree`, `unsure`, `discuss`, `ready` | `quick-response` (room) |
| `send-chat-message` | `{ "text": "..." }`, 1 to 200 characters, only when chat is enabled | `chat-message` (room) |
| `lock-consensus` | none, host only | `consensus-reached` (room), `team-score-update` (room, `{ teamScore, questionPoints, isCorrect }`) |

---

### Other server-to-client events

| Event | Target | Payload |
|-------|--------|---------|
| `error` | sender | `{ message, messageKey }` |
| `rate-limited` | sender | `{ event, message, messageKey }` |
| `game-ended` | room | `{ reason, messageKey? }`: game ended without a final leaderboard (host left, host replaced the game, migration expired) |
| `host-reconnected` | room | none |

---

## Rate Limiting

Socket.IO events are rate-limited per socket and per event name, in one-second windows. Each handler sets its own limit: 2 per second for `force-end-question`; 3 for `start-game`, `stop-quiz`, `rematch-game`, `host-starting-new-game`, `submit-answer`, `use-power-up`, `set-players-muted`, `lock-consensus`, `session-check`, `release-session` and `request-time-sync`; 5 for `host-join`, `player-join`, `player-change-name`, `player-rejoin`, `host-rejoin`, `next-question`, `propose-answer`, `send-chat-message` and `leave-session`; 10 for `send-quick-response`. `leave-game` and `disconnect` are not limited. An event over the limit is dropped and triggers:

**Server -> Client: `rate-limited`**
```json
{
  "event": "submit-answer",
  "message": "Too many requests, please slow down",
  "messageKey": "error_rate_limited"
}
```

HTTP rate limits are listed with each route. They are in-memory, per client IP, and use fixed one-minute windows. The client IP is the `CF-Connecting-IP` header when the direct peer is loopback or listed in `TRUSTED_PROXY_IPS`, and Express `req.ip` otherwise.

---

## Event Batching

`services/socket-batch-service.js` can batch high-frequency events (`answer-statistics`, `player-answered`, `leaderboard-update`) and send them as `{event-name}-batch` with an array of payloads. The server creates the service, but no caller of its `emit` method was found in `socket/` or `services/`, so no events are currently batched. `answer-statistics` is sent directly, and `player-answered` and `leaderboard-update` are not emitted.

---

## Error Handling

All API endpoints return errors in a consistent format:

```json
{
  "error": "Error message",
  "messageKey": "error_translation_key",
  "details": "Optional additional details (development only)"
}
```

`messageKey` is a translation key the client uses for localized messages. zod validation failures (`400`) put an array of `{ field, message }` in `details`. Errors not handled by a route go to a terminal handler that returns `{ "error": "Internal server error", "messageKey": "error_server_error" }` for 5xx statuses.

HTTP Status Codes:
- `200`: Success
- `201`: Created (folder)
- `400`: Bad Request (invalid input)
- `401`: Authentication required (no session, or no unlock token for a protected item)
- `403`: Forbidden (not the owner, invalid token, cross-origin delete, blocked URL)
- `404`: Not Found
- `408`: Timeout (file extraction, URL fetch, Manim render)
- `409`: Conflict (username taken)
- `413`: Payload Too Large (file upload)
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error
- `501`: Optional dependency not installed (DOCX, URL extraction)
- `503`: Service unavailable (PDF extraction busy, Ollama disabled, readiness check failed)

---

## Authentication

Quizix Pro implements **optional password protection** for quizzes and folders.

User accounts (see [User accounts](#user-accounts)) are a separate mechanism: they decide ownership and private visibility. Passwords and unlock tokens described here gate access to individual protected items.

### Password Protection Features

- **Quiz-level passwords**: Set at creation time via `/api/save-quiz` or later via `/api/quiz-metadata/:filename/password`. Both require a signed-in owner. The owner is not asked for their own quiz password, and passwords on ownerless legacy quizzes are not enforced.
- **Folder-level passwords**: Set via `/api/folders/:id/password` endpoint. A folder password protects every quiz in that folder and its subfolders that has no password of its own. Those quizzes stay in listings, marked `protected`, and loading one needs an unlock token, for its owner too.
- **Session tokens**: 1-hour expiring tokens after successful unlock
- **Security model**: PBKDF2-SHA512 hashing with 100,000 iterations
- **Rate limiting**: 5 unlock attempts per minute per IP address

### Authentication Endpoints

#### Check if Item Requires Authentication
```
GET /api/requires-auth/:itemType/:itemId
```

**Parameters:**
- `itemType`: `folder` or `quiz`
- `itemId`: Folder ID or quiz filename

**Response:**
```json
{
  "requiresAuth": true
}
```

#### Unlock Password-Protected Item
```
POST /api/unlock
```

**Request Body:**
```json
{
  "itemId": "quiz-filename.json",
  "itemType": "quiz",
  "password": "user-password"
}
```

**Response:**
```json
{
  "token": "a1b2c3d4...",
  "expiresIn": 3600000
}
```

A token is valid only for the `itemId` and `itemType` it was issued for. To open a quiz that has no password of its own but sits inside a protected folder, send `itemType: "quiz"`, the quiz filename, and the password of the nearest protected ancestor folder. The returned token is scoped to that quiz. A folder token does not open the quizzes inside it.

**Error Responses:**
- `429`: Too many unlock attempts (rate limit exceeded)
- `401`: Incorrect password
- `400`: Item not found, item not password protected, or invalid body

### Authentication Flow

1. Client checks if item requires auth: `GET /api/requires-auth/:itemType/:itemId`
2. If `requiresAuth: true`, client prompts for password
3. Client unlocks item: `POST /api/unlock` with credentials
4. Server returns session token (1hr expiry)
5. Client includes token in subsequent requests: `Authorization: Bearer <token>`

### Protected Operations

The following endpoints require authentication for password-protected items:

- `GET /api/quiz/:filename` - Load quiz (`401` for a missing or invalid token)
- `DELETE /api/quiz/:filename` - Delete quiz file (`401` missing token, `403` invalid token)
- `DELETE /api/folders/:id` - Delete folder (`401` missing token, `403` invalid token)

**Example with Authentication:**
```javascript
const response = await fetch('/api/quiz/my-quiz.json?confirm=true', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer a1b2c3d4...'
  }
});
```

### Security Guarantees

- **Fail-closed policy**: If authentication verification fails (network error, server error), access is **denied** for security
- **Automatic token refresh**: Expired tokens trigger seamless re-authentication
- **Password hashing**: All passwords use PBKDF2-SHA512 (100,000 iterations) - never stored in plaintext
- **Timing-safe comparison**: Prevents timing attack vulnerabilities
- **Session tokens**: Cryptographically random 32-byte tokens

### Additional Security Considerations

For multi-tenant deployments beyond password protection, consider:

1. Adding JWT authentication for user sessions
2. Implementing game-specific access tokens
3. Using a reverse proxy with authentication (e.g., nginx with basic auth)

---

## CORS Configuration

The server automatically configures CORS based on the environment:

- **Both modes**: Allow localhost, 127.0.0.1, private IPv4 ranges and mDNS `.local` hosts, on ports 3000, 3001, 8000, 8080 or the server's own `PORT` (or with no port)
- **Production**: Also allows HTTPS origins matching the built-in cloud-platform patterns (Vercel, Netlify, Heroku and others)
- **`ALLOWED_ORIGINS`** (comma-separated exact origins): adds those origins and, in production, drops the cloud-platform patterns
- Requests without an `Origin` header are allowed

See `services/cors-validation-service.js` for details.
