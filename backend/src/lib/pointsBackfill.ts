import { db } from '../db/db.js';
import { syncTeacherPoints } from './xp.js';

// The monthly leaderboard (routes/leaderboard.ts) adds up each student's points history (xp_events), not their total. Before the admin points
// edit started writing to that history (routes/admin.ts PATCH /users/:id/xp), the points an admin gave only changed users.total_xp, so those
// students' monthly score never moved. This runs once per database, at start-up: a student whose total is higher than everything in their
// history gets the difference added to the history now -- it then counts in the current month. Everything students earn themselves is logged
// as it happens, so such a gap can only come from an admin edit; demo accounts (is_seed) are left alone.
export function backfillAdminPoints() {
  db.exec(`CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  if (db.prepare(`SELECT 1 FROM app_flags WHERE key = 'admin_points_backfill'`).get()) return;

  const gaps = db
    .prepare(
      `SELECT u.id, u.total_xp - COALESCE((SELECT SUM(e.amount) FROM xp_events e WHERE e.user_id = u.id), 0) AS gap
       FROM users u WHERE u.role = 'student' AND u.is_seed = 0`
    )
    .all() as { id: number; gap: number }[];
  const add = db.prepare(`INSERT INTO xp_events (user_id, amount, reason) VALUES (?, ?, 'admin_adjust')`);
  let fixed = 0;
  db.exec('BEGIN');
  try {
    for (const g of gaps) {
      if (g.gap > 0) {
        add.run(g.id, g.gap);
        fixed++;
      }
    }
    db.prepare(`INSERT INTO app_flags (key, value) VALUES ('admin_points_backfill', '1')`).run();
    db.exec('COMMIT');
    if (fixed > 0) console.log(`[points] Added points an admin gave earlier to the monthly history of ${fixed} student(s).`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[points] Could not backfill admin points:', err);
  }
}

// Teacher points used to be paid per action (a worksheet printed, every 30 seconds of video uploaded) and are now counted from what the teacher made
// (lib/xp.ts syncTeacherPoints). Once per database, at start-up: every row but an admin's leaves the points history (when this runs, each such row
// is either a legacy print/upload row or one written earlier in this boot, e.g. by seed's lesson import, which the recount would count again), each
// teacher is put back to only what an admin gave or took, and the recount adds their lessons, likes and solved worksheets on top -- one
// 'creator_recount' row each, which counts in the month it runs.
export function recountTeacherPoints() {
  const job = 'teacher-points-creator-2026-11';
  if (db.prepare(`SELECT 1 FROM one_time_jobs WHERE name = ?`).get(job)) return;
  db.exec('BEGIN');
  try {
    db.exec(`DELETE FROM teacher_point_events WHERE reason != 'admin_adjust'`);
    db.exec(
      `UPDATE users SET teacher_points = (SELECT COALESCE(SUM(e.amount), 0) FROM teacher_point_events e WHERE e.user_id = users.id AND e.reason = 'admin_adjust')
       WHERE role = 'teacher'`
    );
    const teachers = db.prepare(`SELECT id FROM users WHERE role = 'teacher'`).all() as { id: number }[];
    for (const t of teachers) syncTeacherPoints(t.id, 'creator_recount');
    db.prepare(`INSERT INTO one_time_jobs (name) VALUES (?)`).run(job);
    db.exec('COMMIT');
    console.log(`[points] Recounted the points of ${teachers.length} teacher(s) from their lessons, likes and solved worksheets.`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[points] Could not recount teacher points:', err);
  }
}
