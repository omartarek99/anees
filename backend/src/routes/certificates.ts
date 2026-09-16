import { Router } from 'express';
import { db } from '../db/db.js';
import { requireCsrfHeader } from '../middleware/validate.js';

export const certificatesRouter = Router();

// Polled once on app load (CertificateAwardPopup.tsx) to announce any certificate the
// signed-in user hasn't seen yet -- oldest first, so if an admin issued several while the
// recipient was away, they're announced in the order they were actually awarded.
certificatesRouter.get('/unseen', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, u.display_name as issuer_display_name FROM certificates c
       LEFT JOIN users u ON u.id = c.issued_by
       WHERE c.user_id = ? AND c.viewed_at IS NULL
       ORDER BY c.created_at ASC`
    )
    .all(req.userId!) as any[];
  res.json({
    certificates: rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      imageUrl: r.image_url,
      issuedByName: r.issuer_display_name ?? null,
      createdAt: r.created_at,
    })),
  });
});

// Marks one certificate as seen once its popup has been dismissed -- scoped to the
// caller's own certificates (userId in the WHERE, not just the id) so one account can't
// mark another's certificate as viewed.
certificatesRouter.post('/:id/seen', requireCsrfHeader, (req, res) => {
  const result = db
    .prepare(`UPDATE certificates SET viewed_at = datetime('now') WHERE id = ? AND user_id = ? AND viewed_at IS NULL`)
    .run(Number(req.params.id), req.userId!);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  res.json({ ok: true });
});
