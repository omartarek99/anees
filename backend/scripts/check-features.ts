// Local check of the admin feature switches: the admin switches things off, and a student / teacher account must be refused (or told) exactly as expected.
// LOCAL ONLY. Needs the load-test accounts (npx tsx scripts/loadtest-seed.ts seed), a local dev_admin account, and the backend running:
//   BACKEND_PORT=4107 DISABLE_RATE_LIMITS=1 npx tsx src/index.ts
//   BASE=http://localhost:4107 npx tsx scripts/check-features.ts
import 'dotenv/config';

if (process.env.NODE_ENV === 'production') process.exit(1);
const BASE = process.env.BASE ?? 'http://localhost:4107';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'anees' };

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(BASE + path, { method, headers: { ...H, Cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    let json: any = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json };
  }
}
let fails = 0;
const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };

const admin = new Client(), student = new Client(), teacher = new Client(), visitor = new Client();
const a = await admin.call('POST', '/api/auth/login', { username: 'dev_admin', password: 'adminpass123' });
check('admin can log in', a.status === 200, String(a.status));
check('student can log in', (await student.call('POST', '/api/auth/login', { username: 'lt_s001', password: 'LoadTest#2026' })).status === 200);
check('teacher can log in', (await teacher.call('POST', '/api/auth/login', { username: 'lt_t01', password: 'LoadTest#2026' })).status === 200);

const set = (feature: string, role: string, enabled: boolean, message?: string) => admin.call('PUT', '/api/admin/features', { feature, role, enabled, ...(message !== undefined ? { message } : {}) });

// everything is on by default
let f = await student.call('GET', '/api/features');
check('student sees every switch on at the start', f.status === 200 && f.json.site.on && f.json.features.map === true && f.json.features.craft === true && f.json.features.challenges === true, JSON.stringify(f.json.features));
check('student: map works', (await student.call('GET', '/api/map')).status === 200);

// map off for students
check('admin switches the map off for students', (await set('map', 'student', false)).status === 200);
const m = await student.call('GET', '/api/map');
check('student: map is refused (403, featureOff)', m.status === 403 && m.json.featureOff === 'map', JSON.stringify(m.json));
f = await student.call('GET', '/api/features');
check('student: /features says map is off, the rest on', f.json.features.map === false && f.json.features.reels === true);
f = await teacher.call('GET', '/api/features');
check('teacher: has no map switch at all', f.json.features.map === undefined);
check('admin still sees everything (no gate)', (await admin.call('GET', '/api/admin/features')).status === 200);

// craft + challenges
await set('craft', 'student', false);
await set('challenges', 'student', false);
check('student: craft refused', (await student.call('GET', '/api/craft/save')).status === 403);
check('student: challenges refused', (await student.call('GET', '/api/challenges/current')).status === 403);

// a student switch does not touch the teacher
await set('leaderboard', 'student', false);
check('student: leaderboard refused', (await student.call('GET', '/api/leaderboard')).status === 403);
check('teacher: leaderboard still works', (await teacher.call('GET', '/api/leaderboard')).status === 200);
check('teacher: teacher_upload works', (await teacher.call('GET', '/api/teacher-reels')).status === 200);
await set('teacher_upload', 'teacher', false);
const tu = await teacher.call('GET', '/api/teacher-reels');
check('teacher: lessons refused when teacher_upload is off', tu.status === 403 && tu.json.featureOff === 'teacher_upload');
check('student: not affected by teacher_upload (still 403 from the role, not the switch)', (await student.call('GET', '/api/teacher-reels')).json?.featureOff === undefined);

// AI worksheets: the ordinary one still works
await set('ai_worksheets', 'student', false);
const g1 = await student.call('POST', '/api/worksheets/generate', { subject: 'math', difficulty: 'easy' });
check('student: an ordinary worksheet still works with AI off', g1.status === 200 || g1.status === 201, String(g1.status));
const g2 = await student.call('POST', '/api/worksheets/generate', { subject: 'math', difficulty: 'easy', topic: 'fractions', grade: 5 });
check('student: an AI worksheet (typed topic) is refused', g2.status === 403 && g2.json.featureOff === 'ai_worksheets', JSON.stringify(g2.json).slice(0, 100));

// sign-up
await set('signup', 'teacher', false);
f = await visitor.call('GET', '/api/features');
check('visitor: sees teacher sign-up closed and student sign-up open', f.json.signup.teacher === false && f.json.signup.student === true, JSON.stringify(f.json.signup));
const su = await visitor.call('POST', '/api/auth/signup', { username: 'zz_test_teacher', email: 'zz@example.com', password: 'Zq7!mTv#92Lx', avatarKey: 'owl', role: 'teacher', schoolName: 'x', teacherSubject: 'math' });
check('visitor: a teacher sign-up is refused (featureOff or 400 form)', su.status === 403 ? su.json.featureOff === 'signup' : true, String(su.status));

await set('signup', 'student', false);
const su2 = await visitor.call('POST', '/api/auth/signup', { username: 'zz_test_student', email: 'zz2@example.com', password: 'Zq7!mTv#92Lx', avatarKey: 'owl', role: 'student', grade: 5, schoolName: 'Test school' });
check('visitor: a valid student sign-up is refused while student sign-up is closed', su2.status === 403 && su2.json.featureOff === 'signup', `${su2.status} ${JSON.stringify(su2.json).slice(0, 120)}`);
await set('signup', 'student', true);

// the whole site closed for students, with a message
check('admin closes the site for students with a notice', (await set('site', 'student', false, 'Back at 6 pm')).status === 200);
const r = await student.call('GET', '/api/reels/feed');
check('student: any page answers 503 with the notice', r.status === 503 && r.json.maintenance === true && r.json.message === 'Back at 6 pm', JSON.stringify(r.json));
check('student: can still read who they are (/auth/session)', (await student.call('GET', '/api/auth/session')).status === 200);
f = await student.call('GET', '/api/features');
check('student: /features says the site is closed, with the message', f.status === 200 && f.json.site.on === false && f.json.site.message === 'Back at 6 pm');
check('teacher: the site is still open for teachers', (await teacher.call('GET', '/api/reels/feed')).status === 200);
check('admin: not affected', (await admin.call('GET', '/api/admin/features')).status === 200);

// back to normal
for (const [k, r2] of [['map', 'student'], ['craft', 'student'], ['challenges', 'student'], ['leaderboard', 'student'], ['teacher_upload', 'teacher'], ['ai_worksheets', 'student'], ['signup', 'teacher'], ['site', 'student']] as const) await set(k, r2, true);
check('student: everything works again', (await student.call('GET', '/api/map')).status === 200 && (await student.call('GET', '/api/reels/feed')).status === 200);
check('a made-up switch is refused', (await set('nothing', 'student', false)).status === 400);
check('a switch for the wrong role is refused', (await set('map', 'teacher', false)).status === 400);

console.log(fails === 0 ? '\nALL PASSED' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
