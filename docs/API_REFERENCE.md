# Quizix Pro API Reference

This document provides comprehensive documentation for all REST API endpoints and Socket.IO events in Quizix Pro.

## Table of Contents

- [REST API Endpoints](#rest-api-endpoints)
  - [Health & Status](#health--status)
  - [Quiz Management](#quiz-management)
  - [Results Management](#results-management)
  - [Game Information](#game-information)
  - [File Upload](#file-upload)
  - [AI Integration](#ai-integration)
- [Socket.IO Events](#socketio-events)
  - [Connection Events](#connection-events)
  - [Host Events](#host-events)
  - [Player Events](#player-events)
  - [Game Flow Events](#game-flow-events)

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

#### GET /api/ping
Simple ping endpoint for connection testing.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

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
      "time": 20,
      "explanation": "Basic arithmetic"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "filename": "my_quiz_1705312200000.json",
  "id": "uuid-v4-string"
}
```

#### GET /api/quizzes
List all saved quizzes.

**Response:**
```json
[
  {
    "filename": "my_quiz_1705312200000.json",
    "title": "My Quiz",
    "questionCount": 5,
    "created": "2024-01-15T10:30:00.000Z",
    "id": "uuid-v4-string"
  }
]
```

#### GET /api/quiz/:filename
Load a specific quiz by filename.

**Parameters:**
- `filename`: The quiz filename (e.g., `my_quiz_1705312200000.json`)

**Response:**
```json
{
  "title": "My Quiz",
  "questions": [...],
  "created": "2024-01-15T10:30:00.000Z",
  "id": "uuid-v4-string"
}
```

---

### Results Management

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

**Response:**
```json
{
  "success": true,
  "filename": "results_123456_1705312200000.json"
}
```

#### GET /api/results
List all saved results.

**Response:**
```json
[
  {
    "filename": "results_123456_1705312200000.json",
    "quizTitle": "My Quiz",
    "gamePin": "123456",
    "participantCount": 10,
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
- `type`: `simple` (player-centric) or `analytics` (question breakdowns)

**Response:** CSV or JSON file download.

#### DELETE /api/results/:filename
Delete a result file.

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
List all active game lobbies (for player discovery).

**Response:**
```json
{
  "games": [
    {
      "pin": "123456",
      "quizTitle": "My Quiz",
      "playerCount": 5,
      "status": "lobby",
      "hostJoined": true
    }
  ]
}
```

#### GET /api/qr/:pin
Generate QR code for a game PIN.

**Parameters:**
- `pin`: 6-digit game PIN

**Response:** PNG image of QR code.

---

### File Upload

#### POST /upload
Upload an image for a quiz question.

**Request:** `multipart/form-data` with `image` field.

**Constraints:**
- Max file size: 5MB
- Allowed types: image/*

**Response:**
```json
{
  "success": true,
  "path": "/uploads/a1b2c3d4e5f6.png",
  "originalName": "question-image.png"
}
```

#### POST /api/extract-pdf
Extract text from a PDF file (for AI quiz generation).

**Request:** `multipart/form-data` with `pdf` field.

**Response:**
```json
{
  "text": "Extracted PDF content...",
  "pages": 5
}
```

---

### AI Integration

#### POST /api/claude/generate
Generate quiz questions using Claude AI.

**Request Body:**
```json
{
  "prompt": "Generate 5 questions about...",
  "apiKey": "optional-client-key"
}
```

**Note:** If `CLAUDE_API_KEY` is set on the server, client key is optional.

**Response:**
```json
{
  "content": "Generated quiz content..."
}
```

#### GET /api/ai/config
Check AI provider configuration status.

**Response:**
```json
{
  "claude": {
    "available": true,
    "hasServerKey": true
  },
  "ollama": {
    "available": false
  }
}
```

#### GET /api/ollama/models
List available Ollama models (if Ollama is running locally).

**Response:**
```json
{
  "models": ["llama2", "mistral", "codellama"]
}
```

---

## Socket.IO Events

All Socket.IO communication uses the default namespace (`/`).

### Connection Events

#### Client -> Server: `connection`
Automatically triggered when a client connects.

#### Server -> Client: `connect`
Confirms successful connection.

#### Client -> Server: `disconnect`
Triggered when client disconnects. Server handles:
- Player removal from game
- Host disconnect handling
- Game cleanup if no players remain

---

### Host Events

#### Client -> Server: `host-join`
Host creates or joins a game lobby.

**Payload:**
```json
{
  "quiz": {
    "title": "My Quiz",
    "questions": [...],
    "settings": {
      "randomizeQuestions": false,
      "randomizeAnswers": false,
      "manualAdvance": true
    }
  }
}
```

**Server Response Events:**
- `game-created`: Game successfully created
  ```json
  {
    "pin": "123456",
    "quiz": {...}
  }
  ```
- `host-join-error`: Error creating game
  ```json
  {
    "error": "Failed to create game"
  }
  ```

---

### Player Events

#### Client -> Server: `player-join`
Player joins an existing game.

**Payload:**
```json
{
  "pin": "123456",
  "name": "PlayerName"
}
```

**Server Response Events:**
- `join-success`: Successfully joined
  ```json
  {
    "gamePin": "123456",
    "playerName": "PlayerName",
    "quizTitle": "My Quiz"
  }
  ```
- `join-error`: Failed to join
  ```json
  {
    "error": "Game not found"
  }
  ```

**Broadcast Events (to room):**
- `player-joined`: New player notification
  ```json
  {
    "name": "PlayerName",
    "playerCount": 5
  }
  ```
- `player-list-update`: Updated player list
  ```json
  {
    "players": ["Player1", "Player2", "Player3"]
  }
  ```

---

### Game Flow Events

#### Client -> Server: `start-game`
Host starts the game (moves from lobby to first question).

**Server Broadcast Events:**
- `game-starting`: Game is about to start
- `question`: First question data
  ```json
  {
    "questionNumber": 1,
    "totalQuestions": 10,
    "question": "What is 2+2?",
    "type": "multiple-choice",
    "options": ["3", "4", "5", "6"],
    "timeLimit": 20,
    "difficulty": "easy"
  }
  ```

#### Client -> Server: `submit-answer`
Player submits an answer.

**Payload:**
```json
{
  "answer": 1,
  "timeMs": 5234
}
```

**Server Events:**
- `answer-received`: Confirmation to player
  ```json
  {
    "accepted": true,
    "timeMs": 5234
  }
  ```
- `answer-statistics` (to host): Updated statistics
  ```json
  {
    "answered": 8,
    "total": 10,
    "distribution": [2, 5, 1, 0]
  }
  ```
- `player-answered` (to room): Player answered notification
  ```json
  {
    "playerName": "Player1",
    "answeredCount": 8
  }
  ```

#### Client -> Server: `next-question`
Host advances to next question.

**Server Broadcast Events:**
- `question-ended`: Current question results
  ```json
  {
    "correctAnswer": 1,
    "correctAnswerText": "4",
    "statistics": {...},
    "leaderboard": [...]
  }
  ```
- `question`: Next question data (same format as above)
- `game-ended`: If no more questions
  ```json
  {
    "leaderboard": [
      {"name": "Player1", "score": 2500, "rank": 1},
      {"name": "Player2", "score": 2100, "rank": 2}
    ],
    "quizTitle": "My Quiz",
    "totalQuestions": 10
  }
  ```

#### Client -> Server: `leave-game`
Player or host leaves the game voluntarily.

**Server Events:**
- `player-left` (broadcast): Player left notification
  ```json
  {
    "name": "PlayerName",
    "playerCount": 4
  }
  ```
- `host-left` (broadcast): Host disconnected
- `game-ended` (broadcast): If game cannot continue

---

## Rate Limiting

Socket.IO events are rate-limited to 10 events per second per client. Exceeding this limit triggers:

**Server -> Client: `rate-limited`**
```json
{
  "message": "Too many requests. Please slow down.",
  "retryAfter": 1000
}
```

---

## Event Batching

For performance optimization, certain high-frequency events may be batched:

- `answer-statistics`
- `player-answered`
- `leaderboard-update`

When batched, events are sent as `{event-name}-batch` with an array of payloads.

---

## Error Handling

All API endpoints return errors in a consistent format:

```json
{
  "error": "Error message",
  "details": "Optional additional details (development only)"
}
```

HTTP Status Codes:
- `200`: Success
- `400`: Bad Request (invalid input)
- `404`: Not Found
- `413`: Payload Too Large (file upload)
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

---

## Authentication

Quizix Pro is designed for trusted local networks and does not implement authentication. For multi-tenant deployments, consider:

1. Adding JWT authentication
2. Implementing game-specific access tokens
3. Using a reverse proxy with authentication

---

## CORS Configuration

The server automatically configures CORS based on the environment:

- **Development**: Allows localhost origins on common ports
- **Production**: Allows configured cloud platforms and local network IPs

See `services/cors-validation-service.js` for details.
