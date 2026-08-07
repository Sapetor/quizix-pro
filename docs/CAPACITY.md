# Capacity — measured, not estimated

_Measured 2026-08-06 against the cloudflared tunnel (`quiz.smplecht.uk` → port
3400) on the WSL2 dev box (16 cores, 20 GB RAM, Node v22.16). Re-run before
trusting these; they are a point-in-time measurement of one deployment._

## Configured limits

`config/limits.js`, desktop tier (the default — `MOBILE_MODE=true` switches to
the mobile tier):

| | desktop | mobile |
|---|---|---|
| `MAX_PLAYERS_PER_GAME` | 200 | 50 |
| `MAX_CONCURRENT_GAMES` | 100 | 5 |

## Measured through the tunnel

`node tests/stress/capacity-probe.js https://quiz.smplecht.uk <N>`

| players | join wall-clock | join p50 | join p95 | fan-out spread | answer RTT p50 | failures |
|---:|---:|---:|---:|---:|---:|---:|
| 50  | 215 ms | 186 ms | 194 ms | 5 ms  | 1107 ms | 0 |
| 100 | 413 ms | 365 ms | 383 ms | 12 ms | 1106 ms | 0 |
| 200 | 827 ms | 728 ms | 808 ms | 19 ms | 1105 ms | 0 |
| 250 | 998 ms | 869 ms | 890 ms | 17 ms | 1109 ms | 50 rejected, cleanly |

Local (loopback, port 3400) at 50 players for comparison: join wall-clock 55 ms,
fan-out 3 ms, RTT p50 1100 ms.

**Reading the numbers:**

- **Nothing degraded up to the 200-player cap.** No dropped sockets, no answer
  failures, all 200 still connected at the end.
- **Answer RTT is flat at ~1105 ms across 50 / 100 / 200.** It does not scale
  with player count, so it is a fixed server-side delay (batching/reveal
  pacing), not congestion. Load did not move it.
- **Fan-out spread — the fairness number — stayed under 20 ms.** That is how
  much later the unluckiest player sees a question than the luckiest, and it
  feeds time-based scoring. 19 ms at 200 players is negligible next to human
  reaction time.
- **The tunnel costs roughly 4x on join latency** (55 ms → 215 ms at 50) and
  nothing measurable on fan-out or RTT.
- **Past the cap the server degrades gracefully**: the 201st player gets
  `Game is full (max 200 players)` and the 200 already in are unaffected.
- Server memory barely moved: RSS 99 MB → 103 MB across the 250-player run.

## What these numbers do NOT tell you

Important for beta planning — the probe is optimistic in ways real users are not:

1. **All simulated players come from one machine and one IP.** Real players
   arrive from many networks. Cloudflare per-IP behavior, carrier NAT and
   mobile radio wake-up are not exercised here.
2. **No real mobile networks.** Join latency over 4G with packet loss will
   dwarf the numbers above. Venue wifi is the most likely real bottleneck.
3. **`pingTimeout` is 120 s** (`server.js` `CONFIG.NETWORK`). A phone that
   drops off wifi holds its slot for two minutes, so concurrent connections can
   exceed the number of people actually playing.
4. **One game at a time was tested.** `MAX_CONCURRENT_GAMES` is 100; concurrent
   games were not measured.
5. **Single Node process.** The 16 cores do not help one game's broadcast loop.

## Reproducing

```bash
npm run test:stress                                    # 8 scenarios, in-process server
STRESS_TARGET=https://quiz.smplecht.uk npm run test:stress   # same suite, real deployment
node tests/stress/capacity-probe.js <url> <N>          # latency/fan-out at N players
```

Note `npm run test:stress` is NOT part of `npm test` — it must be run
deliberately, which is how it silently rotted before (see the manual-advancement
note in `tests/stress/game-stress.test.js`).
