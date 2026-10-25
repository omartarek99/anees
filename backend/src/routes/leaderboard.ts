import { asyncRouter } from '../lib/asyncRouter.js';
import { db } from '../db/db.js';
import { getRankTier, getTeacherRankTier } from '../lib/ranks.js';
import { shieldSql } from '../lib/battle.js';

export const leaderboardRouter = asyncRouter();

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

// Teachers get a separate, video-upload/print-driven ranking (teacher_points,
// teacher_point_events -- see lib/xp.ts) instead of the student XP board -- they don't
// earn XP the same way students do, and mixing the two currencies on one board wouldn't
// mean anything. Which board a caller sees is entirely determined by their own role.
leaderboardRouter.get('/', (req, res) => {
  const isTeacher = req.userRole === 'teacher';

  const requestedMonth = String(req.query.month ?? '');
  const month = MONTH_PATTERN.test(requestedMonth) ? requestedMonth : null;
  const monthStart = month ? `'${month}-01'` : `date('now', 'start of month')`;
  // A range on the raw column (not strftime(...) = ...) so idx_xp_events_user_time can narrow each user's rows to the month.
  const inMonth = `x.created_at >= ${monthStart} AND x.created_at < date(${monthStart}, '+1 month')`;

  // month is validated against MONTH_PATTERN above, safe to interpolate as a literal.
  // pointsTable/pointsColumn/roleFilter are fixed internal constants (never user input),
  // also safe to interpolate.
  const pointsTable = isTeacher ? 'teacher_point_events' : 'xp_events';
  const pointsColumn = isTeacher ? 'teacher_points' : 'total_xp';
  const roleFilter = isTeacher ? `u.role = 'teacher'` : `u.role = 'student'`;
  const tierFor = (totalPoints: number) => (isTeacher ? getTeacherRankTier(totalPoints) : getRankTier(totalPoints));

  const rows = db
    .prepare(
      `SELECT u.username, u.display_name, u.avatar_key, u.${pointsColumn} as total_points, COALESCE(SUM(x.amount), 0) as monthly_points, ${shieldSql('u.id')} as has_shield
       FROM users u
       JOIN ${pointsTable} x ON x.user_id = u.id
       WHERE ${inMonth} AND ${roleFilter}
       GROUP BY u.id
       ORDER BY monthly_points DESC
       LIMIT 20`
    )
    .all() as any[];

  const leaders = rows.map((r, i) => ({
    rank: i + 1,
    username: r.username,
    displayName: r.display_name,
    avatarKey: r.avatar_key,
    xp: r.monthly_points,
    rankTier: tierFor(r.total_points),
    hasShield: !!r.has_shield,
  }));

  const meRow = db
    .prepare(
      `SELECT u.username, u.display_name, u.avatar_key, u.${pointsColumn} as total_points, COALESCE(SUM(x.amount), 0) as monthly_points, ${shieldSql('u.id')} as has_shield
       FROM users u LEFT JOIN ${pointsTable} x ON x.user_id = u.id AND ${inMonth}
       WHERE u.id = ? AND ${roleFilter}
       GROUP BY u.id`
    )
    .get(req.userId!) as any;

  let me = null;
  if (meRow) {
    const rankRow = db
      .prepare(
        `SELECT COUNT(*) + 1 as rank FROM (
           SELECT u.id, COALESCE(SUM(x.amount), 0) as monthly_points
           FROM users u JOIN ${pointsTable} x ON x.user_id = u.id
           WHERE ${inMonth} AND ${roleFilter}
           GROUP BY u.id HAVING monthly_points > ?
         )`
      )
      .get(meRow.monthly_points) as { rank: number };
    me = {
      rank: rankRow.rank,
      username: meRow.username,
      displayName: meRow.display_name,
      avatarKey: meRow.avatar_key,
      xp: meRow.monthly_points,
      rankTier: tierFor(meRow.total_points),
      hasShield: !!meRow.has_shield,
    };
  }

  const participants = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT u.id) as c FROM users u JOIN ${pointsTable} x ON x.user_id = u.id WHERE ${inMonth} AND ${roleFilter}`
      )
      .get() as { c: number }
  ).c;

  const inTop20 = leaders.some((l) => l.username === meRow?.username);
  res.json({ month: month ?? 'current', leaders, me, inTop20, participants, isTeacherBoard: isTeacher });
});
