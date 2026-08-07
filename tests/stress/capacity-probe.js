/**
 * Capacity probe — measures where a Quizix deployment actually degrades.
 *
 *   node capacity-probe.js <targetUrl> <playerCount>
 *
 * Unlike the stress suite (whose wall-clock is dominated by fixed question
 * timers), this measures the three things that actually scale with player
 * count:
 *   1. join latency        — connect + player-joined ack, per player
 *   2. broadcast fan-out   — spread between the FIRST and LAST player to
 *                            receive the same question-start
 *   3. answer round-trip   — submit-answer -> player-result, per player
 *
 * Fan-out spread is the number that matters for fairness: it is how much
 * later the unluckiest player sees the question than the luckiest, and it
 * feeds directly into time-based scoring.
 */

const { io: ioClient } = require('socket.io-client');

const TARGET = process.argv[2];
const COUNT = parseInt(process.argv[3], 10);
if (!TARGET || !COUNT) {
    console.error('usage: node capacity-probe.js <targetUrl> <playerCount>');
    process.exit(1);
}

const QUIZ = {
    title: 'Capacity Probe',
    randomizeAnswers: false,
    powerUpsEnabled: false,
    manualAdvancement: false,
    questions: [
        { question: 'What is 2+2?', type: 'multiple-choice', options: ['3', '4', '5', '6'], correctAnswer: 1, timeLimit: 30 },
        { question: 'What is 3+3?', type: 'multiple-choice', options: ['5', '6', '7', '8'], correctAnswer: 1, timeLimit: 30 },
    ],
};

const pct = (arr, p) => {
    if (!arr.length) return NaN;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (n) => (Number.isFinite(n) ? `${Math.round(n)}ms` : 'n/a');
const connect = (url) => new Promise((res, rej) => {
    const s = ioClient(url, { forceNew: true, transports: ['websocket'] });
    const t = setTimeout(() => rej(new Error('connect timeout')), 30000);
    s.once('connect', () => { clearTimeout(t); res(s); });
    s.once('connect_error', (e) => { clearTimeout(t); rej(e); });
});
const waitFor = (s, ev, ms = 60000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms);
    s.once(ev, (d) => { clearTimeout(t); res(d); });
});

(async () => {
    const report = { target: TARGET, players: COUNT };
    const host = await connect(TARGET);
    host.emit('host-join', { quiz: QUIZ });
    const created = await waitFor(host, 'game-created');
    const pin = created.pin;

    // ---- 1. join ---------------------------------------------------------
    const joinLatencies = [];
    const allSockets = [];   // everything opened, for cleanup
    const sockets = [];      // ONLY players the server actually admitted
    let joinFailures = 0;
    const joinErrors = [];
    const joinStart = Date.now();

    await Promise.all(Array.from({ length: COUNT }, async (_, i) => {
        let s;
        try {
            const t0 = Date.now();
            s = await connect(TARGET);
            allSockets.push(s);
            // A rejected join (e.g. past MAX_PLAYERS_PER_GAME) answers with
            // `error`, never `player-joined`. Race both, or this hangs.
            const acked = Promise.race([
                waitFor(s, 'player-joined', 45000),
                waitFor(s, 'error', 45000).then((e) => {
                    throw new Error(e?.message || 'join rejected');
                }),
            ]);
            s.emit('player-join', { pin, name: `P${i}` });
            await acked;
            joinLatencies.push(Date.now() - t0);
            sockets.push(s);   // admitted — safe to expect question-start
        } catch (e) {
            joinFailures++;
            if (joinErrors.length < 3) joinErrors.push(e.message);
        }
    }));
    report.joinErrorSample = joinErrors;

    report.joinWallClock = Date.now() - joinStart;
    report.joined = joinLatencies.length;
    report.joinFailures = joinFailures;
    report.joinP50 = pct(joinLatencies, 50);
    report.joinP95 = pct(joinLatencies, 95);
    report.joinMax = Math.max(...joinLatencies);

    if (!sockets.length) { console.log(JSON.stringify(report)); process.exit(1); }

    // ---- 2. fan-out + 3. round-trip -------------------------------------
    const qStartTimes = [];
    const rtts = [];
    let answerFailures = 0;

    const perSocket = sockets.map((s) => new Promise((resolve) => {
        s.once('question-start', () => {
            qStartTimes.push(Date.now());
            const t0 = Date.now();
            const done = setTimeout(() => { answerFailures++; resolve(); }, 45000);
            s.once('player-result', () => { clearTimeout(done); rtts.push(Date.now() - t0); resolve(); });
            s.emit('submit-answer', { answer: 1, type: 'multiple-choice' });
        });
    }));

    host.emit('start-game');
    await Promise.all(perSocket);

    report.fanoutSpread = Math.max(...qStartTimes) - Math.min(...qStartTimes);
    report.rttP50 = pct(rtts, 50);
    report.rttP95 = pct(rtts, 95);
    report.rttMax = rtts.length ? Math.max(...rtts) : NaN;
    report.answerFailures = answerFailures;
    report.stillConnected = sockets.filter((s) => s.connected).length;

    console.log('---');
    console.log(`target            ${report.target}`);
    console.log(`players requested ${COUNT}`);
    console.log(`joined ok         ${report.joined}   (failures ${report.joinFailures})`);
    console.log(`join wall-clock   ${fmt(report.joinWallClock)} for all ${report.joined}`);
    if (report.joinErrorSample.length) console.log(`reject reason     ${report.joinErrorSample[0]}`);
    console.log(`join latency      p50 ${fmt(report.joinP50)}  p95 ${fmt(report.joinP95)}  max ${fmt(report.joinMax)}`);
    console.log(`fan-out spread    ${fmt(report.fanoutSpread)}  (first->last question-start)`);
    console.log(`answer RTT        p50 ${fmt(report.rttP50)}  p95 ${fmt(report.rttP95)}  max ${fmt(report.rttMax)}`);
    console.log(`answer failures   ${report.answerFailures}`);
    console.log(`still connected   ${report.stillConnected}/${report.joined}`);
    console.log('---');

    allSockets.forEach((s) => s.disconnect());
    host.disconnect();
    process.exit(0);
})().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
