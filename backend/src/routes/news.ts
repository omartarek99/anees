import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCsrfHeader, validateBody } from '../middleware/validate.js';
import { moderateText } from '../lib/moderation.js';

export const newsRouter = Router();

newsRouter.get('/', requireAuth, (req, res) => {
  const subjectFilter = String(req.query.subject ?? '');
  let rows: any[];
  if (subjectFilter === 'math' || subjectFilter === 'science') {
    rows = db
      .prepare(
        `SELECT n.*, s.key as subject_key FROM news_posts n LEFT JOIN subjects s ON n.subject_id = s.id
         WHERE s.key = ? OR n.subject_id IS NULL ORDER BY n.published_at DESC`
      )
      .all(subjectFilter) as any[];
  } else {
    rows = db
      .prepare(
        `SELECT n.*, s.key as subject_key FROM news_posts n LEFT JOIN subjects s ON n.subject_id = s.id
         ORDER BY n.published_at DESC`
      )
      .all() as any[];
  }

  res.json({
    posts: rows.map((r) => ({
      id: r.id,
      title: r.title,
      titleAr: r.title_ar,
      body: r.body,
      bodyAr: r.body_ar,
      icon: r.icon,
      subject: r.subject_key ?? null,
      authorUserId: r.author_user_id,
      isMine: r.author_user_id === req.userId,
      publishedAt: r.published_at,
    })),
  });
});

const createNewsSchema = z.object({
  title: z.string().trim().min(3, 'Title is too short.').max(120),
  titleAr: z.string().trim().max(120).optional().default(''),
  body: z.string().trim().min(3, 'Body is too short.').max(2000),
  bodyAr: z.string().trim().max(2000).optional().default(''),
  icon: z.string().trim().max(8).optional().default('📣'),
  subject: z.enum(['math', 'science']).optional(),
});

// Teachers "provide material" for students by posting announcements/study tips onto the
// same home-page news feed students already read — graded, moderated the same way any
// other student-facing text on this platform is.
newsRouter.post('/', requireAuth, requireRole('teacher'), requireCsrfHeader, validateBody(createNewsSchema), (req, res) => {
  const { title, titleAr, body, bodyAr, icon, subject } = req.body as z.infer<typeof createNewsSchema>;

  const titleCheck = moderateText(title);
  const bodyCheck = moderateText(body);
  if (!titleCheck.allowed || !bodyCheck.allowed) {
    res.status(400).json({ error: 'Please keep your announcement appropriate.' });
    return;
  }

  const subjectId = subject ? ((db.prepare(`SELECT id FROM subjects WHERE key = ?`).get(subject) as any)?.id ?? null) : null;

  const result = db
    .prepare(
      `INSERT INTO news_posts (subject_id, title, title_ar, body, body_ar, icon, author_user_id) VALUES (?,?,?,?,?,?,?)`
    )
    .run(subjectId, title, titleAr || '', body, bodyAr || '', icon || '📣', req.userId!);

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

newsRouter.delete('/:id', requireAuth, requireRole('teacher'), requireCsrfHeader, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare(`SELECT * FROM news_posts WHERE id = ?`).get(id) as any;
  if (!post || post.author_user_id !== req.userId) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  db.prepare(`DELETE FROM news_posts WHERE id = ?`).run(id);
  res.json({ ok: true });
});
