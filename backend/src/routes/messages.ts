import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { messageLimiter } from '../middleware/rateLimit.js';
import { moderateText } from '../lib/moderation.js';

export const messagesRouter = Router();

function areFriends(a: number, b: number): boolean {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  return !!db.prepare(`SELECT 1 FROM friendships WHERE user_a_id = ? AND user_b_id = ?`).get(x, y);
}

messagesRouter.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.username, u.display_name, u.avatar_key,
              (SELECT body FROM messages m2 WHERE (m2.from_user_id = u.id AND m2.to_user_id = ?) OR (m2.from_user_id = ? AND m2.to_user_id = u.id)
               ORDER BY m2.created_at DESC LIMIT 1) as last_body,
              (SELECT created_at FROM messages m2 WHERE (m2.from_user_id = u.id AND m2.to_user_id = ?) OR (m2.from_user_id = ? AND m2.to_user_id = u.id)
               ORDER BY m2.created_at DESC LIMIT 1) as last_at
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
       WHERE f.user_a_id = ? OR f.user_b_id = ?
       ORDER BY last_at IS NULL, last_at DESC`
    )
    .all(req.userId!, req.userId!, req.userId!, req.userId!, req.userId!, req.userId!, req.userId!) as any[];

  res.json({
    threads: rows.map((r) => ({
      username: r.username,
      displayName: r.display_name,
      avatarKey: r.avatar_key,
      lastMessage: r.last_body,
      lastAt: r.last_at,
    })),
  });
});

messagesRouter.get('/:username', requireAuth, (req, res) => {
  const target = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(req.params.username) as any;
  if (!target) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }
  if (!areFriends(req.userId!, target.id)) {
    res.status(403).json({ error: 'You can only message students on your friends list.' });
    return;
  }
  const since = req.query.since ? String(req.query.since) : null;
  const rows = since
    ? (db
        .prepare(
          `SELECT * FROM messages WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)) AND created_at > ?
           ORDER BY created_at ASC`
        )
        .all(req.userId!, target.id, target.id, req.userId!, since) as any[])
    : (db
        .prepare(
          `SELECT * FROM messages WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
           ORDER BY created_at ASC LIMIT 200`
        )
        .all(req.userId!, target.id, target.id, req.userId!) as any[]);

  res.json({
    messages: rows.map((m) => ({
      id: m.id,
      fromUsername: m.from_user_id === req.userId! ? 'me' : target.username,
      fromMe: m.from_user_id === req.userId!,
      body: m.body,
      createdAt: m.created_at,
    })),
  });
});

const sendSchema = z.object({ body: z.string().min(1).max(500) });

messagesRouter.post('/:username', requireAuth, requireCsrfHeader, messageLimiter, validateBody(sendSchema), (req, res) => {
  const target = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(req.params.username) as any;
  if (!target) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }
  if (!areFriends(req.userId!, target.id)) {
    res.status(403).json({ error: 'You can only message students on your friends list.' });
    return;
  }

  const { body } = req.body as { body: string };
  const check = moderateText(body);
  if (!check.allowed) {
    res.status(400).json({ error: check.reason });
    return;
  }

  const id = Number(
    db.prepare(`INSERT INTO messages (from_user_id, to_user_id, body) VALUES (?,?,?)`).run(req.userId!, target.id, body)
      .lastInsertRowid
  );
  const saved = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as any;
  res.status(201).json({ message: { id: saved.id, fromMe: true, body: saved.body, createdAt: saved.created_at } });
});
