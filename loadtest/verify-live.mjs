// Checks the REAL site, anonymously, with a handful of requests (nothing is written, nobody is logged in, no limit is pushed):
// headers, speed of one call, what a missing page / file / old address answers, and where the rate limit is counted.
import { writeFileSync } from 'node:fs';

const SITE = 'https://anees-qa.site';
const RENDER = 'https://anees-01h6.onrender.com';
const UA = { 'User-Agent': 'anees-check/1.0', 'X-Requested-With': 'anees' };
const out = {};
const pickHeaders = (res, names) => Object.fromEntries(names.map((n) => [n, res.headers.get(n)]).filter(([, v]) => v !== null));
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { min: Math.round(s[0]), median: Math.round(s[Math.floor(s.length / 2)]), p95: Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]), max: Math.round(s[s.length - 1]), avg: Math.round(s.reduce((x, y) => x + y, 0) / s.length) }; };
async function timed(url, opts = {}) { const t0 = performance.now(); const res = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, redirect: opts.redirect || 'follow' }); const body = await res.arrayBuffer(); return { res, ms: performance.now() - t0, bytes: body.byteLength, text: () => new TextDecoder().decode(body) }; }

// 1) where the rate limit is counted: three calls in a row, read the "remaining" counter. If other people share the counter it jumps by more than 1.
for (const [name, base] of [['site', SITE], ['render', RENDER]]) {
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const r = await timed(base + '/api/health');
    rows.push({ status: r.res.status, limit: r.res.headers.get('ratelimit-limit'), remaining: r.res.headers.get('ratelimit-remaining'), reset: r.res.headers.get('ratelimit-reset'), policy: r.res.headers.get('ratelimit-policy') });
  }
  out[`rateLimit_${name}`] = rows;
}

// 2) speed of one small call: 20 in a row, through the site (Vercel -> Render) and straight to Render
for (const [name, base] of [['site', SITE], ['render', RENDER]]) {
  const t = [];
  for (let i = 0; i < 20; i++) t.push((await timed(base + '/api/health')).ms);
  out[`latency_${name}`] = stats(t);
}
const h = await timed(RENDER + '/api/health');
out.renderHeaders = pickHeaders(h.res, ['server', 'x-render-origin-server', 'rndr-id', 'cf-ray', 'content-type', 'content-encoding', 'x-powered-by']);
const hs = await timed(SITE + '/api/health');
out.siteApiHeaders = pickHeaders(hs.res, ['server', 'cf-ray', 'x-vercel-id', 'x-vercel-cache', 'content-encoding', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy', 'permissions-policy']);

// 3) pages, files, old addresses
const home = await timed(SITE + '/');
out.homeHeaders = pickHeaders(home.res, ['server', 'x-vercel-cache', 'cache-control', 'content-encoding', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy', 'permissions-policy', 'age']);
out.homeBytes = home.bytes;
const js = (home.text().match(/\/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0];
if (js) { const a = await timed(SITE + js, { headers: { 'Accept-Encoding': 'br, gzip' } }); out.mainScript = { path: js, status: a.res.status, bytesDownloaded: a.bytes, ms: Math.round(a.ms), ...pickHeaders(a.res, ['content-encoding', 'cache-control', 'content-length']) }; }
const missingAsset = await timed(SITE + '/assets/this-file-does-not-exist-123.js');
out.missingAsset = { status: missingAsset.res.status, contentType: missingAsset.res.headers.get('content-type'), startsWith: missingAsset.text().slice(0, 40) };
const missingPage = await timed(SITE + '/this-page-does-not-exist');
out.missingPage = { status: missingPage.res.status, contentType: missingPage.res.headers.get('content-type') };
const news = await timed(SITE + '/api/news');
out.apiNews = { status: news.res.status, body: news.text().slice(0, 80) };
const httpRedirect = await fetch('http://anees-qa.site/', { redirect: 'manual', headers: UA });
out.httpToHttps = { status: httpRedirect.status, location: httpRedirect.headers.get('location') };

// 4) protected calls answer clearly when nobody is logged in
for (const p of ['/api/auth/me', '/api/reels/feed', '/api/admin/users', '/api/users/me']) {
  const r = await timed(SITE + p);
  out[`anonymous ${p}`] = { status: r.res.status, body: r.text().slice(0, 90) };
}
out.checkedAt = new Date().toISOString();
writeFileSync(new URL('./live-checks-anonymous.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
