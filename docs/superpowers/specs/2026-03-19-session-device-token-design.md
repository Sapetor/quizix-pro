# Device Token & Host Session Reconnection

**Date:** 2026-03-19
**Status:** Approved
**Approach:** B — Lightweight session registry on existing services

## Problem

When a player disconnects (closes browser, loses connection), they can only rejoin within a 2-minute grace period and only from the same tab (sessionStorage). Beyond that, they must re-enter their name and join as a new player, losing their identity. Across games by the same host, there is no memory of who played before.

## Goal

Players are recognized by their device across a host's entire session (multiple games). They never re-enter their name. Disconnected players auto-rejoin when they return. The host can release captured players when done.

## Design

### 1. Device Token (Client-side)

A `deviceId` (UUID v4) is generated on first visit and stored in `localStorage` under constant `DEVICE_ID_KEY = 'quizix_device_id'` (defined alongside the existing `RECONNECT_KEY`). Persists across tabs, sessions, and browser restarts.

The session binding (which host session this device belongs to) is stored in `localStorage` under constant `SESSION_BINDING_KEY = 'quizix_session_binding'` as `{ deviceId, hostSessionId }`.

Sent with every `player-join` event. Has no meaning on its own — only becomes relevant once a host session binds it to a player name.

**Separate from `sessionToken`:** The existing `sessionToken` (in `sessionStorage`) continues to handle quick same-tab reconnects. The `deviceId` is a longer-lived identity layer on top.

**Precedence on reconnect:** The existing `sessionToken` path always takes priority. `session-check` is a fallback that only fires on fresh page loads (no valid `sessionToken` in `sessionStorage`). On socket `reconnect` events, the existing `_attemptRejoin()` flow runs first; `session-check` is never emitted during a socket reconnect.

### 2. Host Session (Server-side)

New `hostSessions` Map added to `PlayerManagementService`:

```
hostSessions: Map<hostSessionId, {
  hostSessionId: string,        // UUID, generated once
  hostSocketId: string,         // current host socket ID (updated on reconnect)
  currentGamePin: string|null,  // PIN of active game, null when between games
  playerRegistry: Map<deviceId, {
    name: string,
    socketId: string|null       // current socket ID if connected, null if disconnected
  }>
}>
```

Note: `lastGamePin` removed from `playerRegistry` — it had no read path. The session tracks its active game via `currentGamePin` at the session level.

**Lifecycle:**

- **Created** automatically when a host creates their first game. No extra UI step.
- **Persists** across games by the same host. `currentGamePin` updated on each new game.
- **Survives** host tab refresh — the existing `host-rejoin` handler in `player-events.js` is modified to also update `hostSession.hostSocketId`.
- **Destroyed** when:
  1. Host clicks "Release All Players" (explicit action).
  2. The host's game transitions to `pending-migration` AND the migration timer expires (2 min) without the host creating a new game. At that point: session destroyed, all waiting players receive `session-released`.
  3. Host disconnects while in lobby AND the `playerRegistry` is empty — session destroyed silently (current immediate-cleanup behavior). If `playerRegistry` has entries, a 2-minute grace timer is started (stored in `sessionGraceTimers: Map<hostSessionId, timerId>` in `PlayerManagementService`). If the host creates a new game within 2 minutes, the timer is cancelled. Otherwise, session destroyed, waiting players receive `session-released`. On lobby disconnect, `currentGamePin` is set to `null` since the game is deleted.

**Cleanup invariant:** When a session is destroyed (any path above), all its `playerRegistry` entries are removed from `deviceToSession` before the session itself is deleted from `hostSessions`.

**Reverse lookup:** A second Map `deviceToSession: Map<deviceId, hostSessionId>` enables O(1) lookup when a player connects with a `deviceId`. Updated whenever a `deviceId` is added/removed from a session's `playerRegistry`.

### 3. Relationship with Existing Migration System

The host session system **layers on top of** the existing migration system, not replacing it.

**Connected players** (in the finished game's socket room) are migrated via the existing `migratePlayersToGame()` flow. This is unchanged — they get moved to the new game with fresh `sessionToken`s, leave the old room, join the new room.

**Disconnected/waiting players** (in the `session:{hostSessionId}` room, or not connected at all) are handled by the new session system. When the host creates a new game:

1. `migratePlayersToGame()` runs first for connected players (existing flow).
2. After migration, the server emits `session-game-started { pin }` to the `session:{hostSessionId}` room. Players in this room auto-join the new game.
3. Players not yet connected will auto-join when they open the app (via `session-check`).

The existing `host-preparing-new-game` event continues to fire for connected players. `session-game-started` only targets the session waiting room — no overlap.

### 4. Player Join Flow

#### New player (no session binding)

Exactly like today: enter name, enter PIN, join. Server registers their `deviceId` in the host session's `playerRegistry` (and updates `deviceToSession`).

#### Returning player (has session binding in localStorage)

1. Player opens app → client checks `sessionStorage` for `sessionToken` first (existing path). If valid, uses existing `_attemptRejoin()`. **Stop here.**
2. If no valid `sessionToken`: client checks `localStorage` for `{ deviceId, hostSessionId }`.
3. Client connects socket, emits `session-check { deviceId, hostSessionId }`.
4. Server looks up session and validates `deviceId` exists in its `playerRegistry`:
   - **Active game exists** → auto-join the player (no name entry), emit `player-joined` with full state. Update `playerRegistry.socketId`.
   - **No active game, session valid** → add socket to `session:{hostSessionId}` room, update `playerRegistry.socketId`, emit `session-waiting { hostSessionId }` → client shows waiting screen.
   - **Session invalid/expired/deviceId not in registry** → emit `session-invalid` → client clears `localStorage` binding, shows normal main menu.

#### When host starts a new game

1. Server creates game, looks up host's session in `hostSessions`, updates `currentGamePin`.
2. `migratePlayersToGame()` handles connected in-game players (existing flow).
3. Server emits `session-game-started { pin }` to `session:{hostSessionId}` room for waiting players.
4. Players not yet connected will auto-join when they open the app (via `session-check`).

#### Waiting player disconnect/reconnect

When a player in the waiting state (`session:{hostSessionId}` room) disconnects and reconnects, Socket.IO room membership is lost. On reconnect:
- `sessionToken` path has no game to rejoin → falls through.
- `session-check` fires → server re-adds socket to the session room, updates `playerRegistry.socketId`, re-emits `session-waiting`.

### 5. Waiting Screen

Shown to session-bound players when no active game exists.

- Text: "Waiting for host to start the next game..."
- "Leave Session" button at the bottom.
- Clicking "Leave Session" → emits `leave-session { deviceId, hostSessionId }` → server removes `deviceId` from `playerRegistry` and `deviceToSession` → client clears `localStorage` binding → shows main menu.

### 6. Host Release

- "Release All Players" button in the lobby (near the player list area).
- Emits `release-session { hostSessionId }`.
- **Server validates** that `socket.id === hostSession.hostSocketId` before proceeding. Rejects with error if mismatch.
- Server iterates all sockets in `session:{hostSessionId}` room → emits `session-released` to each → clears `playerRegistry` and `deviceToSession` entries.
- Waiting players receive `session-released` → clear `localStorage` binding → return to main menu.
- Players currently in the lobby stay in the game — release only clears the session binding for future games. Their `localStorage` binding is cleared so they won't auto-join after this game.

### 7. Lobby Indicator

Small indicator in the lobby showing the count of expected-but-not-connected players. Computed from the `playerRegistry`: count entries where `socketId` is `null` (disconnected). The `playerRegistry.socketId` field is set on connect and cleared on disconnect, making this a simple filter.

Same visual style as the existing in-game disconnected player indicator.

### 8. Score Handling

#### Within a game (reconnect)

- Existing `sessionToken` flow unchanged — player gets their score, answers, and current question state back.
- `deviceId` adds a fallback: if `sessionStorage` is lost (tab closed) but `localStorage` has the session binding, server finds the player by `deviceId` in the game's player list. To support this, `deviceId` is stored on the game-level player object (in `game.players`) alongside the existing fields when `handlePlayerJoin` is called.
- Missed questions while disconnected = 0 points (no answer recorded).

#### Across games (new game by same host)

- Scores reset to 0 (fresh game).
- Player gets a new `sessionToken`.
- `deviceId` binding in the host session persists.

#### Grace period interaction

- Within a game: existing 2-minute grace period for `sessionToken`-based quick reconnects preserved.
- When grace period expires: player moved to `game.removedPlayers` as today (for leaderboard), but `deviceId` remains in the host session's `playerRegistry` for future games. `playerRegistry.socketId` set to `null`.
- A player who disconnects mid-game and returns 10 minutes later: they missed that game (score preserved in leaderboard), but auto-join the next one.

### 9. Edge Cases

- **Same device, different player:** Player taps "Leave Session" → binding cleared → new person joins with their own name. `deviceId` stays the same but re-registered with a new name in the session.
- **Player joins a different host's game:** `player-join` with a PIN for a different host → server removes the `deviceId` from the old session's `playerRegistry` first, then registers it in the new session's `playerRegistry` and updates `deviceToSession`. One device = one session binding at a time.
- **Host multiple tabs:** Each tab has its own `sessionStorage` with `hostSessionId`, but server tracks one `hostSocketId` per session. Latest connection wins.
- **Server restart:** All sessions lost (in-memory Maps). Players and host return to fresh state. Acceptable for local-network quiz app.
- **Host disconnects in lobby with captured players:** Session persists for 2 minutes (grace period) instead of immediate cleanup, giving the host time to return. If no players in registry, immediate cleanup (current behavior).

### 10. Socket Events

#### New events

All new client→server events must have Zod schemas in `validation-schemas.js` and use `checkRateLimit`.

| Event | Direction | Payload | Validation |
|-------|-----------|---------|------------|
| `session-check` | client → server | `{ deviceId: uuid, hostSessionId: uuid }` | Rate-limited 3/sec, Zod schema |
| `session-waiting` | server → client | `{ hostSessionId: string }` | — |
| `session-game-started` | server → client | `{ pin: string }` | — |
| `session-invalid` | server → client | `{}` | — |
| `session-released` | server → client | `{}` | — |
| `leave-session` | client → server | `{ deviceId: uuid, hostSessionId: uuid }` | Rate-limited, Zod schema |
| `release-session` | client → server | `{ hostSessionId: uuid }` | Rate-limited, Zod schema, **must verify socket.id === hostSession.hostSocketId** |

#### Modified existing events

| Event | Change |
|-------|--------|
| `player-join` | Add optional `deviceId: z.string().uuid().optional()` to Zod schema and payload |
| `player-joined` | Add `hostSessionId` to response. Also fix existing schema mismatch in `validation-schemas.js` (current schema does not match actual emit) |

### 11. Files to Modify

**Server:**
- `services/player-management-service.js` — add `hostSessions` Map, `deviceToSession` Map, `sessionGraceTimers` Map, session lifecycle methods (`createOrGetSession`, `destroySession`, `registerDevice`, `unregisterDevice`), modify `handlePlayerJoin` to register `deviceId` (both in session `playerRegistry` and on the game player object), modify disconnect handler to update `playerRegistry.socketId`
- `socket/player-events.js` — add handlers for new socket events (`session-check`, `leave-session`, `release-session`), modify existing `host-rejoin` handler to update `hostSession.hostSocketId`
- `socket/game-events.js` — after `gameSessionService.createGame()`, call `playerManagementService.createOrGetSession()` to create/reuse the host session and set `currentGamePin`. Emit `session-game-started` to the session room after migration completes. (Session Maps live in `PlayerManagementService`, so the hook call belongs here, not in `game-session-service.js`.)
- `validation-schemas.js` — add Zod schemas for new events, add `deviceId` to `player-join` schema, fix `player-joined` schema mismatch

**Client:**
- `public/js/network/socket-manager.js` — add `DEVICE_ID_KEY` and `SESSION_BINDING_KEY` constants, generate/store `deviceId` in localStorage, add `session-check` on fresh page load (not on reconnect), handle new events, store `{ deviceId, hostSessionId }` in localStorage under `SESSION_BINDING_KEY` on `player-joined`
- `public/js/ui/screens/` — new waiting screen (or reuse existing screen with waiting state)
- `public/js/ui/screens/host-lobby-screen.js` (or equivalent) — add "Release All Players" button, show expected player count
- `public/index.html` — waiting screen markup

**Deployment:**
- Bump `CACHE_VERSION` in `public/sw.js` after client-side JS changes.

**No new service files needed** — all changes fit within existing modules.
