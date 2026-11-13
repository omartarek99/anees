// Builds docs/stress-test-report.xlsx and docs/bug-report.xlsx from the raw results in loadtest/.
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Mahmoud_Emad/TFQ_Project_v1/anees/';
const ExcelJS = require(ROOT + 'backend/node_modules/exceljs');
const L = (f) => path.join(ROOT, 'loadtest', f);

const local = require(L('full-summary.json')).metrics;
const prod = require(L('prod-visitors-result.json'));
const browser = fs.existsSync(L('prod-browser-audit-result.json')) ? require(L('prod-browser-audit-result.json')) : [];
const res = fs.readFileSync(L('server-resources.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const mem = res.map((r) => Number(r[2]));
const cpuStart = Number(res[0][1]);
const cpuEnd = Number(res[res.length - 1][1]);
const seconds = res.length * 2;

const ms = (n) => `${Math.round(n)} ms`;
const g = (k) => local[k] || {};
const dur = g('http_req_duration');

// ------------------------------------------------------------------ helpers
const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B2A86' } };
function sheet(wb, name, columns, rows, opts = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns;
  rows.forEach((r) => ws.addRow(r));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = HEAD;
  h.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  h.height = 28;
  ws.eachRow((row, i) => {
    if (i > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  if (opts.colorCol) {
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const v = String(row.getCell(opts.colorCol).value || '');
      const color = /High|HIGH/.test(v) ? 'FFFFD6D6' : /Medium|MEDIUM/.test(v) ? 'FFFFF0CC' : /Low|LOW/.test(v) ? 'FFEAF6EA' : null;
      if (color) row.getCell(opts.colorCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    });
  }
  return ws;
}
const W = (w) => ({ width: w });

(async () => {
  // ============================================================== STRESS TEST REPORT
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Anees load test';

  const stages = prod.stages;
  const peak = stages[stages.length - 1];
  const summaryRows = [
    ['What was tested', 'ماذا اختبرنا', '250 people at the same time: 200 students + 50 teachers, doing everything (login, lessons/reels, quizzes, points, worksheets, map, Quarry game, friends and challenges, profile, teacher tools).'],
    ['Where', 'أين', 'A) the REAL website (anees-qa.site) with visitor traffic, 10 → 250 at once. B) A local copy of the site with the full logged-in behaviour of all 250 users.'],
    ['Why two tests', 'لماذا اختبارين', 'On the real site I did not log in and did not create accounts: sign-up sends real emails (Firebase / Resend quotas) and I must not type real passwords in a script. The logged-in flows were therefore tested on a local copy with 250 test accounts (removed afterwards).'],
    ['RESULT: real site', 'نتيجة الموقع الحقيقي', `250 visitors at once: ${peak.requests.toLocaleString()} requests in ${peak.seconds} s (${peak.requestsPerSecond}/s) with 0 failures. Pages p95 ${ms(peak.byKind.html.p95_ms)}, files p95 ${ms(peak.byKind.asset.p95_ms)}. Back to normal right after the peak.`],
    ['RESULT: real site API', 'نتيجة الـ API', `The API answered every call (0 server errors), about ${ms(peak.byKind.api.p50_ms)} per call. From one network the 200-requests-per-minute limit started answering "too many requests" (429): ${peak.byKind.api.rate_limited_429.toLocaleString()} of ${peak.byKind.api.requests.toLocaleString()} calls at 250 visitors. That is the protection working, but a whole school behind one internet address would hit it (see bug report #2).`],
    ['RESULT: 250 logged-in users (local copy)', 'نتيجة 250 مستخدم', `${g('http_reqs').count.toLocaleString()} requests in 3 min 40 s (${Math.round(g('http_reqs').rate)} per second), 0 server errors, 0 timeouts. Normal requests: median ${ms(dur.med)}, p95 ${ms(dur['p(95)'])}, p99 ${ms(dur['p(99)'])}.`],
    ['MAIN PROBLEM FOUND', 'أهم مشكلة', 'When all 250 log in within 20 seconds, the slowest logins waited about 49 s and everyone else was slowed down while it happened. This is the local-account login (bcrypt in the main thread). Real students log in through Firebase, which was not part of this test, so this mostly affects admin / test accounts.'],
    ['SECOND PROBLEM (security)', 'مشكلة أمان', 'Points can be farmed: submitting the same quiz again and again keeps paying points, with no limit (details in the bug report, #1).'],
    ['Server use during the test', 'استهلاك السيرفر', `Memory ${Math.round(mem[0])} MB → peak ${Math.round(Math.max(...mem))} MB. CPU: about ${Math.round(((cpuEnd - cpuStart) / seconds) * 100)}% of one core on average. This PC is much faster than the free Render plan, so the live server will be slower than these numbers for the CPU-heavy parts.`],
    ['Not tested', 'لم يُختبر', 'Real Firebase login, video upload to storage, e-mail codes, AI-written questions/worksheets from a video (Gemini), the real Render server under logged-in load, real phones. These need your test account / quotas: see the last sheet.'],
  ];
  sheet(wb, 'Summary - الملخص', [{ header: 'Item', key: 'a', ...W(30) }, { header: 'البند', key: 'b', ...W(22) }, { header: 'Result / النتيجة', key: 'c', ...W(110) }], summaryRows.map((r) => ({ a: r[0], b: r[1], c: r[2] })));

  // ---- real site
  const realRows = [];
  realRows.push({ stage: 'One visitor (before)', v: 1, s: '-', req: prod.baseline.requests, rps: '-', fail: `${prod.baseline.failed}`, htmlp50: ms(prod.baseline.byKind.html.p50_ms), htmlp95: ms(prod.baseline.byKind.html.p95_ms), filep95: '-', apip50: ms(prod.baseline.byKind.api.p50_ms), apip95: ms(prod.baseline.byKind.api.p95_ms), r429: prod.baseline.byKind.api.rate_limited_429, mb: '-' });
  for (const st of stages) {
    realRows.push({ stage: `${st.visitors} at once`, v: st.visitors, s: st.seconds, req: st.requests, rps: st.requestsPerSecond, fail: `${st.failed} (${(st.errorRate * 100).toFixed(1)}%)`, htmlp50: ms(st.byKind.html.p50_ms), htmlp95: ms(st.byKind.html.p95_ms), filep95: ms(st.byKind.asset.p95_ms), apip50: ms(st.byKind.api.p50_ms), apip95: ms(st.byKind.api.p95_ms), r429: st.byKind.api.rate_limited_429, mb: st.megabytes });
  }
  realRows.push({ stage: 'One visitor (after the peak)', v: 1, s: '-', req: prod.afterPeak.requests, rps: '-', fail: `${prod.afterPeak.failed}`, htmlp50: ms(prod.afterPeak.byKind.html.p50_ms), htmlp95: ms(prod.afterPeak.byKind.html.p95_ms), filep95: '-', apip50: ms(prod.afterPeak.byKind.api.p50_ms), apip95: '-', r429: prod.afterPeak.byKind.api.rate_limited_429, mb: '-' });
  sheet(wb, 'Real site - visitors', [
    { header: 'Stage', key: 'stage', ...W(26) }, { header: 'Visitors', key: 'v', ...W(10) }, { header: 'Seconds', key: 's', ...W(9) }, { header: 'Requests', key: 'req', ...W(11) }, { header: 'Requests / s', key: 'rps', ...W(12) },
    { header: 'Failed (5xx / timeout)', key: 'fail', ...W(18) }, { header: 'Page (HTML) median', key: 'htmlp50', ...W(16) }, { header: 'Page p95', key: 'htmlp95', ...W(12) }, { header: 'Files (JS/CSS) p95', key: 'filep95', ...W(16) },
    { header: 'API call median', key: 'apip50', ...W(15) }, { header: 'API call p95', key: 'apip95', ...W(13) }, { header: 'API answered "too many" (429)', key: 'r429', ...W(20) }, { header: 'Data (MB)', key: 'mb', ...W(10) },
  ], realRows);

  // ---- local full test per call
  const calls = [];
  for (const k of Object.keys(local)) {
    const m = /^http_req_duration\{name:(.+)\}$/.exec(k);
    if (!m) continue;
    const n = m[1];
    calls.push({ name: n, count: (local[`http_reqs{name:${n}}`] || {}).count || 0, fail: (local[`app_failures{name:${n}}`] || {}).count || 0, u4: (local[`unexpected_4xx{name:${n}}`] || {}).count || 0, avg: local[k].avg, med: local[k].med, p90: local[k]['p(90)'], p95: local[k]['p(95)'], p99: local[k]['p(99)'], max: local[k].max });
  }
  calls.sort((a, b) => b.p95 - a.p95);
  const WHAT = {
    login: 'Sign in (200 students + 50 teachers within 20 s)', me: 'Who am I (every page start)', profile: 'My profile', guide: 'First-time guide', 'double-points': 'Double-points status', 'points-notices': 'Points pop-ups', feed: 'Lessons feed (reels)',
    watch: 'Watching a lesson (points per second)', like: 'Like a lesson', 'quiz-submit': 'Lesson quiz answers (points)', leaderboard: 'Leaderboard', 'ws-videos': 'Worksheet: lessons list', 'ws-generate': 'Worksheet: make one (question bank / AI fall-back)',
    'ws-submit': 'Worksheet: send answers (points)', 'ws-send': 'Teacher: send a worksheet to students', 'ws-sent': 'Teacher: sent worksheets', map: 'Adventure map', 'map-quiz': 'Map level questions', 'map-quiz-submit': 'Map level answers (points)', boss: 'Guardian (boss) fight',
    'craft-load': 'Quarry: load the world', 'craft-save': 'Quarry: save the world (300 blocks; 4,000 for 1 in 5 students)', 'craft-puzzle': 'Quarry: get a puzzle', 'craft-answer': 'Quarry: answer a puzzle', friends: 'Friends list', 'friend-requests': 'Friend requests',
    'challenge-current': 'Challenges: is there a game for me', 'challenge-create': 'Challenges: start', 'challenge-accept': 'Challenges: accept', 'challenge-answers': 'Challenges: save answers', 'challenge-submit': 'Challenges: finish', 'profile-view': "Look at someone's profile", 'profile-edit': 'Edit my bio',
    pageview: 'Page-view counter (every page)', 't-options': 'Teacher: lesson form options', 't-lessons': 'Teacher: my lessons', 't-watch-report': 'Teacher: watch report', 't-messages': 'Teacher: admin messages', 't-create': 'Teacher: create a lesson', 't-update': 'Teacher: edit a lesson', 't-get': 'Teacher: open a lesson', 't-delete': 'Teacher: delete a lesson',
  };
  sheet(wb, 'Local 250 users - per call', [
    { header: 'Call', key: 'name', ...W(18) }, { header: 'What the user does', key: 'what', ...W(52) }, { header: 'Times called', key: 'count', ...W(12) }, { header: 'Server errors', key: 'fail', ...W(12) }, { header: 'Unexpected 4xx', key: 'u4', ...W(13) },
    { header: 'Average (ms)', key: 'avg', ...W(13) }, { header: 'Median (ms)', key: 'med', ...W(12) }, { header: 'p90 (ms)', key: 'p90', ...W(10) }, { header: 'p95 (ms)', key: 'p95', ...W(10) }, { header: 'p99 (ms)', key: 'p99', ...W(10) }, { header: 'Slowest (ms)', key: 'max', ...W(12) },
  ], calls.map((c) => ({ ...c, what: WHAT[c.name] || '', avg: Math.round(c.avg), med: Math.round(c.med), p90: Math.round(c.p90), p95: Math.round(c.p95), p99: Math.round(c.p99), max: Math.round(c.max) })));

  const serverRows = [
    ['Users at once', '250 (200 students + 50 teachers), all arriving within 20 s, then 3 minutes of normal use'],
    ['Requests', `${g('http_reqs').count.toLocaleString()} (${Math.round(g('http_reqs').rate)} per second)`],
    ['Full user journeys finished', `${g('iterations').count.toLocaleString()} (each: open app, lessons, quiz, worksheet, map, game, friends/challenge, profile)`],
    ['Server errors (5xx) / timeouts', `${g('app_failures').count}`],
    ['4xx answers we did not expect', `${g('unexpected_4xx').count.toLocaleString()} (${((g('unexpected_4xx').count / g('http_reqs').count) * 100).toFixed(1)}%): mostly lessons that have no video or no questions still appearing in the lessons list (bug #4)`],
    ['All requests: average / median / p90 / p95 / p99 / slowest', `${ms(dur.avg)} / ${ms(dur.med)} / ${ms(dur['p(90)'])} / ${ms(dur['p(95)'])} / ${ms(dur['p(99)'])} / ${ms(dur.max)}`],
    ['Login (250 at once)', `median ${ms(g('http_req_duration{name:login}').med)}, p95 ${ms(g('http_req_duration{name:login}')['p(95)'])}, slowest ${ms(g('http_req_duration{name:login}').max)}`],
    ['Data moved', `${((g('data_received').count || 0) / 1e6).toFixed(0)} MB down, ${((g('data_sent').count || 0) / 1e6).toFixed(0)} MB up`],
    ['Server memory', `start ${Math.round(mem[0])} MB, peak ${Math.round(Math.max(...mem))} MB, end ${Math.round(mem[mem.length - 1])} MB (no growth after the peak)`],
    ['Server CPU', `${Math.round(cpuEnd - cpuStart)} CPU-seconds in ${seconds} s = about ${Math.round(((cpuEnd - cpuStart) / seconds) * 100)}% of one core`],
    ['How to read this', 'A PC core is several times faster than the free Render plan (a fraction of a core, 512 MB). Treat these as the best case for the app itself.'],
  ];
  sheet(wb, 'Local 250 users - server', [{ header: 'Measure', key: 'a', ...W(46) }, { header: 'Value', key: 'b', ...W(110) }], serverRows.map((r) => ({ a: r[0], b: r[1] })));

  if (browser.length) {
    sheet(wb, 'Real site - browser check', [
      { header: 'Device', key: 'profile', ...W(32) }, { header: 'Page', key: 'path', ...W(24) }, { header: 'First paint (ms)', key: 'fcp', ...W(14) }, { header: 'Main content shown (ms)', key: 'lcp', ...W(18) }, { header: 'Fully loaded (ms)', key: 'load', ...W(15) },
      { header: 'Downloaded (KB)', key: 'kb', ...W(14) }, { header: 'Files', key: 'files', ...W(8) }, { header: 'Layout jump (CLS)', key: 'cls', ...W(14) }, { header: 'Failed requests', key: 'failed', ...W(40) }, { header: 'Errors in the console', key: 'errors', ...W(46) },
    ], browser.map((b) => ({ profile: b.profile, path: b.path, fcp: b.fcp ? Math.round(b.fcp) : '-', lcp: b.lcp ? Math.round(b.lcp) : '-', load: Math.round(b.load), kb: b.transferKB ?? '-', files: b.resources, cls: b.cls == null ? '-' : +b.cls.toFixed(3), failed: b.failed.join('; ') || '-', errors: b.errors.join('; ') || '-' })));
  }

  sheet(wb, 'Not tested - limits', [{ header: 'Area', key: 'a', ...W(34) }, { header: 'Why it was not tested', key: 'b', ...W(80) }, { header: 'How to test it', key: 'c', ...W(70) }], [
    { a: 'Logged-in users on the REAL site', b: 'I must not type passwords, and creating 250 accounts would send 250 e-mails through Firebase / Resend and fill your real database.', c: 'Use the ready k6 script: raise API_RATE_LIMIT_PER_MIN on Render for the test only, give a normal test student (never the admin), see loadtest/README.md "100 users on the live site". I can add a 250-user profile.' },
    { a: 'Real Firebase login (what students use)', b: 'Needs real accounts. The local test used the local password login (bcrypt), which is only used by admin / test accounts.', c: 'Same as above, with a few real test accounts: measure login time at 10-20 at once.' },
    { a: 'Video upload / playback from storage', b: 'Real storage (Cloudflare R2) and 100 MB files; not part of a safe test.', c: 'Upload 3 lessons by hand from 3 teachers at the same time and time them; play 50 videos at once on a phone network.' },
    { a: 'AI: questions and worksheets from a video', b: 'Spends your Gemini quota. The AI key was switched off in the local copy, so those calls took the fall-back path.', c: 'Count calls first: the free daily quota is about 20 worksheets/day per project (see the earlier Gemini answer).' },
    { a: 'Real Render server under logged-in load', b: 'Free plan, shared with real students; the API limit of 200 requests/min per address blocks a single computer.', c: 'Run during the night, with the limit raised, and watch Render > Metrics.' },
    { a: 'Real phones', b: 'Only an emulated phone (4x slower CPU, fast 4G) was used on the browser check.', c: 'Open the site on 3 real phones (an old iPhone, a mid Android) and record the screen.' },
  ]);
  await wb.xlsx.writeFile(ROOT + 'docs/stress-test-report.xlsx');

  // ============================================================== BUG REPORT
  const bugs = [
    { id: 1, sev: 'High', area: 'Points / leaderboard', title: 'Points can be farmed by repeating a quiz', what: 'Submitting the same lesson quiz again and again pays points every time, with no limit. The first submission also reveals the right answers, so a script can send perfect answers forever.', evidence: 'Local copy: 10 perfect re-submissions of one quiz paid 3 points each (+30). 20 submissions of a lesson with no questions paid +1 each. At the 200-requests-per-minute limit that is about 600 points per minute for one person. Not tried on the live site (needs a login).', fix: 'Pay quiz points once per lesson (or once per hour), cap points per day, and do not pay for a lesson with no questions. Also look at why "other" is 60% of all points on the admin dashboard (it may already contain farmed points).', where: 'backend/src/routes/reels.ts  POST /:reelId/submit' },
    { id: 2, sev: 'High', area: 'Schools / limits', title: 'One school network can lock all its students out', what: 'Logins are limited to 20 per 15 minutes per internet address, and the whole API to 200 requests per minute per address. A class of 30 students on the school Wi-Fi shares one address.', evidence: 'Local: the 18th login from one address was refused (429). Real site: with 250 visitors from one address, 1,151 of 4,346 API calls (26%) were refused. Also not verified: whether Render sees each student\'s own address (TRUST_PROXY_HOPS=2); if not, all students would share ONE address.', fix: 'Limit logins per username as well as per address and raise the per-address limit (for example 1,000 per minute); for logged-in requests count per user, not per address. Check the TRUST_PROXY_HOPS setting on Render.', where: 'backend/src/middleware/rateLimit.ts, backend/src/index.ts' },
    { id: 3, sev: 'Medium', area: 'Login speed', title: 'A login rush freezes the server for everyone', what: 'Password login uses bcrypt running in the main thread. When 250 people log in within 20 seconds the slowest waited about 49 seconds and every other request was stuck behind them (some pages waited 5 to 50 seconds).', evidence: 'Local 250-user test: login median 38 s, p95 49 s. GET /users/me slowest 50 s, GET /auth/me p95 4.9 s, while normal requests were 5 ms median. Real students use Firebase, so this mostly affects admin and test accounts, but on the free Render plan (a fraction of a core) it would be worse.', fix: 'Run the password check in a worker thread or use the native bcrypt package. Remove the dev_student / dev_teacher accounts from production (they use this path and are visible in the admin list).', where: 'backend/src/routes/auth.ts, backend/src/lib/password.ts' },
    { id: 4, sev: 'Medium', area: 'Lessons', title: 'Lessons with no video or no questions are still sent to students', what: 'The lessons feed returns every lesson of the grade, including ones with no video or no questions. Like answers "Lesson not found" for them, but watch and submit are accepted (and pay points). The screen hides them, the API does not.', evidence: 'Local replay: lesson without video: watch 200, like 404, submit 200 with +1 point. About 2.7% of all requests in the 250-user test were 4xx because of this.', fix: 'Filter the feed (and watch / submit) to lessons that have a playable video and at least one question.', where: 'backend/src/routes/reels.ts  GET /feed, POST /:id/watch, /submit' },
    { id: 5, sev: 'Medium', area: 'Real-site speed', title: 'Every API call takes about 280-310 ms even when it does nothing', what: 'The simplest call (/api/health) takes about 280 ms from Qatar on the real site, while pages and files come back in 70-230 ms. A screen that makes 6 calls one after another waits about 1.7 s just for the trips.', evidence: 'Real-site test: API median 279-315 ms at every load level (also with 1 visitor), pages median 68-128 ms. Not caused by load.', fix: 'Check the Render region (choose the one closest to your users), make the app start its calls in parallel, and cache what rarely changes.', where: 'Render settings, frontend start-up calls' },
    { id: 6, sev: 'Low', area: 'Lessons feed', title: 'The lessons feed has no paging', what: 'One call returns every lesson of the grade with all its questions, in random order each time.', evidence: '17 lessons = 23.8 KB. At 1,000 lessons this would be about 1.4 MB every time a student opens Reels.', fix: 'Send the first 10-20 lessons and load more when scrolling.', where: 'backend/src/routes/reels.ts  GET /feed' },
    { id: 7, sev: 'Low', area: 'Test scripts', title: 'The old k6 script calls a page that no longer exists', what: 'loadtest/stress.js asks for /api/news, which answers 404, so its "app_failures" result would be wrong.', evidence: 'curl /api/news returns 404.', fix: 'Remove that call (the new full-250.js does not use it).', where: 'loadtest/stress.js' },
    { id: 8, sev: 'Low', area: 'Teachers', title: 'A teacher can create a lesson with no video or questions by calling the API directly', what: 'The new form requires them, but the server accepts lessons without questions, which feeds bug #1 and #4.', evidence: 'The 250-user test created and deleted 965 lessons of this kind without problems.', fix: 'Validate on the server too: at least one question before the lesson is shown to students.', where: 'backend/src/routes/teacherReels.ts' },
    { id: 9, sev: 'Low', area: 'Real-site content', title: 'Items seen on the live admin earlier today (not from the load test)', what: '(a) Two lessons are listed twice (the fractions ones). (b) The accounts dev_student and dev_teacher are listed with the real students. (c) 124 visits to the /404 page in 30 days. (d) "Other" is 60% of all points.', evidence: 'Seen on the live admin pages (Videos, Users, Reports, Dashboard).', fix: 'Delete the duplicates, hide / remove the test accounts, log which paths cause the 404s, and name the point sources.', where: 'Admin pages' },
  ];
  const bb = new ExcelJS.Workbook();
  sheet(bb, 'Bugs and slow spots', [
    { header: '#', key: 'id', ...W(5) }, { header: 'Severity', key: 'sev', ...W(10) }, { header: 'Area', key: 'area', ...W(20) }, { header: 'Problem', key: 'title', ...W(42) }, { header: 'What happens', key: 'what', ...W(70) },
    { header: 'Evidence (what I measured)', key: 'evidence', ...W(70) }, { header: 'Suggested fix', key: 'fix', ...W(60) }, { header: 'Where in the code', key: 'where', ...W(40) },
  ], bugs, { colorCol: 2 });
  const lag = [];
  for (const c of calls.slice(0, 12)) lag.push({ call: c.name, what: WHAT[c.name] || '', p95: Math.round(c.p95), p99: Math.round(c.p99), max: Math.round(c.max), note: c.name === 'login' ? 'Login rush: see bug #3' : c.p95 > 1000 ? 'Slowed down while the logins were running (bug #3)' : '' });
  sheet(bb, 'Slowest calls - local 250', [{ header: 'Call', key: 'call', ...W(18) }, { header: 'What the user does', key: 'what', ...W(52) }, { header: 'p95 (ms)', key: 'p95', ...W(10) }, { header: 'p99 (ms)', key: 'p99', ...W(10) }, { header: 'Slowest (ms)', key: 'max', ...W(12) }, { header: 'Note', key: 'note', ...W(52) }], lag);
  if (browser.length) {
    const problems = browser.filter((b) => b.failed.length || b.errors.length || b.cls > 0.1 || b.lcp > 2500);
    sheet(bb, 'Real-site pages with issues', [{ header: 'Device', key: 'profile', ...W(32) }, { header: 'Page', key: 'path', ...W(24) }, { header: 'Main content (ms)', key: 'lcp', ...W(16) }, { header: 'Layout jump', key: 'cls', ...W(12) }, { header: 'Failed requests', key: 'failed', ...W(46) }, { header: 'Console errors', key: 'errors', ...W(50) }],
      (problems.length ? problems : browser.slice(0, 0)).map((b) => ({ profile: b.profile, path: b.path, lcp: Math.round(b.lcp), cls: +b.cls.toFixed(3), failed: b.failed.join('; ') || '-', errors: b.errors.join('; ') || '-' })));
  }
  await bb.xlsx.writeFile(ROOT + 'docs/bug-report.xlsx');
  console.log('reports written; bugs:', bugs.length, '| browser rows:', browser.length);
})();
