// Builds docs/old-vs-new-report.xlsx: the first report (13 Nov, before the deploy) next to what the real site shows now, for the checks and the bugs, plus the new stress numbers (to 1000).
//   node loadtest/make-old-vs-new.cjs
const ExcelJS = require('../backend/node_modules/exceljs');
const path = require('path');
const fs = require('fs');

const J = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const vis = J('prod-visitors-result.json');
const crash = J('live-crash-probe-result.json');
const stu = J('live-student-login-result.json');
const audit = J('prod-browser-audit-result.json');
const live = J('live-checks-anonymous.json');
const ms = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + ' s' : Math.round(n) + ' ms');
const num = (n) => Number(n).toLocaleString('en-US');
const V = (users) => vis.stages.find((s) => s.visitors === users);
const pageP = (s) => s.byKind.html;
const avgStu = (stu.oneAtATime.reduce((a, b) => a + b.ms, 0) / stu.oneAtATime.length / 1000).toFixed(2);
const avg4 = (stu.fourAtOnce.reduce((a, b) => a + b.ms, 0) / stu.fourAtOnce.length / 1000).toFixed(2);
const A = (profile, p) => audit.find((a) => a.profile.startsWith(profile) && a.path === p) || { load: 0, transferKB: 0, fcp: 0, cls: 0 };
const crashRow = (u) => crash.stages.find((s) => s.users === u);

const C = { maroon: 'FF7A1432', dark: 'FF2B2B33', white: 'FFFFFFFF', green: ['FFE3F5E8', 'FF1E6B3A'], red: ['FFFDE2E2', 'FF9B1C1C'], amber: ['FFFFF1D6', 'FF8A5A00'], blue: ['FFE3EEFB', 'FF1F4E8C'], grey: ['FFE8E8EE', 'FF444455'] };
const tone = {'CHANGED BACK': C.grey, LIVE: C.green, DONE: C.green,  BETTER: C.green, FIXED: C.green, SAME: C.grey, 'STILL OPEN': C.red, WORSE: C.red, NEW: C.blue, 'NOT RE-CHECKED': C.grey, 'NEEDS YOU': C.amber, 'FIXED IN CODE': C.amber, INFO: C.blue, PASS: C.green, PROBLEM: C.red, NOTE: C.grey };

function sheet(wb, name, title, sub, headers, widths, rows, toneCol) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.columns = widths.map((w) => ({ width: w }));
  const last = String.fromCharCode(64 + headers.length);
  ws.mergeCells(`A1:${last}1`);
  Object.assign(ws.getCell('A1'), { value: title });
  ws.getCell('A1').font = { size: 16, bold: true, color: { argb: C.white } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.maroon } };
  ws.getRow(1).height = 30;
  ws.mergeCells(`A2:${last}2`);
  ws.getCell('A2').value = sub;
  ws.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  ws.getRow(2).height = 36;
  headers.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: C.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.getRow(4).height = 24;
  rows.forEach((r, i) => {
    const rowNo = 5 + i;
    r.forEach((v, j) => {
      const c = ws.getCell(rowNo, j + 1);
      c.value = v;
      c.alignment = { vertical: 'top', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
    });
    if (toneCol !== undefined) {
      for (const col of [].concat(toneCol)) {
        const t = tone[String(r[col]).replace(/ ✔/, '').trim()];
        if (t) {
          const c = ws.getCell(rowNo, col + 1);
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: t[0] } };
          c.font = { bold: true, color: { argb: t[1] } };
          c.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
        }
      }
    }
    const lines = Math.max(...r.map((v, j) => Math.ceil(String(v ?? '').length / (widths[j] * 1.05))));
    ws.getRow(rowNo).height = Math.min(409, Math.max(22, lines * 15 + 8));
  });
  return ws;
}

// ---------------------------------------------------------------- checks: [#, area, check, old, new, change]
const hdrOk = live.homeHeaders && live.homeHeaders['x-frame-options'];
const checks = [
  [1, 'The real site', 'http redirects to https', 'PASS: 308 to https', 'PASS: 308 to https', 'SAME'],
  [2, 'The real site', 'Home page: size, speed, caching', 'PASS: 7.8 KB, CDN HIT, 68 ms under 250 visitors', `PASS: 7.8 KB, CDN HIT, ${pageP(V(250)).p50_ms} ms under 250 visitors, ${pageP(V(1000)).p50_ms} ms under 1,000`, 'SAME'],
  [3, 'The real site', 'Main script: compression and caching', 'PASS: Brotli, cached a year, 57 ms', 'PASS: Brotli, cached a year, 117 ms (one download)', 'SAME'],
  [4, 'The real site', 'Security headers on the API', 'PASS', 'PASS', 'SAME'],
  [5, 'The real site', 'Security headers on the website pages', 'PROBLEM: no X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy', hdrOk ? 'PASS: all four now sent, plus HSTS' : 'PROBLEM', 'FIXED'],
  [6, 'The real site', 'A missing file answers "not found"', 'PROBLEM: 200 and the home page', 'PASS: /assets/… and /icons/… answer 404', 'FIXED'],
  [7, 'The real site', 'An unknown page', 'NOTE: 200 and the app (normal)', 'NOTE: same', 'SAME'],
  [8, 'The real site', 'Protected calls without a login', 'PASS: four calls answer 401', 'PASS: four calls answer 401', 'SAME'],
  [9, 'The real site', 'A page that does not exist in the API', 'NOTE: 404', 'NOTE: 404', 'SAME'],
  [10, 'The real site', 'Speed of one small API call', 'PROBLEM: median 234 ms straight to the server', `PROBLEM: median ${crash.healthBaseline.median} ms (the server is far from Qatar)`, 'SAME'],
  [11, 'The real site', 'Where the rate limit is counted', 'PROBLEM: the counter is not per person', 'PROBLEM: counter still 19,998-19,999 (limit still 20,000)', 'SAME'],
  [12, 'The real site', 'The value of the API limit', 'PROBLEM: 20,000 per minute', 'PROBLEM: still 20,000 (the setting is still on; it must stay on until the 1,000 test is done, then be deleted)', 'STILL OPEN'],
  [13, 'The real site', 'E-mail, Firebase and file storage', 'PASS', 'NOT RE-CHECKED (needs the admin login)', 'NOT RE-CHECKED'],
  [14, 'The real site', 'Landing page in a browser', 'PASS: 1.37 s, 401 KB', `PASS: ${Math.round(A('desktop', '/').load)} ms load on desktop, ${A('desktop', '/').transferKB} KB, first content ${Math.round(A('desktop', '/').fcp)} ms; phone (4G, slow CPU) ${Math.round(A('phone', '/').load)} ms`, 'SAME'],
  [15, 'The real site', 'Privacy and Terms pages', 'PASS: 0.1 s', `PASS: ${Math.round(A('desktop', '/privacy').load)} ms on desktop`, 'SAME'],
  [16, 'The real site', 'Admin dashboard start-up calls', 'PROBLEM: 7 calls of 290-404 ms', 'NOT RE-CHECKED (needs the admin login)', 'NOT RE-CHECKED'],
  [17, 'The real site', 'Page-view counter', 'NOTE: marked aborted but answers 204', 'NOTE: same', 'SAME'],
  [18, 'The real site', 'A health call on every page load', 'NOTE', 'NOTE: same', 'SAME'],
  [19, 'The real site', 'Browser warning on the landing page', 'PROBLEM: WebGL shader warning', 'NOT RE-CHECKED', 'NOT RE-CHECKED'],
  [20, 'The real site', 'Duplicate lessons (ids 89 and 90)', 'PROBLEM', 'NOT RE-CHECKED (admin login)', 'NOT RE-CHECKED'],
  [21, 'The real site', 'Lessons without a video', 'PROBLEM: 4 test lessons', 'NOT RE-CHECKED (admin login)', 'NOT RE-CHECKED'],
  [22, 'The real site', 'Test accounts in production', 'PROBLEM: dev_student, dev_teacher active', 'NOT RE-CHECKED (admin login)', 'NOT RE-CHECKED'],
  [23, 'The real site', 'Visits to missing pages', 'PROBLEM: 8% of views', 'NOT RE-CHECKED (admin login)', 'NOT RE-CHECKED'],
  [24, 'The real site', 'Where points come from', 'PROBLEM', 'NOT RE-CHECKED (admin login)', 'NOT RE-CHECKED'],
  [25, 'The real site', 'The test student on the leaderboard', 'PROBLEM: 10,556 points, #1', 'PROBLEM: still there, and the 300-student test added more points (take them back)', 'STILL OPEN'],
  [26, 'The real site', 'Leftover test lessons ("LT temp")', 'PROBLEM: 4 left', 'NOT RE-CHECKED (admin login)', 'NOT RE-CHECKED'],
  [27, 'Needs a login', 'A quiz can be repeated for points', 'NOT CHECKABLE', 'NOT CHECKED directly (the fix is in the same release as the verified limits)', 'NOT RE-CHECKED'],
  [28, 'Needs a login', 'A login rush slows other pages', 'NOT CHECKABLE', `PASS (partly): 6 and 60 logins at once did not freeze the site. "Are you alive?" answered ${'159 of 159'} times; median 362 ms (quiet: 255 ms)`, 'BETTER'],
  [29, 'Needs a login', 'Creating a lesson with no question', 'NOT CHECKABLE', 'NOT CHECKED (it would write a lesson)', 'NOT RE-CHECKED'],
  [30, 'Real server', 'Cost of a login (local-password accounts)', 'PROBLEM: 2.3 s each, 6 at once = 14 s', `PROBLEM: 2.3-2.5 s each, 6 at once = ${(crash.rush.allDoneInMs / 1000).toFixed(1)} s, 60 at once = 120 s (7 timed out). The site stays up.`, 'SAME'],
  [31, 'Real server', 'Crash test 100 / 250 / 500 users on the API', 'PASS: p95 0.8 / 1.3 / 2.6 s', `PASS: p95 ${ms(crashRow(100).p95)} / ${ms(crashRow(250).p95)} / ${ms(crashRow(500).p95)}; 0 failures`, 'BETTER'],
  [32, 'Real server', 'Crash test 1,000 users on the API', 'PROBLEM: 15 of 5,238 failed (502 and timeouts), p95 13 s', `PROBLEM (smaller): 0 of ${num(crashRow(1000).requests)} failed, but p95 ${ms(crashRow(1000).p95)} (slowest ${ms(crashRow(1000).max)})`, 'BETTER'],
  [33, 'Real server', 'Recovery after the peak', 'PASS: median 305 ms', `PASS: ${crash.recovery.ok} of ${crash.recovery.of} answered, median ${crash.recovery.medianMs} ms`, 'SAME'],
  [34, 'Load test', '250 visitors at once on the real website', 'PASS: 15,211 requests, 0 failed, pages median 68 ms, p95 232 ms', `PASS: ${num(V(250).requests)} requests, 0 failed, pages median ${pageP(V(250)).p50_ms} ms, p95 ${pageP(V(250)).p95_ms} ms`, 'SAME'],
  [35, 'Load test', '12 users logged in on the real server', 'PASS', 'NOT RE-RUN', 'NOT RE-CHECKED'],
  [36, 'Load test', '250 users logged in on the real server (shared login)', 'PROBLEM: 27,606 requests, 0 server errors, median 1.3 s, p95 4.5 s', 'PROBLEM: 300 students at once: 17,151 requests, 0 server errors, average 2.4 s, median 2.0 s, p95 5.1 s, slowest 6.4 s (a harsher test: 300 users, all active)', 'SAME'],
  [37, 'Load test', '250 users on a local copy (before the fixes)', 'PROBLEM', 'NOT RE-RUN (the code is the same as after the fixes, plus the small changes made today)', 'NOT RE-CHECKED'],
  [38, 'Load test', '250 users on a local copy (after the fixes)', 'PASS', 'NOT RE-RUN', 'NOT RE-CHECKED'],
  [39, 'New today', '500 visitors at once on the real website', '-', `PASS: ${num(V(500).requests)} requests (${V(500).requestsPerSecond}/s), 0 failed, pages median ${pageP(V(500)).p50_ms} ms, p95 ${pageP(V(500)).p95_ms} ms`, 'NEW'],
  [40, 'New today', '1,000 visitors at once on the real website', '-', `PASS (slower): ${num(V(1000).requests)} requests (${V(1000).requestsPerSecond}/s), 0 failed, pages median ${pageP(V(1000)).p50_ms} ms, p95 ${pageP(V(1000)).p95_ms} ms, files p95 ${ms(V(1000).byKind.asset.p95_ms)} (the test computer also limits this)`, 'NEW'],
  [41, 'New today', 'How fast is a real student (Firebase) login?', '-', `PASS: ${avgStu} s alone, ${avg4} s with 4 at once (9 logins, all answered 200)`, 'NEW'],
  [42, 'New today', 'Console errors when logged out', 'PROBLEM: one 401 /api/auth/me on every page (6 pages, desktop and phone)', `PASS: ${audit.reduce((a, x) => a + x.errors.length, 0)} errors and ${audit.reduce((a, x) => a + x.failed.length, 0)} failed requests on all ${audit.length} page runs (fixed by /api/auth/session)`, 'FIXED'],
  [43, 'New today', 'Console errors when logged in', '-', 'PASS: home, map, worksheets, leaderboard load with no failed calls; one 502 seen once during the deploy window', 'NEW'],
  [45, 'New today', '1,000 students logged in on the real server (shared login)', '-', 'PASS with a warning: no crash; 166 of 217,722 calls (0.08%) got no answer or a server error; of the calls really served, p95 21.6 s. 80% were fast 429 answers from the shared rate limit (see N10).', 'NEW'],
  [44, 'New today', 'Page layout jumps (CLS)', 'PROBLEM: /welcome 0.287, /privacy 0.202 on desktop; /privacy 0.217 on the phone (good is under 0.1)', `PASS: all ${audit.length} page runs are now ${Math.max(...audit.map((a) => a.cls)).toFixed(3)} or less (good is under 0.1). Cause found and fixed: the page was first drawn in English, left-to-right and without a theme, then switched to Arabic, right-to-left and dark about 100 ms later, so every line moved.`, 'FIXED'],
];

// ---------------------------------------------------------------- bugs: [#, severity, problem, old status, new status, what changed]
const bugs = [
  [1, 'High', 'Repeating a quiz or worksheet pays points again and again', 'FIXED', 'FIXED', 'Live with the same release as the verified limits. Not re-tested directly on the real site.'],
  [2, 'High', 'A whole school can be locked out; limits do not see the visitor', 'FIXED', 'FIXED', 'Verified live today: the 11th failed login for one username got "too many attempts" (429).'],
  [3, 'Medium', 'A login rush made every other page wait 5 to 50 seconds', 'FIXED', 'FIXED', 'Verified: 60 logins at once took 2 minutes for those logins, but "are you alive?" still answered 159 of 159 (median 362 ms). Other pages are not frozen. Logins themselves stay slow (see issue N1).'],
  [4, 'Medium', 'Lessons without a video are sent to students', 'FIXED', 'FIXED', 'In the code and live. The 4 test lessons still need deleting by you (bug 12).'],
  [5, 'Medium', 'Every call takes 230-310 ms before it does any work', 'NEEDS YOU', 'NEEDS YOU', `Unchanged: health median ${crash.healthBaseline.median} ms. Check the Render region (near Qatar).`],
  [6, 'Low', 'The lessons list has no paging', 'NEEDS YOU', 'NEEDS YOU', 'Planned. Not an issue at the current number of lessons.'],
  [7, 'Low', 'The old load-test script asked for a page that no longer exists', 'FIXED', 'FIXED', '-'],
  [8, 'Low', 'A lesson with no question could still be created', 'FIXED', 'FIXED', '-'],
  [9, 'Low', 'Duplicated lesson, test accounts in the real list, visits to missing pages', 'NEEDS YOU', 'NEEDS YOU', 'Not re-checked (needs the admin login).'],
  [10, 'High', 'The free server slows to 2-5 seconds per click with 250 users', 'NEEDS YOU', 'NEEDS YOU', `Same picture with 300 students: average 2.4 s, p95 5.1 s, 0 errors. At 1,000 users on the API: 0 failures (before: 502 and timeouts) but p95 ${ms(crashRow(1000).p95)}. Fix: a paid Render plan.`],
  [11, 'High', 'The real server still allows 20,000 API calls per minute', 'NEEDS YOU', 'STILL OPEN', 'Still 20,000. Delete API_RATE_LIMIT_PER_MIN on Render after the 1,000 test.'],
  [12, 'Medium', 'The load test left data on the real site', 'NEEDS YOU', 'STILL OPEN', 'The 300-student test added more points to Test_Student (2,730 watch calls, 1,022 quiz submits). Remove them in Admin > Users.'],
  [13, 'Low', 'The website pages do not send security headers', 'FIXED', 'FIXED', 'Verified live today.'],
  [14, 'Low', 'A missing file answers 200 with the home page', 'FIXED', 'FIXED', 'Verified live today (404).'],
  [15, 'Low', 'A browser warning on the landing page; an extra call on every page', 'PLANNED', 'NEEDS YOU', 'Not changed. Low value.'],
];
bugs.forEach((b) => { b[3] = b[3] === 'FIXED' ? 'FIXED' : b[3]; });

// ---------------------------------------------------------------- new issues: [#, severity, issue, evidence, status, what was done / to do]
const issues = [
  ['N1', 'High', 'Logins of local-password accounts (admin, test) are slow: 2.3 s each, minutes in a rush', '60 at once = 120 s, 7 timed out; 250 would be about 9 minutes. Students use Firebase and are not affected.', 'NEEDS YOU', 'A paid Render plan (about 5 times the CPU) is the fix. The password cost stays 12 (you chose that).'],
  ['N2', 'Medium', 'Every logged-in browser asks the server in the background (challenges every 6 s, double points every 15 s)', 'About 0.27 calls per second per student idle: about 65 per second for 250 students.', 'FIXED', 'Challenges every 12 s idle (2 s during a game, 30 s when the tab is hidden), double points every 60 s. VERIFIED live: the deployed script has these values.'],
  ['N3', 'Low', 'A red 401 error on every page for visitors who are not logged in', '"401 /api/auth/me" on all 6 pages on desktop and phone.', 'FIXED', 'New /api/auth/session answers 200 with no user; the app uses it first and falls back to /api/auth/me. VERIFIED live: the session call answers 200 {"user":null}, and the audit shows 0 errors on all 12 page runs (was 1 on each).'],
  ['N4', 'Info', 'Worksheet submits answered 404 in the 300 and 1,000-student tests', 'The 1,000 run listed the codes: 258 were 404 ("we could not find this worksheet"). The server keeps only the 9 newest open worksheets of a student, and hundreds of virtual students share ONE account, so their open worksheets are deleted by the next one made.', 'INFO', 'Not a bug for real students (each has their own 9). Found by reading routes/worksheets.ts.'],
  ['N10', 'Info', 'The 1,000-student test was mostly "slow down" (429) answers: 173,782 of 217,722 calls', 'All 1,000 virtual students share ONE login, so they share ONE rate limit (20,000 per minute is still set). The limit tripped in every minute and then answered fast (median 11 ms).', 'INFO', 'It shows two good things: the limit protects the server, and a flood is cut off in 11 ms. But it also means this test cannot measure 1,000 real students above about 400 users (each real student has their own limit). The 300-student test is the valid one.'],
  ['N11', 'Medium', '166 of 217,722 calls (0.08%) in the 1,000-student test got no answer or a server error', 'Spread over many kinds of call, longest waits 43 s. The server did not crash and the test finished normally.', 'NEEDS YOU', 'Capacity: a paid Render plan. At 300 students there were none.'],
  ['N5', 'Info', '322 challenge-check calls got "slow down" (429) in the 300-student test', 'The per-player limit is 60 per minute and 300 virtual students share one player.', 'INFO', 'Not a bug: a real student has their own limit. Slowing the background check (N2) also lowers this.'],
  ['N6', 'Info', 'Real student (Firebase) login speed was unknown', `${avgStu} s alone, ${avg4} s with 4 at once.`, 'INFO', 'Fine. Only 4 at once were measured; a bigger rush cannot be tested with one account (10 logins per 15 minutes per username).'],
  ['N7', 'Medium', 'At 1,000 simultaneous users on the API the slowest 5% wait 12 s', `0 failures of ${num(crashRow(1000).requests)} calls, then back to normal in 5 s.`, 'NEEDS YOU', 'Capacity: a paid Render plan. At 500 users it is fine (p95 ' + ms(crashRow(500).p95) + ').'],
  ['N8', 'Info', 'At 1,000 visitors the website files take longer (p95 ' + ms(V(1000).byKind.asset.p95_ms) + ')', 'Pages p95 ' + ms(pageP(V(1000)).p95_ms) + '. 0 failures. One test computer making about 960 calls per second is itself a limit.', 'INFO', 'No action. The website host is not the weak point.'],
  ['N9', 'Medium', 'Page layout jumps on a computer (0.2-0.3): the page was drawn in English / left-to-right / no theme, then switched to Arabic / right-to-left / dark', 'Frame-by-frame trace of /privacy: heading font Playfair, no dir, no theme at 535 ms; Almarai, rtl, dark at 659 ms; fonts at 888 ms. Font tricks alone (preload, display=optional, stable scrollbar) did not change the 0.28 / 0.20, which proved the cause was not the fonts.', 'FIXED', 'A small script in index.html sets the language, direction and theme before the first draw (same rules as the app). VERIFIED live: /privacy 0.201 to 0.004, /welcome 0.287 to 0.000; all 12 audit page runs are 0.009 or less. A font preload was added on top for the headline re-wrap that still showed once in a while on /welcome (0.158 in 2 of 6 runs); it tested 0.001 / 0 / 0.001 and goes live with the next deploy.'],
];

(async () => {
  const wb = new ExcelJS.Workbook();

  // ---------- summary
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ width: 4 }, { width: 34 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }];
  sum.mergeCells('A1:F1');
  sum.getCell('A1').value = 'Anees real site: old report vs new report (13 Nov 2026)';
  sum.getCell('A1').font = { size: 18, bold: true, color: { argb: C.white } };
  sum.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.maroon } };
  sum.getRow(1).height = 34;
  sum.mergeCells('A2:F2');
  sum.getCell('A2').value = 'Old = the first report, before the deploy. New = the real site today, after the deploy, with the stress test taken up to 1,000 users. Checks made with no real account; nothing was written except the points the 300-student test earned for Test_Student.';
  sum.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  sum.getRow(2).height = 44;
  const count = (arr, col, v) => arr.filter((r) => r[col] === v).length;
  const lines = [
    ['Verdict', 'The real site stays up. No crash in any test (visitors to 1,000, API to 1,000, 300 and 1,000 students logged in); the only errors were 166 of 217,722 calls (0.08%) in the 1,000-student test. The weak points are speed under load and slow local-password logins, both a server-size problem.'],
    ['Checks (45)', `${count(checks, 5, 'FIXED')} fixed, ${count(checks, 5, 'BETTER')} better, ${count(checks, 5, 'SAME')} same, ${count(checks, 5, 'STILL OPEN')} still open, ${count(checks, 5, 'NEW')} new, ${count(checks, 5, 'NOT RE-CHECKED')} not re-checked (they need the admin login or would write data).`],
    ['Bugs (15)', `${bugs.filter((b) => b[4] === 'FIXED').length} fixed, ${bugs.filter((b) => b[4] === 'NEEDS YOU').length} need you, ${bugs.filter((b) => b[4] === 'STILL OPEN').length} still open.`],
    ['New issues (' + issues.length + ')', `${issues.filter((i) => i[4] === 'FIXED').length} fixed and verified live, ${issues.filter((i) => i[4] === 'NEEDS YOU').length} need you, ${issues.filter((i) => i[4] === 'INFO').length} information only.`],
    ['What to do now', '1) Render > Environment: DELETE API_RATE_LIMIT_PER_MIN now (the tests are done; it is still 20,000).  2) Admin > Users: take Test_Student points back (the 300 and 1,000 tests added more); Admin > Videos: delete the 4 "LT temp" lessons.  3) Render Starter plan for the slowness under load and the slow local-password logins.  4) Then repeat the 300-student test to see the difference.'],
  ];
  lines.forEach((l, i) => {
    const r = 4 + i;
    sum.getCell(r, 2).value = l[0];
    sum.getCell(r, 2).font = { bold: true };
    sum.getCell(r, 2).alignment = { vertical: 'top' };
    sum.mergeCells(r, 3, r, 6);
    sum.getCell(r, 3).value = l[1];
    sum.getCell(r, 3).alignment = { wrapText: true, vertical: 'top' };
    sum.getRow(r).height = Math.max(24, Math.ceil(l[1].length / 80) * 15 + 8);
  });

  // ---------- stress numbers
  const stress = [];
  for (const s of vis.stages) {
    const old = s.visitors === 250 ? '15,211 requests, 440.7/s, pages median 68 ms, p95 232 ms, 0 failed' : '(not run before)';
    stress.push([`${num(s.visitors)} visitors (website pages and files)`, old, `${num(s.requests)} requests, ${s.requestsPerSecond}/s, pages median ${s.byKind.html.p50_ms} ms, p95 ${s.byKind.html.p95_ms} ms, files p95 ${s.byKind.asset.p95_ms} ms, API p50 ${s.byKind.api.p50_ms} ms, ${s.failed} failed`]);
  }
  for (const s of crash.stages) {
    const oldTxt = { 100: 'p95 0.8 s, 0 failed', 250: 'p95 1.3 s, 0 failed', 500: 'p95 2.6 s, 0 failed', 1000: '15 of 5,238 failed (502 and timeouts), p95 13 s' }[s.users];
    stress.push([`${num(s.users)} simultaneous users on the API (health and "who am I")`, oldTxt, `${num(s.requests)} requests (${s.perSecond}/s), ${s.failed} failed, median ${ms(s.p50)}, p95 ${ms(s.p95)}, slowest ${ms(s.max)}`]);
  }
  stress.push(['300 students logged in (shared login, all features)', '250 users: 27,606 requests, 0 server errors, median 1.3 s, p95 4.5 s, slowest 5.9 s (79/s)', '300 students: 17,151 requests (90/s), 0 server errors, average 2.4 s, median 2.0 s, p95 5.1 s, slowest 6.4 s. 626 unexpected 4xx (see issues N4, N5).']);
  stress.push(['1,000 students logged in (shared login, all features)', '(not run)', '217,722 calls (604/s) in 6 minutes: 20,185 were really served (average 5.1 s, median 1.8 s, p95 21.6 s, slowest 43.9 s), 173,782 were fast "slow down" 429 answers from the shared-login rate limit (median 11 ms), and 166 (0.08%) had no answer or a server error. The server did not crash. Above about 400 users this test measures the limit, not the server (issue N10).']);
  stress.push(['Local-password login, one at a time', 'about 2.3 s', `about 2.3-2.5 s (${crash.oneLogin.map((o) => (o.ms / 1000).toFixed(1)).join(', ')} s)`]);
  stress.push(['Local-password logins, 6 at once', '14 s in total', `${(crash.rush.allDoneInMs / 1000).toFixed(1)} s in total`]);
  stress.push(['Local-password logins, 60 at once', '(not run)', '120 s in total, median wait 71 s, 7 timed out, the site stayed up']);
  stress.push(['Real student (Firebase) login', '(not measured)', `${avgStu} s alone, ${avg4} s with 4 at once`]);
  stress.push(['Recovery after the peak', 'median 305 ms', `median ${crash.recovery.medianMs} ms, ${crash.recovery.ok} of ${crash.recovery.of} answered`]);
  sheet(wb, 'Stress numbers', 'Stress test: old vs new', 'The new run goes up to 1,000 users. "Failed" = a server error or no answer. 429 = "slow down" is not a failure.', ['Test', 'Old (first report)', 'New (today)'], [46, 54, 80], stress);

  sheet(wb, 'Checks old vs new', 'Checks: old vs new', 'One row per check. Old = first report; New = today on the real site. Change: FIXED / BETTER / SAME / STILL OPEN / NEW / NOT RE-CHECKED (needs the admin login or would write data).', ['#', 'Area', 'Check', 'Old result', 'New result', 'Change'], [5, 14, 36, 44, 64, 16], checks, 5);
  sheet(wb, 'Bugs old vs new', 'Bugs: old vs new', 'The 15 findings of the first bug report, with their status today.', ['#', 'Severity', 'Problem', 'Old status', 'New status', 'What changed / what is left'], [5, 10, 48, 14, 14, 78], bugs, [3, 4]);
  sheet(wb, 'New issues', 'New issues found today and what was done', 'FIXED = changed, deployed and verified on the real site. NEEDS YOU = an action only you can do. INFO = no action.', ['#', 'Severity', 'Issue', 'Evidence', 'Status', 'What was done / what to do'], [5, 10, 50, 56, 16, 66], issues, 4);

  const out = path.join(__dirname, '..', 'docs', 'stress_test', 'old-vs-new-report.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('saved', out);

  // =================================================================== TWO SEPARATE NEW REPORTS (same kind as the first ones: checks, and bugs)
  const resultOf = (txt) => {
    const t = String(txt);
    if (/^NOT (RE-)?CHECK/.test(t)) return 'NOT CHECKED';
    if (/^PASS/.test(t)) return 'PASS';
    if (/^PROBLEM/.test(t)) return 'PROBLEM';
    if (/^NOTE/.test(t)) return 'NOTE';
    return 'NOTE';
  };
  const strip = (txt) => String(txt).replace(/^(PASS|PROBLEM|NOTE|NOT RE-CHECKED|NOT CHECKED|NOT CHECKABLE)( \([^)]*\))?:?\s*/, '');
  const newChecks = checks.map((c) => [c[0], c[1], c[2], resultOf(c[4]), strip(c[4]) || String(c[4]), c[3], c[5]]);
  const cnt = (r) => newChecks.filter((c) => c[3] === r).length;

  // ---------- NEW CHECKS REPORT
  const wc = new ExcelJS.Workbook();
  const ov = wc.addWorksheet('Overview');
  ov.columns = [{ width: 4 }, { width: 30 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 24 }];
  ov.mergeCells('A1:F1');
  ov.getCell('A1').value = 'Anees: New Checks Report (after the deploy)';
  ov.getCell('A1').font = { size: 18, bold: true, color: { argb: C.white } };
  ov.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.maroon } };
  ov.getRow(1).height = 34;
  ov.mergeCells('A2:F2');
  ov.getCell('A2').value = '14 November 2026  ·  real site anees-qa.site and its server  ·  visitors and API up to 1,000, 300 and 1,000 students logged in. The first report is in checks-report.xlsx.';
  ov.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  ov.getRow(2).height = 36;
  const put = (r, a, b) => {
    ov.getCell(r, 2).value = a;
    ov.getCell(r, 2).font = { bold: true };
    ov.getCell(r, 2).alignment = { vertical: 'top', wrapText: true };
    ov.mergeCells(r, 3, r, 6);
    ov.getCell(r, 3).value = b;
    ov.getCell(r, 3).alignment = { wrapText: true, vertical: 'top' };
    ov.getRow(r).height = Math.max(24, Math.ceil(b.length / 75) * 15 + 8);
  };
  put(4, 'Verdict', 'The real site stays up. It made no server crash in any test (visitors to 1,000, API to 1,000, 300 and 1,000 students logged in). The weak points are speed under heavy load and slow logins for local-password accounts (admin, test), both limited by the free server size.');
  put(5, 'Checks at a glance', `${newChecks.length} checks:  ${cnt('PASS')} passed,  ${cnt('PROBLEM')} found a problem,  ${cnt('NOTE')} notes,  ${cnt('NOT CHECKED')} not checked again (they need the admin login or would write data).`);
  put(6, 'Compared with the first report', `${count(checks, 5, 'FIXED')} fixed,  ${count(checks, 5, 'BETTER')} better,  ${count(checks, 5, 'SAME')} the same,  ${count(checks, 5, 'STILL OPEN')} still open,  ${count(checks, 5, 'NEW')} new checks.`);
  const numHead = ['Measure', '1,000 visitors (website)', '1,000 users on the API', '300 students logged in', '1,000 students logged in'];
  const v1000 = V(1000);
  const cr = crashRow(1000);
  const numRows = [
    ['What it tests', 'Pages and files, no login', 'Health and "who am I", no login', 'All features (shared login)', 'All features (shared login)'],
    ['Requests', num(v1000.requests), num(cr.requests), '17,151', '217,722'],
    ['Server errors / no answer', '0', String(cr.failed), '0', '166 (0.08%)'],
    ['Median answer', `${v1000.byKind.html.p50_ms} ms (page)`, ms(cr.p50), '2.0 s', '1.8 s (calls really served)'],
    ['p95 (slowest 5%)', `${ms(v1000.byKind.html.p95_ms)} (page)`, ms(cr.p95), '5.1 s', '21.6 s (calls really served)'],
    ['Slowest single request', `${ms(v1000.byKind.html.max_ms)} (page)`, ms(cr.max), '6.4 s', '43.9 s'],
    ['Requests per second', String(V(1000).requestsPerSecond), String(cr.perSecond), '90', '604 (80% fast "slow down" answers)'],
  ];
  ov.getCell(8, 2).value = 'The load tests in numbers';
  ov.getCell(8, 2).font = { bold: true, size: 13 };
  numHead.forEach((h, i) => {
    const c = ov.getCell(9, 2 + i);
    c.value = h;
    c.font = { bold: true, color: { argb: C.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
    c.alignment = { wrapText: true, vertical: 'middle' };
  });
  ov.getRow(9).height = 32;
  numRows.forEach((r, i) => {
    r.forEach((v, j) => {
      const c = ov.getCell(10 + i, 2 + j);
      c.value = v;
      c.alignment = { wrapText: true, vertical: 'top' };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
    });
    ov.getRow(10 + i).height = 34;
  });
  put(18, 'What to do now', '1) Render > Environment: delete API_RATE_LIMIT_PER_MIN (still 20,000).  2) Admin > Users: take Test_Student points back.  3) Admin > Videos: delete the 4 "LT temp" lessons.  4) Render Starter plan for the slowness under load.  See bug-report-new.xlsx, sheet "Your to-do list".');
  put(19, 'How to read the numbers', 'Median = the middle request: half were faster. p95 = 95 of every 100 requests were faster. "Server errors" = no answer or a 5xx. A 429 ("slow down") is the rate limit working, not an error.');
  sheet(wc, 'All checks', 'All checks (new)', 'One row for each thing that was checked today. Result: PASS = fine, PROBLEM = something to fix, NOTE = worth knowing, NOT CHECKED = needs the admin login or would write data. "First report" shows what the same check said before.', ['#', 'Area', 'What was checked', 'Result', 'What we saw today', 'First report said', 'Change'], [5, 14, 36, 14, 70, 44, 16], newChecks, [3, 6]);
  sheet(wc, 'Load and stress', 'Load and stress numbers (first report vs today)', 'The new run goes up to 1,000 users. "Failed" = a server error or no answer.', ['Test', 'First report', 'Today'], [46, 54, 84], stress);
  const outC = path.join(__dirname, '..', 'docs', 'stress_test', 'checks-report-new.xlsx');
  await wc.xlsx.writeFile(outC);
  console.log('saved', outC);

  // ---------- NEW BUG REPORT (findings, fix log, how each fix was verified, to-do)
  const wbg = new ExcelJS.Workbook();
  const all = [
    ...bugs.map((b) => [String(b[0]), b[1], b[4], b[2], b[5]]),
    ...issues.map((i) => [i[0], i[1], i[4], i[2] + '. ' + i[3], i[5]]),
  ];
  const nFixed = all.filter((a) => a[2] === 'FIXED').length;
  const nNeed = all.filter((a) => a[2] === 'NEEDS YOU').length;
  const nOpen = all.filter((a) => a[2] === 'STILL OPEN').length;
  const nInfo = all.filter((a) => a[2] === 'INFO').length;
  sheet(wbg, 'Bug Report', 'Anees: New Bug and Issue Report', `${all.length} findings (the 15 of the first report and ${issues.length} new ones found today): ${nFixed} fixed, ${nNeed} need you, ${nOpen} still open, ${nInfo} information only. The first report is in bug-report.xlsx.`, ['#', 'Severity', 'Status', 'Problem and what we saw', 'What was done / what to do'], [6, 10, 16, 80, 80], all, 2);

  const fixes = [
    [1, 'Entrance animation lagged before the landing page', 'The spinning rays layer was a 190vmax square (tens of millions of pixels turning every frame); animated blur and glow filters on the 3D pieces, the logo and the zoom-out; the light sweep repainted every frame; and the 3D particle engine started loading in the middle of the intro. Now: a 100vmax layer, no animated filters, the sweep moves by transform, the particle engine waits until the intro is gone, and the intro lasts 4 s instead of 5.', 'frontend: IntroSplash.tsx, ParticleForm.tsx, lib/intro-gate.ts, theme.css', 'Measured in the browser: median frame 14.5 ms (about 69 fps) during the intro. The new CSS is in the live site (the old 190vmax value is gone).', 'LIVE'],
    [2, 'Reels scroll felt slow / not smooth with a laptop trackpad', 'Every swipe re-rendered all slides; a blur sat over the playing video; a second flick was ignored until the trackpad\'s momentum died; the default easing felt jerky. Now: slides are memoised, no blur over the video, a clearly stronger new flick turns the next reel at once, 380 ms swipe with a soft landing.', 'frontend: ReelsPage.tsx, ReelSlide.tsx', 'On the live site (logged in as the test student): the next video was playing 106-161 ms after a swipe, frames about 7 ms. The trackpad feel needs your own try.', 'LIVE'],
    [3, 'Background polling load: every logged-in browser asked the server all the time', 'Challenges every 6 s, double points every 15 s. Now: challenges every 12 s idle (2 s during a game, 30 s when the tab is hidden), double points every 60 s. About 40% fewer idle calls.', 'frontend: ChallengeHost.tsx, DoublePointsNotification.tsx', 'Read from the deployed script on the real site: 30 s hidden / 12 s idle / 2 s in a game.', 'LIVE'],
    [4, 'Red 401 error in the console for every logged-out visitor', 'New /api/auth/session answers 200 {"user":null} when nobody is logged in; the app asks it first and falls back to /api/auth/me on an older server.', 'backend: routes/auth.ts, middleware/auth.ts; frontend: lib/auth-context.tsx', 'Local: anonymous 200 {"user":null}, /me still 401, logged in returns the user. Live: the session call answers 200; the browser audit shows 0 errors on all 12 page runs (it was 1 on each).', 'LIVE'],
    [5, 'Slow local-password logins (cost 12 = 2.3 s)', 'Tried cost 10 (4 times faster) with a re-save of old passwords on login; you chose to keep 12, so it was put back. The re-save step stays in the code and does nothing at 12.', 'backend: lib/password.ts, routes/auth.ts', 'Local test of the re-save step passed (wrong password kept the old hash; the first correct login saved the new one). Live cost is 12 again.', 'CHANGED BACK'],
    [6, 'Test tooling for the real site', 'New: live-login-rush.mjs (made-up usernames), live-student-login.mjs (one real student), live300 and live1000 profiles, status codes listed in the k6 summary, cls-sources.mjs (what shifts on a phone), visitor test to 1,000.', 'loadtest/', 'All were run on the real site today; results are in loadtest/*-result.json and *-summary.json.', 'DONE'],
    [7, 'Layout jumps on a computer (0.2-0.3 on /welcome and /privacy)', 'The page was drawn in English, left-to-right and without a theme, then switched to Arabic, right-to-left and dark ~100 ms later. A script in index.html now sets language, direction and theme before the first draw; font files of the saved language are preloaded.', 'frontend: index.html', 'Frame-by-frame trace found the cause (fonts alone did not help in the before/after test). Live audit after the deploy: all 12 page runs 0.009 or less (before 0.287 / 0.202 / 0.217). The preload part is tested before/after (0.158 to 0.001) and goes live with the next deploy.', 'LIVE'],
    [8, 'From the first round: points once a day, API/login limits, login queue, lessons without a video, security headers, real 404', 'Deployed earlier (commit fd4f25e).', 'backend + vercel.json', 'Verified live today: the 11th failed login for one username is refused (429), security headers are sent on the pages, a missing file answers 404, 60 logins at once did not freeze the site.', 'LIVE'],
  ];
  sheet(wbg, 'Fix log', 'Fix log: what was fixed and how it was verified', 'Each row is a fix made after the first report, with the proof. LIVE = running on the real site.', ['#', 'What was fixed', 'What was changed', 'Files', 'How it was verified', 'State'], [5, 40, 80, 40, 70, 14], fixes.map((f) => f), 5);

  const todo = [
    [1, 'Render > the backend service > Environment > delete API_RATE_LIMIT_PER_MIN > Save', 'The tests are finished; with it on, each student may make 20,000 calls a minute (the normal limit is 300), so a flood could slow everyone.', 'Today'],
    [2, 'Admin > Users > Test_Student > Manage > remove its points', 'The 300 and 1,000-student tests added points to it, and it is on the leaderboard.', 'Today'],
    [3, 'Admin > Videos > search "LT temp" > delete the 4 test lessons', 'Left by the first test (ids 399, 406, 407, 410).', 'Today'],
    [4, 'Close the PowerShell window that held the test password; change the Test_Student password (it was typed in the chat once)', 'So the password does not stay around.', 'Today'],
    [5, 'Render: change the instance type to Starter (about $7 a month)', 'The fix for the slowness with 300+ busy students and for the slow local-password logins. Repeat the 300-student test afterwards to see the difference.', 'This week'],
    [6, 'Render: check the region of the server (near Qatar)', 'Every call takes about 255 ms before it does any work.', 'This week'],
    [7, 'Deploy once more: npx vercel --prod from the frontend folder', 'Puts the font preload (a small extra for the /welcome headline) live. The main layout fix is already live: your last deploy took it with it.', 'When you like'],
    [8, 'Admin: duplicate lesson (ids 89 and 90), dev_student and dev_teacher accounts', 'Content clean-up from the first report.', 'When you like'],
  ];
  sheet(wbg, 'Your to-do list', 'Your to-do list', 'Only you can do these (they need Render, the admin login or a decision).', ['#', 'What to do', 'Why', 'When'], [5, 80, 90, 14], todo);
  const outB = path.join(__dirname, '..', 'docs', 'stress_test', 'bug-report-new.xlsx');
  await wbg.xlsx.writeFile(outB);
  console.log('saved', outB);
})();
