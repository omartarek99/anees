// Visitor traffic against the REAL site, ramping up to 250 people at the same time. Read-only and anonymous:
//   - the page itself and the files a first-time visitor downloads (HTML, scripts, styles)
//   - the two API calls every visitor's browser makes before anyone logs in (health, "who am I" -> 401)
// It never logs in, never creates an account and never writes anything: sign-up sends real emails and uses the Firebase / Resend quotas,
// and real passwords must not be typed by a script. The logged-in flows are measured on a local copy (full-250.js).
//
// Safety: stages ramp 10 -> 50 -> 100 -> 250 -> 500 -> 1000 visitors, and the whole run stops by itself if a stage fails too much.
//   node loadtest/prod-visitors.mjs [https://anees-qa.site]
import { writeFileSync } from 'node:fs';

const SITE = (process.argv[2] || 'https://anees-qa.site').replace(/\/+$/, '');
const STAGES = [
  { visitors: 10, seconds: 15 },
  { visitors: 50, seconds: 20 },
  { visitors: 100, seconds: 20 },
  { visitors: 250, seconds: 30 },
  { visitors: 500, seconds: 30 },
  { visitors: 1000, seconds: 30 },
];
const ABORT_ERROR_RATE = 0.25; // stop the run when more than 25% of a stage's requests fail (5xx / no answer)
const ABORT_P95_MS = 20000;
const TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0);

/** One timed request. kind: html | asset | api */
async function hit(kind, path, stats) {
  const t0 = performance.now();
  let status = 0;
  let bytes = 0;
  try {
    const res = await fetch(SITE + path, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'X-Requested-With': 'anees', 'User-Agent': 'anees-loadtest/1.0' } });
    status = res.status;
    bytes = (await res.arrayBuffer()).byteLength;
  } catch (e) {
    status = e.name === 'TimeoutError' ? -2 : -1; // -2 timeout, -1 network error
  }
  const ms = performance.now() - t0;
  stats.push({ kind, path, status, ms, bytes });
}

async function visitor(stats, until, assets) {
  while (performance.now() < until) {
    // a first-time visitor: the page, then its files (the browser asks for them at the same time), then the API calls the app makes at start-up
    await hit('html', '/', stats);
    await Promise.all(assets.map((a) => hit('asset', a, stats)));
    await hit('api', '/api/health', stats);
    await hit('api', '/api/auth/me', stats);
    await sleep(1500 + Math.random() * 2500); // reading the page
  }
}

function summarize(stats) {
  const byKind = {};
  for (const kind of ['html', 'asset', 'api']) {
    const rows = stats.filter((s) => s.kind === kind);
    const ok = rows.filter((s) => s.status >= 200 && s.status < 400);
    const limited = rows.filter((s) => s.status === 429);
    const unauth = rows.filter((s) => s.status === 401); // expected for /api/auth/me when not logged in
    const failed = rows.filter((s) => s.status <= 0 || s.status >= 500);
    const lat = rows.filter((s) => s.status > 0).map((s) => s.ms).sort((a, b) => a - b);
    byKind[kind] = {
      requests: rows.length,
      ok: ok.length,
      unauthorized_expected: unauth.length,
      rate_limited_429: limited.length,
      failed_5xx_or_timeout: failed.length,
      p50_ms: Math.round(pct(lat, 50)),
      p95_ms: Math.round(pct(lat, 95)),
      p99_ms: Math.round(pct(lat, 99)),
      max_ms: Math.round(lat[lat.length - 1] || 0),
    };
  }
  const all = stats.length;
  const failed = stats.filter((s) => s.status <= 0 || s.status >= 500).length;
  return { byKind, requests: all, failed, errorRate: all ? failed / all : 0, bytes: stats.reduce((a, s) => a + s.bytes, 0) };
}

console.log(`Target: ${SITE}`);
// 1) the page and its files, as a browser would see them
const probe = [];
await hit('html', '/', probe);
const html = await (await fetch(SITE + '/')).text();
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
console.log(`Files per first visit: ${assets.length} (${assets.join(', ')})`);

// 2) one visitor, a few times in a row: the speed when nobody else is there (and whether the backend is asleep)
const baseline = [];
for (let i = 0; i < 8; i++) {
  await hit('html', '/', baseline);
  await hit('api', '/api/health', baseline);
  await hit('api', '/api/auth/me', baseline);
  await sleep(400);
}
const base = summarize(baseline);
console.log('Baseline (1 visitor):', JSON.stringify(base.byKind));

// 3) the ramp
const result = { site: SITE, startedAt: new Date().toISOString(), baseline: base, stages: [], aborted: null };
for (const stage of STAGES) {
  const stats = [];
  const t0 = performance.now();
  const until = t0 + stage.seconds * 1000;
  await Promise.all(Array.from({ length: stage.visitors }, (_, i) => sleep((i / stage.visitors) * 3000).then(() => visitor(stats, until, assets))));
  const sum = summarize(stats);
  const elapsed = (performance.now() - t0) / 1000;
  const row = { visitors: stage.visitors, seconds: Math.round(elapsed), requestsPerSecond: +(sum.requests / elapsed).toFixed(1), megabytes: +(sum.bytes / 1e6).toFixed(1), ...sum };
  result.stages.push(row);
  console.log(`\n== ${stage.visitors} visitors for ${Math.round(elapsed)} s: ${sum.requests} requests (${row.requestsPerSecond}/s), ${(sum.errorRate * 100).toFixed(1)}% failed`);
  for (const k of ['html', 'asset', 'api']) console.log(`   ${k.padEnd(5)} ${JSON.stringify(sum.byKind[k])}`);
  const worstP95 = Math.max(sum.byKind.html.p95_ms, sum.byKind.asset.p95_ms);
  if (sum.errorRate > ABORT_ERROR_RATE || worstP95 > ABORT_P95_MS) {
    result.aborted = `stopped after the ${stage.visitors}-visitor stage: ${(sum.errorRate * 100).toFixed(0)}% failed, slowest page p95 ${worstP95} ms`;
    console.log('ABORT: ' + result.aborted);
    break;
  }
  await sleep(4000); // a breather between stages, so the next one starts from a calm site
}

// 4) does it recover? one visitor again, 5 seconds after the peak
await sleep(5000);
const after = [];
for (let i = 0; i < 6; i++) {
  await hit('html', '/', after);
  await hit('api', '/api/health', after);
  await sleep(400);
}
result.afterPeak = summarize(after);
console.log('\nAfter the peak (1 visitor):', JSON.stringify(result.afterPeak.byKind));
result.finishedAt = new Date().toISOString();
writeFileSync(new URL('./prod-visitors-result.json', import.meta.url), JSON.stringify(result, null, 2));
console.log('\nSaved loadtest/prod-visitors-result.json');
