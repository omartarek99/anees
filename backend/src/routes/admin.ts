import { asyncRouter } from '../lib/asyncRouter.js';
import multer from 'multer';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCsrfHeader, validateBody, handleUpload } from '../middleware/validate.js';
import {
  adminSetActiveSchema,
  adminSetRoleSchema,
  adminSetWarningSchema,
  adminSetBanSchema,
  adminSetXpSchema,
  adminAdjustPointsSchema,
  adminIssueCertificateSchema,
  adminRevokeCertificateSchema,
  adminApplyViolationSchema,
} from '../lib/schemas.js';
import { deleteUserById } from '../lib/deleteUser.js';
import { isCurrentlyBanned } from '../lib/accountStatus.js';
import { deleteReelVideoIfAny } from '../lib/reelVideo.js';
import { decrypt } from '../lib/encryption.js';
import { getDoublePointsStatus, startDoublePointsNow } from '../lib/doublePoints.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { looksLikeImage } from '../lib/imageValidation.js';
import { mailStatus } from '../lib/mailer.js';
import { parseRoleFilter, parseGrade, pageViewStats, countReportUsers, queryReportRows, reportTotals, monthlyWatch, trailingMonthKeys, SINCE_30_DAYS, quizzesSolvedTotal, pageViewsLast30Days } from '../lib/reportData.js';
import { buildReportWorkbook } from '../lib/reportExcel.js';
import { recentIssues } from '../lib/diagnostics.js';
import { CERTIFICATE_IMAGE_BUCKET, CERTIFICATE_IMAGE_PATH_PREFIX } from '../lib/certificateImage.js';
import { PLAQUE_PATH, issueRankCertificates, emailCertificate, revokeCertificate } from '../lib/rankCertificates.js';
import { applyViolation } from '../lib/violations.js';
import { getRankTier } from '../lib/ranks.js';
import { noteRankDrop } from '../lib/xp.js';
import { r2SelfTest } from '../lib/r2.js';
import { FRONTEND_ORIGIN } from '../lib/config.js';

import type { Response } from 'express';

export const adminRouter = asyncRouter();

adminRouter.use(requireAuth, requireRole('admin'));

// Admin-only: how email is configured, and the latest failures that users only see as a generic
// message. Never returns secrets (only key lengths/prefixes and error codes).
adminRouter.get('/diagnostics', async (_req, res) => {
  res.json({ mail: await mailStatus(), r2: await r2SelfTest(FRONTEND_ORIGIN), recentIssues: recentIssues(), node: process.version, env: process.env.NODE_ENV ?? null });
});

// Manually kicks off a double-quiz-points window right now, on top of the automatic random
// one -- e.g. to spotlight it during a live class or demo instead of waiting on chance.
adminRouter.post('/double-points/start', requireCsrfHeader, (_req, res) => {
  startDoublePointsNow();
  res.json(getDoublePointsStatus());
});

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
function applyUserUpdate(res: Response, targetId: number, runUpdate: () => { changes: number | bigint }, extra: object = {}) {
  const result = runUpdate();
  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId) as any;
  // Recomputed here too (not just the /users list) -- otherwise a role change or an XP
  // edit would blank out that row's rank badge in the response until the next full reload.
  const rank = row.role === 'student' ? buildRankMap('student').get(row.id) ?? null : row.role === 'teacher' ? buildRankMap('teacher').get(row.id) ?? null : null;
  res.json({ user: adminUser(row, rank), ...extra });
}

function adminUser(row: any, rank: number | null = null) {
  return {
    id: row.id,
    username: row.username,
    email: decrypt(row.email),
    displayName: row.display_name,
    role: row.role,
    grade: row.grade,
    totalXp: row.total_xp,
    teacherPoints: row.teacher_points ?? 0,
    // Ranking among every other real (non-seed) account of the same role, by whichever
    // currency that role actually earns -- total_xp for students, teacher_points for
    // teachers (see lib/xp.ts). Null for admins, who don't have a ranking at all.
    rank,
    isActive: !!row.is_active,
    emailVerified: !!row.email_verified,
    warningMessage: row.warning_message ?? null,
    warningIssuedAt: row.warning_issued_at ?? null,
    // which warning the one showing is (1st, 2nd ...), and every warning this account has been sent
    warningNumber: row.warning_number ?? null,
    warnings: (
      db
        .prepare(
          `SELECT w.warning_number, w.message, w.created_at, a.display_name AS issuer FROM user_warnings w LEFT JOIN users a ON a.id = w.issued_by WHERE w.user_id = ? ORDER BY w.warning_number`
        )
        .all(row.id) as { warning_number: number; message: string; created_at: string; issuer: string | null }[]
    ).map((w) => ({ number: w.warning_number, message: w.message, issuedAt: w.created_at, issuedBy: w.issuer })),
    // the rules this account was recorded breaking (lib/violations.ts), oldest first
    violations: (
      db
        .prepare(
          `SELECT v.*, a.display_name AS issuer FROM user_violations v LEFT JOIN users a ON a.id = v.issued_by WHERE v.user_id = ? ORDER BY v.id`
        )
        .all(row.id) as any[]
    ).map((v) => ({
      key: v.violation,
      offense: v.offense,
      note: v.note,
      pointsRemoved: v.points_removed,
      certificatesRevoked: v.certificates_revoked,
      suspendedDays: v.suspended_days,
      deactivated: !!v.deactivated,
      issuedAt: v.created_at,
      issuedBy: v.issuer,
    })),
    bannedUntil: row.banned_until ?? null,
    isBanned: isCurrentlyBanned(row.banned_until),
    createdAt: row.created_at,
  };
}

// Competition ranking (ties share a rank; the next distinct value skips ahead by the tie
// count) over every real account of one role, by whichever currency that role earns.
// Computed in JS off one full-column read rather than a per-row correlated subquery --
// this app's realistic scale (a school's worth of accounts) makes that trivially cheap,
// and it means the whole page's ranks come from a single query per role, not one per row.
function buildRankMap(role: 'student' | 'teacher'): Map<number, number> {
  const valueCol = role === 'student' ? 'total_xp' : 'teacher_points';
  const rows = db.prepare(`SELECT id, ${valueCol} as v FROM users WHERE role = ? AND is_seed = 0`).all(role) as {
    id: number;
    v: number;
  }[];
  const sorted = [...rows].sort((a, b) => b.v - a.v);
  const map = new Map<number, number>();
  sorted.forEach((row, i) => {
    const rank = i > 0 && sorted[i - 1].v === row.v ? map.get(sorted[i - 1].id)! : i + 1;
    map.set(row.id, rank);
  });
  return map;
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

  // Ranks are computed across ALL real accounts of a role, not just this filtered/paginated
  // page -- otherwise a search or grade filter would silently reshuffle everyone's rank.
  const studentRanks = buildRankMap('student');
  const teacherRanks = buildRankMap('teacher');
  let users = rows.map((row) =>
    adminUser(row, row.role === 'student' ? studentRanks.get(row.id) ?? null : row.role === 'teacher' ? teacherRanks.get(row.id) ?? null : null)
  );
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

// Sends a warning (kept as the account's next numbered one: 1st, 2nd, 3rd ...) or clears (message: null/"") the one showing -- the numbered
// history stays either way. No self-block here --
// unlike role/active/delete there's no lockout risk, but self-warning is nonsensical so the
// UI simply doesn't offer it; the backend doesn't need to enforce what isn't dangerous.
adminRouter.patch('/users/:id/warning', requireCsrfHeader, validateBody(adminSetWarningSchema), (req, res) => {
  const targetId = Number(req.params.id);
  const { message } = req.body as { message: string | null };
  applyUserUpdate(res, targetId, () => {
    if (!message) return db.prepare(`UPDATE users SET warning_message = NULL, warning_issued_at = NULL, warning_number = NULL WHERE id = ?`).run(targetId);
    const last = db.prepare(`SELECT COALESCE(MAX(warning_number), 0) AS n FROM user_warnings WHERE user_id = ?`).get(targetId) as { n: number };
    const number = last.n + 1;
    const now = new Date().toISOString();
    const result = db
      .prepare(`UPDATE users SET warning_message = ?, warning_issued_at = ?, warning_number = ? WHERE id = ?`)
      .run(message, now, number, targetId);
    if (result.changes) db.prepare(`INSERT INTO user_warnings (user_id, warning_number, message, created_at, issued_by) VALUES (?,?,?,?,?)`).run(targetId, number, message, now, req.userId!);
    return result;
  });
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

// Records a rule a student broke and applies its measures (lib/violations.ts): a numbered warning, points off, certificates taken back, a
// suspension or closing the account -- whatever the rule says for this being the 1st, 2nd or 3rd time.
adminRouter.post('/users/:id/violations', requireCsrfHeader, validateBody(adminApplyViolationSchema), (req, res) => {
  const targetId = Number(req.params.id);
  const target = db.prepare(`SELECT role FROM users WHERE id = ?`).get(targetId) as { role: string } | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (target.role !== 'student') {
    res.status(400).json({ error: 'Violations are recorded against student accounts.' });
    return;
  }
  const { violation, note, points } = req.body as { violation: string; note?: string; points?: number };
  const applied = applyViolation(targetId, violation, req.userId!, { note, points });
  applyUserUpdate(res, targetId, () => ({ changes: 1 }), { applied });
});

/**
 * Sets an account's points to `newPoints` (a teacher's are teacher_points, a separate currency -- see lib/xp.ts; everyone else's total_xp) and tells the
 * person: a pop-up with how much was added or taken (points_notices, shown by components/PointsNoticeModal.tsx). The change goes in the points history
 * too (negative when points are taken away), so the monthly leaderboard, which adds up that history, moves with it; for a student the tier certificates are
 * checked and a fall to a lower rank is noted, as after any other points change.
 */
function applyPointsChange(res: Response, targetId: number, newPoints: number, adminId: number, note: string | null) {
  const before = db.prepare(`SELECT role, total_xp, teacher_points FROM users WHERE id = ?`).get(targetId) as
    | { role: string; total_xp: number; teacher_points: number }
    | undefined;
  if (!before) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const teacher = before.role === 'teacher';
  const old = teacher ? before.teacher_points ?? 0 : before.total_xp;
  applyUserUpdate(res, targetId, () => {
    const result = db.prepare(teacher ? `UPDATE users SET teacher_points = ? WHERE id = ?` : `UPDATE users SET total_xp = ? WHERE id = ?`).run(newPoints, targetId);
    const delta = newPoints - old;
    if (result.changes && delta !== 0) {
      db.prepare(teacher ? `INSERT INTO teacher_point_events (user_id, amount, reason) VALUES (?,?,?)` : `INSERT INTO xp_events (user_id, amount, reason) VALUES (?,?,?)`).run(targetId, delta, 'admin_adjust');
      if (!teacher) {
        noteRankDrop(targetId, old, newPoints);
        issueRankCertificates(targetId);
      }
      db.prepare(`INSERT INTO points_notices (user_id, admin_id, delta, new_total, kind, note) VALUES (?,?,?,?,?,?)`).run(targetId, adminId, delta, newPoints, teacher ? 'teacher' : 'xp', note);
    }
    return result;
  });
}

// Sets the points to a number (the older way; the admin panel now adds or removes, below).
adminRouter.patch('/users/:id/xp', requireCsrfHeader, validateBody(adminSetXpSchema), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't edit your own points." });
    return;
  }
  const { totalXp } = req.body as { totalXp: number };
  applyPointsChange(res, targetId, totalXp, req.userId!, null);
});

// Adds points to an account, or takes some away (never below 0), and sends the person a pop-up window about it.
adminRouter.post('/users/:id/points', requireCsrfHeader, validateBody(adminAdjustPointsSchema), (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    res.status(400).json({ error: "You can't edit your own points." });
    return;
  }
  const { action, amount, note } = req.body as { action: 'add' | 'remove'; amount: number; note?: string };
  const row = db.prepare(`SELECT role, total_xp, teacher_points FROM users WHERE id = ?`).get(targetId) as { role: string; total_xp: number; teacher_points: number } | undefined;
  if (!row) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const current = row.role === 'teacher' ? row.teacher_points ?? 0 : row.total_xp;
  const next = action === 'add' ? Math.min(1_000_000, current + amount) : Math.max(0, current - amount);
  if (next === current) {
    res.status(400).json({ error: action === 'add' ? 'This account already has the most points allowed.' : 'This account has no points to remove.' });
    return;
  }
  applyPointsChange(res, targetId, next, req.userId!, note ? note : null);
});

// ---------------------------------------------------------------------------------------
// Certificates -- admin uploads an image and hand-issues it to a student or teacher's
// profile (routes/users.ts profileSummary shows it to the recipient; CertificateAwardPopup
// on their next visit announces it). The certificate IS the uploaded image -- nothing is
// drawn or overlaid on top of it, so issuing one just needs a recipient, a name, a category,
// and the file.
// ---------------------------------------------------------------------------------------

const certificateImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 3, fieldSize: 1024, parts: 4 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('INVALID_IMAGE_TYPE'));
  },
}).single('image');

const handleCertificateImageUpload = handleUpload(certificateImageUpload, 'Please upload a valid image (JPG, PNG, or WebP, under 8MB).');

const CERTIFICATE_IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function adminCertificate(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    recipientUsername: row.recipient_username,
    recipientDisplayName: row.recipient_display_name,
    recipientRole: row.recipient_role,
    title: row.title,
    type: row.type,
    imageUrl: row.image_url,
    issuedByName: row.issuer_display_name ?? null,
    automatic: row.issued_by == null,
    emailedAt: row.emailed_at ?? null,
    revokedAt: row.revoked_at ?? null,
    revokedReason: row.revoked_reason ?? null,
    revokedByName: row.revoker_display_name ?? null,
    createdAt: row.created_at,
  };
}

adminRouter.get('/certificates', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, ru.username as recipient_username, ru.display_name as recipient_display_name,
              ru.role as recipient_role, iu.display_name as issuer_display_name, vu.display_name as revoker_display_name
       FROM certificates c
       JOIN users ru ON ru.id = c.user_id
       LEFT JOIN users iu ON iu.id = c.issued_by
       LEFT JOIN users vu ON vu.id = c.revoked_by
       ORDER BY c.created_at DESC`
    )
    .all() as any[];
  res.json({ certificates: rows.map(adminCertificate) });
});

adminRouter.post('/certificates', requireCsrfHeader, handleCertificateImageUpload, async (req, res) => {
  const parsed = adminIssueCertificateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request.', details: parsed.error.flatten() });
    return;
  }
  const { userId, title, type } = parsed.data;

  const recipient = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(userId) as { id: number; role: string } | undefined;
  if (!recipient || recipient.role === 'admin') {
    res.status(400).json({ error: 'Certificates can only be issued to a student or teacher account.' });
    return;
  }

  const image = req.file;
  // No picture uploaded: the certificate is the plaque of the chosen tier (bronze / silver / gold).
  if (!image) {
    const id = Number(
      db
        .prepare(`INSERT INTO certificates (user_id, title, type, image_url, issued_by) VALUES (?,?,?,?,?)`)
        .run(userId, title, type, PLAQUE_PATH[type], req.userId!).lastInsertRowid
    );
    void emailCertificate(id);
    res.status(201).json({ id });
    return;
  }
  if (!looksLikeImage(image.buffer, image.mimetype)) {
    res.status(400).json({ error: 'Please upload a valid image (JPG, PNG, or WebP, under 8MB).' });
    return;
  }
  if (!supabaseAdmin) {
    res.status(500).json({ error: "We couldn't upload the certificate. Please try again." });
    return;
  }

  const ext = CERTIFICATE_IMAGE_MIME_TO_EXT[image.mimetype];
  const path = `${CERTIFICATE_IMAGE_PATH_PREFIX}${userId}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(CERTIFICATE_IMAGE_BUCKET)
    .upload(path, image.buffer, { contentType: image.mimetype });
  if (uploadError) {
    console.error('Certificate image upload failed:', uploadError.message);
    res.status(500).json({ error: "We couldn't upload the certificate. Please try again." });
    return;
  }
  const { data: publicUrlData } = supabaseAdmin.storage.from(CERTIFICATE_IMAGE_BUCKET).getPublicUrl(path);

  const id = Number(
    db
      .prepare(`INSERT INTO certificates (user_id, title, type, image_url, issued_by) VALUES (?,?,?,?,?)`)
      .run(userId, title, type, publicUrlData.publicUrl, req.userId!).lastInsertRowid
  );
  void emailCertificate(id);
  res.status(201).json({ id });
});

// Taking a certificate back (a violation, a mistake). The row stays, with who and why, so the record is kept and the tier is not sent again
// (lib/rankCertificates.ts); it just leaves the owner's profile.
adminRouter.post('/certificates/:id/revoke', requireCsrfHeader, validateBody(adminRevokeCertificateSchema), (req, res) => {
  const { reason } = req.body as { reason: string };
  if (!revokeCertificate(Number(req.params.id), req.userId!, reason)) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  res.json({ ok: true });
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
    // a message can only go to a teacher: not to a lesson an admin made
    authorRole: row.author_role ?? null,
    createdAt: row.created_at,
  };
}

// A message to the teacher who made a lesson: it pops up for them (until they close it) with the lesson's title.
adminRouter.post('/reels/:id/message', requireCsrfHeader, (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (message.length < 1 || message.length > 500) {
    res.status(400).json({ error: 'Please write a message (up to 500 characters).' });
    return;
  }
  const reel = db.prepare(`SELECT r.id, r.author_user_id, u.role AS author_role FROM reels r LEFT JOIN users u ON u.id = r.author_user_id WHERE r.id = ?`).get(Number(req.params.id)) as
    | { id: number; author_user_id: number | null; author_role: string | null }
    | undefined;
  if (!reel) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }
  if (!reel.author_user_id || reel.author_role !== 'teacher') {
    res.status(400).json({ error: 'This video was not made by a teacher, so there is nobody to send a message to.' });
    return;
  }
  const info = db.prepare(`INSERT INTO reel_messages (reel_id, teacher_id, admin_id, message) VALUES (?,?,?,?)`).run(reel.id, reel.author_user_id, req.userId!, message);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

// The messages already sent about a lesson, newest first, and whether the teacher has closed each.
adminRouter.get('/reels/:id/messages', (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.id, m.message, m.created_at, m.read_at, a.display_name AS admin_name
       FROM reel_messages m LEFT JOIN users a ON a.id = m.admin_id
       WHERE m.reel_id = ? ORDER BY m.id DESC`
    )
    .all(Number(req.params.id)) as any[];
  res.json({ messages: rows.map((r) => ({ id: r.id, message: r.message, createdAt: r.created_at, readAt: r.read_at, adminName: r.admin_name ?? null })) });
});

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
              u.username as author_username, u.display_name as author_display_name, u.role as author_role
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
  const role = parseRoleFilter(req.query.role);
  const grade = parseGrade(req.query.grade);
  const page = Math.max(1, Number(req.query.page) || 1);

  const total = countReportUsers(role, grade);
  const { page: page_, totalPages } = clampPage(page, total);
  const rows = queryReportRows(role, grade, PAGE_SIZE, (page_ - 1) * PAGE_SIZE);

  // `users` covers students AND teachers (filter with ?role=student|teacher); `totals` spans everyone
  // matching the filter, not just this page.
  res.json({ users: rows, totals: reportTotals(role, grade), total, page: page_, totalPages, pageSize: PAGE_SIZE });
});

// Monthly watch-time trend -- reel_watch_progress only ever stores each (user, reel)
// pair's running total plus a single "last touched" timestamp, so it can't say how much
// was watched *in a given month*. reel_watch_seconds_events can: every credited heartbeat
// (routes/reels.ts POST /:reelId/watch) logs its own real-seconds row with a real
// timestamp, independent of how watch points are tiered/awarded.
// Matches PAGE_SIZE -- the per-user chart is a visual summary, not a replacement for the full
// paginated table above, so it caps at the same "one page" size rather than growing its own pagination.
const MONTHLY_USER_CAP = PAGE_SIZE;

adminRouter.get('/reports/watch-time/monthly', (req, res) => {
  const role = parseRoleFilter(req.query.role);
  const grade = parseGrade(req.query.grade);
  const monthsParam = Number(req.query.months);
  const monthCount = Number.isInteger(monthsParam) ? Math.min(12, Math.max(1, monthsParam)) : 6;
  const months = trailingMonthKeys(monthCount);

  const { totalsBySecond, users } = monthlyWatch(role, grade, months);
  res.json({
    months,
    totalsBySecond,
    // Same field names the chart components already use (`students`), now holding teachers too.
    students: users.slice(0, MONTHLY_USER_CAP),
    studentCount: users.length,
  });
});

// Locked, branded Excel version of the report (see lib/reportExcel.ts). Admin-only like everything on
// this router. ?grade=N (students only) &lang=ar|en. Always has separate Students / Teachers /
// Most-visited-pages sheets, so there is no role filter.
adminRouter.get('/reports/export.xlsx', async (req, res) => {
  try {
    const grade = parseGrade(req.query.grade);
    const lang = req.query.lang === 'en' ? 'en' : 'ar';
    const months = trailingMonthKeys(6);

    const studentRows = queryReportRows('student', grade);
    const teacherRows = queryReportRows('teacher', null);
    const monthlyUsers = [...monthlyWatch('student', grade, months).users, ...monthlyWatch('teacher', null, months).users].sort(
      (a, b) => b.monthly.reduce((s, n) => s + n, 0) - a.monthly.reduce((s, n) => s + n, 0)
    );

    const { buffer, filename } = await buildReportWorkbook({
      lang,
      grade,
      studentRows,
      teacherRows,
      pages: pageViewStats(),
      months,
      monthlyUsers,
      quizzesSolved: quizzesSolvedTotal(),
      pageViews30d: pageViewsLast30Days(),
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    console.error('Report export failed:', err);
    res.status(500).json({ error: "We couldn't create the report. Please try again." });
  }
});

// Student XP since a date, by what earned it. The worksheet reasons ('worksheet_easy', ...) fold into one activity (their
// difficulty split is its own chart); anything unrecognised lands in 'other'. `since` is an SQL expression, safe to interpolate.
function xpByActivitySince(since: string) {
  return db
    .prepare(
      `SELECT CASE WHEN e.reason LIKE 'worksheet_%' THEN 'worksheet'
                   WHEN e.reason IN ('reel_watch', 'reel_quiz', 'boss_defeat', 'craft_puzzle') THEN e.reason
                   ELSE 'other' END as activity,
              SUM(e.amount) as xp
       FROM xp_events e JOIN users u ON u.id = e.user_id
       WHERE u.is_seed = 0 AND u.role = 'student' AND e.amount > 0 AND e.created_at >= ${since}
       GROUP BY activity ORDER BY xp DESC`
    )
    .all() as { activity: string; xp: number }[];
}

// First-party pageview analytics (see routes/analytics.ts / schema.sql) -- top paths and a
// daily total for the last 30 days. Intentionally just that: this is a usage-visibility
// count, not a marketing-analytics product, so it doesn't grow into referrers/devices/funnels.
adminRouter.get('/analytics/summary', (_req, res) => {
  const topPaths = db
    .prepare(
      `SELECT path, COUNT(*) as views FROM page_views
       WHERE created_at >= ${SINCE_30_DAYS}
       GROUP BY path ORDER BY views DESC LIMIT 20`
    )
    .all() as { path: string; views: number }[];

  const daily = db
    .prepare(
      `SELECT date(created_at) as day, COUNT(*) as views FROM page_views
       WHERE created_at >= ${SINCE_30_DAYS}
       GROUP BY day ORDER BY day ASC`
    )
    .all() as { day: string; views: number }[];

  const totalViews = daily.reduce((sum, d) => sum + d.views, 0);

  const xpByActivity = xpByActivitySince(SINCE_30_DAYS);

  const worksheetsByDifficulty = db
    .prepare(
      `SELECT a.difficulty, COUNT(*) as submitted FROM worksheet_attempts a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'submitted' AND u.is_seed = 0 AND a.created_at >= ${SINCE_30_DAYS}
       GROUP BY a.difficulty`
    )
    .all() as { difficulty: string; submitted: number }[];

  res.json({ topPaths, daily, totalViews, quizzesSolved: quizzesSolvedTotal(), xpByActivity, worksheetsByDifficulty });
});

// The admin dashboard (the first admin page): headline counts, the points students earned per day and by source over the chosen
// period, the newest accounts and the top students. Real accounts only (is_seed = 0), like every other admin number.
const DASHBOARD_PERIODS = [7, 30, 90];

adminRouter.get('/dashboard', (req, res) => {
  const asked = Number(req.query.days);
  const days = DASHBOARD_PERIODS.includes(asked) ? asked : 30;
  const since = `date('now', '-${days - 1} days')`; // today plus the days before it, like SINCE_30_DAYS
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  const perDay = new Map(
    (
      db
        .prepare(
          `SELECT date(e.created_at) AS day, SUM(e.amount) AS xp
           FROM xp_events e JOIN users u ON u.id = e.user_id
           WHERE u.is_seed = 0 AND u.role = 'student' AND e.amount > 0 AND e.created_at >= ${since}
           GROUP BY day`
        )
        .all() as { day: string; xp: number }[]
    ).map((r) => [r.day, r.xp])
  );
  // Every day of the window, so a quiet day is a point on the line instead of a gap.
  const daily = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day, xp: perDay.get(day) ?? 0 };
  });

  const person = (row: any) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarKey: row.avatar_key,
    avatarUrl: row.avatar_url ?? null,
    grade: row.grade,
  });

  const newest = db
    .prepare(`SELECT * FROM users WHERE is_seed = 0 ORDER BY created_at DESC, id DESC LIMIT 4`)
    .all() as any[];
  const top = db
    .prepare(`SELECT * FROM users WHERE is_seed = 0 AND role = 'student' ORDER BY total_xp DESC, id ASC LIMIT 3`)
    .all() as any[];

  res.json({
    days,
    totals: {
      students: count(`SELECT COUNT(*) AS n FROM users WHERE is_seed = 0 AND role = 'student'`),
      teachers: count(`SELECT COUNT(*) AS n FROM users WHERE is_seed = 0 AND role = 'teacher'`),
      videos: count(`SELECT COUNT(*) AS n FROM reels WHERE author_user_id IS NOT NULL`),
      certificates: count(`SELECT COUNT(*) AS n FROM certificates WHERE revoked_at IS NULL`),
    },
    daily,
    xpByActivity: xpByActivitySince(since),
    newest: newest.map((r) => ({ ...person(r), role: r.role, points: r.role === 'teacher' ? r.teacher_points : r.total_xp, createdAt: r.created_at })),
    top: top.map((r) => ({ ...person(r), totalXp: r.total_xp, rankTier: getRankTier(r.total_xp) })),
  });
});
