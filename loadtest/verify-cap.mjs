// The daily points cap: a server started with DAILY_XP_CAP=20. A student solves worksheets (they pay per correct answer) and we count what was really paid today.
import { DatabaseSync } from 'node:sqlite';
const BASE = 'http://localhost:4102';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'anees' };
let cookie = '';
async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { ...H, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, json: null }; }
}
const login = await call('POST', '/api/auth/login', { username: 'lt_cap01', password: 'LoadTest#2026' });
const earned = [];
for (let i = 0; i < 25; i++) {
  const ws = (await call('GET', '/api/worksheets/videos')) && (await call('POST', '/api/worksheets/generate', { subject: 'math', difficulty: 'easy' })).json;
  if (!ws || !ws.worksheetId) continue;
  // answer with a guess: every question gets choice 0 (some will be right)
  const r = await call('POST', `/api/worksheets/${ws.worksheetId}/submit`, { answers: ws.questions.map((q) => ({ questionId: q.id, choiceIndex: Math.floor(Math.random() * 4) })) });
  earned.push(r.json && typeof r.json.xpEarned === 'number' ? r.json.xpEarned : '?');
}
const db = new DatabaseSync('C:/Mahmoud_Emad/TFQ_Project_v1/anees/backend/data/app.db');
const uid = login.json.user.id;
const paid = db.prepare("SELECT COALESCE(SUM(amount),0) AS n, COUNT(*) AS c FROM xp_events WHERE user_id = ? AND amount > 0 AND created_at >= date('now')").get(uid);
console.log('payout of each worksheet:', earned.join(' '));
console.log(`points really paid today: ${paid.n} in ${paid.c} payouts (the cap is 20)`);
console.log(paid.n <= 20 && paid.n > 0 ? 'PASS  the daily cap stops payouts at the limit' : 'FAIL');
