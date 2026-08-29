import { Router } from 'express';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { getRankTier } from '../lib/ranks.js';

export const leaderboardRouter = Router();

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

leaderboardRouter.get('/', requireAuth, (req, res) => {
  const requestedMonth = String(req.query.month ?? '');
  const month = MONTH_PATTERN.test(requestedMonth) ? requestedMonth : null;

  const monthExpr = month ? `'${month}'` : `strftime('%Y-%m', 'now')`;
  // month is validated against MONTH_PATTERN above, safe to interpolate as a literal.
  const rows = db
    .prepare(
      `SELECT u.username, u.display_name, u.avatar_key, u.total_xp, COALESCE(SUM(x.amount), 0) as monthly_xp
       FROM users u
       JOIN xp_events x ON x.user_id = u.id
       WHERE strftime('%Y-%m', x.created_at) = ${monthExpr}
       GROUP BY u.id
       ORDER BY monthly_xp DESC
       LIMIT 20`
    )
    .all() as any[];

  const leaders = rows.map((r, i) => ({
    rank: i + 1,
    username: r.username,
    displayName: r.display_name,
    avatarKey: r.avatar_key,
    xp: r.monthly_xp,
    rankTier: getRankTier(r.total_xp),
  }));

  const meRow = db
    .prepare(
      `SELECT u.username, u.display_name, u.avatar_key, u.total_xp, COALESCE(SUM(x.amount), 0) as monthly_xp
       FROM users u LEFT JOIN xp_events x ON x.user_id = u.id AND strftime('%Y-%m', x.created_at) = ${monthExpr}
       WHERE u.id = ?
       GROUP BY u.id`
    )
    .get(req.userId!) as any;

  let me = null;
  if (meRow) {
    const rankRow = db
      .prepare(
        `SELECT COUNT(*) + 1 as rank FROM (
           SELECT u.id, COALESCE(SUM(x.amount), 0) as monthly_xp
           FROM users u JOIN xp_events x ON x.user_id = u.id
           WHERE strftime('%Y-%m', x.created_at) = ${monthExpr}
           GROUP BY u.id HAVING monthly_xp > ?
         )`
      )
      .get(meRow.monthly_xp) as { rank: number };
    me = {
      rank: rankRow.rank,
      username: meRow.username,
      displayName: meRow.display_name,
      avatarKey: meRow.avatar_key,
      xp: meRow.monthly_xp,
      rankTier: getRankTier(meRow.total_xp),
    };
  }

  const inTop20 = leaders.some((l) => l.username === meRow?.username);
  res.json({ month: month ?? 'current', leaders, me, inTop20 });
});
