import type { Request, Response, NextFunction } from 'express';
import { SESSION_COOKIE, getUserIdForToken } from '../lib/session.js';

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

/** Attaches req.userId if a valid session exists, but never blocks the request. */
export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const userId = getUserIdForToken(token);
  if (userId) req.userId = userId;
  next();
}
