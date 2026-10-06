import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { validateBody } from '../middleware/validate.js';

export const analyticsRouter = Router();

// A route path template, not a raw URL -- the frontend sends e.g. "/reels" or "/profile/:username"
// (never the literal username), so this never becomes a place student PII ends up logged.
const pageviewSchema = z.object({ path: z.string().trim().min(1).max(100) });

// Only these route templates are recorded -- anything else (typed 404 URLs, junk from a script)
// collapses to '/404', so the admin "Most-visited pages" report can't be polluted or grown at will.
const KNOWN_PATHS = new Set([
  '/', '/login', '/signup', '/verify-email', '/privacy', '/terms', '/cookies',
  '/reels', '/map', '/craft', '/worksheets', '/leaderboard', '/friends',
  '/profile', '/profile/:username', '/teacher/reels',
  '/admin/users', '/admin/videos', '/admin/reports', '/admin/certificates',
]);

// No requireAuth: pre-login pages (login/signup/legal) need tracking too, and this
// deliberately never records who -- see schema.sql's comment on page_views for why.
// No CSRF header requirement either (unlike every mutating route elsewhere in this app) --
// this write has no side effect an attacker could exploit (nothing sensitive to read back,
// nothing it changes about the account or app state), so there's nothing a forged
// cross-site request would gain by forcing a pageview row to be written.
analyticsRouter.post('/pageview', validateBody(pageviewSchema), (req, res) => {
  const { path } = req.body as { path: string };
  db.prepare(`INSERT INTO page_views (path) VALUES (?)`).run(KNOWN_PATHS.has(path) ? path : '/404');
  res.status(204).end();
});
