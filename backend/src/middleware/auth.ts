import type { Request, Response, NextFunction } from 'express';
import { SESSION_COOKIE, getUserIdForToken } from '../lib/session.js';
import { db } from '../db/db.js';
import { isCurrentlyBanned } from '../lib/accountStatus.js';
import { levelForXp, UNLOCK_LEVEL, type Feature } from '../lib/levels.js';
import { isFeatureOn, featureMessage, type FeatureKey } from '../lib/features.js';

// Prepared once; requireAuth runs on every authenticated request.
// "Last seen": written at most once a minute per account, so a busy person does not cause a database write on every click.
const markSeen = db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`);
const lastMarked = new Map<number, number>();
const findAuthUser = db.prepare(`SELECT role, is_active, banned_until, profile_complete FROM users WHERE id = ?`);

// A Google sign-up that has not finished its profile step (lib/googleAuth.ts) may only do these -- a teacher in particular must not reach anything
// before their ID has been checked.
const ALLOWED_WHILE_INCOMPLETE = new Set(['/api/auth/me', '/api/auth/session', '/api/auth/logout', '/api/auth/complete-profile', '/api/auth/dismiss-warning']);

// While the admin has the whole site switched off for a role (lib/features.ts, "site"), that role can only do these: see who they are, sign out, and read the
// switches (so the app can show the closed notice and notice when the site is open again).
const ALLOWED_WHILE_SITE_CLOSED = new Set(['/api/auth/me', '/api/auth/session', '/api/auth/logout', '/api/features']);

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const userId = getUserIdForToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Please log in to continue.' });
    return;
  }
  // Re-checked on every request (not just at login) so an admin deactivating/banning an
  // account takes effect immediately, on that account's very next action -- not just on
  // its next fresh login while its existing session cookie would otherwise keep working.
  const user = findAuthUser.get(userId) as { role: string; is_active: number; banned_until: string | null; profile_complete: number } | undefined;
  if (!user || !user.is_active) {
    res.status(403).json({ error: 'This account is stopped. Contact the Anees team.' });
    return;
  }
  if (isCurrentlyBanned(user.banned_until)) {
    res.status(403).json({ error: 'This account is suspended for now. Try again when the suspension ends.', bannedUntil: user.banned_until });
    return;
  }
  if (user.profile_complete === 0 && !ALLOWED_WHILE_INCOMPLETE.has(req.originalUrl.split('?')[0])) {
    res.status(403).json({ error: 'Complete your profile first, then try again.', profileIncomplete: true });
    return;
  }
  if (user.role !== 'admin' && !isFeatureOn('site', user.role, userId) && !ALLOWED_WHILE_SITE_CLOSED.has(req.originalUrl.split('?')[0])) {
    const message = featureMessage('site', user.role);
    res.status(503).json({ error: message || 'The site is closed for a short while. Please come back soon.', maintenance: true, message });
    return;
  }
  const nowMs = Date.now();
  if (nowMs - (lastMarked.get(userId) ?? 0) > 60_000) {
    lastMarked.set(userId, nowMs);
    markSeen.run(userId);
  }
  req.userId = userId;
  req.userRole = user.role;
  next();
}

/** Gates a route (or a whole router) behind one of the admin's switches (lib/features.ts). Must run after requireAuth. The admin is never switched off. */
export function requireFeature(key: FeatureKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isFeatureOn(key, req.userRole, req.userId)) {
      next();
      return;
    }
    res.status(403).json({ error: 'This part of the site is closed for now. Please try again later.', featureOff: key });
  };
}

/** Gates a route (or whole router) to one account type. Must run after requireAuth so
 * req.userId is set. Students, teachers, and admins have entirely separate feature sets —
 * this is the server-side half of that split (the UI hides the other roles' pages too). */
/** The opposite of requireRole: lets every account type through except one (e.g. keep admins out
 * of gameplay endpoints, matching the UI which never shows them those pages). */
export function forbidRole(role: 'student' | 'teacher' | 'admin') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.userRole === role) {
      res.status(403).json({ error: 'Your account type can\'t open this page.' });
      return;
    }
    next();
  };
}

export function requireRole(...roles: ('student' | 'teacher' | 'admin')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.userRole as 'student' | 'teacher' | 'admin')) {
      res.status(403).json({ error: 'Your account type can\'t open this page.' });
      return;
    }
    next();
  };
}

const studentXp = db.prepare(`SELECT total_xp FROM users WHERE id = ?`);
const LEVEL_FREE_SWITCH: Partial<Record<Feature, FeatureKey>> = { map: 'map_open', quarry: 'craft_open' };

/** Keeps a student out of a feature until their level opens it (lib/levels.ts UNLOCK_LEVEL); other roles pass. */
export function requireLevel(feature: Feature, opts: { viewOpen?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // the map and the quarry show through behind their lock window (LevelGate) to motivate students: loading the page data (GET /) is allowed, every action stays locked
    if (opts.viewOpen && req.method === 'GET' && req.path === '/') {
      next();
      return;
    }
    // the admin can open the map / the quarry for students without the level (lib/features.ts map_open / craft_open), for everyone or for one account
    const openKey = LEVEL_FREE_SWITCH[feature];
    if (openKey && isFeatureOn(openKey, req.userRole, req.userId)) {
      next();
      return;
    }
    if (req.userRole === 'student') {
      const row = studentXp.get(req.userId!) as { total_xp: number } | undefined;
      const needed = UNLOCK_LEVEL[feature];
      if (levelForXp(row?.total_xp ?? 0).level < needed) {
        res.status(403).json({ error: `This opens at level ${needed}. Keep learning to get there.`, lockedUntilLevel: needed });
        return;
      }
    }
    next();
  };
}

const certStatus = db.prepare(`SELECT teacher_cert_status FROM users WHERE id = ?`);

/** A teacher makes content (lessons, worksheets sent to students) only once an admin has approved their teaching certificate; admins pass. */
export function requireApprovedTeacher(req: Request, res: Response, next: NextFunction) {
  if (req.userRole === 'teacher' && (certStatus.get(req.userId!) as { teacher_cert_status: string } | undefined)?.teacher_cert_status !== 'approved') {
    res.status(403).json({ error: 'Send your teaching certificate first. You can post lessons once an admin approves it.', needsCertificate: true });
    return;
  }
  next();
}
