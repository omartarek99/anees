// Local copy only: does repeating the same quiz keep paying points? (a student account made for the load test)
const BASE = 'http://localhost:4100';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'anees' };
let cookie = '';
async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { ...H, Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
await call('POST', '/api/auth/login', { username: 'lt_s152', password: 'LoadTest#2026' });
const me0 = (await call('GET', '/api/users/me')).json.profile.totalXp;
const feed = (await call('GET', '/api/reels/feed')).json;
const item = feed.find((x) => x.reel.videoUrl);
const qs = item.questions || item.reel.questions || [];
const total = [];
for (let i = 0; i < 20; i++) {
  // answer every question correctly would need the key; wrong answers are enough to see whether points are paid or lost
  const r = await call('POST', `/api/reels/${item.reel.id}/submit`, { answers: qs.map((q) => ({ questionId: q.id, choiceIndex: 0 })) });
  total.push(`${r.json?.xpEarned ?? '?'}/-${r.json?.xpLost ?? '?'}`);
}
const empty = feed.find((x) => !x.reel.videoUrl);
const gains = [];
if (empty) for (let i = 0; i < 20; i++) gains.push((await call('POST', `/api/reels/${empty.reel.id}/submit`, { answers: [] })).json?.xpEarned);
const me1 = (await call('GET', '/api/users/me')).json.profile.totalXp;
console.log('XP before', me0, 'after', me1);
console.log('20 repeated quiz submissions (earned/lost each):', total.join(' '));
console.log('20 submissions of an empty lesson (earned each):', gains.join(' '));

// the first submission reveals the right answers; does submitting them over and over keep paying?
const first = await call('POST', `/api/reels/${item.reel.id}/submit`, { answers: qs.map((q) => ({ questionId: q.id, choiceIndex: 0 })) });
const key = Object.fromEntries((first.json.results || []).map((r) => [r.questionId, r.correctIndex]));
const perfect = qs.map((q) => ({ questionId: q.id, choiceIndex: key[q.id] ?? 0 }));
const xpA = (await call('GET', '/api/users/me')).json.profile.totalXp;
const earned = [];
for (let i = 0; i < 10; i++) {
  const r = await call('POST', `/api/reels/${item.reel.id}/submit`, { answers: perfect });
  earned.push(`${r.json?.xpEarned}/${r.json?.stars}★`);
}
const xpB = (await call('GET', '/api/users/me')).json.profile.totalXp;
console.log('10 perfect re-submissions of the SAME quiz (earned/stars):', earned.join(' '));
console.log('XP', xpA, '->', xpB, '(+' + (xpB - xpA) + ' from repeating one quiz)');
