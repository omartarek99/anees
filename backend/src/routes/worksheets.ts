import { asyncRouter } from '../lib/asyncRouter.js';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { wordsText } from '../lib/textRules.js';
import { db } from '../db/db.js';
import { forbidRole, requireRole, requireApprovedTeacher } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { worksheetAiLimiter } from '../middleware/rateLimit.js';
import { awardXp, penalizeWrongAnswers, syncTeacherPoints, WORKSHEET_XP_PER_CORRECT } from '../lib/xp.js';
import { gradeAnswers } from '../lib/grading.js';
import fs from 'node:fs';
import path from 'node:path';
import { bankItems, orderItems, solveItems, type BankItem } from '../lib/bankWorksheet.js';
import { BANK_IMAGE_DIR } from '../lib/questionBank.js';
import { extendPool } from '../lib/variants.js';
import { bankAnswer, isRejected } from '../lib/bankAnswers.js';
import { findBankMatch, isBankGrade } from '../lib/questionBank.js';
import { moderateContent } from '../lib/moderation.js';
import { isFeatureOn } from '../lib/features.js';
import { asEquation, mathLatin, mathLatinAll } from '../lib/mathText.js';

export const worksheetsRouter = asyncRouter();

const QUESTIONS_PER_WORKSHEET = 10;
const MAX_QUESTIONS = 20;
// One AI call solves at most this many bank questions; more are several calls run side by side.
const BANK_SOLVE_CHUNK = 10;

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
    topic: wordsText(z.string().trim().min(2, 'The lesson name is too short. Write at least 2 letters.').max(80, 'The lesson name is too long. Use at most 80 letters.'), 'lesson name').optional(),
    // The grade of the typed lesson (the school book it comes from) -- Math and Science grades 5 and 6.
    grade: z.coerce.number().int().refine(isBankGrade, 'Unsupported grade').optional(),
    // How many questions the worksheet has.
    count: z.coerce.number().int().min(3).max(MAX_QUESTIONS).optional().default(QUESTIONS_PER_WORKSHEET),
  })
  .refine((b) => b.subject || b.reelId, { message: 'Choose a subject or a video first.' });

// Videos a user can build a worksheet from -- the same visibility as the reels feed
// (routes/reels.ts): every teacher video of every grade.
function loadVisibleVideo(reelId: number, _userId: number) {
  const reel = db
    .prepare(
      `SELECT r.*, s.key as subject_key, s.name as subject_name FROM reels r
       JOIN subjects s ON s.id = r.subject_id
       WHERE r.id = ? AND r.grade IS NOT NULL AND r.author_user_id IS NOT NULL`
    )
    .get(reelId) as any;
  return reel ?? null;
}

// The figures of the book's questions (question-bank/images). Only a plain file name is accepted.
worksheetsRouter.get('/image/:name', (req, res) => {
  const name = String(req.params.name);
  if (!/^[\w.-]+\.jpg$/.test(name)) {
    res.status(404).end();
    return;
  }
  const file = path.join(BANK_IMAGE_DIR, name);
  if (!fs.existsSync(file)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type('image/jpeg').send(fs.readFileSync(file));
});

worksheetsRouter.get('/videos', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.title, r.title_ar, r.grade, s.key as subject_key, u.display_name as author_name
       FROM reels r
       JOIN subjects s ON s.id = r.subject_id
       LEFT JOIN users u ON u.id = r.author_user_id
       WHERE r.grade IS NOT NULL AND r.author_user_id IS NOT NULL
       ORDER BY r.id DESC`
    )
    .all() as any[];
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

// Numbers and unknowns are shown as 0-9 / x y z in both languages (lib/mathText.ts), also for questions saved before that rule.
function questionPayload(q: any) {
  return {
    id: q.id,
    text: asEquation(mathLatin(q.question_text), false),
    textAr: asEquation(mathLatin(q.question_text_ar ?? ''), true),
    choices: mathLatinAll(JSON.parse(q.choices_json)),
    choicesAr: mathLatinAll(JSON.parse(q.choices_json_ar)),
    image: q.image ?? null, // a figure from the school book (GET /worksheets/image/:name)
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

// Builds the question set of one worksheet ONLY from the school question bank (lib/bankWorksheet.ts): the questions are the bank's own, word for word
// and number for number, and nothing is taken from anywhere else. The AI only works out the answers (and the four answers of a gap / problem, which
// the bank leaves open); each solved question is saved (topic 'bank:<id>') and reused, so a question always has the same answers. A video worksheet
// that finds nothing in the bank is topped up with the teacher's own quiz questions for that video.
async function buildAiQuestions(scope: AiScope, difficulty: Difficulty): Promise<{ picked: any[]; bankMatched: boolean; aiFailed: boolean }> {
  const wanted = scope.count;
  const picked: any[] = [];
  let aiFailed = false; // the AI could not give the answers (its limit is finished, or it is busy)

  const subjectKey = scope.subjectName.toLowerCase().includes('math') ? 'math' : scope.subjectName.toLowerCase().includes('sci') ? 'science' : null;
  const bank =
    subjectKey && isBankGrade(scope.grade)
      ? await findBankMatch({ subject: subjectKey, grade: scope.grade, topic: scope.topic, topicAr: scope.topicAr, scriptText: scope.scriptText, scriptTextAr: scope.scriptTextAr })
      : null;

  if (bank) {
    // a maths lesson with too few usable questions is topped up with its plain calculations written with other numbers (by code, not by the AI) -- lib/variants.ts
    // a question the check found unusable (lib/bankAnswers.ts) never reaches a worksheet
    const pooled = bank.lessons.flatMap((l) => extendPool(l, bankItems([l]))).filter((i) => !isRejected(i.key));
    const candidates = orderItems(pooled, difficulty);
    const saved = db.prepare(`SELECT * FROM worksheet_questions WHERE topic = ? AND subject_id = ?`);
    const insert = db.prepare(
      `INSERT INTO worksheet_questions (subject_id, difficulty, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar, reel_id, topic, image)
       VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?)`
    );
    const store = (item: BankItem, answer: { choices: string[]; correctIndex: number; explanation: string; explanationAr: string }) => {
      const id = Number(
        insert.run(
          scope.subjectId, difficulty, item.text, item.text, JSON.stringify(answer.choices), JSON.stringify(answer.choices),
          answer.correctIndex, answer.explanation, answer.explanationAr || answer.explanation, `bank:${item.key}`, item.image
        ).lastInsertRowid
      );
      return db.prepare(`SELECT * FROM worksheet_questions WHERE id = ?`).get(id);
    };
    let cursor = 0;
    for (let round = 0; round < 3 && picked.length < wanted && cursor < candidates.length; round++) {
      // a few more than needed: some bank questions cannot be a multiple-choice question and are skipped
      const batch = candidates.slice(cursor, cursor + Math.max(4, Math.ceil((wanted - picked.length) * 1.6)));
      cursor += batch.length;
      const toSolve: BankItem[] = [];
      for (const item of batch) {
        const row = saved.get(`bank:${item.key}`, scope.subjectId);
        if (row) picked.push(row);
        else {
          // the answer kept in the bank: no AI call
          const fixed = bankAnswer(item.key);
          if (fixed) picked.push(store(item, fixed));
          else toSolve.push(item);
        }
      }
      const chunks: BankItem[][] = [];
      for (let i = 0; i < toSolve.length; i += BANK_SOLVE_CHUNK) chunks.push(toSolve.slice(i, i + BANK_SOLVE_CHUNK));
      const solvedChunks = await Promise.all(chunks.map((chunk) => solveItems(chunk, scope.subjectName, scope.grade)));
      solvedChunks.forEach((solved, ci) => {
        if (!(solved instanceof Map)) {
          aiFailed = true;
          if (solved.error !== 'NOT_CONFIGURED') console.error('Bank worksheet answers failed:', solved.error);
          return;
        }
        for (const item of chunks[ci]) {
          const answer = solved.get(item.key);
          if (!answer) continue;
          picked.push(store(item, answer));
        }
      });
    }
  }

  // a video whose lesson is not in the bank: the teacher's own quiz questions for it
  if (picked.length === 0 && scope.reelId) {
    const authored = db.prepare(`SELECT * FROM reel_questions WHERE reel_id = ? ORDER BY order_in_reel`).all(scope.reelId) as any[];
    const existing = db.prepare(`SELECT * FROM worksheet_questions WHERE reel_id = ? AND topic IS NULL`).all(scope.reelId) as any[];
    const insert = db.prepare(
      `INSERT INTO worksheet_questions (subject_id, difficulty, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar, reel_id, topic) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    );
    for (const q of shuffle(authored)) {
      if (picked.length >= wanted) break;
      // mirrored into worksheet_questions (once) so grading can look it up like any other
      const mirrored = existing.find((e) => e.question_text === q.question_text);
      if (mirrored) {
        picked.push(mirrored);
        continue;
      }
      const info = insert.run(
        scope.subjectId, difficulty, q.question_text, q.question_text_ar, q.choices_json, q.choices_json_ar, q.correct_index, q.explanation, q.explanation_ar, scope.reelId, null
      );
      picked.push({ ...q, id: Number(info.lastInsertRowid), reel_id: scope.reelId });
    }
  }

  return { picked: shuffle(picked).slice(0, wanted), bankMatched: !!bank, aiFailed };
}

const MSG_NOT_IN_BANK = 'This lesson is not one of the lessons of this grade. Check the grade first, then try again.';
const MSG_AI_LIMIT = 'The question helper has reached its limit for now. Please try again later.';

// The AI call is paid + slow, so worksheets built from a video or a typed lesson name go
// through the dedicated limiter -- plain bank worksheets stay unthrottled as before.
function limitAiWhenAi(req: Request, res: Response, next: NextFunction) {
  if (req.body?.reelId || req.body?.topic) {
    // the admin can switch the AI worksheets off (they cost money per use) while the ordinary question-bank worksheets keep working
    if (!isFeatureOn('ai_worksheets', req.userRole, req.userId)) {
      res.status(403).json({ error: 'Worksheets made by the AI are closed for now. Please try again later.', featureOff: 'ai_worksheets' });
      return;
    }
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
        const built = await buildAiQuestions(
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
        const picked = built.picked;
        if (picked.length === 0 && built.aiFailed) {
          res.status(503).json({ error: MSG_AI_LIMIT });
          return;
        }
        if (picked.length === 0 && !built.bankMatched) {
          res.status(404).json({ error: MSG_NOT_IN_BANK });
          return;
        }
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
        const built = await buildAiQuestions(
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
        const picked = built.picked;
        if (picked.length === 0) {
          // only the school question bank is used: a lesson that is not in it (for this grade) is told to the teacher, and when the AI that works out the
          // answers has reached its limit the teacher is asked to try again after a while
          if (built.aiFailed) res.status(503).json({ error: MSG_AI_LIMIT });
          else if (!built.bankMatched) res.status(404).json({ error: MSG_NOT_IN_BANK });
          else res.status(404).json({ error: MSG_AI_LIMIT });
          return;
        }
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
  const xpOffered = correctCount * xpPerCorrect;
  // wrong answers are charged first, so only the net of this submission can move a rank (see lib/xp.ts)
  const xpLost = penalizeWrongAnswers(req.userId!, wrongCount);
  // what was really paid (the daily cap in lib/xp.ts can pay less than offered), so the screen never shows points that were not given
  const xpEarned = xpOffered > 0 ? awardXp(req.userId!, xpOffered, `worksheet_${attempt.difficulty}`) : 0;

  db.prepare(
    `UPDATE worksheet_attempts SET score = ?, xp_earned = ?, answers_json = ?, status = 'submitted' WHERE id = ?`
  ).run(correctCount, xpEarned, JSON.stringify(answers), attempt.id);
  // a student who solves a worksheet a teacher sent is worth points to that teacher (lib/xp.ts)
  if (attempt.sent_worksheet_id) {
    const sent = db.prepare(`SELECT teacher_id FROM sent_worksheets WHERE id = ?`).get(attempt.sent_worksheet_id) as { teacher_id: number } | undefined;
    syncTeacherPoints(sent?.teacher_id, 'worksheet_solved');
  }

  res.json({
    results: results.map((r) => ({ ...r, explanation: mathLatin(r.explanation), explanationAr: mathLatin(r.explanationAr) })),
    correctCount,
    total: questions.length,
    xpEarned,
    xpLost,
  });
});

// ---------------------------------------------------------------------------------------
// Worksheets a teacher sends to every student. The teacher builds one with POST /generate as usual -- previews it and may print it (in the
// browser), but does not solve it -- then sends it: a copy goes into sent_worksheets, every student sees it under "From your teachers"
// (GET /received) and can solve it once: POST /received/:sentId/start gives them their own attempt, graded by POST /:id/submit like any other.
// ---------------------------------------------------------------------------------------

const sentVideo = (r: any) => (r.reel_id ? { id: r.reel_id, title: r.reel_title, titleAr: r.reel_title_ar } : null);

worksheetsRouter.post('/:id/send', requireRole('teacher'), requireApprovedTeacher, requireCsrfHeader, (req, res) => {
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

// ---------------------------------------------------------------------------------------
// A teacher edits the worksheet before printing / sending it: the questions, the choices (English and Arabic) and which choice is right.
// GET /:id/edit gives the questions WITH their right answers (a student never gets those before submitting); PUT /:id/questions saves the edits.
// A changed question is saved as a NEW question of its own (topic 'edited': kept out of every shared pool), so other worksheets that used the original are untouched.
// Once the worksheet is sent the students hold that copy, so it can no longer be edited.
// ---------------------------------------------------------------------------------------

function editablePayload(q: any) {
  return {
    ...questionPayload(q),
    correctIndex: q.correct_index as number,
    explanation: mathLatin(q.explanation ?? ''),
    explanationAr: mathLatin(q.explanation_ar ?? ''),
  };
}

function loadTeacherAttempt(req: Request, res: Response) {
  const attempt = db.prepare(`SELECT * FROM worksheet_attempts WHERE id = ? AND user_id = ?`).get(Number(req.params.id), req.userId!) as any;
  if (!attempt) {
    res.status(404).json({ error: 'Worksheet not found.' });
    return null;
  }
  if (db.prepare(`SELECT 1 FROM sent_worksheets WHERE source_attempt_id = ?`).get(attempt.id)) {
    res.status(409).json({ error: 'This worksheet was already sent to the students, so it can no longer be edited.' });
    return null;
  }
  return attempt;
}

function attemptQuestions(attempt: any): any[] {
  const ids: number[] = JSON.parse(attempt.question_ids_json);
  if (ids.length === 0) return [];
  const rows = db.prepare(`SELECT * FROM worksheet_questions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((q): q is NonNullable<typeof q> => q !== undefined);
}

worksheetsRouter.get('/:id/edit', requireRole('teacher'), (req, res) => {
  const attempt = loadTeacherAttempt(req, res);
  if (!attempt) return;
  res.json({ questions: attemptQuestions(attempt).map(editablePayload) });
});

const editChoice = z.string().trim().min(1, 'Write every answer: an answer is empty.').max(120, 'An answer is too long. Use at most 120 letters.');
const editSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.number().int(),
        text: z.string().trim().min(2, 'The question is too short. Write at least 3 letters.').max(300, 'The question is too long. Use at most 300 letters.'),
        textAr: z.string().trim().max(300, 'The question is too long. Use at most 300 letters.').default(''),
        choices: z.array(editChoice).min(2).max(4),
        choicesAr: z.array(z.string().trim().max(120, 'An answer is too long. Use at most 120 letters.')).min(2).max(4).default(['', '', '', '']),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().trim().max(500, 'The explanation is too long. Use at most 500 letters.').default(''),
        explanationAr: z.string().trim().max(500, 'The explanation is too long. Use at most 500 letters.').default(''),
      })
    )
    .min(1)
    .max(MAX_QUESTIONS),
});

worksheetsRouter.put('/:id/questions', requireRole('teacher'), requireCsrfHeader, validateBody(editSchema), (req, res) => {
  const attempt = loadTeacherAttempt(req, res);
  if (!attempt) return;
  const current = attemptQuestions(attempt);
  const byId = new Map(current.map((q) => [q.id, q]));
  const { questions } = req.body as z.infer<typeof editSchema>;
  if (questions.length !== current.length || questions.some((q) => !byId.has(q.id))) {
    res.status(400).json({ error: 'These questions are not part of this worksheet.' });
    return;
  }
  const distinct = (list: string[]) => new Set(list.map((c) => c.trim().toLowerCase())).size === list.length;
  for (const q of questions) {
    if (q.correctIndex >= q.choices.length || (q.choicesAr.length !== q.choices.length && q.choicesAr.some(Boolean))) {
      res.status(400).json({ error: 'Choose the right answer of every question.' });
      return;
    }
    if (!distinct(q.choices) || (q.choicesAr.every(Boolean) && !distinct(q.choicesAr))) {
      res.status(400).json({ error: 'Two answers of a question are the same. Make every answer different.' });
      return;
    }
    if (![q.text, q.textAr, q.explanation, q.explanationAr, ...q.choices, ...q.choicesAr].every((t) => moderateContent(t).allowed)) {
      res.status(400).json({ error: 'This text is not allowed. Write it differently.' });
      return;
    }
  }

  const insert = db.prepare(
    `INSERT INTO worksheet_questions (subject_id, difficulty, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar, reel_id, topic, image)
     VALUES (?,?,?,?,?,?,?,?,?,NULL,'edited',?)`
  );
  const newIds = questions.map((q) => {
    const old = byId.get(q.id);
    const next = {
      text: mathLatin(q.text), textAr: mathLatin(q.textAr), choices: mathLatinAll(q.choices), choicesAr: mathLatinAll(q.choicesAr.some(Boolean) ? q.choicesAr : q.choices),
      correctIndex: q.correctIndex, explanation: mathLatin(q.explanation), explanationAr: mathLatin(q.explanationAr),
    };
    const same =
      next.text === mathLatin(old.question_text) && next.textAr === mathLatin(old.question_text_ar ?? '') &&
      JSON.stringify(next.choices) === JSON.stringify(mathLatinAll(JSON.parse(old.choices_json))) &&
      JSON.stringify(next.choicesAr) === JSON.stringify(mathLatinAll(JSON.parse(old.choices_json_ar))) &&
      next.correctIndex === old.correct_index &&
      next.explanation === mathLatin(old.explanation ?? '') && next.explanationAr === mathLatin(old.explanation_ar ?? '');
    if (same) return old.id as number;
    return Number(
      insert.run(
        attempt.subject_id, attempt.difficulty, next.text, next.textAr, JSON.stringify(next.choices), JSON.stringify(next.choicesAr),
        next.correctIndex,
        // the explanation is only shown to a student after solving; keep the old one's meaning when the teacher left it empty
        next.explanation || mathLatin(old.explanation ?? ''), next.explanationAr || mathLatin(old.explanation_ar ?? ''),
        old.image ?? null, // the figure stays with the question
      ).lastInsertRowid
    );
  });
  db.prepare(`UPDATE worksheet_attempts SET question_ids_json = ? WHERE id = ?`).run(JSON.stringify(newIds), attempt.id);
  res.json({ questions: attemptQuestions({ question_ids_json: JSON.stringify(newIds) }).map(editablePayload) });
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
