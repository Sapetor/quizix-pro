# Disconnect/Reconnect Resilience Improvements

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve disconnect/reconnect reliability so classroom students don't lose their game session on page refresh, phone lock, or brief host WiFi drop.

**Architecture:** Five targeted fixes to the existing Socket.IO reconnection system. No new files — all changes modify existing handlers in socket-manager.js (client), player-management-service.js (server), player-events.js (server), and main.js (client). The Game model gets a `removedPlayers` array for preserving scores of expired-grace-period players.

**Tech Stack:** Socket.IO 4.x, vanilla JS (ES6 modules), Node.js

---

## File Map

| File | Changes |
|------|---------|
| `public/js/socket/socket-manager.js` | Fix 1 (localStorage), Fix 4 (rejoin timeout) |
| `public/js/main.js` | Fix 3 (timer resync on visibility change) |
| `socket/player-events.js` | Fix 2 (host-rejoin event), Fix 3 (time-sync event) |
| `services/player-management-service.js` | Fix 2 (host grace period + rejoin), Fix 5 (preserve removed players) |
| `services/game.js` | Fix 5 (add `removedPlayers` array, merge into leaderboard) |
| `services/game-session-service.js` | Fix 2 (host grace period tracking) |
| `tests/unit/disconnect-reconnect.test.js` | Tests for fixes 2, 4, 5 |
| `tests/unit/player-management-service.test.js` | Tests for fix 5 |

---

## Task 1: Switch reconnection storage to localStorage with TTL

**Files:**
- Modify: `public/js/socket/socket-manager.js:168-176` (store), `:896-917` (read), `:947-953` (clear)

- [ ] **Step 1: Change all `sessionStorage` references to `localStorage`**

In `socket-manager.js`, replace every occurrence of `sessionStorage` with `localStorage`. There are exactly 3 locations:

Line 171 (store on player-joined):
```javascript
localStorage.setItem(RECONNECT_KEY, JSON.stringify({
```

Line 898 (read in _getValidReconnectData):
```javascript
const raw = localStorage.getItem(RECONNECT_KEY);
```

Line 949 (clear in _clearReconnectionData):
```javascript
localStorage.removeItem(RECONNECT_KEY);
```

- [ ] **Step 2: Update the `rejoin-success` handler to refresh `savedAt`**

In the `rejoin-success` handler (line ~632), after restoring player state, update the stored reconnection data with a fresh timestamp so the TTL resets:

```javascript
// Inside rejoin-success handler, after line 640:
try {
    localStorage.setItem(RECONNECT_KEY, JSON.stringify({
        pin: data.gamePin,
        playerName: data.playerName,
        sessionToken: data.sessionToken,
        savedAt: Date.now()
    }));
} catch (e) {
    logger.warn('Failed to update reconnection data:', e);
}
```

- [ ] **Step 3: Verify manually**

Open the app in browser, join a game, refresh the page. The rejoin banner should appear on the main menu. Click "Rejoin" — should reconnect successfully.

- [ ] **Step 4: Commit**

```bash
git add public/js/socket/socket-manager.js
git commit -m "fix: use localStorage for reconnection data — survives page refresh"
```

---

## Task 2: Add host grace period (30 seconds)

**Files:**
- Modify: `socket/player-events.js:118-139` (disconnect handler)
- Modify: `services/player-management-service.js:504-537` (handleHostDisconnect)
- Modify: `services/game-session-service.js` (add host grace period tracking)

- [ ] **Step 1: Add host disconnect timer storage to GameSessionService**

In `services/game-session-service.js`, add a `hostDisconnectTimers` Map in the constructor:

```javascript
this.hostDisconnectTimers = new Map(); // pin -> timerId
```

Add methods:

```javascript
setHostDisconnectTimer(pin, timerId) {
    this.hostDisconnectTimers.set(pin, timerId);
}

clearHostDisconnectTimer(pin) {
    const timerId = this.hostDisconnectTimers.get(pin);
    if (timerId) {
        clearTimeout(timerId);
        this.hostDisconnectTimers.delete(pin);
    }
}

getHostDisconnectTimer(pin) {
    return this.hostDisconnectTimers.has(pin);
}
```

- [ ] **Step 2: Modify disconnect handler to add host grace period**

In `socket/player-events.js`, replace the host disconnect block (lines 127-132):

```javascript
// Handle host disconnect
const hostedGame = gameSessionService.findGameByHost(socket.id);
if (hostedGame) {
    // Grace period for host: 30 seconds before killing the game
    if (hostedGame.gameState !== 'lobby') {
        hostedGame.hostDisconnectedAt = Date.now();
        hostedGame.hostDisconnected = true;

        // Notify players that host is temporarily disconnected
        io.to(`game-${hostedGame.pin}`).emit('host-disconnected', {
            graceMs: 30000
        });

        const timerId = setTimeout(() => {
            gameSessionService.clearHostDisconnectTimer(hostedGame.pin);
            // Only kill if host hasn't reconnected
            if (hostedGame.hostDisconnected) {
                playerManagementService.handleHostDisconnect(hostedGame, io);
                gameSessionService.deleteGame(hostedGame.pin);
            }
        }, 30000);
        gameSessionService.setHostDisconnectTimer(hostedGame.pin, timerId);

        logger.info(`Host disconnected from game ${hostedGame.pin} — 30s grace period started`);
    } else {
        // In lobby: immediate cleanup (no game in progress)
        playerManagementService.handleHostDisconnect(hostedGame, io);
        gameSessionService.deleteGame(hostedGame.pin);
    }
}
```

- [ ] **Step 3: Add host-rejoin event handler**

In `socket/player-events.js`, before the `disconnect` handler, add:

```javascript
// Handle host reconnection
socket.on('host-rejoin', (data) => {
    if (!checkRateLimit(socket.id, 'host-rejoin', 5, socket)) return;
    try {
        if (!data?.pin) {
            socket.emit('error', { message: 'Missing game PIN' });
            return;
        }
        const game = gameSessionService.getGame(data.pin);
        if (!game || !game.hostDisconnected) {
            socket.emit('error', { message: 'Game not found or not in reconnect state' });
            return;
        }

        // Restore host
        game.hostDisconnected = false;
        game.hostDisconnectedAt = null;
        game.hostId = socket.id;
        gameSessionService.clearHostDisconnectTimer(game.pin);

        socket.join(`game-${game.pin}`);

        // Notify players
        io.to(`game-${game.pin}`).emit('host-reconnected');

        // Send current game state back to host
        socket.emit('host-rejoin-success', {
            pin: game.pin,
            gameState: game.gameState,
            currentQuestion: game.currentQuestion,
            players: Array.from(game.players.values()).map(p => ({
                id: p.id, name: p.name, score: p.score,
                disconnected: p.disconnected || false
            })),
            leaderboard: game.leaderboard,
            quizTitle: game.quiz.title
        });

        logger.info(`Host reconnected to game ${game.pin}`);
    } catch (error) {
        logger.error('Error in host-rejoin handler:', error);
        socket.emit('error', { message: 'Failed to rejoin as host' });
    }
});
```

- [ ] **Step 4: Add client-side host reconnection logic**

In `public/js/socket/socket-manager.js`, in the `disconnect` handler (line 111-123), add host reconnection data storage:

```javascript
this.socket.on('disconnect', (reason) => {
    logger.debug('Disconnected from server:', reason);
    if (this.gameManager) {
        this.gameManager.stopTimer();
    }

    const gameState = this.gameManager?.stateManager?.getGameState();
    if (gameState && gameState.gamePin) {
        if (gameState.isHost) {
            // Store host reconnection data
            try {
                localStorage.setItem('quizix_host_reconnect', JSON.stringify({
                    pin: gameState.gamePin,
                    savedAt: Date.now()
                }));
            } catch (e) {
                logger.warn('Failed to store host reconnection data:', e);
            }
        } else {
            this._showReconnectionOverlay();
        }
    }
});
```

In the `reconnect` handler (line 609-613), add host rejoin:

```javascript
this.socket.on('reconnect', (attemptNumber) => {
    logger.debug('Reconnected after attempt:', attemptNumber);

    // Try host rejoin first
    try {
        const hostData = JSON.parse(localStorage.getItem('quizix_host_reconnect') || 'null');
        if (hostData?.pin && (Date.now() - hostData.savedAt) < 30000) {
            this.socket.emit('host-rejoin', { pin: hostData.pin });
            localStorage.removeItem('quizix_host_reconnect');
            return;
        }
    } catch (e) {
        logger.warn('Failed to read host reconnect data:', e);
    }
    localStorage.removeItem('quizix_host_reconnect');

    // Otherwise attempt player rejoin
    this._attemptRejoin();
});
```

Add `host-rejoin-success` and `host-disconnected`/`host-reconnected` handlers:

```javascript
this.socket.on('host-rejoin-success', (data) => {
    logger.info('Host rejoin successful:', data);
    this.gameManager.setGamePin(data.pin);
    this.gameManager.setPlayerInfo('Host', true);
    this.uiManager.updateGamePin(data.pin);

    if (data.gameState === 'lobby') {
        this.uiManager.showScreen('game-lobby');
    } else {
        this.uiManager.showScreen('host-game-screen');
    }

    this.gameManager.updatePlayersList(data.players);

    if (window.toastNotifications) {
        window.toastNotifications.show('Reconnected as host!', 'success', 2000);
    }
});

this.socket.on('host-disconnected', (data) => {
    // Show overlay to players: "Host disconnected, waiting..."
    const overlay = this._getElement('reconnection-overlay');
    if (overlay) {
        show(overlay);
        const contextEl = this._getElement('reconnection-context');
        if (contextEl) {
            contextEl.textContent = translationManager.getTranslationSync('host_disconnected_waiting')
                || 'Host disconnected — waiting for reconnection...';
        }
    }
});

this.socket.on('host-reconnected', () => {
    // Hide overlay — host is back
    this._hideReconnectionOverlay();
    if (window.toastNotifications) {
        window.toastNotifications.show(
            translationManager.getTranslationSync('host_reconnected') || 'Host reconnected!',
            'success', 2000
        );
    }
});
```

- [ ] **Step 5: Commit**

```bash
git add socket/player-events.js services/game-session-service.js public/js/socket/socket-manager.js
git commit -m "feat: add 30s host grace period — brief WiFi drops don't kill the game"
```

---

## Task 3: Timer resync on tab visibility change

**Files:**
- Modify: `public/js/main.js:294-308` (visibilitychange handler)
- Modify: `socket/player-events.js` (add request-time-sync handler)

- [ ] **Step 1: Add `request-time-sync` server handler**

In `socket/player-events.js`, before the `disconnect` handler, add:

```javascript
socket.on('request-time-sync', () => {
    if (!checkRateLimit(socket.id, 'request-time-sync', 3, socket)) return;
    try {
        const playerData = playerManagementService.getPlayer(socket.id);
        if (!playerData) return;

        const game = gameSessionService.getGame(playerData.gamePin);
        if (!game || game.gameState !== 'question') return;

        const question = game.quiz.questions[game.currentQuestion];
        const timeLimit = question.timeLimit || question.time || 20;
        const remainingMs = Math.max(0, (timeLimit * 1000) - (Date.now() - game.questionStartTime));

        socket.emit('time-sync', { remainingMs });
    } catch (error) {
        logger.error('Error in request-time-sync:', error);
    }
});
```

- [ ] **Step 2: Add client-side time-sync request on tab visible**

In `public/js/main.js`, extend the visibilitychange handler (line 295):

```javascript
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        logger.debug('Page hidden - performing partial cleanup...');
        try {
            if (window.game?.gameManager && typeof window.game.gameManager.clearTimerTracked === 'function' && window.game.gameManager.timer) {
                window.game.gameManager.clearTimerTracked(window.game.gameManager.timer);
                window.game.gameManager.timer = null;
            }
        } catch (error) {
            logger.error('Error during partial cleanup:', error);
        }
    } else {
        // Tab became visible again — request time sync from server
        logger.debug('Page visible - requesting time sync...');
        try {
            if (window.game?.socket?.connected) {
                window.game.socket.emit('request-time-sync');
            }
        } catch (error) {
            logger.error('Error requesting time sync:', error);
        }
    }
});
```

- [ ] **Step 3: Add `time-sync` listener in socket-manager.js**

In `public/js/socket/socket-manager.js`, in `initializeSocketListeners()`:

```javascript
this.socket.on('time-sync', (data) => {
    if (data?.remainingMs != null && this.gameManager) {
        const remainingSec = Math.ceil(data.remainingMs / 1000);
        this.gameManager.updateTimerDisplay(remainingSec);
        logger.debug('Timer synced:', remainingSec, 'seconds remaining');
    }
});
```

- [ ] **Step 4: Add `updateTimerDisplay` to GameManager if missing**

Check if `GameManager` has an `updateTimerDisplay` method. If not, add a simple one that updates the timer DOM element:

```javascript
updateTimerDisplay(seconds) {
    const timerEl = document.getElementById('player-timer') || document.getElementById('question-timer');
    if (timerEl) {
        timerEl.textContent = seconds;
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add public/js/main.js socket/player-events.js public/js/socket/socket-manager.js
git commit -m "fix: resync question timer when tab becomes visible after phone lock"
```

---

## Task 4: Add timeout to rejoin attempts

**Files:**
- Modify: `public/js/socket/socket-manager.js:923-942` (_attemptRejoin)

- [ ] **Step 1: Add timeout to `_attemptRejoin`**

Replace the `_attemptRejoin` method:

```javascript
_attemptRejoin() {
    const data = this._getValidReconnectData();
    if (!data) return;

    logger.info('Attempting rejoin with session token:', { pin: data.pin });

    // Set a 10-second timeout for the rejoin attempt
    const rejoinTimeout = setTimeout(() => {
        logger.warn('Rejoin attempt timed out after 10 seconds');
        this._hideReconnectionOverlay();
        this.gameManager.stopTimer();
        this.gameManager.resetGameState();
        this.uiManager.showScreen('main-menu');
        this._showRejoinBanner();

        if (window.toastNotifications) {
            const msg = translationManager.getTranslationSync('rejoin_timeout')
                || 'Could not reconnect — game may have ended';
            window.toastNotifications.show(msg, 'warning', 4000);
        }
    }, 10000);

    // Clear timeout when we get a response (success or failure)
    const clearRejoinTimeout = () => clearTimeout(rejoinTimeout);
    this.socket.once('rejoin-success', clearRejoinTimeout);
    this.socket.once('rejoin-failed', clearRejoinTimeout);

    const emitRejoin = () => {
        this.socket.emit('player-rejoin', {
            pin: data.pin,
            sessionToken: data.sessionToken
        });
    };

    if (!this.socket.connected) {
        this.socket.connect();
        this.socket.once('connect', emitRejoin);
    } else {
        emitRejoin();
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/socket/socket-manager.js
git commit -m "fix: add 10s timeout to rejoin attempts — no more infinite spinner"
```

---

## Task 5: Preserve removed players in final results

**Files:**
- Modify: `services/game.js:34-83` (constructor), `:564-577` (updateLeaderboard)
- Modify: `services/player-management-service.js:272-292` (_finalizePlayerRemoval)

- [ ] **Step 1: Add `removedPlayers` array to Game constructor**

In `services/game.js`, after `this.answerMappings = new Map();` (line 67):

```javascript
// Players removed after grace period expiry — preserved for final leaderboard
this.removedPlayers = [];
```

- [ ] **Step 2: Update `_finalizePlayerRemoval` to preserve player data**

In `services/player-management-service.js`, in `_finalizePlayerRemoval` (line 272), before `game.removePlayer(playerId)`:

```javascript
// Preserve player data for final leaderboard before removal
game.removedPlayers.push({
    id: playerId,
    name: player.name,
    score: player.score || 0,
    answers: player.answers || {},
    disconnected: true,
    removedAt: Date.now()
});
```

- [ ] **Step 3: Update `updateLeaderboard` to include removed players**

In `services/game.js`, modify `updateLeaderboard()`:

```javascript
updateLeaderboard() {
    // Combine active players and removed players (who disconnected and grace period expired)
    const allPlayers = [
        ...Array.from(this.players.values()),
        ...this.removedPlayers
    ];

    const playersWithTime = allPlayers.map(player => ({
        player,
        totalTime: Object.values(player.answers || {}).reduce((sum, ans) => sum + (ans.timeMs || 0), 0)
    }));
    this.leaderboard = playersWithTime
        .sort((a, b) => {
            if (b.player.score !== a.player.score) return b.player.score - a.player.score;
            return a.totalTime - b.totalTime;
        })
        .map(({ player }) => player);
}
```

- [ ] **Step 4: Clear `removedPlayers` in cleanup/reset**

In `services/game.js`, find the `cleanup()` and `reset()` methods and add `this.removedPlayers = [];` alongside `this.leaderboard = [];`.

- [ ] **Step 5: Run existing tests**

```bash
npm test
```

All 384 tests should pass. The existing leaderboard tests don't cover this edge case (they don't simulate grace period expiry), but the existing test assertions should remain valid since we only added data, not changed existing behavior.

- [ ] **Step 6: Commit**

```bash
git add services/game.js services/player-management-service.js
git commit -m "fix: preserve disconnected players in final leaderboard after grace period expiry"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `npm test` — all tests pass, no force-exit warning
- [ ] Manual test: join game on phone → refresh page → rejoin banner appears → click Rejoin → back in game
- [ ] Manual test: host WiFi off for 10s → WiFi on → host reconnects, game continues
- [ ] Manual test: lock phone during question → unlock → timer shows correct remaining time
- [ ] Manual test: player joins → disconnect → wait 2+ min → game ends → player still appears in leaderboard
