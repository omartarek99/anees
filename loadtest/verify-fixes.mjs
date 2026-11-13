// Checks each fix against a local server that has the REAL limits switched on (port 4101). Needs the test accounts (backend/scripts/loadtest-seed.ts seed).
const BASE = process.env.BASE || 'http://localhost:4101';
const PASS = 'LoadTest#2026';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'anees' };
const out = [];
const log = (name, ok, detail) => { out.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };

class Client {
  constructor() { this.cookie = ''; }
  async call(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, { method, headers: { ...H, ...headers, Cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  }
}
async function login(username, ip) {
  const c = new Client();
  const r = await c.call('POST', '/api/auth/login', { username, password: PASS }, ip ? { 'X-Forwarded-For': ip } : {});
  return { c, status: r.status };
}

// ---------------------------------------------------------------- #1 points farming
{
  const { c } = await login('lt_s151');
  const feed = (await c.call('GET', '/api/reels/feed')).json;
  const item = feed.find((x) => x.reel.videoUrl && (x.questions || x.reel.questions || []).length);
  const qs = item.questions || item.reel.questions;
  const xp0 = (await c.call('GET', '/api/users/me')).json.profile.totalXp;
  const first = await c.call('POST', `/api/reels/${item.reel.id}/submit`, { answers: qs.map((q) => ({ questionId: q.id, choiceIndex: 0 })) });
  const key = Object.fromEntries(first.json.results.map((r) => [r.questionId, r.correctIndex]));
  const perfect = qs.map((q) => ({ questionId: q.id, choiceIndex: key[q.id] }));
  const xp1 = (await c.call('GET', '/api/users/me')).json.profile.totalXp;
  const earned = [];
  for (let i = 0; i < 10; i++) { const r = await c.call('POST', `/api/reels/${item.reel.id}/submit`, { answers: perfect }); earned.push(r.json.xpEarned + (r.json.repeated ? 'r' : '')); }
  const xp2 = (await c.call('GET', '/api/users/me')).json.profile.totalXp;
  log('#1 first submission pays', first.json.xpEarned > 0, `earned ${first.json.xpEarned}, lost ${first.json.xpLost}`);
  log('#1 10 perfect re-submissions of the same quiz pay nothing', xp2 === xp1 && earned.every((e) => e.startsWith('0')), `points ${xp1} -> ${xp2}; each: ${earned.join(' ')}`);
  const stars = (await c.call('POST', `/api/reels/${item.reel.id}/submit`, { answers: perfect })).json.stars;
  log('#1 the result and stars are still shown on a retry', stars === 3, `stars ${stars}`);
}

// ---------------------------------------------------------------- #4 lessons without a video
{
  const { c } = await login('lt_s152');
  const feed = (await c.call('GET', '/api/reels/feed')).json;
  const noVideo = feed.filter((x) => !x.reel.videoUrl);
  log('#4 the lessons list has no lesson without a video', noVideo.length === 0, `${feed.length} lessons, ${noVideo.length} without video`);
  const { c: t } = await login('lt_t01');
  const sub = (await t.call('GET', '/api/teacher-reels/options')).json.subjects[0].id;
  const made = await t.call('POST', '/api/teacher-reels', { subjectId: sub, grade: 5, title: 'LT no video lesson', titleAr: '', scriptText: 'Text text text.', scriptTextAr: '', questions: [{ questionText: 'Two plus two?', questionTextAr: '', choices: ['3', '4', '5', '6'], choicesAr: ['', '', '', ''], correctIndex: 1, explanation: 'Because.', explanationAr: '' }] });
  const id = made.json && made.json.id;
  const w = await c.call('POST', `/api/reels/${id}/watch`, { seconds: 10 });
  const s = await c.call('POST', `/api/reels/${id}/submit`, { answers: [] });
  const l = await c.call('POST', `/api/reels/${id}/like`, { liked: true });
  log('#4 watch / quiz / like on a lesson without a video are all refused (404)', w.status === 404 && s.status === 404 && l.status === 404, `watch ${w.status}, submit ${s.status}, like ${l.status}`);
  await t.call('DELETE', `/api/teacher-reels/${id}`);
}

// ---------------------------------------------------------------- #8 a lesson needs a question
{
  const { c: t } = await login('lt_t02');
  const sub = (await t.call('GET', '/api/teacher-reels/options')).json.subjects[0].id;
  const r = await t.call('POST', '/api/teacher-reels', { subjectId: sub, grade: 5, title: 'LT lesson without questions', titleAr: '', scriptText: 'Text text text.', scriptTextAr: '', questions: [] });
  log('#8 creating a lesson with no questions is refused by the server', r.status === 400, `${r.status} ${r.text.slice(0, 80)}`);
}

// ---------------------------------------------------------------- #2 the login limits
{
  // a class of 30 students on one school address (the same X-Forwarded-For is not trusted locally, so every call comes from 127.0.0.1)
  const results = [];
  for (let i = 1; i <= 30; i++) results.push((await login(`lt_s${String(100 + i).padStart(3, '0')}`)).status);
  log('#2 30 different students logging in from ONE address all get in', results.every((s) => s === 200), `statuses: ${[...new Set(results)].join(',')}  (before the fix the 18th was refused)`);
  const bad = new Client();
  const codes = [];
  for (let i = 0; i < 14; i++) codes.push((await bad.call('POST', '/api/auth/login', { username: 'lt_s190', password: 'wrong-password-1' })).status);
  const stopsAt = codes.findIndex((c) => c === 429) + 1;
  log('#2 guessing the password of ONE account is still stopped', stopsAt > 0 && stopsAt <= 12, `blocked from attempt ${stopsAt || 'never'}`);
  const fine = await login('lt_s191');
  log('#2 other accounts on the same address are not affected by that', fine.status === 200, `status ${fine.status}`);
}

// ---------------------------------------------------------------- #2 the API limit counts each signed-in person on their own
{
  const a = (await login('lt_s160')).c;
  const b = (await login('lt_s161')).c;
  let aLimited = 0;
  for (let i = 0; i < 340; i++) if ((await a.call('GET', '/api/auth/me')).status === 429) aLimited++;
  const bStatus = (await b.call('GET', '/api/auth/me')).status;
  log('#2 one person making 340 calls in a few seconds is limited, another person on the same address is not', aLimited > 0 && bStatus === 200, `first person refused ${aLimited} times, second person status ${bStatus}`);
}

const failed = out.filter((o) => !o.ok);
console.log(`\n${out.length - failed.length} of ${out.length} checks passed`);
process.exit(failed.length ? 1 : 0);
