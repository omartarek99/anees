// Two controlled checks on the REAL server (anonymous, nothing is written, no real account is targeted):
//   1) LOGIN COST: a few logins with made-up usernames. A failed login still does the slow password check, so it costs the same as a real one. We time them
//      and, while they run, keep asking the server "are you alive?" to see whether everyone else has to wait (the "login rush" effect), at small scale.
//   2) CRASH CHECK: a gentle ramp of simultaneous visitors on the API, 100 -> 250 -> 500 -> 1000, with an automatic stop at the first sign of trouble,
//      and a recovery check afterwards.
//   node loadtest/live-crash-probe.mjs [--skip-ramp]
import { writeFileSync } from 'node:fs';

const API = 'https://anees-01h6.onrender.com';
const UA = { 'User-Agent': 'anees-check/1.0', 'X-Requested-With': 'anees', 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };
const out = { startedAt: new Date().toISOString() };

async function hit(path, opts = {}) {
  const t0 = performance.now();
  let status = 0;
  try {
    const res = await fetch(API + path, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 30000) });
    status = res.status;
    await res.arrayBuffer();
  } catch (e) { status = e.name === 'TimeoutError' ? -2 : -1; }
  return { status, ms: performance.now() - t0 };
}
const fakeLogin = () => hit('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: `nobody_${Math.random().toString(36).slice(2, 10)}`, password: 'Wrong-Password-1!' }), timeout: 60000 });

// ----------------------------------------------------------------- 1) login cost
const SKIP_LOGIN = process.argv.includes('--skip-login');
const base = [];
for (let i = 0; i < 12; i++) { base.push((await hit('/api/health')).ms); await sleep(150); }
out.healthBaseline = { median: Math.round(pct(base, 50)), p95: Math.round(pct(base, 95)) };
console.log('health, nobody else logging in:', JSON.stringify(out.healthBaseline));

const single = [];
for (let i = 0; i < 3; i++) { single.push(await fakeLogin()); await sleep(1500); }
out.oneLogin = single.map((s) => ({ status: s.status, ms: Math.round(s.ms) }));
console.log('one failed login at a time (status, ms):', JSON.stringify(out.oneLogin));

// 6 logins at the same moment, while a "are you alive?" call is made every 200 ms
const N = 6;
const pings = [];
let running = true;
const pinger = (async () => { while (running) { const t0 = performance.now(); const r = await hit('/api/health'); pings.push({ at: Math.round(t0), status: r.status, ms: r.ms }); await sleep(200); } })();
const t0 = performance.now();
const rush = await Promise.all(Array.from({ length: N }, () => fakeLogin()));
const rushMs = performance.now() - t0;
running = false;
await pinger;
const during = pings.filter((p) => p.at >= t0 - 50);
out.rush = { logins: N, allDoneInMs: Math.round(rushMs), loginMs: rush.map((r) => Math.round(r.ms)), statuses: [...new Set(rush.map((r) => r.status))], pingsDuring: during.length, healthMedianDuring: Math.round(pct(during.map((p) => p.ms), 50)), healthSlowestDuring: Math.round(Math.max(...during.map((p) => p.ms))) };
console.log(`${N} logins at once: all done in ${out.rush.allDoneInMs} ms; login times ${out.rush.loginMs.join(', ')} ms`);
console.log(`"are you alive?" while they ran: median ${out.rush.healthMedianDuring} ms, slowest ${out.rush.healthSlowestDuring} ms (nobody logging in: median ${out.healthBaseline.median} ms)`);
const perLogin = rushMs / N;
out.estimate = { secondsPerLoginOnTheServer: +(perLogin / 1000).toFixed(2), a250LoginRushWouldTakeSeconds: Math.round((perLogin * 250) / 1000) };
console.log(`estimate: about ${out.estimate.secondsPerLoginOnTheServer} s of server time per login -> 250 logins at once = about ${out.estimate.a250LoginRushWouldTakeSeconds} s`);

// ----------------------------------------------------------------- 2) crash check
if (!process.argv.includes('--skip-ramp')) {
  out.stages = [];
  const STAGES = [{ users: 100, seconds: 12 }, { users: 250, seconds: 12 }, { users: 500, seconds: 12 }, { users: 1000, seconds: 12 }];
  for (const st of STAGES) {
    const rows = [];
    const until = performance.now() + st.seconds * 1000;
    await Promise.all(Array.from({ length: st.users }, (_, i) => sleep((i / st.users) * 1500).then(async () => { while (performance.now() < until) { rows.push(await hit(i % 3 === 0 ? '/api/auth/me' : '/api/health', { timeout: 15000 })); } })));
    const ok = rows.filter((r) => r.status >= 200 && r.status < 400 || r.status === 401);
    const limited = rows.filter((r) => r.status === 429);
    const failed = rows.filter((r) => r.status <= 0 || r.status >= 500);
    const lat = rows.filter((r) => r.status > 0).map((r) => r.ms);
    const row = { users: st.users, requests: rows.length, perSecond: +(rows.length / st.seconds).toFixed(0), ok: ok.length, tooMany429: limited.length, failed: failed.length, failedKinds: [...new Set(failed.map((f) => f.status))], p50: Math.round(pct(lat, 50)), p95: Math.round(pct(lat, 95)), p99: Math.round(pct(lat, 99)), max: Math.round(Math.max(...lat, 0)) };
    out.stages.push(row);
    console.log(`\n${st.users} simultaneous users, ${st.seconds}s: ${row.requests} requests (${row.perSecond}/s), ok ${row.ok}, 429 ${row.tooMany429}, FAILED ${row.failed} ${JSON.stringify(row.failedKinds)}, p50 ${row.p50} ms, p95 ${row.p95} ms, p99 ${row.p99} ms, slowest ${row.max} ms`);
    const errRate = row.failed / Math.max(1, row.requests);
    if (errRate > 0.05 || row.p95 > 10000) { out.stoppedBecause = `stopped after the ${st.users}-user stage: ${(errRate * 100).toFixed(1)}% failed, p95 ${row.p95} ms`; console.log('STOP: ' + out.stoppedBecause); break; }
    await sleep(3000);
  }
  // recovery
  await sleep(5000);
  const rec = [];
  for (let i = 0; i < 10; i++) { rec.push(await hit('/api/health')); await sleep(300); }
  out.recovery = { ok: rec.filter((r) => r.status === 200).length, of: rec.length, medianMs: Math.round(pct(rec.map((r) => r.ms), 50)), slowestMs: Math.round(Math.max(...rec.map((r) => r.ms))) };
  console.log('\nrecovery 5 s after the peak:', JSON.stringify(out.recovery));
}
out.finishedAt = new Date().toISOString();
writeFileSync(new URL('./live-crash-probe-result.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nsaved loadtest/live-crash-probe-result.json');
