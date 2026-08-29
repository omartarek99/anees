import { Router } from 'express';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { updateProfileSchema } from '../lib/schemas.js';
import { moderateText } from '../lib/moderation.js';
import { getPlayerLevel } from '../lib/xp.js';
import { getRankTier } from '../lib/ranks.js';

export const usersRouter = Router();

function profileSummary(user: any) {
  const playerLevel = getPlayerLevel(user.id);
  const completedLevels = db
    .prepare(`SELECT COUNT(*) as c FROM user_level_progress WHERE user_id = ? AND status = 'completed'`)
    .get(user.id) as { c: number };
  const bossesDefeated = db
    .prepare(
      `SELECT COUNT(*) as c FROM user_level_progress p
       JOIN map_levels m ON p.map_level_id = m.id
       WHERE p.user_id = ? AND p.status = 'completed' AND m.kind = 'boss'`
    )
    .get(user.id) as { c: number };
  const worksheetsCompleted = db
    .prepare(`SELECT COUNT(*) as c FROM worksheet_attempts WHERE user_id = ? AND status = 'submitted'`)
    .get(user.id) as { c: number };

  return {
    username: user.username,
    displayName: user.display_name,
    avatarKey: user.avatar_key,
    totalXp: user.total_xp,
    playerLevel,
    rankTier: getRankTier(user.total_xp),
    levelsCompleted: completedLevels.c,
    bossesDefeated: bossesDefeated.c,
    worksheetsCompleted: worksheetsCompleted.c,
    joinedAt: user.created_at,
  };
}

usersRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ profile: profileSummary(user) });
});

usersRouter.patch('/me', requireAuth, requireCsrfHeader, validateBody(updateProfileSchema), (req, res) => {
  const { displayName, avatarKey } = req.body as { displayName?: string; avatarKey?: string };

  if (displayName !== undefined) {
    const check = moderateText(displayName);
    if (!check.allowed) {
      res.status(400).json({ error: 'Please choose an appropriate display name.' });
      return;
    }
    db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run(displayName, req.userId!);
  }
  if (avatarKey !== undefined) {
    db.prepare(`UPDATE users SET avatar_key = ? WHERE id = ?`).run(avatarKey, req.userId!);
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  res.json({ profile: profileSummary(user) });
});

usersRouter.get('/search', requireAuth, (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json({ users: [] });
    return;
  }
  const rows = db
    .prepare(
      `SELECT username, display_name, avatar_key FROM users
       WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)
       ORDER BY username LIMIT 15`
    )
    .all(req.userId!, `%${q}%`, `%${q}%`) as any[];
  res.json({
    users: rows.map((r) => ({ username: r.username, displayName: r.display_name, avatarKey: r.avatar_key })),
  });
});

usersRouter.get('/:username', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(req.params.username);
  if (!user) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }
  res.json({ profile: profileSummary(user) });
});
