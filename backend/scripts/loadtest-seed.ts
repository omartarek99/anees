// Creates (or removes) the accounts and lessons used by the 250-user load test (loadtest/full-250.js).
//   npx tsx scripts/loadtest-seed.ts seed    200 students (lt_s001..), 50 teachers (lt_t01..), 16 lessons with questions, friend pairs
//   npx tsx scripts/loadtest-seed.ts clean   removes all of it again
// LOCAL DATABASE ONLY: it refuses to run when NODE_ENV=production. Every account shares one password (LOADTEST_PASSWORD).
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../src/db/db.js';
import { encrypt, hashForLookup } from '../src/lib/encryption.js';
import { deleteUserById } from '../src/lib/deleteUser.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run in production.');
  process.exit(1);
}

const PASSWORD = process.env.LOADTEST_PASSWORD ?? 'LoadTest#2026';
const STUDENTS = 200;
const TEACHERS = 50;
const LESSONS = 16;
const pad = (n: number, w: number) => String(n).padStart(w, '0');

function clean() {
  const users = db.prepare(`SELECT id FROM users WHERE username LIKE 'lt\\_%' ESCAPE '\\'`).all() as { id: number }[];
  for (const u of users) deleteUserById(u.id);
  db.prepare(`DELETE FROM reels WHERE title LIKE 'LT lesson %'`).run();
  console.log(`removed ${users.length} test accounts and the test lessons`);
}

function seed() {
  clean();
  // bcrypt cost 12, same as the real accounts, so the login cost is realistic (computed once, shared by every test account)
  const hash = bcrypt.hashSync(PASSWORD, 12);
  const insertUser = db.prepare(
    `INSERT INTO users (username, email, email_hash, password_hash, display_name, avatar_key, total_xp, is_seed, role, grade, school_name, teacher_subject, email_verified)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`
  );
  const ids: { s: number[]; t: number[] } = { s: [], t: [] };
  db.exec('BEGIN');
  for (let i = 1; i <= STUDENTS; i++) {
    const username = `lt_s${pad(i, 3)}`;
    const email = `${username}@loadtest.local`;
    const grade = i % 5 === 0 ? 8 : 5;
    const info = insertUser.run(username, encrypt(email), hashForLookup(email), hash, `Load Student ${i}`, 'owl', (i * 37) % 900, 0, 'student', grade, `Load School ${(i % 12) + 1}`, null);
    ids.s.push(Number(info.lastInsertRowid));
  }
  const subjects = ['math', 'science', 'arabic', 'english'];
  for (let i = 1; i <= TEACHERS; i++) {
    const username = `lt_t${pad(i, 2)}`;
    const email = `${username}@loadtest.local`;
    const info = insertUser.run(username, encrypt(email), hashForLookup(email), hash, `Load Teacher ${i}`, 'owl', 0, 0, 'teacher', null, `Load School ${(i % 12) + 1}`, subjects[i % subjects.length]);
    ids.t.push(Number(info.lastInsertRowid));
  }
  // friend pairs for the challenge test: student 1 with 2, 3 with 4, ...
  const friend = db.prepare(`INSERT OR IGNORE INTO friendships (user_a_id, user_b_id) VALUES (?,?)`);
  for (let i = 0; i + 1 < ids.s.length; i += 2) friend.run(Math.min(ids.s[i], ids.s[i + 1]), Math.max(ids.s[i], ids.s[i + 1]));

  // a realistic lesson library for grade 5 (the real site has about 16 lessons), 5 questions each, written by the first test teacher
  const subj = db.prepare(`SELECT id FROM subjects ORDER BY id LIMIT 1`).get() as { id: number };
  const level = db.prepare(`SELECT id FROM map_levels ORDER BY level_number LIMIT 1`).get() as { id: number };
  const insertReel = db.prepare(`INSERT INTO reels (title, title_ar, grade, subject_id, map_level_id, author_user_id, script_text, duration_sec, video_url) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insertQ = db.prepare(`INSERT INTO reel_questions (reel_id, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, order_in_reel) VALUES (?,?,?,?,?,?,?,?)`);
  for (let l = 1; l <= LESSONS; l++) {
    const r = insertReel.run(`LT lesson ${l}`, `درس تجريبي ${l}`, 5, subj.id, level.id, ids.t[0], 'نص الدرس التجريبي لاختبار الحمل على الموقع.', 45, 'https://example.invalid/loadtest.mp4');
    const reelId = Number(r.lastInsertRowid);
    for (let q = 1; q <= 5; q++) {
      insertQ.run(reelId, `Question ${q} of lesson ${l}?`, `السؤال ${q} من الدرس ${l}؟`, JSON.stringify(['A', 'B', 'C', 'D']), JSON.stringify(['أ', 'ب', 'ج', 'د']), (q + l) % 4, 'Because.', q);
    }
  }
  db.exec('COMMIT');
  console.log(`seeded ${ids.s.length} students, ${ids.t.length} teachers, ${LESSONS} lessons (password in LOADTEST_PASSWORD or the default)`);
}

const cmd = process.argv[2];
if (cmd === 'seed') seed();
else if (cmd === 'clean') clean();
else console.log('usage: tsx scripts/loadtest-seed.ts seed|clean');
