import type { Request, Response, NextFunction } from 'express';
import { SESSION_COOKIE, getUserIdForToken } from '../lib/session.js';
import { db } from '../db/db.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const userId = getUserIdForToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  req.userId = userId;
  next();
}

/** Gates a route (or whole router) to one account type. Must run after requireAuth so
 * req.userId is set. Students and teachers have entirely separate feature sets — this is
 * the server-side half of that split (the UI hides the other role's pages too). */
export function requireRole(role: 'student' | 'teacher') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = db.prepare(`SELECT role FROM users WHERE id = ?`).get(req.userId!) as { role: string } | undefined;
    if (!user || user.role !== role) {
      res.status(403).json({ error: 'This account type does not have access to this.' });
      return;
    }
    next();
  };
}

/** Attaches req.userId if a valid session exists, but never blocks the request. */
export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const userId = getUserIdForToken(token);
  if (userId) req.userId = userId;
  next();
}
