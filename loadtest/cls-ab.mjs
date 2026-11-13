// A/B test of the font-preload fix on the REAL site, before it is deployed: for each page, a cold browser (a first-time visitor) opens it 3 times as it is,
// and 3 times with the preload script from frontend/index.html injected into the HTML on the way in. Prints the layout shift (CLS) of each run.
//   node loadtest/cls-ab.mjs welcome privacy        (DESKTOP=1 for a desktop window; otherwise a phone with a slow CPU and 4G)
import puppeteer from '../marketing-video/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { readFileSync } from 'node:fs';

const CHROME = 'C:/Mahmoud_Emad/TFQ_Project_v1/anees/marketing-video/.browsers/chrome/win64-157.0.8103.38/chrome-win64/chrome.exe';
const SITE = 'https://anees-qa.site';
const LANG = process.env.LANG_PREF || 'ar';
const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<!-- Set the language'), html.indexOf('<link rel="stylesheet" href="https://fonts.googleapis.com/css2'));
if (!script) throw new Error('preload script not found in frontend/index.html');
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['welcome', 'privacy'];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

async function run(path, mode) {
  const withFix = mode !== 'asis';
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(process.env.DESKTOP ? { width: 1366, height: 800 } : { width: 390, height: 844, isMobile: true, hasTouch: true });
  const client = await page.createCDPSession();
  if (!process.env.DESKTOP) {
    await client.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8, latency: 170 });
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.evaluateOnNewDocument((lang) => {
    sessionStorage.setItem('anees_intro_seen', '1');
    localStorage.setItem('anees_cookie', 'x');
    localStorage.setItem('anees_lang', lang);
    window.__cls = 0; window.__src = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) { window.__cls += e.value; window.__src.push(e.value.toFixed(3) + ' @' + Math.round(e.startTime) + ' ' + (e.sources || []).map((x) => (x.node && x.node.nodeName) + '.' + (x.node && x.node.className ? String(x.node.className).slice(0, 30) : '') + ' ' + Math.round(x.previousRect.y) + '>' + Math.round(x.currentRect.y) + ' h' + Math.round(x.previousRect.height) + '>' + Math.round(x.currentRect.height)).join(' ; ')); } })).observe({ type: 'layout-shift', buffered: true });
  }, LANG);
  if (withFix) {
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      if (req.resourceType() === 'document' && req.url().startsWith(SITE)) {
        const r = await fetch(req.url());
        let body = await r.text();
        if (mode === 'fix') body = body.replace('<link rel="stylesheet" href="https://fonts.googleapis.com', script + '\n<link rel="stylesheet" href="https://fonts.googleapis.com');
        
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
      } else req.continue();
    });
  }
  await page.goto(`${SITE}/${path}`, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1500));
  const cls = await page.evaluate(() => window.__cls);
  if (process.env.SOURCES && mode === 'fix' && cls > 0.02) console.log('   sources:', JSON.stringify(await page.evaluate(() => window.__src)));
  await ctx.close();
  return +cls.toFixed(3);
}

for (const path of paths) {
  const res = { asis: [], fix: [] };
  for (let i = 0; i < 3; i++) for (const m of Object.keys(res)) res[m].push(await run(path, m));
  console.log(`${path.padEnd(10)} as it is: ${res.asis.join(' ')}  | with the early language/theme script: ${res.fix.join(' ')}`);
}
await browser.close();
