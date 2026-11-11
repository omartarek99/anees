import { asyncRouter } from '../lib/asyncRouter.js';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { forbidRole, requireRole } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { worksheetAiLimiter } from '../middleware/rateLimit.js';
import { awardXp, penalizeWrongAnswers, syncTeacherPoints, WORKSHEET_XP_PER_CORRECT } from '../lib/xp.js';
import { gradeAnswers } from '../lib/grading.js';
import { generateQuizQuestions } from '../lib/gemini.js';
import { verifyArithmetic } from '../lib/arithmeticCheck.js';
import { findBankMatch } from '../lib/questionBank.js';
import { moderateContent } from '../lib/moderation.js';
import { teacherReelQuestionSchema } from '../lib/schemas.js';

export const worksheetsRouter = asyncRouter();

const QUESTIONS_PER_WORKSHEET = 10;
const MAX_QUESTIONS = 20;
// One AI call writes at most this many questions; a bigger worksheet is several calls run side by side.
const AI_CHUNK = 5;

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
    topic: z.string().trim().min(2, 'The lesson name is too short. Write at least 2 letters.').max(80).optional(),
    // The grade of the typed lesson (the school book it comes from) -- Math and Science grades 5 and 6.
    grade: z.coerce.number().int().min(5).max(6).optional(),
    // How many questions the worksheet has.
    count: z.coerce.number().int().min(3).max(MAX_QUESTIONS).optional().default(QUESTIONS_PER_WORKSHEET),
  })
  .refine((b) => b.subject || b.reelId, { message: 'Choose a subject or a video first.' });

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

// Only the newest few unsubmitted worksheets are kept per user. A student's go at a worksheet a teacher sent is left out of that clean-up: there is
// only ever one per sent worksheet, and it is where their answers belong until they submit.
function createAttempt(
  userId: number,
  subjectId: number,
  difficulty: Difficulty,
  reelId: number | null,
  questionIds: number[],
  topic: string | null = null,
  sentWorksheetId: number | null = null
) {
  db.prepare(
    `DELETE FROM worksheet_attempts WHERE user_id = ? AND status = 'generated' AND sent_worksheet_id IS NULL
       AND id NOT IN (SELECT id FROM worksheet_attempts WHERE user_id = ? AND status = 'generated' AND sent_worksheet_id IS NULL ORDER BY id DESC LIMIT 9)`
  ).run(userId, userId);
  return Number(
    db
      .prepare(
        `INSERT INTO worksheet_attempts (user_id, subject_id, difficulty, question_ids_json, total, status, reel_id, topic, sent_worksheet_id)
         VALUES (?,?,?,?,?, 'generated', ?,?,?)`
      )
      .run(userId, subjectId, difficulty, JSON.stringify(questionIds), questionIds.length, reelId, topic, sentWorksheetId).lastInsertRowid
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
  count: number;
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
  const wanted = scope.count;
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

  // Math and Science for grades 5 and 6: the questions are written from the school question bank for this lesson.
  const subjectKey = scope.subjectName.toLowerCase().includes('math') ? 'math' : scope.subjectName.toLowerCase().includes('sci') ? 'science' : null;
  const bank =
    subjectKey && (scope.grade === 5 || scope.grade === 6)
      ? await findBankMatch({ subject: subjectKey, grade: scope.grade, topic: scope.topic, topicAr: scope.topicAr, scriptText: scope.scriptText, scriptTextAr: scope.scriptTextAr })
      : null;
  const chunks: number[] = [];
  for (let left = wanted; left > 0; left -= AI_CHUNK) chunks.push(Math.min(AI_CHUNK, left));
  const results = await Promise.all(
    chunks.map((count) =>
      generateQuizQuestions({
        scriptText: scope.scriptText,
        scriptTextAr: scope.scriptTextAr,
        subjectName: scope.subjectName,
        grade: scope.grade,
        count,
        topic: scope.topic,
        topicAr: scope.topicAr,
        difficulty,
        avoidQuestions: existing.slice(0, 40).map((q) => q.question_text),
        style: 'worksheet',
        bankReference: bank?.reference,
      })
    )
  );
  const okResults = results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
  const result: { ok: true; data: unknown[] } | { ok: false; error: string } = okResults.length
    ? { ok: true, data: okResults.flatMap((r) => (Array.isArray(r.data) ? r.data : [])) }
    : { ok: false, error: (results[0] as { error: string }).error };
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
      for (const asked of valid) {
        // a question that is a plain sum gets its right answer from the arithmetic itself; one with no right choice is dropped
        const q = verifyArithmetic(asked);
        if (!q) continue;
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
  const picked = shuffle(fresh).slice(0, wanted);

  // Top up (AI down / returned too few): older AI questions on the same topic first, then
  // (videos only) the teacher's own quiz questions.
  if (picked.length < wanted) {
    const pickedIds = new Set(picked.map((q) => q.id));
    const older = shuffle(existing.filter((q) => !authoredTexts.has(q.question_text) && !pickedIds.has(q.id)));
    for (const q of older) {
      if (picked.length >= wanted) break;
      picked.push(q);
    }
  }
  if (picked.length < wanted) {
    const pickedTexts = new Set(picked.map((q) => q.question_text));
    for (const q of shuffle(authored)) {
      if (picked.length >= wanted) break;
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
// worksheet, or by a worksheet a teacher sent (students start it any time later), are kept so
// it can still be graded.
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
      ? db
          .prepare(
            `SELECT question_ids_json FROM worksheet_attempts WHERE reel_id = ? AND status = 'generated'
             UNION ALL SELECT question_ids_json FROM sent_worksheets WHERE reel_id = ?`
          )
          .all(scope.reelId, scope.reelId)
      : db
          .prepare(
            `SELECT question_ids_json FROM worksheet_attempts WHERE reel_id IS NULL AND subject_id = ? AND status = 'generated'
             UNION ALL SELECT question_ids_json FROM sent_worksheets WHERE reel_id IS NULL AND subject_id = ?`
          )
          .all(scope.subjectId, scope.subjectId)
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
      const { subject, difficulty, reelId, topic: rawTopic, grade: pickedGrade, count } = req.body as {
        subject?: 'math' | 'science';
        difficulty: Difficulty;
        reelId?: number;
        topic?: string;
        grade?: number;
        count: number;
      };

      if (reelId) {
        const reel = loadVisibleVideo(reelId, req.userId!);
        if (!reel) {
          res.status(404).json({ error: 'We couldn\'t find this video. It may have been deleted.' });
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
            count,
          },
          difficulty
        );
        if (picked.length === 0) {
          res.status(404).json({ error: 'We couldn\'t make questions for this video now. Try again later, or write them yourself.' });
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
        res.status(400).json({ error: 'This subject is not available.' });
        return;
      }

      // A typed lesson name (درس): the AI writes a fresh set on it every time.
      let aiUnavailable = false;
      if (rawTopic) {
        // Collapse whitespace and drop quotes/control characters -- the name goes into the
        // AI prompt, so it must stay a plain label rather than carry extra instructions.
        const topic = rawTopic.replace(/[\u0000-\u001f"`]/g, ' ').replace(/\s+/g, ' ').trim();
        if (topic.length < 2 || !moderateContent(topic).allowed) {
          res.status(400).json({ error: 'This lesson name is not allowed. Write a different name.' });
          return;
        }
        const user = db.prepare(`SELECT grade FROM users WHERE id = ?`).get(req.userId!) as { grade: number | null } | undefined;
        const picked = await buildAiQuestions(
          {
            subjectId: subjectRow.id,
            subjectName: subjectRow.name,
            grade: pickedGrade ?? user?.grade ?? 5,
            topic,
            scriptText: '',
            scriptTextAr: '',
            reelId: null,
            // the grade is part of the key: the same lesson name in grade 5 and 6 are different lessons
            topicKey: pickedGrade ? `${topic} [g${pickedGrade}]` : topic,
            count,
          },
          difficulty
        );
        if (picked.length > 0) {
          const attemptId = createAttempt(req.userId!, subjectRow.id, difficulty, null, picked.map((q) => q.id), topic);
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
        res.status(404).json({ error: 'There are no questions for this subject and grade yet. Try a different choice.' });
        return;
      }

      const picked = shuffle(pool).slice(0, Math.min(count, pool.length));
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
      res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
    }
  }
);

const submitSchema = z.object({
  answers: z.array(z.object({ questionId: z.number(), choiceIndex: z.number().min(0).max(3) })),
});

// Students only: a teacher builds a worksheet to preview, print and send to the students (below), not to solve it.
worksheetsRouter.post('/:id/submit', requireRole('student'), requireCsrfHeader, validateBody(submitSchema), (req, res) => {
  const attempt = db.prepare(`SELECT * FROM worksheet_attempts WHERE id = ?`).get(Number(req.params.id)) as any;
  if (!attempt || attempt.user_id !== req.userId!) {
    res.status(404).json({ error: 'We couldn\'t find this worksheet.' });
    return;
  }
  if (attempt.status === 'submitted') {
    res.status(409).json({ error: 'You already sent your answers for this worksheet.' });
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

  const { results, correctCount, wrongCount } = gradeAnswers(questions, answers);

  const xpPerCorrect = WORKSHEET_XP_PER_CORRECT[attempt.difficulty as 'easy' | 'medium' | 'hard'];
  const xpEarned = correctCount * xpPerCorrect;
  // wrong answers are charged first, so only the net of this submission can move a rank (see lib/xp.ts)
  const xpLost = penalizeWrongAnswers(req.userId!, wrongCount);
  if (xpEarned > 0) awardXp(req.userId!, xpEarned, `worksheet_${attempt.difficulty}`);

  db.prepare(
    `UPDATE worksheet_attempts SET score = ?, xp_earned = ?, answers_json = ?, status = 'submitted' WHERE id = ?`
  ).run(correctCount, xpEarned, JSON.stringify(answers), attempt.id);
  // a student who solves a worksheet a teacher sent is worth points to that teacher (lib/xp.ts)
  if (attempt.sent_worksheet_id) {
    const sent = db.prepare(`SELECT teacher_id FROM sent_worksheets WHERE id = ?`).get(attempt.sent_worksheet_id) as { teacher_id: number } | undefined;
    syncTeacherPoints(sent?.teacher_id, 'worksheet_solved');
  }

  res.json({ results, correctCount, total: questions.length, xpEarned, xpLost });
});

// ---------------------------------------------------------------------------------------
// Worksheets a teacher sends to every student. The teacher builds one with POST /generate as usual -- previews it and may print it (in the
// browser), but does not solve it -- then sends it: a copy goes into sent_worksheets, every student sees it under "From your teachers"
// (GET /received) and can solve it once: POST /received/:sentId/start gives them their own attempt, graded by POST /:id/submit like any other.
// ---------------------------------------------------------------------------------------

const sentVideo = (r: any) => (r.reel_id ? { id: r.reel_id, title: r.reel_title, titleAr: r.reel_title_ar } : null);

worksheetsRouter.post('/:id/send', requireRole('teacher'), requireCsrfHeader, (req, res) => {
  const attempt = db.prepare(`SELECT * FROM worksheet_attempts WHERE id = ? AND user_id = ?`).get(Number(req.params.id), req.userId!) as any;
  if (!attempt) {
    res.status(404).json({ error: 'Worksheet not found.' });
    return;
  }
  // sending the same worksheet again keeps the first copy (source_attempt_id is UNIQUE)
  const inserted =
    Number(
      db
        .prepare(
          `INSERT INTO sent_worksheets (teacher_id, source_attempt_id, subject_id, difficulty, question_ids_json, total, topic, reel_id)
           VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (source_attempt_id) DO NOTHING`
        )
        .run(req.userId!, attempt.id, attempt.subject_id, attempt.difficulty, attempt.question_ids_json, attempt.total, attempt.topic, attempt.reel_id)
        .changes
    ) > 0;
  const sent = db.prepare(`SELECT id, created_at FROM sent_worksheets WHERE source_attempt_id = ?`).get(attempt.id) as { id: number; created_at: string };
  res.status(inserted ? 201 : 200).json({ sentWorksheetId: sent.id, createdAt: sent.created_at, alreadySent: !inserted });
});

// The teacher's own sent worksheets, newest first, with how many students have solved each.
worksheetsRouter.get('/sent', requireRole('teacher'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT sw.*, s.key AS subject_key, r.title AS reel_title, r.title_ar AS reel_title_ar,
              (SELECT COUNT(*) FROM worksheet_attempts a WHERE a.sent_worksheet_id = sw.id AND a.status = 'submitted') AS solved_count
       FROM sent_worksheets sw
       JOIN subjects s ON s.id = sw.subject_id
       LEFT JOIN reels r ON r.id = sw.reel_id
       WHERE sw.teacher_id = ?
       ORDER BY sw.id DESC LIMIT 50`
    )
    .all(req.userId!) as any[];
  res.json({
    worksheets: rows.map((r) => ({
      id: r.id,
      subject: r.subject_key,
      difficulty: r.difficulty,
      total: r.total,
      topic: r.topic,
      video: sentVideo(r),
      createdAt: r.created_at,
      solvedCount: r.solved_count,
    })),
  });
});

// "From your teachers": every sent worksheet (they go to all students, whatever their grade), newest first, with where this student is on each.
worksheetsRouter.get('/received', requireRole('student'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT sw.*, s.key AS subject_key, t.display_name AS teacher_name, r.title AS reel_title, r.title_ar AS reel_title_ar,
              a.status AS my_status, a.score AS my_score
       FROM sent_worksheets sw
       JOIN subjects s ON s.id = sw.subject_id
       JOIN users t ON t.id = sw.teacher_id
       LEFT JOIN reels r ON r.id = sw.reel_id
       LEFT JOIN worksheet_attempts a ON a.sent_worksheet_id = sw.id AND a.user_id = ?
       ORDER BY sw.id DESC LIMIT 50`
    )
    .all(req.userId!) as any[];
  res.json({
    worksheets: rows.map((r) => ({
      id: r.id,
      teacherName: r.teacher_name,
      subject: r.subject_key,
      difficulty: r.difficulty,
      total: r.total,
      topic: r.topic,
      video: sentVideo(r),
      createdAt: r.created_at,
      status: r.my_status === 'submitted' ? 'solved' : r.my_status ? 'started' : 'new',
      score: r.my_status === 'submitted' ? r.my_score : null,
    })),
  });
});

// Opens a sent worksheet for this student, in the same shape as POST /generate: their attempt from before if they started it already, a new one
// otherwise. Once solved it cannot be solved again.
worksheetsRouter.post('/received/:sentId/start', requireRole('student'), requireCsrfHeader, (req, res) => {
  const sent = db
    .prepare(
      `SELECT sw.*, s.key AS subject_key, t.display_name AS teacher_name, r.title AS reel_title, r.title_ar AS reel_title_ar, ra.display_name AS reel_author
       FROM sent_worksheets sw
       JOIN subjects s ON s.id = sw.subject_id
       JOIN users t ON t.id = sw.teacher_id
       LEFT JOIN reels r ON r.id = sw.reel_id
       LEFT JOIN users ra ON ra.id = r.author_user_id
       WHERE sw.id = ?`
    )
    .get(Number(req.params.sentId)) as any;
  if (!sent) {
    res.status(404).json({ error: 'Worksheet not found.' });
    return;
  }
  const mine = db.prepare(`SELECT id, status FROM worksheet_attempts WHERE user_id = ? AND sent_worksheet_id = ?`).get(req.userId!, sent.id) as
    | { id: number; status: string }
    | undefined;
  if (mine?.status === 'submitted') {
    res.status(409).json({ error: 'You already solved this worksheet.' });
    return;
  }
  const ids: number[] = JSON.parse(sent.question_ids_json);
  const rows = ids.length
    ? (db.prepare(`SELECT * FROM worksheet_questions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[])
    : [];
  const byId = new Map(rows.map((q) => [q.id, q]));
  const questions = ids.map((id) => byId.get(id)).filter((q): q is NonNullable<typeof q> => q !== undefined);
  if (questions.length === 0) {
    res.status(404).json({ error: 'This worksheet is no longer available.' });
    return;
  }
  const worksheetId =
    mine?.id ?? createAttempt(req.userId!, sent.subject_id, sent.difficulty, sent.reel_id, questions.map((q) => q.id), sent.topic, sent.id);
  res.status(mine ? 200 : 201).json({
    worksheetId,
    subject: sent.subject_key,
    difficulty: sent.difficulty,
    xpPerCorrect: WORKSHEET_XP_PER_CORRECT[sent.difficulty as Difficulty],
    ...(sent.topic ? { topic: sent.topic } : {}),
    ...(sent.reel_id ? { video: { id: sent.reel_id, title: sent.reel_title, titleAr: sent.reel_title_ar, authorName: sent.reel_author ?? '' } } : {}),
    questions: questions.map(questionPayload),
    sentWorksheetId: sent.id,
    teacherName: sent.teacher_name,
  });
});
