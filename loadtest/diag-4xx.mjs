// One grade-5 student does the lesson actions once, printing every answer (to understand the 4xx answers seen in the 250-user run).
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
await call('POST', '/api/auth/login', { username: 'lt_s151', password: 'LoadTest#2026' });
const feed = (await call('GET', '/api/reels/feed')).json;
console.log('feed items:', feed.length, '| without video:', feed.filter((x) => !x.reel.videoUrl).map((x) => x.reel.id).join(',') || 'none');
for (const item of [...feed.filter((x) => !x.reel.videoUrl), ...feed.slice(0, 1)]) {
  const id = item.reel.id;
  const qs = item.questions || item.reel.questions || [];
  console.log(`\nlesson ${id} video=${item.reel.videoUrl ? 'yes' : 'NO'} questions=${qs.length}`);
  for (let i = 0; i < 2; i++) {
    const r = await call('POST', `/api/reels/${id}/watch`, { seconds: 15 });
    console.log('  watch', r.status, r.text.slice(0, 150));
  }
  const l = await call('POST', `/api/reels/${id}/like`, { liked: true });
  console.log('  like', l.status, l.text.slice(0, 100));
  const s = await call('POST', `/api/reels/${id}/submit`, { answers: qs.map((q) => ({ questionId: q.id, choiceIndex: 0 })) });
  console.log('  submit', s.status, s.text.slice(0, 200));
}
