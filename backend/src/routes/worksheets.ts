import { asyncRouter } from '../lib/asyncRouter.js';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { forbidRole, requireRole } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { worksheetAiLimiter } from '../middleware/rateLimit.js';
import { awardXp, awardTeacherPoints, TEACHER_PRINT_POINTS, WORKSHEET_XP_PER_CORRECT } from '../lib/xp.js';
import { gradeAnswers } from '../lib/grading.js';
import { generateQuizQuestions } from '../lib/gemini.js';
import { moderateContent } from '../lib/moderation.js';
import { teacherReelQuestionSchema } from '../lib/schemas.js';

export const worksheetsRouter = asyncRouter();

const QUESTIONS_PER_WORKSHEET = 10;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type Difficulty = 'easy' | 'medium' | 'hard';

const generateSchema = z
  .object({
    subject: z.enum(['math', 'science']).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    // When set, the worksheet is built around this teacher video's topic instead of the
    // shared general pool, and the subject comes from the video itself.
    reelId: z.coerce.number().int().positive().optional(),
    // The lesson name (درس) typed for a general worksheet -- the AI writes new questions on
    // it each time. Without it, a general worksheet draws from the fixed seeded bank.
    topic: z.string().trim().min(2, 'Lesson name is too short.').max(80).optional(),
  })
  .refine((b) => b.subject || b.reelId, { message: 'Choose a subject or a video.' });

// Videos a user can build a worksheet from -- the same visibility as the reels feed
// (routes/reels.ts): a student sees the teacher videos tagged with their own grade, a
// teacher sees the videos they uploaded themselves.
function loadVisibleVideo(reelId: number, userId: number) {
  const user = db.prepare(`SELECT grade FROM users WHERE id = ?`).get(userId) as { grade: number | null } | undefined;
  const reel = db
    .prepare(
      `SELECT r.*, s.key as subject_key, s.name as subject_name FROM reels r
       JOIN subjects s ON s.id = r.subject_id
       WHERE r.id = ? AND r.grade IS NOT NULL AND r.author_user_id IS NOT NULL`
    )
    .get(reelId) as any;
  if (!reel) return null;
  if (reel.author_user_id === userId || (user?.grade && reel.grade === user.grade)) return reel;
  return null;
}

worksheetsRouter.get('/videos', (req, res) => {
  const user = db.prepare(`SELECT grade FROM users WHERE id = ?`).get(req.userId!) as { grade: number | null } | undefined;
  const rows = db
    .prepare(
      `SELECT r.id, r.title, r.title_ar, r.grade, s.key as subject_key, u.display_name as author_name
       FROM reels r
       JOIN subjects s ON s.id = r.subject_id
       LEFT JOIN users u ON u.id = r.author_user_id
       WHERE r.grade IS NOT NULL AND r.author_user_id IS NOT NULL AND (r.author_user_id = ? OR r.grade = ?)
       ORDER BY r.id DESC`
    )
    .all(req.userId!, user?.grade ?? -1) as any[];
  res.json({
    videos: rows.map((r) => ({
      id: r.id,
      title: r.title,
      titleAr: r.title_ar,
      grade: r.grade,
      subject: r.subject_key,
      authorName: r.author_name ?? '',
    })),
  });
});

function createAttempt(userId: number, subjectId: number, difficulty: Difficulty, reelId: number | null, questionIds: number[]) {
  return Number(
    db
      .prepare(
        `INSERT INTO worksheet_attempts (user_id, subject_id, difficulty, question_ids_json, total, status, reel_id) VALUES (?,?,?,?,?, 'generated', ?)`
      )
      .run(userId, subjectId, difficulty, JSON.stringify(questionIds), questionIds.length, reelId).lastInsertRowid
  );
}

function questionPayload(q: any) {
  return {
    id: q.id,
    text: q.question_text,
    textAr: q.question_text_ar,
    choices: JSON.parse(q.choices_json),
    choicesAr: JSON.parse(q.choices_json_ar),
  };
}

// What one AI-generated worksheet is built around: either a teacher video (title +
// description/script) or a lesson name the user typed for a general worksheet.
type AiScope = {
  subjectId: number;
  subjectName: string;
  grade: number;
  topic: string;
  topicAr?: string;
  scriptText: string;
  scriptTextAr: string;
  reelId: number | null;
  // Normalised typed lesson name (general worksheets); null for video worksheets.
  topicKey: string | null;
};

function scopeFilter(scope: AiScope, difficulty: Difficulty) {
  return scope.reelId
    ? { where: `reel_id = ? AND difficulty = ?`, params: [scope.reelId, difficulty] as (string | number)[] }
    : {
        where: `reel_id IS NULL AND topic = ? COLLATE NOCASE AND subject_id = ? AND difficulty = ?`,
        params: [scope.topicKey!, scope.subjectId, difficulty] as (string | number)[],
      };
}

// Builds the question set for one AI-generated worksheet. Every call asks the AI for a NEW
// set (it's told which questions were already used, so it writes different ones) about the
// video's description or the typed lesson name -- so the questions follow the topic and
// change each time. Older saved questions and (for videos) the teacher's own quiz questions
// only top the worksheet up if the AI couldn't supply a full set.
async function buildAiQuestions(scope: AiScope, difficulty: Difficulty): Promise<any[]> {
  const authored = scope.reelId
    ? (db.prepare(`SELECT * FROM reel_questions WHERE reel_id = ? ORDER BY order_in_reel`).all(scope.reelId) as any[])
    : [];
  const authoredTexts = new Set(authored.map((q) => q.question_text));

  const filter = scopeFilter(scope, difficulty);
  const existing = db
    .prepare(`SELECT * FROM worksheet_questions WHERE ${filter.where} ORDER BY id DESC`)
    .all(...filter.params) as any[];
  const insert = db.prepare(
    `INSERT INTO worksheet_questions (subject_id, difficulty, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar, reel_id, topic) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  const known = new Set(existing.map((q) => q.question_text));
  const insertedIds: number[] = [];

  const result = await generateQuizQuestions({
    scriptText: scope.scriptText,
    scriptTextAr: scope.scriptTextAr,
    subjectName: scope.subjectName,
    grade: scope.grade,
    count: QUESTIONS_PER_WORKSHEET,
    topic: scope.topic,
    topicAr: scope.topicAr,
    difficulty,
    avoidQuestions: existing.slice(0, 40).map((q) => q.question_text),
    style: 'worksheet',
  });
  if (!result.ok) {
    // Not configured / API hiccup -- fall back to saved questions below.
    if (result.error !== 'NOT_CONFIGURED') console.error('Gemini worksheet generation failed:', result.error);
  } else {
    // Validate item by item: one malformed question (3 choices, bad correctIndex) shouldn't throw
    // away the other nine.
    const items: unknown[] = Array.isArray(result.data) ? result.data : [];
    const valid = items.flatMap((item) => {
      const r = teacherReelQuestionSchema.safeParse(item);
      return r.success ? [r.data] : [];
    });
    if (valid.length === 0) {
      console.error('Gemini worksheet response had no valid questions.');
    } else {
      for (const q of valid) {
        if (q.correctIndex < 0 || q.correctIndex > 3 || known.has(q.questionText)) continue;
        // Nobody reviews AI output before a student sees it here (unlike the teacher
        // composer), so run the same content filter lesson text goes through.
        const texts = [q.questionText, q.explanation, ...q.choices];
        if (!texts.every((t) => moderateContent(t).allowed)) continue;
        const info = insert.run(
          scope.subjectId,
          difficulty,
          q.questionText,
          q.questionTextAr || '',
          JSON.stringify(q.choices),
          JSON.stringify(q.choicesAr || ['', '', '', '']),
          q.correctIndex,
          q.explanation,
          q.explanationAr || '',
          scope.reelId,
          scope.topicKey
        );
        insertedIds.push(Number(info.lastInsertRowid));
        known.add(q.questionText);
      }
    }
  }

  const fresh = insertedIds.length
    ? (db.prepare(`SELECT * FROM worksheet_questions WHERE id IN (${insertedIds.map(() => '?').join(',')})`).all(...insertedIds) as any[])
    : [];
  const picked = shuffle(fresh).slice(0, QUESTIONS_PER_WORKSHEET);

  // Top up (AI down / returned too few): older AI questions on the same topic first, then
  // (videos only) the teacher's own quiz questions.
  if (picked.length < QUESTIONS_PER_WORKSHEET) {
    const pickedIds = new Set(picked.map((q) => q.id));
    const older = shuffle(existing.filter((q) => !authoredTexts.has(q.question_text) && !pickedIds.has(q.id)));
    for (const q of older) {
      if (picked.length >= QUESTIONS_PER_WORKSHEET) break;
      picked.push(q);
    }
  }
  if (picked.length < QUESTIONS_PER_WORKSHEET) {
    const pickedTexts = new Set(picked.map((q) => q.question_text));
    for (const q of shuffle(authored)) {
      if (picked.length >= QUESTIONS_PER_WORKSHEET) break;
      if (pickedTexts.has(q.question_text)) continue;
      // Mirrored into worksheet_questions (once) so grading can look it up like any other.
      const mirrored = existing.find((e) => e.question_text === q.question_text);
      if (mirrored) {
        picked.push(mirrored);
        continue;
      }
      const info = insert.run(
        scope.subjectId, difficulty, q.question_text, q.question_text_ar, q.choices_json,
        q.choices_json_ar, q.correct_index, q.explanation, q.explanation_ar, scope.reelId, null
      );
      picked.push({ ...q, id: Number(info.lastInsertRowid), reel_id: scope.reelId });
    }
  }

  trimPool(scope, difficulty);
  return picked;
}

// Every click adds a fresh set, so keep the saved pool bounded: only the newest few are
// ever needed as "already used" hints / top-ups. Questions still referenced by an unsubmitted
// worksheet are kept so that worksheet can still be graded.
const AI_POOL_KEEP = 100;
function trimPool(scope: AiScope, difficulty: Difficulty) {
  const filter = scopeFilter(scope, difficulty);
  const rows = db
    .prepare(`SELECT id FROM worksheet_questions WHERE ${filter.where} ORDER BY id DESC`)
    .all(...filter.params) as { id: number }[];
  if (rows.length <= AI_POOL_KEEP) return;
  const inUse = new Set<number>();
  const attempts = (
    scope.reelId
      ? db.prepare(`SELECT question_ids_json FROM worksheet_attempts WHERE reel_id = ? AND status = 'generated'`).all(scope.reelId)
      : db
          .prepare(`SELECT question_ids_json FROM worksheet_attempts WHERE reel_id IS NULL AND subject_id = ? AND status = 'generated'`)
          .all(scope.subjectId)
  ) as { question_ids_json: string }[];
  for (const a of attempts) for (const id of JSON.parse(a.question_ids_json) as number[]) inUse.add(id);
  const del = db.prepare(`DELETE FROM worksheet_questions WHERE id = ?`);
  for (const r of rows.slice(AI_POOL_KEEP)) if (!inUse.has(r.id)) del.run(r.id);
}

// The AI call is paid + slow, so worksheets built from a video or a typed lesson name go
// through the dedicated limiter -- plain bank worksheets stay unthrottled as before.
function limitAiWhenAi(req: Request, res: Response, next: NextFunction) {
  if (req.body?.reelId || req.body?.topic) {
    worksheetAiLimiter(req, res, next);
    return;
  }
  next();
}

worksheetsRouter.post(
  '/generate',
  forbidRole('admin'),
  requireCsrfHeader,
  validateBody(generateSchema),
  limitAiWhenAi,
  async (req, res) => {
    try {
      const { subject, difficulty, reelId, topic: rawTopic } = req.body as {
        subject?: 'math' | 'science';
        difficulty: Difficulty;
        reelId?: number;
        topic?: string;
      };

      if (reelId) {
        const reel = loadVisibleVideo(reelId, req.userId!);
        if (!reel) {
          res.status(404).json({ error: 'Video not found.' });
          return;
        }
        const picked = await buildAiQuestions(
          {
            subjectId: reel.subject_id,
            subjectName: reel.subject_name,
            grade: reel.grade,
            topic: reel.title,
            topicAr: reel.title_ar || undefined,
            scriptText: reel.script_text,
            scriptTextAr: reel.script_text_ar,
            reelId: reel.id,
            topicKey: null,
          },
          difficulty
        );
        if (picked.length === 0) {
          res.status(404).json({ error: 'No questions could be made for this video yet. Please try again later.' });
          return;
        }
        const attemptId = createAttempt(req.userId!, reel.subject_id, difficulty, reel.id, picked.map((q) => q.id));
        const author = db.prepare(`SELECT display_name FROM users WHERE id = ?`).get(reel.author_user_id) as { display_name: string } | undefined;

        res.status(201).json({
          worksheetId: attemptId,
          subject: reel.subject_key,
          difficulty,
          xpPerCorrect: WORKSHEET_XP_PER_CORRECT[difficulty],
          video: { id: reel.id, title: reel.title, titleAr: reel.title_ar, authorName: author?.display_name ?? '' },
          questions: picked.map(questionPayload),
        });
        return;
      }

      const subjectRow = db.prepare(`SELECT * FROM subjects WHERE key = ?`).get(subject!) as any;
      if (!subjectRow) {
        res.status(400).json({ error: 'Unknown subject.' });
        return;
      }

      // A typed lesson name (درس): the AI writes a fresh set on it every time.
      let aiUnavailable = false;
      if (rawTopic) {
        // Collapse whitespace and drop quotes/control characters -- the name goes into the
        // AI prompt, so it must stay a plain label rather than carry extra instructions.
        const topic = rawTopic.replace(/[\u0000-\u001f"`]/g, ' ').replace(/\s+/g, ' ').trim();
        if (topic.length < 2 || !moderateContent(topic).allowed) {
          res.status(400).json({ error: 'Please keep your lesson name appropriate.' });
          return;
        }
        const user = db.prepare(`SELECT grade FROM users WHERE id = ?`).get(req.userId!) as { grade: number | null } | undefined;
        const picked = await buildAiQuestions(
          {
            subjectId: subjectRow.id,
            subjectName: subjectRow.name,
            grade: user?.grade ?? 5,
            topic,
            scriptText: '',
            scriptTextAr: '',
            reelId: null,
            topicKey: topic,
          },
          difficulty
        );
        if (picked.length > 0) {
          const attemptId = createAttempt(req.userId!, subjectRow.id, difficulty, null, picked.map((q) => q.id));
          res.status(201).json({
            worksheetId: attemptId,
            subject,
            difficulty,
            xpPerCorrect: WORKSHEET_XP_PER_CORRECT[difficulty],
            topic,
            questions: picked.map(questionPayload),
          });
          return;
        }
        // The AI is unavailable (no key, quota, outage) and nothing is saved for this lesson:
        // hand back a general practice worksheet from the seeded bank instead of an error that
        // can never succeed -- flagged so the page can say so.
        aiUnavailable = true;
      }

      // reel_id/topic IS NULL keeps video- and lesson-specific questions out of the bank.
      const pool = db
        .prepare(`SELECT * FROM worksheet_questions WHERE subject_id = ? AND difficulty = ? AND reel_id IS NULL AND topic IS NULL`)
        .all(subjectRow.id, difficulty) as any[];
      if (pool.length === 0) {
        res.status(404).json({ error: 'No questions available for this combination yet.' });
        return;
      }

      const picked = shuffle(pool).slice(0, Math.min(QUESTIONS_PER_WORKSHEET, pool.length));
      const attemptId = createAttempt(req.userId!, subjectRow.id, difficulty, null, picked.map((q) => q.id));

      res.status(201).json({
        worksheetId: attemptId,
        subject,
        difficulty,
        xpPerCorrect: WORKSHEET_XP_PER_CORRECT[difficulty],
        questions: picked.map(questionPayload),
        ...(aiUnavailable ? { aiUnavailable: true } : {}),
      });
    } catch (err) {
      console.error('Worksheet generation failed:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }
);

const submitSchema = z.object({
  answers: z.array(z.object({ questionId: z.number(), choiceIndex: z.number().min(0).max(3) })),
});

worksheetsRouter.post('/:id/submit', forbidRole('admin'), requireCsrfHeader, validateBody(submitSchema), (req, res) => {
  const attempt = db.prepare(`SELECT * FROM worksheet_attempts WHERE id = ?`).get(Number(req.params.id)) as any;
  if (!attempt || attempt.user_id !== req.userId!) {
    res.status(404).json({ error: 'Worksheet not found.' });
    return;
  }
  if (attempt.status === 'submitted') {
    res.status(409).json({ error: 'This worksheet was already submitted.' });
    return;
  }

  const questionIds: number[] = JSON.parse(attempt.question_ids_json);
  // One batch query instead of one round trip per question — order isn't guaranteed by
  // `IN (...)`, so re-map by id to keep the original worksheet order.
  const rows = db
    .prepare(`SELECT * FROM worksheet_questions WHERE id IN (${questionIds.map(() => '?').join(',')})`)
    .all(...questionIds) as any[];
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const questions = questionIds.map((id) => rowById.get(id)).filter((q): q is NonNullable<typeof q> => q !== undefined);
  const { answers } = req.body as { answers: { questionId: number; choiceIndex: number }[] };

  const { results, correctCount } = gradeAnswers(questions, answers);

  const xpPerCorrect = WORKSHEET_XP_PER_CORRECT[attempt.difficulty as 'easy' | 'medium' | 'hard'];
  const xpEarned = correctCount * xpPerCorrect;
  if (xpEarned > 0) awardXp(req.userId!, xpEarned, `worksheet_${attempt.difficulty}`);

  db.prepare(
    `UPDATE worksheet_attempts SET score = ?, xp_earned = ?, answers_json = ?, status = 'submitted' WHERE id = ?`
  ).run(correctCount, xpEarned, JSON.stringify(answers), attempt.id);

  res.json({ results, correctCount, total: questions.length, xpEarned });
});

// Called right before window.print() on the teacher's printable worksheet (frontend
// WorksheetsPage.tsx) -- printing itself is a browser-native action a page can't observe
// completing or being cancelled, so this just tracks "the teacher clicked print", which is
// what "each print he make" means in practice. Teacher-only: students never see the print
// button in the first place, but the role check here is the real gate.
worksheetsRouter.post('/print', requireRole('teacher'), requireCsrfHeader, (req, res) => {
  db.prepare(`INSERT INTO worksheet_prints (user_id) VALUES (?)`).run(req.userId!);
  awardTeacherPoints(req.userId!, TEACHER_PRINT_POINTS, 'worksheet_print');
  res.json({ ok: true });
});

worksheetsRouter.get('/history', (req, res) => {
  const rows = db
    .prepare(
      `SELECT wa.*, s.key as subject_key, s.name as subject_name FROM worksheet_attempts wa
       JOIN subjects s ON wa.subject_id = s.id
       WHERE wa.user_id = ? AND wa.status = 'submitted'
       ORDER BY wa.created_at DESC LIMIT 20`
    )
    .all(req.userId!) as any[];
  res.json({
    history: rows.map((r) => ({
      id: r.id,
      subject: r.subject_key,
      difficulty: r.difficulty,
      score: r.score,
      total: r.total,
      xpEarned: r.xp_earned,
      createdAt: r.created_at,
    })),
  });
});
