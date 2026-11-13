// Local check of the "re-save an old hash at the new cost on login" step. Needs the load-test accounts (loadtest-seed.ts seed) and the backend running locally.
//   BACKEND_PORT=4105 DISABLE_RATE_LIMITS=1 npx tsx src/index.ts      (one terminal)
//   BASE=http://localhost:4105 npx tsx scripts/check-rehash.ts           (another)
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../src/db/db.js';

if (process.env.NODE_ENV === 'production') process.exit(1);
const BASE = process.env.BASE ?? 'http://localhost:4105';
const PASSWORD = process.env.LOADTEST_PASSWORD ?? 'LoadTest#2026';
const U = 'lt_s001';
const rounds = () => bcrypt.getRounds((db.prepare(`SELECT password_hash FROM users WHERE username = ?`).get(U) as { password_hash: string }).password_hash);
const login = async (password: string) => {
  const t0 = performance.now();
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'anees' }, body: JSON.stringify({ username: U, password }) });
  await r.arrayBuffer();
  return { status: r.status, ms: Math.round(performance.now() - t0) };
};

db.prepare(`UPDATE users SET password_hash = ? WHERE username = ?`).run(bcrypt.hashSync(PASSWORD, 12), U);
console.log('before: cost', rounds());
console.log('wrong password:', await login('Wrong-Password-1!'), '-> cost', rounds(), '(must stay 12)');
console.log('right password (old hash):', await login(PASSWORD), '-> cost', rounds(), '(must now be 10)');
console.log('right password again:', await login(PASSWORD), '-> cost', rounds());
