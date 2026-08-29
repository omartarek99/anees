import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/db.js';
import { createSession, destroySession, SESSION_COOKIE } from '../lib/session.js';
import { moderateText } from '../lib/moderation.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { signupSchema, loginSchema } from '../lib/schemas.js';
import { getPlayerLevel } from '../lib/xp.js';
import { getRankTier } from '../lib/ranks.js';

export const authRouter = Router();

const isProd = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function publicUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarKey: user.avatar_key,
    totalXp: user.total_xp,
    playerLevel: getPlayerLevel(user.id),
    rankTier: getRankTier(user.total_xp),
    createdAt: user.created_at,
  };
}

authRouter.post('/signup', authLimiter, requireCsrfHeader, validateBody(signupSchema), (req, res) => {
  const { username, email, password, displayName, avatarKey } = req.body;

  const usernameCheck = moderateText(username);
  if (!usernameCheck.allowed) {
    res.status(400).json({ error: 'Please choose an appropriate username.' });
    return;
  }
  const nameCheck = moderateText(displayName);
  if (!nameCheck.allowed) {
    res.status(400).json({ error: 'Please choose an appropriate display name.' });
    return;
  }

  const existing = db
    .prepare(`SELECT id FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)`)
    .get(username, email);
  if (existing) {
    res.status(409).json({ error: 'That username or email is already taken.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (username, email, password_hash, display_name, avatar_key, total_xp) VALUES (?,?,?,?,?,0)`
      )
      .run(username, email, passwordHash, displayName, avatarKey).lastInsertRowid
  );

  db.prepare(
    `INSERT INTO user_level_progress (user_id, map_level_id, status)
     SELECT ?, id, 'available' FROM map_levels WHERE level_number = 1`
  ).run(userId);

  const { token, expiresAt } = createSession(userId);
  res.cookie(SESSION_COOKIE, token, cookieOptions);

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', authLimiter, requireCsrfHeader, validateBody(loginSchema), (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(username) as any;

  if (!user || user.is_seed) {
    res.status(401).json({ error: 'Incorrect username or password.' });
    return;
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'Incorrect username or password.' });
    return;
  }

  const { token } = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', requireCsrfHeader, (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ user: publicUser(user) });
});
