// Login rush on the REAL server, with made-up usernames only (no real account is touched, nothing is written). A failed login does the same slow password
// check as a real one, so this is the true cost of a rush. While the logins run, "are you alive?" is asked every 300 ms to see whether everyone else waits.
//   node loadtest/live-login-rush.mjs [60 250]      (stages: how many logins at the same moment; each stage only starts if the server looked healthy)
// Keep the total under the per-address login limit (400 per 15 minutes).
import { writeFileSync } from 'node:fs';

const API = 'https://anees-01h6.onrender.com';
const UA = { 'User-Agent': 'anees-check/1.0', 'X-Requested-With': 'anees', 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };
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
const fakeLogin = () => hit('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: `nb_${Math.random().toString(36).slice(2, 12)}`, password: 'Wrong-Password-1!' }), timeout: 120000 });

const stages = (process.argv.slice(2).map(Number).filter(Boolean).length ? process.argv.slice(2).map(Number).filter(Boolean) : [60, 250]);
const out = { startedAt: new Date().toISOString(), stages: [] };
const base = [];
for (let i = 0; i < 8; i++) { base.push((await hit('/api/health')).ms); await sleep(150); }
out.healthBaseline = { median: Math.round(pct(base, 50)), p95: Math.round(pct(base, 95)) };
console.log('health, quiet:', JSON.stringify(out.healthBaseline));

for (const n of stages) {
  const pings = [];
  let running = true;
  const t0 = performance.now();
  const pinger = (async () => { while (running) { const s = performance.now(); const r = await hit('/api/health', { timeout: 20000 }); pings.push({ status: r.status, ms: r.ms }); await sleep(300); } })();
  const rush = await Promise.all(Array.from({ length: n }, () => fakeLogin()));
  const took = performance.now() - t0;
  running = false;
  await pinger;
  const count = (f) => rush.filter(f).length;
  const row = {
    logins: n, allDoneSeconds: +(took / 1000).toFixed(1),
    answered401: count((r) => r.status === 401), busy503: count((r) => r.status === 503), tooMany429: count((r) => r.status === 429),
    failedOrTimedOut: count((r) => r.status <= 0 || (r.status >= 500 && r.status !== 503)), other: count((r) => ![401, 503, 429].includes(r.status) && r.status > 0 && r.status < 500),
    loginMedianS: +(pct(rush.map((r) => r.ms), 50) / 1000).toFixed(1), loginP95S: +(pct(rush.map((r) => r.ms), 95) / 1000).toFixed(1), loginSlowestS: +(Math.max(...rush.map((r) => r.ms)) / 1000).toFixed(1),
    healthPings: pings.length, healthOk: pings.filter((p) => p.status === 200).length, healthMedianMs: Math.round(pct(pings.map((p) => p.ms), 50)), healthP95Ms: Math.round(pct(pings.map((p) => p.ms), 95)), healthSlowestMs: Math.round(Math.max(...pings.map((p) => p.ms), 0)),
  };
  out.stages.push(row);
  console.log(`\n${n} logins at the same moment:`, JSON.stringify(row, null, 1));
  const bad = row.failedOrTimedOut / n > 0.05 || row.healthOk < row.healthPings * 0.9;
  if (bad) { out.stoppedBecause = `stopped after ${n} logins: server looked unhealthy`; console.log('STOP: ' + out.stoppedBecause); break; }
  await sleep(8000);
}
await sleep(4000);
const rec = [];
for (let i = 0; i < 8; i++) { rec.push(await hit('/api/health')); await sleep(300); }
out.recovery = { ok: rec.filter((r) => r.status === 200).length, of: rec.length, medianMs: Math.round(pct(rec.map((r) => r.ms), 50)) };
console.log('\nrecovery:', JSON.stringify(out.recovery));
out.finishedAt = new Date().toISOString();
writeFileSync(new URL('./live-login-rush-result.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('saved loadtest/live-login-rush-result.json');
