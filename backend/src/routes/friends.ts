import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { usernameSchema } from '../lib/schemas.js';

export const friendsRouter = Router();

function friendshipKey(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

function areFriends(a: number, b: number): boolean {
  const [x, y] = friendshipKey(a, b);
  return !!db.prepare(`SELECT 1 FROM friendships WHERE user_a_id = ? AND user_b_id = ?`).get(x, y);
}

friendsRouter.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.username, u.display_name, u.avatar_key, u.total_xp FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
       WHERE f.user_a_id = ? OR f.user_b_id = ?
       ORDER BY u.display_name`
    )
    .all(req.userId!, req.userId!, req.userId!) as any[];
  res.json({
    friends: rows.map((r) => ({ username: r.username, displayName: r.display_name, avatarKey: r.avatar_key, totalXp: r.total_xp })),
  });
});

friendsRouter.get('/requests', requireAuth, (req, res) => {
  const incoming = db
    .prepare(
      `SELECT fr.id, u.username, u.display_name, u.avatar_key, fr.created_at FROM friend_requests fr
       JOIN users u ON u.id = fr.from_user_id
       WHERE fr.to_user_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`
    )
    .all(req.userId!) as any[];
  const outgoing = db
    .prepare(
      `SELECT fr.id, u.username, u.display_name, u.avatar_key, fr.created_at FROM friend_requests fr
       JOIN users u ON u.id = fr.to_user_id
       WHERE fr.from_user_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`
    )
    .all(req.userId!) as any[];

  const map = (r: any) => ({ requestId: r.id, username: r.username, displayName: r.display_name, avatarKey: r.avatar_key, createdAt: r.created_at });
  res.json({ incoming: incoming.map(map), outgoing: outgoing.map(map) });
});

const requestSchema = z.object({ toUsername: usernameSchema });

friendsRouter.post('/request', requireAuth, requireCsrfHeader, validateBody(requestSchema), (req, res) => {
  const { toUsername } = req.body as { toUsername: string };
  const target = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(toUsername) as any;
  if (!target) {
    res.status(404).json({ error: 'No student found with that username.' });
    return;
  }
  if (target.id === req.userId!) {
    res.status(400).json({ error: "You can't add yourself as a friend." });
    return;
  }
  if (areFriends(req.userId!, target.id)) {
    res.status(409).json({ error: 'You are already friends with this student.' });
    return;
  }
  const existingPending = db
    .prepare(
      `SELECT id FROM friend_requests WHERE status = 'pending' AND
       ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`
    )
    .get(req.userId!, target.id, target.id, req.userId!);
  if (existingPending) {
    res.status(409).json({ error: 'A friend request is already pending with this student.' });
    return;
  }

  const requestId = Number(
    db
      .prepare(`INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES (?,?,'pending')`)
      .run(req.userId!, target.id).lastInsertRowid
  );

  // Demo/seed students can't log in to accept requests themselves, so auto-accept
  // to keep the Friends list populated for trying out the feature.
  if (target.is_seed) {
    const [a, b] = friendshipKey(req.userId!, target.id);
    db.prepare(`INSERT OR IGNORE INTO friendships (user_a_id, user_b_id) VALUES (?,?)`).run(a, b);
    db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(requestId);
    res.status(201).json({ requestId, autoAccepted: true });
    return;
  }

  res.status(201).json({ requestId, autoAccepted: false });
});

friendsRouter.post('/requests/:id/accept', requireAuth, requireCsrfHeader, (req, res) => {
  const request = db.prepare(`SELECT * FROM friend_requests WHERE id = ?`).get(Number(req.params.id)) as any;
  if (!request || request.to_user_id !== req.userId! || request.status !== 'pending') {
    res.status(404).json({ error: 'Friend request not found.' });
    return;
  }
  const [a, b] = friendshipKey(request.from_user_id, request.to_user_id);
  db.prepare(`INSERT OR IGNORE INTO friendships (user_a_id, user_b_id) VALUES (?,?)`).run(a, b);
  db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(request.id);
  res.json({ ok: true });
});

friendsRouter.post('/requests/:id/decline', requireAuth, requireCsrfHeader, (req, res) => {
  const request = db.prepare(`SELECT * FROM friend_requests WHERE id = ?`).get(Number(req.params.id)) as any;
  if (!request || request.to_user_id !== req.userId! || request.status !== 'pending') {
    res.status(404).json({ error: 'Friend request not found.' });
    return;
  }
  db.prepare(`UPDATE friend_requests SET status = 'declined' WHERE id = ?`).run(request.id);
  res.json({ ok: true });
});
