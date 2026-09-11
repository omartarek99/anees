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

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

const PAGE_SIZE = 20;

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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  res.json({ users: pageUsers, total, page: Math.min(page, totalPages), totalPages, pageSize: PAGE_SIZE });
});

adminRouter.patch('/users/:id/active', requireCsrfHeader, validateBody(adminSetActiveSchema), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't deactivate your own account." });
    return;
  }
  const { isActive } = req.body as { isActive: boolean };
  const result = db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, targetId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId);
  res.json({ user: adminUser(row) });
});

adminRouter.patch('/users/:id/role', requireCsrfHeader, validateBody(adminSetRoleSchema), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't change your own role." });
    return;
  }
  const { role } = req.body as { role: 'student' | 'teacher' | 'admin' };
  const result = db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, targetId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId);
  res.json({ user: adminUser(row) });
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
  const result = db
    .prepare(
      `UPDATE users SET warning_message = ?, warning_issued_at = ? WHERE id = ?`
    )
    .run(message, message ? new Date().toISOString() : null, targetId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId);
  res.json({ user: adminUser(row) });
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
  const result = db.prepare(`UPDATE users SET banned_until = ? WHERE id = ?`).run(bannedUntil, targetId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId);
  res.json({ user: adminUser(row) });
});

adminRouter.patch('/users/:id/xp', requireCsrfHeader, validateBody(adminSetXpSchema), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't edit your own points." });
    return;
  }
  const { totalXp } = req.body as { totalXp: number };
  const result = db.prepare(`UPDATE users SET total_xp = ? WHERE id = ?`).run(totalXp, targetId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId);
  res.json({ user: adminUser(row) });
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page_ = Math.min(page, totalPages);

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

  res.json({ topPaths, daily, totalViews });
});
