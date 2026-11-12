# Quizix Pro - Future Development Plans

This document outlines future enhancements and optimization strategies for Quizix Pro, focusing on mobile deployment and performance scalability.

## 📱 Mobile Server Deployment

### Feasibility Analysis

**Project Specifications:**
- **Total Size**: 41MB (37MB node_modules + 4MB source code)
- **Memory Usage**: 50-100MB RAM for 20-50 concurrent users
- **Network**: Pre-configured for `0.0.0.0:3000` binding (mobile-friendly)
- **Dependencies**: All mobile-compatible (Socket.IO, Express, etc.)

Status (2026-11-12): the size figures are out of date. Production dependencies
(`npm ls --omit=dev`) take about 141 MB on disk, the largest being sharp's
`@img` binaries (about 48 MB) and `pdfjs-dist` (about 35 MB). A full install
with dev dependencies is about 258 MB; tracked source files are about 13 MB.

**Current Performance:**
- **User Capacity**: 10-30 concurrent users comfortably
- **Battery Life**: 2-4 hours continuous hosting
- **Network Usage**: ~200KB/sec peak for 20 simultaneous users
- **Memory Per User**: ~2MB including WebSocket overhead

### Platform Support

#### Android: ⭐⭐⭐⭐⭐ EXCELLENT
- **Termux**: Full Linux environment with Node.js support
- **NodeJS Mobile**: Native app with embedded Node.js runtime
- **Network Sharing**: Can bind to network interfaces for hotspot sharing
- **File System**: Full read/write access for quiz/results storage
- **Background Processing**: Available with proper permissions

#### iOS: ⭐⭐☆☆☆ LIMITED
- **App Store Restrictions**: Server apps not allowed
- **30-Second Background Limit**: Can't maintain persistent server
- **Network Restrictions**: Cannot bind to network interfaces
- **Alternative**: PWA or cloud deployment only

### Implementation Approaches

#### 1. Termux (Android) - RECOMMENDED
```bash
# Installation Steps
pkg update && pkg upgrade
pkg install nodejs-lts git
termux-setup-storage
cd ~/storage/shared
git clone <repository-url>
cd quizix-pro
npm install
npm start
```

**Advantages:**
- Full-featured Node.js environment
- Complete file system access
- Real terminal for debugging
- Can run in background with proper setup

#### 2. NodeJS Mobile (Android)
- React Native app with nodejs-mobile-react-native
- Bundle Quizix Pro server code in assets
- Native UI for server management
- Better Android integration and distribution

#### 3. Progressive Web App
- Service worker for offline capability
- WebRTC for peer-to-peer connections
- IndexedDB for local quiz storage
- Cross-platform compatibility

#### 4. Cloud Deployment with Mobile Management
- Deploy to cloud platform (DigitalOcean, Fly.io, Hetzner)
- Mobile app for remote server management
- Authentication and security implementation
- Server status monitoring

### Real-World Usage Scenarios

**Perfect For:**
- Classroom quizzes (teacher's phone as server)
- Small group games (parties, study groups)
- Offline/remote location gaming
- Educational workshops without WiFi infrastructure

**Capacity Examples:**
- **Small Class**: 5-15 students ✅ Excellent performance
- **Large Class**: 20-30 students ✅ Good performance  
- **Event**: 50+ users ⚠️ Requires optimization

## 🚀 Performance Optimization Strategy

### Current Bottlenecks

#### 1. Memory Usage (Critical)
- **In-Memory Storage**: All games and players stored in JavaScript Maps
- **No Cleanup**: Games persist indefinitely until server restart
- **Memory Per User**: ~2MB including WebSocket overhead
- **Current Capacity**: 20-30 users before mobile RAM limits

#### 2. Socket.IO Broadcasting
- **31 emit events** throughout the codebase
- **Inefficient Broadcasting**: Sending full game state repeatedly
- **No Message Batching**: Individual events for each action
- **Live Statistics**: Real-time updates for every answer

#### 3. File I/O Operations
- **Synchronous File Writes**: `fs.writeFileSync()` blocks event loop
- **Multiple File Operations**: Quiz saving, results saving, image uploads
- **No Caching**: Files read from disk repeatedly

Status (2026-11-12):
- Games no longer persist indefinitely. `GameSessionService.cleanupStaleGames()`
  (`services/game-session-service.js`) runs every 30 minutes and removes games
  older than 2 hours and empty lobbies older than 30 minutes.
- The server code (`server.js`, `services/`, `socket/`, `routes/`) has 127
  `.emit(` calls covering 43 distinct event names, not 31.
- Quiz, results, user and metadata writes are asynchronous (`fs.promises`
  through `services/atomic-write.js`). The remaining synchronous calls are the
  session-secret file in `services/session-service.js`, `/proc/version` reads
  at startup, the opt-in debug routes in `server.js`, and one `existsSync` per
  JS request in `middleware/static-files.js`.

### Optimization Phases

#### Phase 1: Memory Management (Critical)
Status (2026-11-12): partly implemented. `config/limits.js` defines
`MAX_CONCURRENT_GAMES` and `MAX_PLAYERS_PER_GAME` (desktop 100 and 200,
`MOBILE_MODE=true` 5 and 50), enforced in `GameSessionService.createGame()` and
`Game.addPlayer()`. Stale-game cleanup exists (see above). There is no memory
monitoring or GC trigger.
```javascript
// Implementation Goals
const MAX_CONCURRENT_GAMES = 3;  // Mobile limit
const MAX_PLAYERS_PER_GAME = 50; // Mobile limit
const GAME_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Features to Add
- Automatic game cleanup with configurable timeouts
- Maximum concurrent games limit (3-5 for mobile)
- Player count limits per game (50-80 for mobile)
- Memory monitoring and cleanup routines
- Garbage collection triggers
```

#### Phase 2: Socket.IO Optimization
Status (2026-11-12): not active. `services/socket-batch-service.js` (500 ms
interval; batches `answer-statistics`, `player-answered`,
`leaderboard-update`) is constructed in `server.js`, but no game code calls its
`emit()`; only `cleanupRoom()` is used. HTTP responses are compressed by the
`compression` middleware; no Socket.IO message compression is configured.
```javascript
// Performance Improvements
const UPDATE_THROTTLE = 1000; // 1 second batching
const LIVE_STATS_DEBOUNCE = 500; // Reduce live update frequency

// Features to Add
- Replace 31 individual emit events with batched updates
- Implement message throttling (1-second intervals)
- Add delta-based updates (send only changes, not full state)
- Create message compression for mobile networks
- Optimize broadcasting to reduce CPU usage
```

#### Phase 3: Async File Operations
Status (2026-11-12): done for quiz, results, user and metadata files (see the
status note under Current Bottlenecks).
```javascript
// Replace Synchronous Operations
// Before: fs.writeFileSync(filePath, data);
// After: await fs.promises.writeFile(filePath, data);

// Features to Add
- Convert all synchronous file operations to async
- Add file operation queuing to prevent I/O blocking
- Implement caching layer for frequently accessed files
- Add error handling and retry mechanisms
- Create mobile-optimized file size limits
```

#### Phase 4: Mobile-Specific Adaptations
Status (2026-11-12): partly implemented. `MOBILE_MODE=true` selects the mobile
limits in `config/limits.js`; there is no automatic detection. Its
`MAX_UPLOAD_SIZE` (1 MB) is not read anywhere: the image upload limit is
`CONFIG.LIMITS.MAX_FILE_SIZE` in `server.js`, 5 MB in both modes. There is no
per-quiz image limit.
```javascript
// Environment Detection
const isMobile = process.env.MOBILE_MODE === 'true';
const MAX_UPLOAD_SIZE = isMobile ? 1024 * 1024 : 5 * 1024 * 1024; // 1MB vs 5MB
const MAX_QUESTION_IMAGES = isMobile ? 5 : 20;

// Features to Add
- Environment detection (desktop vs mobile deployment)
- Progressive feature degradation for large groups
- Mobile mode with reduced memory footprint
- Dynamic scaling based on device capabilities
- Network optimization for mobile hotspots
```

#### Phase 5: Performance Monitoring
Status (2026-11-12): partly implemented. `services/metrics-service.js` exposes
Prometheus metrics (prom-client, including default process CPU and memory
metrics) at `/metrics`, registered only when `ENABLE_DEBUG_ROUTES=true`. There
is no admin dashboard and no scaling trigger.
```javascript
// Monitoring Features
- Real-time memory usage monitoring
- Connection count tracking
- Performance metrics collection
- Automatic scaling triggers
- Admin dashboard for resource monitoring
```

### Expected Performance Improvements

| Optimization | Current Capacity | Optimized Capacity |
|--------------|------------------|-------------------|
| **Memory Management** | 20-30 users | 50-80 users |
| **Socket Optimization** | Basic real-time | 100+ users with degraded features |
| **File I/O Async** | Blocking operations | Smooth concurrent access |
| **Data Compression** | Full payloads | 60-70% smaller messages |

### Mobile vs Desktop Configuration

#### Desktop Version (Current)
- Full features with higher limits
- Real-time everything
- No memory restrictions
- Maximum image upload: 5MB
- Unlimited concurrent games (status 2026-11-12: capped at 100 games of up to 200 players by `config/limits.js`)

#### Mobile Version (Optimized)
- Progressive degradation based on device capabilities
- Lower memory footprint
- Simplified real-time features for large groups
- Maximum image upload: 1MB (status 2026-11-12: defined in `config/limits.js` but not enforced; uploads stay at 5 MB)
- Limited concurrent games (3-5) (status 2026-11-12: `MOBILE_MODE=true` sets 5 games of up to 50 players)

#### Universal Approach (Recommended)
- **Environment Detection**: Automatically detect mobile deployment
- **Dynamic Scaling**: Adjust limits based on available resources
- **Feature Toggling**: Enable/disable features based on capacity

## 📋 Development Roadmap

Status of the items below checked against the code on 2026-11-12.

### Short Term (1-2 months)
- [ ] Implement memory management system (partial: game and player limits plus stale-game cleanup; no memory monitoring)
- [x] Add game cleanup and timeout mechanisms (`cleanupStaleGames()` in `services/game-session-service.js`)
- [x] Convert synchronous file operations to async (data files go through `services/atomic-write.js`)
- [ ] Add environment detection for mobile vs desktop (partial: manual `MOBILE_MODE=true` switch in `config/limits.js`, no detection)

### Medium Term (3-6 months)
- [ ] Optimize Socket.IO broadcasting and message batching (partial: `services/socket-batch-service.js` exists but is not called by game code)
- [ ] Implement data compression for mobile networks (partial: HTTP `compression` middleware only)
- [ ] Create mobile-specific UI optimizations
- [ ] Add performance monitoring dashboard (partial: opt-in Prometheus `/metrics`, no dashboard)

### Long Term (6-12 months)
- [ ] Develop native Android app using NodeJS Mobile
- [ ] Create Progressive Web App version (partial: `public/sw.js` service worker; no web app manifest)
- [ ] Implement advanced scaling and load balancing
- [ ] Add cloud deployment with mobile management

## 🛠 Technical Implementation Notes

### Code Structure Changes
Status (2026-11-12): neither `mobile/` nor `monitoring/` exists, and there is no
`mobile-config.js`. The implemented parts live in `config/limits.js` (limits),
`services/game-session-service.js` (cleanup) and `services/metrics-service.js`
(metrics).
```
New directories to add:
├── mobile/
│   ├── android/          # Native Android app
│   ├── pwa/             # Progressive Web App
│   └── optimizations/   # Mobile-specific optimizations
├── monitoring/
│   ├── metrics.js       # Performance monitoring
│   ├── cleanup.js       # Memory cleanup routines
│   └── scaling.js       # Dynamic scaling logic
```

### Configuration Files
```javascript
// mobile-config.js
export const MOBILE_CONFIG = {
  MAX_CONCURRENT_GAMES: 3,
  MAX_PLAYERS_PER_GAME: 50,
  MEMORY_CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
  FILE_SIZE_LIMIT: 1 * 1024 * 1024, // 1MB
  SOCKET_THROTTLE: 1000, // 1 second
  ENABLE_LIVE_STATS: false // Disable for large groups
};
```

### Testing Requirements
- [x] Load testing with 50+ concurrent users (`tests/stress/game-stress.test.js` plays a 50-player game, run with `npm run test:stress`; `tests/stress/capacity-probe.js` measures join latency and broadcast spread for a given player count)
- [ ] Memory usage profiling on mobile devices
- [ ] Network bandwidth optimization testing
- [ ] Battery life impact assessment
- [ ] Cross-platform compatibility verification

## 📚 Additional Features to Consider

### Enhanced Mobile Features
- **Offline Mode**: Cache quizzes for offline play
- **Battery Optimization**: Reduce CPU usage during idle periods
- **Network Resilience**: Handle mobile network disconnections
- **Push Notifications**: Native mobile notifications for game events

### Educational Enhancements
- **Student Analytics**: Individual performance tracking
- **Classroom Management**: Teacher dashboard with advanced controls
- **Assessment Tools**: Grade book integration and export
- **Accessibility**: Enhanced screen reader and mobile accessibility

### Cloud Integration
- **Hybrid Mode**: Local hosting with cloud backup
- **Quiz Sharing**: Cloud-based quiz library
- **Remote Management**: Manage mobile servers from web interface
- **Scalability**: Automatic failover to cloud when mobile limits reached

## 🎓 Engineering Education Features (Future Ideas)

These innovative features are designed specifically for engineering faculty students, focusing on deeper conceptual understanding rather than rote memorization.

Status (2026-11-12): item 1 is implemented; items 2 to 7 have no code yet.

### 1. Concept Dependency Heatmap ⭐ HIGH PRIORITY
**Status**: ✅ IMPLEMENTED (January 2026)

Visual analytics showing students their knowledge gaps and concept dependencies:
- After quizzes, display a graph showing topic relationships
- Highlight weak areas and their prerequisite concepts
- Example: "You struggle with thermodynamics entropy questions because your probability fundamentals are weak"
- Actionable insights, not just scores
- Heat map visualization of mastery levels across topic trees

**Implementation Details:**
- Concept tags on questions (max 5 per question, AI-generated or manual)
- "Concepts" tab in analytics modal with horizontal bar chart
- Color-coded mastery levels (green >80%, yellow 60-79%, orange 40-59%, red <40%)
- Toggleable "Study Suggestions" with focus areas and strong areas
- Player-facing concept mastery display at game end

### 2. "Find the Bug" Mode
Present worked solutions with deliberate errors for students to identify:
- Sign flips, unit mismatches, wrong formula applications
- Students must identify *where* and *why* the solution fails
- Mirrors real engineering peer review processes
- Teaches critical analysis skills—catching mistakes is harder than solving from scratch

### 3. Order-of-Magnitude Estimation (Fermi Problems)
Engineering judgment training through estimation challenges:
- "Estimate the power consumption of this building" with partial data
- No calculator allowed—pure reasoning and intuition
- Develop practical engineering sense for sanity-checking results
- Valuable skill rarely tested in traditional education

### 4. Parameter Sensitivity Questions
Test intuition about mathematical relationships:
- "If we double the beam thickness, what happens to deflection?"
- Focus on understanding *why* formulas work, not calculation
- Options: linear, quadratic, inverse, no effect, etc.
- Builds engineering intuition that outperforms memorization

### 5. Collaborative Debugging Sessions
Real-time group problem-solving mode:
- Multiple students see the same problem simultaneously
- Chat/voting system to collectively identify issues
- Simulates design review meetings in industry
- Teaches communication and collaborative problem-solving

### 6. "Explain Your Reasoning" with AI Feedback
Natural language explanation assessment:
- Student writes 2-3 sentences explaining their answer
- AI evaluates conceptual accuracy of the explanation
- Exposes memorization vs. genuine understanding
- Provides feedback on reasoning quality, not just correctness

### 7. Industry Case Study Mode
Real-world engineering failure analysis:
- Partner with companies to submit sanitized problems
- "Our pump system failed—what went wrong?"
- Students engage with authentic engineering scenarios
- Bridges gap between academic learning and professional practice

---

## 🎯 Success Metrics

### Performance Targets
- **User Capacity**: 50-100 concurrent users on mobile
- **Memory Usage**: <150MB total for 50 users
- **Response Time**: <100ms for game actions
- **Battery Life**: 4-6 hours continuous hosting
- **Network Efficiency**: 70% reduction in data usage

### User Experience Goals
- **Setup Time**: <5 minutes from download to hosting
- **Reliability**: 99%+ uptime during game sessions
- **Cross-Platform**: Seamless experience across all devices
- **Accessibility**: Full mobile accessibility support

This roadmap transforms Quizix Pro from a desktop-focused application into a truly mobile-first quiz platform, opening new possibilities for education and entertainment in mobile-centric environments.

---

## 🌐 TODO: Public exposure via Cloudflare Tunnel

Audited 2026-07-24; status rechecked against the code 2026-11-12. The app is written
for a LAN threat model and a tunnel changes that model. All four items below are
fixed; items 2 and 4 on 2026-11-12. How to run behind a tunnel is in
[DEPLOYMENT.md](../DEPLOYMENT.md).

1. **Fixed: per-client IPs behind the proxy.** `server.js:202` sets
   `app.set('trust proxy', 'loopback')`, and `getClientIp` in `middleware/client-ip.js`
   uses `CF-Connecting-IP` only when the direct peer is loopback or listed in
   `TRUSTED_PROXY_IPS`. The AI limiters (`routes/ai-generation.js`), the upload limiter
   (`routes/file-uploads.js`) and the save-quiz limiter key on that IP. The Socket.IO
   limiter (`utils/socket-rate-limiter.js`) keys on socket id and event, so it never
   depended on the IP.

2. **Fixed: `/api/active-games` returned live PINs to anyone.** The list now goes
   only to signed-in users and direct LAN clients (`isDirectLocalClient` in
   `middleware/client-ip.js`: loopback or private TCP peer and no `CF-Connecting-IP`,
   `X-Forwarded-For`, `X-Real-IP` or `Forwarded` header). Everyone else gets
   `{"games": []}`. The `debug` block that listed finished games is gone.

3. **Fixed: AI routes and the server key.** Every `/claude/generate`, `/gemini/generate`
   and `/ai/complete` request is rate-limited per client IP whichever key it uses, and
   spending the server-side key returns 401 unless the requester is logged in
   (`routes/ai-generation.js:427-449` and the matching blocks below it). A key sent with
   the request is preferred over the server key.

4. **Fixed: ownerless quizzes were deletable by anyone.** Deleting
   (`DELETE /api/quiz/:filename`), overwriting (`/api/save-quiz` with `filename`) and
   renaming or moving (`PATCH /api/quiz-metadata/:filename`) a quiz without an owner
   now need a signed-in user or a direct LAN client, as in item 2. Anonymous LAN
   use keeps working; anonymous clients through the tunnel get `401`.

Cloudflare Access on the host-side API paths (`/api/save-quiz`, quiz/results DELETE,
`/api/*/generate`, `/api/active-games`), with the player join path left public, remains
an optional extra layer.

Already handled, for the record: `/extract-url` SSRF protection is enforced per-hop after
DNS resolution, helmet is enabled, zod validates request bodies, and upload rate limiting
runs before multer touches disk.