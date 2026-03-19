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

A `deviceId` (UUID v4) is generated on first visit and stored in `localStorage` under key `quizix_device_id`. Persists across tabs, sessions, and browser restarts.

Sent with every `player-join` event. Has no meaning on its own — only becomes relevant once a host session binds it to a player name.

**Separate from `sessionToken`:** The existing `sessionToken` (in `sessionStorage`) continues to handle quick same-tab reconnects. The `deviceId` is a longer-lived identity layer on top.

### 2. Host Session (Server-side)

New `hostSessions` Map added to `PlayerManagementService`:

```
hostSessions: Map<hostSessionId, {
  hostSessionId: string,        // UUID, generated once
  hostSocketId: string,         // current host socket ID (updated on reconnect)
  playerRegistry: Map<deviceId, {
    name: string,
    lastGamePin: string
  }>
}>
```

**Lifecycle:**

- **Created** automatically when a host creates their first game. No extra UI step.
- **Persists** across games by the same host.
- **Survives** host tab refresh — host reconnect updates `hostSocketId`. The `hostSessionId` is stored in the host's `sessionStorage`.
- **Destroyed** when:
  1. Host clicks "Release All Players" (explicit action).
  2. Host's last game's pending-migration timer expires (2 min) and the host never reconnects — all waiting players notified and returned to main menu.

### 3. Player Join Flow

#### New player (no session binding)

Exactly like today: enter name, enter PIN, join. Server registers their `deviceId` in the host session's `playerRegistry`.

#### Returning player (has session binding in localStorage)

1. Player opens app → client checks `localStorage` for `{ deviceId, hostSessionId }`.
2. Client connects socket, emits `session-check { deviceId, hostSessionId }`.
3. Server looks up session:
   - **Active game exists** → auto-join the player (no name entry), emit `player-joined` with full state.
   - **No active game, session valid** → join `session:{hostSessionId}` socket room, emit `session-waiting` → client shows waiting screen.
   - **Session invalid/expired** → emit `session-invalid` → client clears `localStorage` binding, shows normal main menu.

#### When host starts a new game

1. Server creates game, looks up host's session in `hostSessions`.
2. Connected players in the `session:{hostSessionId}` socket room receive `session-game-started { pin }` → auto-join the new game's lobby.
3. Players not yet connected will auto-join when they open the app (via `session-check`).

### 4. Waiting Screen

Shown to session-bound players when no active game exists.

- Text: "Waiting for host to start the next game..."
- "Leave Session" button at the bottom.
- Clicking "Leave Session" → emits `leave-session { deviceId, hostSessionId }` → server removes `deviceId` from `playerRegistry` → client clears `localStorage` binding → shows main menu.

### 5. Host Release

- "Release All Players" button in the lobby (near the player list area).
- Emits `release-session { hostSessionId }`.
- Server iterates all sockets in `session:{hostSessionId}` room → emits `session-released` to each → clears `playerRegistry`.
- Waiting players receive `session-released` → clear `localStorage` binding → return to main menu.
- Players currently in the lobby remain in the game — release only affects the session binding for future games.

### 6. Lobby Indicator

Small indicator in the lobby showing the count of expected-but-not-connected players. Example: "3 players expected" — counting `playerRegistry` entries whose `deviceId` is not currently connected. Same visual style as the existing in-game disconnected player indicator.

### 7. Score Handling

#### Within a game (reconnect)

- Existing `sessionToken` flow unchanged — player gets their score, answers, and current question state back.
- `deviceId` adds a fallback: if `sessionStorage` is lost (tab closed) but `localStorage` has the session binding, server finds the player by `deviceId` in the game's player list.
- Missed questions while disconnected = 0 points (no answer recorded).

#### Across games (new game by same host)

- Scores reset to 0 (fresh game).
- Player gets a new `sessionToken`.
- `deviceId` binding in the host session persists.

#### Grace period interaction

- Within a game: existing 2-minute grace period for `sessionToken`-based quick reconnects preserved.
- When grace period expires: player moved to `game.removedPlayers` as today (for leaderboard), but `deviceId` remains in the host session's `playerRegistry` for future games.
- A player who disconnects mid-game and returns 10 minutes later: they missed that game (score preserved in leaderboard), but auto-join the next one.

### 8. Edge Cases

- **Same device, different player:** Player taps "Leave Session" → binding cleared → new person joins with their own name. `deviceId` stays the same but re-registered with a new name.
- **Player joins a different host's game:** `player-join` with a PIN for a different host → old session binding replaced. One device = one session binding at a time.
- **Host multiple tabs:** Each tab has its own `sessionStorage` with `hostSessionId`, but server tracks one `hostSocketId` per session. Latest connection wins.
- **Server restart:** All sessions lost (in-memory Maps). Players and host return to fresh state. Acceptable for local-network quiz app.

### 9. Socket Events

#### New events

| Event | Direction | Payload |
|-------|-----------|---------|
| `session-check` | client → server | `{ deviceId, hostSessionId }` |
| `session-waiting` | server → client | `{ hostSessionId }` |
| `session-game-started` | server → client | `{ pin }` |
| `session-invalid` | server → client | `{}` |
| `session-released` | server → client | `{}` |
| `leave-session` | client → server | `{ deviceId, hostSessionId }` |
| `release-session` | client → server | `{ hostSessionId }` |

#### Modified existing events

| Event | Change |
|-------|--------|
| `player-join` | Add `deviceId` to payload |
| `player-joined` | Add `hostSessionId` to response |

### 10. Files to Modify

**Server:**
- `services/player-management-service.js` — add `hostSessions` Map, session lifecycle methods, modify `handlePlayerJoin` to register `deviceId`
- `socket/player-events.js` — add handlers for new socket events (`session-check`, `leave-session`, `release-session`)
- `services/game-session-service.js` — hook session lookup into game creation, trigger `session-game-started` for waiting players

**Client:**
- `public/js/network/socket-manager.js` — generate/store `deviceId` in localStorage, send on join, handle `session-check` on connect, handle new events
- `public/js/ui/screens/` — new waiting screen (or reuse existing screen with waiting state)
- `public/js/ui/screens/host-lobby-screen.js` (or equivalent) — add "Release All Players" button, show expected player count
- `public/index.html` — waiting screen markup

**No new files needed** — all changes fit within existing modules.
