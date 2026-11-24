import { UNLOCK_LEVEL, xpAtLevel } from '../lib/levels.js';
import { Router } from 'express';
import { db } from '../db/db.js';
import { SESSION_COOKIE, getUserIdForToken } from '../lib/session.js';
import { isFeatureOn, featureMessage, stateFor } from '../lib/features.js';

// What the app may show: read by every page load and then about once a minute (frontend lib/features-context.tsx), by signed-in people and by visitors
// (the sign-up page needs to know whether new accounts are open). No secrets: only on/off, and the admin's own notice text.
export const featuresRouter = Router();

featuresRouter.get('/', (req, res) => {
  const userId = getUserIdForToken(req.cookies?.[SESSION_COOKIE]);
  const row = userId ? (db.prepare(`SELECT role FROM users WHERE id = ? AND is_active = 1`).get(userId) as { role: string } | undefined) : undefined;
  const role = row?.role ?? null;
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    role,
    site: { on: isFeatureOn('site', role, userId), message: featureMessage('site', role) },
    // the admin has no switches of its own: everything is on for it
    features: role === 'admin' ? {} : stateFor(role, userId),
    signup: { student: isFeatureOn('signup', 'student'), teacher: isFeatureOn('signup', 'teacher') },
    // what a student's level opens, and the points each of those levels starts at (lib/levels.ts): the app's only copy of these numbers
    levels: { unlock: UNLOCK_LEVEL, unlockXp: Object.fromEntries(Object.entries(UNLOCK_LEVEL).map(([k, l]) => [k, xpAtLevel(l)])) },
  });
});
