import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCsrfHeader, validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import { moderateContent } from '../lib/moderation.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { teacherReelSchema, teacherReelQuestionSchema, generateQuestionsSchema } from '../lib/schemas.js';
import { compressVideo } from '../lib/videoCompression.js';
import { VIDEO_BUCKET, VIDEO_PATH_PREFIX, deleteReelVideoIfAny } from '../lib/reelVideo.js';
import { generateQuizQuestions } from '../lib/gemini.js';
import { aiGenerationLimiter } from '../middleware/rateLimit.js';

export const teacherReelsRouter = Router();

// Accepted upload containers -- compression (see videoCompression.ts) always re-encodes to
// mp4 before storage regardless of which of these the teacher uploaded, so no extension
// mapping is needed here, just membership.
const ACCEPTED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_VIDEO_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error('INVALID_VIDEO_TYPE'));
  },
}).single('video');

// multer's fileFilter only trusts the client-declared Content-Type of the multipart part --
// an attacker can label any bytes "video/mp4" and it sails through. This checks the actual
// file signature (the same magic-number check libraries like `file-type` use) so arbitrary
// content (e.g. an HTML file with an inline <script>) can't be stored in the PUBLIC `videos`
// bucket disguised as a lesson video.
function looksLikeVideo(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === 'video/webm') {
    // EBML header.
    return buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }
  // video/mp4 and video/quicktime are both ISO Base Media File Format containers -- real
  // files from cameras/editors/phones start with a `ftyp` box at byte offset 4.
  return buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp';
}

function handleVideoUpload(req: Request, res: Response, next: NextFunction) {
  videoUpload(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: 'Please upload a valid video (MP4, WebM, or MOV, under 100MB).' });
      return;
    }
    next();
  });
}

function moderateReelContent(body: {
  title: string;
  scriptText: string;
  questions: { questionText: string; explanation: string; choices: string[] }[];
}): boolean {
  const texts = [
    body.title,
    body.scriptText,
    ...body.questions.flatMap((q) => [q.questionText, q.explanation, ...q.choices]),
  ];
  return texts.every((t) => moderateContent(t).allowed);
}

function getOwnReel(id: number, userId: number) {
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ?`).get(id) as any;
  if (!reel || reel.author_user_id !== userId) return null;
  return reel;
}

teacherReelsRouter.get('/options', requireAuth, requireRole('teacher'), (_req, res) => {
  const subjects = db.prepare(`SELECT id, key, name, name_ar, icon FROM subjects`).all() as any[];

  res.json({
    subjects: subjects.map((s) => ({ id: s.id, key: s.key, name: s.name, nameAr: s.name_ar, icon: s.icon })),
    grades: Array.from({ length: 12 }, (_, i) => i + 1),
  });
});

// Auto-generates quiz questions from the lesson script the teacher has already written --
// grounded in that script (not general knowledge), bilingual, matching the exact shape a
// manually-written question would have. Doesn't touch the DB or require a reel to exist yet
// -- the teacher reviews/edits the result in the composer before ever saving anything, same
// as a manually-typed question would be.
teacherReelsRouter.post(
  '/generate-questions',
  requireAuth,
  requireRole('teacher'),
  requireCsrfHeader,
  aiGenerationLimiter,
  validateBody(generateQuestionsSchema),
  async (req, res) => {
    const body = req.body as import('zod').infer<typeof generateQuestionsSchema>;

    const subject = db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(body.subjectId) as any;
    if (!subject) {
      res.status(400).json({ error: 'Invalid subject.' });
      return;
    }

    const result = await generateQuizQuestions({
      scriptText: body.scriptText,
      scriptTextAr: body.scriptTextAr,
      subjectName: subject.name,
      grade: body.grade,
      count: body.count,
    });

    if (!result.ok) {
      console.error('Gemini question generation failed:', result.error);
      res.status(502).json({ error: "We couldn't generate questions right now. Please try again or add them manually." });
      return;
    }

    const parsed = z.array(teacherReelQuestionSchema).min(1).max(10).safeParse(result.data);
    if (!parsed.success) {
      console.error('Gemini response failed validation:', parsed.error.flatten());
      res.status(502).json({ error: "We couldn't generate questions right now. Please try again or add them manually." });
      return;
    }

    // The model can occasionally point correctIndex outside 0-3 despite the schema/prompt --
    // drop any question that isn't actually usable rather than surface a broken quiz item.
    const usable = parsed.data.filter((q) => q.correctIndex >= 0 && q.correctIndex <= 3);
    if (usable.length === 0) {
      res.status(502).json({ error: "We couldn't generate questions right now. Please try again or add them manually." });
      return;
    }

    res.json({ questions: usable });
  }
);

teacherReelsRouter.get('/', requireAuth, requireRole('teacher'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, s.name as subject_name, s.name_ar as subject_name_ar,
              (SELECT COUNT(*) FROM reel_questions WHERE reel_id = r.id) as question_count
       FROM reels r
       JOIN subjects s ON r.subject_id = s.id
       WHERE r.author_user_id = ?
       ORDER BY r.id DESC`
    )
    .all(req.userId!) as any[];

  res.json({
    reels: rows.map((r) => ({
      id: r.id,
      title: r.title,
      titleAr: r.title_ar,
      videoUrl: r.video_url,
      grade: r.grade,
      subjectName: r.subject_name,
      subjectNameAr: r.subject_name_ar,
      questionCount: r.question_count,
    })),
  });
});

// Registered before GET /:id on purpose -- Express matches routes in order, and "reports"
// would otherwise be captured by :id (Number("reports") is NaN, getOwnReel(NaN, ...) just
// 404s, so it'd fail rather than crash, but it'd never reach this handler at all).
//
// Per-lesson watch stats for this teacher's own reels only -- real numbers straight from
// reel_watch_progress (the same table routes/reels.ts's anti-manipulation check protects),
// not a separate log to trust blindly. A teacher only ever sees their own content's
// engagement here, never another teacher's or the platform-wide total (that's the admin
// report at GET /admin/reports/watch-time).
teacherReelsRouter.get('/reports/watch-time', requireAuth, requireRole('teacher'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.title, r.title_ar, r.grade,
              COUNT(DISTINCT rwp.user_id) as watchers,
              COALESCE(SUM(rwp.watched_seconds), 0) as total_watched_seconds,
              COALESCE(AVG(rwp.watched_seconds), 0) as avg_watched_seconds
       FROM reels r
       LEFT JOIN reel_watch_progress rwp ON rwp.reel_id = r.id
       WHERE r.author_user_id = ?
       GROUP BY r.id
       ORDER BY r.id DESC`
    )
    .all(req.userId!) as any[];

  res.json({
    reels: rows.map((r) => ({
      id: r.id,
      title: r.title,
      titleAr: r.title_ar,
      grade: r.grade,
      watchers: r.watchers,
      totalWatchedSeconds: Math.round(r.total_watched_seconds),
      avgWatchedSeconds: Math.round(r.avg_watched_seconds),
    })),
  });
});

teacherReelsRouter.get('/:id', requireAuth, requireRole('teacher'), (req, res) => {
  const reel = getOwnReel(Number(req.params.id), req.userId!);
  if (!reel) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  const questions = db
    .prepare(`SELECT * FROM reel_questions WHERE reel_id = ? ORDER BY order_in_reel`)
    .all(reel.id) as any[];

  res.json({
    id: reel.id,
    subjectId: reel.subject_id,
    grade: reel.grade,
    title: reel.title,
    titleAr: reel.title_ar,
    scriptText: reel.script_text,
    scriptTextAr: reel.script_text_ar,
    videoUrl: reel.video_url,
    durationSec: reel.duration_sec,
    questions: questions.map((q) => ({
      id: q.id,
      questionText: q.question_text,
      questionTextAr: q.question_text_ar,
      choices: JSON.parse(q.choices_json),
      choicesAr: JSON.parse(q.choices_json_ar),
      correctIndex: q.correct_index,
      explanation: q.explanation,
      explanationAr: q.explanation_ar,
    })),
  });
});

function insertQuestions(reelId: number, questions: any[]) {
  const insert = db.prepare(
    `INSERT INTO reel_questions (reel_id, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar, xp_value, order_in_reel) VALUES (?,?,?,?,?,?,?,?,15,?)`
  );
  questions.forEach((q, i) => {
    insert.run(
      reelId,
      q.questionText,
      q.questionTextAr || '',
      JSON.stringify(q.choices),
      JSON.stringify(q.choicesAr || ['', '', '', '']),
      q.correctIndex,
      q.explanation,
      q.explanationAr || '',
      i + 1
    );
  });
}

// Grade-based reels are decoupled from the map/level system entirely (see GET /grade
// in reels.ts), but `reels.map_level_id`/`subject_id` stay NOT NULL in the schema --
// relaxing that would need a full SQLite table rebuild, not worth the risk for a column
// these rows never read. Instead we park them on the lowest-numbered normal level in
// the chosen subject, purely to satisfy the constraint; `grade` is what actually
// identifies and routes these rows everywhere else.
function resolvePlaceholderLevel(subjectId: number) {
  return db
    .prepare(`SELECT * FROM map_levels WHERE subject_id = ? AND kind = 'normal' ORDER BY level_number LIMIT 1`)
    .get(subjectId) as any;
}

teacherReelsRouter.post(
  '/',
  requireAuth,
  requireRole('teacher'),
  requireCsrfHeader,
  validateBody(teacherReelSchema),
  (req, res) => {
    const body = req.body as import('zod').infer<typeof teacherReelSchema>;

    if (!moderateReelContent(body)) {
      res.status(400).json({ error: 'Please keep your lesson content appropriate.' });
      return;
    }

    const placeholderLevel = resolvePlaceholderLevel(body.subjectId);
    if (!placeholderLevel) {
      res.status(400).json({ error: 'Invalid subject.' });
      return;
    }

    const reelId = Number(
      db
        .prepare(
          `INSERT INTO reels (subject_id, map_level_id, title, title_ar, script_text, script_text_ar, duration_sec, order_in_level, author_user_id, grade) VALUES (?,?,?,?,?,?,?,1,?,?)`
        )
        .run(
          body.subjectId,
          placeholderLevel.id,
          body.title,
          body.titleAr || '',
          body.scriptText,
          body.scriptTextAr || '',
          body.durationSec,
          req.userId!,
          body.grade
        ).lastInsertRowid
    );

    insertQuestions(reelId, body.questions);

    res.status(201).json({ id: reelId });
  }
);

teacherReelsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('teacher'),
  requireCsrfHeader,
  validateBody(teacherReelSchema),
  (req, res) => {
    const reel = getOwnReel(Number(req.params.id), req.userId!);
    if (!reel) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }

    const body = req.body as import('zod').infer<typeof teacherReelSchema>;
    if (!moderateReelContent(body)) {
      res.status(400).json({ error: 'Please keep your lesson content appropriate.' });
      return;
    }

    const placeholderLevel = resolvePlaceholderLevel(body.subjectId);
    if (!placeholderLevel) {
      res.status(400).json({ error: 'Invalid subject.' });
      return;
    }

    db.prepare(
      `UPDATE reels SET subject_id = ?, map_level_id = ?, grade = ?, title = ?, title_ar = ?, script_text = ?, script_text_ar = ?, duration_sec = ? WHERE id = ?`
    ).run(
      body.subjectId,
      placeholderLevel.id,
      body.grade,
      body.title,
      body.titleAr || '',
      body.scriptText,
      body.scriptTextAr || '',
      body.durationSec,
      reel.id
    );

    db.prepare(`DELETE FROM reel_questions WHERE reel_id = ?`).run(reel.id);
    insertQuestions(reel.id, body.questions);

    res.json({ ok: true });
  }
);

teacherReelsRouter.post(
  '/:id/video',
  requireAuth,
  requireRole('teacher'),
  requireCsrfHeader,
  handleVideoUpload,
  async (req, res) => {
    const reel = getOwnReel(Number(req.params.id), req.userId!);
    if (!reel) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    const video = req.file;
    if (!video || !looksLikeVideo(video.buffer, video.mimetype)) {
      res.status(400).json({ error: 'Please upload a valid video (MP4, WebM, or MOV, under 100MB).' });
      return;
    }
    if (!supabaseAdmin) {
      res.status(500).json({ error: "We couldn't upload the video. Please try again." });
      return;
    }

    let compressed: Buffer;
    try {
      compressed = await compressVideo(video.buffer);
    } catch (err) {
      console.error('Video compression failed:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: "We couldn't process the video. Please try a different file." });
      return;
    }

    // Compression always outputs mp4 (see videoCompression.ts) regardless of the original
    // container, so the stored file's extension/content-type reflect that, not the upload.
    const path = `${VIDEO_PATH_PREFIX}${reel.id}-${Date.now()}.mp4`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(VIDEO_BUCKET)
      .upload(path, compressed, { contentType: 'video/mp4' });
    if (uploadError) {
      console.error('Video upload failed:', uploadError.message);
      res.status(500).json({ error: "We couldn't upload the video. Please try again." });
      return;
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(VIDEO_BUCKET).getPublicUrl(path);

    await deleteReelVideoIfAny(reel.video_url);
    db.prepare(`UPDATE reels SET video_url = ? WHERE id = ?`).run(publicUrlData.publicUrl, reel.id);

    res.json({ videoUrl: publicUrlData.publicUrl });
  }
);

teacherReelsRouter.delete('/:id', requireAuth, requireRole('teacher'), requireCsrfHeader, async (req, res) => {
  const reel = getOwnReel(Number(req.params.id), req.userId!);
  if (!reel) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  await deleteReelVideoIfAny(reel.video_url);
  db.prepare(`DELETE FROM reels WHERE id = ?`).run(reel.id);
  res.json({ ok: true });
});
