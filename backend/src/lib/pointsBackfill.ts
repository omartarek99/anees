import { db } from '../db/db.js';

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
