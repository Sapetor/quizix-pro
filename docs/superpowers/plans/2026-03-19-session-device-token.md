# Session & Device Token Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players are remembered by device across a host's session (multiple games), auto-join without re-entering their name, and see a waiting screen between games.

**Architecture:** Adds a lightweight `hostSessions` Map to the existing `PlayerManagementService`, layering on top of the current migration system. Client stores a persistent `deviceId` in localStorage and a session binding. New socket events handle session-check, waiting, and release flows. A `hostSessionIdToHost` reverse Map enables O(1) session lookup regardless of socket ID changes.

**Tech Stack:** Node.js, Socket.IO, Zod, ES6 modules (client)

**Spec:** `docs/superpowers/specs/2026-03-19-session-device-token-design.md`

**Key integration notes:**
- `createOrGetSession` accepts an optional `hostSessionId` param so the host can pass it back from client storage after reconnect/refresh. This prevents duplicate sessions on socket ID changes.
- `session-game-started` triggers server-side auto-join (server iterates session room sockets and calls `handlePlayerJoin` for each), not a client roundtrip.
- `migratePlayersToGame` must include `hostSessionId` in its `player-joined` emit.
- Host stores `hostSessionId` in `localStorage` (not `sessionStorage`) so it survives tab refresh.
- Client `_checkSessionBinding` is guarded to never fire during socket reconnects — only fresh page loads.
- Use `resetAndReturnToMenu()` for all screen transitions back to main menu per project GOTCHAS.

---

### Task 1: Add Zod schemas for new socket events

**Files:**
- Modify: `services/validation-schemas.js:376-379` (playerJoinSchema), `services/validation-schemas.js:499-521` (validateSocketEvent schemas map)
- Test: `tests/unit/validation-schemas.test.js`

- [ ] **Step 1: Write failing tests for new schemas**

```javascript
// In tests/unit/validation-schemas.test.js — add at the end

describe('Session event schemas', () => {
    test('playerJoinSchema accepts optional deviceId', () => {
        const result = playerJoinSchema.safeParse({ pin: '123456', name: 'Alice', deviceId: '550e8400-e29b-41d4-a716-446655440000' });
        expect(result.success).toBe(true);
    });

    test('playerJoinSchema still works without deviceId', () => {
        const result = playerJoinSchema.safeParse({ pin: '123456', name: 'Alice' });
        expect(result.success).toBe(true);
    });

    test('playerJoinSchema rejects invalid deviceId', () => {
        const result = playerJoinSchema.safeParse({ pin: '123456', name: 'Alice', deviceId: 'not-a-uuid' });
        expect(result.success).toBe(false);
    });

    test('sessionCheckSchema validates deviceId and hostSessionId', () => {
        const result = sessionCheckSchema.safeParse({
            deviceId: '550e8400-e29b-41d4-a716-446655440000',
            hostSessionId: '550e8400-e29b-41d4-a716-446655440001'
        });
        expect(result.success).toBe(true);
    });

    test('sessionCheckSchema rejects missing fields', () => {
        const result = sessionCheckSchema.safeParse({ deviceId: '550e8400-e29b-41d4-a716-446655440000' });
        expect(result.success).toBe(false);
    });

    test('leaveSessionSchema validates deviceId and hostSessionId', () => {
        const result = leaveSessionSchema.safeParse({
            deviceId: '550e8400-e29b-41d4-a716-446655440000',
            hostSessionId: '550e8400-e29b-41d4-a716-446655440001'
        });
        expect(result.success).toBe(true);
    });

    test('releaseSessionSchema validates hostSessionId', () => {
        const result = releaseSessionSchema.safeParse({
            hostSessionId: '550e8400-e29b-41d4-a716-446655440001'
        });
        expect(result.success).toBe(true);
    });

    test('validateSocketEvent recognizes session-check', () => {
        const result = validateSocketEvent('session-check', {
            deviceId: '550e8400-e29b-41d4-a716-446655440000',
            hostSessionId: '550e8400-e29b-41d4-a716-446655440001'
        });
        expect(result.valid).toBe(true);
    });

    test('validateSocketEvent recognizes leave-session', () => {
        const result = validateSocketEvent('leave-session', {
            deviceId: '550e8400-e29b-41d4-a716-446655440000',
            hostSessionId: '550e8400-e29b-41d4-a716-446655440001'
        });
        expect(result.valid).toBe(true);
    });

    test('validateSocketEvent recognizes release-session', () => {
        const result = validateSocketEvent('release-session', {
            hostSessionId: '550e8400-e29b-41d4-a716-446655440001'
        });
        expect(result.valid).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=validation-schemas`
Expected: FAIL — `sessionCheckSchema`, `leaveSessionSchema`, `releaseSessionSchema` not defined

- [ ] **Step 3: Add schemas and update playerJoinSchema**

In `services/validation-schemas.js`:

1. Update `playerJoinSchema` (line 376-379):
```javascript
const playerJoinSchema = z.object({
    pin: z.string().regex(/^\d{6}$/),
    name: z.string().min(1).max(50),
    deviceId: z.string().uuid().optional()
});
```

2. Add new schemas after `sendChatMessageSchema` (after line 420):
```javascript
// Session event schemas
const sessionCheckSchema = z.object({
    deviceId: z.string().uuid(),
    hostSessionId: z.string().uuid()
});

const leaveSessionSchema = z.object({
    deviceId: z.string().uuid(),
    hostSessionId: z.string().uuid()
});

const releaseSessionSchema = z.object({
    hostSessionId: z.string().uuid()
});
```

3. Add to `validateSocketEvent` schemas map (inside the function, line ~500):
```javascript
'session-check': sessionCheckSchema,
'leave-session': leaveSessionSchema,
'release-session': releaseSessionSchema,
```

4. Add to `module.exports`:
```javascript
sessionCheckSchema,
leaveSessionSchema,
releaseSessionSchema,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=validation-schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/validation-schemas.js tests/unit/validation-schemas.test.js
git commit -m "feat: add Zod schemas for session/device-token socket events"
```

---

### Task 2: Add session lifecycle methods to PlayerManagementService

**Files:**
- Modify: `services/player-management-service.js:14-20` (constructor), add new methods
- Test: `tests/unit/player-management-service.test.js`

- [ ] **Step 1: Write failing tests for session lifecycle**

Add to `tests/unit/player-management-service.test.js`:

```javascript
describe('Host Session lifecycle', () => {
    test('createOrGetSession creates a new session', () => {
        const session = playerService.createOrGetSession('host-socket-1');
        expect(session).toBeDefined();
        expect(session.hostSessionId).toBeDefined();
        expect(session.hostSocketId).toBe('host-socket-1');
        expect(session.currentGamePin).toBeNull();
        expect(session.playerRegistry).toBeInstanceOf(Map);
        expect(session.playerRegistry.size).toBe(0);
    });

    test('createOrGetSession returns existing session when hostSessionId provided', () => {
        const session1 = playerService.createOrGetSession('host-socket-1');
        // Host reconnects with new socket but passes back hostSessionId
        const session2 = playerService.createOrGetSession('host-socket-2', session1.hostSessionId);
        expect(session2).toBe(session1);
        expect(session2.hostSocketId).toBe('host-socket-2'); // Updated to new socket
    });

    test('createOrGetSession returns existing session for same host socket', () => {
        const session1 = playerService.createOrGetSession('host-socket-1');
        const session2 = playerService.createOrGetSession('host-socket-1');
        expect(session2).toBe(session1);
    });

    test('registerDevice adds device to session playerRegistry', () => {
        const session = playerService.createOrGetSession('host-socket-1');
        playerService.registerDevice(session.hostSessionId, 'device-1', 'Alice', 'sock-1');
        expect(session.playerRegistry.get('device-1')).toEqual({ name: 'Alice', socketId: 'sock-1' });
        expect(playerService.deviceToSession.get('device-1')).toBe(session.hostSessionId);
    });

    test('unregisterDevice removes device from session and reverse map', () => {
        const session = playerService.createOrGetSession('host-socket-1');
        playerService.registerDevice(session.hostSessionId, 'device-1', 'Alice', 'sock-1');
        playerService.unregisterDevice('device-1');
        expect(session.playerRegistry.has('device-1')).toBe(false);
        expect(playerService.deviceToSession.has('device-1')).toBe(false);
    });

    test('destroySession cleans up all devices from deviceToSession', () => {
        const session = playerService.createOrGetSession('host-socket-1');
        playerService.registerDevice(session.hostSessionId, 'device-1', 'Alice', null);
        playerService.registerDevice(session.hostSessionId, 'device-2', 'Bob', null);
        playerService.destroySession(session.hostSessionId);
        expect(playerService.hostSessions.has(session.hostSessionId)).toBe(false);
        expect(playerService.deviceToSession.has('device-1')).toBe(false);
        expect(playerService.deviceToSession.has('device-2')).toBe(false);
    });

    test('getSessionByHostSocket finds session by host socket ID', () => {
        const session = playerService.createOrGetSession('host-socket-1');
        expect(playerService.getSessionByHostSocket('host-socket-1')).toBe(session);
        expect(playerService.getSessionByHostSocket('nonexistent')).toBeUndefined();
    });

    test('getDisconnectedCount returns count of null-socketId entries', () => {
        const session = playerService.createOrGetSession('host-socket-1');
        playerService.registerDevice(session.hostSessionId, 'device-1', 'Alice', 'sock-1');
        playerService.registerDevice(session.hostSessionId, 'device-2', 'Bob', null);
        playerService.registerDevice(session.hostSessionId, 'device-3', 'Charlie', null);
        expect(playerService.getDisconnectedCount(session.hostSessionId)).toBe(2);
    });

    test('registerDevice to different session removes from old session first', () => {
        const session1 = playerService.createOrGetSession('host-1');
        const session2 = playerService.createOrGetSession('host-2');
        playerService.registerDevice(session1.hostSessionId, 'device-1', 'Alice', 'sock-1');
        // Now register same device to session2
        playerService.registerDevice(session2.hostSessionId, 'device-1', 'Alice', 'sock-1');
        expect(session1.playerRegistry.has('device-1')).toBe(false);
        expect(session2.playerRegistry.get('device-1')).toEqual({ name: 'Alice', socketId: 'sock-1' });
        expect(playerService.deviceToSession.get('device-1')).toBe(session2.hostSessionId);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=player-management-service`
Expected: FAIL — `createOrGetSession`, `registerDevice`, etc. not defined

- [ ] **Step 3: Implement session lifecycle methods**

In `services/player-management-service.js`:

1. Update constructor (line 14-20):
```javascript
constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    this.players = new Map();
    this.disconnectTimers = new Map();
    // Host session management
    this.hostSessions = new Map();       // hostSessionId -> session object
    this.deviceToSession = new Map();    // deviceId -> hostSessionId
    this.sessionGraceTimers = new Map(); // hostSessionId -> timerId
}
```

2. Add methods before `getPlayer()` (before line 718):
```javascript
/**
 * Create or retrieve an existing host session.
 * If hostSessionId is provided (host reconnected/refreshed), looks up by ID first.
 * Otherwise falls back to socket ID lookup, then creates new.
 * @param {string} hostSocketId - Host's current socket ID
 * @param {string|null} hostSessionId - Optional existing session ID from client storage
 * @returns {Object} The host session object
 */
createOrGetSession(hostSocketId, hostSessionId = null) {
    // Try by hostSessionId first (handles reconnect/refresh with new socket)
    if (hostSessionId) {
        const existing = this.hostSessions.get(hostSessionId);
        if (existing) {
            existing.hostSocketId = hostSocketId; // Update to new socket
            return existing;
        }
    }

    // Try by current socket ID
    const bySocket = this.getSessionByHostSocket(hostSocketId);
    if (bySocket) return bySocket;

    // Create new session
    const newId = crypto.randomUUID();
    const session = {
        hostSessionId: newId,
        hostSocketId,
        currentGamePin: null,
        playerRegistry: new Map()
    };
    this.hostSessions.set(newId, session);
    this.logger.info(`Created host session ${newId} for host ${hostSocketId}`);
    return session;
}

/**
 * Find a host session by the host's socket ID.
 * @param {string} hostSocketId
 * @returns {Object|undefined}
 */
getSessionByHostSocket(hostSocketId) {
    for (const session of this.hostSessions.values()) {
        if (session.hostSocketId === hostSocketId) return session;
    }
    return undefined;
}

/**
 * Register a device in a host session's playerRegistry.
 * If the device is already in a different session, removes it from the old one first.
 * @param {string} hostSessionId
 * @param {string} deviceId
 * @param {string} name - Player name
 * @param {string|null} socketId - Current socket ID (null if disconnected)
 */
registerDevice(hostSessionId, deviceId, name, socketId) {
    // Remove from old session if switching hosts
    const oldSessionId = this.deviceToSession.get(deviceId);
    if (oldSessionId && oldSessionId !== hostSessionId) {
        const oldSession = this.hostSessions.get(oldSessionId);
        if (oldSession) {
            oldSession.playerRegistry.delete(deviceId);
            this.logger.debug(`Removed device ${deviceId} from old session ${oldSessionId}`);
        }
    }

    const session = this.hostSessions.get(hostSessionId);
    if (!session) return;

    session.playerRegistry.set(deviceId, { name, socketId });
    this.deviceToSession.set(deviceId, hostSessionId);
}

/**
 * Remove a device from its session's playerRegistry and the reverse lookup.
 * @param {string} deviceId
 */
unregisterDevice(deviceId) {
    const hostSessionId = this.deviceToSession.get(deviceId);
    if (hostSessionId) {
        const session = this.hostSessions.get(hostSessionId);
        if (session) {
            session.playerRegistry.delete(deviceId);
        }
        this.deviceToSession.delete(deviceId);
    }
}

/**
 * Destroy a host session and clean up all device references.
 * @param {string} hostSessionId
 */
destroySession(hostSessionId) {
    const session = this.hostSessions.get(hostSessionId);
    if (!session) return;

    // Clean up reverse lookup for all devices in this session
    for (const deviceId of session.playerRegistry.keys()) {
        this.deviceToSession.delete(deviceId);
    }

    // Clear any grace timer
    const timerId = this.sessionGraceTimers.get(hostSessionId);
    if (timerId) {
        clearTimeout(timerId);
        this.sessionGraceTimers.delete(hostSessionId);
    }

    this.hostSessions.delete(hostSessionId);
    this.logger.info(`Destroyed host session ${hostSessionId}`);
}

/**
 * Get count of disconnected (expected but not connected) players in a session.
 * @param {string} hostSessionId
 * @returns {number}
 */
getDisconnectedCount(hostSessionId) {
    const session = this.hostSessions.get(hostSessionId);
    if (!session) return 0;
    let count = 0;
    for (const entry of session.playerRegistry.values()) {
        if (entry.socketId === null) count++;
    }
    return count;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=player-management-service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/player-management-service.js tests/unit/player-management-service.test.js
git commit -m "feat: add host session lifecycle methods to PlayerManagementService"
```

---

### Task 3: Integrate session into handlePlayerJoin and disconnect

**Files:**
- Modify: `services/player-management-service.js:32-186` (handlePlayerJoin), `services/player-management-service.js:194-264` (handlePlayerDisconnect), `services/player-management-service.js:272-302` (_finalizePlayerRemoval)
- Test: `tests/unit/player-management-service.test.js`

- [ ] **Step 1: Write failing tests for session integration in join/disconnect**

Add to `tests/unit/player-management-service.test.js`:

```javascript
describe('handlePlayerJoin with deviceId', () => {
    test('stores deviceId on game player object', () => {
        const socket = createMockSocket();
        const io = createMockIO();
        const game = createMockGame();

        // Create a session for this host
        const session = playerService.createOrGetSession(game.hostId);
        session.currentGamePin = game.pin;

        playerService.handlePlayerJoin(socket.id, '123456', 'Alice', game, socket, io, 'device-abc');

        const player = game.players.get(socket.id);
        expect(player.deviceId).toBe('device-abc');
    });

    test('registers device in host session when deviceId provided', () => {
        const socket = createMockSocket();
        const io = createMockIO();
        const game = createMockGame();

        const session = playerService.createOrGetSession(game.hostId);
        session.currentGamePin = game.pin;

        playerService.handlePlayerJoin(socket.id, '123456', 'Alice', game, socket, io, 'device-abc');

        expect(session.playerRegistry.get('device-abc')).toEqual({ name: 'Alice', socketId: socket.id });
    });

    test('includes hostSessionId in player-joined emit', () => {
        const socket = createMockSocket();
        const io = createMockIO();
        const game = createMockGame();

        const session = playerService.createOrGetSession(game.hostId);
        session.currentGamePin = game.pin;

        playerService.handlePlayerJoin(socket.id, '123456', 'Alice', game, socket, io, 'device-abc');

        expect(socket.emit).toHaveBeenCalledWith('player-joined', expect.objectContaining({
            hostSessionId: session.hostSessionId
        }));
    });

    test('works without deviceId (backward compatible)', () => {
        const socket = createMockSocket();
        const io = createMockIO();
        const game = createMockGame();

        const result = playerService.handlePlayerJoin(socket.id, '123456', 'Alice', game, socket, io);
        expect(result.success).toBe(true);
    });
});

describe('handlePlayerDisconnect with session', () => {
    test('sets playerRegistry socketId to null on disconnect', () => {
        const socket = createMockSocket();
        const io = createMockIO();
        const game = createMockGame('question');

        const session = playerService.createOrGetSession(game.hostId);
        session.currentGamePin = game.pin;

        playerService.handlePlayerJoin(socket.id, '123456', 'Alice', game, socket, io, 'device-abc');

        // Set sessionToken on the game player (normally set in handlePlayerJoin)
        const player = game.players.get(socket.id);
        player.sessionToken = 'token-123';

        playerService.handlePlayerDisconnect(socket.id, game, io, false);

        expect(session.playerRegistry.get('device-abc').socketId).toBeNull();
    });
});

describe('_finalizePlayerRemoval with session', () => {
    test('keeps deviceId in session playerRegistry after grace period removal', () => {
        const socket = createMockSocket();
        const io = createMockIO();
        const game = createMockGame('question');
        game.removedPlayers = [];

        const session = playerService.createOrGetSession(game.hostId);
        session.currentGamePin = game.pin;

        playerService.handlePlayerJoin(socket.id, '123456', 'Alice', game, socket, io, 'device-abc');

        const player = game.players.get(socket.id);
        player.sessionToken = 'token-123';
        player.disconnected = true;
        player.disconnectedAt = Date.now();
        player.deviceId = 'device-abc';

        playerService._finalizePlayerRemoval('token-123', game, io);

        // Player removed from game, but device stays in session
        expect(game.players.has(socket.id)).toBe(false);
        expect(session.playerRegistry.has('device-abc')).toBe(true);
        expect(session.playerRegistry.get('device-abc').socketId).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=player-management-service`
Expected: FAIL

- [ ] **Step 3: Modify handlePlayerJoin to accept and store deviceId**

In `services/player-management-service.js`, update `handlePlayerJoin` signature (line 32):

```javascript
handlePlayerJoin(socketId, pin, name, game, socket, io, deviceId = null) {
```

After `player.sessionToken = sessionToken;` (after line 92), add:

```javascript
if (deviceId) {
    player.deviceId = deviceId;
}
```

After `this.players.set(socketId, { gamePin: pin, name });` (after line 95), add:

```javascript
// Register device in host session if deviceId provided
if (deviceId) {
    const session = this.getSessionByHostSocket(game.hostId);
    if (session) {
        this.registerDevice(session.hostSessionId, deviceId, name, socketId);
    }
}

// Find hostSessionId for response
const session = this.getSessionByHostSocket(game.hostId);
const hostSessionId = session ? session.hostSessionId : null;
```

Update the `socket.emit('player-joined', ...)` call (line 104-109) to include `hostSessionId`:

```javascript
socket.emit('player-joined', {
    gamePin: pin,
    playerName: name,
    players: currentPlayers,
    sessionToken,
    hostSessionId
});
```

- [ ] **Step 4: Modify handlePlayerDisconnect to update playerRegistry.socketId**

In `handlePlayerDisconnect`, after `gamePlayer.disconnected = true;` (after line 203), add:

```javascript
// Update session playerRegistry: mark device as disconnected
if (gamePlayer.deviceId) {
    const sessionId = this.deviceToSession.get(gamePlayer.deviceId);
    if (sessionId) {
        const session = this.hostSessions.get(sessionId);
        if (session) {
            const entry = session.playerRegistry.get(gamePlayer.deviceId);
            if (entry) entry.socketId = null;
        }
    }
}
```

- [ ] **Step 5: Modify _finalizePlayerRemoval to keep device in session**

In `_finalizePlayerRemoval`, after the `game.removedPlayers.push(...)` block (after line 288), add:

```javascript
// Keep device in session for future game rejoins (don't unregisterDevice)
if (player.deviceId) {
    const sessionId = this.deviceToSession.get(player.deviceId);
    if (sessionId) {
        const session = this.hostSessions.get(sessionId);
        if (session) {
            const entry = session.playerRegistry.get(player.deviceId);
            if (entry) entry.socketId = null;
        }
    }
}
```

- [ ] **Step 6: Update migratePlayersToGame to include hostSessionId in player-joined emit**

In `migratePlayersToGame` (line ~688-693), the `player-joined` emit must include `hostSessionId`. After `newPlayer.sessionToken = sessionToken;` add:

```javascript
// Preserve deviceId from old player
if (player.deviceId) {
    newPlayer.deviceId = player.deviceId;
}
```

Update the emit:

```javascript
// Find hostSessionId for the new game
const session = this.getSessionByHostSocket(newGame.hostId);
const hostSessionId = session ? session.hostSessionId : null;

socket.emit('player-joined', {
    gamePin: newGame.pin,
    playerName: player.name,
    players: newPlayers,
    sessionToken,
    hostSessionId
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=player-management-service`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add services/player-management-service.js tests/unit/player-management-service.test.js
git commit -m "feat: integrate session tracking into player join/disconnect/removal"
```

---

### Task 4: Add session socket event handlers (server)

**Files:**
- Modify: `socket/player-events.js` — add `session-check`, `leave-session`, `release-session` handlers; modify `host-rejoin` handler
- Modify: `socket/game-events.js:34-67` — hook session creation into `host-join`, emit `session-game-started` after migration

- [ ] **Step 1: Add session-check, leave-session, release-session handlers to player-events.js**

In `socket/player-events.js`, after the `host-rejoin` handler (after line 163), add:

```javascript
// Handle session check from returning device
socket.on('session-check', (data) => {
    if (!checkRateLimit(socket.id, 'session-check', 3, socket)) return;
    try {
        const validated = validateAndHandle(socket, 'session-check', data, logger);
        if (!validated) return;

        const { deviceId, hostSessionId } = validated;
        const session = playerManagementService.hostSessions.get(hostSessionId);

        if (!session || !session.playerRegistry.has(deviceId)) {
            socket.emit('session-invalid');
            return;
        }

        const entry = session.playerRegistry.get(deviceId);
        entry.socketId = socket.id;

        if (session.currentGamePin) {
            // Active game exists — auto-join the player
            const game = gameSessionService.getGame(session.currentGamePin);
            if (game && (game.gameState === 'lobby' || game.gameState === 'revealing' || game.gameState === 'question')) {
                const result = playerManagementService.handlePlayerJoin(
                    socket.id, session.currentGamePin, entry.name, game, socket, io, deviceId
                );
                if (!result.success) {
                    // Join failed (e.g., duplicate name) — put in waiting room
                    socket.join(`session:${hostSessionId}`);
                    socket.emit('session-waiting', { hostSessionId });
                }
            } else {
                // Game exists but not joinable — wait
                socket.join(`session:${hostSessionId}`);
                socket.emit('session-waiting', { hostSessionId });
            }
        } else {
            // No active game — waiting room
            socket.join(`session:${hostSessionId}`);
            socket.emit('session-waiting', { hostSessionId });
        }
    } catch (error) {
        logger.error('Error in session-check handler:', error);
        socket.emit('session-invalid');
    }
});

// Handle player leaving session voluntarily
socket.on('leave-session', (data) => {
    if (!checkRateLimit(socket.id, 'leave-session', 5, socket)) return;
    try {
        const validated = validateAndHandle(socket, 'leave-session', data, logger);
        if (!validated) return;

        const { deviceId, hostSessionId } = validated;
        playerManagementService.unregisterDevice(deviceId);
        socket.leave(`session:${hostSessionId}`);
        logger.info(`Device ${deviceId} left session ${hostSessionId}`);
    } catch (error) {
        logger.error('Error in leave-session handler:', error);
    }
});

// Handle host releasing all session players
socket.on('release-session', (data) => {
    if (!checkRateLimit(socket.id, 'release-session', 3, socket)) return;
    try {
        const validated = validateAndHandle(socket, 'release-session', data, logger);
        if (!validated) return;

        const { hostSessionId } = validated;
        const session = playerManagementService.hostSessions.get(hostSessionId);

        if (!session || session.hostSocketId !== socket.id) {
            socket.emit('error', { message: 'Not authorized to release this session' });
            return;
        }

        // Make all sockets leave the session room before destroying
        const roomName = `session:${hostSessionId}`;
        const socketsInRoom = io.sockets.adapter.rooms.get(roomName);
        if (socketsInRoom) {
            for (const sid of socketsInRoom) {
                const s = io.sockets.sockets.get(sid);
                if (s) {
                    s.emit('session-released');
                    s.leave(roomName);
                }
            }
        }

        // Destroy session (cleans up playerRegistry and deviceToSession)
        playerManagementService.destroySession(hostSessionId);

        logger.info(`Host released all players from session ${hostSessionId}`);
    } catch (error) {
        logger.error('Error in release-session handler:', error);
    }
});
```

- [ ] **Step 2: Modify host-rejoin to update session hostSocketId**

In the `host-rejoin` handler (line 132-138 area), after `gameSessionService.updateHostId(oldHostId, socket.id, game.pin);` add:

```javascript
// Update host session socket ID
const session = playerManagementService.getSessionByHostSocket(oldHostId);
if (session) {
    session.hostSocketId = socket.id;
}
```

- [ ] **Step 3: Modify disconnect handler for session-aware lobby disconnect**

In the `disconnect` handler (line 225-229), replace the lobby immediate cleanup:

```javascript
} else {
    // In lobby: check if session has captured players
    const session = playerManagementService.getSessionByHostSocket(socket.id);
    if (session && session.playerRegistry.size > 0) {
        // Session has players — start grace timer instead of immediate cleanup
        session.currentGamePin = null;
        const sessionId = session.hostSessionId;
        const timerId = setTimeout(() => {
            playerManagementService.sessionGraceTimers.delete(sessionId);
            // Notify waiting players and destroy session
            const roomName = `session:${sessionId}`;
            const socketsInRoom = io.sockets.adapter.rooms.get(roomName);
            if (socketsInRoom) {
                for (const sid of socketsInRoom) {
                    const s = io.sockets.sockets.get(sid);
                    if (s) {
                        s.emit('session-released');
                        s.leave(roomName);
                    }
                }
            }
            playerManagementService.destroySession(sessionId);
            logger.info(`Session ${sessionId} destroyed after lobby disconnect grace period`);
        }, 2 * 60 * 1000);
        playerManagementService.sessionGraceTimers.set(sessionId, timerId);
    }

    // Still clean up the game immediately (lobby has no game state to preserve)
    playerManagementService.handleHostDisconnect(hostedGame, io);
    gameSessionService.deleteGame(hostedGame.pin);
}
```

Note: The grace timer is cancelled in `game-events.js` `host-join` handler when `createOrGetSession` is called with the `hostSessionId` from client storage. The `hostSessionId` lookup (not socket ID lookup) ensures the existing session is found even after the host's socket ID changed.

- [ ] **Step 4: Hook session creation into game-events.js host-join**

In `socket/game-events.js`:

**Add `hostSessionId` to `hostJoinSchema`** in `services/validation-schemas.js` (inside the `hostJoinSchema` object):

```javascript
hostSessionId: z.string().uuid().optional()  // Passed back by host client for session continuity
```

After `const game = gameSessionService.createGame(socket.id, quiz);` (after line 34), add:

```javascript
// Create or reuse host session (pass hostSessionId from client storage for reconnect continuity)
const session = playerManagementService.createOrGetSession(socket.id, validated.hostSessionId || null);
session.currentGamePin = game.pin;

// Cancel any session grace timer (host returned and created new game)
const graceTimerId = playerManagementService.sessionGraceTimers.get(session.hostSessionId);
if (graceTimerId) {
    clearTimeout(graceTimerId);
    playerManagementService.sessionGraceTimers.delete(session.hostSessionId);
}
```

After the entire migration block (after line 67), add a single session-room auto-join block. This handles both post-migration and no-migration cases. **Server-side auto-join — no client roundtrip:**

```javascript
// Auto-join waiting players from session room into the new game
const sessionRoom = `session:${session.hostSessionId}`;
const waitingSockets = io.sockets.adapter.rooms.get(sessionRoom);
if (waitingSockets) {
    for (const sid of [...waitingSockets]) {  // Copy set — iteration modifies it
        const waitingSocket = io.sockets.sockets.get(sid);
        if (!waitingSocket) continue;

        // Find device entry for this socket
        let deviceId = null;
        let playerName = null;
        for (const [did, entry] of session.playerRegistry) {
            if (entry.socketId === sid) {
                deviceId = did;
                playerName = entry.name;
                break;
            }
        }
        if (!deviceId || !playerName) continue;

        waitingSocket.leave(sessionRoom);
        playerManagementService.handlePlayerJoin(
            sid, game.pin, playerName, game, waitingSocket, io, deviceId
        );
    }
}
```

Include `hostSessionId` in `game-created` emit (line 37-41):

```javascript
socket.emit('game-created', {
    pin: game.pin,
    gameId: game.id,
    title: quiz.title,
    hostSessionId: session.hostSessionId
});
```

- [ ] **Step 5: Update player-join handler to pass deviceId**

In `socket/player-events.js`, update the `player-join` handler (line 17-27):

```javascript
const { pin, name, deviceId } = validated;
const game = gameSessionService.getGame(pin);

const result = playerManagementService.handlePlayerJoin(
    socket.id, pin, name, game, socket, io, deviceId
);
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS (existing tests unaffected, new behavior only triggers with deviceId)

- [ ] **Step 7: Commit**

```bash
git add socket/player-events.js socket/game-events.js
git commit -m "feat: add session socket event handlers and host-join session hook"
```

---

### Task 5: Client-side device token and session binding

**Files:**
- Modify: `public/js/socket/socket-manager.js` — add constants, deviceId generation, session-check on load, new event handlers

- [ ] **Step 1: Add constants and deviceId generation**

At the top of `socket-manager.js`, after `const RECONNECT_KEY = 'quizix_reconnect';` (line 12):

```javascript
const DEVICE_ID_KEY = 'quizix_device_id';
const SESSION_BINDING_KEY = 'quizix_session_binding';

/**
 * Get or create a persistent device ID.
 * @returns {string} UUID device identifier
 */
function getOrCreateDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}
```

- [ ] **Step 2: Send deviceId with player-join**

In `joinGame` method (line ~846-848), update:

```javascript
joinGame(pin, playerName) {
    logger.debug('Joining game:', { pin, playerName });
    const deviceId = getOrCreateDeviceId();
    this.socket.emit('player-join', { pin, name: playerName, deviceId });
}
```

- [ ] **Step 3: Store session binding on player-joined**

In the `player-joined` handler (find it in `initializeSocketListeners`), after the existing `sessionStorage.setItem(RECONNECT_KEY, ...)`, add:

```javascript
// Store session binding in localStorage for cross-session recognition
if (data.hostSessionId) {
    try {
        localStorage.setItem(SESSION_BINDING_KEY, JSON.stringify({
            deviceId: getOrCreateDeviceId(),
            hostSessionId: data.hostSessionId
        }));
    } catch (e) {
        logger.warn('Failed to store session binding:', e);
    }
}
```

- [ ] **Step 4: Add session-check on fresh page load**

Add a new method to the `SocketManager` class:

```javascript
/**
 * Check for existing session binding on fresh page load.
 * Only fires if there's no valid sessionToken (which takes priority).
 */
_checkSessionBinding() {
    // sessionToken reconnect takes priority
    const reconnectData = this._getValidReconnectData();
    if (reconnectData) return; // Will be handled by existing reconnect flow

    try {
        const bindingStr = localStorage.getItem(SESSION_BINDING_KEY);
        if (!bindingStr) return;

        const binding = JSON.parse(bindingStr);
        if (!binding?.deviceId || !binding?.hostSessionId) {
            localStorage.removeItem(SESSION_BINDING_KEY);
            return;
        }

        logger.debug('Found session binding, checking with server:', binding);
        this.socket.emit('session-check', {
            deviceId: binding.deviceId,
            hostSessionId: binding.hostSessionId
        });
    } catch (e) {
        logger.warn('Failed to check session binding:', e);
        localStorage.removeItem(SESSION_BINDING_KEY);
    }
}
```

Call `_checkSessionBinding()` at the end of `initializeSocketListeners()`, after the rejoin banner handlers (after line ~840). **Do NOT add a separate `connect` handler** — merge into the existing one at line 107 or call once at construction. Guard against reconnects:

```javascript
// Track whether this is a reconnect (set in disconnect handler, cleared on fresh load)
this._isReconnecting = false;
```

In the existing `disconnect` handler (~line 111), add:
```javascript
this._isReconnecting = true;
```

Update `_checkSessionBinding` to check:
```javascript
_checkSessionBinding() {
    // Never fire during socket reconnects — only fresh page loads
    if (this._isReconnecting) return;

    // sessionToken reconnect takes priority
    const reconnectData = this._getValidReconnectData();
    if (reconnectData) return;
    // ... rest unchanged
}
```

Call once at end of `initializeSocketListeners()`:
```javascript
// Check for session binding on fresh page load
if (this.socket.connected) {
    this._checkSessionBinding();
} else {
    this.socket.once('connect', () => this._checkSessionBinding());
}
```

- [ ] **Step 5: Add handlers for session events**

In `initializeSocketListeners`, add handlers for new server events:

```javascript
// Session waiting — show waiting screen
this.socket.on('session-waiting', (data) => {
    logger.info('Session waiting:', data);
    this._hideReconnectionOverlay();
    this._hideRejoinBanner();
    this.uiManager.showScreen('session-waiting-screen');
});

// Session game started — server auto-joins us, we just need to know it happened
// (The server calls handlePlayerJoin for each waiting socket, so we'll receive
// 'player-joined' next. This handler is a no-op but logged for debugging.)
this.socket.on('session-game-started', (data) => {
    logger.info('Session game started, server is auto-joining us:', data);
    // No action needed — server-side auto-join will emit 'player-joined' next
});

// Session invalid — clear binding, show main menu
this.socket.on('session-invalid', () => {
    logger.info('Session invalid, clearing binding');
    localStorage.removeItem(SESSION_BINDING_KEY);
    // Use resetAndReturnToMenu per project GOTCHAS
    if (this.gameManager.resetAndReturnToMenu) {
        this.gameManager.resetAndReturnToMenu();
    } else {
        this.uiManager.showScreen('main-menu');
    }
});

// Session released by host — clear binding, return to main menu
this.socket.on('session-released', () => {
    logger.info('Session released by host');
    localStorage.removeItem(SESSION_BINDING_KEY);
    if (this.gameManager.resetAndReturnToMenu) {
        this.gameManager.resetAndReturnToMenu();
    } else {
        this.gameManager.stopTimer();
        this.gameManager.resetGameState();
        this.uiManager.showScreen('main-menu');
    }
    if (window.toastNotifications) {
        window.toastNotifications.show('Host ended the session', 'info', 3000);
    }
});
```

- [ ] **Step 6: Add leaveSession method**

```javascript
/**
 * Leave the current session voluntarily.
 */
leaveSession() {
    try {
        const bindingStr = localStorage.getItem(SESSION_BINDING_KEY);
        if (!bindingStr) return;
        const binding = JSON.parse(bindingStr);
        this.socket.emit('leave-session', {
            deviceId: binding.deviceId,
            hostSessionId: binding.hostSessionId
        });
        localStorage.removeItem(SESSION_BINDING_KEY);
        this.uiManager.showScreen('main-menu');
    } catch (e) {
        logger.warn('Failed to leave session:', e);
        localStorage.removeItem(SESSION_BINDING_KEY);
        this.uiManager.showScreen('main-menu');
    }
}
```

- [ ] **Step 7: Clear session binding on intentional leave-game**

In the existing `leave-game` flow (find where `leave-game` is emitted), also clear the session binding:

```javascript
localStorage.removeItem(SESSION_BINDING_KEY);
```

- [ ] **Step 8: Commit**

```bash
git add public/js/socket/socket-manager.js
git commit -m "feat: client-side device token, session binding, and session event handlers"
```

---

### Task 6: Waiting screen UI and host release button

**Files:**
- Modify: `public/index.html` — add waiting screen markup
- Modify: `public/js/ui/ui-manager.js` — register new screen
- Modify: Host lobby area in `public/index.html` — add "Release All Players" button and expected count indicator

- [ ] **Step 1: Add waiting screen HTML**

In `public/index.html`, add a new screen element alongside the other `.screen` elements:

```html
<!-- Session Waiting Screen -->
<div id="session-waiting-screen" class="screen hidden">
    <div class="waiting-container" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; text-align:center; padding:20px;">
        <div class="spinner" style="width:48px; height:48px; border:4px solid rgba(255,255,255,0.2); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite; margin-bottom:24px;"></div>
        <h2 data-i18n="session_waiting_title" style="margin-bottom:8px;">Waiting for the next game...</h2>
        <p data-i18n="session_waiting_subtitle" style="opacity:0.7; margin-bottom:32px;">The host will start a new game soon.</p>
        <button id="leave-session-btn" class="btn btn-secondary" data-i18n="leave_session">Leave Session</button>
    </div>
</div>
```

- [ ] **Step 2: Add release button and expected count to host lobby**

In the host lobby area of `public/index.html`, find the player list section and add:

```html
<div id="session-expected-count" class="hidden" style="font-size:0.85em; opacity:0.7; margin-top:8px;">
    <span id="expected-player-count">0</span> <span data-i18n="players_expected">players expected</span>
</div>
<button id="release-session-btn" class="btn btn-secondary btn-sm hidden" data-i18n="release_players" style="margin-top:8px;">Release All Players</button>
```

- [ ] **Step 3: Wire up leave-session button**

In `socket-manager.js`, in `initializeSocketListeners` (in the button handler section near line ~818), add:

```javascript
const leaveSessionBtn = this._getElement('leave-session-btn');
if (leaveSessionBtn) {
    leaveSessionBtn.addEventListener('click', () => this.leaveSession(), { signal });
}
```

- [ ] **Step 4: Wire up release-session button**

In `socket-manager.js`, add handler for the host's release button. In the host-side event initialization area:

```javascript
const releaseSessionBtn = this._getElement('release-session-btn');
if (releaseSessionBtn) {
    releaseSessionBtn.addEventListener('click', () => {
        try {
            const hostSessionId = localStorage.getItem('quizix_host_session_id');
            if (hostSessionId) {
                this.socket.emit('release-session', { hostSessionId });
                releaseSessionBtn.classList.add('hidden');
                const countEl = this._getElement('session-expected-count');
                if (countEl) countEl.classList.add('hidden');
            }
        } catch (e) {
            logger.warn('Failed to release session:', e);
        }
    }, { signal });
}
```

- [ ] **Step 5: Store hostSessionId on game-created (host side)**

In the `game-created` handler in `socket-manager.js`, add:

```javascript
if (data.hostSessionId) {
    localStorage.setItem('quizix_host_session_id', data.hostSessionId);
}
```

Note: Uses `localStorage` (not `sessionStorage`) so the `hostSessionId` survives tab refresh. This is needed so the host can pass it back via `host-join` after a refresh, allowing `createOrGetSession` to find the existing session.

- [ ] **Step 6: Pass hostSessionId in host-join emit**

Find where the client emits `host-join` (in the game creation flow). Add `hostSessionId` to the payload:

```javascript
const hostSessionId = localStorage.getItem('quizix_host_session_id');
// Include hostSessionId in the host-join emit payload alongside quiz, previousPin, migrationToken
// e.g.: this.socket.emit('host-join', { quiz, previousPin, migrationToken, hostSessionId });
```

This allows `createOrGetSession` on the server to find the existing session after a host refresh/reconnect.

- [ ] **Step 7: Show/hide release button and expected count in lobby**

When the host enters the lobby, check if there are expected players. Add to the `player-list-update` handler or lobby setup:

```javascript
// Update session expected count in lobby
const session = localStorage.getItem('quizix_host_session_id');
if (session) {
    // Request expected count from server (or compute from player-list-update data)
    // For now, show the button if we have a session
    const releaseBtn = this._getElement('release-session-btn');
    if (releaseBtn) releaseBtn.classList.remove('hidden');
}
```

The server should include `expectedPlayerCount` in `player-list-update` events when in lobby. Add to `_getPlayerListForBroadcast` in `player-management-service.js` — or emit a separate `session-expected-count` event when a player connects/disconnects from the session room.

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/js/socket/socket-manager.js public/js/ui/ui-manager.js
git commit -m "feat: add waiting screen UI and host release button"
```

---

### Task 7: CSS build and service worker bump

**Files:**
- Run: `npm run build`
- Modify: `public/sw.js` — bump `CACHE_VERSION`

- [ ] **Step 1: Build CSS**

Run: `npm run build`
Expected: CSS bundle rebuilt successfully

- [ ] **Step 2: Bump CACHE_VERSION**

In `public/sw.js`, find `CACHE_VERSION` and increment it by 1.

- [ ] **Step 3: Commit**

```bash
git add public/sw.js public/css/
git commit -m "chore: rebuild CSS bundle and bump service worker cache version"
```

---

### Task 8: Integration testing and edge case verification

**Files:**
- Test: `tests/unit/player-management-service.test.js` — add edge case tests

- [ ] **Step 1: Write edge case tests**

```javascript
describe('Session edge cases', () => {
    test('device switching hosts clears old session binding', () => {
        const host1Session = playerService.createOrGetSession('host-1');
        const host2Session = playerService.createOrGetSession('host-2');

        playerService.registerDevice(host1Session.hostSessionId, 'device-1', 'Alice', 'sock-1');
        playerService.registerDevice(host2Session.hostSessionId, 'device-1', 'Alice', 'sock-1');

        expect(host1Session.playerRegistry.has('device-1')).toBe(false);
        expect(host2Session.playerRegistry.has('device-1')).toBe(true);
    });

    test('session destruction notifies cleanup invariant', () => {
        const session = playerService.createOrGetSession('host-1');
        playerService.registerDevice(session.hostSessionId, 'd1', 'Alice', null);
        playerService.registerDevice(session.hostSessionId, 'd2', 'Bob', null);
        playerService.registerDevice(session.hostSessionId, 'd3', 'Charlie', null);

        playerService.destroySession(session.hostSessionId);

        expect(playerService.deviceToSession.size).toBe(0);
        expect(playerService.hostSessions.size).toBe(0);
    });

    test('lobby disconnect with session grace timer', () => {
        const session = playerService.createOrGetSession('host-1');
        playerService.registerDevice(session.hostSessionId, 'd1', 'Alice', null);

        // Simulate setting a grace timer
        const timerId = setTimeout(() => {}, 120000);
        playerService.sessionGraceTimers.set(session.hostSessionId, timerId);

        // Creating a new game should cancel the timer
        playerService.createOrGetSession('host-1-new');
        // Timer cleanup happens in game-events.js, tested there

        clearTimeout(timerId);
    });

    test('getDisconnectedCount with mixed connected/disconnected', () => {
        const session = playerService.createOrGetSession('host-1');
        playerService.registerDevice(session.hostSessionId, 'd1', 'Alice', 'sock-1');
        playerService.registerDevice(session.hostSessionId, 'd2', 'Bob', null);
        playerService.registerDevice(session.hostSessionId, 'd3', 'Charlie', 'sock-3');
        playerService.registerDevice(session.hostSessionId, 'd4', 'Dave', null);

        expect(playerService.getDisconnectedCount(session.hostSessionId)).toBe(2);
    });
});
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/player-management-service.test.js
git commit -m "test: add edge case tests for session device token system"
```

---

### Task 9: Manual smoke test

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test happy path**

1. Open host tab → create game
2. Open player tab → join with name → verify `localStorage` has `quizix_device_id` and `quizix_session_binding`
3. Close player tab
4. Re-open player tab → should auto-join or show waiting screen (not the join form)

- [ ] **Step 3: Test waiting screen**

1. Host finishes game, does NOT start a new one
2. Player opens new tab → should see "Waiting for the next game..."
3. Host creates new game → player should auto-join lobby

- [ ] **Step 4: Test release**

1. Host clicks "Release All Players"
2. Waiting players should return to main menu
3. `localStorage` session binding should be cleared

- [ ] **Step 5: Test leave session**

1. Player on waiting screen clicks "Leave Session"
2. Should return to main menu
3. Opening a new tab should show normal join screen (no auto-join)
