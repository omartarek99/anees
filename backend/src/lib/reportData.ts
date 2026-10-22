import { db } from '../db/db.js';

// Per-user usage numbers for the admin reports and the Excel export. Students AND teachers are
// counted: watch time and worksheets for both, plus what is specific to teachers (videos they
// uploaded and worksheets they printed). Real accounts only (is_seed = 0). Everything comes straight
// from the same tables the app itself writes (reel_watch_progress, reel_watch_seconds_events,
// worksheet_attempts, worksheet_prints, reels) -- no separate log to trust.

export type RoleFilter = 'all' | 'student' | 'teacher';

export function parseRoleFilter(value: unknown): RoleFilter {
  return value === 'student' || value === 'teacher' ? value : 'all';
}

export function parseGrade(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(n) ? n : null;
}

function filterSql(role: RoleFilter, grade: number | null) {
  const clauses = [`u.is_seed = 0`, role === 'all' ? `u.role IN ('student','teacher')` : `u.role = ?`];
  const params: (string | number)[] = role === 'all' ? [] : [role];
  if (grade !== null) {
    clauses.push(`u.grade = ?`);
    params.push(grade);
  }
  return { where: clauses.join(' AND '), params };
}

export type ReportRow = {
  userId: number;
  username: string;
  displayName: string;
  role: 'student' | 'teacher';
  grade: number | null;
  schoolName: string | null;
  teacherSubject: string | null;
  joinedAt: string;
  /** Total seconds ever watched across every reel. */
  watchedSeconds: number;
  reelsWatched: number;
  /** Points earned from watching (reel_watch_progress.xp_awarded). */
  watchPoints: number;
  /** Worksheets the user generated AND submitted. */
  worksheetsDone: number;
  /** Worksheets a teacher printed (printing is teacher-only, so 0 for students). */
  worksheetsPrinted: number;
  /** Videos a teacher uploaded, and their combined length in seconds. */
  videosUploaded: number;
  uploadedSeconds: number;
  /** Total XP for students, teacher points for teachers. */
  points: number;
  /** Distinct calendar days on which the user actually watched something. */
  activeDays: number;
  /** Whole days since the account was created (at least 1), the divisor for the daily/monthly averages. */
  daysSinceJoined: number;
};

const SELECT = `
  SELECT u.id, u.username, u.display_name, u.role, u.grade, u.school_name, u.teacher_subject, u.created_at,
         u.total_xp, u.teacher_points,
         COALESCE((SELECT SUM(watched_seconds) FROM reel_watch_progress WHERE user_id = u.id), 0) AS watched_seconds,
         COALESCE((SELECT COUNT(DISTINCT reel_id) FROM reel_watch_progress WHERE user_id = u.id), 0) AS reels_watched,
         COALESCE((SELECT SUM(xp_awarded) FROM reel_watch_progress WHERE user_id = u.id), 0) AS watch_points,
         (SELECT COUNT(*) FROM worksheet_attempts WHERE user_id = u.id AND status = 'submitted') AS worksheets_done,
         (SELECT COUNT(*) FROM worksheet_prints WHERE user_id = u.id) AS worksheets_printed,
         (SELECT COUNT(*) FROM reels WHERE author_user_id = u.id) AS videos_uploaded,
         COALESCE((SELECT SUM(duration_sec) FROM reels WHERE author_user_id = u.id), 0) AS uploaded_seconds,
         (SELECT COUNT(DISTINCT date(created_at)) FROM reel_watch_seconds_events WHERE user_id = u.id) AS active_days
  FROM users u`;

function toRow(r: any): ReportRow {
  return {
    userId: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    grade: r.grade,
    schoolName: r.school_name ?? null,
    teacherSubject: r.teacher_subject ?? null,
    joinedAt: r.created_at,
    watchedSeconds: Math.round(r.watched_seconds),
    reelsWatched: r.reels_watched,
    watchPoints: r.watch_points,
    worksheetsDone: r.worksheets_done,
    worksheetsPrinted: r.worksheets_printed,
    videosUploaded: r.videos_uploaded,
    uploadedSeconds: Math.round(r.uploaded_seconds),
    points: r.role === 'teacher' ? r.teacher_points ?? 0 : r.total_xp ?? 0,
    activeDays: r.active_days,
    daysSinceJoined: Math.max(1, Math.ceil((Date.now() - new Date(r.created_at.replace(' ', 'T') + 'Z').getTime()) / 86_400_000)),
  };
}

export function countReportUsers(role: RoleFilter, grade: number | null): number {
  const { where, params } = filterSql(role, grade);
  return (db.prepare(`SELECT COUNT(*) AS c FROM users u WHERE ${where}`).get(...params) as { c: number }).c;
}

/** Most-watched first. Pass `limit` for a page, omit for everyone (the Excel export). */
export function queryReportRows(role: RoleFilter, grade: number | null, limit?: number, offset = 0): ReportRow[] {
  const { where, params } = filterSql(role, grade);
  const sql = `${SELECT} WHERE ${where} ORDER BY watched_seconds DESC, u.id ASC${limit !== undefined ? ' LIMIT ? OFFSET ?' : ''}`;
  const rows = (limit !== undefined ? db.prepare(sql).all(...params, limit, offset) : db.prepare(sql).all(...params)) as any[];
  return rows.map(toRow);
}

export type ReportTotals = {
  students: number;
  teachers: number;
  watchedSeconds: number;
  worksheetsDone: number;
  worksheetsPrinted: number;
  videosUploaded: number;
};

export function reportTotals(role: RoleFilter, grade: number | null): ReportTotals {
  const rows = queryReportRows(role, grade);
  const t: ReportTotals = { students: 0, teachers: 0, watchedSeconds: 0, worksheetsDone: 0, worksheetsPrinted: 0, videosUploaded: 0 };
  for (const r of rows) {
    if (r.role === 'teacher') t.teachers++;
    else t.students++;
    t.watchedSeconds += r.watchedSeconds;
    t.worksheetsDone += r.worksheetsDone;
    t.worksheetsPrinted += r.worksheetsPrinted;
    t.videosUploaded += r.videosUploaded;
  }
  return t;
}

export function trailingMonthKeys(count: number): string[] {
  const start = new Date();
  start.setUTCDate(1);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export type MonthlyUser = { userId: number; username: string; displayName: string; role: 'student' | 'teacher'; grade: number | null; monthly: number[] };

/** Seconds watched per month per user (from the per-heartbeat event log), most-watched first. */
export function monthlyWatch(role: RoleFilter, grade: number | null, months: string[]) {
  const { where, params } = filterSql(role, grade);
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.grade,
              strftime('%Y-%m', ev.created_at) AS month, SUM(ev.seconds) AS seconds
       FROM reel_watch_seconds_events ev
       JOIN users u ON u.id = ev.user_id
       WHERE ${where} AND ev.created_at >= ?
       GROUP BY u.id, month`
    )
    .all(...params, `${months[0]}-01 00:00:00`) as { id: number; username: string; displayName: string; role: 'student' | 'teacher'; grade: number | null; month: string; seconds: number }[];

  const totalsBySecond = new Array(months.length).fill(0);
  const users = new Map<number, MonthlyUser>();
  for (const row of rows) {
    const i = months.indexOf(row.month);
    if (i === -1) continue;
    const seconds = Math.round(row.seconds);
    totalsBySecond[i] += seconds;
    if (!users.has(row.id)) {
      users.set(row.id, { userId: row.id, username: row.username, displayName: row.displayName, role: row.role, grade: row.grade, monthly: new Array(months.length).fill(0) });
    }
    users.get(row.id)!.monthly[i] = seconds;
  }
  const ranked = [...users.values()].sort((a, b) => b.monthly.reduce((s, n) => s + n, 0) - a.monthly.reduce((s, n) => s + n, 0));
  return { totalsBySecond, users: ranked };
}

export type PageViewRow = { path: string; views30d: number; viewsTotal: number };

/** "The last 30 days" everywhere (the analytics summary and the Excel export): today plus the 29 days before it,
 * whole calendar days, so a daily chart of 30 columns covers it exactly. An SQL expression, safe to interpolate. */
export const SINCE_30_DAYS = `date('now', '-29 days')`;

/** Every reel quiz a real (non-seed) account has ever submitted at least once. quiz_completed is sticky regardless
 * of score (see schema.sql), so this counts quizzes solved, not just passed. */
export function quizzesSolvedTotal(): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM reel_watch_progress rwp JOIN users u ON u.id = rwp.user_id WHERE rwp.quiz_completed = 1 AND u.is_seed = 0`
      )
      .get() as { c: number }
  ).c;
}

export function pageViewsLast30Days(): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM page_views WHERE created_at >= ${SINCE_30_DAYS}`).get() as { c: number }).c;
}

/** Every tracked page (see routes/analytics.ts), most-visited in the last 30 days first. */
export function pageViewStats(): PageViewRow[] {
  const rows = db
    .prepare(
      `SELECT path,
              COALESCE(SUM(created_at >= ${SINCE_30_DAYS}), 0) AS views30d,
              COUNT(*) AS viewsTotal
       FROM page_views GROUP BY path ORDER BY views30d DESC, viewsTotal DESC, path ASC`
    )
    .all() as PageViewRow[];
  return rows;
}
