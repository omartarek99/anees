import { Router } from 'express';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';

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
      publishedAt: r.published_at,
    })),
  });
});
