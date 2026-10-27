import { z } from 'zod';
import { asyncRouter } from '../lib/asyncRouter.js';
import { db } from '../db/db.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';

// What a person has already seen of the first-run guide (the welcome tour and the one-time "what is this page" windows), kept on the
// account, so the guide shows once per new user, not again in another browser, on another device, or after clearing site data.

db.exec(`CREATE TABLE IF NOT EXISTS guide_seen (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
)`);

export const guideRouter = asyncRouter();

guideRouter.get('/', (req, res) => {
  const rows = db.prepare(`SELECT key FROM guide_seen WHERE user_id = ?`).all(req.userId!) as { key: string }[];
  res.json({ seen: rows.map((r) => r.key) });
});

const seenSchema = z.object({ key: z.string().regex(/^(tour|page_[A-Za-z]{1,30})$/) });

guideRouter.post('/', requireCsrfHeader, validateBody(seenSchema), (req, res) => {
  db.prepare(`INSERT OR IGNORE INTO guide_seen (user_id, key) VALUES (?, ?)`).run(req.userId!, (req.body as { key: string }).key);
  res.json({ ok: true });
});
