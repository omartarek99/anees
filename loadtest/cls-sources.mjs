// Which element moves (layout shift) on the phone, anonymous, on the real site (or BASE=http://localhost:5190).   node loadtest/cls-sources.mjs /privacy /welcome
import puppeteer from '../marketing-video/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const CHROME = 'C:/Mahmoud_Emad/TFQ_Project_v1/anees/marketing-video/.browsers/chrome/win64-157.0.8103.38/chrome-win64/chrome.exe';
const SITE = (process.env.BASE || 'https://anees-qa.site').replace(/\/+$/, '');
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/privacy', '/welcome'];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
for (const path of paths) {
  const page = await browser.newPage();
  await page.setViewport(process.env.DESKTOP ? { width: 1366, height: 800 } : { width: 390, height: 844, isMobile: true, hasTouch: true });
  const client = await page.createCDPSession();
  if (!process.env.DESKTOP) await client.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8, latency: 170 });
  if (!process.env.DESKTOP) await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('anees_intro_seen', '1');
    localStorage.setItem('anees_cookie', 'x');
    window.__shifts = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => {
      if (e.hadRecentInput) return;
      window.__shifts.push({ value: +e.value.toFixed(3), at: Math.round(e.startTime), sources: (e.sources || []).map((s) => { const n = s.node; const r = s.previousRect, c = s.currentRect; return `${n ? n.nodeName : '?'}.${n && n.className ? String(n.className).slice(0, 50) : ''}  y ${Math.round(r.y)}->${Math.round(c.y)}  h ${Math.round(r.height)}->${Math.round(c.height)}`; }) });
    })).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(SITE + (path.startsWith('/') ? path : '/' + path), { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('\n' + path, JSON.stringify(await page.evaluate(() => window.__shifts), null, 1));
  await page.close();
}
await browser.close();
