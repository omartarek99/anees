// Builds docs/live-findings-report.xlsx: what the checks on the real site (13 Nov, after the deploy) found. node loadtest/make-live-findings.cjs
const ExcelJS = require('../backend/node_modules/exceljs');
const path = require('path');

const rows = [
  // [severity, area, finding, evidence, why it matters, fix, who]
  ['High', 'Login speed', 'A password login costs about 2.3 s of server time, so a login rush is very slow',
    '60 logins at once took 120 s (median wait 71 s, 7 of 60 timed out). One login alone: 2.3-2.8 s. Estimate for 250 at once: about 9 minutes.',
    'The rest of the site stayed up (159 of 159 "are you alive?" answered, median 362 ms), so it does not crash, but people in a rush wait minutes. Mostly affects accounts that use the site\'s own password check (admin, test, maybe teachers); students sign in through Firebase.',
    'A paid Render plan (more CPU) is the real fix. Or move teachers to Firebase sign-in too. The code already queues password checks two at a time so the site does not freeze.', 'You (Render plan) / Claude'],
  ['Medium', 'Server settings', 'The rate limit on the live API is still 20000 per minute',
    'Response header RateLimit-Limit: 20000 on the API. The new code is live (the 11th failed login for one username got "too many attempts").',
    '20000 per minute means the limit does not protect anything. The new default is 300 per minute.',
    'Render > the backend service > Environment > delete API_RATE_LIMIT_PER_MIN > Save.', 'You'],
  ['Medium', 'Background calls', 'Every logged-in student\'s browser keeps asking the server in the background',
    'Challenge check every 6 s, double-points check every 15 s, points notices every 60 s, admin messages every 60 s (reels also report watch time every 10 s). About 0.27 calls per second per student doing nothing; 250 students online = about 65 calls per second.',
    'On the free Render plan this is steady load even when nobody is doing anything, and it competes with logins.',
    'Check for challenges every 15 s (every 2 s only while a challenge is going on) and double-points every 60 s. Needs a code change (ChallengeHost.tsx, DoublePointsNotification.tsx).', 'Claude (say "do it")'],
  ['Low', 'Console', 'Red 401 error in the browser console on every page for visitors who are not logged in',
    'Audit of 6 pages on desktop and phone: every page shows exactly one error, "401 /api/auth/me". Nothing else.',
    'It is expected (the page asks "who am I?" and the answer is "nobody"), nothing is broken, but it looks like an error to anyone who opens the console.',
    'Make /api/auth/me answer 200 with no user instead of 401. Small change, touches how the app decides logged in or out, so it needs a careful test.', 'Claude (optional)'],
  ['Low', 'Console', 'One 502 error was seen once while moving between pages',
    'Browser console of the logged-in session: one "502" among the 401s. Every request in the last 200 calls was 200 (logged-in pages: home, map, worksheets, leaderboard).',
    'A 502 is the host answering while the server restarts or is busy. It matches the deploy / the login rush running at that time. Not repeated.',
    'Watch it. If it shows again outside a deploy, check the Render logs for that time.', 'Watch'],
  ['Low', 'Console', 'Three.js warning: THREE.Clock is deprecated',
    'Console warning on the map page.', 'Only a warning, no effect today. It will matter when the library is upgraded.', 'Replace THREE.Clock with THREE.Timer when upgrading three.', 'Later'],
  ['Low', 'Phone speed', 'The phone shows layout jumps on two pages and a slow main picture on the home page',
    'Phone on fast 4G with a 4x slower CPU: /welcome layout shift 0.07, /privacy 0.32 (good is under 0.1); / shows its main content after 2.8 s.',
    'Text or pictures moving after they appear. Mostly the privacy page.', 'Give the late-loading parts a fixed height; look at the first picture on /.', 'Claude (say "do it")'],
  ['Info', 'Visitors', 'Visitors: 250 people at once are served without any failure',
    '15,281 requests in 35 s (442 per second): 0 failed, page 67 ms median, files 22 ms, API 278 ms; back to normal straight after.', 'Good: opening the site is not the problem.', 'None.', '-'],
  ['Info', 'Fixes confirmed', 'Security headers are live on pages; missing files give a real 404; per-username login limit works',
    'Headers: HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy. /assets/nope.js and /icons/nope.png: 404 text. 11th failed login: 429.', 'These were open findings in the first report.', 'None.', '-'],
  ['Info', 'Entrance + reels', 'Entrance animation and reels are fast on the real site',
    'Reels: next video playing 106-161 ms after a swipe, frames about 7 ms. Videos are 720p and fully buffered. The laptop-trackpad fix is pushed but needs the Vercel deploy.', 'Smooth on a fast computer; test on your phone and trackpad after the deploy.', 'Run npx vercel --prod from the frontend folder.', 'You'],
  ['Not run', 'Login rush 250', 'A 250-login rush was not run', 'Stopped at 60 on purpose: 250 would pass the queue limit (200 waiting) and could block the test address for 15 minutes.',
    'The number above (about 9 minutes) is an estimate from the 60-login run.', 'After a Render plan upgrade, repeat with: node loadtest/live-login-rush.mjs 60 250', 'After upgrade'],
];

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Findings 13 Nov', { views: [{ state: 'frozen', ySplit: 4 }] });
  const widths = [4, 9, 16, 38, 52, 46, 46, 16];
  ws.columns = widths.map((w) => ({ width: w }));
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'Anees real site: issues and bugs found (checked 13 Nov 2026, after the deploy)';
  ws.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A1432' } };
  ws.getRow(1).height = 30;
  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = 'Checks used no real account and wrote nothing: made-up usernames for the login rush, anonymous visitors, and a read-only look at the logged-in pages. 0 server crashes were seen.';
  ws.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  ws.getRow(2).height = 34;
  const head = ['#', 'Severity', 'Area', 'What was found', 'Evidence', 'Why it matters', 'How to fix', 'Who'];
  head.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.getRow(4).height = 24;
  const colour = { High: ['FFFDE2E2', 'FF9B1C1C'], Medium: ['FFFFF1D6', 'FF8A5A00'], Low: ['FFFFF9DB', 'FF6B5B00'], Info: ['FFE3F5E8', 'FF1E6B3A'], 'Not run': ['FFE8E8EE', 'FF444455'] };
  rows.forEach((r, i) => {
    const rowNo = 5 + i;
    const vals = [i + 1, ...r];
    vals.forEach((v, j) => {
      const c = ws.getCell(rowNo, j + 1);
      c.value = v;
      c.alignment = { vertical: 'top', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
    });
    const [bg, fg] = colour[r[0]];
    const sev = ws.getCell(rowNo, 2);
    sev.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    sev.font = { bold: true, color: { argb: fg } };
    sev.alignment = { vertical: 'top', horizontal: 'center' };
    const lines = Math.max(...vals.map((v, j) => Math.ceil(String(v).length / (widths[j] * 1.05))));
    ws.getRow(rowNo).height = Math.min(409, Math.max(30, lines * 15 + 8));
  });
  ws.getCell('A' + (6 + rows.length)).value = 'Reports with all checks: docs/checks-report.xlsx, docs/bug-report.xlsx, docs/real-site-report.xlsx. Raw results: loadtest/*-result.json.';
  const out = path.join(__dirname, '..', 'docs', 'live-findings-report.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('saved', out);
})();
