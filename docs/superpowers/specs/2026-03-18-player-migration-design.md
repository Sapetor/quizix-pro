# Player Migration to Host's New Game

## Context

When a host finishes a game and wants to start another (same or different quiz), players currently have to manually re-scan the QR code or type a new PIN. This is friction — especially on phones where QR scanning can be unreliable. The goal is to automatically move waiting players to the host's next game.

## Design

### Mechanism: Follow-PIN with Migration Token

The host stores the current game PIN in localStorage before leaving. When creating a new game, the `host-join` event includes the previous PIN **and a migration token** (UUID). The server verifies the token, finds the old game, migrates its players to the new game, and deletes the old game.

The migration token prevents unauthorized clients from claiming another host's waiting players.

### New Game State: `pending-migration`

A game enters `pending-migration` when the host has left but players should wait for the next game. This state has a 2-minute timeout before cleanup.

**On entry to `pending-migration`:**
1. Set `game.gameState = 'pending-migration'`
2. Generate `game.migrationToken` (UUID)
3. Null out `game.hostId` and remove from `hostIdToPin` map — prevents `findGameByHost()` and `cleanupOrphanedGames()` from finding/deleting it
4. Clear any active question timers
5. Clear disconnect grace timers for any disconnected players (they won't be migrated)
6. Send `migrationToken` to the host client (so it can include it in the next `host-join`)

**Entry points:**
1. Host clicks "Return to Menu" / "New Game" (intentional leave) — emits `host-starting-new-game`
2. Host refreshes → socket disconnect → 30s reconnect grace expires → transition to `pending-migration`

### Server Changes

#### `host-join` (game-events.js)

Accept optional `previousPin` and `migrationToken` fields.

```
host-join { quiz, previousPin?, migrationToken? }
```

After creating the new game, if `previousPin` and `migrationToken` are provided:
1. Find old game by PIN, verify `gameState === 'pending-migration'` AND `game.migrationToken === migrationToken`
2. For each connected (non-disconnected) player in old game:
   - Look up socket via `io.sockets.sockets.get(playerId)` — skip if null
   - Call `socket.leave('game-${oldPin}')`, `socket.join('game-${newPin}')`
   - Add player to new game via `game.addPlayer(socketId, playerName)` — fresh score/answers
   - Generate new session token, store on player
   - Update `playerManagementService.players` map with new game PIN
   - Emit `player-joined` to the player socket (new PIN, new token, player list)
3. Emit `player-list-update` to new game room
4. Delete old game (cleanup timers already cleared)

#### New event: `host-starting-new-game` (game-events.js)

Emitted by client when host intentionally leaves to start a new game.

Server handler:
1. Find game by host socket ID
2. End any active question, clear timers
3. Transition to `pending-migration` (see "On entry" steps above)
4. Emit `host-preparing-new-game` to room with `{ graceMs: 120000 }`
5. Send `migration-token` to host socket with `{ pin, migrationToken }`
6. Start 2-minute timeout — on expiry, delete game and emit `game-ended` to room

#### Disconnect handler change (player-events.js)

When host disconnect 30s grace expires:
- Currently: `handleHostDisconnect()` + `deleteGame()`
- New: Transition to `pending-migration`, emit `host-preparing-new-game`, start 2-min timeout
- Send `migration-token` to... wait, the host socket is gone. Store `{ pin, migrationToken }` in the game object. The host will need to retrieve it from localStorage (stored before disconnect for the refresh case).

**Refresh case detail:** The host stores the current PIN in localStorage *proactively* during gameplay (on `game-created`). When the host refreshes and creates a new game, it reads the stored PIN and sends it as `previousPin`. The server finds the `pending-migration` game by PIN. But the host doesn't have the `migrationToken` (it was generated after the host disconnected).

**Resolution:** For the refresh case, skip the migration token check. Instead, verify that the `previousPin` game is in `pending-migration` state AND was entered via the disconnect path (add a `migrationSource: 'disconnect'` flag). This is acceptable because the PIN alone is sufficient security — the attacker would need to know the exact PIN AND create a `host-join` within the 2-minute window.

For the intentional-leave case, require the migration token (sent to the host before they disconnect).

### Client Changes

#### Host side (app.js)

**`resetAndReturnToMenu()`:**
- If host is currently in a game: emit `host-starting-new-game` (NOT `host-leave-game`)
- Store current game PIN in localStorage: `quizix_migration_pin`
- Listen for `migration-token` event → store token in localStorage: `quizix_migration_token`

**`backToHomeFromGame()`:** Keep existing behavior — emits `host-leave-game` (permanent leave, no migration). This is a separate code path from `resetAndReturnToMenu()`. Remove the `host-leave-game` emit from `resetAndReturnToMenu()` since `backToHomeFromGame()` already handles it.

**When creating a new game (wherever `host-join` is emitted):**
- Read `previousPin` and `migrationToken` from localStorage
- Include in payload: `socket.emit('host-join', { quiz, previousPin, migrationToken })`
- Clear both keys from localStorage after emit

**On `game-created`:** Store PIN in localStorage (`quizix_migration_pin`) proactively, so it survives a refresh.

#### Player side (socket-manager.js)

**New handler for `host-preparing-new-game`:**
- Show a waiting overlay: "Host is setting up the next game..." with spinner
- Include a "Leave" button that emits `leave-game` and returns to main menu

**Dismiss waiting overlay when:**
- `player-joined` fires (migration succeeded — existing handler shows lobby)
- `game-ended` fires (timeout expired — existing handler shows main menu)
- Player clicks "Leave"

### Timeout Behavior

| Scenario | Timeout | Result |
|----------|---------|--------|
| Host intentionally leaves | 2 min | If host doesn't create new game, `game-ended` fires, players go to main menu |
| Host refreshes, doesn't reconnect in 30s | 30s grace + 2 min = 2.5 min total | Same |
| Host creates new game within window | Immediate | Players migrated, timeouts cleared |

### Edge Cases

- **Host creates new game from different browser/device**: `previousPin` won't be in localStorage. Players wait 2 min then get `game-ended`. Acceptable degradation.
- **No players left in old game**: Migration is a no-op. New game starts empty.
- **Player disconnects during `pending-migration`**: Grace timer was cleared on entry. Player is still in the players map but marked disconnected. Skipped during migration (only connected players are migrated).
- **Host creates multiple games rapidly**: Each `host-join` checks `previousPin`. Only the first one finds the old game; subsequent ones have no old game to migrate from.
- **`addPlayer()` resets score**: Intentional — new game, fresh start. Migrated players start at 0.
- **Null socket during migration**: `io.sockets.sockets.get(playerId)` may return undefined (transport reconnecting). Skip that player — they'll fall through to `game-ended` when the old game is deleted.
- **`cleanupOrphanedGames()` safety**: `pending-migration` games have `hostId = null`. The orphan cleanup checks `hostId` and skips games without one. The 2-hour stale cleanup is a safety net if the 2-min timeout fails.

## Files to Modify

| File | Change |
|------|--------|
| `socket/game-events.js` | Add `host-starting-new-game` handler; modify `host-join` for `previousPin`/`migrationToken` + migration logic |
| `socket/player-events.js` | Change disconnect timeout to transition to `pending-migration` instead of deleting |
| `services/game-session-service.js` | Add `setPendingMigration(game, io)` method — state transition + 2-min timeout |
| `services/player-management-service.js` | Add `migratePlayersToGame(oldGame, newGame, io)` method |
| `public/js/core/app.js` | Update `resetAndReturnToMenu()` to emit `host-starting-new-game` and store PIN; proactively store PIN on `game-created` |
| `public/js/core/app.js` | Update host-join call sites to include `previousPin`/`migrationToken` |
| `public/js/socket/socket-manager.js` | Add `host-preparing-new-game` and `migration-token` handlers |
| `services/validation-schemas.js` | Add `host-starting-new-game` schema; update `host-join` schema for optional fields |

## Verification

1. **Intentional leave + new game**: Host plays game 1 → clicks Return to Menu → picks new quiz → hosts game 2 → players auto-appear in game 2 lobby
2. **Refresh + new game**: Host plays game 1 → refreshes browser → creates game 2 within 2.5 min → players auto-appear
3. **Timeout**: Host leaves → waits 2+ min → players get `game-ended` and go to main menu
4. **Player leaves during wait**: Player clicks "Leave" during waiting screen → goes to main menu, not migrated
5. **Back to Home (permanent leave)**: Host clicks "Back to Home" → game deleted immediately, players get `game-ended`, no migration
6. **Security**: Another client sends `host-join` with guessed `previousPin` but wrong/missing `migrationToken` → migration rejected, new game created normally without players
7. **Existing tests**: `npm test` (394 unit tests), `npm run test:stress` (8 stress tests) still pass
