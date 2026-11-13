// Opens the REAL site in a real (headless) Chrome, anonymous only, and measures what a visitor feels: how much is downloaded, how long until it
// shows and becomes usable, layout shifts, console errors and failed requests. Desktop and a mid-range phone on a "fast 4G" connection.
import puppeteer from '../marketing-video/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:/Mahmoud_Emad/TFQ_Project_v1/anees/marketing-video/.browsers/chrome/win64-157.0.8103.38/chrome-win64/chrome.exe';
const SITE = (process.argv[2] || 'https://anees-qa.site').replace(/\/+$/, '');
const PAGES = ['/', '/login', '/signup', '/welcome', '/privacy', '/this-page-does-not-exist'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const out = [];

for (const profile of [
  { name: 'desktop', viewport: { width: 1366, height: 800 }, net: null, cpu: 1 },
  { name: 'phone (fast 4G, 4x slower CPU)', viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }, net: { offline: false, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8, latency: 170 }, cpu: 4 },
]) {
  for (const path of PAGES) {
    const page = await browser.newPage();
    await page.setViewport(profile.viewport);
    const client = await page.createCDPSession();
    if (profile.net) await client.send('Network.emulateNetworkConditions', profile.net);
    if (profile.cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    await page.evaluateOnNewDocument(() => {
      sessionStorage.setItem('anees_intro_seen', '1');
      localStorage.setItem('anees_cookie', 'x');
      window.__cls = 0;
      window.__lcp = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__lcp = e.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    let bytes = 0;
    let requests = 0;
    const failed = [];
    const errors = [];
    page.on('response', async (r) => {
      requests++;
      const len = Number(r.headers()['content-length'] || 0);
      bytes += len;
      if (r.status() >= 400 && !path.includes('does-not-exist')) failed.push(`${r.status()} ${r.url().replace(SITE, '')}`.slice(0, 100));
    });
    page.on('requestfailed', (r) => failed.push(`FAILED ${r.url().replace(SITE, '')} ${r.failure()?.errorText ?? ''}`.slice(0, 100)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 120)));
    page.on('pageerror', (e) => errors.push('JS ERROR: ' + String(e.message).slice(0, 120)));
    const t0 = Date.now();
    try {
      await page.goto(SITE + path, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (e) {
      errors.push('load problem: ' + e.message.slice(0, 80));
    }
    await sleep(1500);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
      const res = performance.getEntriesByType('resource');
      return {
        ttfb: nav ? nav.responseStart : 0,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
        load: nav ? nav.loadEventEnd : 0,
        fcp: paint['first-contentful-paint'] || 0,
        lcp: window.__lcp,
        cls: window.__cls,
        transferKB: Math.round(res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024) + Math.round((nav?.transferSize || 0) / 1024),
        resources: res.length + 1,
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0,
        title: document.title,
      };
    });
    out.push({ profile: profile.name, path, wallMs: Date.now() - t0, ...m, failed: [...new Set(failed)].slice(0, 6), errors: [...new Set(errors)].slice(0, 4) });
    console.log(`${profile.name.padEnd(30)} ${path.padEnd(28)} fcp ${Math.round(m.fcp)}ms lcp ${Math.round(m.lcp)}ms load ${Math.round(m.load)}ms ${m.transferKB}KB ${m.resources} files cls ${m.cls.toFixed(3)} errors ${errors.length} failed ${failed.length}`);
    await page.close();
  }
}
await browser.close();
writeFileSync(new URL('./prod-browser-audit-result.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('saved loadtest/prod-browser-audit-result.json');
