import crypto from 'node:crypto';
import { db } from '../db/db.js';

export const SESSION_COOKIE = 'anees_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Prepared once: getUserIdForToken runs on every authenticated request.
const insertSession = db.prepare(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?,?,?)`);
const findSession = db.prepare(`SELECT user_id, expires_at FROM sessions WHERE token_hash = ?`);
const deleteSession = db.prepare(`DELETE FROM sessions WHERE token_hash = ?`);

export function createSession(userId: number): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  insertSession.run(userId, hashToken(token), expiresAt.toISOString());
  return { token, expiresAt };
}

export function getUserIdForToken(token: string | undefined): number | null {
  if (!token) return null;
  const row = findSession.get(hashToken(token)) as { user_id: number; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession.run(hashToken(token));
    return null;
  }
  return row.user_id;
}

export function destroySession(token: string | undefined) {
  if (!token) return;
  deleteSession.run(hashToken(token));
}
