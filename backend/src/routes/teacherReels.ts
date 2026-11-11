import { asyncRouter } from '../lib/asyncRouter.js';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { open, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireCsrfHeader, validateBody, handleUpload } from '../middleware/validate.js';
import { z } from 'zod';
import { moderateContent } from '../lib/moderation.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { teacherReelSchema, teacherReelQuestionSchema, generateQuestionsSchema } from '../lib/schemas.js';
import { compressVideoFile } from '../lib/videoCompression.js';
import { probeVideoFromUrl } from '../lib/videoProbe.js';
import { r2Delete, r2Enabled, r2PublicUrl, r2UploadUrl } from '../lib/r2.js';
import { queueVideoOptimise } from '../lib/videoOptimize.js';
import { syncTeacherPoints } from '../lib/xp.js';
import { VIDEO_BUCKET, VIDEO_PATH_PREFIX, deleteReelVideoIfAny } from '../lib/reelVideo.js';
import { generateQuizQuestions } from '../lib/gemini.js';
import { findBankMatch } from '../lib/questionBank.js';
import { aiGenerationLimiter, videoUploadLimiter } from '../middleware/rateLimit.js';

export const teacherReelsRouter = asyncRouter();

// With Cloudflare R2 set up (lib/r2.ts) EVERY video up to 100MB goes from the teacher's browser straight to R2, whatever its size. Without it:
// a lesson video up to DIRECT_VIDEO_BYTES goes from the teacher's browser straight to Supabase Storage (a one-time signed upload link from
// POST /:id/video/upload-url), so the file never passes through Vercel or this server -- which is what made big uploads slow and, behind the host's
// two-minute proxy limit, fail. There is no re-encoding: POST /:id/video/complete only looks at the stored file (size, type, codec, real duration) and
// attaches it to the lesson. Supabase refuses a single file over 50MB on the free plan (a project-wide setting), so a video from there up to the 100MB
// the app accepts goes the other way, POST /:id/video, and is compressed by this server in the background; raise DIRECT_VIDEO_BYTES (to 100MB) if the
// Supabase plan's file size limit is raised.
const VIDEO_TYPE_EXTENSIONS: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
/** The most Supabase takes in one file from the browser on the free plan is 50MB; a little under it leaves room for the upload's own overhead. */
export const DIRECT_VIDEO_BYTES = 49 * 1024 * 1024;
const VIDEO_TOO_LARGE = 'This video is bigger than 100MB. Choose a smaller video or make it shorter.';
const VIDEO_BAD_TYPE = 'The video must be an MP4, WebM or MOV file smaller than 100MB. Choose another file.';
// Phones record HEVC (H.265), which many browsers cannot play, and nothing re-encodes it now: ask for an H.264 / VP8 / VP9 / AV1 video instead.
const PLAYABLE_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);

// BIG videos (over what Supabase accepts straight from the browser, see DIRECT_VIDEO_BYTES) are sent to this server instead, which compresses them in the
// background. Accepted upload containers -- compression (see videoCompression.ts) always re-encodes to mp4 before storage regardless of which of these
// the teacher uploaded, so no extension mapping is needed here, just membership.
const ACCEPTED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

// Kept on disk while it is received and processed (up to 100MB would otherwise sit in the small server's memory, twice over).
const videoUpload = multer({
  storage: multer.diskStorage({ destination: tmpdir() }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
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
async function looksLikeVideoFile(path: string, mimetype: string): Promise<boolean> {
  const file = await open(path, 'r');
  try {
    const head = Buffer.alloc(16);
    const { bytesRead } = await file.read(head, 0, 16, 0);
    return looksLikeVideo(head.subarray(0, bytesRead), mimetype);
  } finally {
    await file.close();
  }
}

function looksLikeVideo(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === 'video/webm') {
    // EBML header.
    return buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }
  // video/mp4 and video/quicktime are both ISO Base Media File Format containers -- real
  // files from cameras/editors/phones start with a `ftyp` box at byte offset 4.
  return buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp';
}

const handleVideoUpload = handleUpload(
  videoUpload,
  'The video must be an MP4, WebM or MOV file smaller than 100MB. Choose another file.',
  'This video is bigger than 100MB. Choose a smaller video or make it shorter.'
);

// An upload sits in memory (up to 100MB) and is then transcoded, so one at a time per teacher and three across
// the server keeps RAM and ffmpeg bounded however many requests arrive. Runs before multer buffers anything.
const uploadsInFlight = new Set<number>();
// Teachers whose video is being compressed and stored in the background right now (the upload request has already been answered by then).
const processingVideos = new Set<number>();
function limitConcurrentUploads(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId!;
  if (uploadsInFlight.has(userId) || processingVideos.has(userId) || uploadsInFlight.size + processingVideos.size >= 3) {
    res.status(429).json({ error: 'A video is still uploading. Wait until it finishes, then try again.' });
    return;
  }
  uploadsInFlight.add(userId);
  res.once('close', () => uploadsInFlight.delete(userId));
  next();
}

function moderateReelContent(body: {
  title: string;
  titleAr: string;
  scriptText: string;
  scriptTextAr: string;
  questions: { questionText: string; questionTextAr: string; explanation: string; explanationAr: string; choices: string[]; choicesAr: string[] }[];
}): boolean {
  // The Arabic copies reach students too; they default to '' when left blank, and moderateContent rejects '', so skip those.
  const texts = [
    body.title,
    body.titleAr,
    body.scriptText,
    body.scriptTextAr,
    ...body.questions.flatMap((q) => [q.questionText, q.questionTextAr, q.explanation, q.explanationAr, ...q.choices, ...q.choicesAr]),
  ];
  return texts.filter(Boolean).every((t) => moderateContent(t).allowed);
}

// A teacher reaches their own lessons; an admin reaches every teacher's (admin panel > Videos: edit, replace the video, add one).
function getOwnReel(id: number, userId: number, isAdmin = false) {
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ?`).get(id) as any;
  if (!reel || (!isAdmin && reel.author_user_id !== userId)) return null;
  return reel;
}

teacherReelsRouter.get('/options', requireAuth, requireRole('teacher', 'admin'), (_req, res) => {
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
  requireRole('teacher', 'admin'),
  requireCsrfHeader,
  aiGenerationLimiter,
  validateBody(generateQuestionsSchema),
  async (req, res) => {
    const body = req.body as import('zod').infer<typeof generateQuestionsSchema>;

    const subject = db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(body.subjectId) as any;
    if (!subject) {
      res.status(400).json({ error: 'This subject is not valid. Choose one from the list.' });
      return;
    }

    // The questions are about the lesson name (the title) only. Math and Science for grades 5 and 6: they are written from the school
    // question bank ("بنك الأسئلة") for that lesson, starting easy and ending medium (never hard).
    const bank =
      (subject.key === 'math' || subject.key === 'science') && (body.grade === 5 || body.grade === 6)
        ? await findBankMatch({
            subject: subject.key,
            grade: body.grade,
            topic: body.title,
            topicAr: body.titleAr,
          })
        : null;

    const result = await generateQuizQuestions({
      scriptText: '',
      scriptTextAr: '',
      subjectName: subject.name,
      grade: body.grade,
      count: body.count,
      topic: body.title,
      topicAr: body.titleAr || undefined,
      bankReference: bank?.reference,
      progression: 'easy-to-medium',
    });

    if (!result.ok) {
      console.error('Gemini question generation failed:', result.error);
      res.status(502).json({ error: "We couldn't make questions now. Try again, or write them yourself." });
      return;
    }

    const parsed = z.array(teacherReelQuestionSchema).min(1).max(10).safeParse(result.data);
    if (!parsed.success) {
      console.error('Gemini response failed validation:', parsed.error.flatten());
      res.status(502).json({ error: "We couldn't make questions now. Try again, or write them yourself." });
      return;
    }

    res.json({ questions: parsed.data });
  }
);

teacherReelsRouter.get('/', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, s.name as subject_name, s.name_ar as subject_name_ar,
              (SELECT COUNT(*) FROM reel_questions WHERE reel_id = r.id) as question_count,
              (SELECT COUNT(*) FROM reel_likes WHERE reel_id = r.id) as like_count,
              (SELECT COUNT(*) FROM reel_watch_progress w WHERE w.reel_id = r.id AND w.watched_seconds > 0 AND w.user_id IS NOT r.author_user_id) as view_count
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
      videoStatus: r.video_status ?? null,
      videoError: r.video_error ?? null,
      grade: r.grade,
      subjectName: r.subject_name,
      subjectNameAr: r.subject_name_ar,
      questionCount: r.question_count,
      likeCount: r.like_count,
      viewCount: r.view_count ?? 0,
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

// Messages an admin sent about this teacher's lessons that they have not closed yet: the app pops them up (components/AdminMessageModal.tsx).
teacherReelsRouter.get('/messages', requireAuth, requireRole('teacher'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.id, m.message, m.created_at, m.reel_id, r.title, r.title_ar, a.display_name AS admin_name
       FROM reel_messages m
       JOIN reels r ON r.id = m.reel_id
       LEFT JOIN users a ON a.id = m.admin_id
       WHERE m.teacher_id = ? AND m.read_at IS NULL
       ORDER BY m.id`
    )
    .all(req.userId!) as any[];
  res.json({
    messages: rows.map((r) => ({ id: r.id, message: r.message, createdAt: r.created_at, reelId: r.reel_id, reelTitle: r.title, reelTitleAr: r.title_ar, adminName: r.admin_name ?? null })),
  });
});

teacherReelsRouter.post('/messages/:id/read', requireAuth, requireRole('teacher'), requireCsrfHeader, (req, res) => {
  const result = db.prepare(`UPDATE reel_messages SET read_at = datetime('now') WHERE id = ? AND teacher_id = ? AND read_at IS NULL`).run(Number(req.params.id), req.userId!);
  res.json({ ok: true, changed: Number(result.changes) });
});

teacherReelsRouter.get('/:id', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  const reel = getOwnReel(Number(req.params.id), req.userId!, req.userRole === 'admin');
  if (!reel) {
    res.status(404).json({ error: 'We couldn\'t find what you asked for.' });
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
    videoStatus: reel.video_status ?? null,
    videoError: reel.video_error ?? null,
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
  // Only Math and Science own map levels; a lesson in any other subject (Islamic Education, Arabic, English ...) just borrows the first normal level.
  return (
    (db.prepare(`SELECT * FROM map_levels WHERE subject_id = ? AND kind = 'normal' ORDER BY level_number LIMIT 1`).get(subjectId) as any) ??
    (db.prepare(`SELECT * FROM map_levels WHERE kind = 'normal' ORDER BY level_number LIMIT 1`).get() as any)
  );
}

type TeacherReelBody = import('zod').infer<typeof teacherReelSchema>;

/** Shared by POST / and PATCH /:id -- both need the same moderation check and
 * subject-derived placeholder-level lookup before touching the DB; only what happens next
 * (INSERT vs UPDATE) actually differs between them. Sends the appropriate error response
 * itself on failure so callers just need `if (!placeholderLevel) return;`. */
function validateReelBody(res: Response, body: TeacherReelBody) {
  if (!moderateReelContent(body)) {
    res.status(400).json({ error: 'The lesson has words that are not allowed. Change them and try again.' });
    return null;
  }
  const placeholderLevel = resolvePlaceholderLevel(body.subjectId);
  if (!placeholderLevel) {
    res.status(400).json({ error: 'This subject is not valid. Choose one from the list.' });
    return null;
  }
  return placeholderLevel;
}

teacherReelsRouter.post(
  '/',
  requireAuth,
  requireRole('teacher', 'admin'),
  requireCsrfHeader,
  validateBody(teacherReelSchema),
  (req, res) => {
    const body = req.body as TeacherReelBody;

    const placeholderLevel = validateReelBody(res, body);
    if (!placeholderLevel) return;

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
  requireRole('teacher', 'admin'),
  requireCsrfHeader,
  validateBody(teacherReelSchema),
  (req, res) => {
    const reel = getOwnReel(Number(req.params.id), req.userId!, req.userRole === 'admin');
    if (!reel) {
      res.status(404).json({ error: 'We couldn\'t find what you asked for.' });
      return;
    }

    const body = req.body as TeacherReelBody;
    const placeholderLevel = validateReelBody(res, body);
    if (!placeholderLevel) return;

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

// Step 1: a one-time link the browser uploads the video to. The size and type are checked here (before anything is sent) and again on the stored file.
teacherReelsRouter.post('/:id/video/upload-url', requireAuth, requireRole('teacher', 'admin'), requireCsrfHeader, videoUploadLimiter, async (req, res) => {
  const reel = getOwnReel(Number(req.params.id), req.userId!, req.userRole === 'admin');
  if (!reel) {
    res.status(404).json({ error: 'We couldn\'t find what you asked for.' });
    return;
  }
  const { contentType, size } = (req.body ?? {}) as { contentType?: unknown; size?: unknown };
  const extension = typeof contentType === 'string' ? VIDEO_TYPE_EXTENSIONS[contentType] : undefined;
  if (!extension || typeof size !== 'number' || !Number.isFinite(size) || size < 1) {
    res.status(400).json({ error: VIDEO_BAD_TYPE });
    return;
  }
  if (size > MAX_VIDEO_BYTES) {
    res.status(400).json({ error: VIDEO_TOO_LARGE });
    return;
  }
  if (r2Enabled) {
    const key = `${VIDEO_PATH_PREFIX}${reel.id}-${Date.now()}.${extension}`;
    try {
      res.json({ signedUrl: await r2UploadUrl(key, contentType as string, size), path: key, headers: { 'Content-Type': contentType } });
    } catch (err) {
      console.error('R2 upload link failed:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: "We couldn't upload the video. Please try again." });
    }
    return;
  }
  if (size > DIRECT_VIDEO_BYTES) {
    // too big for a direct upload to Supabase: it has to be sent to POST /:id/video instead
    res.status(400).json({ error: 'This video is too big to upload this way. Choose a smaller video.', code: 'use_server' });
    return;
  }
  if (!supabaseAdmin) {
    res.status(500).json({ error: "We couldn't upload the video. Please try again." });
    return;
  }
  const path = `${VIDEO_PATH_PREFIX}${reel.id}-${Date.now()}.${extension}`;
  const { data, error } = await supabaseAdmin.storage.from(VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('Signed upload link failed:', error?.message);
    res.status(500).json({ error: "We couldn't upload the video. Please try again." });
    return;
  }
  res.json({ signedUrl: data.signedUrl, path, headers: { 'Content-Type': contentType, 'x-upsert': 'false' } });
});

// Step 2: the browser has uploaded the file; check what was actually stored, and only then attach it to the lesson. A file that fails is removed.
teacherReelsRouter.post('/:id/video/complete', requireAuth, requireRole('teacher', 'admin'), requireCsrfHeader, async (req, res) => {
  const reel = getOwnReel(Number(req.params.id), req.userId!, req.userRole === 'admin');
  if (!reel) {
    res.status(404).json({ error: 'We couldn\'t find what you asked for.' });
    return;
  }
  const { path } = (req.body ?? {}) as { path?: unknown };
  // only a file made for THIS lesson by the link above: teacher-reels/<lessonId>-<time>.<ext>
  if (typeof path !== 'string' || !new RegExp(`^${VIDEO_PATH_PREFIX}${reel.id}-\\d+\\.(mp4|webm|mov)$`).test(path)) {
    res.status(400).json({ error: VIDEO_BAD_TYPE });
    return;
  }
  if (!r2Enabled && !supabaseAdmin) {
    res.status(500).json({ error: "We couldn't upload the video. Please try again." });
    return;
  }
  // where the file was uploaded to: R2 when that is set up (see upload-url above), otherwise Supabase
  const reject = async (status: number, error: string) => {
    if (r2Enabled) await r2Delete(path).catch(() => {});
    else await supabaseAdmin!.storage.from(VIDEO_BUCKET).remove([path]);
    res.status(status).json({ error });
  };

  const publicUrl = r2Enabled ? r2PublicUrl(path) : supabaseAdmin!.storage.from(VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
  let head: globalThis.Response;
  try {
    head = await fetch(publicUrl, { method: 'HEAD' });
  } catch {
    res.status(502).json({ error: "We couldn't check the video you uploaded. Please try again." });
    return;
  }
  if (!head.ok) {
    res.status(400).json({ error: "We couldn't find the video you uploaded. Upload it again." });
    return;
  }
  const bytes = Number(head.headers.get('content-length') ?? 0);
  if (bytes > MAX_VIDEO_BYTES) {
    await reject(400, VIDEO_TOO_LARGE);
    return;
  }
  // the bucket is public, so what is served must be a video and nothing else (a web page would otherwise be served from the storage domain)
  if (!(head.headers.get('content-type') ?? '').startsWith('video/')) {
    await reject(400, VIDEO_BAD_TYPE);
    return;
  }

  let probe;
  try {
    probe = await probeVideoFromUrl(publicUrl, MAX_VIDEO_BYTES + 1024 * 1024);
  } catch (err) {
    console.error('Video probe failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: "We couldn't check the video you uploaded. Please try again." });
    return;
  }
  if (!probe.videoCodec || !probe.durationSeconds || probe.durationSeconds <= 0) {
    await reject(400, "We couldn't open this video file. Try a different file (MP4 works best).");
    return;
  }
  if (!PLAYABLE_CODECS.has(probe.videoCodec)) {
    await reject(400, 'This video type doesn\'t play on every phone. Save it again as an MP4 (H.264) and upload it again.');
    return;
  }

  await deleteReelVideoIfAny(reel.video_url);
  // The real, measured video duration replaces whatever placeholder duration the teacher's composer form had -- it drives the reel's progress bar
  // and the watch-points thresholds (routes/reels.ts POST /:reelId/watch), so it has to match the actual file, not a guess.
  db.prepare(`UPDATE reels SET video_url = ?, duration_sec = ?, video_status = 'ready' WHERE id = ?`).run(publicUrl, Math.round(probe.durationSeconds), reel.id);
  // A lesson with a video counts as posted for its teacher's points (lib/xp.ts) -- the author's, also when an admin added the video; replacing a
  // video changes nothing.
  syncTeacherPoints(reel.author_user_id, 'reel_posted');
  res.json({ videoUrl: publicUrl });
  // students get a small, fast-starting copy (720p, index first) as soon as the server has made it; the original plays until then
  if (r2Enabled) queueVideoOptimise(reel.id);
});

// BIG videos (over DIRECT_VIDEO_BYTES): received here, answered at once, then compressed and stored in the background (reels.video_status).
teacherReelsRouter.post(
  '/:id/video',
  requireAuth,
  requireRole('teacher', 'admin'),
  requireCsrfHeader,
  videoUploadLimiter,
  limitConcurrentUploads,
  handleVideoUpload,
  async (req, res) => {
    const video = req.file;
    const discard = () => (video ? unlink(video.path).catch(() => {}) : Promise.resolve());
    const reel = getOwnReel(Number(req.params.id), req.userId!, req.userRole === 'admin');
    if (!reel) {
      await discard();
      res.status(404).json({ error: 'We couldn\'t find what you asked for.' });
      return;
    }
    if (!video || !(await looksLikeVideoFile(video.path, video.mimetype))) {
      await discard();
      res.status(400).json({ error: 'The video must be an MP4, WebM or MOV file smaller than 100MB. Choose another file.' });
      return;
    }
    if (!supabaseAdmin) {
      await discard();
      res.status(500).json({ error: "We couldn't upload the video. Please try again." });
      return;
    }

    // Compressing and storing a video takes a while (minutes on a small server), longer than the host in front of the API waits for an answer, so
    // the request is answered right away and the work carries on in the background: reels.video_status says how it is going, and the lesson list polls it.
    db.prepare(`UPDATE reels SET video_status = 'processing', video_error = NULL WHERE id = ?`).run(reel.id);
    processingVideos.add(req.userId!);
    res.status(202).json({ status: 'processing' });
    void processVideoUpload(reel.id, req.userId!, video.path);
  }
);

/** The background half of a video upload: compress it, store it, then point the lesson at it (and recount its teacher's points). */
async function processVideoUpload(reelId: number, userId: number, originalPath: string) {
  try {
    if (!supabaseAdmin) throw new Error('storage not configured');
    const { buffer: compressed, durationSeconds } = await compressVideoFile(originalPath);

    // Compression always outputs mp4 (see videoCompression.ts) regardless of the original
    // container, so the stored file's extension/content-type reflect that, not the upload.
    const path = `${VIDEO_PATH_PREFIX}${reelId}-${Date.now()}.mp4`;
    const { error: uploadError } = await supabaseAdmin.storage.from(VIDEO_BUCKET).upload(path, compressed, { contentType: 'video/mp4' });
    if (uploadError) throw new Error(`storage upload: ${uploadError.message}`);
    const { data: publicUrlData } = supabaseAdmin.storage.from(VIDEO_BUCKET).getPublicUrl(path);

    const current = db.prepare(`SELECT video_url, author_user_id FROM reels WHERE id = ?`).get(reelId) as
      | { video_url: string | null; author_user_id: number | null }
      | undefined;
    if (!current) {
      // the lesson was deleted while its video was being processed: nothing to attach it to
      await supabaseAdmin.storage.from(VIDEO_BUCKET).remove([path]);
      return;
    }
    await deleteReelVideoIfAny(current.video_url);
    // The real, measured video duration replaces whatever placeholder duration the teacher's
    // composer form had -- it drives the reel's progress bar and the watch-points thresholds
    // (routes/reels.ts POST /:reelId/watch), so it has to match the actual file, not a guess.
    if (durationSeconds !== null && durationSeconds > 0) {
      db.prepare(`UPDATE reels SET video_url = ?, duration_sec = ?, video_status = 'ready', video_error = NULL WHERE id = ?`).run(publicUrlData.publicUrl, Math.round(durationSeconds), reelId);
    } else {
      db.prepare(`UPDATE reels SET video_url = ?, video_status = 'ready', video_error = NULL WHERE id = ?`).run(publicUrlData.publicUrl, reelId);
    }
    // a lesson with a video counts as posted (see /video/complete above)
    syncTeacherPoints(current.author_user_id, 'reel_posted');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Video processing failed:', message.slice(0, 600));
    // what the teacher is told: slow server / storage trouble / a file that could not be read
    const code = /timed out/i.test(message) ? 'timeout' : /storage/i.test(message) ? 'storage' : /Invalid data|moov atom|could not|ffmpeg exited/i.test(message) ? 'unreadable' : 'other';
    db.prepare(`UPDATE reels SET video_status = 'failed', video_error = ? WHERE id = ?`).run(code, reelId);
  } finally {
    processingVideos.delete(userId);
    await unlink(originalPath).catch(() => {});
  }
}

teacherReelsRouter.delete('/:id', requireAuth, requireRole('teacher', 'admin'), requireCsrfHeader, async (req, res) => {
  const reel = getOwnReel(Number(req.params.id), req.userId!, req.userRole === 'admin');
  if (!reel) {
    res.status(404).json({ error: 'We couldn\'t find what you asked for.' });
    return;
  }
  await deleteReelVideoIfAny(reel.video_url);
  db.prepare(`DELETE FROM reels WHERE id = ?`).run(reel.id);
  // its likes and the worksheets sent from it go with it (schema.sql), and so do the points they were worth
  syncTeacherPoints(reel.author_user_id, 'reel_removed');
  res.json({ ok: true });
});
