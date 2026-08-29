import crypto from 'node:crypto';
import { db } from '../db/db.js';

export const SESSION_COOKIE = 'anees_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: number): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.prepare(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?,?,?)`).run(
    userId,
    hashToken(token),
    expiresAt.toISOString()
  );
  return { token, expiresAt };
}

export function getUserIdForToken(token: string | undefined): number | null {
  if (!token) return null;
  const row = db
    .prepare(`SELECT user_id, expires_at FROM sessions WHERE token_hash = ?`)
    .get(hashToken(token)) as { user_id: number; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
    return null;
  }
  return row.user_id;
}

export function destroySession(token: string | undefined) {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
}
