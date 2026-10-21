import type { Request, Response, NextFunction } from 'express';
import { SESSION_COOKIE, getUserIdForToken } from '../lib/session.js';
import { db } from '../db/db.js';
import { isCurrentlyBanned } from '../lib/accountStatus.js';

// Prepared once; requireAuth runs on every authenticated request.
const findAuthUser = db.prepare(`SELECT role, is_active, banned_until FROM users WHERE id = ?`);

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const userId = getUserIdForToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  // Re-checked on every request (not just at login) so an admin deactivating/banning an
  // account takes effect immediately, on that account's very next action -- not just on
  // its next fresh login while its existing session cookie would otherwise keep working.
  const user = findAuthUser.get(userId) as { role: string; is_active: number; banned_until: string | null } | undefined;
  if (!user || !user.is_active) {
    res.status(403).json({ error: 'This account has been deactivated.' });
    return;
  }
  if (isCurrentlyBanned(user.banned_until)) {
    res.status(403).json({ error: 'This account is temporarily suspended.', bannedUntil: user.banned_until });
    return;
  }
  req.userId = userId;
  req.userRole = user.role;
  next();
}

/** Gates a route (or whole router) to one account type. Must run after requireAuth so
 * req.userId is set. Students, teachers, and admins have entirely separate feature sets —
 * this is the server-side half of that split (the UI hides the other roles' pages too). */
/** The opposite of requireRole: lets every account type through except one (e.g. keep admins out
 * of gameplay endpoints, matching the UI which never shows them those pages). */
export function forbidRole(role: 'student' | 'teacher' | 'admin') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.userRole === role) {
      res.status(403).json({ error: 'This account type does not have access to this.' });
      return;
    }
    next();
  };
}

export function requireRole(role: 'student' | 'teacher' | 'admin') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.userRole !== role) {
      res.status(403).json({ error: 'This account type does not have access to this.' });
      return;
    }
    next();
  };
}
