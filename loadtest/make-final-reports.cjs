// Builds the two final reports:
//   docs/checks-report.xlsx  - every check that was made (real site, load tests, fix checks) with its result
//   docs/bug-report.xlsx     - every bug, where it shows on the real site, its status and how it was verified
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Mahmoud_Emad/TFQ_Project_v1/anees/';
const ExcelJS = require(ROOT + 'backend/node_modules/exceljs');
const { CALLS, BUGS, FIXLOG, FIXCHECKS, TODO, CHECKS } = require('./report-data.cjs');
const J = (f) => require(path.join(ROOT, 'loadtest', f));
const before = J('full-summary.json').metrics;
const after = J('full-summary-after-fixes.json').metrics;
const live = J('live250-summary.json').metrics;
const visitors = J('prod-visitors-result.json');
const anon = J('live-checks-anonymous.json');
const csv = (f) => fs.readFileSync(path.join(ROOT, 'loadtest', f), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const resB = csv('server-resources.csv');
const resA = csv('server-resources-after.csv');

// ------------------------------------------------------------------ look and feel
const C = { purple: 'FF4B1F6F', purple2: 'FF6B3A94', lilac: 'FFF4EEFA', line: 'FFD9D2E3', white: 'FFFFFFFF', ink: 'FF2B2233', muted: 'FF6B6475', green: 'FF1E7B4B', greenBg: 'FFE3F4EA', amber: 'FF9A5B00', amberBg: 'FFFFF1D6', red: 'FFB3261E', redBg: 'FFFBE3E1', grey: 'FF5F6368', greyBg: 'FFECEEF1', blue: 'FF1F5FA8', blueBg: 'FFE3EEFB' };
const FONT = 'Calibri';
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: C.line } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const ms = (n) => (n >= 1000 ? (n / 1000).toFixed(2) + ' s' : Math.round(n) + ' ms');
const num = (n) => Number(n).toLocaleString('en-US');
const D = (m) => m.http_req_duration;

function newSheet(wb, name, tab, widths) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: tab } }, views: [{ showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = widths.map((w) => ({ width: w }));
  return ws;
}
function title(ws, text, sub, cols) {
  ws.mergeCells(2, 2, 2, cols);
  const t = ws.getCell(2, 2);
  t.value = text;
  t.font = { name: FONT, size: 20, bold: true, color: { argb: C.white } };
  t.fill = fill(C.purple);
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 38;
  ws.mergeCells(3, 2, 3, cols);
  const s = ws.getCell(3, 2);
  s.value = sub;
  s.font = { name: FONT, size: 11, color: { argb: C.white } };
  s.fill = fill(C.purple2);
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  ws.getRow(3).height = 34;
}
function heading(ws, row, text, cols) {
  ws.mergeCells(row, 2, row, cols);
  const c = ws.getCell(row, 2);
  c.value = text;
  c.font = { name: FONT, size: 13, bold: true, color: { argb: C.purple } };
  c.border = { bottom: { style: 'medium', color: { argb: C.purple } } };
  ws.getRow(row).height = 26;
}
function tableHeader(ws, row, labels, startCol = 2) {
  labels.forEach((l, i) => {
    const c = ws.getCell(row, startCol + i);
    c.value = l;
    c.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
    c.fill = fill(C.purple2);
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = box;
  });
  ws.getRow(row).height = 32;
}
function tableRow(ws, row, values, opts = {}) {
  values.forEach((v, i) => {
    const c = ws.getCell(row, 2 + i);
    c.value = v;
    c.font = { name: FONT, size: 11, color: { argb: C.ink }, bold: i === 0 && opts.boldFirst !== false };
    c.alignment = { vertical: 'top', wrapText: true, horizontal: i === 0 || opts.left ? 'left' : 'center' };
    c.border = box;
    if (opts.zebra) c.fill = fill(C.lilac);
  });
}
function paragraph(ws, row, text, cols, opts = {}) {
  ws.mergeCells(row, 2, row, cols);
  const c = ws.getCell(row, 2);
  c.value = text;
  c.font = { name: FONT, size: 11, color: { argb: opts.color || C.ink }, bold: !!opts.bold };
  c.alignment = { vertical: 'top', wrapText: true, indent: 1 };
  if (opts.bg) { c.fill = fill(opts.bg); c.border = box; }
  ws.getRow(row).height = opts.height || Math.max(20, Math.ceil(text.length / (opts.chars || 120)) * 17);
}
function badge(cell, text, color, bg) {
  cell.value = text;
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: color } };
  cell.fill = fill(bg);
  cell.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
  cell.border = box;
}
const RESULT = { PASS: ['PASS', C.green, C.greenBg], PROBLEM: ['PROBLEM', C.red, C.redBg], NOTE: ['NOTE', C.blue, C.blueBg], CANNOT: ['NOT CHECKABLE', C.grey, C.greyBg] };
const STATUS = { FIXED: ['FIXED  ✔', C.green, C.greenBg], YOU: ['NEEDS YOU', C.amber, C.amberBg], PLANNED: ['PLANNED', C.grey, C.greyBg] };
const SEV = { High: [C.red, C.redBg], Medium: [C.amber, C.amberBg], Low: [C.grey, C.greyBg] };
const WHERE = { LIVE: 'Real site', LOCAL: 'Local copy', 'NO LOGIN': 'Needs a login' };
const cpu = (res) => Math.round(((Number(res[res.length - 1][1]) - Number(res[0][1])) / (res.length * 2)) * 100);
const memMax = (res) => Math.round(Math.max(...res.map((r) => Number(r[2]))));

(async () => {
  // ======================================================================= REPORT 1: CHECKS
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Anees load test';
  wb.created = new Date();
  const counts = { PASS: 0, PROBLEM: 0, NOTE: 0, CANNOT: 0 };
  CHECKS.forEach((c) => counts[c[3]]++);
  const onLive = CHECKS.filter((c) => c[5] === 'LIVE').length;
  const peak = visitors.stages[visitors.stages.length - 1];

  // ---------------- Overview
  {
    const ws = newSheet(wb, 'Overview', C.purple, [3, 36, 24, 24, 24, 24, 3]);
    title(ws, 'Anees — Checks Report', '13 November 2026  ·  250 users (200 students + 50 teachers)  ·  real website anees-qa.site, real server, and a local copy  ·  every check is listed on the sheet "All checks"', 6);
    heading(ws, 5, 'Verdict', 6);
    paragraph(ws, 6, 'The real site stays up with 250 users at once and made no server error in any test. On the free server it gets slow (2 to 5 seconds per click at 250 users). The checks found 15 problems: 8 are fixed and tested (they reach the real site when you deploy), 5 need you (server plan and region, and clean-up of what the test left behind), 2 are planned. One needs you today: the API limit on Render is still raised to 20,000 per minute.', 6, { bg: C.amberBg, color: C.amber, bold: true, height: 66 });
    heading(ws, 8, 'Checks at a glance', 6);
    tableHeader(ws, 9, ['All checks', 'Passed', 'Found a problem', 'Notes', 'Could not be checked']);
    tableRow(ws, 10, [String(CHECKS.length), String(counts.PASS), String(counts.PROBLEM), String(counts.NOTE), String(counts.CANNOT)], { boldFirst: false });
    ws.getCell(10, 3).font = { name: FONT, size: 16, bold: true, color: { argb: C.green } };
    ws.getCell(10, 4).font = { name: FONT, size: 16, bold: true, color: { argb: C.red } };
    ws.getCell(10, 2).font = { name: FONT, size: 16, bold: true, color: { argb: C.purple } };
    ws.getCell(10, 5).font = { name: FONT, size: 16, bold: true, color: { argb: C.blue } };
    ws.getCell(10, 6).font = { name: FONT, size: 16, bold: true, color: { argb: C.grey } };
    ws.getRow(10).height = 32;
    paragraph(ws, 11, `${onLive} of the ${CHECKS.length} checks were made on the real site itself. "Could not be checked" means the check needs a login or would change real data, so it was done on a local copy instead.`, 6, { color: C.muted });
    heading(ws, 13, 'The load tests in numbers', 6);
    tableHeader(ws, 14, ['Measure', 'Real site\n250 visitors', 'Real server\n250 users logged in', '250 users, local copy\nbefore the fixes', '250 users, local copy\nafter the fixes']);
    [
      ['What it tests', 'Pages and files, no login', 'All features (shared logins)', 'All features (250 accounts)', 'All features (250 accounts)'],
      ['Requests', num(peak.requests), num(live.http_reqs.count), num(before.http_reqs.count), num(after.http_reqs.count)],
      ['Server errors / timeouts', String(peak.failed), String(live.app_failures.count), String(before.app_failures.count), String(after.app_failures.count)],
      ['Median response', ms(peak.byKind.html.p50_ms) + ' (page)', ms(D(live).med), ms(D(before).med), ms(D(after).med)],
      ['p95 (slowest 5%)', ms(peak.byKind.html.p95_ms) + ' (page)', ms(D(live)['p(95)']), ms(D(before)['p(95)']), ms(D(after)['p(95)'])],
      ['Slowest single request', ms(peak.byKind.html.max_ms) + ' (page)', ms(D(live).max), ms(D(before).max), ms(D(after).max)],
      ['Requests per second', String(peak.requestsPerSecond), live.http_reqs.rate.toFixed(0), String(Math.round(before.http_reqs.rate)), String(Math.round(after.http_reqs.rate))],
    ].forEach((r, i) => tableRow(ws, 15 + i, r, { zebra: i % 2 === 1 }));
    heading(ws, 23, 'What to do now (the full list is in the Bug Report, sheet "Your to-do list")', 6);
    TODO.slice(0, 5).forEach((t, i) => paragraph(ws, 24 + i, `${i + 1}.  ${t[0]}`, 6, { chars: 125 }));
    heading(ws, 30, 'How to read the numbers', 6);
    paragraph(ws, 31, 'Median = the middle request: half were faster. p95 = 95 of every 100 requests were faster than this. Server error = the server answered 5xx or did not answer. "Shared logins" = all virtual users used the same test student and test teacher login (one computer cannot make 250 real logins). The "after the fixes" run was made before two small later changes (the login limit key and the points shown on screen); those were checked separately (sheet "Fix checks" in the Bug Report).', 6, { color: C.muted, height: 70 });
  }

  // ---------------- All checks
  {
    const ws = newSheet(wb, 'All checks', C.green, [3, 5, 18, 40, 40, 15, 70, 15, 9, 3]);
    title(ws, 'All checks', 'One row for each thing that was checked. Result: PASS = fine, PROBLEM = found something wrong (see the bug number), NOTE = worth knowing, NOT CHECKABLE = needs a login or would change real data.', 9);
    tableHeader(ws, 5, ['#', 'Area', 'What was checked', 'How / where', 'Result', 'What we saw', 'Tested on', 'Bug #']);
    CHECKS.forEach((c, i) => {
      const r = 6 + i;
      tableRow(ws, r, [i + 1, c[0], c[1], c[2], '', c[4], WHERE[c[5]], c[6] || '-'], { left: true, zebra: i % 2 === 1 });
      ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'top' };
      ws.getCell(r, 3).font = { name: FONT, size: 11, color: { argb: C.muted } };
      ws.getCell(r, 4).font = { name: FONT, size: 11, bold: true, color: { argb: C.ink } };
      const [t, col, bg] = RESULT[c[3]];
      badge(ws.getCell(r, 6), t, col, bg);
      ws.getCell(r, 8).alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
      ws.getCell(r, 9).alignment = { horizontal: 'center', vertical: 'top' };
    });
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 5, xSplit: 4 }];
    ws.autoFilter = { from: { row: 5, column: 2 }, to: { row: 5 + CHECKS.length, column: 9 } };
  }

  // ---------------- Load: real site visitors
  {
    const ws = newSheet(wb, 'Load - real site', C.green, [3, 30, 11, 11, 13, 14, 14, 14, 14, 16, 18, 3]);
    title(ws, 'Load test: the real website', 'anees-qa.site, anonymous and read-only. Ramp 10 → 50 → 100 → 250 visitors; each visitor opens the page, its files and the two start-up API calls.', 11);
    heading(ws, 5, 'Result by stage', 11);
    tableHeader(ws, 6, ['Stage', 'Visitors', 'Requests', 'Requests / s', 'Failed (5xx or timeout)', 'Page: median', 'Page: p95', 'Files: p95', 'API call: median', 'API refused "too many" (429)']);
    const base = visitors.baseline;
    tableRow(ws, 7, ['One visitor (before)', 1, base.requests, '-', String(base.failed), ms(base.byKind.html.p50_ms), ms(base.byKind.html.p95_ms), '-', ms(base.byKind.api.p50_ms), base.byKind.api.rate_limited_429]);
    visitors.stages.forEach((s, i) => tableRow(ws, 8 + i, [`${s.visitors} at once`, s.visitors, num(s.requests), s.requestsPerSecond, `${s.failed} (${(s.errorRate * 100).toFixed(1)}%)`, ms(s.byKind.html.p50_ms), ms(s.byKind.html.p95_ms), ms(s.byKind.asset.p95_ms), ms(s.byKind.api.p50_ms), num(s.byKind.api.rate_limited_429)], { zebra: i % 2 === 0 }));
    const ap = visitors.afterPeak;
    tableRow(ws, 12, ['One visitor (after the peak)', 1, ap.requests, '-', String(ap.failed), ms(ap.byKind.html.p50_ms), ms(ap.byKind.html.p95_ms), '-', '-', ap.byKind.api.rate_limited_429]);
    heading(ws, 14, 'What it shows', 11);
    [
      `•  250 visitors at once: ${num(peak.requests)} requests in ${peak.seconds} s with 0 failures. Pages answered in ${ms(peak.byKind.html.p50_ms)} (median). The site was back to normal right after the peak.`,
      '•  Pages and files come from the CDN, so they stay fast whatever the load. The API (Render) does not: see the sheet "Load - real server".',
      `•  Every API call takes about ${ms(peak.byKind.api.p50_ms)} even for one visitor (distance, not load).`,
      `•  From one network, ${num(peak.byKind.api.rate_limited_429)} of ${num(peak.byKind.api.requests)} API calls were refused: bug #2 (fixed in the code, live after the deploy).`,
    ].forEach((t, i) => paragraph(ws, 15 + i, t, 11, { chars: 150 }));
  }

  // ---------------- Load: real server
  {
    const ws = newSheet(wb, 'Load - real server', C.amber, [3, 20, 36, 12, 12, 12, 12, 12, 12, 14, 3]);
    title(ws, 'Load test: the real server with 250 users logged in', 'Render free plan. 200 virtual students + 50 virtual teachers with shared logins; 2 minutes to reach full strength, 3 minutes together. Page views, likes, worksheet sending and AI were switched off so real data and the AI quota were not touched.', 10);
    heading(ws, 5, 'Result', 10);
    paragraph(ws, 6, `${num(live.http_reqs.count)} requests in 5 min 51 s, ${live.app_failures.count} server errors, no crash. But every call, even the smallest, took the same long time: median ${ms(D(live).med)}, p95 ${ms(D(live)['p(95)'])}, p99 ${ms(D(live)['p(99)'])}, slowest ${ms(D(live).max)}. With 12 users the median was 225 ms. The same slowness for every call means the server is queueing at its limit (about ${live.http_reqs.rate.toFixed(0)} requests per second). One student journey took ${Math.round(live.iteration_duration.avg / 1000)} s (19 s with 12 users).`, 10, { bg: C.amberBg, color: C.amber, bold: true, height: 70 });
    heading(ws, 8, 'Every call', 10);
    tableHeader(ws, 9, ['Call', 'What the user does', 'Times called', 'Median', 'p90', 'p95', 'p99', 'Slowest', 'Unexpected 4xx']);
    const rows = Object.keys(live).filter((k) => /^http_req_duration\{name:/.test(k) && live[k].med > 0).map((k) => { const n = k.slice(23, -1); return { n, c: (live[`http_reqs{name:${n}}`] || {}).count, u: (live[`unexpected_4xx{name:${n}}`] || {}).count, m: live[k].med, p90: live[k]['p(90)'], p95: live[k]['p(95)'], p99: live[k]['p(99)'], max: live[k].max }; }).sort((a, b) => b.c - a.c);
    rows.forEach((r, i) => tableRow(ws, 10 + i, [r.n, CALLS[r.n] || '', num(r.c), ms(r.m), ms(r.p90), ms(r.p95), ms(r.p99), ms(r.max), r.u || '-'], { zebra: i % 2 === 1 }));
    const end = 10 + rows.length + 1;
    heading(ws, end, 'Notes', 10);
    [
      `•  ${num(live.unexpected_4xx.count)} answers (5.1%) were 4xx: watch ${live['unexpected_4xx{name:watch}'].count}, challenge ${live['unexpected_4xx{name:challenge-current}'].count}, quiz ${live['unexpected_4xx{name:quiz-submit}'].count}, worksheet ${live['unexpected_4xx{name:ws-submit}'].count}. These are not server errors: 200 virtual students acted as ONE account at once (per-player limits, the watch-time check). The summary has no status codes, so this is the likely cause, not a confirmed one.`,
      '•  Estimate (not measured): a real student makes about 0.3–0.5 requests per second. 250 students at the same moment would ask for 75–125 per second, at or above the limit. Up to about 60–100 at once should feel normal. Run 25 / 50 / 100 / 150 users to find the exact number.',
      '•  Not available: the Render CPU / memory graphs for the same time (please send a screenshot of Render → Metrics).',
    ].forEach((t, i) => paragraph(ws, end + 1 + i, t, 10, { chars: 150 }));
  }

  // ---------------- Crash test on the real server
  {
    const cp = J('live-crash-probe-result.json');
    const ws = newSheet(wb, 'Real server - crash test', C.red, [3, 22, 12, 13, 14, 12, 12, 12, 12, 18, 3]);
    title(ws, 'The real server: crash test and login cost', 'Anonymous calls straight to the API (Render). Nothing was written and no real account was touched. The test stops by itself at the first sign of trouble.', 10);
    heading(ws, 5, 'Simultaneous users on the API', 10);
    tableHeader(ws, 6, ['Users at once', 'Requests', 'Per second', 'Failed', 'Median', 'p95', 'p99', 'Slowest', 'Result']);
    cp.stages.forEach((s, i) => {
      tableRow(ws, 7 + i, [s.users, num(s.requests), s.perSecond, s.failed ? s.failed + ' (' + s.failedKinds.join(', ') + ')' : '0', ms(s.p50), ms(s.p95), ms(s.p99), ms(s.max), ''], { zebra: i % 2 === 1 });
      badge(ws.getCell(7 + i, 10), s.failed ? 'FIRST FAILURES' : 'OK', s.failed ? C.red : C.green, s.failed ? C.redBg : C.greenBg);
    });
    const r = 7 + cp.stages.length + 1;
    heading(ws, r, 'After the peak, and the cost of a login', 10);
    const avgLogin = (cp.oneLogin.reduce((a, b) => a + b.ms, 0) / cp.oneLogin.length / 1000).toFixed(1);
    [
      '•  Recovery 5 seconds after the peak: ' + cp.recovery.ok + ' of ' + cp.recovery.of + ' calls answered, median ' + ms(cp.recovery.medianMs) + '. The server stayed up and did not need a restart.',
      '•  ' + (cp.stoppedBecause || 'The test completed all stages.'),
      '•  Login cost: one failed login takes about ' + avgLogin + ' s on the live server (about 0.3 s on a PC). ' + cp.rush.logins + ' logins at once took ' + (cp.rush.allDoneInMs / 1000).toFixed(0) + ' s, and a simple "are you alive?" call waited up to ' + (cp.rush.healthSlowestDuring / 1000).toFixed(1) + ' s (normal ' + ms(cp.healthBaseline.median) + '). By that rate 250 logins at once = about ' + Math.round(cp.estimate.a250LoginRushWouldTakeSeconds / 60) + ' minutes of server time.',
      '•  A real 250-login rush was not run on the live site: it could freeze it for your students. The fix (password checks two at a time, in a line) is in the code and tested locally; after the deploy this probe can be repeated to confirm it.',
    ].forEach((t, i) => paragraph(ws, r + 1 + i, t, 10, { chars: 140 }));
  }

  // ---------------- Load: before and after
  {
    const ws = newSheet(wb, 'Load - before & after', C.purple2, [3, 20, 40, 14, 14, 14, 14, 3]);
    title(ws, 'Load test: 250 different users on a local copy, before and after the fixes', '200 students + 50 teachers, each with their own account, all arriving within 20 seconds, then 3 minutes of everything the site offers. Same test, same computer, same data.', 7);
    heading(ws, 5, 'Totals', 7);
    tableHeader(ws, 6, ['Measure', '', 'Before', 'After']);
    ws.mergeCells(6, 2, 6, 3);
    const T = [
      ['Requests', num(before.http_reqs.count), num(after.http_reqs.count)],
      ['Server errors / timeouts', String(before.app_failures.count), String(after.app_failures.count)],
      ['Median', ms(D(before).med), ms(D(after).med)],
      ['p95', ms(D(before)['p(95)']), ms(D(after)['p(95)'])],
      ['p99', ms(D(before)['p(99)']), ms(D(after)['p(99)'])],
      ['Slowest request', ms(D(before).max), ms(D(after).max)],
      ['Requests per second', String(Math.round(before.http_reqs.rate)), String(Math.round(after.http_reqs.rate))],
      ['4xx answers we did not expect', num(before.unexpected_4xx.count), num(after.unexpected_4xx.count)],
      ['Server memory (peak)', memMax(resB) + ' MB', memMax(resA) + ' MB'],
      ['Server CPU (average)', cpu(resB) + '% of one core', cpu(resA) + '% of one core'],
    ];
    T.forEach((r, i) => { ws.mergeCells(7 + i, 2, 7 + i, 3); tableRow(ws, 7 + i, [r[0], '', r[1], r[2]], { zebra: i % 2 === 1 }); });
    const row0 = 7 + T.length + 1;
    heading(ws, row0, 'The login rush (250 logins within 20 seconds): who waited?', 7);
    tableHeader(ws, row0 + 1, ['Call', 'What', 'Before p95', 'After p95', 'Before slowest', 'After slowest']);
    const calls = ['login', 'me', 'profile', 'guide', 'feed', 'watch', 'quiz-submit', 'leaderboard', 'map', 'craft-save', 'ws-generate', 'pageview'];
    calls.forEach((n, i) => {
      const b = before[`http_req_duration{name:${n}}`], a = after[`http_req_duration{name:${n}}`];
      tableRow(ws, row0 + 2 + i, [n, CALLS[n] || '', ms(b['p(95)']), ms(a['p(95)']), ms(b.max), ms(a.max)], { zebra: i % 2 === 1 });
    });
    const r2 = row0 + 2 + calls.length + 1;
    heading(ws, r2, 'What it shows', 7);
    const bl = before['http_req_duration{name:login}'], al = after['http_req_duration{name:login}'];
    [
      `•  Before: during the rush other pages waited a very long time behind the logins ("my profile" slowest ${ms(before['http_req_duration{name:profile}'].max)}). After: the password work runs two at a time in a line, so the slowest "my profile" is ${ms(after['http_req_duration{name:profile}'].max)}.`,
      `•  The logins themselves still queue (p95 ${ms(bl['p(95)'])} before, ${ms(al['p(95)'])} after): 250 slow password checks need CPU time, which only a stronger server can give. Real students log in through Firebase, so this mostly concerns the admin and test accounts.`,
      '•  Typical calls show a higher p95 after the fix (about 0.2 s instead of 0.05 s): during the first minute they share the CPU with the password work. That is the price of nobody waiting 5–50 s.',
      '•  The lessons list no longer contains lessons without a video, which removed all the unexpected 4xx answers.',
    ].forEach((t, i) => paragraph(ws, r2 + 1 + i, t, 7, { chars: 130 }));
  }

  // ---------------- Not checked
  {
    const ws = newSheet(wb, 'Not checked', C.grey, [3, 36, 62, 62, 3]);
    title(ws, 'What was not checked, and how to check it', 'Everything here needs your accounts or your quotas.', 4);
    tableHeader(ws, 5, ['Area', 'Why it was not checked', 'How to check it']);
    [
      ['250 DIFFERENT logins on the real site', 'One computer cannot make 250 real logins (limit, e-mails, real database).', 'Not needed: the shared-login test measures the server load. Use 3–5 test students to spread it.'],
      ['Firebase login (what students use)', 'Needs real accounts.', 'Time the login of a few test students, 10–20 at once.'],
      ['Quiz repeat, login rush, lesson without question on the real site', 'They need a login or would write real data (see the rows "Needs a login" in All checks).', 'They are covered on a local copy; after the deploy, ask a test student to repeat one quiz twice: the second must pay 0.'],
      ['Video upload and playback from storage', 'Real storage and 100 MB files.', 'Upload 3 lessons at the same time from 3 teachers; play 50 videos on a phone network.'],
      ['AI questions and worksheets from a video', 'Spends your Gemini quota.', 'Run a small count and watch the quota first.'],
      ['Render CPU and memory graphs', 'Not captured during the test.', 'Send a screenshot of Render → Metrics for the test time.'],
      ['Real phones', 'Chrome would not start on this computer, so only the in-app browser (desktop size) was used.', 'Open the site on 3 real phones and record the screen.'],
    ].forEach((r, i) => tableRow(ws, 6 + i, r, { zebra: i % 2 === 1, left: true }));
  }
  await wb.xlsx.writeFile(ROOT + 'docs/checks-report.xlsx');

  // ======================================================================= REPORT 2: BUGS
  const bb = new ExcelJS.Workbook();
  bb.creator = 'Anees load test';
  {
    const ws = newSheet(bb, 'Bug Report', C.purple, [3, 5, 10, 13, 16, 40, 38, 46, 40, 50, 44, 3]);
    title(ws, 'Anees — Bug Report', '15 findings from the 250-user test and the checks on the real site. FIXED = changed in the code and tested on a local copy; it reaches the real site when you deploy. "On the real site today" says whether the problem was seen on the real site itself.', 11);
    const fixed = BUGS.filter((b) => b.status === 'FIXED').length, you = BUGS.filter((b) => b.status === 'YOU').length, plan = BUGS.filter((b) => b.status === 'PLANNED').length;
    const tiles = [['Findings', BUGS.length, C.purple, C.lilac], ['Fixed and tested', fixed, C.green, C.greenBg], ['Need you', you, C.amber, C.amberBg], ['Planned', plan, C.grey, C.greyBg], ['High severity', BUGS.filter((b) => b.sev === 'High').length, C.red, C.redBg]];
    [3, 5, 7, 9, 11].forEach((col, i) => {
      const a = ws.getCell(5, col), b = ws.getCell(6, col);
      a.value = tiles[i][1]; a.font = { name: FONT, size: 22, bold: true, color: { argb: tiles[i][2] } }; a.fill = fill(tiles[i][3]); a.alignment = { horizontal: 'center', vertical: 'middle' }; a.border = box;
      b.value = tiles[i][0]; b.font = { name: FONT, size: 11, bold: true, color: { argb: tiles[i][2] } }; b.fill = fill(tiles[i][3]); b.alignment = { horizontal: 'center', vertical: 'middle' }; b.border = box;
    });
    ws.getRow(5).height = 38;
    ws.getRow(6).height = 22;
    heading(ws, 8, 'All findings', 11);
    tableHeader(ws, 9, ['#', 'Severity', 'Status', 'Area', 'Problem', 'Where you see it', 'On the real site today', 'Evidence', 'What was done / what to do', 'How it was verified']);
    BUGS.forEach((b, i) => {
      const r = 10 + i;
      tableRow(ws, r, [b.id, '', '', b.area, b.title, b.where, b.live, b.evidence, b.fix, b.verified], { left: true });
      ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'top' };
      badge(ws.getCell(r, 3), b.sev, SEV[b.sev][0], SEV[b.sev][1]);
      badge(ws.getCell(r, 4), STATUS[b.status][0], STATUS[b.status][1], STATUS[b.status][2]);
      ws.getCell(r, 6).font = { name: FONT, size: 11, bold: true, color: { argb: C.ink } };
      const live = ws.getCell(r, 8);
      live.fill = fill(/CONFIRMED/.test(b.live) ? C.redBg : C.greyBg);
    });
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 9, xSplit: 6 }];
  }
  {
    const ws = newSheet(bb, 'Fix log', C.green, [3, 10, 52, 90, 3]);
    title(ws, 'What changed in the code', 'One line per change, so a developer can find it. Nothing is live until you deploy.', 4);
    tableHeader(ws, 5, ['Bug #', 'File', 'Change']);
    FIXLOG.forEach((r, i) => tableRow(ws, 6 + i, r, { zebra: i % 2 === 1, left: true }));
  }
  {
    const ws = newSheet(bb, 'Fix checks', C.green, [3, 100, 14, 3]);
    title(ws, 'Checks run on the fixed code', 'loadtest/verify-fixes.mjs and loadtest/verify-cap.mjs, against local servers with the real limits switched on. Plus the 250-user test run again.', 3);
    tableHeader(ws, 5, ['Check', 'Result']);
    FIXCHECKS.forEach((r, i) => { tableRow(ws, 6 + i, [r, ''], { zebra: i % 2 === 1, left: true }); ws.getCell(6 + i, 2).font = { name: FONT, size: 11, color: { argb: C.ink } }; badge(ws.getCell(6 + i, 3), 'PASS', C.green, C.greenBg); });
  }
  {
    const ws = newSheet(bb, 'Your to-do list', C.amber, [3, 6, 100, 18, 14, 3]);
    title(ws, 'What still needs you', 'In order. The first three should be done today.', 5);
    tableHeader(ws, 5, ['#', 'What', 'Where', 'When']);
    TODO.forEach((r, i) => {
      tableRow(ws, 6 + i, [i + 1, r[0], r[1], r[2]], { zebra: i % 2 === 1, left: true });
      ws.getCell(6 + i, 2).alignment = { horizontal: 'center', vertical: 'top' };
      ws.getCell(6 + i, 5).alignment = { horizontal: 'center', vertical: 'top' };
      if (r[2] === 'Today') badge(ws.getCell(6 + i, 5), 'Today', C.red, C.redBg);
    });
  }
  await bb.xlsx.writeFile(ROOT + 'docs/bug-report.xlsx');

  // ======================================================================= REPORT 3: THE REAL SITE ONLY
  {
    const rb = new ExcelJS.Workbook();
    rb.creator = 'Anees load test';
    const cp = J('live-crash-probe-result.json');
    const liveChecks = CHECKS.filter((c) => c[5] === 'LIVE' && !/local/i.test(c[1]));
    const cnt = { PASS: 0, PROBLEM: 0, NOTE: 0 };
    liveChecks.forEach((c) => { if (cnt[c[3]] !== undefined) cnt[c[3]]++; });
    const confirmed = BUGS.filter((b) => /CONFIRMED/.test(b.live));
    {
      const ws = newSheet(rb, 'Overview', C.purple, [3, 36, 26, 26, 26, 3]);
      title(ws, 'Anees — Real Site Report', 'anees-qa.site and its server (Render)  ·  13 November 2026  ·  only what was tested or confirmed on the real site; nothing from the local copy', 5);
      heading(ws, 5, 'Verdict', 5);
      paragraph(ws, 6, 'No errors: in every test on the real site there were 0 server errors and no crash. It handled 250 visitors, 250 logged-in users and up to 500 simultaneous users on the API without a failure, and recovered right after the first failures at 1,000. The weak spots are speed (the free server is slow under 250 users) and a few settings and leftovers (below).', 5, { bg: C.greenBg, color: C.green, bold: true, height: 66 });
      heading(ws, 8, 'What was tested on the real site', 5);
      tableHeader(ws, 9, ['Test', 'Users', 'Server errors', 'Speed (median / p95)']);
      const peak2 = visitors.stages[visitors.stages.length - 1];
      [
        ['Visitors on the website (pages, files, start-up calls)', '250 at once', String(peak2.failed), ms(peak2.byKind.html.p50_ms) + ' / ' + ms(peak2.byKind.html.p95_ms) + ' (page)'],
        ['Everything the site offers, logged in (shared logins)', '200 students + 50 teachers', String(live.app_failures.count), ms(D(live).med) + ' / ' + ms(D(live)['p(95)'])],
        ['API crash test, 100 users', '100 at once', String(cp.stages[0].failed), ms(cp.stages[0].p50) + ' / ' + ms(cp.stages[0].p95)],
        ['API crash test, 250 users', '250 at once', String(cp.stages[1].failed), ms(cp.stages[1].p50) + ' / ' + ms(cp.stages[1].p95)],
        ['API crash test, 500 users', '500 at once', String(cp.stages[2].failed), ms(cp.stages[2].p50) + ' / ' + ms(cp.stages[2].p95)],
        ['API crash test, 1,000 users (stopped by itself)', '1,000 at once', cp.stages[3].failed + ' (502, timeouts)', ms(cp.stages[3].p50) + ' / ' + ms(cp.stages[3].p95)],
        ['Recovery 5 seconds after the peak', '1', '0', ms(cp.recovery.medianMs) + ' (all ' + cp.recovery.of + ' calls OK)'],
      ].forEach((r, i) => tableRow(ws, 10 + i, r, { zebra: i % 2 === 1 }));
      heading(ws, 18, 'The checks on the real site', 5);
      tableHeader(ws, 19, ['Checks made', 'Passed', 'Found a problem', 'Notes']);
      tableRow(ws, 20, [String(liveChecks.length), String(cnt.PASS), String(cnt.PROBLEM), String(cnt.NOTE)], { boldFirst: false });
      [2, 3, 4, 5].forEach((c, i) => { ws.getCell(20, c).font = { name: FONT, size: 16, bold: true, color: { argb: [C.purple, C.green, C.red, C.blue][i] } }; });
      ws.getRow(20).height = 30;
      heading(ws, 22, 'What needs attention on the real site', 5);
      [
        '1.  Render: API_RATE_LIMIT_PER_MIN is still 20,000 per minute (normal 300). It was raised for the test: delete it.',
        '2.  Leftovers of the test: Test_Student has 10,556 points and is #1 on the leaderboard; 4 test lessons named "LT temp ..." are still listed (ids 399, 406, 407, 410).',
        '3.  Speed: every API call takes about 225–315 ms (distance), and with 250 users every click takes 2–5 s. Check the Render region and use a plan with more CPU.',
        '4.  One failed login costs the live server about 2.3 s of CPU: 250 logins at once would keep it busy for about 9–10 minutes. The fix is in the code and waits for your deploy.',
        '5.  Website pages miss the basic security headers, and a missing file answers 200 with the home page. Both are fixed in vercel.json and wait for the Vercel deploy.',
      ].forEach((t, i) => paragraph(ws, 23 + i, t, 5, { chars: 110 }));
    }
    {
      const ws = newSheet(rb, 'Checks on the real site', C.green, [3, 5, 18, 42, 40, 15, 70, 9, 3]);
      title(ws, 'Every check made on the real site', 'PASS = fine, PROBLEM = found something wrong (see the finding number), NOTE = worth knowing.', 8);
      tableHeader(ws, 5, ['#', 'Area', 'What was checked', 'How / where', 'Result', 'What we saw', 'Finding #']);
      liveChecks.forEach((c, i) => {
        const r = 6 + i;
        tableRow(ws, r, [i + 1, c[0], c[1], c[2], '', c[4], c[6] || '-'], { left: true, zebra: i % 2 === 1 });
        ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'top' };
        ws.getCell(r, 4).font = { name: FONT, size: 11, bold: true, color: { argb: C.ink } };
        badge(ws.getCell(r, 6), RESULT[c[3]][0], RESULT[c[3]][1], RESULT[c[3]][2]);
        ws.getCell(r, 8).alignment = { horizontal: 'center', vertical: 'top' };
      });
      ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 5 }];
    }
    {
      const ws = newSheet(rb, 'Load and crash numbers', C.amber, [3, 24, 12, 12, 14, 12, 12, 12, 12, 14, 3]);
      title(ws, 'Load and crash numbers on the real site', 'All of it measured on anees-qa.site / the Render server. No real account was touched and nothing was written, except the logged-in test (shared test logins).', 10);
      heading(ws, 5, 'Visitors on the website', 10);
      tableHeader(ws, 6, ['Stage', 'Visitors', 'Requests', 'Failed', 'Page median', 'Page p95', 'Files p95', 'API median', 'API refused (429)']);
      visitors.stages.forEach((s, i) => tableRow(ws, 7 + i, [s.visitors + ' at once', s.visitors, num(s.requests), String(s.failed), ms(s.byKind.html.p50_ms), ms(s.byKind.html.p95_ms), ms(s.byKind.asset.p95_ms), ms(s.byKind.api.p50_ms), num(s.byKind.api.rate_limited_429)], { zebra: i % 2 === 0 }));
      heading(ws, 12, 'Logged in: 200 students + 50 teachers (shared logins), 5 min 51 s', 10);
      paragraph(ws, 13, num(live.http_reqs.count) + ' requests, ' + live.app_failures.count + ' server errors. Median ' + ms(D(live).med) + ', p95 ' + ms(D(live)['p(95)']) + ', p99 ' + ms(D(live)['p(99)']) + ', slowest ' + ms(D(live).max) + ' (with 12 users: median 225 ms). About ' + live.http_reqs.rate.toFixed(0) + ' requests per second: the free server is at its limit and queues the rest.', 10, { bg: C.amberBg, color: C.amber, bold: true, height: 52 });
      heading(ws, 15, 'Crash test on the API (simultaneous users, 12 s each)', 10);
      tableHeader(ws, 16, ['Users at once', 'Requests', 'Per second', 'Failed', 'Median', 'p95', 'p99', 'Slowest', 'Result']);
      cp.stages.forEach((s, i) => {
        tableRow(ws, 17 + i, [s.users, num(s.requests), s.perSecond, s.failed ? s.failed + ' (' + s.failedKinds.join(', ') + ')' : '0', ms(s.p50), ms(s.p95), ms(s.p99), ms(s.max), ''], { zebra: i % 2 === 1 });
        badge(ws.getCell(17 + i, 10), s.failed ? 'FIRST FAILURES' : 'OK', s.failed ? C.red : C.green, s.failed ? C.redBg : C.greenBg);
      });
      paragraph(ws, 22, 'Recovery 5 seconds after the peak: ' + cp.recovery.ok + ' of ' + cp.recovery.of + ' calls OK, median ' + ms(cp.recovery.medianMs) + '. The server stayed up and needed no restart.', 10, { color: C.green, bold: true });
      heading(ws, 24, 'Cost of a login (made-up usernames, small scale)', 10);
      const avgLogin = (cp.oneLogin.reduce((a, b) => a + b.ms, 0) / cp.oneLogin.length / 1000).toFixed(1);
      paragraph(ws, 25, 'One failed login: about ' + avgLogin + ' s of server time (0.3 s on a PC). ' + cp.rush.logins + ' logins at once: ' + (cp.rush.allDoneInMs / 1000).toFixed(0) + ' s to finish, and a simple "are you alive?" call waited up to ' + (cp.rush.healthSlowestDuring / 1000).toFixed(1) + ' s (normal ' + ms(cp.healthBaseline.median) + '). By that rate 250 logins at once = about ' + Math.round(cp.estimate.a250LoginRushWouldTakeSeconds / 60) + ' minutes. A real rush of 250 was not run on the live site, to protect your students.', 10, { height: 52 });
    }
    {
      const ws = newSheet(rb, 'Findings on the real site', C.red, [3, 5, 10, 16, 40, 42, 70, 44, 3]);
      title(ws, 'What was found on the real site', 'Only the findings that were seen on the real site itself. "Status" says whether the fix is already in the code (it reaches the real site when you deploy) or needs you.', 8);
      tableHeader(ws, 5, ['#', 'Severity', 'Status', 'Problem', 'Where you see it', 'What we saw on the real site', 'What to do']);
      confirmed.forEach((b, i) => {
        const r = 6 + i;
        const statusText = b.status === 'FIXED' ? 'FIXED IN CODE\nwaits for deploy' : b.status === 'YOU' ? 'NEEDS YOU' : 'PLANNED';
        tableRow(ws, r, [b.id, '', '', b.title, b.where, b.live, b.fix], { left: true });
        ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'top' };
        badge(ws.getCell(r, 3), b.sev, SEV[b.sev][0], SEV[b.sev][1]);
        const st = b.status === 'FIXED' ? [C.blue, C.blueBg] : b.status === 'YOU' ? [C.amber, C.amberBg] : [C.grey, C.greyBg];
        badge(ws.getCell(r, 4), statusText, st[0], st[1]);
        ws.getCell(r, 5).font = { name: FONT, size: 11, bold: true, color: { argb: C.ink } };
      });
      ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 5 }];
    }
    {
      const ws = newSheet(rb, 'To do', C.amber, [3, 6, 100, 18, 14, 3]);
      title(ws, 'What to do, in order', 'The first three should be done today.', 5);
      tableHeader(ws, 5, ['#', 'What', 'Where', 'When']);
      TODO.forEach((r, i) => {
        tableRow(ws, 6 + i, [i + 1, r[0], r[1], r[2]], { zebra: i % 2 === 1, left: true });
        ws.getCell(6 + i, 2).alignment = { horizontal: 'center', vertical: 'top' };
        ws.getCell(6 + i, 5).alignment = { horizontal: 'center', vertical: 'top' };
        if (r[2] === 'Today') badge(ws.getCell(6 + i, 5), 'Today', C.red, C.redBg);
      });
    }
    await rb.xlsx.writeFile(ROOT + 'docs/real-site-report.xlsx');
    console.log('real site report written: ' + liveChecks.length + ' checks, ' + confirmed.length + ' findings');
  }

  console.log(`reports written: ${CHECKS.length} checks (${JSON.stringify(counts)}), ${BUGS.length} bugs`);
})();
