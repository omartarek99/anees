// How long does a REAL (Firebase) student login take on the live site? Logs in as ONE test student you made, 5 times one after another, then 4 at the same moment.
// Total 9 logins: the site allows 10 per username per 15 minutes, so do not run it twice in a row. The password is read from the terminal, never printed or saved.
//   $env:TEST_STUDENT = "Test_Student"
//   $s = Read-Host "Password" -AsSecureString
//   $env:TEST_STUDENT_PASS = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
//   node loadtest/live-student-login.mjs
import { writeFileSync } from 'node:fs';

const API = 'https://anees-01h6.onrender.com';
const user = process.env.TEST_STUDENT;
const pass = process.env.TEST_STUDENT_PASS;
if (!user || !pass) { console.error('Set TEST_STUDENT and TEST_STUDENT_PASS first (see the top of this file).'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length / 1000).toFixed(2);

async function login() {
  const t0 = performance.now();
  let status = 0;
  try {
    const res = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'anees', 'User-Agent': 'anees-check/1.0' }, body: JSON.stringify({ username: user, password: pass }), signal: AbortSignal.timeout(60000) });
    status = res.status;
    await res.arrayBuffer();
  } catch { status = -1; }
  return { status, ms: performance.now() - t0 };
}

const one = [];
for (let i = 0; i < 5; i++) { one.push(await login()); await sleep(1500); }
console.log('one at a time:', one.map((r) => `${r.status} ${(r.ms / 1000).toFixed(2)}s`).join(' | '));
console.log(`average: ${avg(one.map((r) => r.ms))} s per login`);
if (one.some((r) => r.status !== 200)) console.log('NOTE: not every login answered 200 (wrong password, or the account needs email confirmation). The times above still show the cost of a failed login.');

const t0 = performance.now();
const rush = await Promise.all(Array.from({ length: 4 }, () => login()));
const took = performance.now() - t0;
console.log('4 at the same moment:', rush.map((r) => `${r.status} ${(r.ms / 1000).toFixed(2)}s`).join(' | '));
console.log(`average: ${avg(rush.map((r) => r.ms))} s, all done in ${(took / 1000).toFixed(2)} s`);
writeFileSync(new URL('./live-student-login-result.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), oneAtATime: one.map((r) => ({ status: r.status, ms: Math.round(r.ms) })), fourAtOnce: rush.map((r) => ({ status: r.status, ms: Math.round(r.ms) })) }, null, 2));
console.log('saved loadtest/live-student-login-result.json');
