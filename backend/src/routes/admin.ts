import { Router } from 'express';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCsrfHeader, validateBody } from '../middleware/validate.js';
import {
  adminSetActiveSchema,
  adminSetRoleSchema,
  adminSetWarningSchema,
  adminSetBanSchema,
  adminSetXpSchema,
} from '../lib/schemas.js';
import { deleteUserById } from '../lib/deleteUser.js';
import { isCurrentlyBanned } from '../lib/accountStatus.js';
import { deleteReelVideoIfAny } from '../lib/reelVideo.js';
import { decrypt } from '../lib/encryption.js';
import { WATCH_XP_PER_SECOND } from '../lib/xp.js';

import type { Response } from 'express';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

const PAGE_SIZE = 20;

/** Clamps a requested page number against how many pages actually exist. Shared by every
 * paginated list here (`/users`, `/reports/watch-time`) so "page 1 of however-many" can't
 * drift between them -- e.g. a stray off-by-one wouldn't be free to happen twice. */
function clampPage(requestedPage: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { page: Math.min(Math.max(1, requestedPage), totalPages), totalPages };
}

/** Every PATCH /users/:id/* route below is the same shape once you strip the specific
 * column/value: run an UPDATE, 404 if nothing matched, otherwise re-SELECT and respond with
 * the fresh adminUser(). Only the self-block message and the UPDATE statement itself differ
 * between routes, so those are the only things each caller still supplies. */
function applyUserUpdate(res: Response, targetId: number, runUpdate: () => { changes: number | bigint }) {
  const result = runUpdate();
  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId);
  res.json({ user: adminUser(row) });
}

function adminUser(row: any) {
  return {
    id: row.id,
    username: row.username,
    email: decrypt(row.email),
    displayName: row.display_name,
    role: row.role,
    grade: row.grade,
    totalXp: row.total_xp,
    isActive: !!row.is_active,
    emailVerified: !!row.email_verified,
    warningMessage: row.warning_message ?? null,
    warningIssuedAt: row.warning_issued_at ?? null,
    bannedUntil: row.banned_until ?? null,
    isBanned: isCurrentlyBanned(row.banned_until),
    createdAt: row.created_at,
  };
}

// Role/grade filtering (and the is_seed exclusion) stay in SQL -- cheap, indexed-enough
// filters on a list that grows with every signup. Free-text search can't: `email` is
// encrypted at rest (lib/encryption.ts), so it can't be LIKE-matched in SQL without
// decrypting every row first anyway. At this app's realistic scale (an school's worth of
// accounts, not millions) decrypting the already role/grade-narrowed rows and filtering in
// JS costs microseconds -- not worth a searchable-encryption scheme for that.
adminRouter.get('/users', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const role = typeof req.query.role === 'string' ? req.query.role : '';
  const gradeParam = typeof req.query.grade === 'string' ? Number(req.query.grade) : NaN;
  const page = Math.max(1, Number(req.query.page) || 1);

  // is_seed=1 marks the auto-generated leaderboard-filler accounts (seed.ts) -- they can't
  // even log in (see /login's own is_seed check), so there's nothing for an admin to manage
  // on them; leaving them out keeps this list to real accounts only.
  const clauses: string[] = [`is_seed = 0`];
  const params: (string | number)[] = [];
  if (role === 'student' || role === 'teacher' || role === 'admin') {
    clauses.push(`role = ?`);
    params.push(role);
  }
  if (Number.isInteger(gradeParam)) {
    clauses.push(`grade = ?`);
    params.push(gradeParam);
  }

  const rows = db
    .prepare(`SELECT * FROM users WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`)
    .all(...params) as any[];

  let users = rows.map(adminUser);
  if (search) {
    users = users.filter(
      (u) => u.username.toLowerCase().includes(search) || u.email.toLowerCase().includes(search) || u.displayName.toLowerCase().includes(search)
    );
  }

  const total = users.length;
  const { page: page_, totalPages } = clampPage(page, total);
  const pageUsers = users.slice((page_ - 1) * PAGE_SIZE, page_ * PAGE_SIZE);

  res.json({ users: pageUsers, total, page: page_, totalPages, pageSize: PAGE_SIZE });
});

adminRouter.patch('/users/:id/active', requireCsrfHeader, validateBody(adminSetActiveSchema), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't deactivate your own account." });
    return;
  }
  const { isActive } = req.body as { isActive: boolean };
  applyUserUpdate(res, targetId, () => db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, targetId));
});

adminRouter.patch('/users/:id/role', requireCsrfHeader, validateBody(adminSetRoleSchema), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't change your own role." });
    return;
  }
  const { role } = req.body as { role: 'student' | 'teacher' | 'admin' };
  applyUserUpdate(res, targetId, () => db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, targetId));
});

adminRouter.delete('/users/:id', requireCsrfHeader, async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't delete your own account." });
    return;
  }
  const result = await deleteUserById(targetId);
  if (!result.found) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ ok: true });
});

// Sets or clears (message: null/"") the account's warning banner. No self-block here --
// unlike role/active/delete there's no lockout risk, but self-warning is nonsensical so the
// UI simply doesn't offer it; the backend doesn't need to enforce what isn't dangerous.
adminRouter.patch('/users/:id/warning', requireCsrfHeader, validateBody(adminSetWarningSchema), (req, res) => {
  const targetId = Number(req.params.id);
  const { message } = req.body as { message: string | null };
  applyUserUpdate(res, targetId, () =>
    db
      .prepare(`UPDATE users SET warning_message = ?, warning_issued_at = ? WHERE id = ?`)
      .run(message, message ? new Date().toISOString() : null, targetId)
  );
});

// Timed suspension -- bannedUntil: null lifts it immediately, otherwise an ISO datetime in
// the future. Self-banning would lock the only admin out of the panel with no one able to
// undo it, so (unlike warnings) this one is blocked the same as role/active/delete.
adminRouter.patch('/users/:id/ban', requireCsrfHeader, validateBody(adminSetBanSchema), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't ban your own account." });
    return;
  }
  const { bannedUntil } = req.body as { bannedUntil: string | null };
  applyUserUpdate(res, targetId, () => db.prepare(`UPDATE users SET banned_until = ? WHERE id = ?`).run(bannedUntil, targetId));
});

adminRouter.patch('/users/:id/xp', requireCsrfHeader, validateBody(adminSetXpSchema), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't edit your own points." });
    return;
  }
  const { totalXp } = req.body as { totalXp: number };
  applyUserUpdate(res, targetId, () => db.prepare(`UPDATE users SET total_xp = ? WHERE id = ?`).run(totalXp, targetId));
});

// ---------------------------------------------------------------------------------------
// Video moderation -- every teacher-authored reel (map-level or grade-based), regardless of
// which teacher made it. Seeded/curriculum reels (author_user_id IS NULL) aren't listed here
// since they're platform-authored content, not something to moderate.
// ---------------------------------------------------------------------------------------

function adminReel(row: any) {
  return {
    id: row.id,
    title: row.title,
    titleAr: row.title_ar,
    videoUrl: row.video_url,
    grade: row.grade,
    subjectName: row.subject_name,
    subjectNameAr: row.subject_name_ar,
    authorUsername: row.author_username,
    authorDisplayName: row.author_display_name,
    createdAt: row.created_at,
  };
}

adminRouter.get('/reels', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const clauses: string[] = [`r.author_user_id IS NOT NULL`];
  const params: string[] = [];
  if (search) {
    clauses.push(`(r.title LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const rows = db
    .prepare(
      `SELECT r.*, s.name as subject_name, s.name_ar as subject_name_ar,
              u.username as author_username, u.display_name as author_display_name
       FROM reels r
       JOIN subjects s ON s.id = r.subject_id
       LEFT JOIN users u ON u.id = r.author_user_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY r.id DESC`
    )
    .all(...params) as any[];
  res.json({ reels: rows.map(adminReel) });
});

adminRouter.delete('/reels/:id', requireCsrfHeader, async (req, res) => {
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ? AND author_user_id IS NOT NULL`).get(
    Number(req.params.id)
  ) as any;
  if (!reel) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  await deleteReelVideoIfAny(reel.video_url);
  // reel_questions and reel_watch_progress both cascade on reels(id) -- see schema.sql.
  db.prepare(`DELETE FROM reels WHERE id = ?`).run(reel.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------------------
// Watch-time report -- per-student totals across every reel, real numbers straight from
// reel_watch_progress (the same table routes/reels.ts's own anti-manipulation check
// protects, see its comment), not a separate log an admin has to trust blindly.
// ---------------------------------------------------------------------------------------

adminRouter.get('/reports/watch-time', (req, res) => {
  const gradeParam = typeof req.query.grade === 'string' ? Number(req.query.grade) : NaN;
  const page = Math.max(1, Number(req.query.page) || 1);

  const clauses: string[] = [`u.is_seed = 0`, `u.role = 'student'`];
  const params: (string | number)[] = [];
  if (Number.isInteger(gradeParam)) {
    clauses.push(`u.grade = ?`);
    params.push(gradeParam);
  }

  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM users u WHERE ${clauses.join(' AND ')}`).get(...params) as { c: number }
  ).c;
  const { page: page_, totalPages } = clampPage(page, total);

  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.grade,
              COALESCE(SUM(rwp.watched_seconds), 0) as total_watched_seconds,
              COALESCE(SUM(rwp.xp_awarded), 0) as total_watch_xp,
              COUNT(DISTINCT rwp.reel_id) as reels_watched
       FROM users u
       LEFT JOIN reel_watch_progress rwp ON rwp.user_id = u.id
       WHERE ${clauses.join(' AND ')}
       GROUP BY u.id
       ORDER BY total_watched_seconds DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, PAGE_SIZE, (page_ - 1) * PAGE_SIZE) as any[];

  res.json({
    students: rows.map((r) => ({
      userId: r.id,
      username: r.username,
      displayName: r.display_name,
      grade: r.grade,
      totalWatchedSeconds: Math.round(r.total_watched_seconds),
      totalWatchXp: r.total_watch_xp,
      reelsWatched: r.reels_watched,
    })),
    total,
    page: page_,
    totalPages,
    pageSize: PAGE_SIZE,
  });
});

// Monthly watch-time trend -- reel_watch_progress only ever stores each (user, reel)
// pair's running total plus a single "last touched" timestamp, so it can't say how much
// was watched *in a given month*. xp_events can: every heartbeat that credits watch time
// (routes/reels.ts POST /:reelId/watch) logs its own 'reel_watch' row with a real
// timestamp, and since that XP accrues at the fixed WATCH_XP_PER_SECOND rate, summing it
// per month and dividing back out gives real historical seconds-watched with no new
// tracking table.
function trailingMonthKeys(count: number): string[] {
  const start = new Date();
  start.setUTCDate(1);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// Matches PAGE_SIZE -- the per-student chart is a visual summary, not a replacement for
// the full paginated table above, so it caps at the same "one page" size rather than
// growing its own pagination.
const MONTHLY_STUDENT_CAP = PAGE_SIZE;

adminRouter.get('/reports/watch-time/monthly', (req, res) => {
  const gradeParam = typeof req.query.grade === 'string' ? Number(req.query.grade) : NaN;
  const monthsParam = Number(req.query.months);
  const monthCount = Number.isInteger(monthsParam) ? Math.min(12, Math.max(1, monthsParam)) : 6;
  const months = trailingMonthKeys(monthCount);

  const clauses: string[] = [`u.is_seed = 0`, `u.role = 'student'`, `xe.reason = 'reel_watch'`, `xe.created_at >= ?`];
  const params: (string | number)[] = [`${months[0]}-01 00:00:00`];
  if (Number.isInteger(gradeParam)) {
    clauses.push(`u.grade = ?`);
    params.push(gradeParam);
  }

  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name as displayName, u.grade,
              strftime('%Y-%m', xe.created_at) as month, SUM(xe.amount) as xp
       FROM xp_events xe
       JOIN users u ON u.id = xe.user_id
       WHERE ${clauses.join(' AND ')}
       GROUP BY u.id, month`
    )
    .all(...params) as { id: number; username: string; displayName: string; grade: number | null; month: string; xp: number }[];

  const totalsBySecond = new Array(months.length).fill(0);
  const students = new Map<number, { userId: number; username: string; displayName: string; grade: number | null; monthly: number[] }>();

  for (const row of rows) {
    const monthIndex = months.indexOf(row.month);
    if (monthIndex === -1) continue;
    const seconds = Math.round(row.xp / WATCH_XP_PER_SECOND);
    totalsBySecond[monthIndex] += seconds;
    if (!students.has(row.id)) {
      students.set(row.id, { userId: row.id, username: row.username, displayName: row.displayName, grade: row.grade, monthly: new Array(months.length).fill(0) });
    }
    students.get(row.id)!.monthly[monthIndex] = seconds;
  }

  const ranked = [...students.values()].sort(
    (a, b) => b.monthly.reduce((s, n) => s + n, 0) - a.monthly.reduce((s, n) => s + n, 0)
  );

  res.json({
    months,
    totalsBySecond,
    students: ranked.slice(0, MONTHLY_STUDENT_CAP),
    studentCount: ranked.length,
  });
});

// First-party pageview analytics (see routes/analytics.ts / schema.sql) -- top paths and a
// daily total for the last 30 days. Intentionally just that: this is a usage-visibility
// count, not a marketing-analytics product, so it doesn't grow into referrers/devices/funnels.
adminRouter.get('/analytics/summary', (_req, res) => {
  const topPaths = db
    .prepare(
      `SELECT path, COUNT(*) as views FROM page_views
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY path ORDER BY views DESC LIMIT 20`
    )
    .all() as { path: string; views: number }[];

  const daily = db
    .prepare(
      `SELECT date(created_at) as day, COUNT(*) as views FROM page_views
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY day ORDER BY day ASC`
    )
    .all() as { day: string; views: number }[];

  const totalViews = daily.reduce((sum, d) => sum + d.views, 0);

  // Every reel quiz a real (non-seed) account has ever submitted at least once --
  // quiz_completed is sticky regardless of score (see schema.sql), so this counts attempts
  // solved, not just passed ones.
  const quizzesSolved = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM reel_watch_progress rwp
         JOIN users u ON u.id = rwp.user_id
         WHERE rwp.quiz_completed = 1 AND u.is_seed = 0`
      )
      .get() as { c: number }
  ).c;

  res.json({ topPaths, daily, totalViews, quizzesSolved });
});
