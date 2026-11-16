import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { z } from 'zod';
import { asyncRouter } from '../lib/asyncRouter.js';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCsrfHeader, validateBody, handleUpload } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { decrypt } from '../lib/encryption.js';

// A teacher's proof that they are a teacher: a photo or PDF of their teaching certificate or licence. It goes to the private bucket the old
// ID photos used (never public), or, with no Supabase set up (local development), to backend/data/teacher-certificates. An admin looks at it
// and approves or rejects it; until it is approved the teacher can browse but not post lessons or send worksheets (middleware/auth.ts
// requireApprovedTeacher).
const BUCKET = 'teacher-id-documents';
const LOCAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/teacher-certificates');
const TYPES: Record<string, { ext: string; magic: number[] }> = {
  'application/pdf': { ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
};
const BAD_FILE = 'The certificate must be a PDF, JPG or PNG file smaller than 5MB. Choose another file.';

const upload = handleUpload(
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
    fileFilter: (_req, file, cb) => (file.mimetype in TYPES ? cb(null, true) : cb(new Error('BAD_TYPE'))),
  }).single('certificate'),
  BAD_FILE
);

async function store(key: string, file: Express.Multer.File): Promise<boolean> {
  if (supabaseAdmin) return !(await supabaseAdmin.storage.from(BUCKET).upload(key, file.buffer, { contentType: file.mimetype })).error;
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_DIR, path.basename(key)), file.buffer);
  return true;
}

async function load(key: string): Promise<Buffer | null> {
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.storage.from(BUCKET).download(key);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  }
  const file = path.join(LOCAL_DIR, path.basename(key));
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

/** Deletes a stored certificate file (also used when an account is deleted, lib/deleteUser.ts). */
export async function remove(key: string | null) {
  if (!key) return;
  if (supabaseAdmin) await supabaseAdmin.storage.from(BUCKET).remove([key]);
  else fs.rmSync(path.join(LOCAL_DIR, path.basename(key)), { force: true });
}

const statusOf = (u: any) => ({ status: u.teacher_cert_status as string, note: u.teacher_cert_note ?? null, sentAt: u.teacher_cert_at ?? null });

// ---- the teacher's side: /api/teacher-certificate ----
export const teacherCertRouter = asyncRouter();
teacherCertRouter.use(requireAuth, requireRole('teacher'));

teacherCertRouter.get('/', (req, res) => {
  res.json(statusOf(db.prepare(`SELECT teacher_cert_status, teacher_cert_note, teacher_cert_at FROM users WHERE id = ?`).get(req.userId!)));
});

// Sending a certificate (again, after a rejection) puts it in the admins' queue. An approved teacher has nothing more to send.
teacherCertRouter.post('/', requireCsrfHeader, upload, async (req, res) => {
  const user = db.prepare(`SELECT id, teacher_cert_path, teacher_cert_status FROM users WHERE id = ?`).get(req.userId!) as any;
  if (user.teacher_cert_status === 'approved') {
    res.status(409).json({ error: 'Your certificate is already approved. You can post lessons.' });
    return;
  }
  const file = req.file;
  const type = file && TYPES[file.mimetype];
  if (!file || !type || !type.magic.every((b, i) => file.buffer[i] === b)) {
    res.status(400).json({ error: BAD_FILE });
    return;
  }
  const key = `teacher-certificates/${user.id}-${Date.now()}.${type.ext}`;
  if (!(await store(key, file))) {
    res.status(500).json({ error: "We couldn't upload your certificate. Wait a little and try again." });
    return;
  }
  await remove(user.teacher_cert_path);
  db.prepare(`UPDATE users SET teacher_cert_path = ?, teacher_cert_status = 'pending', teacher_cert_note = NULL, teacher_cert_at = datetime('now') WHERE id = ?`).run(key, user.id);
  res.json({ status: 'pending', note: null });
});

// ---- the admins' side: /api/admin/teacher-certificates ----
export const adminCertRouter = asyncRouter();
adminCertRouter.use(requireAuth, requireRole('admin'));

const adminRow = (u: any) => ({
  userId: u.id,
  username: u.username,
  displayName: u.display_name,
  email: u.email ? decrypt(u.email) : null,
  schoolName: u.school_name,
  teacherSubject: u.teacher_subject,
  hasFile: !!u.teacher_cert_path, // false for a teacher an admin let in without a certificate
  ...statusOf(u),
});
const ROW_COLUMNS = `id, username, display_name, email, school_name, teacher_subject, teacher_cert_path, teacher_cert_status, teacher_cert_note, teacher_cert_at`;

// Teachers who sent a certificate, waiting ones first.
adminCertRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ${ROW_COLUMNS}
       FROM users WHERE role = 'teacher' AND teacher_cert_path IS NOT NULL
       ORDER BY teacher_cert_status = 'pending' DESC, teacher_cert_at DESC`
    )
    .all() as any[];
  res.json(rows.map(adminRow));
});

// Find ANY teacher by name, username or e-mail (the e-mail is stored encrypted, so it is matched here): also the ones who never sent a certificate.
adminCertRouter.get('/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const rows = db.prepare(`SELECT ${ROW_COLUMNS} FROM users WHERE role = 'teacher' AND is_seed = 0 ORDER BY display_name`).all() as any[];
  res.json(
    rows
      .map(adminRow)
      .filter((r) => r.username.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q))
      .slice(0, 30)
  );
});

// The file itself, for an admin to look at (never a public link).
adminCertRouter.get('/:userId/file', async (req, res) => {
  const u = db.prepare(`SELECT teacher_cert_path FROM users WHERE id = ? AND role = 'teacher'`).get(Number(req.params.userId)) as any;
  const data = u?.teacher_cert_path ? await load(u.teacher_cert_path) : null;
  if (!data) {
    res.status(404).json({ error: 'This certificate file is no longer there.' });
    return;
  }
  const ext = path.extname(u.teacher_cert_path).slice(1);
  res.setHeader('Content-Type', ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(data);
});

// Let a teacher post lessons WITHOUT a certificate (an admin vouches for them), or take that back. Taking it back sends them to the certificate step again:
// back in the queue if they had sent a file, otherwise "not sent yet".
adminCertRouter.post('/:userId/access', requireCsrfHeader, validateBody(z.object({ allow: z.boolean() })), (req, res) => {
  const { allow } = req.body as { allow: boolean };
  const id = Number(req.params.userId);
  const u = db.prepare(`SELECT teacher_cert_path FROM users WHERE id = ? AND role = 'teacher'`).get(id) as { teacher_cert_path: string | null } | undefined;
  if (!u) {
    res.status(404).json({ error: "We couldn't find this teacher." });
    return;
  }
  const status = allow ? 'approved' : u.teacher_cert_path ? 'pending' : 'none';
  db.prepare(`UPDATE users SET teacher_cert_status = ?, teacher_cert_note = NULL WHERE id = ?`).run(status, id);
  res.json({ ok: true, status });
});

const reviewSchema = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });

adminCertRouter.post('/:userId/review', requireCsrfHeader, validateBody(reviewSchema), (req, res) => {
  const { approve, note } = req.body as { approve: boolean; note?: string };
  const changed = db
    .prepare(`UPDATE users SET teacher_cert_status = ?, teacher_cert_note = ? WHERE id = ? AND role = 'teacher' AND teacher_cert_path IS NOT NULL`)
    .run(approve ? 'approved' : 'rejected', approve ? null : note || null, Number(req.params.userId)).changes;
  if (!changed) {
    res.status(404).json({ error: "We couldn't find this teacher's certificate." });
    return;
  }
  res.json({ ok: true, status: approve ? 'approved' : 'rejected' });
});
