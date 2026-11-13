// Frame by frame during page load on the real site (desktop): when does the first heading / first section / page width change, and what is different?   node loadtest/cls-trace.mjs privacy
import puppeteer from '../marketing-video/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const CHROME = 'C:/Mahmoud_Emad/TFQ_Project_v1/anees/marketing-video/.browsers/chrome/win64-157.0.8103.38/chrome-win64/chrome.exe';
const SITE = (process.env.BASE || 'https://anees-qa.site').replace(/\/+$/, '');
const path = process.argv[2] || 'privacy';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1366, height: 800 });
await page.evaluateOnNewDocument(() => {
  sessionStorage.setItem('anees_intro_seen', '1');
  localStorage.setItem('anees_cookie', 'x');
  localStorage.setItem('anees_lang', 'ar');
  window.__trace = [];
  let last = '';
  const snap = () => {
    const h1 = document.querySelector('h1');
    const sec = document.querySelector('section, .card');
    const r = (e) => (e ? (({ x, y, width, height }) => [x, y, width, height].map((n) => Math.round(n * 10) / 10).join(','))(e.getBoundingClientRect()) : '-');
    const cs = h1 ? getComputedStyle(h1) : null;
    const s = JSON.stringify({ w: document.documentElement.clientWidth, sw: window.innerWidth, h1: r(h1), h1font: cs ? cs.fontFamily.slice(0, 30) + ' ' + cs.fontSize : '-', sec: r(sec), fonts: [...document.fonts].filter((f) => f.status === 'loaded').length, dir: document.documentElement.dir, theme: document.documentElement.dataset.theme || '', body: document.body ? document.body.className : '' });
    if (s !== last) { window.__trace.push([Math.round(performance.now()), s]); last = s; }
  };
  const tick = () => { snap(); if (performance.now() < 1500) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
await page.goto(`${SITE}/${path}`, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));
for (const [t, s] of await page.evaluate(() => window.__trace)) console.log(t, s);
await browser.close();
