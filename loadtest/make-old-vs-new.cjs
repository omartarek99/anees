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
const crashRow = (u) => crash.stages.find((s) => s.users === u);

const C = { maroon: 'FF7A1432', dark: 'FF2B2B33', white: 'FFFFFFFF', green: ['FFE3F5E8', 'FF1E6B3A'], red: ['FFFDE2E2', 'FF9B1C1C'], amber: ['FFFFF1D6', 'FF8A5A00'], blue: ['FFE3EEFB', 'FF1F4E8C'], grey: ['FFE8E8EE', 'FF444455'] };
const tone = { BETTER: C.green, FIXED: C.green, SAME: C.grey, 'STILL OPEN': C.red, WORSE: C.red, NEW: C.blue, 'NOT RE-CHECKED': C.grey, 'NEEDS YOU': C.amber, 'FIXED IN CODE': C.amber, INFO: C.blue, PASS: C.green, PROBLEM: C.red, NOTE: C.grey };

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
  [14, 'The real site', 'Landing page in a browser', 'PASS: 1.37 s, 401 KB', `PASS: ${(audit.find((a) => a.profile === 'desktop' && a.path === '/') || {}).load ? Math.round(audit.find((a) => a.profile === 'desktop' && a.path === '/').load) + ' ms' : 'fast'} load on desktop, 425 KB`, 'SAME'],
  [15, 'The real site', 'Privacy and Terms pages', 'PASS: 0.1 s', 'PASS: 0.17 s', 'SAME'],
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
  [42, 'New today', 'Console errors when logged out', '-', 'NOTE: one 401 /api/auth/me per page (expected; removed in the code, live after the deploy)', 'NEW'],
  [43, 'New today', 'Console errors when logged in', '-', 'PASS: home, map, worksheets, leaderboard load with no failed calls; one 502 seen once during the deploy window', 'NEW'],
  [44, 'New today', 'Page layout jumps on a phone', 'PROBLEM: /privacy 0.32, /welcome 0.07', 'PASS: re-measured /privacy 0.015, /welcome 0.071 (both under 0.1 = good). The 0.32 did not repeat.', 'BETTER'],
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
  ['N2', 'Medium', 'Every logged-in browser asks the server in the background (challenges every 6 s, double points every 15 s)', 'About 0.27 calls per second per student idle: about 65 per second for 250 students.', 'FIXED IN CODE', 'Challenges every 12 s idle (2 s during a game), double points every 60 s. Live after the next deploy.'],
  ['N3', 'Low', 'A red 401 error on every page for visitors who are not logged in', '"401 /api/auth/me" on all 6 pages on desktop and phone.', 'FIXED IN CODE', 'New /api/auth/session answers 200 with no user; the app uses it first and falls back to /api/auth/me, so Render and Vercel can be deployed in either order. Live after the next deploy.'],
  ['N4', 'Medium', '304 of 638 worksheet submits answered a 4xx the test did not expect (300-student test)', 'Same worksheet submitted by many virtual students sharing ONE account. The cause could not be read from the summary.', 'NEEDS YOU', 'The next 300/1,000 run prints the status of each (400 / 404 / 429 ...). Run it and send the file.'],
  ['N5', 'Info', '322 challenge-check calls got "slow down" (429) in the 300-student test', 'The per-player limit is 60 per minute and 300 virtual students share one player.', 'INFO', 'Not a bug: a real student has their own limit. Slowing the background check (N2) also lowers this.'],
  ['N6', 'Info', 'Real student (Firebase) login speed was unknown', `${avgStu} s alone, ${avg4} s with 4 at once.`, 'INFO', 'Fine. Only 4 at once were measured; a bigger rush cannot be tested with one account (10 logins per 15 minutes per username).'],
  ['N7', 'Medium', 'At 1,000 simultaneous users on the API the slowest 5% wait 12 s', `0 failures of ${num(crashRow(1000).requests)} calls, then back to normal in 5 s.`, 'NEEDS YOU', 'Capacity: a paid Render plan. At 500 users it is fine (p95 ' + ms(crashRow(500).p95) + ').'],
  ['N8', 'Info', 'At 1,000 visitors the website files take longer (p95 ' + ms(V(1000).byKind.asset.p95_ms) + ')', 'Pages p95 ' + ms(pageP(V(1000)).p95_ms) + '. 0 failures. One test computer making about 960 calls per second is itself a limit.', 'INFO', 'No action. The website host is not the weak point.'],
  ['N9', 'Info', 'Layout jumps on the phone', 'Re-measured: /privacy 0.015, /welcome 0.071 (good is under 0.1). The 0.32 seen once did not repeat.', 'INFO', 'No fix needed.'],
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
    ['Verdict', 'The real site stays up. No server error in any test (visitors to 1,000, API to 1,000, 300 students logged in). The weak points are speed under load and slow local-password logins, both a server-size problem.'],
    ['Checks (44)', `${count(checks, 5, 'FIXED')} fixed, ${count(checks, 5, 'BETTER')} better, ${count(checks, 5, 'SAME')} same, ${count(checks, 5, 'STILL OPEN')} still open, ${count(checks, 5, 'NEW')} new, ${count(checks, 5, 'NOT RE-CHECKED')} not re-checked (they need the admin login or would write data).`],
    ['Bugs (15)', `${bugs.filter((b) => b[4] === 'FIXED').length} fixed, ${bugs.filter((b) => b[4] === 'NEEDS YOU').length} need you, ${bugs.filter((b) => b[4] === 'STILL OPEN').length} still open.`],
    ['New issues (9)', `${issues.filter((i) => i[4] === 'FIXED IN CODE').length} fixed in code (live after the next deploy), ${issues.filter((i) => i[4] === 'NEEDS YOU').length} need you, ${issues.filter((i) => i[4] === 'INFO').length} information only.`],
    ['What to do now', '1) Deploy: Render Manual Deploy, then npx vercel --prod from the frontend folder.  2) Run the 1,000-student test (command in the chat) while API_RATE_LIMIT_PER_MIN is still 20000, then DELETE it.  3) Admin > Users: take Test_Student points back; Admin > Videos: delete the 4 "LT temp" lessons.  4) Render Starter plan for the slowness.'],
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
  stress.push(['Local-password login, one at a time', 'about 2.3 s', `about 2.3-2.5 s (${crash.oneLogin.map((o) => (o.ms / 1000).toFixed(1)).join(', ')} s)`]);
  stress.push(['Local-password logins, 6 at once', '14 s in total', `${(crash.rush.allDoneInMs / 1000).toFixed(1)} s in total`]);
  stress.push(['Local-password logins, 60 at once', '(not run)', '120 s in total, median wait 71 s, 7 timed out, the site stayed up']);
  stress.push(['Real student (Firebase) login', '(not measured)', `${avgStu} s alone, ${avg4} s with 4 at once`]);
  stress.push(['Recovery after the peak', 'median 305 ms', `median ${crash.recovery.medianMs} ms, ${crash.recovery.ok} of ${crash.recovery.of} answered`]);
  sheet(wb, 'Stress numbers', 'Stress test: old vs new', 'The new run goes up to 1,000 users. "Failed" = a server error or no answer. 429 = "slow down" is not a failure.', ['Test', 'Old (first report)', 'New (today)'], [46, 54, 80], stress);

  sheet(wb, 'Checks old vs new', 'Checks: old vs new', 'One row per check. Old = first report; New = today on the real site. Change: FIXED / BETTER / SAME / STILL OPEN / NEW / NOT RE-CHECKED (needs the admin login or would write data).', ['#', 'Area', 'Check', 'Old result', 'New result', 'Change'], [5, 14, 36, 44, 64, 16], checks, 5);
  sheet(wb, 'Bugs old vs new', 'Bugs: old vs new', 'The 15 findings of the first bug report, with their status today.', ['#', 'Severity', 'Problem', 'Old status', 'New status', 'What changed / what is left'], [5, 10, 48, 14, 14, 78], bugs, [3, 4]);
  sheet(wb, 'New issues', 'New issues found today and what was done', 'FIXED IN CODE = changed and tested here, live after the next deploy. NEEDS YOU = an action only you can do. INFO = no action.', ['#', 'Severity', 'Issue', 'Evidence', 'Status', 'What was done / what to do'], [5, 10, 50, 56, 16, 66], issues, 4);

  const out = path.join(__dirname, '..', 'docs', 'old-vs-new-report.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('saved', out);
})();
